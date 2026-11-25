import { Injectable } from "@nestjs/common";
import type { MemberRole } from "@sidewalk/contracts";
import type { NotificationType, Prisma } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";

export interface OrgNews {
  title: string;
  body: string;
  /** Relative web path. */
  url: string;
  /** Deterministic per event, so a retried transaction cannot notify anyone twice. */
  dedupeKey: string;
  type?: NotificationType;
  reportId?: string | null;
}

/**
 * Who hears about organization events. Every method takes the transaction of the event it describes, so the
 * notification and its email commit with the event or not at all, and nobody is told about the action they took.
 */
@Injectable()
export class OrganizationNotifier {
  constructor(private readonly notifications: NotificationsService) {}

  tell(tx: Prisma.TransactionClient, userId: string, actorId: string | null, news: OrgNews) {
    return this.notifications.notifyUser(tx, {
      userId,
      actorId,
      reportId: news.reportId ?? null,
      type: news.type ?? "ORGANIZATION",
      dedupeKey: news.dedupeKey,
      title: news.title,
      body: news.body,
      url: news.url
    });
  }

  /** The organization's current administrators and (optionally) representatives. Revoked members hear nothing. */
  async tellMembers(
    tx: Prisma.TransactionClient,
    organizationId: string,
    roles: MemberRole[],
    actorId: string | null,
    news: OrgNews
  ): Promise<void> {
    const members = await tx.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", role: { in: roles } },
      select: { userId: true }
    });
    for (const m of members) await this.tell(tx, m.userId, actorId, news);
  }

  /**
   * Members who can act on a report because their organization is connected to it or claimed its resolution. Used when
   * a report is reopened or its resolution verified, so an organization learns what happened to its claim.
   */
  async tellReportOrganizations(
    tx: Prisma.TransactionClient,
    reportId: string,
    actorId: string | null,
    news: OrgNews & { type: NotificationType },
    alsoOrganizationIds: string[] = []
  ): Promise<void> {
    const connected = await tx.reportOrganization.findMany({
      where: { reportId, status: { in: ["ACTIVE", "PROPOSED", "OUTSIDE_REMIT"] } },
      select: { organizationId: true }
    });
    const ids = [...connected.map((r) => r.organizationId), ...alsoOrganizationIds];
    for (const id of new Set(ids))
      await this.tellMembers(tx, id, ["ADMIN", "REPRESENTATIVE"], actorId, { ...news, reportId });
  }
}
