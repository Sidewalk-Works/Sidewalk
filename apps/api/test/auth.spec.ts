import request from "supertest";
import {
  Client,
  ORIGIN,
  PASSWORD,
  createApp,
  createUser,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";

describe("Authentication", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
  });
  afterAll(() => t.close());

  it("registration answers neutrally, signs nobody in and returns no credentials", async () => {
    const client = new Client(t.app);
    const res = await client.agent
      .post("/api/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({ email: "Ada@Example.test ", displayName: "Ada Obi", password: PASSWORD });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "check_email" });
    expect(res.headers["set-cookie"]).toBeUndefined();
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "ada@example.test" } });
    expect(user).toMatchObject({ displayName: "Ada Obi", role: "CITIZEN", emailVerifiedAt: null });
    // Signing in is a separate, deliberate step.
    const login = await client.login("ada@example.test");
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(false);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    const access = cookies.find((c) => c.startsWith("sw_at="))!;
    const refresh = cookies.find((c) => c.startsWith("sw_rt="))!;
    const csrf = cookies.find((c) => c.startsWith("sw_csrf="))!;
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(JSON.stringify(login.body)).not.toMatch(/token|passwordHash/i);
  });

  it("stores an Argon2id hash, never the password", async () => {
    await new Client(t.app).agent
      .post("/api/v1/auth/register")
      .send({ email: "hash@example.test", displayName: "Hash Test", password: PASSWORD });
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "hash@example.test" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects weak, short and malformed input with field-level errors", async () => {
    const agent = new Client(t.app).agent;
    const short = await agent
      .post("/api/v1/auth/register")
      .send({ email: "a@example.test", displayName: "A B", password: "short" });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("VALIDATION_FAILED");
    expect(short.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "password" })])
    );

    const common = await agent
      .post("/api/v1/auth/register")
      .send({ email: "b@example.test", displayName: "B C", password: "password123" });
    expect(common.status).toBe(400);
    expect(common.body.code).toBe("WEAK_PASSWORD");

    const badEmail = await agent
      .post("/api/v1/auth/register")
      .send({ email: "nope", displayName: "No Pe", password: PASSWORD });
    expect(badEmail.status).toBe(400);

    const extra = await agent
      .post("/api/v1/auth/register")
      .send({ email: "c@example.test", displayName: "C D", password: PASSWORD, role: "ADMIN" });
    expect(extra.status).toBe(400); // mass-assignment of a role is rejected, not ignored
  });

  it("does not let anyone register as an administrator", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const me = await client.get("/auth/me");
    expect(me.body.user.role).toBe("CITIZEN");
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    await createUser(t.prisma, { email: "real@example.test" });
    const wrong = await new Client(t.app).login("real@example.test", "Wrong-password-123");
    const unknown = await new Client(t.app).login("ghost@example.test", "Wrong-password-123");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("answers registration with an address that already exists exactly like a new one", async () => {
    await createUser(t.prisma, { email: "taken@example.test" });
    const fresh = await request(t.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "brand-new@example.test", displayName: "Someone", password: PASSWORD });
    const taken = await request(t.app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "taken@example.test", displayName: "Someone", password: PASSWORD });
    expect(taken.status).toBe(fresh.status);
    expect(taken.body).toEqual(fresh.body);
    expect(await t.prisma.user.count({ where: { email: "taken@example.test" } })).toBe(1);
  });

  it("protects authenticated routes", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401, code: "UNAUTHENTICATED" });
    expect((await request(t.app.getHttpServer()).get("/api/v1/reports/mine")).status).toBe(401);
  });

  it("rotates the refresh token and detects reuse of an old one", async () => {
    const { user, client } = await signedIn(t.app, t.prisma);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(1);

    const first = await client.refresh();
    expect(first.status).toBe(200);
    expect(await t.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(2);
    expect((await client.get("/auth/me")).status).toBe(200);
  });

  it("revokes the whole login chain when an already-rotated refresh token is replayed", async () => {
    const user = await createUser(t.prisma);
    const raw = request(t.app.getHttpServer());
    const login = await raw
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: PASSWORD });
    const set = login.headers["set-cookie"] as unknown as string[];
    const pick = (name: string) => set.find((c) => c.startsWith(`${name}=`))!.split(";")[0]!;
    const cookie = `${pick("sw_rt")}; ${pick("sw_csrf")}`;
    const csrf = pick("sw_csrf").slice("sw_csrf=".length);

    const rotated = await raw
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({});
    expect(rotated.status).toBe(200);

    // Replay after the grace period: backdate the revocation so it looks like a stolen, old token.
    await t.prisma.session.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) }
    });
    const replay = await raw
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({});
    expect(replay.status).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("logout revokes the session server-side", async () => {
    const { user, client } = await signedIn(t.app, t.prisma);
    const out = await client.post("/auth/logout", {});
    expect(out.status).toBe(204);
    expect(await t.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("rejects cookie-authenticated writes without the CSRF token", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const res = await client.agent.post("/api/v1/auth/logout").set("Origin", ORIGIN).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_FAILED");
  });

  it("rejects writes from a foreign origin", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    const res = await client.agent
      .post("/api/v1/auth/logout")
      .set("Origin", "https://evil.example")
      .set("X-CSRF-Token", client.csrf!)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BAD_ORIGIN");
  });

  it("cuts off a suspended user on the very next request", async () => {
    const { user, client } = await signedIn(t.app, t.prisma);
    expect((await client.get("/auth/me")).status).toBe(200);
    await t.prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    expect((await client.get("/auth/me")).status).toBe(401);
    expect((await new Client(t.app).login(user.email)).status).toBe(401);
  });

  it("changes password, signs out other sessions and keeps the current one", async () => {
    const { user, client } = await signedIn(t.app, t.prisma);
    const other = new Client(t.app);
    await other.login(user.email);

    const bad = await client.post("/users/me/password", {
      currentPassword: "nope-nope-nope",
      newPassword: "Another-strong-pass-1"
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_CURRENT_PASSWORD");

    const ok = await client.post("/users/me/password", {
      currentPassword: PASSWORD,
      newPassword: "Another-strong-pass-1"
    });
    expect(ok.status).toBe(204);
    expect(await t.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
    expect((await new Client(t.app).login(user.email, "Another-strong-pass-1")).status).toBe(200);
  });

  it("anonymises a deleted account but keeps its reports", async () => {
    const { user, client } = await signedIn(t.app, t.prisma);
    const reportRes = await client.post("/reports", {
      title: "Burst pipe on the main road",
      description: "A burst pipe has been leaking for two days and the road is breaking up.",
      categorySlug: "roads-and-potholes",
      latitude: 6.5,
      longitude: 3.3,
      showReporterName: true,
      clientRequestId: "6a1f9a5e-7a1c-4f0e-9b43-7c0e3f2f2b11"
    });
    expect(reportRes.status).toBe(201);
    const del = await client.del("/users/me", { password: PASSWORD });
    expect(del.status).toBe(204);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.status).toBe("DELETED");
    expect(row.email).toMatch(/^deleted-/);
    const publicView = await request(t.app.getHttpServer()).get(
      `/api/v1/reports/${reportRes.body.reference}`
    );
    expect(publicView.status).toBe(200);
    expect(publicView.body.reporterName).toBeNull();
  });

  it("throttles repeated login attempts", async () => {
    const strict = await createApp({ rateLimitMultiplier: 1 });
    try {
      const agent = request(strict.app.getHttpServer());
      let last = 0;
      for (let i = 0; i < 12; i++)
        last = (
          await agent
            .post("/api/v1/auth/login")
            .send({ email: "x@example.test", password: "whatever-123" })
        ).status;
      expect(last).toBe(429);
    } finally {
      await strict.close();
      process.env.RATE_LIMIT_MULTIPLIER = "1000";
    }
  });
});
