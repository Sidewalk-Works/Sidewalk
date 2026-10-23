import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { TOKEN_TTL } from "@sidewalk/contracts";
import { AppError } from "../common/app-error";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthTokenPurpose, Prisma } from "../generated/prisma/client";

export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  EMAIL_VERIFICATION: TOKEN_TTL.emailVerificationHours * 3_600_000,
  PASSWORD_RESET: TOKEN_TTL.passwordResetMinutes * 60_000
};

/**
 * One-time tokens for email verification and password reset.
 *  - 256 random bits, so guessing is not a realistic attack; only the SHA-256 is stored, so a database leak
 *    does not hand out working links.
 *  - Issuing a new token revokes the account's earlier unused ones of the same purpose.
 *  - Redeeming claims the token with a single conditional UPDATE, which makes "unused, not revoked, not expired"
 *    and "mark as used" one atomic step. Two simultaneous attempts cannot both win.
 */
@Injectable()
export class AuthTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    tx: Prisma.TransactionClient,
    user: { id: string; email: string },
    purpose: AuthTokenPurpose
  ): Promise<string> {
    await tx.authToken.updateMany({
      where: { userId: user.id, purpose, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    const raw = randomBytes(32).toString("base64url");
    await tx.authToken.create({
      data: {
        userId: user.id,
        purpose,
        tokenHash: sha256(raw),
        email: user.email,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose])
      }
    });
    return raw;
  }

  /** Looks at a token without using it (so a form can warn before the user types a new password). */
  async inspect(
    purpose: AuthTokenPurpose,
    raw: string
  ): Promise<{ state: "valid"; email: string; userId: string } | { state: "expired" | "invalid" }> {
    if (!TOKEN_FORMAT.test(raw)) return { state: "invalid" };
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.revokedAt) return { state: "invalid" };
    if (row.expiresAt <= new Date()) return { state: "expired" };
    return { state: "valid", email: row.email, userId: row.userId };
  }

  /**
   * Redeems the token inside the caller's transaction, so whatever the token authorises (verifying the address,
   * changing the password) commits together with the token being spent, or neither happens.
   */
  async consume(
    tx: Prisma.TransactionClient,
    purpose: AuthTokenPurpose,
    raw: string
  ): Promise<{ userId: string; email: string }> {
    if (!TOKEN_FORMAT.test(raw)) throw this.invalid();
    const hash = sha256(raw);
    const claimed = await tx.authToken.updateMany({
      where: {
        tokenHash: hash,
        purpose,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { usedAt: new Date() }
    });
    const row = await tx.authToken.findUnique({ where: { tokenHash: hash } });
    if (claimed.count === 1 && row) return { userId: row.userId, email: row.email };
    if (
      row &&
      row.purpose === purpose &&
      !row.usedAt &&
      !row.revokedAt &&
      row.expiresAt <= new Date()
    )
      throw this.expired();
    throw this.invalid();
  }

  /** After a password change or reset, no earlier reset link may still work. */
  revokeAll(
    tx: Prisma.TransactionClient,
    userId: string,
    purpose: AuthTokenPurpose
  ): Promise<unknown> {
    return tx.authToken.updateMany({
      where: { userId, purpose, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private invalid() {
    return AppError.badRequest(
      "TOKEN_INVALID",
      "This link is not valid. It may have been used already, or replaced by a newer one."
    );
  }
  private expired() {
    return AppError.badRequest("TOKEN_EXPIRED", "This link has expired. Request a new one.");
  }
}
