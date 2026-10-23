"use client";

import { useCallback, useState } from "react";
import { ApiError } from "./api-error";

/** Runs an async action with pending and error state, so every form reports failures the same way. */
export function useAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(0, "UNKNOWN", (e as Error).message || "Something went wrong.")
        );
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn]
  );

  const fieldError = (field: string) => error?.details.find((d) => d.field === field)?.message;
  return { run, pending, error, fieldError, clear: () => setError(null) };
}
