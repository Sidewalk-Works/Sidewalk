import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/app-error";
import { APP_ENV, type AppEnv } from "../config/env";
import { rateLimitAddress } from "../ratelimit/address";
import { RateLimitService } from "../ratelimit/rate-limit.service";

/** Failures are counted over this window, starting at the first one. */
export const BRAKE_WINDOW_MS = 15 * 60_000;
/** Failed sign-ins for one account from one address before that address is paused for that account. */
export const PAIR_LIMIT = 10;
/** Failed sign-ins from one address across all accounts before that address is paused (credential stuffing). */
export const ADDRESS_LIMIT = 30;
/** Failed sign-ins for one account from everywhere, after which attempts on it are merely paced. */
export const ACCOUNT_PACE_AFTER = 50;
export const PACE_MS = 2_000;

/**
 * The brake on password guessing, shared across API instances.
 *
 * The old design locked an account after 10 failures from anywhere, which let anyone lock out anyone by typing
 * their email and a wrong password. This one cannot be used that way:
 *  - the main counters are per (account, address) and per address, so an attacker only ever pauses themselves;
 *  - the per-account total, which is what catches guessing spread over many addresses, never blocks: past a high
 *    threshold it paces attempts to one every two seconds. A real owner is delayed by seconds, and a guesser is
 *    held to a few hundred tries per account per window, against passwords that Argon2id makes expensive and that
 *    must be 10+ characters and not common.
 * Unknown emails are counted exactly like known ones, so the brake reveals nothing about which accounts exist.
 * Success clears the (account, address) counter only: it must not clear an attacker's address or account counts.
 */
@Injectable()
export class LoginBrake {
  constructor(
    private readonly limiter: RateLimitService,
    @Inject(APP_ENV) private readonly env: AppEnv
  ) {}

  private keys(email: string, address: string | undefined) {
    const ip = rateLimitAddress(address);
    return {
      pair: `lb:pair:${this.limiter.hash("login-pair", email, ip)}`,
      address: `lb:addr:${this.limiter.hash("login-addr", ip)}`,
      account: `lb:acct:${this.limiter.hash("login-acct", email)}`,
      pace: `lb:pace:${this.limiter.hash("login-pace", email)}`
    };
  }

  /** Throws 429 (with Retry-After) when this attempt must wait. Does not count the attempt. */
  async assertAllowed(email: string, address: string | undefined): Promise<void> {
    if (!this.env.RATE_LIMIT_ENABLED) return;
    const scale = Math.max(1, this.env.RATE_LIMIT_MULTIPLIER);
    const k = this.keys(email, address);
    const [pair, byAddress, account] = await Promise.all([
      this.limiter.peek(k.pair),
      this.limiter.peek(k.address),
      this.limiter.peek(k.account)
    ]);
    const blocked =
      pair.hits >= PAIR_LIMIT * scale
        ? pair
        : byAddress.hits >= ADDRESS_LIMIT * scale
          ? byAddress
          : null;
    if (blocked) {
      throw AppError.tooManyRequests(
        blocked.ttlMs / 1000,
        "Too many failed attempts. Wait a few minutes before trying again."
      );
    }
    if (account.hits >= ACCOUNT_PACE_AFTER * scale) {
      const pace = await this.limiter.hit(k.pace, PACE_MS);
      if (pace.hits > 1)
        throw AppError.tooManyRequests(
          pace.ttlMs / 1000,
          "Please wait a moment before trying again."
        );
    }
  }

  async recordFailure(email: string, address: string | undefined): Promise<void> {
    if (!this.env.RATE_LIMIT_ENABLED) return;
    const k = this.keys(email, address);
    await Promise.all([
      this.limiter.hit(k.pair, BRAKE_WINDOW_MS),
      this.limiter.hit(k.address, BRAKE_WINDOW_MS),
      this.limiter.hit(k.account, BRAKE_WINDOW_MS)
    ]);
  }

  async recordSuccess(email: string, address: string | undefined): Promise<void> {
    if (!this.env.RATE_LIMIT_ENABLED) return;
    await this.limiter.clear(this.keys(email, address).pair);
  }
}
