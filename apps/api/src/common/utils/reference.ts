import { randomBytes } from "node:crypto";

// Crockford base32 without ambiguous characters (no I, L, O, U): easy to read aloud or copy from a screenshot.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateReference(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] as number) % 32];
  return `SW-${out}`;
}

export function isReferenceFormat(value: string): boolean {
  return /^SW-[0-9A-HJKMNP-TV-Z]{6}$/.test(value);
}
