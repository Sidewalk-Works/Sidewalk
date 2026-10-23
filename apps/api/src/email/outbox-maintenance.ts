import type { PrismaClient } from "../generated/prisma/client";
import {
  KEY_UNAVAILABLE_CODE,
  OutboxKeyUnavailableError,
  OutboxPayloadIntegrityError,
  keyIdOf,
  type OutboxKeyring
} from "./outbox-crypto";

/** Statuses whose rows still hold encrypted content. A row being sent right now is left alone. */
const HOLDING = ["PENDING", "FAILED", "DEAD"] as const;
const BATCH = 200;

type Db = Pick<PrismaClient, "emailOutbox">;
type HealthDb = Pick<PrismaClient, "emailOutbox" | "$queryRaw">;

export interface KeyStatus {
  /** Rows that still hold encrypted content (sent and skipped rows have none). */
  total: number;
  /** Per key id (or `legacy`): how many rows need it and whether this configuration can read them. */
  byKey: Record<
    string,
    { rows: number; readable: number; keyMissing: number; failedIntegrity: number }
  >;
}

/** Walks every row that still holds content, in batches, and reports what this configuration can and cannot read. */
export async function keyStatus(db: Db, keyring: OutboxKeyring): Promise<KeyStatus> {
  const status: KeyStatus = { total: 0, byKey: {} };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.emailOutbox.findMany({
      where: { payloadCiphertext: { not: null }, status: { not: "SENDING" } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, payloadCiphertext: true }
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const ciphertext = row.payloadCiphertext as string;
      const id = keyIdOf(ciphertext) ?? "unrecognised";
      const entry = (status.byKey[id] ??= {
        rows: 0,
        readable: 0,
        keyMissing: 0,
        failedIntegrity: 0
      });
      status.total += 1;
      entry.rows += 1;
      try {
        keyring.decrypt(ciphertext, row.id);
        entry.readable += 1;
      } catch (e) {
        if (e instanceof OutboxKeyUnavailableError) entry.keyMissing += 1;
        else if (e instanceof OutboxPayloadIntegrityError) entry.failedIntegrity += 1;
        else throw e;
      }
    }
    cursor = rows[rows.length - 1]?.id;
  }
  return status;
}

export interface RewrapResult {
  examined: number;
  rewrapped: number;
  alreadyActive: number;
  /** Could not be decrypted with the configured keys: left exactly as they are. */
  unreadable: number;
  /** Changed (or claimed by a worker) between reading and writing: skipped, a later run picks them up. */
  raced: number;
}

/**
 * Re-encrypts queued content under the active key so older keys can be retired. Each row is rewritten only if it
 * still holds the exact ciphertext that was read (compare-and-set), so a worker finishing a message at the same
 * moment is never overwritten. Nothing is ever decrypted into storage: plaintext lives only in memory here.
 */
export async function rewrapOutbox(
  db: Db,
  keyring: OutboxKeyring,
  options: { dryRun?: boolean } = {}
): Promise<RewrapResult> {
  const result: RewrapResult = {
    examined: 0,
    rewrapped: 0,
    alreadyActive: 0,
    unreadable: 0,
    raced: 0
  };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.emailOutbox.findMany({
      where: { payloadCiphertext: { not: null }, status: { in: [...HOLDING] } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, payloadCiphertext: true }
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const old = row.payloadCiphertext as string;
      result.examined += 1;
      if (keyIdOf(old) === keyring.activeKeyId) {
        result.alreadyActive += 1;
        continue;
      }
      let payload: unknown;
      try {
        payload = keyring.decrypt(old, row.id);
      } catch {
        result.unreadable += 1;
        continue;
      }
      if (options.dryRun) {
        result.rewrapped += 1;
        continue;
      }
      const updated = await db.emailOutbox.updateMany({
        where: { id: row.id, payloadCiphertext: old, status: { in: [...HOLDING] } },
        data: { payloadCiphertext: keyring.encrypt(payload, row.id) }
      });
      if (updated.count === 1) result.rewrapped += 1;
      else result.raced += 1;
    }
    cursor = rows[rows.length - 1]?.id;
  }
  return result;
}

export interface OutboxHealth {
  /** Age of the oldest message that is past due and still unsent. A stalled worker shows up as this growing. */
  oldestPendingAgeSeconds: number;
  /** Messages held back because the key they need is not configured (kept, not dead). */
  keyBlocked: number;
  activeKeyId: string;
  configuredKeyIds: string[];
  /** Messages still holding content, per key id (or `legacy`). A key can be retired when it has none. */
  messagesByKey: Record<string, number>;
}

/**
 * What an operator needs to judge whether mail is flowing: how stale the queue is, whether any message is stuck
 * waiting for a key, and which keys queued messages still depend on. Reads counts only, never content.
 */
export async function outboxHealth(db: HealthDb, keyring: OutboxKeyring): Promise<OutboxHealth> {
  const [oldest, keyBlocked, byKey] = await Promise.all([
    db.emailOutbox.findFirst({
      where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      select: { nextAttemptAt: true }
    }),
    db.emailOutbox.count({
      where: { status: "FAILED", lastError: { startsWith: `${KEY_UNAVAILABLE_CODE}:` } }
    }),
    db.$queryRaw<Array<{ id: string | null; n: bigint }>>`
      SELECT CASE WHEN "payloadCiphertext" LIKE 'v1.%' THEN split_part("payloadCiphertext", '.', 2)
                  ELSE 'legacy' END AS id, count(*) AS n
      FROM "EmailOutbox" WHERE "payloadCiphertext" IS NOT NULL GROUP BY 1`
  ]);
  return {
    oldestPendingAgeSeconds: oldest
      ? Math.max(0, Math.round((Date.now() - oldest.nextAttemptAt.getTime()) / 1000))
      : 0,
    keyBlocked,
    activeKeyId: keyring.activeKeyId,
    configuredKeyIds: keyring.keyIds,
    messagesByKey: Object.fromEntries(byKey.map((r) => [r.id ?? "unknown", Number(r.n)]))
  };
}
