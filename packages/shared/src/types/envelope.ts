export interface ApiValidationError {
  field: string;
  message: string;
}

/** Matches the API's error response shape. */
export interface ApiErrorResponse {
  message: string;
  errors?: ApiValidationError[];
}

/** @deprecated The current API does not return a success/error envelope. */
export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** @deprecated The current API does not return a success/error envelope. */
export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

/** @deprecated The current API does not return a success/error envelope. */
export interface ErrorEnvelope {
  success: false;
  error: {
    code: DomainErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** @deprecated The current API does not return a success/error envelope. */
export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** @deprecated The current API does not return a success/error envelope. */
export function success<T>(data: T): SuccessEnvelope<T> {
  return { success: true, data };
}

/** @deprecated The current API does not return a success/error envelope. */
export function error(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return { success: false, error: { code, message, details } };
}

/** @deprecated The current API does not return a success/error envelope. */
export function paginated<T>(
  data: T[],
  total: number,
  nextCursor?: string,
): SuccessEnvelope<{ items: T[]; total: number; nextCursor?: string }> {
  return success({ items: data, total, nextCursor });
}
