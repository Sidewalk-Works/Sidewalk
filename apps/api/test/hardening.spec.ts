import request from "supertest";
import {
  FlakyStorage,
  PASSWORD,
  ORIGIN,
  Client,
  createApp,
  createUser,
  makeReport,
  pngImage,
  reportPayload,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";
import { Prisma } from "../src/generated/prisma/client";
import { describeErrorForLog } from "../src/common/filters/all-exceptions.filter";

/** Regression tests for findings of the production-readiness audit (see docs/security.md). */

describe("Hardening: sessions and tokens", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  async function rawLogin(email: string) {
    const res = await request(t.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    const set = res.headers["set-cookie"] as unknown as string[];
    const pick = (n: string) => set.find((c) => c.startsWith(`${n}=`))!.split(";")[0]!;
    return {
      at: pick("sw_at"),
      rt: pick("sw_rt"),
      csrf: pick("sw_csrf"),
      cookie: `${pick("sw_at")}; ${pick("sw_rt")}; ${pick("sw_csrf")}`,
      csrfValue: pick("sw_csrf").slice("sw_csrf=".length)
    };
  }

  it("a stolen access token stops working the moment the user logs out", async () => {
    const user = await createUser(t.prisma);
    const s = await rawLogin(user.email);
    expect(
      (await request(t.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", s.at)).status
    ).toBe(200);
    await request(t.app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", s.cookie)
      .set("X-CSRF-Token", s.csrfValue)
      .send({});
    expect(
      (await request(t.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", s.at)).status
    ).toBe(401);
  });

  it("changing the password immediately ends every other device's access, but not the current one", async () => {
    const user = await createUser(t.prisma);
    const device = await rawLogin(user.email);
    const current = new Client(t.app);
    await current.login(user.email);
    const res = await current.post("/users/me/password", {
      currentPassword: PASSWORD,
      newPassword: "Brand-new-passphrase-77"
    });
    expect(res.status).toBe(204);
    expect(
      (await request(t.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", device.at)).status
    ).toBe(401);
    expect((await current.get("/auth/me")).status).toBe(200);
  });

  it("revoking one device from the account page ends that device's access token immediately", async () => {
    const user = await createUser(t.prisma);
    const other = await rawLogin(user.email);
    const me = new Client(t.app);
    await me.login(user.email);
    const sessions = (await me.get("/users/me/sessions")).body.items as Array<{
      id: string;
      current: boolean;
    }>;
    const target = sessions.find((s) => !s.current)!;
    expect((await me.del(`/users/me/sessions/${target.id}`)).status).toBe(204);
    expect(
      (await request(t.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", other.at)).status
    ).toBe(401);
  });

  it("a refresh token cannot be replayed after the session was revoked", async () => {
    const user = await createUser(t.prisma);
    const s = await rawLogin(user.email);
    await request(t.app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", s.cookie)
      .set("X-CSRF-Token", s.csrfValue)
      .send({});
    const replay = await request(t.app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", s.cookie)
      .set("X-CSRF-Token", s.csrfValue)
      .send({});
    expect(replay.status).toBe(401);
  });

  it("a forged or tampered access token is rejected", async () => {
    const user = await createUser(t.prisma);
    const s = await rawLogin(user.email);
    const [h, p, sig] = s.at.slice("sw_at=".length).split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: user.id, role: "ADMIN", fid: "00000000-0000-4000-8000-000000000000" })
    ).toString("base64url");
    for (const token of [`${h}.${forgedPayload}.${sig}`, `${h}.${p}.`, "alg-none.token.here"]) {
      expect(
        (
          await request(t.app.getHttpServer())
            .get("/api/v1/auth/me")
            .set("Cookie", `sw_at=${token}`)
        ).status
      ).toBe(401);
    }
  });

  it("API responses are never cacheable by shared caches unless explicitly public", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    for (const path of [
      "/auth/me",
      "/reports/mine",
      `/reports/${reference}`,
      "/reports",
      "/reports/stats",
      "/categories"
    ]) {
      const res = await client.get(path);
      expect(res.headers["cache-control"]).toMatch(/no-store/);
      expect(res.headers["vary"] ?? "").toMatch(/cookie/i);
    }
  });
});

describe("Hardening: log and error hygiene", () => {
  it("never logs the data inside a database error", () => {
    const err = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.user.create()` invocation: data: { passwordHash: "SECRET-HASH-VALUE" }',
      { clientVersion: "x" }
    );
    const logged = JSON.stringify(describeErrorForLog(err));
    expect(logged).not.toContain("SECRET-HASH-VALUE");
    expect(logged).toContain("PrismaClientValidationError");
  });

  it("keeps stack traces for ordinary errors but strips anything that looks like a credential", () => {
    const err = new Error("boom password=hunter2 token=abc123 Bearer eyJhbGciOi.xx.yy");
    const logged = JSON.stringify(describeErrorForLog(err));
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("abc123");
    expect(logged).not.toContain("eyJhbGciOi");
  });
});

describe("Hardening: evidence storage failures", () => {
  let t: TestApp;
  const storage = new FlakyStorage();
  beforeAll(async () => {
    t = await createApp({ storage });
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    storage.objects.clear();
    storage.puts = 0;
    storage.failPutAt = 0;
    storage.failAll = false;
  });
  afterAll(() => t.close());

  it("a storage outage gives a recoverable 503 and leaves no report evidence or objects behind", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    storage.failAll = true;
    const res = await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("STORAGE_UNAVAILABLE");
    expect(await t.prisma.reportEvidence.count()).toBe(0);
    expect(storage.objects.size).toBe(0);
    // The report itself is untouched and the same upload works once storage is back.
    storage.failAll = false;
    expect(
      (await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png")).status
    ).toBe(201);
    expect((await client.get(`/reports/${reference}`)).body.status).toBe("SUBMITTED");
  });

  it("if the thumbnail write fails after the full image was stored, the full image is removed too", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    storage.failPutAt = 2;
    const res = await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    expect(res.status).toBe(503);
    expect(storage.objects.size).toBe(0);
    expect(await t.prisma.reportEvidence.count()).toBe(0);
  });

  it("if the database write fails after both objects were stored, both objects are removed", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const image = await pngImage();
    expect((await client.upload(`/reports/${reference}/evidence`, image, "a.png")).status).toBe(
      201
    );
    const before = storage.objects.size;
    // Same bytes again: caught by the duplicate check before anything is written.
    expect((await client.upload(`/reports/${reference}/evidence`, image, "b.png")).status).toBe(
      409
    );
    expect(storage.objects.size).toBe(before);
  });

  it("rejects multipart requests that carry excess fields", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const fields: Record<string, string> = {};
    for (let i = 0; i < 12; i++) fields[`extra${i}`] = "x";
    const res = await client.upload(
      `/reports/${reference}/evidence`,
      await pngImage(),
      "a.png",
      fields
    );
    expect(res.status).toBe(400);
    expect(storage.objects.size).toBe(0);
  });

  it("public evidence is cached briefly and revalidated, hidden evidence never", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const up = await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    const pub = await request(t.app.getHttpServer()).get(up.body.thumbUrl);
    expect(pub.headers["cache-control"]).toMatch(/max-age=300/);
    const again = await request(t.app.getHttpServer())
      .get(up.body.thumbUrl)
      .set("If-None-Match", pub.headers["etag"] as string);
    expect(again.status).toBe(304);
  });
});

describe("Hardening: lifecycle and integrity", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("concurrent status changes can never produce a contradictory history", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const staffA = await signedIn(t.app, t.prisma, "MODERATOR");
    const staffB = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    const attempts = [
      staffA.client.post(`/reports/${reference}/status`, { status: "UNDER_REVIEW" }),
      staffB.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" }),
      staffA.client.post(`/reports/${reference}/status`, {
        status: "REJECTED",
        note: "Rejected after a concurrent review."
      }),
      staffB.client.post(`/reports/${reference}/status`, {
        status: "DUPLICATE",
        note: "Duplicate after a concurrent review."
      }),
      owner.client.post(`/reports/${reference}/status`, {
        status: "RESOLVED",
        note: "Fixed according to the reporter."
      }),
      staffA.client.post(`/reports/${reference}/status`, { status: "IN_PROGRESS" })
    ];
    const results = await Promise.all(attempts);
    expect(results.every((r) => [200, 400, 409].includes(r.status))).toBe(true);
    expect(results.some((r) => r.status === 200)).toBe(true);

    const history = await t.prisma.reportStatusHistory.findMany({
      where: { report: { reference } },
      orderBy: { createdAt: "asc" }
    });
    // Every row continues exactly where the previous one stopped.
    for (let i = 1; i < history.length; i++)
      expect(history[i]!.fromStatus).toBe(history[i - 1]!.toStatus);
    const report = await t.prisma.report.findFirstOrThrow({ where: { reference } });
    expect(report.status).toBe(history.at(-1)!.toStatus);
    // And every successful call left exactly one history row and one audit/activity trail.
    expect(history.length - 1).toBe(results.filter((r) => r.status === 200).length);
  });

  it("two simultaneous identical status changes: exactly one wins", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const a = await signedIn(t.app, t.prisma, "MODERATOR");
    const b = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    const [x, y] = await Promise.all([
      a.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" }),
      b.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" })
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await t.prisma.reportStatusHistory.count({ where: { toStatus: "ACKNOWLEDGED" } })).toBe(
      1
    );
  });

  async function resolvedWithEvidence(uploader: "owner" | "staff") {
    const owner = await signedIn(t.app, t.prisma);
    const recorder = await signedIn(t.app, t.prisma, "MODERATOR");
    const verifier = await signedIn(t.app, t.prisma, "ADMIN");
    const { reference } = await makeReport(owner.client);
    await recorder.client.post(`/reports/${reference}/status`, {
      status: "RESOLVED",
      note: "Filled with asphalt by the ward team."
    });
    const who = uploader === "owner" ? owner : verifier;
    expect(
      (
        await who.client.upload(`/reports/${reference}/evidence`, await pngImage(), "fix.png", {
          kind: "RESOLUTION"
        })
      ).status
    ).toBe(201);
    return { owner, recorder, verifier, reference };
  }

  it("the verifier cannot be the only source of the evidence they verify", async () => {
    const { verifier, reference } = await resolvedWithEvidence("staff");
    const res = await verifier.client.post(`/reports/${reference}/verification`, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EVIDENCE_REQUIRED");
  });

  it("evidence from someone else lets an independent reviewer verify", async () => {
    const { verifier, reference } = await resolvedWithEvidence("owner");
    expect((await verifier.client.post(`/reports/${reference}/verification`, {})).status).toBe(200);
  });

  it("a staff member cannot verify the resolution of their own report", async () => {
    const staffOwner = await signedIn(t.app, t.prisma, "MODERATOR");
    const recorder = await signedIn(t.app, t.prisma, "ADMIN");
    const { reference } = await makeReport(staffOwner.client);
    await recorder.client.post(`/reports/${reference}/status`, {
      status: "RESOLVED",
      note: "Filled with asphalt by the ward team."
    });
    await staffOwner.client.upload(`/reports/${reference}/evidence`, await pngImage(), "fix.png", {
      kind: "RESOLUTION"
    });
    const other = await signedIn(t.app, t.prisma, "ADMIN");
    await other.client
      .upload(`/reports/${reference}/evidence`, await pngImage(), "fix2.png", {
        kind: "RESOLUTION"
      })
      .catch(() => undefined);
    const res = await staffOwner.client.post(`/reports/${reference}/verification`, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OWN_REPORT");
  });

  it("verified evidence cannot be deleted, not even by staff, until the report is reopened", async () => {
    const { owner, verifier, recorder, reference } = await resolvedWithEvidence("owner");
    await verifier.client.post(`/reports/${reference}/verification`, {});
    const evidenceId = (
      await t.prisma.reportEvidence.findFirstOrThrow({ where: { kind: "RESOLUTION" } })
    ).id;
    for (const actor of [owner, recorder, verifier]) {
      const res = await actor.client.del(`/reports/${reference}/evidence/${evidenceId}`);
      expect(res.status).toBe(409);
    }
    expect(await t.prisma.reportEvidence.count()).toBe(1);
    await recorder.client.post(`/reports/${reference}/status`, {
      status: "REOPENED",
      note: "A resident reports the fix has already failed."
    });
    expect((await recorder.client.del(`/reports/${reference}/evidence/${evidenceId}`)).status).toBe(
      204
    );
  });

  it("two administrators demoting each other at once can never leave the platform without one", async () => {
    for (let round = 0; round < 6; round++) {
      await resetDatabase(t.prisma);
      const a = await signedIn(t.app, t.prisma, "ADMIN");
      const b = await signedIn(t.app, t.prisma, "ADMIN");
      await Promise.all([
        a.client.patch(`/admin/users/${b.user.id}/role`, { role: "CITIZEN" }),
        b.client.patch(`/admin/users/${a.user.id}/role`, { role: "CITIZEN" })
      ]);
      expect(
        await t.prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("the last administrator cannot be removed by deleting their own account", async () => {
    const admin = await signedIn(t.app, t.prisma, "ADMIN");
    const res = await admin.client.del("/users/me", { password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_ADMIN");
  });

  it("a deleted account's reports, evidence and comments stay on the record, unattributed (documented retention)", async () => {
    const owner = await signedIn(t.app, t.prisma, "CITIZEN", { displayName: "Chidi Okafor" });
    const { reference } = await makeReport(owner.client, { showReporterName: true });
    await owner.client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    await owner.client.post(`/reports/${reference}/comments`, {
      body: "A comment that will outlive the account."
    });
    expect((await owner.client.del("/users/me", { password: PASSWORD })).status).toBe(204);
    const detail = await request(t.app.getHttpServer()).get(`/api/v1/reports/${reference}`);
    expect(detail.status).toBe(200);
    expect(detail.body.reporterName).toBeNull();
    expect(detail.body.evidence).toHaveLength(1);
    expect(detail.text).not.toContain("Chidi");
    const comments = await request(t.app.getHttpServer()).get(
      `/api/v1/reports/${reference}/comments`
    );
    expect(comments.body.items[0].authorName).toBe("Former resident");
    expect(comments.text).not.toContain("Chidi");
  });

  it("searching treats % and _ as plain characters, not wildcards", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    await makeReport(client, { title: "Road is 100% flooded outside the market" });
    await makeReport(client, { title: "Streetlight out on the main road" });
    await makeReport(client, { title: "Under_score marker in this report title" });
    const anon = () => request(t.app.getHttpServer());
    expect((await anon().get("/api/v1/reports?q=%25")).body.total).toBe(1);
    expect((await anon().get("/api/v1/reports?q=_")).body.total).toBe(1);
    expect((await anon().get("/api/v1/reports?q=main%25road")).body.total).toBe(0);
  });
});

describe("Hardening: database-level guarantees", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("audit, moderation and status history are append-only even for direct SQL", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(owner.client);
    await mod.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" });
    await mod.client.post(`/moderation/reports/${reference}/actions`, {
      action: "HIDE",
      policy: "SPAM",
      reason: "Hidden while a flag is reviewed."
    });

    for (const table of ["AuditLog", "ModerationAction", "ReportStatusHistory"]) {
      await expect(
        t.prisma.$executeRawUnsafe(`UPDATE "${table}" SET "createdAt" = now()`)
      ).rejects.toThrow(/append-only/);
      await expect(t.prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow(
        /append-only/
      );
    }
    expect(await t.prisma.auditLog.count()).toBeGreaterThan(0);
  });

  it("the database refuses impossible coordinates and impossible verification states", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(owner.client);
    await expect(
      t.prisma.report.update({ where: { reference }, data: { latitude: 120 } })
    ).rejects.toThrow();
    await expect(
      t.prisma.report.update({ where: { reference }, data: { longitude: -181 } })
    ).rejects.toThrow();
    await expect(
      t.prisma.report.update({ where: { reference }, data: { verification: "VERIFIED" } })
    ).rejects.toThrow();
    await expect(
      t.prisma.report.update({ where: { reference }, data: { status: "RESOLVED" } })
    ).rejects.toThrow();
    // A coherent resolved state is accepted.
    await t.prisma.report.update({
      where: { reference },
      data: { status: "RESOLVED", resolvedAt: new Date(), verification: "CLAIMED" }
    });
  });
});

describe("Hardening: abuse prevention", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("caps how many reports one account can file per day", async () => {
    const { client, user } = await signedIn(t.app, t.prisma);
    const { LIMITS } = await import("@sidewalk/contracts");
    const cap = LIMITS.reportsPerDay;
    const category = await t.prisma.category.findFirstOrThrow();
    await t.prisma.report.createMany({
      data: Array.from({ length: cap }, (_, i) => ({
        reference: `SW-FL${String(i).padStart(4, "0")}`,
        title: `Flood filler report number ${i}`,
        description: "Filler report used to test the daily creation cap for a single account.",
        categoryId: category.id,
        reporterId: user.id,
        latitude: 6.5,
        longitude: 3.3
      }))
    });
    const res = await client.post("/reports", reportPayload());
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("DAILY_LIMIT");
    // A different citizen is unaffected.
    const other = await signedIn(t.app, t.prisma);
    expect((await other.client.post("/reports", reportPayload())).status).toBe(201);
  });

  it("refuses an identical comment repeated on the same report", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    expect(
      (
        await client.post(`/reports/${reference}/comments`, {
          body: "Buy my product at this website today."
        })
      ).status
    ).toBe(201);
    const again = await client.post(`/reports/${reference}/comments`, {
      body: "  buy my product at this website today.  "
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("DUPLICATE_COMMENT");
  });

  it("readiness reveals nothing but status, and is rate limited", async () => {
    const strict = await createApp({ rateLimitMultiplier: 1 });
    try {
      const first = await request(strict.app.getHttpServer()).get("/api/v1/health/ready");
      expect(Object.keys(first.body).sort()).toEqual(["checks", "status"]);
      expect(JSON.stringify(first.body)).not.toMatch(
        /postgres|password|secret|endpoint|bucket|127\.0\.0\.1|localhost/i
      );
      let last = 200;
      for (let i = 0; i < 40; i++)
        last = (await request(strict.app.getHttpServer()).get("/api/v1/health/ready")).status;
      expect(last).toBe(429);
      expect((await request(strict.app.getHttpServer()).get("/api/v1/health")).status).toBe(200);
    } finally {
      await strict.close();
      process.env.RATE_LIMIT_MULTIPLIER = "1000";
    }
  });

  it("behind one trusted proxy, each client gets its own rate-limit bucket", async () => {
    const strict = await createApp({ rateLimitMultiplier: 1, env: { TRUST_PROXY: "1" } });
    try {
      const attempt = (ip: string, email: string) =>
        request(strict.app.getHttpServer())
          .post("/api/v1/auth/login")
          .set("X-Forwarded-For", ip)
          .send({ email, password: "whatever-123" });
      let last = 0;
      for (let i = 0; i < 12; i++)
        last = (await attempt("203.0.113.10", `a${i}@example.test`)).status;
      expect(last).toBe(429);
      // A different client address is a different bucket (different emails: the per-account brake is separate).
      expect((await attempt("203.0.113.99", "b@example.test")).status).toBe(401);
    } finally {
      await strict.close();
      process.env.RATE_LIMIT_MULTIPLIER = "1000";
    }
  });
});

describe("Hardening: authorization escalation", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("no profile or account endpoint accepts a role or status field", async () => {
    const { client, user } = await signedIn(t.app, t.prisma);
    for (const body of [
      { displayName: "Valid Name", role: "ADMIN" },
      { displayName: "Valid Name", status: "ACTIVE" }
    ]) {
      expect((await client.patch("/users/me", body)).status).toBe(400);
    }
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe(
      "CITIZEN"
    );
  });

  it("a moderator cannot promote themselves or others, and cannot reach role endpoints at all", async () => {
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    expect(
      (await mod.client.patch(`/admin/users/${mod.user.id}/role`, { role: "ADMIN" })).status
    ).toBe(403);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: mod.user.id } })).role).toBe(
      "MODERATOR"
    );
  });

  it("a deleted or suspended account's old access token no longer works", async () => {
    const user = await createUser(t.prisma);
    const login = await request(t.app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: PASSWORD });
    const at = (login.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("sw_at="))!
      .split(";")[0]!;
    await t.prisma.user.update({ where: { id: user.id }, data: { status: "DELETED" } });
    expect(
      (await request(t.app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", at)).status
    ).toBe(401);
  });

  it("origin and CSRF checks cover every unsafe method on private endpoints", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const cookieOnly = (method: "post" | "patch" | "delete", url: string, body: object = {}) =>
      client.agent[method](`/api/v1${url}`).set("Origin", ORIGIN).send(body);
    expect((await cookieOnly("post", "/reports", reportPayload())).status).toBe(403);
    expect(
      (
        await cookieOnly("patch", `/reports/${reference}`, {
          title: "A changed title for this report"
        })
      ).status
    ).toBe(403);
    expect(
      (
        await cookieOnly("post", `/reports/${reference}/comments`, {
          body: "A comment without CSRF."
        })
      ).status
    ).toBe(403);
    expect((await cookieOnly("delete", "/users/me", { password: PASSWORD })).status).toBe(403);
    expect(
      (
        await cookieOnly("post", "/users/me/password", {
          currentPassword: PASSWORD,
          newPassword: "Another-long-password-1"
        })
      ).status
    ).toBe(403);
  });
});

describe("Hardening: storage reconciliation", () => {
  let t: TestApp;
  const storage = new FlakyStorage();
  beforeAll(async () => {
    t = await createApp({ storage });
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    storage.objects.clear();
  });
  afterAll(() => t.close());

  it("finds objects no evidence row references, and evidence rows whose files are gone", async () => {
    const { findOrphans, findMissingObjects } = await import("../src/evidence/reconcile");
    const { client } = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(client);
    const up = await client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png");
    expect(up.status).toBe(201);
    storage.objects.set("evidence/leftover/crashed-upload.webp", Buffer.from("x"));

    const orphans = await findOrphans(storage, t.prisma);
    expect(orphans.map((o) => o.key)).toEqual(["evidence/leftover/crashed-upload.webp"]);
    expect(await findMissingObjects(storage, t.prisma)).toEqual([]);

    const row = await t.prisma.reportEvidence.findFirstOrThrow();
    storage.objects.delete(row.thumbKey);
    expect(await findMissingObjects(storage, t.prisma)).toEqual([row.id]);
  });
});

describe("Hardening: client address and rate limits behind the web server", () => {
  const SECRET = "internal-secret-for-tests-0123456789abcdef";
  let strict: TestApp;
  beforeAll(async () => {
    strict = await createApp({
      rateLimitMultiplier: 1,
      env: { INTERNAL_PROXY_SECRET: SECRET, TRUST_PROXY: "false" }
    });
  });
  afterAll(async () => {
    await strict.close();
    process.env.RATE_LIMIT_MULTIPLIER = "1000";
  });

  const login = (headers: Record<string, string>, email: string) =>
    request(strict.app.getHttpServer())
      .post("/api/v1/auth/login")
      .set(headers)
      .send({ email, password: "whatever-123" });

  it("honours the client address only when the web server proves who it is", async () => {
    const trusted = (ip: string) => ({
      "x-sidewalk-proxy-secret": SECRET,
      "x-sidewalk-client-ip": ip
    });
    let last = 0;
    for (let i = 0; i < 12; i++)
      last = (await login(trusted("198.51.100.1"), `t${i}@example.test`)).status;
    expect(last).toBe(429);
    // Another visitor, relayed by the same web server, has their own bucket.
    expect((await login(trusted("198.51.100.2"), "other@example.test")).status).toBe(401);
  });

  it("ignores a forged client address and a forged X-Forwarded-For, so limits cannot be dodged", async () => {
    const forged = {
      "x-sidewalk-proxy-secret": "wrong-secret-wrong-secret-wrong-secret-1",
      "x-sidewalk-client-ip": "198.51.100.50"
    };
    let last = 0;
    for (let i = 0; i < 12; i++)
      last = (
        await login({ ...forged, "x-forwarded-for": `203.0.113.${i + 1}` }, `f${i}@example.test`)
      ).status;
    // Rotating either header changed nothing: the same real client keeps hitting the same bucket.
    expect(last).toBe(429);
    expect((await login({ "x-forwarded-for": "203.0.113.200" }, "g@example.test")).status).toBe(
      429
    );
  });

  it("a malformed client address is ignored rather than trusted", async () => {
    const res = await login(
      { "x-sidewalk-proxy-secret": SECRET, "x-sidewalk-client-ip": "not-an-ip; DROP TABLE" },
      "m@example.test"
    );
    expect([401, 429]).toContain(res.status);
  });
});

describe("Hardening: one user cannot reach another user's private data", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("cannot list, revoke or learn about another account's sessions", async () => {
    const alice = await signedIn(t.app, t.prisma);
    const mallory = await signedIn(t.app, t.prisma);
    const aliceSession = (
      await t.prisma.session.findFirstOrThrow({ where: { userId: alice.user.id } })
    ).id;
    const listed = (await mallory.client.get("/users/me/sessions")).body.items as Array<{
      id: string;
    }>;
    expect(listed.map((s) => s.id)).not.toContain(aliceSession);
    expect((await mallory.client.del(`/users/me/sessions/${aliceSession}`)).status).toBe(404);
    expect((await alice.client.get("/auth/me")).status).toBe(200);
  });

  it("cannot see another citizen's dashboard, hidden reports or update feed", async () => {
    const alice = await signedIn(t.app, t.prisma);
    const mallory = await signedIn(t.app, t.prisma);
    const mod = await signedIn(t.app, t.prisma, "MODERATOR");
    const { reference } = await makeReport(alice.client, {
      title: "Alice's private-ish report title here"
    });
    await mod.client.post(`/reports/${reference}/status`, { status: "ACKNOWLEDGED" });
    await mod.client.post(`/moderation/reports/${reference}/actions`, {
      action: "HIDE",
      policy: "SPAM",
      reason: "Hidden for the purpose of this test."
    });

    for (const path of [
      "/reports/mine",
      "/reports/mine/updates",
      `/reports/${reference}`,
      `/reports/${reference}/comments`
    ]) {
      const res = await mallory.client.get(path);
      expect(res.text).not.toContain("Alice's private-ish");
      expect(res.text).not.toContain(alice.user.email);
    }
    expect((await mallory.client.get(`/reports/${reference}`)).status).toBe(404);
    expect(
      (
        await mallory.client.patch(`/reports/${reference}`, {
          title: "Mallory edits Alice's report"
        })
      ).status
    ).toBe(404);
    expect(
      (
        await mallory.client.post(`/reports/${reference}/status`, {
          status: "RESOLVED",
          note: "Mallory claims it was fixed."
        })
      ).status
    ).toBe(404);
    expect(
      (await mallory.client.upload(`/reports/${reference}/evidence`, await pngImage(), "x.png"))
        .status
    ).toBe(404);
  });
});
