"use client";

import { useHydrated } from "./use-hydrated";

let captured: string | null = null;

/** Reads `#token=…` once and removes it from the address bar and history straight away. */
function capture(): string | null {
  const match = /(?:^|[#&])token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  if (match) {
    captured = match[1] ?? null;
    // The fragment never leaves the browser, but it should not linger in the URL, history or a screenshot either.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return captured;
}

/**
 * The one-time token from an emailed link. Tokens live in the fragment so servers, proxies and Referer headers
 * never see them, and so a mail scanner that merely fetches the link cannot use it up (it does not run this script).
 */
export function useHashToken(): { ready: boolean; token: string | null } {
  const hydrated = useHydrated();
  return hydrated ? { ready: true, token: capture() } : { ready: false, token: null };
}
