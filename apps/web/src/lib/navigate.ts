"use client";

/**
 * Full page navigation for changes of authentication state (sign in, sign out, delete account).
 * The header and every cached server-rendered page depend on who is signed in, so a clean load is the
 * most reliable way to make all of it consistent. This also avoids racing a client navigation against a
 * server redirect.
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
