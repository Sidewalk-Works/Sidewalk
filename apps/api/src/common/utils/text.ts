/* eslint-disable no-control-regex -- stripping control characters is the purpose of these helpers */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Collapses whitespace and trims, so titles cannot be made of invisible characters. */
export function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Removes control characters (except newlines and tabs) and trims. */
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function excerpt(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Escapes the characters that mean something inside a SQL LIKE pattern, so that a visitor searching for
 * "100%" finds "100%" instead of everything. Prisma's `contains` does not do this itself.
 */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
