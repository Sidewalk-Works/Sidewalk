import type { PrismaService } from "../prisma/prisma.service";
import type { StorageProvider } from "./storage/storage.provider";

export interface Orphan {
  key: string;
  lastModified: Date;
}

/**
 * Objects in storage that no evidence row points to. They appear if a process dies between writing the
 * files and committing the database row. Anything younger than `minAgeMs` is skipped, because an upload
 * that is still in flight has files but no row yet.
 */
export async function findOrphans(
  storage: StorageProvider,
  prisma: Pick<PrismaService, "reportEvidence">,
  minAgeMs = 3_600_000
): Promise<Orphan[]> {
  const rows = await prisma.reportEvidence.findMany({
    select: { storageKey: true, thumbKey: true }
  });
  const referenced = new Set(rows.flatMap((r) => [r.storageKey, r.thumbKey]));
  const cutoff = Date.now() - minAgeMs;
  const objects = await storage.list("evidence/");
  return objects.filter((o) => !referenced.has(o.key) && o.lastModified.getTime() <= cutoff);
}

/** Evidence rows whose files are gone (the reverse problem). Reported, never auto-fixed. */
export async function findMissingObjects(
  storage: StorageProvider,
  prisma: Pick<PrismaService, "reportEvidence">
): Promise<string[]> {
  const rows = await prisma.reportEvidence.findMany({
    select: { id: true, storageKey: true, thumbKey: true }
  });
  const present = new Set((await storage.list("evidence/")).map((o) => o.key));
  return rows
    .filter((r) => !present.has(r.storageKey) || !present.has(r.thumbKey))
    .map((r) => r.id);
}
