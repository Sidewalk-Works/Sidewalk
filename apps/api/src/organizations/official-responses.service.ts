import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ORGANIZATION_LIMITS as L,
  RESPONSE_TYPE_INFO,
  STATUS_INFO,
  SUPERSEDING_RESPONSE_TYPES,
  canTransition,
  type ReportStatus
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertStaff, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { cleanText, excerpt } from "../common/utils/text";
import { ActivityService } from "../activity/activity.service";
import { AuditService } from "../audit/audit.service";
import type { Organization, Prisma, Report, ResponseType } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { PublishResponseDto, StaffRelationDto } from "./dto";
import { OrganizationAccessService } from "./organization-access.service";
import { OrganizationNotifier } from "./organization-notifier";

/** A report that has been closed without a repair can only have earlier statements corrected or withdrawn. */
const CLOSED_WITHOUT_REPAIR: readonly ReportStatus[] = ["REJECTED", "DUPLICATE"];

interface Change {
  from: ReportStatus;
  to: ReportStatus;
}

/**
 * Official responses and organization connections: the place organizations speak on a report, and the place the trust
 * rules about that live.
 *
 *  - Only a verified, active organization's authorized representative can publish, checked again inside the
 *    transaction under a lock on the report, so a revocation or suspension that lands mid-request still wins.
 *  - A response is append-only. Corrections and withdrawals are new entries that point at the one they replace.
 *  - What a response may do to the report is limited by its type and by the lifecycle: an acknowledgement or progress
 *    update can move the status forward; a resolution claim marks it RESOLVED as a claim only (never verified), and
 *    needs the organization's own evidence; nothing else changes the status.
 *  - Being connected to a report is not accepting responsibility, and "outside our remit" is the organization's statement,
 *    never a finding.
 */
