const VALID = /^[\w-]{8,64}$/;

/** Keeps a caller's request id when it is well formed, otherwise starts a new one. Same rule as the API. */
export function requestIdFrom(incoming: string | null | undefined): string {
  return incoming && VALID.test(incoming) ? incoming : crypto.randomUUID();
}

/**
 * One structured line on stderr when the web server cannot reach the API, carrying the same request id the API
 * would have logged. The path never includes the query string, and nothing from cookies or bodies is recorded.
 */
export function logUpstreamFailure(event: {
  requestId: string;
  method: string;
  path: string;
  reason: string;
}): void {
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      service: "web",
      msg: "api_unreachable",
      ...event
    })
  );
}
