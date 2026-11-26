import type { PrismaService } from "../prisma/prisma.service";
import type { StorageProvider } from "./storage/storage.provider";

export interface Orphan {
  key: string;
  lastModified: Date;
}

type Db = Pick<PrismaService, "reportEvidence" | "organizationDocument">;

/**
 * Objects in storage that no database row points to: report evidence under `evidence/` and organization application
 * documents under `org-documents/`. They appear if a process dies between writing the files and committing the row.
 * Anything younger than `minAgeMs` is skipped, because an upload that is still in flight has files but no row yet.
 */
export async function findOrphans(
  storage: StorageProvider,
  prisma: Db,
  minAgeMs = 3_600_000
): Promise<Orphan[]> {
  const [evidence, documents] = await Promise.all([
    prisma.reportEvidence.findMany({ select: { storageKey: true, thumbKey: true } }),
    prisma.organizationDocument.findMany({ select: { storageKey: true } })
  ]);
  const referenced = new Set([
    ...evidence.flatMap((r) => [r.storageKey, r.thumbKey]),
    ...documents.map((d) => d.storageKey)
  ]);
  const cutoff = Date.now() - minAgeMs;
  const objects = [...(await storage.list("evidence/")), ...(await storage.list("org-documents/"))];
  return objects.filter((o) => !referenced.has(o.key) && o.lastModified.getTime() <= cutoff);
}

/**
 * Rows whose files are gone (the reverse problem): evidence ids, and application document ids prefixed `document:`.
 * Reported, never auto-fixed.
 */
export async function findMissingObjects(storage: StorageProvider, prisma: Db): Promise<string[]> {
  const [evidence, documents] = await Promise.all([
    prisma.reportEvidence.findMany({ select: { id: true, storageKey: true, thumbKey: true } }),
    prisma.organizationDocument.findMany({ select: { id: true, storageKey: true } })
  ]);
  const present = new Set(
    [...(await storage.list("evidence/")), ...(await storage.list("org-documents/"))].map(
      (o) => o.key
    )
  );
  return [
    ...evidence
      .filter((r) => !present.has(r.storageKey) || !present.has(r.thumbKey))
      .map((r) => r.id),
    ...documents.filter((d) => !present.has(d.storageKey)).map((d) => `document:${d.id}`)
  ];
}
