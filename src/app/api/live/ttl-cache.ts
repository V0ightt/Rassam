// A small in-memory LRU with a time-to-live. Per server instance; it only
// exists to keep repeated reads of the same repository off the GitHub quota.

export class TtlLruCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Expired entries stay (bounded by the LRU) so `peekStale` can revalidate them.
    if (entry.expiresAt <= this.now()) return undefined;
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** The stored value even when it has expired (for conditional revalidation). */
  peekStale(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }

  set(key: string, value: T, ttlMs: number = this.ttlMs): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
