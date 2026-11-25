import { Injectable } from "@nestjs/common";
import {
  ORGANIZATION_LIMITS as L,
  normalizeOrganizationName,
  slugifyOrganizationName,
  type ApplicationQueueItemDto,
  type MemberRole,
  type Paginated,
  type RelationQueueItemDto,
  type StaffApplicationDto,
  type StaffOrganizationDto,
  type VerificationDecisionDto
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertAdmin, assertStaff } from "../common/auth-types";
import { cleanLine, cleanText, likeEscape } from "../common/utils/text";
import { paginate } from "../common/utils/pagination";
import { AuditService } from "../audit/audit.service";
import type {
  Organization,
  OrganizationApplication,
  Prisma,
  VerificationAction
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ApplicationQueueQuery,
  CreateOrganizationDto,
  DecisionDto,
  RelationQueueQuery,
  StaffOrganizationListQuery
} from "./dto";
import { applicationInclude, toApplicationDto } from "./applications.service";
import { InvitationsService, toInvitationDto } from "./invitations.service";
import { OrganizationAccessService } from "./organization-access.service";
import { OrganizationNotifier } from "./organization-notifier";
import { toBadge } from "./organization.mapper";
import { toMemberDto } from "./members.service";
import { randomBytes } from "node:crypto";

const OPEN_FOR_STAFF = ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"] as const;

