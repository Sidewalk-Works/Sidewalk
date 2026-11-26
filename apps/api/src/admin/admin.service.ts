import { Injectable } from "@nestjs/common";
import { ROLES, type Paginated, type Role } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { type AuthUser, assertAdmin } from "../common/auth-types";
import { paginate } from "../common/utils/pagination";
import { cleanText, likeEscape } from "../common/utils/text";
import { lockAdminChanges } from "../common/admin-lock";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { RateLimitService } from "../ratelimit/rate-limit.service";
import { OutboxService } from "../email/outbox.service";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly outbox: OutboxService,
    private readonly rateLimit: RateLimitService
  ) {}

  async listUsers(actor: AuthUser, q: string | undefined, page: number, pageSize: number) {
    assertAdmin(actor);
    const where: Prisma.UserWhereInput = q?.trim()
      ? {
          OR: [
            { displayName: { contains: likeEscape(q.trim()), mode: "insensitive" } },
            { email: { contains: likeEscape(q.trim()).toLowerCase() } }
          ]
        }
      : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ role: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { reports: true } }
        }
      })
    ]);
    return paginate(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        reportCount: u._count.reports
      })),
      total,
      page,
      pageSize
    );
  }

  async setRole(actor: AuthUser, userId: string, role: Role) {
    assertAdmin(actor);
    if (!ROLES.includes(role)) throw AppError.badRequest("VALIDATION_FAILED", "Unknown role.");
    if (userId === actor.id)
      throw AppError.conflict(
        "SELF_ROLE_CHANGE",
        "You cannot change your own role. Ask another administrator."
      );
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.status === "DELETED")
      throw AppError.notFound("We could not find that user.");
    if (target.role === role) return { id: target.id, role };
    await this.prisma.$transaction(async (tx) => {
      await lockAdminChanges(tx);
      await this.assertStillAdmin(tx, actor.id);
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true }
      });
      if (!current || current.status === "DELETED")
        throw AppError.notFound("We could not find that user.");
      if (current.role === role) return;
      await tx.user.update({ where: { id: userId }, data: { role } });
      await this.audit.record(
        {
          actorId: actor.id,
          action: "user.role_changed",
          entityType: "User",
          entityId: userId,
          metadata: { from: target.role, to: role }
        },
        tx
      );
    });
    return { id: target.id, role };
  }

  async setStatus(actor: AuthUser, userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
    assertAdmin(actor);
    if (userId === actor.id)
      throw AppError.conflict("SELF_SUSPEND", "You cannot suspend your own account.");
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.status === "DELETED")
      throw AppError.notFound("We could not find that user.");
    if (target.role === "ADMIN")
      throw AppError.conflict("ADMIN_PROTECTED", "Demote an administrator before suspending them.");
    if (target.status === status) return { id: target.id, status };
    await this.prisma.$transaction(async (tx) => {
      await lockAdminChanges(tx);
      await this.assertStillAdmin(tx, actor.id);
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true }
      });
      if (!current || current.status === "DELETED")
        throw AppError.notFound("We could not find that user.");
      if (current.role === "ADMIN")
        throw AppError.conflict(
          "ADMIN_PROTECTED",
          "Demote an administrator before suspending them."
        );
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === "SUSPENDED") await this.auth.revokeAllForUser(userId, tx);
      await this.audit.record(
        {
          actorId: actor.id,
          action: status === "SUSPENDED" ? "user.suspended" : "user.reinstated",
          entityType: "User",
          entityId: userId,
          metadata: { reason: cleanText(reason).slice(0, 300) }
        },
        tx
      );
    });
    return { id: target.id, status };
  }

  /** The role was checked when the request arrived; re-check it under the lock in case it changed meanwhile. */
  private async assertStillAdmin(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
    const now = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true, status: true }
    });
    if (now?.role !== "ADMIN" || now.status !== "ACTIVE")
      throw AppError.forbidden("This action is restricted to administrators.");
  }

  /** Delivery health at a glance: how many messages are in each state, and the ones that need attention. */
  async emailOutbox(actor: AuthUser, status: string | undefined, page: number, pageSize: number) {
    assertAdmin(actor);
    const [summary, list, health] = await Promise.all([
      this.outbox.summary(),
      this.outbox.list(status, page, pageSize),
      this.outbox.health()
    ]);
    return {
      summary,
      health: { ...health, rateLimit: this.rateLimit.status() },
      ...paginate(list.items, list.total, page, pageSize)
    };
  }

  async retryEmail(actor: AuthUser, id: string): Promise<void> {
    assertAdmin(actor);
    await this.prisma.$transaction(async (tx) => {
      const before = await this.outbox.retry(id, tx);
      await this.audit.record(
        {
          actorId: actor.id,
          action: "email.retry_requested",
          entityType: "EmailOutbox",
          entityId: id,
          // What state it was in and why it was stuck: enough to review the decision, no address and no content.
          metadata: before
        },
        tx
      );
    });
  }

  async audits(
    actor: AuthUser,
    page: number,
    pageSize: number,
    entityType?: string
  ): Promise<Paginated<unknown>> {
    assertAdmin(actor);
    const where: Prisma.AuditLogWhereInput = entityType ? { entityType } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { displayName: true } } }
      })
    ]);
    return paginate(
      rows.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        metadata: a.metadata,
        actorName: a.actor?.displayName ?? "System",
        createdAt: a.createdAt.toISOString()
      })),
      total,
      page,
      pageSize
    );
  }
}
