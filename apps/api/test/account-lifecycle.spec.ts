import { createHash } from "node:crypto";
import request from "supertest";
import {
  Client,
  ORIGIN,
  PASSWORD,
  createApp,
  createUser,
  deliverEmail,
  makeReport,
  pngImage,
  reportPayload,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";

const NEW_PASSWORD = "A-completely-new-passphrase-42";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

describe("Email verification", () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  const register = (email: string, extra: Record<string, string> = {}) =>
    api()
      .post("/api/v1/auth/register")
      .set(extra)
      .send({ email, displayName: "New Resident", password: PASSWORD });

  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(() => t.close());

  async function registered(email = "new@example.test") {
    expect((await register(email)).status).toBe(202);
    await deliverEmail(t.app);
    return t.email.tokenFor(email)!;
  }

  it("emails a one-time link built from the configured origin, and stores only a hash of the token", async () => {
    const token = await registered();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 random bits
    const mail = t.email.to("new@example.test");
    expect(mail).toHaveLength(1);
    expect(mail[0]!.text).toContain(`http://localhost:3010/verify-email/confirm#token=${token}`);
    expect(mail[0]!.html).toContain(
      `href="http://localhost:3010/verify-email/confirm#token=${token}"`
    );

    const row = await t.prisma.authToken.findFirstOrThrow();
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.tokenHash).not.toContain(token);
    expect(row.purpose).toBe("EMAIL_VERIFICATION");
    expect(row.email).toBe("new@example.test");
    // The raw token is nowhere in the database: not in the token table, and not left in the outbox once sent.
    const outbox = await t.prisma.emailOutbox.findFirstOrThrow();
    expect(outbox.status).toBe("SENT");
    expect(outbox.payloadCiphertext).toBeNull();
    expect(JSON.stringify(outbox)).not.toContain(token);
  });

  it("does not hold the link in the outbox in readable form while it waits to be sent", async () => {
    await register("waiting@example.test");
    const outbox = await t.prisma.emailOutbox.findFirstOrThrow();
    expect(outbox.status).toBe("PENDING");
    expect(outbox.payloadCiphertext).toBeTruthy();
    expect(outbox.payloadCiphertext).not.toMatch(/token|verify-email/);
    expect(Buffer.from(outbox.payloadCiphertext!, "base64url").toString("utf8")).not.toMatch(
      /token/
    );
  });

  it("verifies the address once, and the same link cannot be replayed", async () => {
    const token = await registered();
    const first = await api().post("/api/v1/auth/verification/confirm").send({ token });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ status: "verified" });
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { email: "new@example.test" } }))
        .emailVerifiedAt
    ).not.toBeNull();

    const replay = await api().post("/api/v1/auth/verification/confirm").send({ token });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe("TOKEN_INVALID");
  });

  it("refuses an expired link, and leaves the account unverified", async () => {
    const token = await registered();
    await t.prisma.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api().post("/api/v1/auth/verification/confirm").send({ token });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { email: "new@example.test" } }))
        .emailVerifiedAt
    ).toBeNull();
  });

  it("refuses malformed, empty, oversized, guessed and wrong-purpose tokens", async () => {
    await registered();
    for (const token of [
      "",
      "short",
      "x".repeat(43) + "!",
      "../../etc/passwd",
      "A".repeat(43),
      "A".repeat(10_000),
      "' OR 1=1 --"
    ]) {
      const res = await api().post("/api/v1/auth/verification/confirm").send({ token });
      expect(res.status).toBe(400);
    }
    expect((await api().post("/api/v1/auth/verification/confirm").send({})).status).toBe(400);
    expect(
      (await api().post("/api/v1/auth/verification/confirm").send({ token: 12345 })).status
    ).toBe(400);
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { email: "new@example.test" } }))
        .emailVerifiedAt
    ).toBeNull();
  });

  it("a password-reset link cannot verify an email address, nor the reverse", async () => {
    const verifyToken = await registered();
    await api().post("/api/v1/auth/password/forgot").send({ email: "new@example.test" });
    await deliverEmail(t.app);
    const resetToken = t.email.tokenFor("new@example.test")!;
    expect(resetToken).not.toBe(verifyToken);
    expect(
      (await api().post("/api/v1/auth/verification/confirm").send({ token: resetToken })).body.code
    ).toBe("TOKEN_INVALID");
    expect(
      (
        await api()
          .post("/api/v1/auth/password/reset")
          .send({ token: verifyToken, password: NEW_PASSWORD })
      ).body.code
    ).toBe("TOKEN_INVALID");
  });

  it("a newer link revokes the older one", async () => {
    const first = await registered();
    await t.prisma.emailOutbox.updateMany({
      data: { createdAt: new Date(Date.now() - 5 * 60_000) }
    }); // past the resend cooldown
    expect(
      (await api().post("/api/v1/auth/verification/resend").send({ email: "new@example.test" }))
        .status
    ).toBe(202);
    await deliverEmail(t.app);
    const second = t.email.tokenFor("new@example.test")!;
    expect(second).not.toBe(first);
    expect(
      (await api().post("/api/v1/auth/verification/confirm").send({ token: first })).body.code
    ).toBe("TOKEN_INVALID");
    expect(
      (await api().post("/api/v1/auth/verification/confirm").send({ token: second })).status
    ).toBe(200);
  });

  it("simultaneous attempts with one link: exactly one succeeds", async () => {
    const token = await registered();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api().post("/api/v1/auth/verification/confirm").send({ token })
      )
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(7);
    expect((await t.prisma.authToken.findFirstOrThrow()).usedAt).not.toBeNull();
  });

  it("a link does not verify an account whose address has changed since it was sent", async () => {
    const token = await registered();
    await t.prisma.user.update({
      where: { email: "new@example.test" },
      data: { email: "moved@example.test" }
    });
    expect((await api().post("/api/v1/auth/verification/confirm").send({ token })).body.code).toBe(
      "TOKEN_INVALID"
    );
  });

  it("answers the resend request identically for unknown, unverified, verified and suspended addresses", async () => {
    await registered("pending@example.test");
    await createUser(t.prisma, { email: "verified@example.test" });
    await createUser(t.prisma, {
      email: "suspended@example.test",
      status: "SUSPENDED",
      verified: false
    });
    const answers = [];
    for (const email of [
      "nobody@example.test",
      "pending@example.test",
      "verified@example.test",
      "suspended@example.test"
    ]) {
      const res = await api().post("/api/v1/auth/verification/resend").send({ email });
      answers.push({ status: res.status, body: res.body });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]).toEqual({ status: 202, body: { status: "check_email" } });
    await deliverEmail(t.app);
    expect(t.email.to("nobody@example.test")).toHaveLength(0);
    expect(t.email.to("verified@example.test")).toHaveLength(0);
    expect(t.email.to("suspended@example.test")).toHaveLength(0);
  });

  it("limits how many verification emails one account can be sent, whoever asks", async () => {
    await registered("target@example.test");
    for (let i = 0; i < 6; i++) {
      await t.prisma.emailOutbox.updateMany({
        data: { createdAt: new Date(Date.now() - 10 * 60_000 + i) }
      });
      await api().post("/api/v1/auth/verification/resend").send({ email: "target@example.test" });
    }
    // The registration email plus at most two more within the hour; the rest were quietly dropped.
    expect(
      await t.prisma.emailOutbox.count({ where: { kind: "EMAIL_VERIFICATION" } })
    ).toBeLessThanOrEqual(3);
  });

  it("does not send two verification emails within the cooldown", async () => {
    await registered("cool@example.test");
    await api().post("/api/v1/auth/verification/resend").send({ email: "cool@example.test" });
    await api().post("/api/v1/auth/verification/resend").send({ email: "cool@example.test" });
    expect(await t.prisma.emailOutbox.count({ where: { kind: "EMAIL_VERIFICATION" } })).toBe(1);
  });

  it("tells a signed-in user about their own cooldown, but nobody anything about other accounts", async () => {
    const { client, user } = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
    const first = await client.post("/auth/verification/resend", {});
    expect(first.status).toBe(202);
    expect(first.body.status).toBe("queued");
    expect((await client.post("/auth/verification/resend", {})).body.status).toBe("cooldown");
    const about = await client.post("/auth/verification/resend", {
      email: "someone-else@example.test"
    });
    expect(about.body).toEqual({ status: "check_email" });
    expect(await t.prisma.emailOutbox.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rate limits resend and confirm attempts per source", async () => {
    const strict = await createApp({ rateLimitMultiplier: 1 });
    try {
      const resend = () =>
        request(strict.app.getHttpServer())
          .post("/api/v1/auth/verification/resend")
          .send({ email: "x@example.test" });
      const statuses = [];
      for (let i = 0; i < 7; i++) statuses.push((await resend()).status);
      expect(statuses.slice(0, 5).every((s) => s === 202)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
      let last = 0;
      for (let i = 0; i < 22; i++)
        last = (
          await request(strict.app.getHttpServer())
            .post("/api/v1/auth/verification/confirm")
            .send({ token: "A".repeat(43) })
        ).status;
      expect(last).toBe(429);
    } finally {
      await strict.close();
      process.env.RATE_LIMIT_MULTIPLIER = "1000";
    }
  });
});

