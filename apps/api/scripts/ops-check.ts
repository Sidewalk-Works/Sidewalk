// One command for "is this deployment healthy?", suitable for cron, a systemd timer or a CI smoke test.
//
//   pnpm ops:check [--storage] [--strict] [--json]
//
// Exit status: 0 healthy (warnings allowed), 1 something failed (with --strict, a warning also fails).
// Reads counts only: no message content, evidence or personal data beyond role totals. Details: docs/operations.md
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv } from "../src/config/env";
import { buildOutboxKeyring } from "../src/email/outbox-crypto";
import { LocalStorageProvider } from "../src/evidence/storage/local-storage.provider";
import { S3StorageProvider } from "../src/evidence/storage/s3-storage.provider";
import { PrismaClient } from "../src/generated/prisma/client";
import { formatChecks, runOpsChecks, worst } from "../src/ops/checks";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL })
  });
  try {
    const storage = args.has("--storage")
      ? env.STORAGE_DRIVER === "s3"
        ? new S3StorageProvider(env)
        : new LocalStorageProvider(path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR))
      : undefined;
    const checks = await runOpsChecks({
      db: prisma,
      env,
      keyring: buildOutboxKeyring(env),
      storage
    });
    const level = worst(checks);
    if (args.has("--json")) console.log(JSON.stringify({ status: level, checks }, null, 2));
    else console.log(`${formatChecks(checks)}\n\nOverall: ${level.toUpperCase()}`);
    process.exitCode = level === "fail" || (args.has("--strict") && level === "warn") ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
