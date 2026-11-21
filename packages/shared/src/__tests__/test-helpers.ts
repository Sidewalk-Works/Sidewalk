/**
 * Canonical test factories for the Sidewalk monorepo.
 *
 * Types are derived from the shared package exports so that factory shapes
 * stay aligned with the real data contracts without duplication.
 */
import type { AuthClaims, ScopedTokenClaims, PublicUser } from "../types/auth.js";
import type { ReportSubmission } from "../types/civic.js";
import { ReportCategory, type Visibility } from "../types/enums.js";

// ---------------------------------------------------------------------------
// Identity / auth helpers
// ---------------------------------------------------------------------------

export interface TestIdentity extends AuthClaims {
  email?: string;
  role?: "user" | "admin" | "staff" | "moderator";
}

export function makeIdentity(overrides: Partial<TestIdentity> = {}): TestIdentity {
  return {
    sub: "test-user-id",
    email: "test@sidewalk.dev",
    role: "user",
    exp: 9_999_999_999,
    iat: 1_700_000_000,
    ...overrides,
  };
}

export function makeAuthClaims(overrides: Partial<AuthClaims> = {}): AuthClaims {
  const identity = makeIdentity(overrides as Partial<TestIdentity>);
  return { sub: identity.sub, exp: identity.exp, iat: identity.iat, ...overrides };
}

export function makeScopedClaims(
  scopes: string[] = ["reports:read"],
  overrides: Partial<ScopedTokenClaims> = {},
): ScopedTokenClaims {
  const identity = makeIdentity(overrides as Partial<TestIdentity>);
  return {
    sub: identity.sub,
    exp: identity.exp,
    iat: identity.iat,
    email: identity.email,
    role: identity.role,
    scope: scopes,
    ...overrides,
  };
}

export function authHeader(token = "test-token"): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// User helpers (DB-aligned: no role field on User model)
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName?: string;
}

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "test-user-id",
    email: "test@sidewalk.dev",
    passwordHash: "hashed-password",
    displayName: "Test User",
    ...overrides,
  };
}

export function makePublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "test-user-id",
    email: "test@sidewalk.dev",
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Report helpers (aligned to ReportSubmission + Prisma Report shape)
// ---------------------------------------------------------------------------

export function makeReportSubmission(
  overrides: Partial<ReportSubmission> = {},
): ReportSubmission {
  return {
    title: "Test Report",
    description: "A test report description.",
    category: ReportCategory.POTHOLE,
    latitude: null,
    longitude: null,
    address: null,
    media_urls: [],
    ...overrides,
  };
}

export interface TestReport {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: ReportCategory;
  status: "submitted" | "under_review" | "verified" | "assigned" | "in_progress" | "resolved" | "closed";
}

export function makeReport(overrides: Partial<TestReport> = {}): TestReport {
  return {
    id: "test-report-id",
    user_id: "test-user-id",
    title: "Test Report",
    description: "A test report description.",
    category: ReportCategory.POTHOLE,
    status: "submitted",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HTTP test context
// ---------------------------------------------------------------------------

export interface ModuleTestContext {
  userId: string;
  token: string;
  baseUrl: string;
}

export function makeTestContext(overrides: Partial<ModuleTestContext> = {}): ModuleTestContext {
  return {
    userId: "test-user-id",
    token: "test-token",
    baseUrl: "http://localhost:3001",
    ...overrides,
  };
}

export const TEST_TOKENS = {
  user: "test.user.token",
  admin: "test.admin.token",
  anon: "",
} as const;
