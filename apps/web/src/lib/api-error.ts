import type { ApiErrorBody } from "@sidewalk/contracts";

/** A failed API call, carrying the server's stable error code and any per-field problems. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Array<{ field: string; message: string }> = []
  ) {
    super(message);
    this.name = "ApiError";
  }

  static fromBody(status: number, body: Partial<ApiErrorBody> | null): ApiError {
    return new ApiError(
      status,
      body?.code ?? "UNKNOWN",
      body?.message ?? "Something went wrong. Please try again.",
      body?.details ?? []
    );
  }
}
