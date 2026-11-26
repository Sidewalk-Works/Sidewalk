import type { Request } from "express";
import type { Role } from "@sidewalk/contracts";
import { AppError } from "./app-error";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  /** False until the owner has proved control of the address. */
  emailVerified: boolean;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function isStaff(user: Pick<AuthUser, "role"> | undefined | null): boolean {
  return user?.role === "MODERATOR" || user?.role === "ADMIN";
}

/**
 * Unconfirmed accounts can read, sign in, manage their own account and read their notifications. Anything that
 * publishes, comments, flags, follows or acts on a report needs a confirmed address. Checked in the services so
 * no alternate route can skip it.
 */
export function assertVerifiedEmail(user: AuthUser | undefined): asserts user is AuthUser {
  if (!user?.emailVerified) {
    throw AppError.forbidden(
      "Confirm your email address first. We sent you a link when you signed up.",
      "EMAIL_NOT_VERIFIED"
    );
  }
}

/** Service-layer authorization. Controllers also use guards, but services never trust that they were called through one. */
export function assertStaff(user: AuthUser | undefined): asserts user is AuthUser {
  if (!isStaff(user)) throw AppError.forbidden("This action is restricted to authorised staff.");
  assertVerifiedEmail(user);
}

export function assertAdmin(user: AuthUser | undefined): asserts user is AuthUser {
  if (user?.role !== "ADMIN")
    throw AppError.forbidden("This action is restricted to administrators.");
  assertVerifiedEmail(user);
}
