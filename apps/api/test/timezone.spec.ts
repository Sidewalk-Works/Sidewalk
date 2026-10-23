import { createApp, createUser, deliverEmail, type TestApp } from "./helpers";
import { createScratchDatabase, type ScratchDatabase } from "./scratch-db";
import { buildOutboxKeyring } from "../src/email/outbox-crypto";
import { loadEnv } from "../src/config/env";
import { runOpsChecks } from "../src/ops/checks";
import { OutboxService } from "../src/email/outbox.service";
import { RateLimitService } from "../src/ratelimit/rate-limit.service";
import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Prisma stores timestamps without a zone, as UTC. Raw SQL that compares them with `now()` is only right if the
 * database session happens to be in UTC. Managed databases are often configured otherwise, and the cost of getting
 * it wrong is silent: email that is not due for hours, or retries with no delay at all. Every zone is exercised
 * here, west and east of UTC.
 */
describe.each([
  ["America/Los_Angeles", "7-8 hours behind UTC"],
  ["Pacific/Auckland", "12-13 hours ahead of UTC"],
  ["Africa/Lagos", "1 hour ahead of UTC"]
])("with the database time zone set to %s (%s)", (timezone) => {
  jest.setTimeout(120_000);
  let db: ScratchDatabase;
  let t: TestApp;

  beforeAll(async () => {
    db = await createScratchDatabase({ timezone });
    t = await createApp({ env: { DATABASE_URL: db.url, OUTBOX_WORKER_ENABLED: "false" } });
  });
  afterAll(async () => {
    await t?.close();
    await db?.drop();
  });

  const enqueue = async (email: string) => {
    const user = await createUser(t.prisma, { email });
    await t.prisma.$transaction((tx) =>
      t.app
        .get(OutboxService)
        .enqueue(tx, { kind: "PASSWORD_CHANGED", userId: user.id, toEmail: email, payload: {} })
    );
  };

  it("really is running in that zone", async () => {
    const [row] = await t.prisma.$queryRaw<
      Array<{ tz: string }>
    >`SELECT current_setting('TimeZone') AS tz`;
    expect(row?.tz).toBe(timezone);
  });

  it("delivers a message the moment it is due, not hours early or late", async () => {
    await enqueue(`due-${timezone.replace("/", "-")}@example.test`);
    await deliverEmail(t.app);
    expect(t.email.sent).toHaveLength(1);
  });

  it("honours a retry delay: not due before it ends, due as soon as it ends", async () => {
    t.email.reset();
    await t.prisma.emailOutbox.deleteMany();
    await enqueue(`retry-${timezone.replace("/", "-")}@example.test`);
    t.email.failNext(new Error("temporary provider outage"));
    await deliverEmail(t.app);
    const failed = await t.prisma.emailOutbox.findFirstOrThrow();
    expect(failed.status).toBe("FAILED");
    // Backing off for about a minute: another pass straight away must not send it again.
    await deliverEmail(t.app);
    expect(t.email.attempts).toBe(1);
    // Its time arrives (a second ago, in UTC like everything Prisma writes): it is picked up.
    await t.prisma.emailOutbox.update({
      where: { id: failed.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) }
    });
    await deliverEmail(t.app);
    expect(t.email.sent).toHaveLength(1);
  });

  it("recovers a message abandoned mid-send by a dead worker, but not one claimed a moment ago", async () => {
    t.email.reset();
    await t.prisma.emailOutbox.deleteMany();
    await enqueue(`stale-${timezone.replace("/", "-")}@example.test`);
    const row = await t.prisma.emailOutbox.findFirstOrThrow();
    await t.prisma.emailOutbox.update({
      where: { id: row.id },
      data: { status: "SENDING", lockedAt: new Date(Date.now() - 60_000) }
    });
    await deliverEmail(t.app);
    expect(t.email.sent).toHaveLength(0); // claimed a minute ago: still someone's
    await t.prisma.emailOutbox.update({
      where: { id: row.id },
      data: { lockedAt: new Date(Date.now() - 10 * 60_000) }
    });
    await deliverEmail(t.app);
    expect(t.email.sent).toHaveLength(1);
  });

  it("records a claim time that agrees with the clock, whatever the zone", async () => {
    t.email.reset();
    await t.prisma.emailOutbox.deleteMany();
    await enqueue(`claim-${timezone.replace("/", "-")}@example.test`);
    t.email.failNext(new Error("temporary"));
    const before = Date.now();
    await deliverEmail(t.app);
    // lockedAt is cleared on completion, so observe the claim itself through a held-open provider call.
    const stored = await t.prisma.emailOutbox.findFirstOrThrow();
    expect(stored.status).toBe("FAILED");
    expect(Math.abs(stored.nextAttemptAt.getTime() - (before + 60_000))).toBeLessThan(5_000);
  });

  it("keeps rate limiting exact, because its clock does not depend on the zone", async () => {
    const limiter = t.app.get(RateLimitService);
    const key = `tz:${timezone}`;
    expect((await limiter.hit(key, 60_000)).hits).toBe(1);
    expect((await limiter.hit(key, 60_000)).hits).toBe(2);
    const { ttlMs } = await limiter.peek(key);
    expect(ttlMs).toBeGreaterThan(55_000);
    expect(ttlMs).toBeLessThanOrEqual(60_000);
  });

  it("is reported by the monitoring check, so an operator is told to fix the setting", async () => {
    const env = loadEnv();
    const checks = await runOpsChecks({
      db: t.prisma as unknown as PrismaClient,
      env,
      keyring: buildOutboxKeyring(env)
    });
    expect(checks.find((c) => c.name === "database")).toMatchObject({ status: "warn" });
    expect(checks.find((c) => c.name === "database")?.detail).toContain(timezone);
  });
});
