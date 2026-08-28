import type { ErrorRequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import { logger } from "../logger/logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // #859: Normalize all error responses to { code, message } — including
  // Express's built-in body-parser errors so they don't leak raw stack traces.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ code: err.code, message: err.message });
    return;
  }

  // #860 companion: Express/body-parser emits a SyntaxError with status 400
  // for malformed JSON and a special error with status 413 for oversized bodies.
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: number }).status;
    if (status === 413) {
      res.status(413).json({ code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the maximum allowed size." });
      return;
    }
    if (status === 400 && err instanceof SyntaxError) {
      res.status(400).json({ code: "INVALID_JSON", message: "Request body contains invalid JSON." });
      return;
    }
  }

  logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ code: "INTERNAL_ERROR", message: "Something went wrong." });
};
