import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppError } from "../common/app-error";
import type { AuthedRequest } from "../common/auth-types";
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY, type RateLimitPolicy } from "../common/decorators";
import { APP_ENV, type AppEnv } from "../config/env";
import { rateLimitAddress } from "./address";
import { RateLimitService } from "./rate-limit.service";

/** Applies to every route without its own @RateLimit: generous, to stop floods rather than shape normal use. */
export const DEFAULT_POLICY: RateLimitPolicy = { limit: 300, windowSeconds: 60 };

/**
 * Per-route, per-caller limits. Signed-in users are limited per account, everyone else per client address. The
 * address is `req.ip`, which is only ever the web server's declared client (proven with INTERNAL_PROXY_SECRET) or
 * the proxy hop an operator explicitly trusts, never a header the visitor chose. Runs after the auth guard.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http" || !this.env.RATE_LIMIT_ENABLED) return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)) return true;

    const policy =
      this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_KEY, targets) ?? DEFAULT_POLICY;
    const limit = Math.max(1, Math.round(policy.limit * this.env.RATE_LIMIT_MULTIPLIER));
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const subject = req.user ? `u:${req.user.id}` : `i:${rateLimitAddress(req.ip)}`;
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    const { hits, ttlMs } = await this.limiter.hit(
      `rl:${this.limiter.hash(route, subject)}`,
      policy.windowSeconds * 1000
    );
    if (hits > limit) throw AppError.tooManyRequests(Math.ceil(ttlMs / 1000));
    return true;
  }
}
