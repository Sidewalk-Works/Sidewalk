import { Injectable } from "@nestjs/common";
import { MEMBER_ROLE_INFO, type MemberDto, type MemberRole } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail, isStaff } from "../common/auth-types";
import { cleanLine } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import type { Organization, OrganizationMember, Prisma, User } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationAccessService } from "./organization-access.service";
import { OrganizationNotifier } from "./organization-notifier";

type MemberRow = OrganizationMember & { user: Pick<User, "displayName" | "email"> };

export function toMemberDto(m: MemberRow): MemberDto {
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.displayName,
    role: m.role,
    status: m.status,
    addedAt: m.createdAt.toISOString(),
    revokedAt: m.revokedAt?.toISOString() ?? null,
    revokeReason: m.revokeReason
  };
}

/**
 * Who belongs to an organization. Removal marks the row revoked and keeps it, so the history of who held which role is
 * never rewritten. Because every authorization check reads the membership from the database, removal and demotion apply
 * on the very next request, whatever the person's sign-in still says.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly audit: AuditService,
    private readonly notifier: OrganizationNotifier
  ) {}

  /** Members and staff can see the roster; nobody else can. */
  async list(user: AuthUser, slug: string): Promise<MemberDto[]> {
    const org = await this.access.find(slug);
    if (!org || !(isStaff(user) || (await this.access.membership(user.id, org.id))))
      throw AppError.notFound("We could not find that organization.");
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }]
    });
    return rows.map(toMemberDto);
  }

  /** An organization always keeps an administrator, unless Sidewalk staff are deliberately repairing it. */
  private async assertNotLastAdmin(
    tx: Prisma.TransactionClient,
    org: Organization,
    member: OrganizationMember
  ) {
    if (member.role !== "ADMIN") return;
    const others = await tx.organizationMember.count({
      where: { organizationId: org.id, status: "ACTIVE", role: "ADMIN", id: { not: member.id } }
    });
    if (others === 0)
      throw AppError.conflict(
        "LAST_ADMIN",
        "This is the organization's only administrator. Appoint another administrator first, or ask Sidewalk staff for help."
      );
  }

  async setRole(
    user: AuthUser,
    slug: string,
    memberId: string,
    role: MemberRole
  ): Promise<MemberDto> {
    const { org, via } = await this.access.manager(user, slug);
    const row = await this.prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: org.id, status: "ACTIVE" },
        include: { user: { select: { displayName: true, email: true } } }
      });
      if (!member) throw AppError.notFound("We could not find that member.");
      if (member.role === role) return member;
      if (member.role === "ADMIN" && role !== "ADMIN" && via === "MEMBER")
        await this.assertNotLastAdmin(tx, org, member);
      const done = await tx.organizationMember.updateMany({
        where: { id: member.id, status: "ACTIVE", role: member.role },
        data: { role }
      });
      if (done.count === 0)
        throw AppError.conflict("STALE_STATE", "This member changed. Reload and try again.");
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.member_role_changed",
          entityType: "OrganizationMember",
          entityId: member.id,
          metadata: { organizationId: org.id, from: member.role, to: role, via }
        },
        tx
      );
      await this.notifier.tell(tx, member.userId, user.id, {
        title: `Your role in ${org.name} changed`,
        body: `You are now ${MEMBER_ROLE_INFO[role].label.toLowerCase()}. ${MEMBER_ROLE_INFO[role].meaning}`,
        url: `/organizations/${org.slug}`,
        dedupeKey: `org-role:${member.id}:${role}:${Date.now()}`
      });
      return { ...member, role };
    });
    return toMemberDto(row as MemberRow);
  }

  async revoke(
    user: AuthUser,
    slug: string,
    memberId: string,
    reason: string | undefined
  ): Promise<void> {
    const { org, via } = await this.access.manager(user, slug);
    await this.removeMember(user, org, memberId, reason, via);
  }

  /** Leaving is always allowed, except for an organization's last administrator. */
  async leave(user: AuthUser, slug: string): Promise<void> {
    assertVerifiedEmail(user);
    const org = await this.access.find(slug);
    const member = org ? await this.access.membership(user.id, org.id) : null;
    if (!org || !member) throw AppError.notFound("You do not belong to that organization.");
    await this.removeMember(user, org, member.id, "Left the organization", "MEMBER");
  }

  private async removeMember(
    user: AuthUser,
    org: Organization,
    memberId: string,
    reason: string | undefined,
    via: "STAFF" | "MEMBER"
  ) {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: org.id, status: "ACTIVE" }
      });
      if (!member) throw AppError.notFound("We could not find that member.");
      if (via === "MEMBER") await this.assertNotLastAdmin(tx, org, member);
      const done = await tx.organizationMember.updateMany({
        where: { id: member.id, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedById: user.id,
          revokeReason: reason ? cleanLine(reason).slice(0, 500) : null
        }
      });
      if (done.count === 0)
        throw AppError.conflict("STALE_STATE", "This member changed. Reload and try again.");
      await this.audit.record(
        {
          actorId: user.id,
          action: "organization.member_removed",
          entityType: "OrganizationMember",
          entityId: member.id,
          metadata: {
            organizationId: org.id,
            role: member.role,
            via,
            self: member.userId === user.id
          }
        },
        tx
      );
      await this.notifier.tell(tx, member.userId, user.id, {
        title: `You no longer belong to ${org.name} on Sidewalk`,
        body: "You can no longer respond to reports for this organization. Your past responses stay on the record under your name.",
        url: `/organizations/${org.slug}`,
        dedupeKey: `org-member-removed:${member.id}`
      });
    });
  }
}
