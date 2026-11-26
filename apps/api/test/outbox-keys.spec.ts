import { Logger } from "@nestjs/common";
import { createCipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { createApp, createUser, deliverEmail, resetDatabase, type TestApp } from "./helpers";
import { loadEnv } from "../src/config/env";
import {
  OutboxKeyUnavailableError,
  OutboxKeyring,
  OutboxPayloadIntegrityError,
  keyIdOf,
  legacyKey,
  parseOutboxKeys
} from "../src/email/outbox-crypto";
import { keyStatus, rewrapOutbox } from "../src/email/outbox-maintenance";
import { KEY_RETRY_MS, OutboxService } from "../src/email/outbox.service";

const newKey = (id: string) => `${id}:${randomBytes(32).toString("base64")}`;
const material = (entry: string) => Buffer.from(entry.split(":")[1] as string, "base64");
const ring = (entries: string[], legacy: Buffer | null = null) =>
  new OutboxKeyring(parseOutboxKeys(entries.join(",")).keys, legacy);

/** What the very first outbox wrote, before keys were independent of the JWT secret. */
function legacyCiphertext(jwtSecret: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", legacyKey(jwtSecret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

describe("Outbox encryption keys", () => {
  describe("keyring", () => {
    const a = newKey("ka");
    const b = newKey("kb");

    it("writes a versioned envelope that names its key and never contains the content", () => {
      const row = randomUUID();
      const text = ring([a]).encrypt({ token: "super-secret-token-value" }, row);
      expect(text).toMatch(/^v1\.ka\.[A-Za-z0-9_-]+$/);
      expect(text).not.toContain("super-secret");
      expect(keyIdOf(text)).toBe("ka");
      expect(ring([a]).decrypt(text, row)).toEqual({ token: "super-secret-token-value" });
    });

    it("uses a fresh IV every time", () => {
      const row = randomUUID();
      const r = ring([a]);
      expect(r.encrypt({ n: 1 }, row)).not.toBe(r.encrypt({ n: 1 }, row));
    });

    it("encrypts with the first key and still reads messages written under later ones", () => {
      const row = randomUUID();
      const old = ring([a]).encrypt({ n: 1 }, row);
      const rotated = ring([b, a]);
      expect(rotated.activeKeyId).toBe("kb");
      expect(rotated.decrypt(old, row)).toEqual({ n: 1 });
      expect(keyIdOf(rotated.encrypt({ n: 2 }, row))).toBe("kb");
    });

    it("says the key is unavailable, not that the message is corrupt, when the key is not loaded", () => {
      const row = randomUUID();
      const text = ring([a]).encrypt({ n: 1 }, row);
      expect(() => ring([b]).decrypt(text, row)).toThrow(OutboxKeyUnavailableError);
    });

    it("rejects the same key id with different key material", () => {
      const row = randomUUID();
      const text = ring([a]).encrypt({ n: 1 }, row);
      const imposter = `ka:${randomBytes(32).toString("base64")}`;
      expect(() => ring([imposter]).decrypt(text, row)).toThrow(OutboxPayloadIntegrityError);
    });

    it("rejects tampering anywhere in the envelope", () => {
      const row = randomUUID();
      const text = ring([a]).encrypt({ n: 1 }, row);
      const [v, id, blob] = text.split(".") as [string, string, string];
      const raw = Buffer.from(blob, "base64url");
      for (const index of [0, 13, 20, raw.length - 1]) {
        const copy = Buffer.from(raw);
        copy[index] = (copy[index] as number) ^ 1;
        expect(() => ring([a]).decrypt(`${v}.${id}.${copy.toString("base64url")}`, row)).toThrow(
          OutboxPayloadIntegrityError
        );
      }
      expect(() => ring([a]).decrypt(`${v}.${id}.${blob.slice(0, 10)}`, row)).toThrow(
        OutboxPayloadIntegrityError
      );
      expect(() => ring([a]).decrypt("v1.ka.", row)).toThrow(OutboxPayloadIntegrityError);
    });

    it("binds a ciphertext to its row and to its key id", () => {
      const r = ring([a, b]);
      const rowA = randomUUID();
      const text = r.encrypt({ n: 1 }, rowA);
      expect(() => r.decrypt(text, randomUUID())).toThrow(OutboxPayloadIntegrityError);
      // Relabelling the envelope with another configured key id does not help either.
      const relabelled = text.replace(".ka.", ".kb.");
      expect(() => r.decrypt(relabelled, rowA)).toThrow(OutboxPayloadIntegrityError);
    });

    it("reads legacy (JWT-derived) rows only while allowed, and holds rather than kills them when they do not open", () => {
      const secret = "k8fj2h3g4k5j6h7g8f9d0s1a2q3w4e5r6t7y8u9i";
      const row = randomUUID();
      const old = legacyCiphertext(secret, { token: "t" });
      expect(keyIdOf(old)).toBe("legacy");
      expect(ring([a], legacyKey(secret)).decrypt(old, row)).toEqual({ token: "t" });
      expect(() => ring([a], null).decrypt(old, row)).toThrow(OutboxKeyUnavailableError);
      // The JWT secret was rotated: indistinguishable from corruption, so it is "key unavailable", not "dead".
      expect(() =>
        ring([a], legacyKey("another-secret-that-is-long-enough-xx")).decrypt(old, row)
      ).toThrow(OutboxKeyUnavailableError);
    });

    it("does not derive the keys from the JWT secret", () => {
      const secret = "k8fj2h3g4k5j6h7g8f9d0s1a2q3w4e5r6t7y8u9i";
      const derived = Buffer.from(hkdfSync("sha256", secret, "sidewalk", "outbox-payload-v1", 32));
      expect(material(a).equals(derived)).toBe(false);
    });
  });

  describe("configuration", () => {
    const base = {
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      JWT_ACCESS_SECRET: "k8fj2h3g4k5j6h7g8f9d0s1a2q3w4e5r6t7y8u9i",
      STORAGE_DRIVER: "local",
      GEOCODER_PROVIDER: "none"
    };
    const prod = {
      ...base,
      NODE_ENV: "production",
      INTERNAL_PROXY_SECRET: "internal-proxy-secret-0123456789abcdef-xyz",
      WEB_ORIGIN: "https://sidewalk.example.org",
      SMTP_HOST: "smtp.mail-provider.example.net",
      EMAIL_FROM: "Sidewalk <no-reply@mail.sidewalk.org>"
    };

    it("is required in production, with a message that says how to create one", () => {
      expect(() => loadEnv(prod)).toThrow(/OUTBOX_ENCRYPTION_KEYS[\s\S]*outbox:keys generate/);
      expect(() => loadEnv({ ...prod, OUTBOX_ENCRYPTION_KEYS: newKey("k1") })).not.toThrow();
    });

    it("is optional in development, where a derived key is used", () => {
      expect(() => loadEnv({ ...base, NODE_ENV: "development" })).not.toThrow();
    });

    it("rejects malformed, short, duplicate, reserved and placeholder keys, naming the key", () => {
      const bad = (spec: string) => () => loadEnv({ ...base, OUTBOX_ENCRYPTION_KEYS: spec });
      expect(bad("no-colon-here")).toThrow(/key id/);
      expect(bad("k1:not base64 !!")).toThrow(/not valid base64/);
      expect(bad(`k1:${randomBytes(16).toString("base64")}`)).toThrow(
        /exactly 32 bytes \(got 16\)/
      );
      expect(bad(`k1:${Buffer.alloc(32).toString("base64")}`)).toThrow(/does not look random/);
      expect(bad(`${newKey("dup")},${newKey("dup")}`)).toThrow(/appears twice/);
      expect(bad(newKey("legacy"))).toThrow(/reserved/);
      expect(bad("replace-me-run-pnpm-env-init")).toThrow(/key id/);
    });

    it("never echoes key material in its error messages", () => {
      const key = `k1:${randomBytes(16).toString("base64")}`;
      try {
        loadEnv({ ...base, OUTBOX_ENCRYPTION_KEYS: key });
        throw new Error("should have failed");
      } catch (e) {
        expect((e as Error).message).not.toContain(key.split(":")[1]);
      }
    });
  });

  describe("with the real outbox", () => {
    const apps: TestApp[] = [];
    afterEach(async () => {
      while (apps.length) await apps.pop()!.close();
    });

    /** A running application configured with these keys, sharing the one test database. */
    async function app(keys: string[], extra: Record<string, string> = {}): Promise<TestApp> {
      const t = await createApp({
        env: { OUTBOX_ENCRYPTION_KEYS: keys.join(","), OUTBOX_WORKER_ENABLED: "false", ...extra }
      });
      apps.push(t);
      return t;
    }
    const queue = async (
      t: TestApp,
      email: string,
      kind: "PASSWORD_CHANGED" | "EMAIL_VERIFICATION" = "PASSWORD_CHANGED"
    ) => {
      const user = await createUser(t.prisma, { email, verified: kind !== "EMAIL_VERIFICATION" });
      await t.prisma.$transaction((tx) =>
        t.app.get(OutboxService).enqueue(tx, {
          kind,
          userId: user.id,
          toEmail: email,
          payload: kind === "EMAIL_VERIFICATION" ? { token: "x".repeat(43) } : {}
        })
      );
      return user;
    };
    const rows = (t: TestApp) => t.prisma.emailOutbox.findMany({ orderBy: { createdAt: "asc" } });
    const due = (t: TestApp) =>
      t.prisma.emailOutbox.updateMany({
        where: { status: { in: ["FAILED", "PENDING"] } },
        data: { nextAttemptAt: new Date(Date.now() - 1000) }
      });

    const kA = newKey("ka");
    const kB = newKey("kb");

    beforeEach(async () => {
      const t = await app([kA]);
      await resetDatabase(t.prisma);
    });

    it("stores new messages under the active key and sends them", async () => {
      const t = await app([kA]);
      await queue(t, "one@example.test");
      expect((await rows(t))[0]?.payloadCiphertext).toMatch(/^v1\.ka\./);
      await deliverEmail(t.app);
      expect(t.email.to("one@example.test")).toHaveLength(1);
      expect((await rows(t))[0]).toMatchObject({ status: "SENT", payloadCiphertext: null });
    });

    it("delivers messages queued before a rotation, and writes new ones under the new key", async () => {
      const before = await app([kA]);
      await queue(before, "queued-before@example.test");
      await before.close();
      apps.pop();

      const after = await app([kB, kA]);
      await queue(after, "queued-after@example.test");
      const [first, second] = await rows(after);
      expect(first?.payloadCiphertext).toMatch(/^v1\.ka\./);
      expect(second?.payloadCiphertext).toMatch(/^v1\.kb\./);
      await deliverEmail(after.app);
      expect(after.email.to("queued-before@example.test")).toHaveLength(1);
      expect(after.email.to("queued-after@example.test")).toHaveLength(1);
    });

    it("holds, and does not kill or consume attempts for, a message whose key was retired too early; restoring it delivers", async () => {
      const original = await app([kA]);
      await queue(original, "held@example.test");
      await original.close();
      apps.pop();

      const retired = await app([kB]);
      await deliverEmail(retired.app);
      const held = (await rows(retired))[0]!;
      expect(held).toMatchObject({ status: "FAILED", attempts: 0 });
      expect(held.lastError).toMatch(/^key_unavailable: key "ka" is not configured$/);
      expect(held.payloadCiphertext).not.toBeNull();
      expect(held.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(KEY_RETRY_MS - 5000);
      expect(retired.email.to("held@example.test")).toHaveLength(0);
      expect(await retired.app.get(OutboxService).health()).toMatchObject({
        keyBlocked: 1,
        activeKeyId: "kb"
      });

      // Many passes while the key is missing never run the message out of attempts.
      for (let i = 0; i < 8; i++) {
        await due(retired);
        await deliverEmail(retired.app);
      }
      expect((await rows(retired))[0]).toMatchObject({ status: "FAILED", attempts: 0 });

      const restored = await app([kB, kA]);
      await due(restored);
      await deliverEmail(restored.app);
      expect(restored.email.to("held@example.test")).toHaveLength(1);
      expect((await rows(restored))[0]).toMatchObject({ status: "SENT", payloadCiphertext: null });
    });

    it("marks a message dead after a week without its key, keeping the content so it can still be retried", async () => {
      const original = await app([kA]);
      await queue(original, "week@example.test");
      await original.close();
      apps.pop();
      const retired = await app([kB]);
      await deliverEmail(retired.app);
      await retired.prisma.emailOutbox.updateMany({
        data: { createdAt: new Date(Date.now() - 8 * 86_400_000) }
      });
      await retired.app.get(OutboxService).cleanup();
      const dead = (await rows(retired))[0]!;
      expect(dead.status).toBe("DEAD");
      expect(dead.payloadCiphertext).not.toBeNull();

      const restored = await app([kB, kA]);
      await restored.app.get(OutboxService).retry(dead.id);
      await deliverEmail(restored.app);
      expect(restored.email.to("week@example.test")).toHaveLength(1);
    });

    it("treats wrong key material under a known id as an integrity failure, keeps the content, and recovers on retry", async () => {
      const original = await app([kA]);
      await queue(original, "imposter@example.test");
      await original.close();
      apps.pop();

      const wrong = await app([`ka:${randomBytes(32).toString("base64")}`]);
      await deliverEmail(wrong.app);
      const dead = (await rows(wrong))[0]!;
      expect(dead).toMatchObject({ status: "DEAD" });
      expect(dead.lastError).toContain("payload_integrity");
      expect(dead.payloadCiphertext).not.toBeNull();

      const fixed = await app([kA]);
      await fixed.app.get(OutboxService).retry(dead.id);
      await deliverEmail(fixed.app);
      expect(fixed.email.to("imposter@example.test")).toHaveLength(1);
    });

    it("kills a tampered message and a message copied onto another row", async () => {
      const t = await app([kA]);
      await queue(t, "victim-one@example.test");
      await queue(t, "victim-two@example.test");
      const [one, two] = await rows(t);
      // Swap the two ciphertexts: each is valid, but not for the row it now sits on.
      await t.prisma.emailOutbox.update({
        where: { id: one!.id },
        data: { payloadCiphertext: two!.payloadCiphertext }
      });
      await t.prisma.emailOutbox.update({
        where: { id: two!.id },
        data: { payloadCiphertext: one!.payloadCiphertext }
      });
      await deliverEmail(t.app);
      const after = await rows(t);
      expect(after.map((r) => r.status)).toEqual(["DEAD", "DEAD"]);
      expect(after.every((r) => r.lastError?.includes("payload_integrity"))).toBe(true);
      expect(t.email.sent).toHaveLength(0);
    });

    it("sends legacy rows while allowed, and holds them when legacy decryption is off", async () => {
      const t = await app([kA]);
      const user = await createUser(t.prisma, { email: "legacy@example.test" });
      const secret = process.env.JWT_ACCESS_SECRET as string;
      await t.prisma.emailOutbox.create({
        data: {
          id: randomUUID(),
          kind: "PASSWORD_CHANGED",
          userId: user.id,
          toEmail: "legacy@example.test",
          payloadCiphertext: legacyCiphertext(secret, {})
        }
      });
      const off = await app([kA], { OUTBOX_LEGACY_JWT_DECRYPT: "false" });
      await deliverEmail(off.app);
      expect((await rows(off))[0]).toMatchObject({ status: "FAILED", attempts: 0 });
      expect((await rows(off))[0]?.lastError).toContain('key "legacy"');

      await due(t);
      await deliverEmail(t.app);
      expect(t.email.to("legacy@example.test")).toHaveLength(1);
    });

    it("does not send a verification or reset link that has already expired", async () => {
      const t = await app([kA]);
      await queue(t, "stale@example.test", "EMAIL_VERIFICATION");
      await t.prisma.emailOutbox.updateMany({
        data: { createdAt: new Date(Date.now() - 25 * 3_600_000) }
      });
      await deliverEmail(t.app);
      expect((await rows(t))[0]).toMatchObject({ status: "SKIPPED", payloadCiphertext: null });
      expect(t.email.sent).toHaveLength(0);
    });

    describe("operator tools", () => {
      it("reports which key every queued message needs and whether it can be read", async () => {
        const old = await app([kA]);
        await queue(old, "s1@example.test");
        await queue(old, "s2@example.test");
        await old.close();
        apps.pop();
        const t = await app([kB, kA]);
        await queue(t, "s3@example.test");
        expect(await keyStatus(t.prisma, ring([kB, kA]))).toEqual({
          total: 3,
          byKey: {
            ka: { rows: 2, readable: 2, keyMissing: 0, failedIntegrity: 0 },
            kb: { rows: 1, readable: 1, keyMissing: 0, failedIntegrity: 0 }
          }
        });
        const onlyB = await keyStatus(t.prisma, ring([kB]));
        expect(onlyB.byKey.ka).toMatchObject({ rows: 2, readable: 0, keyMissing: 2 });
        // Plaintext never appears in the report.
        expect(JSON.stringify(onlyB)).not.toMatch(/example\.test/);
      });

      it("rewraps queued messages under the active key so the old key can be retired", async () => {
        const old = await app([kA]);
        await queue(old, "r1@example.test");
        await queue(old, "r2@example.test");
        await old.close();
        apps.pop();
        const t = await app([kB, kA]);
        await queue(t, "r3@example.test");

        const dry = await rewrapOutbox(t.prisma, ring([kB, kA]), { dryRun: true });
        expect(dry).toMatchObject({ examined: 3, rewrapped: 2, alreadyActive: 1, unreadable: 0 });
        expect(
          (await rows(t)).filter((r) => r.payloadCiphertext?.startsWith("v1.ka.")).length
        ).toBe(2);

        const result = await rewrapOutbox(t.prisma, ring([kB, kA]));
        expect(result).toMatchObject({ rewrapped: 2, alreadyActive: 1, unreadable: 0, raced: 0 });
        expect((await rows(t)).every((r) => r.payloadCiphertext?.startsWith("v1.kb."))).toBe(true);
        expect(await rewrapOutbox(t.prisma, ring([kB, kA]))).toMatchObject({
          rewrapped: 0,
          alreadyActive: 3
        });

        // The retired key is no longer needed: a deployment with only the new key delivers everything.
        const retired = await app([kB]);
        await due(retired);
        await deliverEmail(retired.app);
        expect(retired.email.sent).toHaveLength(3);
      });

      it("migrates legacy (JWT-derived) rows onto the active key, after which legacy decryption can be turned off", async () => {
        const t = await app([kA]);
        const user = await createUser(t.prisma, { email: "migrate@example.test" });
        const id = randomUUID();
        await t.prisma.emailOutbox.create({
          data: {
            id,
            kind: "PASSWORD_CHANGED",
            userId: user.id,
            toEmail: "migrate@example.test",
            payloadCiphertext: legacyCiphertext(process.env.JWT_ACCESS_SECRET as string, {})
          }
        });
        const legacyRing = ring([kA], legacyKey(process.env.JWT_ACCESS_SECRET as string));
        expect((await keyStatus(t.prisma, legacyRing)).byKey.legacy).toMatchObject({
          rows: 1,
          readable: 1
        });
        expect(await rewrapOutbox(t.prisma, legacyRing)).toMatchObject({
          rewrapped: 1,
          unreadable: 0
        });
        expect((await rows(t))[0]!.payloadCiphertext).toMatch(/^v1\.ka\./);

        const noLegacy = await app([kA], { OUTBOX_LEGACY_JWT_DECRYPT: "false" });
        await deliverEmail(noLegacy.app);
        expect(noLegacy.email.to("migrate@example.test")).toHaveLength(1);
      });

      it("leaves messages it cannot read exactly as they are", async () => {
        const old = await app([kA]);
        await queue(old, "u1@example.test");
        const before = (await rows(old))[0]!.payloadCiphertext;
        const result = await rewrapOutbox(old.prisma, ring([kB]));
        expect(result).toMatchObject({ examined: 1, rewrapped: 0, unreadable: 1 });
        expect((await rows(old))[0]!.payloadCiphertext).toBe(before);
      });

      it("never overwrites a row that changed (or was sent) between reading and writing", async () => {
        const old = await app([kA]);
        await queue(old, "race@example.test");
        const racing = {
          emailOutbox: {
            findMany: old.prisma.emailOutbox.findMany.bind(old.prisma.emailOutbox),
            updateMany: async (args: Parameters<typeof old.prisma.emailOutbox.updateMany>[0]) => {
              // A worker sends the message right after the rewrap read it.
              await old.prisma.emailOutbox.updateMany({
                where: { id: (args!.where as { id: string }).id },
                data: { status: "SENT", payloadCiphertext: null }
              });
              return old.prisma.emailOutbox.updateMany(args);
            }
          }
        };
        const result = await rewrapOutbox(racing as never, ring([kB, kA]));
        expect(result).toMatchObject({ rewrapped: 0, raced: 1 });
        expect((await rows(old))[0]).toMatchObject({ status: "SENT", payloadCiphertext: null });
      });
    });

    it("never writes key material, ciphertext or message content to the logs", async () => {
      const lines: string[] = [];
      const spies = (["log", "warn", "error", "debug", "verbose"] as const).map((m) =>
        jest
          .spyOn(Logger.prototype, m)
          .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")))
      );
      try {
        const original = await app([kA]);
        await queue(original, "log-keys@example.test", "EMAIL_VERIFICATION");
        const ciphertext = (await rows(original))[0]!.payloadCiphertext as string;
        await original.close();
        apps.pop();
        const missing = await app([kB]);
        await deliverEmail(missing.app);
        const wrong = await app([`ka:${randomBytes(32).toString("base64")}`]);
        await due(wrong);
        await deliverEmail(wrong.app);

        const log = lines.join("\n");
        expect(log).toContain("ka"); // the key id is fine to name
        for (const secret of [material(kA), material(kB)])
          expect(log).not.toContain(secret.toString("base64"));
        expect(log).not.toContain(ciphertext);
        expect(log).not.toContain(ciphertext.split(".")[2]);
        expect(log).not.toContain("x".repeat(43));
        expect(log).not.toContain("log-keys@example.test");
        const stored = JSON.stringify(await rows(wrong));
        expect(stored).not.toContain(material(kA).toString("base64"));
        expect(stored).not.toContain("x".repeat(43));
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
    });
  });
});
