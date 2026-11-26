import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { lockAdminChanges } from "../common/admin-lock";
import { AppError } from "../common/app-error";
import { cleanLine } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import { AuthTokensService } from "../auth/auth-tokens.service";
import { AuthService } from "../auth/auth.service";
import { OutboxService } from "../email/outbox.service";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly tokens: AuthTokensService,
    private readonly outbox: OutboxService
  ) {}

  async updateProfile(userId: string, data: { displayName: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { displayName: cleanLine(data.displayName) },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true
      }
    });
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepRefreshHash?: string
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw AppError.badRequest(
        "INVALID_CURRENT_PASSWORD",
        "Your current password is not correct.",
        [{ field: "currentPassword", message: "Your current password is not correct." }]
      );
    }
    const weakness = this.passwords.weakness(newPassword, user.email);
    if (weakness)
      throw AppError.badRequest("WEAK_PASSWORD", weakness, [
        { field: "newPassword", message: weakness }
      ]);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Changing a password signs out every other device.
      await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(keepRefreshHash ? { tokenHash: { not: keepRefreshHash } } : {})
        },
        data: { revokedAt: new Date() }
      });
      // A password reset link requested earlier must not outlive the change.
      await this.tokens.revokeAll(tx, userId, "PASSWORD_RESET");
      await this.outbox.enqueue(tx, {
        kind: "PASSWORD_CHANGED",
        userId,
        toEmail: user.email,
        payload: {}
      });
      await this.audit.record(
        { actorId: userId, action: "user.password_changed", entityType: "User", entityId: userId },
        tx
      );
    });
  }

  listSessions(userId: string, currentHash?: string) {
    return this.prisma.session
      .findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: "desc" },
        select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, tokenHash: true }
      })
      .then((rows) =>
        rows.map((s) => ({
          id: s.id,
          userAgent: s.userAgent,
          createdAt: s.createdAt.toISOString(),
          lastUsedAt: s.lastUsedAt.toISOString(),
          current: s.tokenHash === currentHash
        }))
      );
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (result.count === 0) throw AppError.notFound("That session was not found.");
  }

  async revokeOtherSessions(userId: string, keepHash?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(keepHash ? { tokenHash: { not: keepHash } } : {}) },
      data: { revokedAt: new Date() }
    });
  }

  /**
   * Account deletion anonymises rather than erases: the person's data is wiped and every session ends,
   * but reports and comments stay so that public accountability history is not rewritten.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw AppError.badRequest("INVALID_CURRENT_PASSWORD", "Your password is not correct.", [
        { field: "password", message: "Your password is not correct." }
      ]);
    }
    const unusable = await this.passwords.hash(randomUUID());
    await this.prisma.$transaction(async (tx) => {
      await lockAdminChanges(tx);
      const now = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { role: true }
      });
      if (now.role === "ADMIN") {
        const otherAdmins = await tx.user.count({
          where: { role: "ADMIN", status: "ACTIVE", id: { not: userId } }
        });
        if (otherAdmins === 0)
          throw AppError.conflict(
            "LAST_ADMIN",
            "You are the only administrator. Promote someone else before deleting this account."
          );
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          displayName: "Former resident",
          passwordHash: unusable,
          status: "DELETED",
          role: "CITIZEN",
          deletedAt: new Date()
        }
      });
      await tx.report.updateMany({
        where: { reporterId: userId },
        data: { showReporterName: false }
      });
      // Personal data that is not part of the public record goes with the account: notifications, follows,
      // links in flight, and any email still waiting to be sent (its address and content are erased).
      await tx.notification.deleteMany({ where: { userId } });
      await tx.reportFollow.deleteMany({ where: { userId } });
      await tx.authToken.deleteMany({ where: { userId } });
      await tx.emailOutbox.updateMany({
        where: { userId, status: { in: ["PENDING", "FAILED", "SENDING"] } },
        data: { status: "SKIPPED", payloadCiphertext: null, lastError: "account deleted" }
      });
      await tx.emailOutbox.updateMany({
        where: { userId },
        data: { toEmail: "deleted@deleted.invalid", payloadCiphertext: null }
      });
      await this.auth.revokeAllForUser(userId, tx);
      await this.audit.record(
        { actorId: userId, action: "user.deleted", entityType: "User", entityId: userId },
        tx
      );
    });
  }
}
