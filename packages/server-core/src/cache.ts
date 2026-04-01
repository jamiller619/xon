import { createHash } from 'node:crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Simple in-memory LRU-style cache with TTL-based expiry. */
export class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /** Store a value under key for ttlMs milliseconds (default 30 s). */
  set<T>(key: string, value: T, ttlMs = 30_000): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Retrieve a cached value, or undefined if missing / expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** Remove a single key. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Remove all keys that start with prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Number of entries currently held (including expired-but-not-yet-evicted). */
  size(): number {
    return this.store.size;
  }

  /** Drop all entries — useful in tests. */
  clear(): void {
    this.store.clear();
  }
}

/** Shared application-wide cache instance. */
export const appCache = new InMemoryCache();

/**
 * Compute a short SHA-1 ETag for arbitrary JSON-serialisable data.
 * Returns a quoted string as required by the HTTP spec, e.g. `"a1b2c3d4e5f6g7h8"`.
 */
export function computeETag(data: unknown): string {
  const json = JSON.stringify(data);
  return `"${createHash('sha1').update(json).digest('hex').slice(0, 16)}"`;
}
