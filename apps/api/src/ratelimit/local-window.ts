/**
 * A small in-memory fixed-window counter. It is only the fallback used while the shared store is unreachable, so
 * limits keep being enforced (per process) during an outage instead of being dropped. Its size is bounded: when
 * full, expired entries go first, then the oldest.
 */
export class LocalWindowLimiter {
  private readonly windows = new Map<string, { hits: number; expiresAt: number }>();

  constructor(private readonly maxEntries = 50_000) {}

  hit(key: string, windowMs: number, now = Date.now()): { hits: number; ttlMs: number } {
    const current = this.windows.get(key);
    if (current && current.expiresAt > now) {
      current.hits += 1;
      return { hits: current.hits, ttlMs: current.expiresAt - now };
    }
    this.make(now);
    this.windows.set(key, { hits: 1, expiresAt: now + windowMs });
    return { hits: 1, ttlMs: windowMs };
  }

  peek(key: string, now = Date.now()): { hits: number; ttlMs: number } {
    const current = this.windows.get(key);
    return current && current.expiresAt > now
      ? { hits: current.hits, ttlMs: current.expiresAt - now }
      : { hits: 0, ttlMs: 0 };
  }

  delete(key: string): void {
    this.windows.delete(key);
  }

  get size(): number {
    return this.windows.size;
  }

  /** Makes room for one more entry. */
  private make(now: number): void {
    if (this.windows.size < this.maxEntries) return;
    for (const [k, v] of this.windows) if (v.expiresAt <= now) this.windows.delete(k);
    while (this.windows.size >= this.maxEntries) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}
