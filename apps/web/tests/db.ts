import { readFileSync } from "node:fs";
import path from "node:path";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { parse } from "dotenv";

const env = parse(readFileSync(path.resolve(__dirname, "../../../.env.e2e")));
const url = new URL(env.DATABASE_URL as string);
if (!/_e2e$/.test(url.pathname.slice(1)))
  throw new Error("Tests may only touch the disposable _e2e database");

/** Direct access to the disposable e2e database, only for things a user cannot do, like waiting 30 minutes. */
export async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url.toString().replace(/\?schema=.*/, "") });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const USER_ID = `(SELECT id FROM "User" WHERE email = $1)`;

/** Moves links, and the record of having emailed them, back in time without expiring them, e.g. past a resend cooldown. */
export const ageTokensFor = (email: string, minutes: number) =>
  withDb(async (c) => {
    await c.query(
      `UPDATE "AuthToken" SET "createdAt" = "createdAt" - make_interval(mins => $2) WHERE "userId" = ${USER_ID} AND "usedAt" IS NULL`,
      [email, minutes]
    );
    await c.query(
      `UPDATE "EmailOutbox" SET "createdAt" = "createdAt" - make_interval(mins => $2) WHERE "userId" = ${USER_ID}`,
      [email, minutes]
    );
  });

/** Makes every unused link for this address look as if it was issued long ago and has since expired. */
export const expireTokensFor = (email: string) =>
  withDb(async (c) => {
    await c.query(
      `UPDATE "AuthToken" SET "expiresAt" = now() - interval '1 minute' WHERE "userId" = ${USER_ID} AND "usedAt" IS NULL`,
      [email]
    );
  }).then(() => ageTokensFor(email, 2 * 24 * 60));

export const outboxCount = (email: string, kind: string) =>
  withDb(async (c) =>
    Number(
      (
        await c.query(
          `SELECT count(*) FROM "EmailOutbox" o JOIN "User" u ON u.id = o."userId" WHERE u.email = $1 AND o.kind = $2::"OutboxKind"`,
          [email, kind]
        )
      ).rows[0].count
    )
  );

/**
 * The key a message must be encrypted with, built independently of the API's own code from the same documented
 * envelope (`v1.<keyId>.<base64url(iv ‖ tag ‖ ciphertext)>`, AES-256-GCM, AAD bound to key id and row id), so the
 * tests also prove the format is what the documentation says.
 */
export function encryptOutboxPayload(rowId: string, payload: unknown): string {
  const first = String(env.OUTBOX_ENCRYPTION_KEYS).split(",")[0] as string;
  const [id, material] = [first.slice(0, first.indexOf(":")), first.slice(first.indexOf(":") + 1)];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(material, "base64"), iv);
  cipher.setAAD(Buffer.from(`sidewalk-outbox|v1|${id}|${rowId}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return `v1.${id}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export interface OutboxSeed {
  kind?: string;
  status: "PENDING" | "FAILED" | "DEAD" | "SENT" | "SKIPPED";
  toEmail: string;
  userId?: string | null;
  lastError?: string | null;
  attempts?: number;
  /** Minutes from now (negative: in the past). */
  nextAttemptInMinutes?: number;
  /** Minutes ago the row was created. */
  createdMinutesAgo?: number;
  /** Ciphertext, or `valid` to encrypt an empty payload for this row, or null for none. */
  ciphertext?: string | "valid" | null;
  dedupeKey: string;
}

export async function insertOutbox(seed: OutboxSeed): Promise<string> {
  const id = randomUUID();
  const ciphertext =
    seed.ciphertext === "valid" ? encryptOutboxPayload(id, {}) : (seed.ciphertext ?? null);
  await withDb((c) =>
    c.query(
      `INSERT INTO "EmailOutbox" (id, kind, "userId", "toEmail", "payloadCiphertext", status, attempts, "lastError", "nextAttemptAt", "createdAt", "dedupeKey")
       VALUES ($1, $2::"OutboxKind", $3, $4, $5, $6::"OutboxStatus", $7, $8,
               (now() AT TIME ZONE 'UTC') + make_interval(mins => $9), (now() AT TIME ZONE 'UTC') - make_interval(mins => $10), $11)`,
      [
        id,
        seed.kind ?? "PASSWORD_CHANGED",
        seed.userId ?? null,
        seed.toEmail,
        ciphertext,
        seed.status,
        seed.attempts ?? 0,
        seed.lastError ?? null,
        seed.nextAttemptInMinutes ?? 0,
        seed.createdMinutesAgo ?? 0,
        seed.dedupeKey
      ]
    )
  );
  return id;
}

export const deleteOutboxByPrefix = (prefix: string) =>
  withDb((c) => c.query(`DELETE FROM "EmailOutbox" WHERE "dedupeKey" LIKE $1`, [`${prefix}%`]));

/** An open transaction that holds a lock until released, to put a real part of the system into a real bad state. */
export async function holdLock(
  statement: string,
  params: unknown[] = []
): Promise<() => Promise<void>> {
  const client = new Client({ connectionString: url.toString().replace(/\?schema=.*/, "") });
  await client.connect();
  await client.query("BEGIN");
  await client.query(statement, params);
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  };
}
