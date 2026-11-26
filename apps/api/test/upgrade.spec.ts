import argon2 from "argon2";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client as Pg } from "pg";
import request from "supertest";
import { ORIGIN, PASSWORD, Client, createApp, type TestApp } from "./helpers";
import { accountsAffected, confirmEmails } from "../src/ops/account-upgrade";
import { expectedMigrations, runOpsChecks } from "../src/ops/checks";
import { buildOutboxKeyring } from "../src/email/outbox-crypto";
import { loadEnv } from "../src/config/env";
import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * The upgrade path, rehearsed on a throwaway database: build it exactly as it was BEFORE email confirmation
 * existed (only the first two migrations), fill it with representative accounts and sessions, then run the
 * real preflight, the real `prisma migrate deploy`, the real application and the real operator commands.
 */
const API_DIR = path.resolve(__dirname, "..");
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const baseUrl = process.env.DATABASE_URL as string;
const name = `sidewalk_upgrade_${randomBytes(4).toString("hex")}`;
const upgradeUrl = baseUrl.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
const adminUrl = baseUrl.replace(/\/[^/?]+(\?|$)/, "/postgres$1").replace(/\?schema=.*/, "");
const pgUrl = (url: string) => url.replace(/\?schema=.*/, "");

function cli(script: string, args: string[], url = upgradeUrl): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", script, ...args], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const EXPECTED = expectedMigrations(path.join(API_DIR, "prisma/migrations"));

