import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createHmac, hkdfSync } from "node:crypto";
import { APP_ENV, type AppEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { LocalWindowLimiter } from "./local-window";

export interface Hit {
  hits: number;
  /** Milliseconds until the window ends and the count starts again. */
  ttlMs: number;
}

const CLEANUP_EVERY_MS = 60_000;
const CLEANUP_BATCH = 2_000;
/** Arbitrary constant: only one API instance at a time purges expired buckets. */
const CLEANUP_LOCK = 7_261_024;
/** After this many store failures in a row the store is skipped for a short while instead of slowing every request. */
const BREAKER_FAILURES = 3;
const BREAKER_OPEN_MS = 5_000;
const ERROR_LOG_EVERY_MS = 30_000;

/**
 * Shared fixed-window rate limiting on PostgreSQL.
 *
 * Every hit is one atomic `INSERT … ON CONFLICT DO UPDATE` on the bucket's row, so concurrent requests, on one
 * instance or many, are counted exactly and the database clock decides when a window ends. If the store cannot be
 * reached (or answers too slowly) the limiter falls back to a bounded in-memory counter in this process: limits
 * keep applying during the outage, just per instance, and the degraded state is logged and reported.
 *
 * Keys are HMACs of the route and the signed-in user or address, so no address is ever written to the database.
 */
@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("RateLimit");
  private readonly local = new LocalWindowLimiter();
  private readonly hmacKey: Buffer;
  private consecutiveFailures = 0;
  private breakerOpenUntil = 0;
  private lastErrorLog = 0;
  private fallbackHits = 0;
  private lastFailureAt: number | null = null;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {
    this.hmacKey = Buffer.from(
      hkdfSync("sha256", env.JWT_ACCESS_SECRET, "sidewalk", "ratelimit-key-v1", 32)
    );
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.cleanup().catch(() => undefined), CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** A stable, non-reversible identifier for a person or address within one policy. */
  hash(...parts: string[]): string {
    return createHmac("sha256", this.hmacKey)
      .update(parts.join("\u0000"))
      .digest("hex")
      .slice(0, 32);
  }

  /** Counts one hit in the key's current window (starting a window if none is open). */
  async hit(key: string, windowMs: number): Promise<Hit> {
    const stored = await this.guarded(async () => {
      const rows = await this.prisma.$queryRaw<Array<{ hits: number; ttlMs: number }>>`
        INSERT INTO "RateLimitBucket" ("key", "hits", "expiresAt")
        VALUES (${key}, 1, now() + (${windowMs}::double precision * interval '1 millisecond'))
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = CASE WHEN "RateLimitBucket"."expiresAt" <= now() THEN 1 ELSE "RateLimitBucket"."hits" + 1 END,
          "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= now()
                             THEN now() + (${windowMs}::double precision * interval '1 millisecond')
                             ELSE "RateLimitBucket"."expiresAt" END
        RETURNING "hits", ceil(extract(epoch FROM ("expiresAt" - now())) * 1000)::int AS "ttlMs"`;
      const row = rows[0] as { hits: number; ttlMs: number };
      return { hits: Number(row.hits), ttlMs: Number(row.ttlMs) };
    });
    if (stored) return stored;
    this.fallbackHits += 1;
    return this.local.hit(key, windowMs);
  }

  /** The current count without adding to it. */
  async peek(key: string): Promise<Hit> {
    const stored = await this.guarded(async () => {
      const rows = await this.prisma.$queryRaw<Array<{ hits: number; ttlMs: number }>>`
        SELECT "hits", ceil(extract(epoch FROM ("expiresAt" - now())) * 1000)::int AS "ttlMs"
        FROM "RateLimitBucket" WHERE "key" = ${key} AND "expiresAt" > now()`;
      const row = rows[0];
      return row ? { hits: Number(row.hits), ttlMs: Number(row.ttlMs) } : { hits: 0, ttlMs: 0 };
    });
    // During an outage, what this process remembers is the best information there is.
    return stored ?? this.local.peek(key);
  }

  async clear(key: string): Promise<void> {
    this.local.delete(key);
    await this.guarded(() => this.prisma.rateLimitBucket.deleteMany({ where: { key } }));
  }

  /** Deletes expired buckets in small batches, so the table cannot grow without bound. Returns rows removed. */
  async cleanup(): Promise<number> {
    const removed = await this.guarded(async () => {
      let total = 0;
      for (let i = 0; i < 50; i++) {
        const n = await this.prisma.$transaction(async (tx) => {
          const [lock] = await tx.$queryRaw<
            Array<{ ok: boolean }>
          >`SELECT pg_try_advisory_xact_lock(${CLEANUP_LOCK}) AS ok`;
          if (!lock?.ok) return -1; // another instance is already cleaning
          return tx.$executeRaw`
            DELETE FROM "RateLimitBucket" WHERE "key" IN (
              SELECT "key" FROM "RateLimitBucket" WHERE "expiresAt" <= now() LIMIT ${CLEANUP_BATCH})`;
        });
        if (n <= 0) break;
        total += n;
        if (n < CLEANUP_BATCH) break;
      }
      return total;
    });
    return removed ?? 0;
  }

  /** For operators: is the shared store working, and how often has the fallback been used? */
  status(): { store: "ok" | "degraded"; fallbackHits: number; lastFailureAt: string | null } {
    return {
      store: this.breakerOpenUntil > Date.now() || this.consecutiveFailures > 0 ? "degraded" : "ok",
      fallbackHits: this.fallbackHits,
      lastFailureAt: this.lastFailureAt ? new Date(this.lastFailureAt).toISOString() : null
    };
  }

  /** Runs a store operation with a deadline. Returns undefined (and notes the failure) if it fails or is too slow. */
  private async guarded<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (Date.now() < this.breakerOpenUntil) return undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("rate-limit store timed out")),
          this.env.RATE_LIMIT_STORE_TIMEOUT_MS
        );
      });
      const result = await Promise.race([work(), deadline]);
      this.consecutiveFailures = 0;
      return result;
    } catch (e) {
      this.consecutiveFailures += 1;
      this.lastFailureAt = Date.now();
      if (this.consecutiveFailures >= BREAKER_FAILURES)
        this.breakerOpenUntil = Date.now() + BREAKER_OPEN_MS;
      if (Date.now() - this.lastErrorLog > ERROR_LOG_EVERY_MS) {
        this.lastErrorLog = Date.now();
        // The type only: database errors can embed query parameters (and so keys).
        this.logger.error(
          `Rate-limit store unavailable (${(e as Error).name}); using per-process limits until it recovers`
        );
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
