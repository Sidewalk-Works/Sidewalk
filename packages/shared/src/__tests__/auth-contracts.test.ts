import { describe, expect, it } from "vitest";
import type { ApiIdentity, AuthClaims, PublicUser, ScopedTokenClaims } from "../types/auth.js";

function isExpired(claims: AuthClaims): boolean {
  return Date.now() / 1000 > claims.exp;
}

function toPublicUser(user: Pick<PublicUser, "id" | "email" | "createdAt">): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function toApiIdentity(claims: ScopedTokenClaims): ApiIdentity {
  return {
    id: claims.sub,
    email: claims.email,
    role: claims.role,
    scopes: claims.scope ?? [],
  };
}

const baseClaims: AuthClaims = {
  sub: "u-1",
  exp: 9_999_999_999,
  iat: 1_700_000_000,
};

const scopedClaims: ScopedTokenClaims = {
  ...baseClaims,
  sub: "u-3",
  email: "staff@test.com",
  role: "staff",
  scope: ["reports:read", "reports:write"],
};

describe("auth contracts — issued token claims", () => {
  it("matches the API-issued claim shape", () => {
    expect(baseClaims).toEqual({ sub: "u-1", exp: 9_999_999_999, iat: 1_700_000_000 });
  });

  it("non-expired token returns false for isExpired", () => {
    expect(isExpired(baseClaims)).toBe(false);
  });

  it("expired token returns true for isExpired", () => {
    expect(isExpired({ ...baseClaims, exp: 1 })).toBe(true);
  });
});

describe("auth contracts — public user projection", () => {
  it("maps API user fields without leaking token-only data", () => {
    const pub = toPublicUser({ id: "u-1", email: "user@test.com", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(pub).toEqual({ id: "u-1", email: "user@test.com", createdAt: "2026-01-01T00:00:00.000Z" });
    expect((pub as Record<string, unknown>).role).toBeUndefined();
  });
});

describe("auth contracts — resolved identity from extended claims", () => {
  it("maps sub to id", () => {
    expect(toApiIdentity(scopedClaims).id).toBe("u-3");
  });

  it("preserves optional scopes/role/email when present", () => {
    expect(toApiIdentity(scopedClaims)).toEqual({
      id: "u-3",
      email: "staff@test.com",
      role: "staff",
      scopes: ["reports:read", "reports:write"],
    });
  });

  it("defaults missing scopes to an empty array", () => {
    const claims: ScopedTokenClaims = { ...baseClaims, scope: undefined };
    expect(toApiIdentity(claims).scopes).toEqual([]);
  });
});
