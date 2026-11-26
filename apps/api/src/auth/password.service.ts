import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "qwerty12345",
  "iloveyou123",
  "letmein1234",
  "welcome1234",
  "admin12345",
  "abc1234567",
  "1q2w3e4r5t",
  "0123456789",
  "11111111111",
  "passw0rd123",
  "nigeria1234",
  "lagos12345",
  "abuja12345",
  "sidewalk123",
  "sidewalk1234"
]);

@Injectable()
export class PasswordService {
  /** Verified against when an email is unknown, so response time does not reveal which emails exist. */
  private dummyHash: Promise<string> | undefined;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash("sidewalk-timing-equaliser");
    await this.verify(await this.dummyHash, plain);
  }

  /** Returns a human-readable problem, or null when the password is acceptable. */
  weakness(password: string, email?: string): string | null {
    if (COMMON_PASSWORDS.has(password.toLowerCase()))
      return "That password is too common. Choose something harder to guess.";
    if (email && password.toLowerCase() === email.toLowerCase())
      return "Your password cannot be your email address.";
    if (/^(.)\1+$/.test(password)) return "Your password cannot be a single repeated character.";
    return null;
  }
}
