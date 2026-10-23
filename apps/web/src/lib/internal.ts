/**
 * Server-to-server identity. The API needs the visitor's real address for rate limiting, and it only trusts
 * it when we present the shared secret. The address comes from the reverse proxy in front of this server
 * (WEB_TRUSTED_PROXY_HOPS says how many proxies there are; the entry they appended is the one we trust).
 */
const HOPS = Math.max(0, Number.parseInt(process.env.WEB_TRUSTED_PROXY_HOPS ?? "1", 10) || 0);

export function clientIpFrom(forwardedFor: string | null | undefined): string | undefined {
  if (!forwardedFor) return undefined;
  const parts = forwardedFor
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  if (HOPS === 0) return undefined;
  return parts[Math.max(0, parts.length - HOPS)];
}

export function internalHeaders(forwardedFor: string | null | undefined): Record<string, string> {
  const secret = process.env.INTERNAL_PROXY_SECRET;
  const ip = clientIpFrom(forwardedFor);
  return secret && ip ? { "x-sidewalk-proxy-secret": secret, "x-sidewalk-client-ip": ip } : {};
}
