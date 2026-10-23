import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { AppEnv } from "../config/env";
import { outboxHealth } from "../email/outbox-maintenance";
import type { OutboxKeyring } from "../email/outbox-crypto";
import type { StorageProvider } from "../evidence/storage/storage.provider";
import type { PrismaClient } from "../generated/prisma/client";

export type Severity = "ok" | "warn" | "fail";
export interface Check {
  name: string;
  status: Severity;
  detail: string;
}

export interface OpsContext {
  db: PrismaClient;
  env: AppEnv;
  keyring: OutboxKeyring;
  /** When given, the object store is pinged too. */
  storage?: StorageProvider;
  /** The committed migrations directory this build expects the database to have applied. */
  migrationsDir?: string;
  /** An administrator with no confirmed address cannot use admin tools: `fail` after an upgrade, `warn` in routine monitoring. */
  adminsMustBeConfirmed?: boolean;
}

export const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, "../../prisma/migrations");

/** Waiting longer than this for a due message to be picked up means the worker is not running or is stuck. */
export const OUTBOX_STALE_WARN_SECONDS = 120;
export const OUTBOX_STALE_FAIL_SECONDS = 900;
const EXPIRED_BUCKETS_WARN = 50_000;

async function attempt(name: string, work: () => Promise<Omit<Check, "name">>): Promise<Check> {
  try {
    return { name, ...(await work()) };
  } catch (e) {
    // The error type only: driver errors can carry connection strings or query parameters.
    return { name, status: "fail", detail: `could not be checked (${(e as Error).name})` };
  }
}

const ok = (detail: string): Omit<Check, "name"> => ({ status: "ok", detail });
const warn = (detail: string): Omit<Check, "name"> => ({ status: "warn", detail });
const fail = (detail: string): Omit<Check, "name"> => ({ status: "fail", detail });

export function expectedMigrations(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

/** Counts only: nothing here reads message content, personal data beyond role totals, or evidence. */
export async function runOpsChecks(ctx: OpsContext): Promise<Check[]> {
  const { db } = ctx;
  const checks: Check[] = [];

  checks.push(
    await attempt("database", async () => {
      await db.$queryRaw`SELECT 1`;
      const [tz] = await db.$queryRaw<
        Array<{ tz: string }>
      >`SELECT current_setting('TimeZone') AS tz`;
      return tz?.tz === "UTC" || tz?.tz === "Etc/UTC"
        ? ok("reachable, time zone UTC")
        : warn(
            `reachable, but the session time zone is ${tz?.tz}; set it to UTC (timestamps are stored without a zone)`
          );
    })
  );

  checks.push(
    await attempt("migrations", async () => {
      const expected = expectedMigrations(ctx.migrationsDir ?? DEFAULT_MIGRATIONS_DIR);
      const rows = await db.$queryRaw<
        Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
      >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
      const applied = new Set(
        rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name)
      );
      const broken = rows
        .filter((r) => !r.finished_at && !r.rolled_back_at)
        .map((r) => r.migration_name);
      const pending = expected.filter((m) => !applied.has(m));
      const unknown = [...applied].filter((m) => !expected.includes(m));
      if (broken.length)
        return fail(`failed or interrupted: ${broken.join(", ")}; resolve before continuing`);
      if (pending.length)
        return fail(`${pending.length} pending: ${pending.join(", ")}; run \`pnpm db:migrate\``);
      if (unknown.length)
        return warn(
          `the database has migrations this build does not contain: ${unknown.join(", ")} (an older build against a newer database?)`
        );
      return ok(`${expected.length} applied, none pending`);
    })
  );

  checks.push(
    await attempt("email outbox", async () => {
      const [byStatus, health] = await Promise.all([
        db.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
        outboxHealth(db, ctx.keyring)
      ]);
      const n = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
      const summary = `pending ${n("PENDING")}, sending ${n("SENDING")}, failed ${n("FAILED")}, dead ${n("DEAD")}, sent ${n("SENT")}; oldest due ${health.oldestPendingAgeSeconds}s`;
      if (health.keyBlocked > 0)
        return fail(
          `${health.keyBlocked} message(s) held because their encryption key is not configured (${summary})`
        );
      if (health.oldestPendingAgeSeconds > OUTBOX_STALE_FAIL_SECONDS)
        return fail(`the delivery worker looks stalled or stopped (${summary})`);
      if (health.oldestPendingAgeSeconds > OUTBOX_STALE_WARN_SECONDS)
        return warn(`messages are waiting longer than usual (${summary})`);
      if (n("DEAD") > 0)
        return warn(`${n("DEAD")} message(s) gave up and need attention (${summary})`);
      if (n("FAILED") > 0) return warn(`${n("FAILED")} message(s) are retrying (${summary})`);
      return ok(summary);
    })
  );

  checks.push(
    await attempt("rate-limit store", async () => {
      const probe = "ops:probe";
      await db.$executeRaw`
        INSERT INTO "RateLimitBucket" ("key", "hits", "expiresAt") VALUES (${probe}, 1, now() + interval '10 seconds')
        ON CONFLICT ("key") DO UPDATE SET "hits" = "RateLimitBucket"."hits" + 1`;
      await db.rateLimitBucket.deleteMany({ where: { key: probe } });
      const [counts] = await db.$queryRaw<Array<{ total: bigint; expired: bigint }>>`
        SELECT count(*) AS total, count(*) FILTER (WHERE "expiresAt" <= now()) AS expired FROM "RateLimitBucket"`;
      const expired = Number(counts?.expired ?? 0);
      const detail = `writable; ${Number(counts?.total ?? 0)} buckets, ${expired} expired awaiting cleanup`;
      return expired > EXPIRED_BUCKETS_WARN
        ? warn(`${detail}; the cleanup is not keeping up`)
        : ok(detail);
    })
  );

  checks.push(
    await attempt("administrators", async () => {
      const [admins, confirmed, staffUnconfirmed] = await Promise.all([
        db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
        db.user.count({
          where: { role: "ADMIN", status: "ACTIVE", emailVerifiedAt: { not: null } }
        }),
        db.user.count({
          where: { role: { in: ["MODERATOR", "ADMIN"] }, status: "ACTIVE", emailVerifiedAt: null }
        })
      ]);
      if (admins === 0)
        return warn(
          "there is no active administrator; create one with `pnpm --filter @sidewalk/api admin:promote`"
        );
      if (confirmed === 0) {
        const message = `none of the ${admins} active administrator(s) has a confirmed email address, so nobody can use the admin tools`;
        return ctx.adminsMustBeConfirmed ? fail(message) : warn(message);
      }
      return staffUnconfirmed > 0
        ? warn(
            `${confirmed} confirmed administrator(s); ${staffUnconfirmed} staff account(s) still unconfirmed and locked out of staff tools`
          )
        : ok(`${confirmed} confirmed administrator(s); every staff account is confirmed`);
    })
  );

  if (ctx.storage) {
    const storage = ctx.storage;
    checks.push(
      await attempt("evidence storage", async () => {
        await storage.ping();
        return ok("reachable");
      })
    );
  }
  return checks;
}

export function worst(checks: Check[]): Severity {
  return checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "ok";
}

export function formatChecks(checks: Check[]): string {
  const mark = { ok: "OK  ", warn: "WARN", fail: "FAIL" } as const;
  return checks.map((c) => `${mark[c.status]}  ${c.name.padEnd(18)} ${c.detail}`).join("\n");
}
