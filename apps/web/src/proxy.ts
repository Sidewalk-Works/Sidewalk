import { NextResponse, type NextRequest } from "next/server";
import { internalHeaders } from "./lib/internal";
import {
  ACCESS_COOKIE,
  API_INTERNAL_URL,
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_COOKIE,
  SITE_URL
} from "./lib/env";

const PROTECTED = ["/dashboard", "/report", "/account", "/admin", "/notifications"];

interface Renewed {
  ok: boolean;
  setCookies: string[];
  values: Record<string, string>;
}

// Parallel requests (a page plus its prefetches) arrive with the same refresh token. Rotating it twice would
// make the second attempt look like token theft, so concurrent renewals share one API call.
const inflight = new Map<string, { promise: Promise<Renewed>; at: number }>();

function accessExpiresSoon(token: string | undefined): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { exp?: number };
    return !payload.exp || payload.exp * 1000 - Date.now() < 30_000;
  } catch {
    return true;
  }
}

async function renew(
  refresh: string,
  csrf: string | undefined,
  forwardedFor: string | null
): Promise<Renewed> {
  const existing = inflight.get(refresh);
  if (existing && Date.now() - existing.at < 10_000) return existing.promise;

  const promise = (async (): Promise<Renewed> => {
    try {
      const res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          cookie: `${REFRESH_COOKIE}=${refresh}${csrf ? `; ${CSRF_COOKIE}=${csrf}` : ""}`,
          [CSRF_HEADER]: csrf ?? "",
          "content-type": "application/json",
          ...internalHeaders(forwardedFor)
        },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      const setCookies = res.headers.getSetCookie();
      const values: Record<string, string> = {};
      for (const line of setCookies) {
        const [pair] = line.split(";");
        const eq = pair!.indexOf("=");
        values[pair!.slice(0, eq)] = pair!.slice(eq + 1);
      }
      return { ok: res.ok, setCookies, values };
    } catch {
      return { ok: false, setCookies: [], values: {} };
    }
  })();
  inflight.set(refresh, { promise, at: Date.now() });
  setTimeout(() => inflight.delete(refresh), 15_000);
  return promise;
}

/** Origin of the map tile server, so the policy allows exactly that host and nothing broader. */
function tileOrigin(): string | null {
  try {
    return new URL(
      (
        process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      ).replace(/\{[^}]+\}/g, "0")
    ).origin;
  } catch {
    return null;
  }
}

/**
 * A fresh, per-request Content-Security-Policy. Scripts run only if they carry this request's nonce (Next adds
 * it to its own scripts), so injected markup cannot execute. Map tiles and workers are allowed explicitly.
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const tiles = tileOrigin();
  const https = SITE_URL.startsWith("https://");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are widespread in UI libraries and cannot run code, unlike scripts.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${tiles ? ` ${tiles}` : ""}`,
    `connect-src 'self'${tiles ? ` ${tiles}` : ""}${dev ? " ws: wss:" : ""}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}

/**
 * Keeps the short-lived access cookie fresh before any page renders, using the HttpOnly refresh cookie,
 * sends signed-out visitors away from private pages, and attaches the Content-Security-Policy.
 * The API still authorises every request itself.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const pass = (extra?: { cookie?: string; setCookies?: string[] }) => {
    if (extra?.cookie) headers.set("cookie", extra.cookie);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("content-security-policy", csp);
    for (const line of extra?.setCookies ?? []) response.headers.append("set-cookie", line);
    return response;
  };
  const toLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const response = NextResponse.redirect(url);
    response.headers.set("content-security-policy", csp);
    return response;
  };

  if (!accessExpiresSoon(access)) return pass();

  if (!refresh) return needsAuth ? toLogin() : pass();

  const result = await renew(
    refresh,
    request.cookies.get(CSRF_COOKIE)?.value,
    request.headers.get("x-forwarded-for")
  );
  if (!result.ok) {
    const response = needsAuth ? toLogin() : pass();
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) response.cookies.delete(name);
    return response;
  }

  // Render this request with the new cookies, and hand the same cookies to the browser.
  const merged = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
  for (const [k, v] of Object.entries(result.values)) merged.set(k, v);
  return pass({
    cookie: [...merged].map(([k, v]) => `${k}=${v}`).join("; "),
    setCookies: result.setCookies
  });
}

export const config = {
  matcher: ["/((?!api/|_next/|photography/|vendor/|favicon|icon|robots|sitemap).*)"]
};
