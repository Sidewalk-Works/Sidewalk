import type { CookieOptions, Response } from "express";
import type { AppEnv } from "../config/env";

export const ACCESS_COOKIE = "sw_at";
export const REFRESH_COOKIE = "sw_rt";
export const CSRF_COOKIE = "sw_csrf";
export const CSRF_HEADER = "x-csrf-token";

function base(env: AppEnv): CookieOptions {
  return {
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  };
}

export function setAuthCookies(
  res: Response,
  env: AppEnv,
  tokens: { access: string; refresh: string; csrf: string }
): void {
  res.cookie(ACCESS_COOKIE, tokens.access, {
    ...base(env),
    httpOnly: true,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000
  });
  res.cookie(REFRESH_COOKIE, tokens.refresh, {
    ...base(env),
    httpOnly: true,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000
  });
  // The CSRF token must be readable by page scripts so they can echo it in a header.
  res.cookie(CSRF_COOKIE, tokens.csrf, {
    ...base(env),
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000
  });
}

export function clearAuthCookies(res: Response, env: AppEnv): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, base(env));
  }
}
