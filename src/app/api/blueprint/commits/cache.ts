import { TtlLruCache } from "../../live/ttl-cache";

// Memoized answers of GET /api/blueprint/commits (kept out of route.ts, which
// may only export route handlers).

export const MEMO_TTL_MS = 20_000;
export const MAX_RECENT = 20;

export interface CommitInfo {
  sha: string;
  /** First line, at most 200 characters. */
  message: string;
  author: string;
  date: string;
}

export interface CommitsPayload {
  head: CommitInfo;
  recent: CommitInfo[];
}

/** A value plus the ETag GitHub gave for it, kept past its TTL for conditional requests. */
export interface Revalidated<T> {
  etag?: string;
  value: T;
}

/** The cache clock, replaceable in tests (mocking Date.now would also confuse the GitHub client's throttling). */
export const cacheClock = { now: (): number => Date.now() };

export const visibilityCache = new TtlLruCache<Revalidated<{ isPublic: boolean }>>(200, MEMO_TTL_MS, () => cacheClock.now());
export const commitsCache = new TtlLruCache<Revalidated<CommitsPayload>>(200, MEMO_TTL_MS, () => cacheClock.now());

/** Test hook: forget memoized answers. */
export function resetCommitsCache(): void {
  visibilityCache.clear();
  commitsCache.clear();
}
