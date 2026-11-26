#!/usr/bin/env node
// Creates .env from .env.example with a freshly generated JWT secret. Never overwrites an existing .env.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, ".env");

if (existsSync(target)) {
  console.log(".env already exists, leaving it untouched.");
  process.exit(0);
}
const example = readFileSync(resolve(root, ".env.example"), "utf8");
const secret = randomBytes(48).toString("base64url");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outboxKey = `k${stamp}:${randomBytes(32).toString("base64")}`;
writeFileSync(
  target,
  example
    .replace("JWT_ACCESS_SECRET=replace-me-run-pnpm-env-init", `JWT_ACCESS_SECRET=${secret}`)
    .replace(
      "OUTBOX_ENCRYPTION_KEYS=replace-me-run-pnpm-env-init",
      `OUTBOX_ENCRYPTION_KEYS=${outboxKey}`
    ),
  { mode: 0o600 }
);
console.log("Created .env with generated secrets.");
