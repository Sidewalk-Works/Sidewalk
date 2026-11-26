import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Prisma } from "../generated/prisma/client";
import { APP_ENV, type AppEnv } from "../config/env";
import { AppError } from "../common/app-error";
import { normalizeEmail } from "../common/utils/text";
import { PrismaService } from "../prisma/prisma.service";
import { LoginBrake } from "./login-brake.service";
import { PasswordService } from "./password.service";
import type { LoginDto } from "./dto";

export interface IssuedTokens {
  access: string;
  refresh: string;
  csrf: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: "CITIZEN" | "MODERATOR" | "ADMIN";
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const REUSE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly brake: LoginBrake,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  async login(
    dto: LoginDto,
    userAgent?: string,
    address?: string
  ): Promise<{ user: SessionUser; tokens: IssuedTokens }> {
    const email = normalizeEmail(dto.email);
    await this.brake.assertAllowed(email, address);

    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { ...this.userSelect, passwordHash: true, status: true }
    });
    const ok = found
      ? await this.passwords.verify(found.passwordHash, dto.password)
      : (await this.passwords.verifyAgainstDummy(dto.password), false);

    if (!found || !ok || found.status !== "ACTIVE") {
      await this.brake.recordFailure(email, address);
      throw AppError.unauthorized("Email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    await this.brake.recordSuccess(email, address);

    await this.prisma.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
    const { passwordHash: _hash, status: _status, ...user } = found;
    void this.purgeOldSessions();
    return { user, tokens: await this.startSession(user, userAgent) };
  }

  /** Rotates the refresh token. Presenting an already-rotated token revokes the whole login chain. */
  async refresh(
    rawToken: string | undefined,
    userAgent?: string
  ): Promise<{ user: SessionUser; tokens: IssuedTokens }> {
    if (!rawToken)
      throw AppError.unauthorized("Your session has expired. Sign in again.", "SESSION_EXPIRED");
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { select: { ...this.userSelect, status: true } } }
    });
    if (!session)
      throw AppError.unauthorized("Your session has expired. Sign in again.", "SESSION_EXPIRED");

    if (session.revokedAt) {
      const recentlyRotated =
        session.replacedById && Date.now() - session.revokedAt.getTime() < REUSE_GRACE_MS;
      // Two tabs refreshing at once is normal; replay of an old token later is not.
      if (!recentlyRotated) await this.revokeFamily(session.familyId);
      throw AppError.unauthorized("Your session has expired. Sign in again.", "SESSION_EXPIRED");
    }
    if (session.expiresAt < new Date() || session.user.status !== "ACTIVE") {
      throw AppError.unauthorized("Your session has expired. Sign in again.", "SESSION_EXPIRED");
    }

    const { status: _status, ...user } = session.user;
    const next = await this.prisma.$transaction(async (tx) => {
      const issued = await this.createSession(tx, user.id, session.familyId, userAgent);
      const claimed = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: issued.sessionId }
      });
      if (claimed.count === 0)
        throw AppError.unauthorized("Your session has expired. Sign in again.", "SESSION_EXPIRED");
      return issued;
    });
    return {
      user,
      tokens: {
        access: this.signAccess(user, session.familyId),
        refresh: next.refresh,
        csrf: randomBytes(24).toString("base64url")
      }
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async revokeAllForUser(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  private async startSession(user: SessionUser, userAgent?: string): Promise<IssuedTokens> {
    const familyId = randomUUID();
    const issued = await this.createSession(this.prisma, user.id, familyId, userAgent);
    return {
      access: this.signAccess(user, familyId),
      refresh: issued.refresh,
      csrf: randomBytes(24).toString("base64url")
    };
  }

  private async createSession(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    familyId: string,
    userAgent?: string
  ): Promise<{ refresh: string; sessionId: string }> {
    const refresh = randomBytes(32).toString("base64url");
    const session = await db.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refresh),
        userAgent: userAgent?.slice(0, 200),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000)
      },
      select: { id: true }
    });
    return { refresh, sessionId: session.id };
  }

  /**
   * The token carries the login family (`fid`). The API only honours it while that family still has a live
   * session, so logout, password change, device revocation and token-reuse detection cut access immediately
   * instead of when the 15-minute token happens to expire.
   */
  signAccess(user: Pick<SessionUser, "id" | "role">, familyId: string): string {
    return jwt.sign({ fid: familyId }, this.env.JWT_ACCESS_SECRET, {
      subject: user.id,
      algorithm: "HS256",
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS
    });
  }

  /** Retention: expired or long-revoked sessions are deleted opportunistically. */
  private async purgeOldSessions(): Promise<void> {
    if (Math.random() > 0.05) return;
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    await this.prisma.session
      .deleteMany({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } })
      .catch(() => undefined);
  }

  private readonly userSelect = {
    id: true,
    email: true,
    displayName: true,
    role: true,
    emailVerifiedAt: true,
    createdAt: true
  } as const;
}