describe("Upgrading a deployment that already has accounts", () => {
  jest.setTimeout(240_000);
  let pg: Pg;
  let tmp: string;
  let t: TestApp;
  const sessions: Record<string, string> = {}; // email -> raw refresh token
  const ids: Record<string, string> = {};
  let preflight: { code: number; out: string };
  let verifyBefore: { code: number; out: string };

  const legacyUsers = [
    {
      key: "res1",
      email: "resident.one@legacy.test",
      role: "CITIZEN",
      status: "ACTIVE",
      session: true
    },
    {
      key: "res2",
      email: "resident.two@legacy.test",
      role: "CITIZEN",
      status: "ACTIVE",
      session: false
    },
    {
      key: "res3",
      email: "resident.three@legacy.test",
      role: "CITIZEN",
      status: "ACTIVE",
      session: false
    },
    {
      key: "mod1",
      email: "moderator.one@legacy.test",
      role: "MODERATOR",
      status: "ACTIVE",
      session: true
    },
    {
      key: "mod2",
      email: "moderator.two@legacy.test",
      role: "MODERATOR",
      status: "ACTIVE",
      session: false
    },
    {
      key: "modS",
      email: "moderator.suspended@legacy.test",
      role: "MODERATOR",
      status: "SUSPENDED",
      session: false
    },
    {
      key: "adm1",
      email: "administrator@legacy.test",
      role: "ADMIN",
      status: "ACTIVE",
      session: true
    }
  ] as const;

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "sidewalk-upgrade-"));
    const admin = new Pg({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();

    // 1. The database as it was before this milestone: only the first two migrations.
    const all = expectedMigrations(path.join(API_DIR, "prisma/migrations"));
    expect(all.length).toBeGreaterThanOrEqual(5);
    const old = path.join(tmp, "migrations");
    mkdirSync(old);
    cpSync(
      path.join(API_DIR, "prisma/migrations/migration_lock.toml"),
      path.join(old, "migration_lock.toml")
    );
    for (const m of all.slice(0, 2))
      cpSync(path.join(API_DIR, "prisma/migrations", m), path.join(old, m), { recursive: true });
    const config = path.join(tmp, "prisma.old.config.mjs");
    writeFileSync(
      config,
      `export default { schema: ${JSON.stringify(path.join(API_DIR, "prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(old)} }, datasource: { url: process.env.DATABASE_URL } };`
    );
    execFileSync("npx", ["prisma", "migrate", "deploy", "--config", config], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: upgradeUrl },
      stdio: "pipe"
    });

    // 2. Representative existing data, written with plain SQL against the OLD schema.
    pg = new Pg({ connectionString: pgUrl(upgradeUrl) });
    await pg.connect();
    const hash = await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1
    });
    for (const u of legacyUsers) {
      const id = randomUUID();
      ids[u.key] = id;
      await pg.query(
        `INSERT INTO "User" (id, email, "passwordHash", "displayName", role, status, "updatedAt") VALUES ($1,$2,$3,$4,$5::"Role",$6::"UserStatus", now())`,
        [id, u.email, hash, u.key, u.role, u.status]
      );
      if (u.session) {
        const raw = randomBytes(32).toString("base64url");
        sessions[u.email] = raw;
        await pg.query(
          `INSERT INTO "Session" (id, "userId", "tokenHash", "familyId", "expiresAt") VALUES ($1,$2,$3,$4, now() + interval '20 days')`,
          [randomUUID(), id, sha256(raw), randomUUID()]
        );
      }
    }
    const category = randomUUID();
    await pg.query(
      `INSERT INTO "Category" (id, slug, name, description, "updatedAt") VALUES ($1,'roads-and-potholes','Roads and potholes','Roads.', now())`,
      [category]
    );
    const report = randomUUID();
    await pg.query(
      `INSERT INTO "Report" (id, reference, title, description, "categoryId", latitude, longitude, "reporterId", "updatedAt")
       VALUES ($1,'SW-K7M2Q9','A pothole filed before the upgrade','Filed before email confirmation existed.',$2,6.5,3.3,$3, now())`,
      [report, category, ids.res1]
    );
    await pg.query(
      `INSERT INTO "Comment" (id, "reportId", "authorId", body) VALUES ($1,$2,$3,'A comment written before the upgrade.')`,
      [randomUUID(), report, ids.res2]
    );

    // 3. The real preflight, on the old schema.
    preflight = cli("scripts/account-upgrade.ts", ["preflight"]);

    // 4. The real migration, with the committed migrations directory.
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: upgradeUrl },
      stdio: "pipe"
    });
    verifyBefore = cli("scripts/account-upgrade.ts", ["verify"]);

    // 5. The real application against the upgraded database.
    t = await createApp({ env: { DATABASE_URL: upgradeUrl, OUTBOX_WORKER_ENABLED: "false" } });
  });

  afterAll(async () => {
    await t?.close();
    await pg?.end();
    const admin = new Pg({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    rmSync(tmp, { recursive: true, force: true });
  });

  /** Signs a request in as one of the existing people, using the session they already had before the upgrade. */
  const cookieCache: Record<string, string[]> = {};
  async function existingSession(email: string): Promise<string[]> {
    // Refresh tokens rotate on use (and reuse is treated as theft), so redeem each person's old token only once.
    if (cookieCache[email]) return cookieCache[email];
    const res = await request(t.app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", [`sw_rt=${sessions[email]}`, "sw_csrf=csrf-token-for-test"])
      .set("X-CSRF-Token", "csrf-token-for-test")
      .send({});
    expect(res.status).toBe(200);
    return (cookieCache[email] = (res.headers["set-cookie"] as unknown as string[]).map(
      (c) => c.split(";")[0] as string
    ));
  }
  const as = (cookies: string[], method: "get", url: string) =>
    request(t.app.getHttpServer())[method](`/api/v1${url}`).set("Cookie", cookies);

  it("the preflight, run before migrating, says exactly who will be affected and what to do first", () => {
    expect(preflight.code).toBe(0);
    expect(preflight.out).toContain("residents 3, moderators 2, administrators 1; live sessions 3");
    expect(preflight.out).toMatch(/ACTION\s+All 1 administrator\(s\) will be unconfirmed/);
    expect(preflight.out).toMatch(/WARNING\s+2 moderator\(s\) cannot use moderation tools/);
    expect(preflight.out).toMatch(/NOTE\s+3 resident\(s\) keep reading and signing in/);
    expect(preflight.out).toContain("Take a database backup now");
    // Everything after the two migrations this rehearsal started from is still to be applied.
    expect(preflight.out).toContain(`${EXPECTED.length - 2} pending`);
    // It is read-only: the old schema is untouched.
    expect(preflight.out).not.toMatch(/emailVerifiedAt/);
  });

  it("migrates cleanly, with nothing marked confirmed and no data lost", async () => {
    const users = await t.prisma.user.findMany({
      select: { email: true, emailVerifiedAt: true, status: true }
    });
    expect(users).toHaveLength(legacyUsers.length);
    expect(users.every((u) => u.emailVerifiedAt === null)).toBe(true);
    expect(await t.prisma.report.count()).toBe(1);
    expect(await t.prisma.comment.count()).toBe(1);
    expect(await t.prisma.session.count()).toBe(3);
    // No schema drift between the upgraded database and schema.prisma.
    expect(() =>
      execFileSync(
        "npx",
        [
          "prisma",
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          "prisma/schema.prisma",
          "--exit-code"
        ],
        {
          cwd: API_DIR,
          env: { ...process.env, DATABASE_URL: upgradeUrl },
          stdio: "pipe"
        }
      )
    ).not.toThrow();
  });

  it("adds the organization tables empty, with their guards, and gives nobody new rights", async () => {
    for (const table of [
      "Organization",
      "OrganizationApplication",
      "OrganizationDocument",
      "VerificationDecision",
      "OrganizationMember",
      "OrganizationInvitation",
      "OfficialResponse",
      "ReportOrganization"
    ]) {
      const rows = await t.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM "${table}"`
      );
      expect([table, Number(rows[0]?.n)]).toEqual([table, 0]);
    }
    const triggers = await t.prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('VerificationDecision_append_only', 'OfficialResponse_guard')`;
    expect(triggers.map((r) => r.tgname).sort()).toEqual([
      "OfficialResponse_guard",
      "VerificationDecision_append_only"
    ]);
    // Existing evidence and status history gained nullable links, and nothing was attributed to an organization.
    expect(await t.prisma.reportEvidence.count({ where: { organizationId: { not: null } } })).toBe(
      0
    );
    expect(
      await t.prisma.reportStatusHistory.count({ where: { organizationId: { not: null } } })
    ).toBe(0);
    // A legacy report reads as before, with no organization or official response on it.
    const report = await t.prisma.report.findFirstOrThrow({ select: { reference: true } });
    const res = await request(t.app.getHttpServer()).get(`/api/v1/reports/${report.reference}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ organizations: [], officialResponses: [] });
    expect(res.body.viewer.organizations).toEqual([]);
    // No organization is listed or verified, so nothing on the site is labelled official.
    expect((await request(t.app.getHttpServer()).get("/api/v1/organizations")).body.total).toBe(0);
  });

  it("existing sessions and refresh tokens keep working; people can read and sign in", async () => {
    const resident = await existingSession("resident.one@legacy.test");
    const me = await as(resident, "get", "/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: "resident.one@legacy.test", emailVerified: false });
    expect((await as(resident, "get", "/reports")).status).toBe(200);
    expect((await as(resident, "get", "/reports/SW-K7M2Q9")).body.title).toContain(
      "filed before the upgrade"
    );
    // Signing in with the old password works as before.
    expect((await new Client(t.app).login("resident.two@legacy.test")).status).toBe(200);
  });

  it("unconfirmed residents cannot publish, comment or follow until they confirm", async () => {
    const client = new Client(t.app);
    expect((await client.login("resident.two@legacy.test")).status).toBe(200);
    const post = await client.post("/reports/SW-K7M2Q9/comments", {
      body: "A comment after the upgrade."
    });
    expect(post.status).toBe(403);
    expect(post.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await client.put("/reports/SW-K7M2Q9/follow")).status).toBe(403);
  });

  it("unconfirmed staff are locked out of staff tools, not silently granted anything", async () => {
    const moderator = await existingSession("moderator.one@legacy.test");
    expect((await as(moderator, "get", "/moderation/flags")).status).toBe(403);
    const administrator = await existingSession("administrator@legacy.test");
    expect((await as(administrator, "get", "/admin/email-outbox")).status).toBe(403);
    expect((await as(administrator, "get", "/admin/users")).status).toBe(403);
  });

  it("verify reports the lock-out as a failure before staff are confirmed", () => {
    expect(verifyBefore.code).toBe(2);
    expect(verifyBefore.out).toMatch(/FAIL\s+administrators\s+none of the 1 active administrator/);
    expect(verifyBefore.out).toContain("unconfirmed admin: administrator@legacy.test");
    expect(verifyBefore.out).toContain("unconfirmed moderator: moderator.one@legacy.test");
    expect(verifyBefore.out).toMatch(
      new RegExp(`OK\\s+migrations\\s+${EXPECTED.length} applied, none pending`)
    );
  });

  it("confirming staff needs a reason, whom, and an explicit --apply (a dry run lists but changes nothing)", async () => {
    const db = t.prisma as unknown as PrismaClient;
    await expect(confirmEmails(db, { staff: true }, "short", false)).rejects.toThrow(
      /written reason/
    );
    await expect(confirmEmails(db, {}, "A long enough reason here", false)).rejects.toThrow(
      /Say whom/
    );
    const dry = await confirmEmails(
      db,
      { staff: true },
      "Operator knows the moderation team personally",
      false
    );
    expect(dry.candidates.map((c) => c.email).sort()).toEqual([
      "administrator@legacy.test",
      "moderator.one@legacy.test",
      "moderator.two@legacy.test"
    ]); // the suspended moderator and every resident are not candidates
    expect(dry.applied).toBe(0);
    expect(await t.prisma.user.count({ where: { emailVerifiedAt: { not: null } } })).toBe(0);
    const viaCli = cli("scripts/account-upgrade.ts", [
      "confirm-email",
      "--staff",
      "--reason",
      "Operator knows the moderation team"
    ]);
    expect(viaCli.code).toBe(0);
    expect(viaCli.out).toContain("Would confirm 3 account(s)");
    expect(viaCli.out).toContain("This was a dry run");
    expect(await t.prisma.user.count({ where: { emailVerifiedAt: { not: null } } })).toBe(0);
  });

  it("applying it confirms exactly those accounts, audits each with the reason, and takes effect on the existing session at once", async () => {
    const administrator = await existingSession("administrator@legacy.test");
    expect((await as(administrator, "get", "/admin/email-outbox")).status).toBe(403);

    const done = cli("scripts/account-upgrade.ts", [
      "confirm-email",
      "--staff",
      "--reason",
      "Operator knows the moderation team personally",
      "--apply"
    ]);
    expect(done.code).toBe(0);
    expect(done.out).toContain("Confirmed 3 account(s)");

    // The very same session, with no new sign-in, now works.
    expect((await as(administrator, "get", "/admin/email-outbox")).status).toBe(200);
    expect(
      (await as(await existingSession("moderator.one@legacy.test"), "get", "/moderation/flags"))
        .status
    ).toBe(200);

    const confirmed = await t.prisma.user.findMany({
      where: { emailVerifiedAt: { not: null } },
      select: { email: true }
    });
    expect(confirmed.map((u) => u.email).sort()).toEqual([
      "administrator@legacy.test",
      "moderator.one@legacy.test",
      "moderator.two@legacy.test"
    ]);
    const audit = await t.prisma.auditLog.findMany({ where: { action: "user.email_confirmed" } });
    expect(audit).toHaveLength(3);
    expect(audit[0]?.metadata).toMatchObject({
      via: "cli",
      basis: "operator attestation",
      reason: "Operator knows the moderation team personally"
    });
    expect(audit.every((a) => a.actorId === null)).toBe(true);

    // Residents and the suspended moderator were left alone.
    const untouched = await t.prisma.user.findMany({
      where: { emailVerifiedAt: null },
      select: { email: true }
    });
    expect(untouched.map((u) => u.email).sort()).toEqual([
      "moderator.suspended@legacy.test",
      "resident.one@legacy.test",
      "resident.three@legacy.test",
      "resident.two@legacy.test"
    ]);
  });

  it("is safe to repeat, and an owner confirming by link in the meantime is not overwritten", async () => {
    const db = t.prisma as unknown as PrismaClient;
    const again = await confirmEmails(
      db,
      { staff: true },
      "Operator knows the moderation team personally",
      true
    );
    expect(again).toMatchObject({ applied: 0, candidates: [] });
    await t.prisma.user.update({
      where: { email: "resident.three@legacy.test" },
      data: { emailVerifiedAt: new Date("2026-01-01T00:00:00Z") }
    });
    const result = await confirmEmails(
      db,
      { emails: ["resident.three@legacy.test", "ghost@legacy.test"] },
      "Confirmed by hand, checked in person",
      true
    );
    expect(result.applied).toBe(0);
    expect(result.skipped.sort()).toEqual(["ghost@legacy.test", "resident.three@legacy.test"]);
    const resident = await t.prisma.user.findUniqueOrThrow({
      where: { email: "resident.three@legacy.test" }
    });
    expect(resident.emailVerifiedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    // An individual resident can be confirmed deliberately, by address.
    const one = await confirmEmails(
      db,
      { emails: ["resident.two@legacy.test"] },
      "Verified identity at the ward office",
      true
    );
    expect(one.applied).toBe(1);
  });

  it("verify passes once staff are confirmed, and the monitoring checks agree", async () => {
    const after = cli("scripts/account-upgrade.ts", ["verify"]);
    expect(after.code).toBe(0);
    expect(after.out).toMatch(/OK\s+administrators/);
    expect(after.out).toMatch(/OK\s+rate-limit store/);
    const env = loadEnv();
    const checks = await runOpsChecks({
      db: t.prisma as unknown as PrismaClient,
      env,
      keyring: buildOutboxKeyring(env),
      adminsMustBeConfirmed: true
    });
    expect(checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(await accountsAffected(t.prisma as unknown as PrismaClient)).toMatchObject({
      administrators: { active: 1, confirmed: 1, unconfirmed: 0 },
      moderators: { active: 2, confirmed: 2, unconfirmed: 0 }
    });
  });

  it("a resident confirms by emailed link on the upgraded system, and is unlocked", async () => {
    const client = new Client(t.app);
    expect((await client.login("resident.one@legacy.test")).status).toBe(200);
    const sent = await client.post("/auth/verification/resend", {});
    expect(sent.status).toBe(202);
    const { deliverEmail } = await import("./helpers");
    await deliverEmail(t.app);
    const token = t.email.tokenFor("resident.one@legacy.test");
    expect(token).toBeDefined();
    expect((await new Client(t.app).post("/auth/verification/confirm", { token })).status).toBe(
      200
    );
    expect(
      (
        await client.post("/reports/SW-K7M2Q9/comments", {
          body: "Confirmed and commenting after the upgrade."
        })
      ).status
    ).toBe(201);
  });
  it("the first-administrator bootstrap still works: promote, and optionally confirm the address, both audited", async () => {
    const email = "resident.three@legacy.test";
    await t.prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: null, role: "CITIZEN" }
    });
    const promoted = cli("scripts/promote-admin.ts", ["--email", email]);
    expect(promoted.code).toBe(0);
    let user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    // Promotion alone grants the role but does not pretend the address is confirmed.
    expect(user).toMatchObject({ role: "ADMIN", emailVerifiedAt: null });

    const confirmed = cli("scripts/promote-admin.ts", ["--email", email, "--confirm-email"]);
    expect(confirmed.code).toBe(0);
    expect(confirmed.out).toContain("with a confirmed email address");
    user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    const actions = (
      await t.prisma.auditLog.findMany({
        where: { entityId: user.id },
        orderBy: { createdAt: "asc" }
      })
    ).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["user.role_changed", "user.email_confirmed"]));
    expect(cli("scripts/promote-admin.ts", ["--email", email, "--confirm-email"]).out).toContain(
      "already an administrator"
    );
  });
});
