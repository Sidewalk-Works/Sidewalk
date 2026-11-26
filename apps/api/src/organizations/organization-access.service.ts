import { Injectable } from "@nestjs/common";
import { MEMBER_ROLE_INFO, type MemberRole } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertVerifiedEmail, isStaff } from "../common/auth-types";
import type {
  Organization,
  OrganizationMember,
  Prisma,
  PrismaClient
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Db = PrismaClient | Prisma.TransactionClient | PrismaService;

/**
 * Who may act for an organization, decided from the database on every request.
 *
 * Nothing about an organization is carried in the session or the access token: a membership that was revoked, an
 * organization that was suspended, or a verification that was withdrawn stops working on the very next request, even
 * for a person whose sign-in is still valid. Membership of an organization never grants Sidewalk staff powers, and
 * Sidewalk staff powers never make someone a member.
 */
@Injectable()
export class OrganizationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  find(slug: string, db: Db = this.prisma): Promise<Organization | null> {
    return db.organization.findUnique({ where: { slug } });
  }

  /** The organization, or "not found" for anyone who may not even know it exists (an unlisted profile). */
  async requireVisible(slug: string, viewer: AuthUser | undefined, db: Db = this.prisma) {
    const org = await this.find(slug, db);
    if (!org) throw AppError.notFound("We could not find that organization.");
    if (org.publicProfile) return org;
    if (viewer && (isStaff(viewer) || (await this.membership(viewer.id, org.id, db)))) return org;
    throw AppError.notFound("We could not find that organization.");
  }

  /** The person's current, active membership, or null. A revoked membership is not a membership. */
  membership(
    userId: string,
    organizationId: string,
    db: Db = this.prisma
  ): Promise<OrganizationMember | null> {
    return db.organizationMember.findFirst({
      where: { userId, organizationId, status: "ACTIVE" }
    });
  }

  /** Why an organization cannot act right now, in words, or null if it can. */
  orgBlocker(org: Pick<Organization, "status" | "verificationStatus">): string | null {
    if (org.status === "SUSPENDED")
      return "This organization is suspended by Sidewalk staff, so it cannot respond to reports.";
    if (org.verificationStatus === "UNVERIFIED")
      return "This organization has not been verified by Sidewalk staff, so it cannot publish official responses.";
    if (org.verificationStatus === "REVOKED")
      return "This organization's verification was withdrawn, so it cannot publish official responses.";
    return null;
  }

  /**
   * May this person publish official responses for the organization right now? Requires, all at once: a confirmed
   * email address, an active membership whose role allows responding, an active organization, and a verified one.
   */
  async responder(
    user: AuthUser,
    slug: string,
    db: Db = this.prisma
  ): Promise<{ org: Organization; member: OrganizationMember }> {
    assertVerifiedEmail(user);
    const org = await this.find(slug, db);
    // Someone with no connection to the organization is told nothing about it beyond "not found".
    const member = org ? await this.membership(user.id, org.id, db) : null;
    if (!org || !member)
      throw AppError.forbidden(
        "You are not authorized to respond on behalf of that organization.",
        "NOT_ORGANIZATION_MEMBER"
      );
    if (!MEMBER_ROLE_INFO[member.role as MemberRole].canRespond)
      throw AppError.forbidden(
        "Your role in this organization does not allow publishing responses.",
        "ROLE_CANNOT_RESPOND"
      );
    const blocker = this.orgBlocker(org);
    if (blocker)
      throw AppError.conflict(
        org.status === "SUSPENDED" ? "ORGANIZATION_SUSPENDED" : "ORGANIZATION_NOT_VERIFIED",
        blocker
      );
    return { org, member };
  }

  /**
   * May this person manage the organization's members and invitations? Sidewalk administrators always may (it is
   * their job to investigate and repair). An organization administrator may only while the organization is verified
   * and active: before that, there is nothing to manage but the application.
   */
  async manager(
    user: AuthUser,
    slug: string,
    db: Db = this.prisma
  ): Promise<{ org: Organization; via: "STAFF" | "MEMBER"; member: OrganizationMember | null }> {
    assertVerifiedEmail(user);
    const org = await this.find(slug, db);
    if (!org) throw AppError.notFound("We could not find that organization.");
    if (user.role === "ADMIN") return { org, via: "STAFF", member: null };
    const member = await this.membership(user.id, org.id, db);
    if (!member || !MEMBER_ROLE_INFO[member.role as MemberRole].canManage)
      throw AppError.forbidden(
        "Only an administrator of this organization can do that.",
        "NOT_ORGANIZATION_ADMIN"
      );
    const blocker = this.orgBlocker(org);
    if (blocker)
      throw AppError.conflict(
        org.status === "SUSPENDED" ? "ORGANIZATION_SUSPENDED" : "ORGANIZATION_NOT_VERIFIED",
        blocker
      );
    return { org, via: "MEMBER", member };
  }

  /**
   * Is this person an active member of the organization? Used to keep Sidewalk staff from deciding on, or verifying
   * the work of, an organization they belong to.
   */
  async isMember(userId: string, organizationId: string, db: Db = this.prisma): Promise<boolean> {
    return (await this.membership(userId, organizationId, db)) !== null;
  }
}
