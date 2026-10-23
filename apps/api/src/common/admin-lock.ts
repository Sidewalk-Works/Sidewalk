import type { Prisma } from "../generated/prisma/client";

/**
 * Serialises every change that could reduce the number of administrators (demotion, suspension, deletion).
 * Without it, two administrators demoting each other at the same moment could both succeed and leave none.
 * The lock is released automatically when the surrounding transaction ends.
 */
export async function lockAdminChanges(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7311001)`;
}
