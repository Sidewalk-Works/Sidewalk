import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  PASSWORD,
  createApp,
  createUser,
  deliverEmail,
  resetDatabase,
  seedCategories,
  signedIn,
  type TestApp
} from "./helpers";
import { EmailDeliveryError } from "../src/email/email.provider";
import {
  MAX_ATTEMPTS,
  OutboxService,
  RETRY_DELAYS_MS,
  maskEmail,
  sanitizeError,
  wantsEmail
} from "../src/email/outbox.service";
import { OutboxProcessor } from "../src/email/outbox.processor";

describe("Email outbox and delivery", () => {
  let t: TestApp;
  let outbox: OutboxService;
  const api = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createApp();
    outbox = t.app.get(OutboxService);
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedCategories(t.prisma);
    t.email.reset();
  });
  afterAll(() => t.close());

  const enqueue = async (
    email: string,
    kind: "PASSWORD_CHANGED" | "ACCOUNT_EXISTS" = "PASSWORD_CHANGED",
    dedupeKey?: string
  ) => {
    const user = await createUser(t.prisma, { email });
    await t.prisma.$transaction((tx) =>
      outbox.enqueue(tx, { kind, userId: user.id, toEmail: email, payload: {}, dedupeKey })
    );
    return user;
  };
  const row = () => t.prisma.emailOutbox.findFirstOrThrow();
  const makeDue = () =>
    t.prisma.emailOutbox.updateMany({
      where: { status: { in: ["FAILED", "PENDING"] } },
      data: { nextAttemptAt: new Date(Date.now() - 1000) }
    });

  describe("transactional guarantees", () => {
    it("a message exists only if the transaction that asked for it committed", async () => {
      const user = await createUser(t.prisma, { email: "tx@example.test" });
      await expect(
        t.prisma.$transaction(async (tx) => {
          await outbox.enqueue(tx, {
            kind: "PASSWORD_CHANGED",
            userId: user.id,
            toEmail: "tx@example.test",
            payload: {}
          });
          throw new Error("the surrounding event failed");
        })
      ).rejects.toThrow("surrounding event failed");
      expect(await t.prisma.emailOutbox.count()).toBe(0);
      expect(await deliverEmail(t.app)).toBe(0);
      expect(t.email.sent).toHaveLength(0);
    });

    it("nothing is sent while the transaction is still open, and it is sent once it commits", async () => {
      const user = await createUser(t.prisma, { email: "open@example.test" });
      let duringTransaction = -1;
      await t.prisma.$transaction(async (tx) => {
        await outbox.enqueue(tx, {
          kind: "PASSWORD_CHANGED",
          userId: user.id,
          toEmail: "open@example.test",
          payload: {}
        });
        duringTransaction = await deliverEmail(t.app); // the worker runs on its own connection and cannot see uncommitted rows
      });
      expect(duringTransaction).toBe(0);
      expect(t.email.sent).toHaveLength(0);
      expect(await deliverEmail(t.app)).toBe(1);
      expect(t.email.to("open@example.test")).toHaveLength(1);
    });

    it("enqueueing the same event twice, as a retried transaction would, produces one message", async () => {
      const user = await createUser(t.prisma, { email: "dupe@example.test" });
      const again = () =>
        t.prisma.$transaction((tx) =>
          outbox.enqueue(tx, {
            kind: "PASSWORD_CHANGED",
            userId: user.id,
            toEmail: "dupe@example.test",
            payload: {},
            dedupeKey: "event-123"
          })
        );
      expect(await again()).toBe(true);
      expect(await again()).toBe(false);
      expect(await t.prisma.emailOutbox.count()).toBe(1);
      await deliverEmail(t.app);
      expect(t.email.to("dupe@example.test")).toHaveLength(1);
    });
  });

  describe("delivery state", () => {
    it("is SENT only after the provider accepted it, and the content is erased afterwards", async () => {
      await enqueue("ok@example.test");
      expect((await row()).status).toBe("PENDING");
      expect((await row()).sentAt).toBeNull();
      await deliverEmail(t.app);
      const r = await row();
      expect(r).toMatchObject({
        status: "SENT",
        attempts: 1,
        payloadCiphertext: null,
        lastError: null
      });
      expect(r.sentAt).not.toBeNull();
      expect(r.providerMessageId).toMatch(/@localhost:3010>$/);
    });

    it("a failed send is FAILED with a schedule, not delivered and not lost", async () => {
      await enqueue("flaky@example.test");
      t.email.failNext(new Error("connect ECONNREFUSED 10.0.0.5:587"));
      await deliverEmail(t.app);
      const r = await row();
      expect(r.status).toBe("FAILED");
      expect(r.attempts).toBe(1);
      expect(r.sentAt).toBeNull();
      expect(r.payloadCiphertext).not.toBeNull(); // still there for the retry
      expect(r.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + RETRY_DELAYS_MS[0]! - 5000);
      expect(t.email.sent).toHaveLength(0);

      // Not due yet: another pass leaves it alone.
      expect(await deliverEmail(t.app)).toBe(0);

      await makeDue();
      await deliverEmail(t.app);
      expect(await row()).toMatchObject({ status: "SENT", attempts: 2, payloadCiphertext: null });
      expect(t.email.to("flaky@example.test")).toHaveLength(1);
    });

    it("backs off further each time and gives up after the maximum attempts, leaving a visible DEAD record", async () => {
      await enqueue("down@example.test");
      const waits: number[] = [];
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        t.email.failNext(new Error("temporary failure"));
        await deliverEmail(t.app);
        const r = await row();
        if (attempt < MAX_ATTEMPTS) {
          expect(r.status).toBe("FAILED");
          waits.push(r.nextAttemptAt.getTime() - Date.now());
          await makeDue();
        } else {
          expect(r.status).toBe("DEAD");
          expect(r.attempts).toBe(MAX_ATTEMPTS);
        }
      }
      for (let i = 1; i < waits.length; i++) expect(waits[i]!).toBeGreaterThan(waits[i - 1]!);
      expect(await deliverEmail(t.app)).toBe(0); // no further attempts
      expect(t.email.sent).toHaveLength(0);
    });

    it("a permanent refusal is not retried", async () => {
      await enqueue("bounce@example.test");
      t.email.failNext(
        new EmailDeliveryError("recipient_rejected", true, "mailbox does not exist")
      );
      await deliverEmail(t.app);
      expect(await row()).toMatchObject({ status: "DEAD", attempts: 1 });
      expect(t.email.attempts).toBe(1);
    });

    it("failure reasons never contain an address, a link or a token", async () => {
      await enqueue("secret-person@example.test");
      t.email.failNext(
        new Error(
          "550 secret-person@example.test rejected; see https://mail.example/report?t=abc and key AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        )
      );
      await deliverEmail(t.app);
      const err = (await row()).lastError ?? "";
      expect(err).not.toMatch(/secret-person|example\.test|https?:|AAAAAAAAAA/);
      expect(err).toContain("[address]");
      expect(sanitizeError("a@b.co https://x.y/z " + "T".repeat(40))).toBe(
        "[address] [link] [token]"
      );
    });

    it("the logs name the message and the failure code only, never an address or a link", async () => {
      const lines: string[] = [];
      const spies = (["log", "warn", "error"] as const).map((m) =>
        jest
          .spyOn(Logger.prototype, m)
          .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")))
      );
      try {
        await enqueue("log-check@example.test");
        t.email.failNext(
          new Error("550 log-check@example.test https://secret.example/reset#token=XYZ")
        );
        await deliverEmail(t.app);
        await makeDue();
        t.email.failNext(
          new EmailDeliveryError("recipient_rejected", true, "rejected log-check@example.test")
        );
        await deliverEmail(t.app);
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
      expect(lines.length).toBeGreaterThan(0);
      const text = lines.join("\n");
      expect(text).not.toMatch(/log-check|example\.test|https?:|#token|XYZ/);
      expect(text).toMatch(/gave up|failed attempt/);
    });

    it("recovers a message whose worker died mid-send, but leaves a recent claim alone", async () => {
      await enqueue("crash@example.test");
      await t.prisma.emailOutbox.updateMany({
        data: { status: "SENDING", lockedAt: new Date(), attempts: 1 }
      });
      expect(await deliverEmail(t.app)).toBe(0); // somebody is working on it right now
      await t.prisma.emailOutbox.updateMany({
        data: { lockedAt: new Date(Date.now() - 10 * 60_000) }
      });
      expect(await deliverEmail(t.app)).toBe(1);
      expect(await row()).toMatchObject({ status: "SENT", attempts: 2 });
    });

    it("two workers running together deliver every message exactly once", async () => {
      for (let i = 0; i < 12; i++) await enqueue(`w${i}@example.test`);
      const claimed = await Promise.all([
        outbox.deliverDue(5),
        outbox.deliverDue(5),
        outbox.deliverDue(5),
        outbox.deliverDue(5)
      ]);
      await deliverEmail(t.app);
      expect(claimed.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(12);
      const ids = t.email.sent.map((m) => m.messageId);
      expect(new Set(ids).size).toBe(ids.length); // no message twice
      expect(ids).toHaveLength(12);
      expect(await t.prisma.emailOutbox.count({ where: { status: "SENT" } })).toBe(12);
    });

    it("a worker whose claim on a later message in its batch went stale does not send what another worker has taken", async () => {
      await enqueue("first@example.test");
      await enqueue("second@example.test");
      const realSend = t.email.send.bind(t.email);
      let takenOver = false;
      jest.spyOn(t.email, "send").mockImplementation(async (message) => {
        if (!takenOver) {
          takenOver = true;
          // While this worker is busy with one message, the claim on the other one in its batch ages past the limit
          // and a second worker takes that one over and sends it.
          await t.prisma.$executeRaw`
            UPDATE "EmailOutbox" SET "lockedAt" = (now() AT TIME ZONE 'UTC') - interval '10 minutes'
            WHERE "status" = 'SENDING' AND "toEmail" <> ${message.to}`;
          await outbox.deliverDue(10);
        }
        return realSend(message);
      });
      await outbox.deliverDue(10);
      const sentTo = t.email.sent.map((m) => m.to).sort();
      expect(sentTo).toEqual(["first@example.test", "second@example.test"]); // each once, never twice
      const rows = await t.prisma.emailOutbox.findMany({ orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => r.status)).toEqual(["SENT", "SENT"]);
    });

    it("a finished message cannot be overwritten by a worker that lost its claim", async () => {
      await enqueue("late@example.test");
      await deliverEmail(t.app);
      const before = await row();
      // A slow worker reports failure for a message another worker already sent.
      await t.prisma.emailOutbox.updateMany({
        where: { id: before.id, status: "SENDING" },
        data: { status: "DEAD" }
      });
      expect((await row()).status).toBe("SENT");
    });

    it("skips messages that no longer make sense instead of sending them", async () => {
      const gone = await enqueue("deleted-later@example.test");
      await t.prisma.user.update({ where: { id: gone.id }, data: { status: "DELETED" } });
      const done = await createUser(t.prisma, { email: "already@example.test" });
      await t.prisma.$transaction((tx) =>
        outbox.enqueue(tx, {
          kind: "EMAIL_VERIFICATION",
          userId: done.id,
          toEmail: "already@example.test",
          payload: { token: "T".repeat(43) }
        })
      );
      await deliverEmail(t.app);
      expect(t.email.sent).toHaveLength(0);
      expect(await t.prisma.emailOutbox.count({ where: { status: "SKIPPED" } })).toBe(2);
    });

    it("a payload that fails its integrity check is dead at once, not retried", async () => {
      await enqueue("tamper@example.test");
      const stored = (await row()).payloadCiphertext as string;
      // Corrupt the last character of the encrypted body, keeping the envelope (and its key id) intact.
      const flipped = stored.slice(0, -1) + (stored.endsWith("A") ? "B" : "A");
      await t.prisma.emailOutbox.updateMany({ data: { payloadCiphertext: flipped } });
      await deliverEmail(t.app);
      expect(await row()).toMatchObject({ status: "DEAD", attempts: 1 });
      expect((await row()).lastError).toContain("payload_integrity");
      expect((await row()).payloadCiphertext).toBe(flipped);
    });
  });

  describe("links and content", () => {
    it("builds every link from the configured origin, ignoring forged Host and forwarding headers", async () => {
      await createUser(t.prisma, { email: "victim@example.test" });
      const res = await api()
        .post("/api/v1/auth/password/forgot")
        .set("Host", "evil.example")
        .set("X-Forwarded-Host", "evil.example")
        .set("X-Forwarded-Proto", "https")
        .set("Origin", "http://localhost:3010")
        .send({ email: "victim@example.test" });
      expect(res.status).toBe(202);
      await deliverEmail(t.app);
      const mail = t.email.to("victim@example.test")[0]!;
      expect(mail.text).toContain("http://localhost:3010/reset-password#token=");
      expect(mail.html + mail.text).not.toMatch(/evil\.example/);
    });

    it("renders accessible HTML with a plain-text twin, and escapes anything a user typed", async () => {
      const hostile = '<img src=x onerror=alert(1)> & "quotes"';
      const user = await createUser(t.prisma, {
        email: "html@example.test",
        displayName: hostile,
        verified: false
      });
      await t.prisma.$transaction((tx) =>
        outbox.enqueue(tx, {
          kind: "EMAIL_VERIFICATION",
          userId: user.id,
          toEmail: "html@example.test",
          payload: { token: "Q".repeat(43) }
        })
      );
      await deliverEmail(t.app);
      const mail = t.email.to("html@example.test")[0]!;
      expect(mail.html).toContain('<html lang="en">');
      expect(mail.html).toContain('role="presentation"');
      expect(mail.html).not.toContain("<img src=x");
      expect(mail.html).toContain("&lt;img src=x");
      expect(mail.html).toMatch(
        /<a href="http:\/\/localhost:3010\/verify-email\/confirm#token=Q+"/
      );
      expect(mail.html).toContain("Sidewalk");
      expect(mail.text).toContain("Confirm my email address:");
      expect(mail.text).toContain("expires in 24 hours");
      expect(mail.subject).not.toContain("Q".repeat(43));
      expect(mail.from).toBe("Sidewalk <no-reply@sidewalk.test>");
      expect(mail.html).toMatch(/font-size:1[5-9]px/); // readable sizes
    });

    it("security email says it is sent whatever the notification settings, and never contains a secret", async () => {
      const user = await enqueue("sec@example.test");
      await t.prisma.user.update({
        where: { id: user.id },
        data: {
          notifyEmailReportUpdates: false,
          notifyEmailComments: false,
          notifyEmailModeration: false
        }
      });
      await deliverEmail(t.app);
      const mail = t.email.to("sec@example.test")[0]!;
      expect(mail.text).toMatch(/regardless of your notification settings/);
      expect(mail.text + mail.html).not.toContain(PASSWORD);
      expect(mail.text + mail.html).not.toContain("$argon2");
    });
  });

  describe("worker lifecycle", () => {
    it("polls on its own when enabled, and stops cleanly on shutdown", async () => {
      const live = await createApp({
        env: { OUTBOX_WORKER_ENABLED: "true", OUTBOX_POLL_MS: "200" }
      });
      try {
        const user = await createUser(live.prisma, { email: "auto@example.test" });
        await live.prisma.$transaction((tx) =>
          live.app.get(OutboxService).enqueue(tx, {
            kind: "PASSWORD_CHANGED",
            userId: user.id,
            toEmail: "auto@example.test",
            payload: {}
          })
        );
        const deadline = Date.now() + 8000;
        while (live.email.to("auto@example.test").length === 0 && Date.now() < deadline)
          await new Promise((r) => setTimeout(r, 100));
        expect(live.email.to("auto@example.test")).toHaveLength(1);
      } finally {
        await live.app.get(OutboxProcessor).stop();
        const count = live.email.sent.length;
        const user = await createUser(live.prisma, { email: "after-stop@example.test" });
        await live.prisma.$transaction((tx) =>
          live.app.get(OutboxService).enqueue(tx, {
            kind: "PASSWORD_CHANGED",
            userId: user.id,
            toEmail: "after-stop@example.test",
            payload: {}
          })
        );
        await new Promise((r) => setTimeout(r, 700));
        expect(live.email.sent.length).toBe(count); // stopped: nothing more is picked up
        await live.close();
      }
    });
  });

  describe("administration", () => {
    it("shows delivery health with masked addresses, to administrators only, and retries dead messages", async () => {
      await enqueue("dead-letter@example.test");
      t.email.failNext(new EmailDeliveryError("recipient_rejected", true, "no such mailbox"));
      await deliverEmail(t.app);

      const admin = await signedIn(t.app, t.prisma, "ADMIN");
      const mod = await signedIn(t.app, t.prisma, "MODERATOR");
      const citizen = await signedIn(t.app, t.prisma);
      expect((await mod.client.get("/admin/email-outbox")).status).toBe(403);
      expect((await citizen.client.get("/admin/email-outbox")).status).toBe(403);
      expect((await api().get("/api/v1/admin/email-outbox")).status).toBe(401);

      const list = await admin.client.get("/admin/email-outbox?status=DEAD");
      expect(list.status).toBe(200);
      expect(list.body.summary.DEAD).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        kind: "PASSWORD_CHANGED",
        status: "DEAD",
        to: "d***@example.test"
      });
      expect(JSON.stringify(list.body)).not.toContain("dead-letter");
      expect(JSON.stringify(list.body)).not.toMatch(/payload/i);

      expect(
        (await mod.client.post(`/admin/email-outbox/${list.body.items[0].id}/retry`, {})).status
      ).toBe(403);
      // The content of a dead message was kept, so a retry can still work.
      expect(
        (await admin.client.post(`/admin/email-outbox/${list.body.items[0].id}/retry`, {})).status
      ).toBe(204);
      await deliverEmail(t.app);
      expect(t.email.to("dead-letter@example.test")).toHaveLength(1);
      expect(
        (await admin.client.post(`/admin/email-outbox/${list.body.items[0].id}/retry`, {})).status
      ).toBe(409); // already sent
      expect(await t.prisma.auditLog.count({ where: { action: "email.retry_requested" } })).toBe(
        2 - 1
      );
    });

    it("audits each controlled retry with the message's earlier state, and refuses what cannot be retried without a trace", async () => {
      await enqueue("audit-retry@example.test");
      t.email.failNext(
        new EmailDeliveryError(
          "recipient_rejected",
          true,
          "no such mailbox audit-retry@example.test"
        )
      );
      await deliverEmail(t.app);
      const id = (await row()).id;
      const admin = await signedIn(t.app, t.prisma, "ADMIN");

      // Health is available to administrators, and carries no address, content or key material.
      const overview = await admin.client.get("/admin/email-outbox");
      expect(overview.body.health).toMatchObject({
        keyBlocked: 0,
        oldestPendingAgeSeconds: expect.any(Number),
        activeKeyId: expect.any(String),
        rateLimit: { store: "ok" }
      });
      expect(JSON.stringify(overview.body.health)).not.toMatch(/example\.test|payload|ciphertext/i);

      expect((await admin.client.post(`/admin/email-outbox/${id}/retry`, {})).status).toBe(204);
      const trail = await t.prisma.auditLog.findMany({
        where: { action: "email.retry_requested" }
      });
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({
        actorId: admin.user.id,
        entityType: "EmailOutbox",
        entityId: id
      });
      expect(trail[0]?.metadata).toEqual({
        previousStatus: "DEAD",
        kind: "PASSWORD_CHANGED",
        attempts: 1,
        failure: "recipient_rejected"
      });
      expect(JSON.stringify(trail)).not.toContain("audit-retry@example.test");

      // Already pending (or unknown): refused, and nothing is written to the audit log.
      expect((await admin.client.post(`/admin/email-outbox/${id}/retry`, {})).status).toBe(409);
      expect(
        (await admin.client.post(`/admin/email-outbox/${randomUUID()}/retry`, {})).status
      ).toBe(409);
      expect(await t.prisma.auditLog.count({ where: { action: "email.retry_requested" } })).toBe(1);
    });

    it("readiness never reveals anything about the outbox", async () => {
      await enqueue("probe@example.test");
      const res = await api().get("/api/v1/health/ready");
      expect(Object.keys(res.body).sort()).toEqual(["checks", "status"]);
      expect(JSON.stringify(res.body)).not.toMatch(/outbox|email|smtp/i);
    });
  });

  describe("helpers", () => {
    it("maps preferences to notification types and keeps security email out of the mapping", () => {
      const off = {
        notifyEmailReportUpdates: false,
        notifyEmailComments: false,
        notifyEmailModeration: false
      };
      const on = {
        notifyEmailReportUpdates: true,
        notifyEmailComments: true,
        notifyEmailModeration: true
      };
      for (const type of [
        "STATUS_CHANGED",
        "REOPENED",
        "RESOLUTION_VERIFIED",
        "REPORT_UPDATE",
        "COMMENT",
        "STAFF_UPDATE",
        "MODERATION"
      ]) {
        expect(wantsEmail(off, type)).toBe(false);
        expect(wantsEmail(on, type)).toBe(true);
      }
      expect(wantsEmail({ ...off, notifyEmailComments: true }, "COMMENT")).toBe(true);
      expect(wantsEmail({ ...off, notifyEmailComments: true }, "STATUS_CHANGED")).toBe(false);
      expect(maskEmail("person@example.org")).toBe("p***@example.org");
    });
  });
});
