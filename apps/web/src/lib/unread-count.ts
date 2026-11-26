const EVENT = "sw:unread-notifications";

type Change = { delta: number } | { set: number };

/**
 * The header lives in a layout that client-side navigation keeps, so it cannot rely on a server render to learn
 * that something was read. Notification actions announce the change here and the bell follows at once; the
 * server count still wins on every full page load.
 */
export function announceUnread(change: Change): void {
  window.dispatchEvent(new CustomEvent<Change>(EVENT, { detail: change }));
}

export function onUnreadChange(listener: (change: Change) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<Change>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
