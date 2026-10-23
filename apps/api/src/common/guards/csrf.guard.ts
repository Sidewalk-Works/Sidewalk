import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { APP_ENV, type AppEnv } from "../../config/env";
import { AppError } from "../app-error";
import type { AuthedRequest } from "../auth-types";
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from "../cookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cookie-based sessions need CSRF protection. Two independent layers:
 *  1. If the browser sent an Origin header, it must be our web origin.
 *  2. If the request carries session cookies, it must echo the CSRF cookie in a header
 *     (double-submit). A cross-site page can send cookies but cannot read this one.
 * Requests authenticated with a bearer token (API clients) carry no ambient credentials and are exempt.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (req.headers.authorization?.startsWith("Bearer ")) return true;

    const origin = req.headers.origin;
    if (origin && origin !== this.env.WEB_ORIGIN) {
      throw AppError.forbidden("This request came from an untrusted origin.", "BAD_ORIGIN");
    }

    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const hasSession = Boolean(cookies[ACCESS_COOKIE] || cookies[REFRESH_COOKIE]);
    if (!hasSession) return true;

    const cookieToken = cookies[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];
    if (!cookieToken || typeof headerToken !== "string" || !safeEqual(cookieToken, headerToken)) {
      throw AppError.forbidden(
        "Your session could not be verified. Refresh the page and try again.",
        "CSRF_FAILED"
      );
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
