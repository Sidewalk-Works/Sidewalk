import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { APP_ENV, type AppEnv } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { AppError } from "../app-error";
import type { AuthedRequest } from "../auth-types";
import { ACCESS_COOKIE } from "../cookies";
import { IS_PUBLIC } from "../decorators";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global authentication. The signed access token proves who the caller was; the database decides
 * whether they may still act, so suspensions and role changes take effect on the very next request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass()
    ]);

    const token = this.extractToken(req);
    if (token) {
      const claims = this.verify(token);
      if (claims) {
        const [user, live] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: claims.userId },
            select: {
              id: true,
              email: true,
              displayName: true,
              role: true,
              status: true,
              emailVerifiedAt: true
            }
          }),
          // Logging out, changing the password or revoking a device ends the family, and with it this token.
          this.prisma.session.findFirst({
            where: {
              familyId: claims.familyId,
              userId: claims.userId,
              revokedAt: null,
              expiresAt: { gt: new Date() }
            },
            select: { id: true }
          })
        ]);
        if (user && live && user.status === "ACTIVE") {
          req.user = {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            emailVerified: user.emailVerifiedAt !== null
          };
        }
      }
    }

    if (!req.user && !isPublic) throw AppError.unauthorized();
    return true;
  }

  private extractToken(req: AuthedRequest): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice(7);
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[ACCESS_COOKIE];
  }

  private verify(token: string): { userId: string; familyId: string } | null {
    try {
      const payload = jwt.verify(token, this.env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
      if (
        typeof payload !== "object" ||
        typeof payload.sub !== "string" ||
        typeof payload.fid !== "string"
      )
        return null;
      if (!UUID.test(payload.sub) || !UUID.test(payload.fid)) return null;
      return { userId: payload.sub, familyId: payload.fid };
    } catch {
      return null;
    }
  }
}
