import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import type { LoginResponse, RegisterResponse } from "@sidewalk/shared";

import { env } from "../../../shared/config/env.js";
import { ConflictError, UnauthorizedError } from "../../../shared/errors/AppError.js";
import { logger } from "../../../shared/logger/logger.js";
import { userRepository } from "../../users/repositories/user.repository.js";
import { toPublicUser } from "../../users/types/user.types.js";
import { loginThrottle } from "./login-throttle.js";
import type { LoginInput, RegisterInput } from "../validators/auth.validator.js";

function signToken(userId: string, email: string): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, email }, env.JWT_SECRET, options);
}

export const authService = {
  async register(input: RegisterInput): Promise<RegisterResponse> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(input.password, env.PASSWORD_SALT_ROUNDS);
    const user = await userRepository.create({ email: input.email, passwordHash });
    return toPublicUser(user);
  },

  async login(input: LoginInput, clientIp?: string): Promise<LoginResponse> {
    // Per-IP and per-account throttling (#822): both keys are checked before
    // any bcrypt work, so a locked account cannot be used to burn CPU on hash
    // comparisons.
    const ipKey = `ip:${clientIp ?? "unknown"}`;
    const accountKey = `acct:${input.email.toLowerCase()}`;
    loginThrottle.assertAllowed(ipKey);
    loginThrottle.assertAllowed(accountKey);

    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      loginThrottle.recordFailure(ipKey);
      loginThrottle.recordFailure(accountKey);
      logger.warn("[auth] failed login: unknown account", { email: input.email });
      throw new UnauthorizedError("Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      loginThrottle.recordFailure(ipKey);
      loginThrottle.recordFailure(accountKey);
      logger.warn("[auth] failed login: bad password", { userId: user.id });
      throw new UnauthorizedError("Invalid email or password.");
    }

    loginThrottle.recordSuccess(ipKey);
    loginThrottle.recordSuccess(accountKey);
    return {
      token: signToken(user.id, user.email),
      user: toPublicUser(user)
    };
  }
};
