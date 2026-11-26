import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  MEMBER_ROLE_INFO,
  ORGANIZATION_LIMITS as L,
  type InvitationDto,
  type MemberRole
} from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail } from "../common/auth-types";
import { normalizeEmail } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import { maskEmail, OutboxService } from "../email/outbox.service";
import type { Organization, OrganizationInvitation, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { InviteDto } from "./dto";
import { OrganizationAccessService } from "./organization-access.service";
import { OrganizationNotifier } from "./organization-notifier";
import { toBadge } from "./organization.mapper";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const RESEND_COOLDOWN_MS = 60_000;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function toInvitationDto(i: OrganizationInvitation): InvitationDto {
  const expired = i.status === "PENDING" && i.expiresAt <= new Date();
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    status: expired ? "EXPIRED" : i.status,
    expiresAt: i.expiresAt.toISOString(),
    sentCount: i.sentCount,
    lastSentAt: i.lastSentAt.toISOString(),
    createdAt: i.createdAt.toISOString()
  };
}

/**
 * Invitations offer membership; they do not verify anything and grant nothing beyond the offered role. The token is 256
 * random bits and only its hash is stored. It is bound to one address: accepting needs a signed-in account whose
 * confirmed email is exactly that address. A wrong account's attempt changes nothing, so it cannot use up the invitation.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly notifier: OrganizationNotifier
  ) {}

  /**
   * Creates the invitation, or replaces the link on the pending one for the same address (a resend), and queues the
   * email in the same transaction. Whether the address has an account is never consulted or revealed.
   */
  async issue(
    tx: Prisma.TransactionClient,
    org: Organization,
    emailInput: string,
    role: MemberRole,
    inviter: { id: string; displayName: string }
  ): Promise<OrganizationInvitation> {
    const email = normalizeEmail(emailInput);
    const sentToday = await tx.organizationInvitation.count({
      where: { invitedById: inviter.id, lastSentAt: { gte: new Date(Date.now() - 86_400_000) } }
    });
    if (sentToday >= L.invitationsPerDay)
      throw AppError.tooManyRequests(
        3600,
        "You have sent many invitations today. Try again tomorrow."
      );

    const existingMember = await tx.organizationMember.findFirst({
      where: { organizationId: org.id, status: "ACTIVE", user: { email } },
      select: { id: true }
    });
    if (existingMember)
      throw AppError.conflict(
        "ALREADY_MEMBER",
        "That person already belongs to this organization."
      );

    const raw = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + L.invitationTtlDays * 86_400_000);
    const pending = await tx.organizationInvitation.findFirst({
      where: { organizationId: org.id, email, status: "PENDING" }
    });
    let invitation: OrganizationInvitation;
    if (pending) {
      if (Date.now() - pending.lastSentAt.getTime() < RESEND_COOLDOWN_MS)
        throw AppError.conflict(
          "RESEND_TOO_SOON",
          "An invitation was sent a moment ago. Wait a minute before sending another."
        );
      invitation = await tx.organizationInvitation.update({
        where: { id: pending.id },
        data: {
          tokenHash: sha256(raw),
          role,
          expiresAt,
          invitedById: inviter.id,
          sentCount: { increment: 1 },
          lastSentAt: new Date()
        }
      });
    } else {
      invitation = await tx.organizationInvitation.create({
        data: {
          organizationId: org.id,
          email,
          role,
          tokenHash: sha256(raw),
          invitedById: inviter.id,
          expiresAt
        }
      });
    }
    await this.outbox.enqueue(tx, {
      kind: "ORGANIZATION_INVITATION",
      userId: null,
      toEmail: email,
      payload: {
        token: raw,
        invitationId: invitation.id,
        organizationName: org.name,
        inviterName: inviter.displayName,
        role
      },
      dedupeKey: `org-invitation:${invitation.id}:${invitation.sentCount}`
    });
    await this.audit.record(
      {
        actorId: inviter.id,
        action: pending ? "organization.invitation_resent" : "organization.invitation_sent",
        entityType: "OrganizationInvitation",
        entityId: invitation.id,
        // The address is not written to the audit log: it names the organization, the role and the invitation.
        metadata: { organizationId: org.id, role }
      },
      tx
    );
    return invitation;
  }

  async invite(user: AuthUser, slug: string, dto: InviteDto): Promise<InvitationDto> {
    const { org } = await this.access.manager(user, slug);
    const invitation = await this.prisma.$transaction((tx) =>
      this.issue(tx, org, dto.email, dto.role, user)
    );
    return toInvitationDto(invitation);
  }

  async list(user: AuthUser, slug: string): Promise<InvitationDto[]> {
    const { org } = await this.access.manager(user, slug);
    const rows = await this.prisma.organizationInvitation.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return rows.map(toInvitationDto);
  }

  async resend(user: AuthUser, slug: string, id: string): Promise<InvitationDto> {
    const { org } = await this.access.manager(user, slug);
    const invitation = await this.prisma.$transaction(async (tx) => {
      const current = await tx.organizationInvitation.findFirst({
        where: { id, organizationId: org.id, status: "PENDING" }
      });
      if (!current) throw AppError.notFound("We could not find a pending invitation.");
      return this.issue(tx, org, current.email, current.role as MemberRole, user);
    });
    return toInvitationDto(invitation);
  }

  async revoke(user: AuthUser, slug: string, id: string): Promise<void> {
    const { org } = await this.access.manager(user, slug);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.organizationInvitation.updateMany({
        where: { id, organizationId: org.id, status: "PENDING" },
        data: { status: "REVOKED", revokedById: user.id, respondedAt: new Date() }
      });
      if (done.count === 0) throw AppError.notFound("We could not find a pending invitation.");
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.invitation_revoked",
          entityType: "OrganizationInvitation",
          entityId: id,
          metadata: { organizationId: org.id }
        },
        tx
      );
    });
  }

  /**
   * Looks at a link without using it, so the page can say what is being offered. Anyone holding the secret link learns
   * the organization's name and a masked hint of the address; anyone without it learns nothing.
   */
  async inspect(token: string) {
    if (!TOKEN_FORMAT.test(token)) return { state: "invalid" as const };
    const inv = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: true }
    });
    if (!inv || inv.status !== "PENDING") return { state: "invalid" as const };
    if (inv.expiresAt <= new Date()) return { state: "expired" as const };
    return {
      state: "valid" as const,
      organization: toBadge(inv.organization),
      role: inv.role as MemberRole,
      roleLabel: MEMBER_ROLE_INFO[inv.role as MemberRole].label,
      emailHint: maskEmail(inv.email)
    };
  }

  async accept(user: AuthUser, token: string) {
    assertVerifiedEmail(user);
    const hash = sha256(token);
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.organizationInvitation.findUnique({
        where: { tokenHash: hash },
        include: { organization: true }
      });
      if (!inv || inv.status !== "PENDING" || !TOKEN_FORMAT.test(token)) throw this.invalid();
      if (inv.expiresAt <= new Date())
        throw AppError.badRequest(
          "INVITATION_EXPIRED",
          "This invitation has expired. Ask for a new one."
        );
      // The invitation belongs to one address. A different account is told so, and nothing is consumed.
      if (inv.email !== normalizeEmail(user.email))
        throw AppError.forbidden(
          "This invitation was sent to a different email address. Sign in with that address, or ask for a new invitation.",
          "INVITATION_ADDRESS_MISMATCH"
        );
      // A suspended or revoked organization takes no new members. The invitation is left pending (this throws before
      // anything is claimed), so it works again if staff reinstate the organization. An organization that staff
      // created and has not yet verified may still welcome its first representative.
      if (
        inv.organization.status === "SUSPENDED" ||
        inv.organization.verificationStatus === "REVOKED"
      )
        throw AppError.conflict(
          inv.organization.status === "SUSPENDED"
            ? "ORGANIZATION_SUSPENDED"
            : "ORGANIZATION_NOT_VERIFIED",
          inv.organization.status === "SUSPENDED"
            ? "This organization is suspended by Sidewalk staff, so it cannot take on new members right now."
            : "This organization's verification was withdrawn, so it cannot take on new members."
        );
      const claimed = await tx.organizationInvitation.updateMany({
        where: { id: inv.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedById: user.id, respondedAt: new Date() }
      });
      if (claimed.count === 0) throw this.invalid();
      if (await this.access.membership(user.id, inv.organizationId, tx))
        throw AppError.conflict("ALREADY_MEMBER", "You already belong to this organization.");
      await tx.organizationMember.create({
        data: {
          organizationId: inv.organizationId,
          userId: user.id,
          role: inv.role,
          addedById: inv.invitedById
        }
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.invitation_accepted",
          entityType: "OrganizationInvitation",
          entityId: inv.id,
          metadata: { organizationId: inv.organizationId, role: inv.role }
        },
        tx
      );
      await this.notifier.tell(tx, inv.invitedById, user.id, {
        title: `${user.displayName} joined ${inv.organization.name}`,
        body: `They accepted your invitation as ${MEMBER_ROLE_INFO[inv.role as MemberRole].label.toLowerCase()}.`,
        url: `/organizations/${inv.organization.slug}/team`,
        dedupeKey: `org-invitation-accepted:${inv.id}`
      });
      return { organization: toBadge(inv.organization), role: inv.role as MemberRole };
    });
  }

  async decline(user: AuthUser, token: string): Promise<void> {
    assertVerifiedEmail(user);
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.organizationInvitation.findUnique({
        where: { tokenHash: sha256(token) }
      });
      if (!inv || inv.status !== "PENDING" || !TOKEN_FORMAT.test(token)) throw this.invalid();
      if (inv.email !== normalizeEmail(user.email))
        throw AppError.forbidden(
          "This invitation was sent to a different email address.",
          "INVITATION_ADDRESS_MISMATCH"
        );
      await tx.organizationInvitation.updateMany({
        where: { id: inv.id, status: "PENDING" },
        data: { status: "DECLINED", acceptedById: null, respondedAt: new Date() }
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.invitation_declined",
          entityType: "OrganizationInvitation",
          entityId: inv.id,
          metadata: { organizationId: inv.organizationId }
        },
        tx
      );
    });
  }

  private invalid() {
    return AppError.badRequest(
      "INVITATION_INVALID",
      "This invitation is not valid. It may have been used, withdrawn, or replaced by a newer one."
    );
  }
}
