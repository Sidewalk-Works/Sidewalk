import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { UnauthorizedError } from "../errors/AppError.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header.");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string;
      email?: string;
    };
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      console.warn("[auth] JWT expired:", err.message);
      throw new UnauthorizedError("Token has expired.");
    }
    if (err instanceof jwt.NotBeforeError) {
      console.warn("[auth] JWT not yet valid:", err.message);
      throw new UnauthorizedError("Token is not yet valid.");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      console.warn("[auth] JWT invalid:", err.message);
      throw new UnauthorizedError("Invalid token.");
    }
    console.error("[auth] Unexpected JWT verification error:", err);
    throw new UnauthorizedError("Invalid or expired token.");
  }
}
