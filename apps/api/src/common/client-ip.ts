import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";

export const PROXY_SECRET_HEADER = "x-sidewalk-proxy-secret";
export const CLIENT_IP_HEADER = "x-sidewalk-client-ip";

const equal = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * Rate limits need the visitor's real address, but the API only ever talks to the web server. The web server
 * passes the address in a header and proves it is the web server with a shared secret. Without the secret
 * the header is ignored, so a visitor cannot choose their own bucket, and the client's own
 * X-Forwarded-For is never trusted unless an operator explicitly sets TRUST_PROXY.
 */
export function internalClientIp(secret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const presented = req.headers[PROXY_SECRET_HEADER];
    const ip = req.headers[CLIENT_IP_HEADER];
    if (
      secret &&
      typeof presented === "string" &&
      equal(presented, secret) &&
      typeof ip === "string" &&
      isIP(ip)
    ) {
      Object.defineProperty(req, "ip", { value: ip, configurable: true });
    }
    // The helper headers are for this middleware only; nothing downstream (or any log) should see them.
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    next();
  };
}
