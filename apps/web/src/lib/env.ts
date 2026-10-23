/** Server-only: where the Next.js server reaches the NestJS API (server-to-server, not via the browser). */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const ACCESS_COOKIE = "sw_at";
export const REFRESH_COOKIE = "sw_rt";
export const CSRF_COOKIE = "sw_csrf";
export const CSRF_HEADER = "x-csrf-token";
