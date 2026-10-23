import { Injectable } from "@nestjs/common";
import type { NotificationDto, NotificationPreferencesDto, Paginated } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { paginate } from "../common/utils/pagination";
import { OutboxService, wantsEmail } from "../email/outbox.service";
import type { NotificationType, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface ReportEvent {
  reportId: string;
  /** Who did it. They are never notified about their own action. */
  actorId: string | null;
  type: NotificationType;
  /** Deterministic per event ("status:<id>"). The same event can produce each person's notification only once. */
  dedupeKey: string;
  /** Public, safe text only. Never moderation notes or personal data. */
  title: string;
  body: string;
}

export interface DirectEvent extends Omit<ReportEvent, "reportId"> {
  userId: string;
  reportId: string;
  url: string;
}

const toDto = (n: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  url: n.url,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString()
});

/**
 * In-app notifications and the emails that mirror them.
 *
 * Producers call `notifyReport` / `notifyUser` with the transaction of the event they describe. Notification rows
 * and outbox rows then commit with the event or not at all, so nothing is announced that did not happen and nothing
 * that happened is silently dropped. The email itself is only ever sent later, by the worker, from committed rows.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  // ───────────────────────────── producing ─────────────────────────────

  /** Tells the reporter and everyone following the report, except the person who acted. */
  async notifyReport(tx: Prisma.TransactionClient, event: ReportEvent): Promise<void> {
    const report = await tx.report.findUniqueOrThrow({
      where: { id: event.reportId },
      select: {
        reporterId: true,
        reference: true,
        moderationState: true,
        followers: { select: { userId: true } }
      }
    });
    const audience = new Set<string>([report.reporterId]);
    // Followers hear about public activity only. A hidden report is between its owner and the moderators.
    if (report.moderationState === "VISIBLE")
      for (const f of report.followers) audience.add(f.userId);
    if (event.actorId) audience.delete(event.actorId);
    await this.deliver(tx, [...audience], { ...event, url: `/issues/${report.reference}` });
  }

  /** Tells one specific person (for example the author of moderated content). */
  async notifyUser(tx: Prisma.TransactionClient, event: DirectEvent): Promise<void> {
    if (event.actorId && event.actorId === event.userId) return;
    await this.deliver(tx, [event.userId], event);
  }

  private async deliver(
    tx: Prisma.TransactionClient,
    userIds: string[],
    event: Omit<ReportEvent, "reportId"> & { reportId: string; url: string }
  ): Promise<void> {
    if (userIds.length === 0) return;
    const users = await tx.user.findMany({
      where: { id: { in: userIds }, status: "ACTIVE" },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        notifyEmailReportUpdates: true,
        notifyEmailComments: true,
        notifyEmailModeration: true
      }
    });
    if (users.length === 0) return;

    // Who already has this exact event? A retried transaction must not notify them again.
    const already = new Set(
      (
        await tx.notification.findMany({
          where: { dedupeKey: event.dedupeKey, userId: { in: users.map((u) => u.id) } },
          select: { userId: true }
        })
      ).map((n) => n.userId)
    );
    const fresh = users.filter((u) => !already.has(u.id));
    if (fresh.length === 0) return;

    await tx.notification.createMany({
      data: fresh.map((u) => ({
        userId: u.id,
        type: event.type,
        reportId: event.reportId,
        title: event.title,
        body: event.body,
        url: event.url,
        dedupeKey: event.dedupeKey
      })),
      skipDuplicates: true
    });
    const created = await tx.notification.findMany({
      where: { dedupeKey: event.dedupeKey, userId: { in: fresh.map((u) => u.id) } },
      select: { id: true, userId: true }
    });
    const byUser = new Map(created.map((n) => [n.userId, n.id]));

    for (const u of fresh) {
      const notificationId = byUser.get(u.id);
      // Email only confirmed addresses, only for people who have not opted out of this kind of update.
      if (!notificationId || !u.emailVerifiedAt || !wantsEmail(u, event.type)) continue;
      await this.outbox.enqueue(tx, {
        kind: "NOTIFICATION",
        userId: u.id,
        toEmail: u.email,
        payload: { notificationId },
        dedupeKey: `notification:${notificationId}`
      });
    }
  }

  // ───────────────────────────── reading ─────────────────────────────

  async list(
    userId: string,
    page: number,
    pageSize: number,
    unreadOnly: boolean
  ): Promise<Paginated<NotificationDto> & { unread: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {})
    };
    const [total, rows, unread] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } })
    ]);
    return { ...paginate(rows.map(toDto), total, page, pageSize), unread };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Always scoped to the caller: someone else's notification is simply "not found". */
  async setRead(userId: string, id: string, read: boolean): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: read ? new Date() : null }
    });
    if (result.count === 0) throw AppError.notFound("We could not find that notification.");
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    });
    return result.count;
  }

  // ───────────────────────────── email preferences ─────────────────────────────

  async preferences(userId: string): Promise<NotificationPreferencesDto> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        notifyEmailReportUpdates: true,
        notifyEmailComments: true,
        notifyEmailModeration: true
      }
    });
    return {
      reportUpdates: u.notifyEmailReportUpdates,
      comments: u.notifyEmailComments,
      moderation: u.notifyEmailModeration
    };
  }

  async updatePreferences(
    userId: string,
    data: Partial<NotificationPreferencesDto>
  ): Promise<NotificationPreferencesDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        notifyEmailReportUpdates: data.reportUpdates,
        notifyEmailComments: data.comments,
        notifyEmailModeration: data.moderation
      }
    });
    return this.preferences(userId);
  }
}
