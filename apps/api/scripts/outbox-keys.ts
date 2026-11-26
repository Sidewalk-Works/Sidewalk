// Operator tool for the keys that encrypt queued email content. It never prints key material or message content.
//
//   pnpm outbox:keys generate [--id k2]   print a new `id:key` entry to PREPEND to OUTBOX_ENCRYPTION_KEYS
//   pnpm outbox:keys status               which key each queued message needs, and whether it is readable now
//   pnpm outbox:keys rewrap [--dry-run]   re-encrypt queued messages under the active (first) key
//
// Rotation, backup and retirement procedures: docs/operations.md#outbox-encryption-keys
import { randomBytes } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv } from "../src/config/env";
import { buildOutboxKeyring } from "../src/email/outbox-crypto";
import { keyStatus, rewrapOutbox } from "../src/email/outbox-maintenance";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== "--");

function generate(): void {
  const flag = rest.indexOf("--id");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const id = flag >= 0 ? (rest[flag + 1] ?? "") : `k${stamp}`;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || id === "legacy") {
    console.error("The key id must be 1-32 letters, digits, '-' or '_', and not 'legacy'.");
    process.exit(1);
  }
  console.log(`${id}:${randomBytes(32).toString("base64")}`);
  console.error(
    [
      "",
      "Prepend this entry (with a comma) to OUTBOX_ENCRYPTION_KEYS, keeping every existing entry after it:",
      "  OUTBOX_ENCRYPTION_KEYS=<this entry>,<previous entries>",
      "Store it in your secret manager, separately from database backups. Restart the API and any worker."
    ].join("\n")
  );
}

async function main(): Promise<void> {
  if (command === "generate") return generate();
  if (command !== "status" && command !== "rewrap") {
    console.error("Usage: pnpm outbox:keys <generate [--id <id>] | status | rewrap [--dry-run]>");
    process.exit(1);
  }
  const env = loadEnv();
  const keyring = buildOutboxKeyring(env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL })
  });
  try {
    console.log(`Active key: ${keyring.activeKeyId}`);
    console.log(`Configured keys: ${keyring.keyIds.join(", ")}`);
    console.log(`Legacy (JWT-derived) decryption: ${env.OUTBOX_LEGACY_JWT_DECRYPT ? "on" : "off"}`);
    if (command === "status") {
      const status = await keyStatus(prisma, keyring);
      console.log(`Queued messages holding content: ${status.total}`);
      let blocked = 0;
      for (const [id, e] of Object.entries(status.byKey)) {
        console.log(
          `  ${id.padEnd(14)} rows=${e.rows} readable=${e.readable} key-missing=${e.keyMissing} failed-integrity=${e.failedIntegrity}`
        );
        blocked += e.keyMissing + e.failedIntegrity;
      }
      if (blocked > 0) {
        console.log(
          `\n${blocked} message(s) cannot be read with this configuration. They are kept, not deleted.`
        );
        process.exitCode = 2;
      }
      return;
    }
    const dryRun = rest.includes("--dry-run");
    const r = await rewrapOutbox(prisma, keyring, { dryRun });
    console.log(
      `${dryRun ? "Would rewrap" : "Rewrapped"}: ${r.rewrapped}; already on the active key: ${r.alreadyActive}; unreadable (left untouched): ${r.unreadable}; changed meanwhile (run again): ${r.raced}`
    );
    if (r.unreadable > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