describe("What an unconfirmed account may do", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(() => t.close());

  it("can read, manage its own account and read notifications", async () => {
    const { client } = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
    for (const path of [
      "/auth/me",
      "/reports",
      "/reports/mine",
      "/notifications",
      "/notifications/unread-count",
      "/users/me/sessions",
      "/users/me/notification-preferences",
      "/categories"
    ]) {
      expect((await client.get(path)).status).toBe(200);
    }
    expect((await client.patch("/users/me", { displayName: "Renamed Person" })).status).toBe(200);
    expect(
      (
        await client.post("/users/me/password", {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD
        })
      ).status
    ).toBe(204);
  });

  it("cannot publish, comment, flag, follow, upload or change a report by any route", async () => {
    const owner = await signedIn(t.app, t.prisma);
    const { reference } = await makeReport(owner.client);
    const comment = await owner.client.post(`/reports/${reference}/comments`, {
      body: "A comment to target."
    });
    const { client } = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });

    const attempts: Array<[string, () => Promise<request.Response>]> = [
      ["create report", () => client.post("/reports", reportPayload())],
      [
        "edit report",
        () => client.patch(`/reports/${reference}`, { title: "A changed title here" })
      ],
      [
        "change status",
        () =>
          client.post(`/reports/${reference}/status`, {
            status: "RESOLVED",
            note: "It was fixed apparently."
          })
      ],
      ["verify resolution", () => client.post(`/reports/${reference}/verification`, {})],
      [
        "follow",
        () =>
          client.agent
            .put(`/api/v1/reports/${reference}/follow`)
            .set("Origin", ORIGIN)
            .set("X-CSRF-Token", client.csrf!)
      ],
      [
        "comment",
        () =>
          client.post(`/reports/${reference}/comments`, {
            body: "Hello from an unconfirmed account."
          })
      ],
      [
        "edit comment",
        () =>
          client.patch(`/comments/${comment.body.id}`, { body: "Editing someone else's comment." })
      ],
      ["flag report", () => client.post(`/reports/${reference}/flags`, { reason: "SPAM" })],
      ["flag comment", () => client.post(`/comments/${comment.body.id}/flags`, { reason: "SPAM" })],
      [
        "upload evidence",
        async () => client.upload(`/reports/${reference}/evidence`, await pngImage(), "a.png")
      ]
    ];
    for (const [name, run] of attempts) {
      const res = await run();
      expect(res.status).toBe(403);
      // Staff-only routes refuse a non-staff account before anything else; everything else says why.
      expect(res.body.code).toBe(name === "verify resolution" ? "FORBIDDEN" : "EMAIL_NOT_VERIFIED");
    }
    expect(await t.prisma.report.count()).toBe(1);
    expect(await t.prisma.comment.count()).toBe(1);
  });

  it("cannot use staff or administrator tools even if its role is staff", async () => {
    for (const role of ["MODERATOR", "ADMIN"] as const) {
      const { client } = await signedIn(t.app, t.prisma, role, { verified: false });
      for (const path of [
        "/moderation/flags",
        "/moderation/reports",
        "/admin/users",
        "/admin/audit",
        "/admin/email-outbox"
      ]) {
        const res = await client.get(path);
        expect([403]).toContain(res.status);
        if (path.startsWith("/admin") && role === "MODERATOR") continue;
        expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
      }
    }
  });

  it("gets the full set of abilities the moment the address is confirmed", async () => {
    const { client, user } = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
    expect((await client.post("/reports", reportPayload())).status).toBe(403);
    await t.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    expect((await client.post("/reports", reportPayload())).status).toBe(201);
  });

  it("can still delete its own account", async () => {
    const { client } = await signedIn(t.app, t.prisma, "CITIZEN", { verified: false });
    expect((await client.del("/users/me", { password: PASSWORD })).status).toBe(204);
  });
});

