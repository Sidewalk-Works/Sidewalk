import { randomUUID } from "node:crypto";
import type { Options } from "pino-http";
import type { AppEnv } from "../config/env";
import type { AuthedRequest } from "./auth-types";

/** Keys that must never be written to a log line, wherever they turn up in a logged object. */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
  'headers["x-csrf-token"]',
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.passwordHash",
  "*.tokenHash",
  "*.refresh",
  "*.access",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.cookie",
  "password",
  "passwordHash",
  "token"
];

/**
 * Structured request logging. Query strings are dropped (they can carry search terms and coordinates),
 * request ids are echoed so support can trace a failure, and credentials are redacted by key name.
 */
export function buildPinoHttpOptions(env: Pick<AppEnv, "LOG_LEVEL" | "NODE_ENV">): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id =
        typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url.split("?")[0]
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode })
    },
    customProps: (req) => ({ userId: (req as unknown as AuthedRequest).user?.id }),
    autoLogging: { ignore: (req) => (req.url ?? "").includes("/health") },
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    transport:
      env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: { singleLine: true, colorize: true, translateTime: "HH:MM:ss" }
          }
        : undefined
  };
}
