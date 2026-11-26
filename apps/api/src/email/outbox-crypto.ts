import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { AppEnv } from "../config/env";

/**
 * Outbox payloads can hold a one-time link, so they are encrypted at rest and erased once the message is sent.
 *
 * Ciphertext envelope (current): `v1.<keyId>.<base64url(iv ‖ tag ‖ ciphertext)>`
 *  - AES-256-GCM, a fresh 96-bit random IV per message.
 *  - The key id is in the clear so that the right key can be chosen, and so operators can see which key a
 *    queued message needs without being able to read it.
 *  - The additional authenticated data binds the ciphertext to its key id AND to the outbox row it belongs to,
 *    so a ciphertext copied onto another row (or re-labelled with a different key id) fails authentication.
 *
 * Legacy envelope (written before keys were independent of the JWT secret): bare `base64url(iv ‖ tag ‖ ct)`,
 * encrypted with a key derived from `JWT_ACCESS_SECRET`. It is only readable while that secret is unchanged and
 * `OUTBOX_LEGACY_JWT_DECRYPT` is on. It is never written any more.
 */

export const ENVELOPE_PREFIX = "v1";
export const LEGACY_KEY_ID = "legacy";
/** Prefix of `EmailOutbox.lastError` for a message held back because its key is not configured. */
export const KEY_UNAVAILABLE_CODE = "key_unavailable";
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_KEYS = 8;

export interface OutboxKey {
  id: string;
  key: Buffer;
}

/** No key with the id this message was written under is configured. Retrying later may succeed. */
export class OutboxKeyUnavailableError extends Error {
  constructor(readonly keyId: string) {
    super(`The encryption key "${keyId}" is not configured.`);
    this.name = "OutboxKeyUnavailableError";
  }
}

/** The ciphertext failed authentication or is malformed: tampered with, corrupted, or the key material changed. */
export class OutboxPayloadIntegrityError extends Error {
  constructor(readonly keyId: string) {
    super("The stored message content failed its integrity check.");
    this.name = "OutboxPayloadIntegrityError";
  }
}

/**
 * Parses `OUTBOX_ENCRYPTION_KEYS`: comma-separated `id:base64key` entries. The first is the active key (used to
 * encrypt); the rest can only decrypt. Returns a list of problems instead of throwing so env validation can show
 * all of them at once.
 */
export function parseOutboxKeys(spec: string | undefined): {
  keys: OutboxKey[];
  problems: string[];
} {
  const keys: OutboxKey[] = [];
  const problems: string[] = [];
  const entries = (spec ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length > MAX_KEYS) problems.push(`at most ${MAX_KEYS} keys may be configured`);
  for (const entry of entries.slice(0, MAX_KEYS)) {
    const split = entry.indexOf(":");
    const id = split > 0 ? entry.slice(0, split) : "";
    const material = split > 0 ? entry.slice(split + 1) : "";
    if (!KEY_ID.test(id)) {
      problems.push(`a key id must be 1-32 characters of letters, digits, "-" or "_"`);
      continue;
    }
    if (id === LEGACY_KEY_ID) {
      problems.push(`the key id "${LEGACY_KEY_ID}" is reserved`);
      continue;
    }
    if (keys.some((k) => k.id === id)) {
      problems.push(`key id "${id}" appears twice`);
      continue;
    }
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(material)) {
      problems.push(`key "${id}" is not valid base64`);
      continue;
    }
    const key = Buffer.from(material, "base64");
    if (key.length !== 32) {
      problems.push(`key "${id}" must decode to exactly 32 bytes (got ${key.length})`);
      continue;
    }
    // Catches an all-zero or repeated-byte placeholder, not weak randomness in general.
    if (new Set(key).size < 16) {
      problems.push(
        `key "${id}" does not look random; generate one with \`pnpm outbox:keys generate\``
      );
      continue;
    }
    keys.push({ id, key });
  }
  return { keys, problems };
}

/** The key the first versions of the outbox derived from the JWT secret. Kept only to read old rows. */
export function legacyKey(jwtSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", jwtSecret, "sidewalk", "outbox-payload-v1", 32));
}