@Injectable()
export class OfficialResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly notifier: OrganizationNotifier
  ) {}

  // ───────────────────────────── publishing ─────────────────────────────

  async publish(
    user: AuthUser,
    reference: string,
    dto: PublishResponseDto
  ): Promise<{ id: string }> {
    assertVerifiedEmail(user);
    const found = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, moderationState: true }
    });
    if (!found || found.moderationState !== "VISIBLE")
      throw AppError.notFound("We could not find that report.");
    const body = cleanText(dto.body);
    if (body.length < L.responseBody.min)
      throw AppError.badRequest("BODY_REQUIRED", "Write the statement.", [
        {
          field: "body",
          message: `Write at least ${L.responseBody.min} characters. Everyone who views the report will read it.`
        }
      ]);
    const superseding = (SUPERSEDING_RESPONSE_TYPES as readonly string[]).includes(dto.type);
    if (superseding && !dto.supersedesId)
      throw AppError.badRequest(
        "SUPERSEDES_REQUIRED",
        "Say which earlier statement this replaces.",
        [{ field: "supersedesId", message: "Choose the statement to correct or withdraw." }]
      );
    if (!superseding && dto.supersedesId)
      throw AppError.badRequest(
        "SUPERSEDES_NOT_ALLOWED",
        "Only a correction or a withdrawal replaces an earlier statement."
      );

    return this.prisma.$transaction(async (tx) => {
      // One consistent snapshot: the report cannot change status underneath this, and (re-checked below) neither
      // can the representative's authority.
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id = ${found.id}::uuid FOR UPDATE`;
      const report = await tx.report.findUniqueOrThrow({ where: { id: found.id } });
      if (report.moderationState !== "VISIBLE")
        throw AppError.notFound("We could not find that report.");
      const { org } = await this.access.responder(user, dto.organizationSlug, tx);
      if (CLOSED_WITHOUT_REPAIR.includes(report.status) && !superseding)
        throw AppError.conflict(
          "REPORT_CLOSED",
          "This report has been closed. Only earlier statements can be corrected or withdrawn."
        );

      const relation = await tx.reportOrganization.findUnique({
        where: { reportId_organizationId: { reportId: report.id, organizationId: org.id } }
      });
      if (!relation)
        throw AppError.conflict(
          "NOT_CONNECTED",
          "Add your organization to this report before responding to it."
        );
      if (relation.status === "REMOVED")
        throw AppError.conflict(
          "ORGANIZATION_REMOVED",
          "Sidewalk staff removed this organization's connection to the report."
        );

      const now = new Date();
      const responseId = randomUUID();
      let change: Change | null = null;
      let relationUpdate: Prisma.ReportOrganizationUpdateInput | null = null;
      let evidenceIds: string[] = [];
      let supersedes: { id: string; type: ResponseType } | null = null;

      switch (dto.type) {
        case "ACKNOWLEDGEMENT":
          relationUpdate = {
            acknowledgedAt: relation.acknowledgedAt ?? now,
            ...(relation.status !== "ACTIVE" ? { status: "ACTIVE", outsideRemitAt: null } : {})
          };
          if (canTransition(report.status, "ACKNOWLEDGED", "ORGANIZATION"))
            change = { from: report.status, to: "ACKNOWLEDGED" };
          break;
        case "UPDATE":
          if (dto.markInProgress) {
            if (!canTransition(report.status, "IN_PROGRESS", "ORGANIZATION"))
              throw AppError.conflict(
                "INVALID_TRANSITION",
                `A report that is "${STATUS_INFO[report.status].label}" cannot be recorded as in progress by an organization. Acknowledge it first.`
              );
            change = { from: report.status, to: "IN_PROGRESS" };
          }
          break;
        case "DELAY":
          break;
        case "OUT_OF_REMIT":
          relationUpdate = { status: "OUTSIDE_REMIT", outsideRemitAt: now };
          break;
        case "RESOLUTION_CLAIM": {
          if (relation.status === "OUTSIDE_REMIT")
            throw AppError.conflict(
              "OUTSIDE_REMIT",
              "This organization has said the report is outside its remit. Acknowledge it first if that has changed."
            );
          if (!canTransition(report.status, "RESOLVED", "ORGANIZATION"))
            throw AppError.conflict(
              "INVALID_TRANSITION",
              `A report that is "${STATUS_INFO[report.status].label}" cannot be claimed as resolved.`
            );
          evidenceIds = [...new Set(dto.evidenceIds ?? [])];
          if (evidenceIds.length === 0)
            throw AppError.badRequest(
              "EVIDENCE_REQUIRED",
              "A resolution claim needs at least one photograph from your organization.",
              [
                {
                  field: "evidenceIds",
                  message: "Upload at least one photograph of the fix first."
                }
              ]
            );
          const usable = await tx.reportEvidence.count({
            where: {
              id: { in: evidenceIds },
              reportId: report.id,
              kind: "RESOLUTION",
              organizationId: org.id,
              responseId: null
            }
          });
          if (usable !== evidenceIds.length)
            throw AppError.conflict(
              "EVIDENCE_NOT_AVAILABLE",
              "One or more of those photographs is not available for this claim. Upload them again."
            );
          change = { from: report.status, to: "RESOLVED" };
          if (relation.status === "PROPOSED") relationUpdate = { status: "ACTIVE" };
          break;
        }
        case "CORRECTION":
        case "WITHDRAWAL": {
          const target = await tx.officialResponse.findFirst({
            where: { id: dto.supersedesId as string, reportId: report.id, organizationId: org.id },
            select: { id: true, type: true }
          });
          if (!target)
            throw AppError.notFound("We could not find that statement from your organization.");
          if (await tx.officialResponse.count({ where: { supersedesId: target.id } }))
            throw AppError.conflict(
              "ALREADY_SUPERSEDED",
              "A newer statement already replaces that one. Correct the newest."
            );
          supersedes = target;
          if (dto.type === "WITHDRAWAL" && target.type === "RESOLUTION_CLAIM") {
            // Retracting a claim still standing: the report goes back to "reopened", not forward. A claim that staff
            // have verified is not the organization's to withdraw.
            const lastResolved = await tx.reportStatusHistory.findFirst({
              where: { reportId: report.id, toStatus: "RESOLVED" },
              orderBy: { createdAt: "desc" }
            });
            if (report.status === "RESOLVED" && lastResolved?.organizationId === org.id) {
              if (report.verification === "VERIFIED")
                throw AppError.conflict(
                  "CLAIM_VERIFIED",
                  "Sidewalk staff verified this resolution, so the organization cannot withdraw it. Ask Sidewalk staff."
                );
              change = { from: "RESOLVED", to: "REOPENED" };
            }
          }
          break;
        }
      }

      const historyId = change ? randomUUID() : null;
      if (change) {
        const resolving = change.to === "RESOLVED";
        const moved = await tx.report.updateMany({
          where: { id: report.id, status: change.from },
          data: {
            status: change.to,
            lastActivityAt: now,
            verification: resolving ? "CLAIMED" : "NONE",
            resolutionNote: resolving ? body : null,
            resolvedAt: resolving ? now : null
          }
        });
        if (moved.count === 0)
          throw AppError.conflict(
            "STALE_STATUS",
            "This report changed while you were writing. Reload and try again."
          );
      } else {
        await tx.report.update({ where: { id: report.id }, data: { lastActivityAt: now } });
      }

      await tx.officialResponse.create({
        data: {
          id: responseId,
          reportId: report.id,
          organizationId: org.id,
          authorId: user.id,
          type: dto.type,
          body,
          supersedesId: supersedes?.id ?? null,
          organizationName: org.name,
          organizationSlug: org.slug,
          authorName: user.displayName,
          verifiedAtPublication: org.verifiedAt as Date,
          statusHistoryId: historyId
        }
      });
      if (change && historyId) {
        await tx.reportStatusHistory.create({
          data: {
            id: historyId,
            reportId: report.id,
            fromStatus: change.from,
            toStatus: change.to,
            actorId: user.id,
            actorRole: user.role,
            basis: "ORGANIZATION_STATEMENT",
            publicNote: body,
            organizationId: org.id,
            responseId
          }
        });
      }
      if (evidenceIds.length)
        await tx.reportEvidence.updateMany({
          where: { id: { in: evidenceIds } },
          data: { responseId }
        });
      if (relationUpdate)
        await tx.reportOrganization.update({ where: { id: relation.id }, data: relationUpdate });

      const orgPayload = { slug: org.slug, name: org.name };
      await this.activity.record(tx, {
        reportId: report.id,
        type: "OFFICIAL_RESPONSE",
        actorId: user.id,
        isPublic: true,
        payload: {
          actorRole: "ORGANIZATION",
          organization: orgPayload,
          responseId,
          responseType: dto.type,
          note: excerpt(body, 200)
        }
      });
      if (change)
        await this.activity.record(tx, {
          reportId: report.id,
          type: "STATUS_CHANGED",
          actorId: user.id,
          isPublic: true,
          payload: {
            actorRole: "ORGANIZATION",
            organization: orgPayload,
            responseId,
            from: change.from,
            to: change.to,
            basis: "ORGANIZATION_STATEMENT",
            note: excerpt(body, 200)
          }
        });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.response_published",
          entityType: "OfficialResponse",
          entityId: responseId,
          metadata: {
            reportId: report.id,
            organizationId: org.id,
            type: dto.type,
            supersedes: supersedes?.id ?? null,
            statusChange: change
          }
        },
        tx
      );
      await this.notifyAudience(tx, report, org, dto.type, body, responseId, change, user.id);
      return { id: responseId };
    });
  }

  /**
   * Tells the reporter and followers (never the person who wrote it). One notification per response: a status change
   * it carried is described in the same message rather than announced twice.
   */
  private async notifyAudience(
    tx: Prisma.TransactionClient,
    report: Report,
    org: Organization,
    type: ResponseType,
    body: string,
    responseId: string,
    change: Change | null,
    actorId: string
  ) {
    const claim = type === "RESOLUTION_CLAIM";
    await this.notifications.notifyReport(tx, {
      reportId: report.id,
      actorId,
      type: claim ? "RESOLUTION_CLAIMED" : "OFFICIAL_RESPONSE",
      dedupeKey: `response:${responseId}`,
      title: claim
        ? `${org.name} says ${report.reference} is resolved`
        : `${org.name} ${RESPONSE_TYPE_INFO[type].verb} on ${report.reference}`,
      body: [
        claim ? "This is the organization's claim. It has not been independently verified." : "",
        type === "OUT_OF_REMIT" ? "This is the organization's statement, not a finding." : "",
        change ? `Status is now “${STATUS_INFO[change.to].label}”.` : "",
        excerpt(body, 160)
      ]
        .filter(Boolean)
        .join(" ")
    });
  }

  // ───────────────────────────── connections ─────────────────────────────

  /**
   * Connects an organization to a report. Who is asking decides what it means: the reporter suggests (PROPOSED), a
   * representative of a verified organization adds their own (ACTIVE, and labelled as self-added), and staff assign
   * (ACTIVE). Nothing here is inferred from where the report is or what category it is in.
   */
  async connect(user: AuthUser, reference: string, slug: string): Promise<void> {
    assertVerifiedEmail(user);
    const report = await this.prisma.report.findUnique({
      where: { reference },
      select: { id: true, reporterId: true, moderationState: true, reference: true }
    });
    if (!report || report.moderationState !== "VISIBLE")
      throw AppError.notFound("We could not find that report.");
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id = ${report.id}::uuid FOR UPDATE`;
      const org = await this.access.find(slug, tx);
      const member = org ? await this.access.membership(user.id, org.id, tx) : null;
      const staff = isStaff(user);
      const isResponder =
        !!org && !!member && this.access.orgBlocker(org) === null && member.role !== "MEMBER";
      if (!org || (!staff && !isResponder && !org.publicProfile))
        throw AppError.notFound("We could not find that organization.");

      let basis: "REPORTER_SUGGESTED" | "STAFF_ASSIGNED" | "ORGANIZATION_ADDED";
      let status: "PROPOSED" | "ACTIVE";
      if (isResponder) {
        basis = "ORGANIZATION_ADDED";
        status = "ACTIVE";
      } else if (staff) {
        basis = "STAFF_ASSIGNED";
        status = "ACTIVE";
      } else if (report.reporterId === user.id) {
        basis = "REPORTER_SUGGESTED";
        status = "PROPOSED";
      } else
        throw AppError.forbidden(
          "Only the person who filed this report, a representative of a verified organization, or Sidewalk staff can connect an organization to it."
        );

      const existing = await tx.reportOrganization.findUnique({
        where: { reportId_organizationId: { reportId: report.id, organizationId: org.id } }
      });
      if (existing && existing.status !== "REMOVED" && !(staff && existing.status !== "ACTIVE"))
        throw AppError.conflict(
          "ALREADY_CONNECTED",
          "That organization is already connected to this report."
        );
      if (existing?.status === "REMOVED" && !staff)
        throw AppError.forbidden(
          "Sidewalk staff removed that organization's connection to this report. Only staff can restore it."
        );
      if (basis === "REPORTER_SUGGESTED") {
        const suggested = await tx.reportOrganization.count({
          where: { reportId: report.id, basis: "REPORTER_SUGGESTED" }
        });
        if (suggested >= L.suggestionsPerReport)
          throw AppError.conflict(
            "TOO_MANY_SUGGESTIONS",
            `You can suggest up to ${L.suggestionsPerReport} organizations for one report.`
          );
      }
      const relation = existing
        ? await tx.reportOrganization.update({
            where: { id: existing.id },
            data: {
              status,
              basis: staff ? "STAFF_ASSIGNED" : existing.basis,
              addedById: user.id,
              outsideRemitAt: null
            }
          })
        : await tx.reportOrganization.create({
            data: { reportId: report.id, organizationId: org.id, basis, status, addedById: user.id }
          });
      await tx.report.update({ where: { id: report.id }, data: { lastActivityAt: new Date() } });
      await this.activity.record(tx, {
        reportId: report.id,
        type: "ORGANIZATION_LINKED",
        actorId: user.id,
        isPublic: true,
        payload: {
          actorRole:
            basis === "ORGANIZATION_ADDED"
              ? "ORGANIZATION"
              : basis === "STAFF_ASSIGNED"
                ? "STAFF"
                : "REPORTER",
          organization: { slug: org.slug, name: org.name },
          kind: basis,
          note:
            basis === "REPORTER_SUGGESTED"
              ? `Suggested ${org.name} as relevant.`
              : basis === "STAFF_ASSIGNED"
                ? `Sidewalk staff connected ${org.name} to this report.`
                : `${org.name} added itself to this report.`
        }
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.report_connected",
          entityType: "ReportOrganization",
          entityId: relation.id,
          metadata: { reportId: report.id, organizationId: org.id, basis, status }
        },
        tx
      );
      // Tell the organization it has been named, unless it named itself.
      if (basis !== "ORGANIZATION_ADDED")
        await this.notifier.tellMembers(tx, org.id, ["ADMIN", "REPRESENTATIVE"], user.id, {
          title: `${basis === "STAFF_ASSIGNED" ? "Sidewalk staff connected" : "A resident suggested"} ${org.name} on ${report.reference}`,
          body: "Being connected to a report is not accepting responsibility for it. Open it to acknowledge, respond, or say it is outside your remit.",
          url: `/issues/${report.reference}`,
          dedupeKey: `org-connected:${relation.id}:${relation.updatedAt.getTime()}`,
          reportId: report.id
        });
    });
  }

  /** Staff confirm or remove a connection: the work of reassignment and of settling a responsibility dispute. */
  async staffSetRelation(user: AuthUser, reference: string, dto: StaffRelationDto): Promise<void> {
    assertStaff(user);
    const reason = cleanText(dto.reason);
    if (reason.length < L.governanceReason.min)
      throw AppError.badRequest("REASON_REQUIRED", "Explain the decision.", [
        {
          field: "reason",
          message: `Explain the decision in at least ${L.governanceReason.min} characters.`
        }
      ]);
    await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({
        where: { reference },
        select: { id: true, reference: true }
      });
      const org = await tx.organization.findUnique({ where: { slug: dto.organizationSlug } });
      if (!report || !org)
        throw AppError.notFound("We could not find that report or organization.");
      const relation = await tx.reportOrganization.findUnique({
        where: { reportId_organizationId: { reportId: report.id, organizationId: org.id } }
      });
      if (!relation) throw AppError.notFound("That organization is not connected to this report.");
      if (relation.status === dto.status)
        throw AppError.conflict("NO_CHANGE", "That is already the state of this connection.");
      await tx.reportOrganization.update({
        where: { id: relation.id },
        data: {
          status: dto.status,
          outsideRemitAt: dto.status === "ACTIVE" ? null : relation.outsideRemitAt,
          addedById: user.id
        }
      });
      await tx.report.update({ where: { id: report.id }, data: { lastActivityAt: new Date() } });
      await this.activity.record(tx, {
        reportId: report.id,
        type: "ORGANIZATION_LINKED",
        actorId: user.id,
        isPublic: true,
        payload: {
          actorRole: "STAFF",
          organization: { slug: org.slug, name: org.name },
          kind: dto.status,
          note:
            dto.status === "REMOVED"
              ? `Sidewalk staff removed ${org.name}'s connection to this report.`
              : `Sidewalk staff connected ${org.name} to this report.`
        }
      });
      // The reason is the audit trail's, not the public timeline's.
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.report_connection_changed",
          entityType: "ReportOrganization",
          entityId: relation.id,
          metadata: {
            reportId: report.id,
            organizationId: org.id,
            from: relation.status,
            to: dto.status,
            reason
          }
        },
        tx
      );
    });
  }
}
