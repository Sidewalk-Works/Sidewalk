"use client";

import { ApiError } from "./api-error";

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

let refreshing: Promise<boolean> | null = null;

/** Renews the session once, however many requests discover it expired at the same moment. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-csrf-token": readCookie("sw_csrf") ?? "" },
    body: "{}"
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 1000);
    });
  return refreshing;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
  body?: FormData;
  signal?: AbortSignal;
}

/** Browser-side API calls: same-origin, cookie-authenticated, CSRF-protected, with one transparent session renewal. */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const attempt = () => {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { accept: "application/json" };
    if (method !== "GET") headers["x-csrf-token"] = readCookie("sw_csrf") ?? "";
    if (options.json !== undefined) headers["content-type"] = "application/json";
    return fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers,
      body: options.body ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
      signal: options.signal
    });
  };

  let res: Response;
  try {
    res = await attempt();
    const isAuthCall =
      path.startsWith("/auth/login") ||
      path.startsWith("/auth/register") ||
      path.startsWith("/auth/refresh");
    if (res.status === 401 && !isAuthCall && (await refreshSession())) res = await attempt();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(
      0,
      "NETWORK",
      "You appear to be offline, or Sidewalk is unreachable. Check your connection and try again."
    );
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw ApiError.fromBody(res.status, body as Record<string, never> | null);
  return body as T;
}
