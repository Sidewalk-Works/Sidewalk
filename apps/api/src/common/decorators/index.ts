import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@sidewalk/contracts";
import type { AuthedRequest, AuthUser } from "../auth-types";

export const IS_PUBLIC = "isPublic";
/** Route needs no sign-in. If a valid session exists, the user is still attached to the request. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = "roles";
/** Route is limited to these roles. Enforced by RolesGuard, then re-checked in the service layer. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().user as AuthUser;
  }
);

export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().user;
  }
);

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = "rateLimit";
export const SKIP_RATE_LIMIT_KEY = "skipRateLimit";

/** Per-route rate limit: `limit` requests per `windowSeconds`, scaled by RATE_LIMIT_MULTIPLIER (tests only). */
export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds } satisfies RateLimitPolicy);

/** Exempts a route from rate limiting. Only for liveness, which must answer even when everything else is down. */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
