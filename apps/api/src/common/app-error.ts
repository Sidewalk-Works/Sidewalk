import { HttpException } from "@nestjs/common";

export interface FieldIssue {
  field: string;
  message: string;
}

/** Every deliberate API failure goes through here so clients always get a stable `code`. */
export class AppError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldIssue[],
    /** For 429 responses: how long the caller should wait, sent as `Retry-After`. */
    public readonly retryAfterSeconds?: number
  ) {
    super({ code, message, details }, status);
  }

  static tooManyRequests(
    retryAfterSeconds: number,
    message = "Too many requests. Please wait a moment and try again."
  ) {
    return new AppError(
      429,
      "RATE_LIMITED",
      message,
      undefined,
      Math.max(1, Math.ceil(retryAfterSeconds))
    );
  }

  static badRequest(code: string, message: string, details?: FieldIssue[]) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = "You need to sign in to do that.", code = "UNAUTHENTICATED") {
    return new AppError(401, code, message);
  }
  static forbidden(message = "You do not have permission to do that.", code = "FORBIDDEN") {
    return new AppError(403, code, message);
  }
  static notFound(message = "We could not find that.", code = "NOT_FOUND") {
    return new AppError(404, code, message);
  }
  static conflict(code: string, message: string) {
    return new AppError(409, code, message);
  }
}
