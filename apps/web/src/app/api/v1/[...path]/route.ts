import type { NextRequest } from "next/server";
import { API_INTERNAL_URL } from "@/lib/env";
import { internalHeaders } from "@/lib/internal";
import { logUpstreamFailure, requestIdFrom } from "@/lib/request-id";

export const dynamic = "force-dynamic";

// Headers that describe the hop between the browser and this server, or that we set ourselves.
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "expect"
]);
const DROP_RESPONSE = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length"
]);

/**
 * Same-origin gateway to the NestJS API, so browser cookies stay first-party. Unlike a plain rewrite it
 * tells the API who the visitor really is (see lib/internal.ts) and strips any client attempt to say so.
 */
async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  const target = new URL(`${API_INTERNAL_URL}/api/v1/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (DROP_REQUEST.has(k) || k.startsWith("x-sidewalk-") || k.startsWith("x-forwarded-")) return;
    headers.set(key, value);
  });
  for (const [k, v] of Object.entries(internalHeaders(request.headers.get("x-forwarded-for"))))
    headers.set(k, v);
  // One id from the browser to the API log, returned to the caller so a failure can be traced.
  const requestId = requestIdFrom(request.headers.get("x-request-id"));
  headers.set("x-request-id", requestId);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Streaming request bodies (photo uploads) need half-duplex mode.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000)
    } as RequestInit);
  } catch (e) {
    logUpstreamFailure({
      requestId,
      method: request.method,
      path: target.pathname,
      reason: (e as Error).name
    });
    return Response.json(
      {
        statusCode: 502,
        code: "API_UNREACHABLE",
        message: "Sidewalk could not reach its servers. Please try again in a moment.",
        requestId,
        timestamp: new Date().toISOString(),
        path: target.pathname
      },
      { status: 502, headers: { "cache-control": "no-store", "x-request-id": requestId } }
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie")
      out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  const empty = [101, 204, 205, 304].includes(upstream.status);
  return new Response(empty ? null : upstream.body, { status: upstream.status, headers: out });
}

export {
  forward as GET,
  forward as POST,
  forward as PATCH,
  forward as PUT,
  forward as DELETE,
  forward as HEAD
};
