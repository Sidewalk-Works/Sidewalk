import { readFileSync } from "node:fs";
import path from "node:path";
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
