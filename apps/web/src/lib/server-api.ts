import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { UserDto } from "@sidewalk/contracts";
import { ApiError } from "./api-error";
import { ACCESS_COOKIE, API_INTERNAL_URL } from "./env";
import { internalHeaders } from "./internal";
import { logUpstreamFailure, requestIdFrom } from "./request-id";

/** Tells the API who the visitor is, so server-rendered pages are rate limited per visitor, not all as one. */
async function visitorHeaders(): Promise<Record<string, string>> {
  return internalHeaders((await headers()).get("x-forwarded-for"));
}

/**
 * Server-side API access for Server Components. Forwards the visitor's cookies so the API applies the same
 * visibility rules it would for the browser. Responses are never cached: they depend on who is looking.
 */
export async function serverFetch<T>(path: string, init: { allow404?: boolean } = {}): Promise<T> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let res: Response;
  const requestId = requestIdFrom(null);
  try {
    res = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, {
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
        "x-request-id": requestId,
        ...(await visitorHeaders())
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    });
  } catch (e) {
    logUpstreamFailure({
      requestId,
      method: "GET",
      path: `/api/v1${path.split("?")[0]}`,
      reason: (e as Error).name
    });
    throw new ApiError(
      503,
      "API_UNREACHABLE",
      "Sidewalk could not reach its servers. Please try again in a moment."
    );
  }

  if (res.status === 404 && init.allow404 !== false) notFound();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (res.status === 401) redirect("/login");
    throw ApiError.fromBody(res.status, body);
  }
  return (await res.json()) as T;
}

export type SessionUser = UserDto & { unreadNotifications: number };

/** The signed-in user, or null. Memoised per request so layouts and pages share one lookup. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)?.value) return null;
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000)
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { user: UserDto; unreadNotifications?: number };
    return { ...body.user, unreadNotifications: body.unreadNotifications ?? 0 };
  } catch {
    return null;
  }
});

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireStaff(next: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (user.role !== "MODERATOR" && user.role !== "ADMIN") notFound();
  return user;
}

export async function requireAdmin(next: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (user.role !== "ADMIN") notFound();
  return user;
}

/** For actions that need a confirmed address (publishing, commenting): sends the person to confirm it first. */
export async function requireVerifiedUser(next: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!user.emailVerified) redirect(`/verify-email?next=${encodeURIComponent(next)}`);
  return user;
}