describe("Password reset", () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  const forgot = (email: string) => api().post("/api/v1/auth/password/forgot").send({ email });
  const reset = (token: string, password = NEW_PASSWORD) =>
    api().post("/api/v1/auth/password/reset").send({ token, password });

  beforeAll(async () => {
    t = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(() => t.close());

  async function resetLink(email: string) {
    expect((await forgot(email)).status).toBe(202);
    await deliverEmail(t.app);
    return t.email.tokenFor(email)!;
  }

  it("answers identically whether or not the account exists, and only emails real, active accounts", async () => {
    await createUser(t.prisma, { email: "real@example.test" });
    await createUser(t.prisma, { email: "gone@example.test", status: "SUSPENDED" });
    const answers = [];
    for (const email of [
      "real@example.test",
      "ghost@example.test",
      "gone@example.test",
      "REAL@EXAMPLE.TEST "
    ]) {
      const res = await forgot(email.trim());
      answers.push({ status: res.status, body: res.body, cookies: res.headers["set-cookie"] });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]).toEqual({
      status: 202,
      body: { status: "check_email" },
      cookies: undefined
    });
    await deliverEmail(t.app);
    expect(t.email.to("real@example.test").length).toBeGreaterThanOrEqual(1);
    expect(t.email.to("ghost@example.test")).toHaveLength(0);
    expect(t.email.to("gone@example.test")).toHaveLength(0);
  });

  it("issues a high-entropy, single-use token that expires within the documented 30 minutes, stored hashed", async () => {
    await createUser(t.prisma, { email: "u@example.test" });
    const token = await resetLink("u@example.test");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await t.prisma.authToken.findFirstOrThrow({ where: { purpose: "PASSWORD_RESET" } });
    expect(row.tokenHash).toBe(sha256(token));
    const lifetime = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(lifetime).toBeLessThanOrEqual(30 * 60_000 + 1000);
    expect(lifetime).toBeGreaterThan(25 * 60_000);
    expect(t.email.to("u@example.test")[0]!.text).toContain(
      "http://localhost:3010/reset-password#token="
    );
  });

  it("changes the password, keeps the person signed out, and confirms by email without the password", async () => {
    const user = await createUser(t.prisma, { email: "u@example.test" });
    const token = await resetLink("u@example.test");
    const res = await reset(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "password_changed" });
    expect(res.headers["set-cookie"]).toBeUndefined(); // not signed in automatically

    expect((await new Client(t.app).login("u@example.test", PASSWORD)).status).toBe(401);
    expect((await new Client(t.app).login("u@example.test", NEW_PASSWORD)).status).toBe(200);
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash
    ).toMatch(/^\$argon2id\$/);

    await deliverEmail(t.app);
    const confirmation = t.email.to("u@example.test").at(-1)!;
    expect(confirmation.subject).toMatch(/password was changed/i);
    for (const body of [confirmation.text, confirmation.html, confirmation.subject]) {
      expect(body).not.toContain(NEW_PASSWORD);
      expect(body).not.toContain(PASSWORD);
      expect(body).not.toContain(token);
    }
    expect(await t.prisma.auditLog.count({ where: { action: "user.password_reset" } })).toBe(1);
  });

  it("signs out every device and kills their access tokens at once", async () => {
    const user = await createUser(t.prisma, { email: "u@example.test" });
    const phone = new Client(t.app);
    const laptop = new Client(t.app);
    await phone.login(user.email);
    await laptop.login(user.email);
    expect((await phone.get("/auth/me")).status).toBe(200);

    expect((await reset(await resetLink("u@example.test"))).status).toBe(200);

    expect((await phone.get("/auth/me")).status).toBe(401);
    expect((await laptop.get("/auth/me")).status).toBe(401);
    expect((await phone.refresh()).status).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("does not use up the link when the new password is rejected", async () => {
    await createUser(t.prisma, { email: "u@example.test" });
    const token = await resetLink("u@example.test");
    const weak = await reset(token, "password123");
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe("WEAK_PASSWORD");
    expect((await reset(token, "short")).status).toBe(400);
    expect((await reset(token, "u@example.test")).status).toBe(400);
    expect((await reset(token)).status).toBe(200);
  });

  it("cannot be replayed, and expired or unknown links fail", async () => {
    await createUser(t.prisma, { email: "u@example.test" });
    const token = await resetLink("u@example.test");
    expect((await reset(token)).status).toBe(200);
    expect((await reset(token, "Yet-another-strong-pass-9")).body.code).toBe("TOKEN_INVALID");
    expect((await new Client(t.app).login("u@example.test", NEW_PASSWORD)).status).toBe(200);

    const second = await resetLink("u@example.test");
    await t.prisma.authToken.updateMany({
      where: { purpose: "PASSWORD_RESET", usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    expect((await reset(second)).body.code).toBe("TOKEN_EXPIRED");
    expect((await reset("B".repeat(43))).body.code).toBe("TOKEN_INVALID");
  });

  it("when several people hold the same link and race, exactly one reset happens", async () => {
    await createUser(t.prisma, { email: "u@example.test" });
    const token = await resetLink("u@example.test");
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => reset(token, `Racing-passphrase-number-${i}-xyz`))
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await t.prisma.emailOutbox.count({ where: { kind: "PASSWORD_CHANGED" } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: "user.password_reset" } })).toBe(1);
  });

  it("a newer request, or a password change, cancels earlier links", async () => {
    const user = await createUser(t.prisma, { email: "u@example.test" });
    const first = await resetLink("u@example.test");
    await t.prisma.emailOutbox.updateMany({
      data: { createdAt: new Date(Date.now() - 5 * 60_000) }
    });
    const second = await resetLink("u@example.test");
    expect(second).not.toBe(first);
    expect((await reset(first)).body.code).toBe("TOKEN_INVALID");

    // Changing the password from account settings also kills links still in inboxes.
    const client = new Client(t.app);
    await client.login(user.email);
    expect(
      (
        await client.post("/users/me/password", {
          currentPassword: PASSWORD,
          newPassword: "Changed-from-settings-pass-3"
        })
      ).status
    ).toBe(204);
    expect((await reset(second)).body.code).toBe("TOKEN_INVALID");
  });

  it("lets the front end ask whether a link is still good without spending it", async () => {
    await createUser(t.prisma, { email: "u@example.test" });
    const token = await resetLink("u@example.test");
    const check = () => api().post("/api/v1/auth/password/reset/check").send({ token });
    expect((await check()).body).toEqual({ valid: true });
    expect((await check()).body).toEqual({ valid: true });
    expect((await reset(token)).status).toBe(200);
    expect((await check()).body).toEqual({ valid: false, reason: "invalid" });
    expect(
      (await api().post("/api/v1/auth/password/reset/check").send({ token: "nope" })).body
    ).toEqual({ valid: false, reason: "invalid" });
  });

  it("proves control of the mailbox, so it also confirms an unconfirmed address", async () => {
    const user = await createUser(t.prisma, { email: "u@example.test", verified: false });
    expect((await reset(await resetLink("u@example.test"))).status).toBe(200);
    expect(
      (await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt
    ).not.toBeNull();
  });

  it("limits requests per account and per source", async () => {
    await createUser(t.prisma, { email: "u@example.test" });
    for (let i = 0; i < 6; i++) await forgot("u@example.test");
    expect(
      await t.prisma.emailOutbox.count({ where: { kind: "PASSWORD_RESET" } })
    ).toBeLessThanOrEqual(3);

    const strict = await createApp({ rateLimitMultiplier: 1 });
    try {
      let last = 0;
      for (let i = 0; i < 7; i++)
        last = (
          await request(strict.app.getHttpServer())
            .post("/api/v1/auth/password/forgot")
            .send({ email: `n${i}@example.test` })
        ).status;
      expect(last).toBe(429);
      let attempts = 0;
      for (let i = 0; i < 12; i++)
        attempts = (
          await request(strict.app.getHttpServer())
            .post("/api/v1/auth/password/reset")
            .send({ token: "C".repeat(43), password: NEW_PASSWORD })
        ).status;
      expect(attempts).toBe(429);
    } finally {
      await strict.close();
      process.env.RATE_LIMIT_MULTIPLIER = "1000";
    }
  });

  it("is protected against cross-site requests when cookies are present", async () => {
    const { client } = await signedIn(t.app, t.prisma);
    for (const [path, body] of [
      ["/auth/password/forgot", { email: "x@example.test" }],
      ["/auth/password/reset", { token: "D".repeat(43), password: NEW_PASSWORD }],
      ["/auth/verification/resend", {}]
    ] as const) {
      const noCsrf = await client.agent.post(`/api/v1${path}`).set("Origin", ORIGIN).send(body);
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.code).toBe("CSRF_FAILED");
      const foreign = await client.agent
        .post(`/api/v1${path}`)
        .set("Origin", "https://evil.example")
        .set("X-CSRF-Token", client.csrf!)
        .send(body);
      expect(foreign.status).toBe(403);
      expect(foreign.body.code).toBe("BAD_ORIGIN");
    }
  });
});
