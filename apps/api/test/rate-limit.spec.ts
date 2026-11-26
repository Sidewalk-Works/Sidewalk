import { Logger } from "@nestjs/common";
import { Client as Pg, type Pool } from "pg";
import request from "supertest";
import {
  ORIGIN,
  PASSWORD,
  createApp,
  createUser,
  resetDatabase,
  signedIn,
  type TestApp
} from "./helpers";
import {
  ACCOUNT_PACE_AFTER,
  ADDRESS_LIMIT,
  LoginBrake,
  PACE_MS,
  PAIR_LIMIT
} from "../src/auth/login-brake.service";
import { rateLimitAddress } from "../src/ratelimit/address";
import { LocalWindowLimiter } from "../src/ratelimit/local-window";
import { RateLimitService } from "../src/ratelimit/rate-limit.service";

import { EventEmitter } from "node:events";

// Several applications run in one test process; each adds listeners to shared emitters.
EventEmitter.defaultMaxListeners = 100;

const SECRET = "internal-secret-for-tests-0123456789abcdef";
const via = (ip: string) => ({ "x-sidewalk-proxy-secret": SECRET, "x-sidewalk-client-ip": ip });
const pgOf = (url: string) => url.replace(/\?schema=.*/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statuses = (responses: Array<{ status: number }>) => {
  const count: Record<number, number> = {};
  for (const r of responses) count[r.status] = (count[r.status] ?? 0) + 1;
  return count;
};

describe("Shared rate limiting", () => {
  const apps: TestApp[] = [];
  const start = async (env: Record<string, string> = {}) => {
    const t = await createApp({
      rateLimitMultiplier: 1,
      env: { INTERNAL_PROXY_SECRET: SECRET, ...env }
    });
    apps.push(t);
    return t;
  };
  let first: TestApp;
  beforeAll(async () => {
    first = await start();
  });
  beforeEach(async () => resetDatabase(first.prisma));
  afterAll(async () => {
    for (const t of apps) await t.close();
    process.env.RATE_LIMIT_MULTIPLIER = "1000";
  });

  const ready = (t: TestApp, ip = "198.51.100.7") =>
    request(t.app.getHttpServer()).get("/api/v1/health/ready").set(via(ip));
  const rows = () => first.prisma.rateLimitBucket.findMany();

  describe("counting", () => {
    it("lets exactly the limit through when many requests arrive at once", async () => {
      const results = await Promise.all(Array.from({ length: 90 }, () => ready(first)));
      // /health/ready allows 30 per minute per address.
      expect(statuses(results)).toEqual({ 200: 30, 429: 60 });
      for (const r of results.filter((x) => x.status === 429)) {
        expect(r.body.code).toBe("RATE_LIMITED");
        expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
        expect(Number(r.headers["retry-after"])).toBeLessThanOrEqual(60);
      }
    });

    it("counts across API instances sharing the database", async () => {
      const second = await start();
      const instances = [first, second];
      const results = await Promise.all(
        Array.from({ length: 90 }, (_, i) => ready(instances[i % 2] as TestApp))
      );
      expect(statuses(results)).toEqual({ 200: 30, 429: 60 });
      // And one instance sees what the other counted.
      expect((await ready(first)).status).toBe(429);
      expect((await ready(second)).status).toBe(429);
    });

    it("keeps callers apart: another address, and every signed-in account, has its own allowance", async () => {
      const results = await Promise.all(
        Array.from({ length: 35 }, () => ready(first, "198.51.100.8"))
      );
      expect(statuses(results)[429]).toBe(5);
      expect((await ready(first, "198.51.100.9")).status).toBe(200);

      const a = await signedIn(first.app, first.prisma);
      const b = await signedIn(first.app, first.prisma);
      const change = (c: typeof a.client) =>
        c.post("/users/me/password", {
          currentPassword: "x".repeat(12),
          newPassword: "y".repeat(12)
        });
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await change(a.client)).status);
      expect(codes.slice(0, 5).every((c) => c === 400)).toBe(true);
      expect(codes[5]).toBe(429);
      expect((await change(b.client)).status).toBe(400); // same address, different account
    });

    it("starts a fresh window once the old one has ended", async () => {
      await Promise.all(Array.from({ length: 31 }, () => ready(first)));
      expect((await ready(first)).status).toBe(429);
      await first.prisma
        .$executeRaw`UPDATE "RateLimitBucket" SET "expiresAt" = now() - interval '1 second'`;
      expect((await ready(first)).status).toBe(200);
      const [bucket] = await rows();
      expect(bucket?.hits).toBe(1);
    });

    it("measures windows with the database clock, to the millisecond", async () => {
      const limiter = first.app.get(RateLimitService);
      const key = "test:window";
      expect((await limiter.hit(key, 400)).hits).toBe(1);
      expect((await limiter.hit(key, 400)).hits).toBe(2);
      const { ttlMs } = await limiter.peek(key);
      expect(ttlMs).toBeGreaterThan(0);
      expect(ttlMs).toBeLessThanOrEqual(400);
      await sleep(450);
      expect(await limiter.peek(key)).toEqual({ hits: 0, ttlMs: 0 });
      expect((await limiter.hit(key, 400)).hits).toBe(1);
    });

    it("can be switched off for development, and only there", async () => {
      const off = await start({ RATE_LIMIT_ENABLED: "false" });
      const results = await Promise.all(
        Array.from({ length: 40 }, () => ready(off, "198.51.100.30"))
      );
      expect(statuses(results)).toEqual({ 200: 40 });
    });
  });

  describe("what is stored", () => {
    it("keeps no addresses, emails or account ids, only keyed hashes", async () => {
      const { user, client } = await signedIn(first.app, first.prisma);
      await client.get("/auth/me");
      await ready(first, "203.0.113.77");
      await request(first.app.getHttpServer())
        .post("/api/v1/auth/login")
        .set(via("203.0.113.78"))
        .send({ email: "someone@example.test", password: "wrong-password-1" });
      const keys = (await rows()).map((r) => r.key);
      expect(keys.length).toBeGreaterThan(4);
      for (const key of keys) {
        expect(key).toMatch(/^(rl|lb):/);
        expect(key).not.toContain("203.0.113");
        expect(key).not.toContain("127.0.0.1");
        expect(key).not.toContain(user.id);
        expect(key).not.toContain("example.test");
      }
    });

    it("purges expired buckets in bounded batches and leaves live ones alone", async () => {
      await first.prisma.$executeRaw`
        INSERT INTO "RateLimitBucket" ("key", "hits", "expiresAt")
        SELECT 'old:' || g, 1, now() - interval '5 minutes' FROM generate_series(1, 5000) g`;
      await first.prisma.$executeRaw`
        INSERT INTO "RateLimitBucket" ("key", "hits", "expiresAt")
        SELECT 'live:' || g, 1, now() + interval '5 minutes' FROM generate_series(1, 10) g`;
      const second = await start();
      const limiters = [first.app.get(RateLimitService), second.app.get(RateLimitService)];
      // Two instances cleaning at the same moment: the advisory lock keeps them out of each other's way.
      const removed = await Promise.all(limiters.map((l) => l.cleanup()));
      expect(removed[0]! + removed[1]!).toBeLessThanOrEqual(5000);
      await limiters[0]!.cleanup();
      const left = await rows();
      expect(left.filter((r) => r.key.startsWith("old:"))).toHaveLength(0);
      expect(left.filter((r) => r.key.startsWith("live:"))).toHaveLength(10);
    });

    it("bounds the in-memory fallback", () => {
      const local = new LocalWindowLimiter(100);
      for (let i = 0; i < 1000; i++) local.hit(`k${i}`, 60_000);
      expect(local.size).toBeLessThanOrEqual(100);
      expect(local.hit("k999", 60_000).hits).toBe(2); // the newest survive
    });
  });

  describe("when the shared store is unavailable", () => {
    /** The limiter's own connection pool: the one place its queries go. */
    const poolOf = (t: TestApp) => (t.app.get(RateLimitService) as unknown as { pool: Pool }).pool;
    const failStore = (t: TestApp, behaviour: "reject" | "hang") =>
      jest
        .spyOn(poolOf(t), "query")
        .mockImplementation((() =>
          behaviour === "reject"
            ? Promise.reject(new Error("store down"))
            : new Promise(() => undefined)) as never);

    it("keeps enforcing limits per process, keeps serving, reports it, and recovers", async () => {
      const t = await start({ RATE_LIMIT_STORE_TIMEOUT_MS: "100" });
      const errors: string[] = [];
      const logSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(" ")));
      const spy = failStore(t, "reject");
      try {
        const results = await Promise.all(
          Array.from({ length: 50 }, () => ready(t, "198.51.100.40"))
        );
        // Still limited at 30, still answering, never a 5xx caused by the limiter.
        expect(statuses(results)).toEqual({ 200: 30, 429: 20 });
        const limiter = t.app.get(RateLimitService);
        expect(limiter.status()).toMatchObject({ store: "degraded" });
        expect(limiter.status().fallbackHits).toBeGreaterThanOrEqual(50);
        // Logged once (not per request), and without any key or query parameter.
        const outage = errors.filter((e) => e.includes("Rate-limit store unavailable"));
        expect(outage).toHaveLength(1);
        expect(outage[0]).not.toMatch(/rl:|lb:/);

        // Sign-in keeps working during the outage.
        const user = await createUser(t.prisma, { email: "during-outage@example.test" });
        const login = await request(t.app.getHttpServer())
          .post("/api/v1/auth/login")
          .set("Origin", ORIGIN)
          .set(via("198.51.100.41"))
          .send({ email: user.email, password: PASSWORD });
        expect(login.status).toBe(200);
      } finally {
        spy.mockRestore();
        logSpy.mockRestore();
      }
      await sleep(5200); // the circuit breaker closes
      expect((await ready(t, "198.51.100.42")).status).toBe(200);
      expect(t.app.get(RateLimitService).status().store).toBe("ok");
      expect((await rows()).length).toBeGreaterThan(0); // counting in the database again
    });

    /** A store that answers correctly, but only after `ms`. */
    const slowStore = (t: TestApp, ms: number) => {
      const pool = poolOf(t);
      const real = pool.query.bind(pool) as (...a: unknown[]) => Promise<unknown>;
      return jest
        .spyOn(pool, "query")
        .mockImplementation(((...args: unknown[]) => sleep(ms).then(() => real(...args))) as never);
    };

    it("waits for a slow store when RATE_LIMIT_STORE_TIMEOUT_MS allows it, and counts in the database", async () => {
      const t = await start({ RATE_LIMIT_STORE_TIMEOUT_MS: "2000" });
      const spy = slowStore(t, 300);
      try {
        const res = await ready(t, "198.51.100.60");
        expect(res.status).toBe(200);
        expect(t.app.get(RateLimitService).status()).toMatchObject({
          store: "ok",
          fallbackHits: 0
        });
        expect((await rows()).length).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });

    it("abandons the same slow store under a tight timeout and counts in this process instead", async () => {
      const t = await start({ RATE_LIMIT_STORE_TIMEOUT_MS: "100" });
      const spy = slowStore(t, 600);
      try {
        const began = Date.now();
        const res = await ready(t, "198.51.100.61");
        expect(res.status).toBe(200);
        expect(Date.now() - began).toBeLessThan(550); // answered at the timeout, not after the store
        expect(t.app.get(RateLimitService).status().fallbackHits).toBe(1);
        // The limit still applies on the fallback: a rapid burst is stopped at 30.
        const burst = await Promise.all(
          Array.from({ length: 40 }, () => ready(t, "198.51.100.61"))
        );
        expect(statuses(burst)[429]).toBeGreaterThanOrEqual(10);
      } finally {
        spy.mockRestore();
      }
    });

    it("a locked rate-limit table cannot starve the rest of the API of database connections", async () => {
      const t = await start({ RATE_LIMIT_STORE_TIMEOUT_MS: "200" });
      const locker = new Pg({ connectionString: pgOf(process.env.DATABASE_URL as string) });
      await locker.connect();
      await locker.query("BEGIN");
      await locker.query('LOCK TABLE "RateLimitBucket" IN ACCESS EXCLUSIVE MODE');
      // Whatever happens, the lock is released: a failing test must not deadlock the suite.
      const safety = setTimeout(() => void locker.query("ROLLBACK").catch(() => undefined), 15_000);
      try {
        // A burst of simultaneous requests all try the locked table. Each must be answered at the timeout...
        const began = Date.now();
        const burst = await Promise.all(
          Array.from({ length: 30 }, (_, i) => ready(t, `198.51.101.${i + 1}`))
        );
        expect(burst.every((r) => r.status === 200)).toBe(true);
        expect(Date.now() - began).toBeLessThan(3000);
        // ...and the abandoned statements must not keep connections the rest of the application needs.
        const answered = await Promise.race([
          t.prisma.user.count().then(() => true),
          sleep(1500).then(() => false)
        ]);
        expect(answered).toBe(true);
        const waiting = await first.prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%RateLimitBucket%'`;
        expect(Number(waiting[0]?.n ?? 0)).toBe(0);
      } finally {
        clearTimeout(safety);
        await locker.query("ROLLBACK").catch(() => undefined);
        await locker.end();
      }
      // The lock is gone: the store works again once the breaker closes.
      await sleep(5200);
      expect((await ready(t, "198.51.101.200")).status).toBe(200);
      expect(t.app.get(RateLimitService).status().store).toBe("ok");
    });

    it("does not let a hanging store hold requests up: it gives up after the timeout and falls back", async () => {
      const t = await start({ RATE_LIMIT_STORE_TIMEOUT_MS: "100" });
      const spy = failStore(t, "hang");
      try {
        const began = Date.now();
        const res = await ready(t, "198.51.100.50");
        expect(res.status).toBe(200);
        expect(Date.now() - began).toBeLessThan(2000);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("the sign-in brake", () => {
    const attempt = (t: TestApp, ip: string, email: string, password = "wrong-password-1") =>
      request(t.app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Origin", ORIGIN)
        .set(via(ip))
        .send({ email, password });

    it("pauses an attacker's address, but cannot be used to lock the real owner out", async () => {
      const victim = await createUser(first.prisma, { email: "victim@example.test" });
      const codes: number[] = [];
      for (let i = 0; i < PAIR_LIMIT + 2; i++)
        codes.push((await attempt(first, "192.0.2.1", victim.email)).status);
      expect(codes.slice(0, PAIR_LIMIT).every((c) => c === 401)).toBe(true);
      expect(codes.slice(PAIR_LIMIT).every((c) => c === 429)).toBe(true);
      // The attacker is paused even with the right password…
      expect((await attempt(first, "192.0.2.1", victim.email, PASSWORD)).status).toBe(429);
      // …while the owner, from their own address, signs in normally.
      expect((await attempt(first, "192.0.2.99", victim.email, PASSWORD)).status).toBe(200);
    });

    it("answers identically for unknown and known accounts at every step", async () => {
      const known = await createUser(first.prisma, { email: "known@example.test" });
      const shape = async (email: string, ip: string) => {
        const out: Array<[number, string]> = [];
        for (let i = 0; i < PAIR_LIMIT + 2; i++) {
          const r = await attempt(first, ip, email);
          out.push([r.status, r.body.code]);
        }
        return out;
      };
      expect(await shape(known.email, "192.0.2.10")).toEqual(
        await shape("nobody-here@example.test", "192.0.2.11")
      );
    });

    it("pauses an address that tries many accounts, without touching other addresses", async () => {
      const brake = first.app.get(LoginBrake);
      for (let i = 0; i < ADDRESS_LIMIT; i++)
        await brake.recordFailure(`spray${i}@example.test`, "192.0.2.20");
      await expect(brake.assertAllowed("fresh@example.test", "192.0.2.20")).rejects.toMatchObject({
        status: 429
      });
      await expect(
        brake.assertAllowed("fresh@example.test", "192.0.2.21")
      ).resolves.toBeUndefined();
    });

    it("only slows, never locks, an account guessed at from many addresses", async () => {
      const owner = await createUser(first.prisma, { email: "guessed@example.test" });
      const brake = first.app.get(LoginBrake);
      for (let i = 0; i < ACCOUNT_PACE_AFTER; i++)
        await brake.recordFailure(owner.email, `10.9.${i % 250}.${i}`);

      // The owner, from an address that has never failed, still gets in on their first try…
      const ok = await attempt(first, "192.0.2.30", owner.email, PASSWORD);
      expect(ok.status).toBe(200);
      // …and a burst of guesses is held to one per pace interval, with a short Retry-After.
      const burst = await Promise.all(
        Array.from({ length: 5 }, (_, i) => attempt(first, `192.0.2.${40 + i}`, owner.email))
      );
      const paced = burst.filter((r) => r.status === 429);
      expect(paced.length).toBeGreaterThanOrEqual(4);
      expect(Number(paced[0]!.headers["retry-after"])).toBeLessThanOrEqual(
        Math.ceil(PACE_MS / 1000)
      );
      await sleep(PACE_MS + 100);
      expect((await attempt(first, "192.0.2.50", owner.email, PASSWORD)).status).toBe(200);
    });

    it("forgives an owner's own typos: success clears their counter, not an attacker's", async () => {
      const brake = first.app.get(LoginBrake);
      const owner = "typos@example.test";
      const failures = async (n: number, email: string, ip: string) => {
        for (let i = 0; i < n; i++) await brake.recordFailure(email, ip);
      };
      await failures(PAIR_LIMIT - 1, owner, "192.0.2.60");
      await expect(brake.assertAllowed(owner, "192.0.2.60")).resolves.toBeUndefined();
      await brake.recordSuccess(owner, "192.0.2.60");
      // Nine more typos after signing in are fine again: the pair counter started over.
      await failures(PAIR_LIMIT - 1, owner, "192.0.2.60");
      await expect(brake.assertAllowed(owner, "192.0.2.60")).resolves.toBeUndefined();

      // A success does not erase what an address has done across accounts.
      await failures(ADDRESS_LIMIT, "x@example.test", "192.0.2.61");
      await brake.recordSuccess("x@example.test", "192.0.2.61");
      await expect(brake.assertAllowed("y@example.test", "192.0.2.61")).rejects.toMatchObject({
        status: 429
      });
    });

    it("is shared between API instances", async () => {
      const second = await start();
      const brake = second.app.get(LoginBrake);
      for (let i = 0; i < PAIR_LIMIT; i++)
        await first.app.get(LoginBrake).recordFailure("shared@example.test", "192.0.2.70");
      await expect(brake.assertAllowed("shared@example.test", "192.0.2.70")).rejects.toMatchObject({
        status: 429
      });
    });
  });

  describe("client address trust", () => {
    it("ignores a client-supplied address and forwarding header without the web server's proof", async () => {
      const spoof = (i: number) =>
        request(first.app.getHttpServer())
          .get("/api/v1/health/ready")
          .set({ "x-sidewalk-client-ip": `198.51.100.${i}`, "x-forwarded-for": `203.0.113.${i}` });
      const results = await Promise.all(Array.from({ length: 40 }, (_, i) => spoof(i + 1)));
      // Rotating both headers did not create new buckets.
      expect(statuses(results)).toEqual({ 200: 30, 429: 10 });
      expect(new Set((await rows()).map((r) => r.key)).size).toBe(1);
    });
  });
});

describe("Rate-limit client identity", () => {
  it("treats IPv4-mapped addresses as IPv4, and an IPv6 /64 as one client", () => {
    expect(rateLimitAddress("203.0.113.5")).toBe("203.0.113.5");
    expect(rateLimitAddress("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(rateLimitAddress("::ffff:cb00:7105")).toBe("203.0.113.5");
    expect(rateLimitAddress("2001:db8:1:2::1")).toBe("2001:0db8:0001:0002::/64");
    expect(rateLimitAddress("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:0db8:0001:0002::/64");
    expect(rateLimitAddress("2001:db8:1:3::1")).toBe("2001:0db8:0001:0003::/64");
    expect(rateLimitAddress("fe80::1%eth0")).toBe("fe80:0000:0000:0000::/64");
    expect(rateLimitAddress("::1")).toBe("0000:0000:0000:0000::/64");
  });

  it("falls back to one shared 'unknown' identity for anything it cannot parse, never to the raw string", () => {
    for (const bad of [
      undefined,
      "",
      "not-an-ip",
      "999.1.1.1",
      "1:2:3",
      "2001:db8::1::2",
      "'; DROP TABLE"
    ])
      expect(rateLimitAddress(bad)).toBe("unknown");
  });
});

describe("IPv6 clients cannot dodge a limit by changing address inside their /64", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createApp({ rateLimitMultiplier: 1, env: { INTERNAL_PROXY_SECRET: SECRET } });
  });
  beforeEach(async () => resetDatabase(t.prisma));
  afterAll(async () => {
    await t.close();
    process.env.RATE_LIMIT_MULTIPLIER = "1000";
  });

  it("counts every address of one /64 together, and a different /64 separately", async () => {
    const ready = (ip: string) =>
      request(t.app.getHttpServer()).get("/api/v1/health/ready").set(via(ip));
    // 40 requests, each from a different address in 2001:db8:1:2::/64.
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        ready(`2001:db8:1:2:${(i + 1).toString(16)}::${(i + 7).toString(16)}`)
      )
    );
    expect(statuses(results)).toEqual({ 200: 30, 429: 10 });
    expect((await ready("2001:db8:1:3::1")).status).toBe(200);
  });
});