/** Development convenience when no keys are configured: a key derived from the JWT secret (never in production). */
export const DEV_DERIVED_KEY_ID = "dev-derived";
export function devDerivedKey(jwtSecret: string): OutboxKey {
  return {
    id: DEV_DERIVED_KEY_ID,
    key: Buffer.from(hkdfSync("sha256", jwtSecret, "sidewalk", "outbox-dev-derived-v1", 32))
  };
}

/** Which key a stored ciphertext needs, without decrypting it: its key id, `legacy`, or null if unrecognisable. */
export function keyIdOf(ciphertext: string): string | null {
  if (!ciphertext.startsWith(`${ENVELOPE_PREFIX}.`))
    return /^[A-Za-z0-9_-]+$/.test(ciphertext) ? LEGACY_KEY_ID : null;
  const id = ciphertext.split(".")[1];
  return id && KEY_ID.test(id) ? id : null;
}

const aad = (keyId: string, rowId: string) =>
  Buffer.from(`sidewalk-outbox|${ENVELOPE_PREFIX}|${keyId}|${rowId}`);

export class OutboxKeyring {
  private readonly byId = new Map<string, Buffer>();

  /**
   * @param keys the first is the active key
   * @param legacy the JWT-derived key, or null when old-format rows are no longer accepted
   */
  constructor(
    private readonly keys: OutboxKey[],
    private readonly legacy: Buffer | null
  ) {
    if (keys.length === 0) throw new Error("At least one outbox encryption key is required.");
    for (const k of keys) this.byId.set(k.id, k.key);
  }

  get activeKeyId(): string {
    return (this.keys[0] as OutboxKey).id;
  }

  get keyIds(): string[] {
    return this.keys.map((k) => k.id);
  }

  encrypt(value: unknown, rowId: string): string {
    const active = this.keys[0] as OutboxKey;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", active.key, iv);
    cipher.setAAD(aad(active.id, rowId));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const blob = Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
    return `${ENVELOPE_PREFIX}.${active.id}.${blob}`;
  }

  decrypt<T>(ciphertext: string, rowId: string): T {
    const id = keyIdOf(ciphertext);
    if (id === null) throw new OutboxPayloadIntegrityError("unknown");
    if (id === LEGACY_KEY_ID) {
      if (!this.legacy) throw new OutboxKeyUnavailableError(LEGACY_KEY_ID);
      try {
        return this.open<T>(this.legacy, ciphertext, null, LEGACY_KEY_ID);
      } catch (e) {
        // A legacy row that will not open almost always means JWT_ACCESS_SECRET changed since it was written,
        // and that cannot be told apart from corruption. Treat it as "the key is not available": the message is
        // held, not killed, and becomes readable again if the old secret is restored.
        if (e instanceof OutboxPayloadIntegrityError)
          throw new OutboxKeyUnavailableError(LEGACY_KEY_ID);
        throw e;
      }
    }
    const key = this.byId.get(id);
    if (!key) throw new OutboxKeyUnavailableError(id);
    return this.open<T>(key, ciphertext.slice(ciphertext.indexOf(".", 3) + 1), aad(id, rowId), id);
  }

  private open<T>(key: Buffer, blob: string, additional: Buffer | null, keyId: string): T {
    try {
      const raw = Buffer.from(blob, "base64url");
      if (raw.length < 29) throw new Error("short");
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      if (additional) decipher.setAAD(additional);
      decipher.setAuthTag(raw.subarray(12, 28));
      const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(
        "utf8"
      );
      return JSON.parse(text) as T;
    } catch {
      // Never include the cause: it can carry nothing useful and must not echo ciphertext or key material.
      throw new OutboxPayloadIntegrityError(keyId);
    }
  }
}

/** The keyring for this deployment. Development without configured keys falls back to a JWT-derived key. */
export function buildOutboxKeyring(env: AppEnv): OutboxKeyring {
  const { keys } = parseOutboxKeys(env.OUTBOX_ENCRYPTION_KEYS);
  return new OutboxKeyring(
    keys.length > 0 ? keys : [devDerivedKey(env.JWT_ACCESS_SECRET)],
    env.OUTBOX_LEGACY_JWT_DECRYPT ? legacyKey(env.JWT_ACCESS_SECRET) : null
  );
}
