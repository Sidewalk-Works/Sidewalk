import { Injectable } from "@nestjs/common";
import { AppError } from "../common/app-error";
import type { AuthUser } from "../common/auth-types";
import { cleanLine, normalizeEmail } from "../common/utils/text";
import { AuditService } from "../audit/audit.service";
import { OutboxService } from "../email/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthTokensService } from "./auth-tokens.service";
import { AuthService } from "./auth.service";
import type { RegisterDto } from "./dto";
import { PasswordService } from "./password.service";

/** No account may be sent more than this many security emails of one kind in an hour, whoever asks. */
const HOURLY_CAP = 3;
/** And at least this long between two verification emails to the same account. */
const RESEND_COOLDOWN_MS = 60_000;

export type ResendOutcome = "queued" | "cooldown" | "ignored";

/**
 * Email verification and password recovery.
 *
 * Every public entry point answers the same way whether or not the account exists, and the work done for a
 * request with no account is only a cheap lookup. Messages are written to the outbox inside the same transaction
 * as the token that authorises them, so a link can never be emailed without being valid, nor valid without
 * being emailed.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokensService,
    private readonly outbox: OutboxService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly audit: AuditService
  ) {}

  // ───────────────────────────── registration ─────────────────────────────

  /**
   * Creates the account and queues the verification email. It deliberately does not sign anyone in, and it
   * answers identically when the address is already registered (that person is emailed instead). A stranger
   * therefore cannot use the sign-up form to find out who has an account.
   */
  async register(dto: RegisterDto): Promise<void> {
    const email = normalizeEmail(dto.email);
    const weakness = this.passwords.weakness(dto.password, email);
    if (weakness)
      throw AppError.badRequest("WEAK_PASSWORD", weakness, [
        { field: "password", message: weakness }
      ]);

    // Hashing happens for every request, so new and existing addresses take about the same time.
    const passwordHash = await this.passwords.hash(dto.password);
    const displayName = cleanLine(dto.displayName);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true }
    });
    if (existing) return this.tellExistingOwner(existing.id, existing.status, email);

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, passwordHash, displayName } });
        const token = await this.tokens.issue(tx, user, "EMAIL_VERIFICATION");
        await this.outbox.enqueue(tx, {
          kind: "EMAIL_VERIFICATION",
          userId: user.id,
          toEmail: email,
          payload: { token }
        });
      });
    } catch (e) {
      // Lost a race with another registration of the same address: the winner exists now.
      if ((e as { code?: string }).code !== "P2002") throw e;
      const winner = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, status: true }
      });
      if (winner) await this.tellExistingOwner(winner.id, winner.status, email);
    }
  }

  private async tellExistingOwner(userId: string, status: string, email: string): Promise<void> {
    if (status !== "ACTIVE") return;
    if ((await this.outbox.recentCount(userId, ["ACCOUNT_EXISTS"])) >= 2) return;
    await this.prisma.$transaction((tx) =>
      this.outbox.enqueue(tx, { kind: "ACCOUNT_EXISTS", userId, toEmail: email, payload: {} })
    );
  }

  // ───────────────────────────── email verification ─────────────────────────────

  /**
   * Sends a fresh verification link. Callers get the same answer for any address. A signed-in user asking about
   * their own account additionally learns whether they hit the cooldown (nothing about anyone else leaks).
   */
  async resendVerification(
    email: string | undefined,
    current: AuthUser | undefined
  ): Promise<ResendOutcome> {
    const target =
      current && (!email || normalizeEmail(email) === current.email)
        ? await this.prisma.user.findUnique({ where: { id: current.id } })
        : email
          ? await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
          : null;
    if (!target || target.status !== "ACTIVE" || target.emailVerifiedAt) return "ignored";

    const recent = await this.prisma.emailOutbox.findFirst({
      where: { userId: target.id, kind: "EMAIL_VERIFICATION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) return "cooldown";
    if ((await this.outbox.recentCount(target.id, ["EMAIL_VERIFICATION"])) >= HOURLY_CAP)
      return "cooldown";

    await this.prisma.$transaction(async (tx) => {
      const token = await this.tokens.issue(tx, target, "EMAIL_VERIFICATION");
      await this.outbox.enqueue(tx, {
        kind: "EMAIL_VERIFICATION",
        userId: target.id,
        toEmail: target.email,
        payload: { token }
      });
    });
    return "queued";
  }

  async confirmEmail(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claim = await this.tokens.consume(tx, "EMAIL_VERIFICATION", token);
      const user = await tx.user.findUnique({ where: { id: claim.userId } });
      // The token proves control of the address it was sent to. If the account no longer has that address, it proves nothing.
      if (!user || user.status !== "ACTIVE" || user.email !== claim.email) {
        throw AppError.badRequest(
          "TOKEN_INVALID",
          "This link is not valid. It may have been used already, or replaced by a newer one."
        );
      }
      if (!user.emailVerifiedAt)
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    });
  }

  // ───────────────────────────── password reset ─────────────────────────────

  /** Always completes quietly. The caller can never tell whether an email was sent. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || user.status !== "ACTIVE") return;
    if ((await this.outbox.recentCount(user.id, ["PASSWORD_RESET"])) >= HOURLY_CAP) return;
    await this.prisma.$transaction(async (tx) => {
      const token = await this.tokens.issue(tx, user, "PASSWORD_RESET");
      await this.outbox.enqueue(tx, {
        kind: "PASSWORD_RESET",
        userId: user.id,
        toEmail: user.email,
        payload: { token }
      });
    });
  }

  async checkResetToken(
    token: string
  ): Promise<{ valid: boolean; reason?: "expired" | "invalid" }> {
    const result = await this.tokens.inspect("PASSWORD_RESET", token);
    return result.state === "valid" ? { valid: true } : { valid: false, reason: result.state };
  }

  /**
   * Sets a new password with a reset link. In one transaction: the link is spent, the password replaced, every
   * session revoked (and with them every access token), other reset links cancelled, and the confirmation email
   * queued. The user is NOT signed in afterwards: whoever holds the inbox has proved only that, and making them
   * sign in with the new password shows it works.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const peek = await this.tokens.inspect("PASSWORD_RESET", token);
    if (peek.state !== "valid") {
      throw peek.state === "expired"
        ? AppError.badRequest("TOKEN_EXPIRED", "This link has expired. Request a new one.")
        : AppError.badRequest(
            "TOKEN_INVALID",
            "This link is not valid. It may have been used already, or replaced by a newer one."
          );
    }
    // Checked before the link is spent, so a weak password does not use up a good link.
    const weakness = this.passwords.weakness(newPassword, peek.email);
    if (weakness)
      throw AppError.badRequest("WEAK_PASSWORD", weakness, [
        { field: "password", message: weakness }
      ]);
    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      const claim = await this.tokens.consume(tx, "PASSWORD_RESET", token);
      const user = await tx.user.findUnique({ where: { id: claim.userId } });
      if (!user || user.status !== "ACTIVE" || user.email !== claim.email) {
        throw AppError.badRequest(
          "TOKEN_INVALID",
          "This link is not valid. It may have been used already, or replaced by a newer one."
        );
      }
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Receiving the link at this address is proof of control, same as the verification link.
          emailVerifiedAt: user.emailVerifiedAt ?? new Date()
        }
      });
      await this.auth.revokeAllForUser(user.id, tx);
      await this.tokens.revokeAll(tx, user.id, "PASSWORD_RESET");
      await this.audit.record(
        { actorId: user.id, action: "user.password_reset", entityType: "User", entityId: user.id },
        tx
      );
      await this.outbox.enqueue(tx, {
        kind: "PASSWORD_CHANGED",
        userId: user.id,
        toEmail: user.email,
        payload: {}
      });
    });
  }
}