/**
 * Sidewalk staff decisions about organizations: reviewing applications, approving, rejecting, suspending, reinstating
 * and revoking. Every action here checks for a conflict of interest, runs under a lock with a compare-and-set so two
 * decisions cannot contradict each other, leaves an append-only decision record, and writes the audit log.
 *
 * Moderators may read the queue, start a review, ask the applicant for more information and keep private notes.
 * Only administrators decide: approve, reject, suspend, reinstate, revoke, create organizations, manage anyone's
 * membership. Staff who belong to an organization, or who submitted an application, cannot act on it at all.
 */
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly audit: AuditService,
    private readonly notifier: OrganizationNotifier,
    private readonly invitations: InvitationsService
  ) {}

  // ───────────────────────────── conflicts ─────────────────────────────

  /** Why this person must not act on this application, or null. */
  async applicationConflict(
    user: AuthUser,
    app: Pick<OrganizationApplication, "applicantId" | "organizationId">,
    db: Prisma.TransactionClient | PrismaService = this.prisma
  ): Promise<string | null> {
    if (app.applicantId === user.id)
      return "You submitted this application, so you cannot review it.";
    if (await this.access.isMember(user.id, app.organizationId, db))
      return "You belong to this organization, so you cannot review it.";
    return null;
  }

  async organizationConflict(
    user: AuthUser,
    organizationId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma
  ): Promise<string | null> {
    if (await this.access.isMember(user.id, organizationId, db))
      return "You belong to this organization, so you cannot make governance decisions about it.";
    return null;
  }

  private decisionRow(
    tx: Prisma.TransactionClient,
    data: {
      organizationId: string;
      applicationId?: string;
      action: VerificationAction;
      actorId: string;
      reason?: string | null;
      previous?: object;
      next?: object;
    }
  ) {
    return tx.verificationDecision.create({
      data: {
        organizationId: data.organizationId,
        applicationId: data.applicationId ?? null,
        action: data.action,
        actorId: data.actorId,
        reason: data.reason ?? null,
        previous: (data.previous ?? undefined) as Prisma.InputJsonValue | undefined,
        next: (data.next ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }

  // ───────────────────────────── application queue and review ─────────────────────────────

  async queue(
    user: AuthUser,
    query: ApplicationQueueQuery
  ): Promise<Paginated<ApplicationQueueItemDto>> {
    assertStaff(user);
    const where: Prisma.OrganizationApplicationWhereInput =
      query.status === "ALL"
        ? { status: { not: "DRAFT" } }
        : query.status === "OPEN"
          ? { status: { in: [...OPEN_FOR_STAFF] } }
          : { status: query.status };
    const [total, rows] = await Promise.all([
      this.prisma.organizationApplication.count({ where }),
      this.prisma.organizationApplication.findMany({
        where,
        include: {
          organization: true,
          applicant: { select: { displayName: true } },
          reviewer: { select: { displayName: true } },
          _count: { select: { documents: true } }
        },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);
    const items: ApplicationQueueItemDto[] = [];
    for (const a of rows) {
      items.push({
        id: a.id,
        status: a.status,
        organizationName: a.organization.name,
        organizationSlug: a.organization.slug,
        type: a.organization.type,
        jurisdiction: a.organization.jurisdiction,
        applicantName: a.applicant.displayName,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
        reviewerName: a.reviewer?.displayName ?? null,
        documents: a._count.documents,
        similarCount: await this.prisma.organization.count({
          where: { normalizedName: a.organization.normalizedName, id: { not: a.organizationId } }
        })
      });
    }
    return paginate(items, total, query.page, query.pageSize);
  }

  async getApplication(user: AuthUser, id: string): Promise<StaffApplicationDto> {
    assertStaff(user);
    const app = await this.prisma.organizationApplication.findUnique({
      where: { id },
      include: {
        ...applicationInclude,
        applicant: { select: { id: true, displayName: true, email: true, emailVerifiedAt: true } },
        reviewer: { select: { id: true, displayName: true } }
      }
    });
    if (!app || app.status === "DRAFT")
      throw AppError.notFound("We could not find that application.");
    // Names alike are a reason to look closer, never proof of anything: matching on the normalised name, or one
    // name containing the other, across every organization regardless of its state.
    const norm = app.organization.normalizedName;
    const similar = await this.prisma.$queryRaw<
      Array<{
        slug: string;
        name: string;
        verificationStatus: "UNVERIFIED" | "VERIFIED" | "REVOKED";
        status: string;
        jurisdiction: string;
      }>
    >`
      SELECT "slug", "name", "verificationStatus", "status"::text AS "status", "jurisdiction"
      FROM "Organization"
      WHERE "id" <> ${app.organizationId}::uuid
        AND (position("normalizedName" in ${norm}) > 0 OR position(${norm} in "normalizedName") > 0)
      ORDER BY "name" LIMIT 10`;
    return {
      ...toApplicationDto(app),
      applicant: {
        id: app.applicant.id,
        name: app.applicant.displayName,
        email: app.applicant.email,
        emailVerified: app.applicant.emailVerifiedAt !== null
      },
      reviewer: app.reviewer ? { id: app.reviewer.id, name: app.reviewer.displayName } : null,
      reviewerNotes: app.reviewerNotes,
      similar,
      reviewerConflict: await this.applicationConflict(user, app)
    };
  }

  /** Locks the application row for the rest of the transaction and returns it. */
  private async lockApplication(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "OrganizationApplication" WHERE id = ${id}::uuid FOR UPDATE`;
    const app = await tx.organizationApplication.findUnique({
      where: { id },
      include: { organization: true, applicant: true }
    });
    if (!app || app.status === "DRAFT")
      throw AppError.notFound("We could not find that application.");
    return app;
  }

  async startReview(user: AuthUser, id: string): Promise<void> {
    assertStaff(user);
    await this.prisma.$transaction(async (tx) => {
      const app = await this.lockApplication(tx, id);
      const conflict = await this.applicationConflict(user, app, tx);
      if (conflict) throw AppError.conflict("REVIEW_CONFLICT", conflict);
      if (app.status !== "SUBMITTED")
        throw AppError.conflict(
          "NOT_SUBMITTED",
          "Only a submitted application can be taken for review."
        );
      await tx.organizationApplication.update({
        where: { id },
        data: { status: "UNDER_REVIEW", reviewerId: user.id }
      });
      await this.decisionRow(tx, {
        organizationId: app.organizationId,
        applicationId: id,
        action: "REVIEW_STARTED",
        actorId: user.id
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.review_started",
          entityType: "OrganizationApplication",
          entityId: id,
          metadata: { organizationId: app.organizationId }
        },
        tx
      );
    });
  }

  async requestInfo(user: AuthUser, id: string, message: string): Promise<void> {
    assertStaff(user);
    const text = cleanText(message);
    if (text.length < L.infoRequest.min)
      throw AppError.badRequest("MESSAGE_REQUIRED", "Say what you need.", [
        {
          field: "message",
          message: `Say what you need, in at least ${L.infoRequest.min} characters.`
        }
      ]);
    await this.prisma.$transaction(async (tx) => {
      const app = await this.lockApplication(tx, id);
      const conflict = await this.applicationConflict(user, app, tx);
      if (conflict) throw AppError.conflict("REVIEW_CONFLICT", conflict);
      if (app.status !== "SUBMITTED" && app.status !== "UNDER_REVIEW")
        throw AppError.conflict(
          "NOT_REVIEWABLE",
          "Only an application waiting for review can have more information requested."
        );
      await tx.organizationApplication.update({
        where: { id },
        data: { status: "INFO_REQUESTED", infoRequest: text, reviewerId: app.reviewerId ?? user.id }
      });
      await this.decisionRow(tx, {
        organizationId: app.organizationId,
        applicationId: id,
        action: "INFO_REQUESTED",
        actorId: user.id,
        reason: text
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.info_requested",
          entityType: "OrganizationApplication",
          entityId: id,
          metadata: { organizationId: app.organizationId }
        },
        tx
      );
      await this.notifier.tell(tx, app.applicantId, user.id, {
        title: `Sidewalk needs more information about ${app.organization.name}`,
        body: text,
        url: `/organizations/applications/${id}`,
        dedupeKey: `org-info-requested:${id}:${Date.now()}`
      });
    });
  }

  async saveNotes(user: AuthUser, id: string, notes: string): Promise<void> {
    assertStaff(user);
    await this.prisma.$transaction(async (tx) => {
      const app = await this.lockApplication(tx, id);
      const conflict = await this.applicationConflict(user, app, tx);
      if (conflict) throw AppError.conflict("REVIEW_CONFLICT", conflict);
      await tx.organizationApplication.update({
        where: { id },
        data: { reviewerNotes: cleanText(notes).slice(0, L.reviewerNotes.max) || null }
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.review_notes_saved",
          entityType: "OrganizationApplication",
          entityId: id,
          metadata: { organizationId: app.organizationId }
        },
        tx
      );
    });
  }

  /**
   * Approve or reject. Administrators only. Approval is the only way an organization becomes verified: it lists the
   * profile, optionally makes the applicant its first administrator, and cannot succeed beside another verified
   * organization of the same name.
   */
  async decide(user: AuthUser, id: string, dto: DecisionDto): Promise<void> {
    assertAdmin(user);
    const reason = cleanText(dto.reason);
    if (reason.length < L.decisionReason.min)
      throw AppError.badRequest("REASON_REQUIRED", "Explain the decision.", [
        {
          field: "reason",
          message: `Explain the decision in at least ${L.decisionReason.min} characters.`
        }
      ]);
    try {
      await this.prisma.$transaction(async (tx) => {
        const app = await this.lockApplication(tx, id);
        const conflict = await this.applicationConflict(user, app, tx);
        if (conflict) throw AppError.conflict("REVIEW_CONFLICT", conflict);
        if (app.status !== "SUBMITTED" && app.status !== "UNDER_REVIEW")
          throw AppError.conflict(
            "NOT_REVIEWABLE",
            app.status === "APPROVED" || app.status === "REJECTED"
              ? "This application has already been decided."
              : "This application is not waiting for a decision."
          );
        const previous = {
          verificationStatus: app.organization.verificationStatus,
          status: app.organization.status
        };
        const now = new Date();

        if (dto.decision === "APPROVE") {
          const clash = await tx.organization.findFirst({
            where: {
              normalizedName: app.organization.normalizedName,
              verificationStatus: "VERIFIED",
              id: { not: app.organizationId }
            },
            select: { slug: true }
          });
          if (clash)
            throw AppError.conflict(
              "NAME_ALREADY_VERIFIED",
              `Another organization with this name is already verified (${clash.slug}). Reject this application, or resolve the duplicate first.`
            );
          await tx.organization.update({
            where: { id: app.organizationId },
            data: {
              verificationStatus: "VERIFIED",
              verifiedAt: now,
              verificationRevokedAt: null,
              publicProfile: true,
              status: "ACTIVE",
              suspendedAt: null
            }
          });
          if (
            dto.appointApplicant !== false &&
            app.applicant.status === "ACTIVE" &&
            app.applicant.emailVerifiedAt &&
            !(await this.access.membership(app.applicantId, app.organizationId, tx))
          ) {
            await tx.organizationMember.create({
              data: {
                organizationId: app.organizationId,
                userId: app.applicantId,
                role: "ADMIN",
                addedById: user.id
              }
            });
          }
        }
        await tx.organizationApplication.update({
          where: { id },
          data: {
            status: dto.decision === "APPROVE" ? "APPROVED" : "REJECTED",
            reviewerId: user.id,
            decidedAt: now,
            decisionReason: reason,
            infoRequest: null
          }
        });
        await this.decisionRow(tx, {
          organizationId: app.organizationId,
          applicationId: id,
          action: dto.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          actorId: user.id,
          reason,
          previous,
          next:
            dto.decision === "APPROVE"
              ? {
                  verificationStatus: "VERIFIED",
                  status: "ACTIVE",
                  appointedApplicant: dto.appointApplicant !== false
                }
              : previous
        });
        await this.audit.record(
          {
            actorId: user.id,
            action:
              dto.decision === "APPROVE"
                ? "organization.verified"
                : "organization.application_rejected",
            entityType: "Organization",
            entityId: app.organizationId,
            metadata: { applicationId: id, from: previous.verificationStatus }
          },
          tx
        );
        await this.notifier.tell(tx, app.applicantId, user.id, {
          title:
            dto.decision === "APPROVE"
              ? `${app.organization.name} is now verified on Sidewalk`
              : `Sidewalk could not verify ${app.organization.name}`,
          body:
            dto.decision === "APPROVE"
              ? `Your application was approved. ${reason}`
              : `Your application was not approved. ${reason}`,
          url:
            dto.decision === "APPROVE"
              ? `/organizations/${app.organization.slug}`
              : `/organizations/applications/${id}`,
          dedupeKey: `org-decision:${id}`
        });
      });
    } catch (e) {
      // The unique index is the last word on one verified profile per name, even if two decisions race.
      if ((e as { code?: string }).code === "P2002")
        throw AppError.conflict(
          "NAME_ALREADY_VERIFIED",
          "Another organization with this name is already verified. Reject this application, or resolve the duplicate first."
        );
      throw e;
    }
  }

  // ───────────────────────────── organizations ─────────────────────────────

  private async setOperational(
    user: AuthUser,
    organizationId: string,
    action: "SUSPENDED" | "REINSTATED" | "REVOKED",
    reasonInput: string
  ): Promise<void> {
    assertAdmin(user);
    const reason = cleanText(reasonInput);
    if (reason.length < L.governanceReason.min)
      throw AppError.badRequest("REASON_REQUIRED", "Explain the decision.", [
        {
          field: "reason",
          message: `Explain the decision in at least ${L.governanceReason.min} characters.`
        }
      ]);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
      const org = await tx.organization.findUnique({ where: { id: organizationId } });
      if (!org) throw AppError.notFound("We could not find that organization.");
      const conflict = await this.organizationConflict(user, org.id, tx);
      if (conflict) throw AppError.conflict("REVIEW_CONFLICT", conflict);
      const previous = { verificationStatus: org.verificationStatus, status: org.status };
      const now = new Date();
      let data: Prisma.OrganizationUpdateInput;
      if (action === "SUSPENDED") {
        if (org.status === "SUSPENDED")
          throw AppError.conflict("ALREADY_SUSPENDED", "This organization is already suspended.");
        data = { status: "SUSPENDED", suspendedAt: now };
      } else if (action === "REINSTATED") {
        if (org.status !== "SUSPENDED")
          throw AppError.conflict("NOT_SUSPENDED", "This organization is not suspended.");
        data = { status: "ACTIVE", suspendedAt: null };
      } else {
        if (org.verificationStatus !== "VERIFIED")
          throw AppError.conflict(
            "NOT_VERIFIED",
            "Only a verified organization's verification can be withdrawn."
          );
        data = { verificationStatus: "REVOKED", verificationRevokedAt: now };
      }
      await tx.organization.update({ where: { id: org.id }, data });
      const next = {
        ...previous,
        ...(action === "SUSPENDED"
          ? { status: "SUSPENDED" }
          : action === "REINSTATED"
            ? { status: "ACTIVE" }
            : { verificationStatus: "REVOKED" })
      };
      await this.decisionRow(tx, {
        organizationId: org.id,
        action,
        actorId: user.id,
        reason,
        previous,
        next
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: `organization.${action.toLowerCase()}`,
          entityType: "Organization",
          entityId: org.id,
          metadata: { from: previous, to: next }
        },
        tx
      );
      // Members are told the fact, not the reason: the reason may concern an investigation.
      const headline =
        action === "SUSPENDED"
          ? `${org.name} was suspended on Sidewalk`
          : action === "REINSTATED"
            ? `${org.name} was reinstated on Sidewalk`
            : `${org.name}'s verification was withdrawn`;
      await this.notifier.tellMembers(tx, org.id, ["ADMIN", "REPRESENTATIVE", "MEMBER"], user.id, {
        title: headline,
        body:
          action === "REINSTATED"
            ? "Your representatives can respond to reports again."
            : "Your representatives can no longer publish official responses. Contact Sidewalk staff if you think this is a mistake.",
        url: `/organizations/${org.slug}`,
        dedupeKey: `org-governance:${org.id}:${action}:${now.getTime()}`
      });
    });
  }

  suspend(user: AuthUser, id: string, reason: string) {
    return this.setOperational(user, id, "SUSPENDED", reason);
  }
  reinstate(user: AuthUser, id: string, reason: string) {
    return this.setOperational(user, id, "REINSTATED", reason);
  }
  revokeVerification(user: AuthUser, id: string, reason: string) {
    return this.setOperational(user, id, "REVOKED", reason);
  }

  /**
   * Staff-created onboarding: a record for an institution Sidewalk wants represented, optionally with an invitation to the
   * intended representative. It is not verified, and the invitation does not change that.
   */
  async createOrganization(user: AuthUser, dto: CreateOrganizationDto) {
    assertAdmin(user);
    const name = cleanLine(dto.name);
    const normalizedName = normalizeOrganizationName(name);
    const org = await this.prisma.$transaction(async (tx) => {
      const clash = await tx.organization.findFirst({
        where: { normalizedName, verificationStatus: "VERIFIED" },
        select: { slug: true }
      });
      if (clash)
        throw AppError.conflict(
          "ORGANIZATION_ALREADY_VERIFIED",
          `An organization with this name is already verified (${clash.slug}).`
        );
      const base = slugifyOrganizationName(name) || "organization";
      let slug = base;
      while (await tx.organization.findUnique({ where: { slug }, select: { id: true } }))
        slug = `${base.slice(0, 52)}-${randomBytes(2).toString("hex")}`;
      let parentId: string | null = null;
      if (dto.parentSlug) {
        const parent = await tx.organization.findUnique({
          where: { slug: dto.parentSlug },
          select: { id: true }
        });
        if (!parent)
          throw AppError.badRequest(
            "UNKNOWN_PARENT",
            "We could not find that parent organization.",
            [{ field: "parentSlug", message: "Choose an existing organization." }]
          );
        parentId = parent.id;
      }
      const created = await tx.organization.create({
        data: {
          slug,
          name,
          normalizedName,
          aliases: dto.aliases?.map(cleanLine).filter(Boolean).slice(0, L.alias.maxCount) ?? [],
          type: dto.type,
          level: dto.level,
          jurisdiction: cleanLine(dto.jurisdiction),
          serviceAreas:
            dto.serviceAreas?.map(cleanLine).filter(Boolean).slice(0, L.serviceArea.maxCount) ?? [],
          parentId,
          description: dto.description ? cleanText(dto.description) : null,
          website: dto.website?.trim() ?? null,
          publicEmail: dto.publicEmail?.trim().toLowerCase() ?? null,
          publicPhone: dto.publicPhone ? cleanLine(dto.publicPhone) : null,
          publicProfile: dto.listPublicly === true,
          createdById: user.id
        }
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.created_by_staff",
          entityType: "Organization",
          entityId: created.id,
          metadata: { listedPublicly: dto.listPublicly === true }
        },
        tx
      );
      if (dto.inviteEmail)
        await this.invitations.issue(tx, created, dto.inviteEmail, "ADMIN", user);
      return created;
    });
    return { id: org.id, slug: org.slug, name: org.name };
  }

  async listOrganizations(user: AuthUser, query: StaffOrganizationListQuery) {
    assertStaff(user);
    const and: Prisma.OrganizationWhereInput[] = [];
    if (query.q?.trim()) {
      const like = likeEscape(query.q.trim());
      and.push({
        OR: [
          { name: { contains: like, mode: "insensitive" } },
          { normalizedName: { contains: normalizeOrganizationName(query.q) } },
          { jurisdiction: { contains: like, mode: "insensitive" } }
        ]
      });
    }
    if (query.state === "SUSPENDED") and.push({ status: "SUSPENDED" });
    else if (query.state !== "ALL") and.push({ verificationStatus: query.state });
    const where: Prisma.OrganizationWhereInput = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        include: { _count: { select: { members: { where: { status: "ACTIVE" } } } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);
    return paginate(
      rows.map((o) => ({
        ...toBadge(o),
        id: o.id,
        type: o.type,
        level: o.level,
        jurisdiction: o.jurisdiction,
        publicProfile: o.publicProfile,
        members: o._count.members,
        createdAt: o.createdAt.toISOString()
      })),
      total,
      query.page,
      query.pageSize
    );
  }

  async getOrganization(user: AuthUser, id: string): Promise<StaffOrganizationDto> {
    assertStaff(user);
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        createdBy: { select: { displayName: true } },
        members: {
          include: { user: { select: { displayName: true, email: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }]
        },
        invitations: { orderBy: { createdAt: "desc" }, take: 50 },
        decisions: {
          include: { actor: { select: { displayName: true } } },
          orderBy: { createdAt: "desc" },
          take: 100
        },
        applications: {
          where: { status: { not: "DRAFT" } },
          include: { applicant: { select: { displayName: true } } },
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });
    if (!org) throw AppError.notFound("We could not find that organization.");
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      type: org.type,
      level: org.level,
      jurisdiction: org.jurisdiction,
      aliases: org.aliases,
      serviceAreas: org.serviceAreas,
      description: org.description,
      website: org.website,
      publicEmail: org.publicEmail,
      publicPhone: org.publicPhone,
      status: org.status,
      suspendedAt: org.suspendedAt?.toISOString() ?? null,
      verificationStatus: org.verificationStatus,
      verifiedAt: org.verifiedAt?.toISOString() ?? null,
      verificationRevokedAt: org.verificationRevokedAt?.toISOString() ?? null,
      publicProfile: org.publicProfile,
      createdAt: org.createdAt.toISOString(),
      createdByName: org.createdBy.displayName,
      members: org.members.map((m) => ({ ...toMemberDto(m), email: m.user.email })),
      invitations: org.invitations.map(toInvitationDto),
      decisions: org.decisions.map((d): VerificationDecisionDto => ({
        id: d.id,
        action: d.action,
        actorName: d.actor.displayName,
        reason: d.reason,
        createdAt: d.createdAt.toISOString()
      })),
      applications: org.applications.map((a) => ({
        id: a.id,
        status: a.status,
        applicantName: a.applicant.displayName,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        decidedAt: a.decidedAt?.toISOString() ?? null
      })),
      conflict: await this.organizationConflict(user, org.id)
    };
  }

  /** Reports where an organization has said it is not responsible, or where a reporter has suggested one: the work of reassignment. */
  async relationQueue(
    user: AuthUser,
    query: RelationQueueQuery
  ): Promise<Paginated<RelationQueueItemDto>> {
    assertStaff(user);
    const where: Prisma.ReportOrganizationWhereInput = {
      status: query.status,
      report: { moderationState: "VISIBLE" }
    };
    const [total, rows] = await Promise.all([
      this.prisma.reportOrganization.count({ where }),
      this.prisma.reportOrganization.findMany({
        where,
        include: {
          organization: true,
          report: { select: { reference: true, title: true, status: true } }
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);
    return paginate(
      rows.map((r) => ({
        id: r.id,
        organization: toBadge(r.organization),
        basis: r.basis,
        status: r.status,
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        outsideRemitAt: r.outsideRemitAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        report: r.report
      })),
      total,
      query.page,
      query.pageSize
    );
  }
}

export type { Organization, MemberRole };
