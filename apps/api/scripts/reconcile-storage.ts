// Finds evidence objects that no database row references (orphans) and evidence rows whose files are missing.
//
//   pnpm --filter @sidewalk/api storage:reconcile              report only
//   pnpm --filter @sidewalk/api storage:reconcile -- --delete  also delete orphans older than one hour
//   pnpm --filter @sidewalk/api storage:reconcile -- --check   exit 1 if anything is orphaned or missing (for cron)
//
// Missing files are the serious finding (a report whose photograph is gone): restore them from the object-store
// backup or versioning. Orphans only waste space. See docs/operations.md#evidence-storage
import path from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv } from "../src/config/env";
import { findMissingObjects, findOrphans } from "../src/evidence/reconcile";
import { LocalStorageProvider } from "../src/evidence/storage/local-storage.provider";
import { S3StorageProvider } from "../src/evidence/storage/s3-storage.provider";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.resolve(__dirname, "../../../.env"),
  quiet: true
});

async function main(): Promise<void> {
  const env = loadEnv();
  const storage =
    env.STORAGE_DRIVER === "s3"
      ? new S3StorageProvider(env)
      : new LocalStorageProvider(path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL })
  });
  try {
    const orphans = await findOrphans(storage, prisma as never);
    const missing = await findMissingObjects(storage, prisma as never);
    console.log(`Orphaned objects (older than 1 hour): ${orphans.length}`);
    for (const o of orphans.slice(0, 50))
      console.log(`  ${o.key}  ${o.lastModified.toISOString()}`);
    console.log(`Evidence rows with missing files: ${missing.length}`);
    for (const id of missing.slice(0, 50)) console.log(`  ${id}`);
    if (process.argv.includes("--check") && (orphans.length > 0 || missing.length > 0)) {
      console.error("Reconciliation found differences.");
      process.exitCode = 1;
    }
    if (process.argv.includes("--delete") && orphans.length > 0) {
      for (const o of orphans) await storage.delete(o.key);
      console.log(`Deleted ${orphans.length} orphaned objects.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
