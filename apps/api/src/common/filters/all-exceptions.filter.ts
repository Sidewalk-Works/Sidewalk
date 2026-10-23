import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorBody } from "@sidewalk/contracts";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../app-error";
import type { AuthedRequest } from "../auth-types";

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
  503: "SERVICE_UNAVAILABLE"
};

const SECRET_LIKE =
  /\b(password|passwd|secret|token|authorization|cookie|api[_-]?key)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const BEARER = /Bearer\s+[\w.~+/=-]+/gi;
const JWT_LIKE = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g;

export function redactText(value: string): string {
  return value
    .replace(SECRET_LIKE, "$1$2[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT_LIKE, "[redacted-jwt]");
}

/**
 * What is safe to write to the logs about an error. Database client errors embed the data of the failing
 * query in their message (including password hashes), so for those only the type and code are kept.
 * Everything else keeps its stack for debugging, with credential-shaped text removed.
 */
export function describeErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      name: error.name,
      code: error.code,
      target: (error.meta as { target?: unknown } | undefined)?.target
    };
  }
  if (error instanceof Error && error.name.startsWith("PrismaClient")) return { name: error.name };
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactText(error.message),
      stack: error.stack ? redactText(error.stack) : undefined
    };
  }
  return { type: typeof error };
}

/** One error shape for everything. Unknown errors never leak internals to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AuthedRequest>();
    const res = ctx.getResponse<Response>();

    const body = this.toBody(exception, req);
    if (body.statusCode >= 500) {
      this.logger.error(
        {
          err: describeErrorForLog(exception),
          requestId: req.id,
          path: req.originalUrl.split("?")[0]
        },
        "Unhandled error"
      );
    }
    if (body.statusCode === 429) {
      const wait = exception instanceof AppError ? exception.retryAfterSeconds : undefined;
      res.setHeader("Retry-After", String(wait ?? 60));
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, req: AuthedRequest): ApiErrorBody {
    const base = {
      requestId: req.id === undefined ? undefined : String(req.id),
      timestamp: new Date().toISOString(),
      path: req.originalUrl.split("?")[0] ?? req.url
    };

    if (exception instanceof AppError) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
        ...base
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        return { statusCode: 409, code: "CONFLICT", message: "That already exists.", ...base };
      }
      if (exception.code === "P2025") {
        return { statusCode: 404, code: "NOT_FOUND", message: "We could not find that.", ...base };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const raw =
        typeof response === "string"
          ? response
          : ((response as { message?: unknown }).message ?? exception.message);
      const message = Array.isArray(raw) ? raw.join("; ") : String(raw);
      return {
        statusCode: status,
        code: STATUS_CODES[status] ?? "ERROR",
        message:
          status === 429 ? "Too many requests. Please wait a moment and try again." : message,
        ...base
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side. Please try again.",
      ...base
    };
  }
}
