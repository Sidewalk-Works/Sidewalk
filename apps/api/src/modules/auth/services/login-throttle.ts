import { TooManyRequestsError } from "../../../shared/errors/AppError.js";
import { logger } from "../../../shared/logger/logger.js";

/**
 * In-memory login throttling with temporary account lockout (#822).
 *
 * Repeated failed logins — the credential-stuffing / brute-force pattern —
 * are bounded per client IP *and* per account email. After
 * `MAX_FAILED_ATTEMPTS` failures within `WINDOW_MS`, the key is locked for
 * `LOCKOUT_MS`; while locked, every login attempt for that key is rejected
 * with a 429 before bcrypt is even consulted, so an attacker cannot burn CPU
 * on hash comparisons.
 *
 * The store is deliberately an in-memory Map: no new dependencies, and a
 * single-instance deployment is fully covered. For horizontal scaling this
 * should be swapped for a Redis-backed store with the same interface.
 * State is never trusted for correctness — a lost counter only means an
 * extra attempt is allowed, never that a legitimate login is blocked forever.
 */

export interface LoginThrottleOptions {
  maxFailedAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

interface AttemptRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

const DEFAULT_OPTIONS: LoginThrottleOptions = {
  maxFailedAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
};

export class LoginThrottle {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly options: LoginThrottleOptions;

  constructor(options: Partial<LoginThrottleOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Rejects the attempt (429) when the key is currently locked. */
  public assertAllowed(key: string): void {
    const record = this.attempts.get(key);
    if (!record) return;

    const now = Date.now();
    if (record.lockedUntil !== null && now < record.lockedUntil) {
      const retryAfterSec = Math.ceil((record.lockedUntil - now) / 1000);
      logger.warn("[auth] login attempt blocked by lockout", {
        key,
        retryAfterSec,
      });
      throw new TooManyRequestsError(
        `Too many failed attempts. Try again in ${retryAfterSec} seconds.`,
      );
    }
  }

  /** Records a failed attempt; returns true when the key just became locked. */
  public recordFailure(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);
    if (!record || now - record.firstFailureAt > this.options.windowMs) {
      this.attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: null });
      return false;
    }

    record.failures += 1;
    if (record.failures >= this.options.maxFailedAttempts) {
      record.lockedUntil = now + this.options.lockoutMs;
      logger.error("[auth] account temporarily locked after repeated failures", {
        key,
        failures: record.failures,
        lockoutMs: this.options.lockoutMs,
      });
      return true;
    }
    return false;
  }

  /** Clears failure state after a successful login. */
  public recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  /** Test/observability helper. */
  public getFailures(key: string): number {
    return this.attempts.get(key)?.failures ?? 0;
  }
}

export const loginThrottle = new LoginThrottle();
