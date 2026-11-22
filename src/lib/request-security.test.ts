import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import {
  MemoryRateLimitStore,
  assertSameOrigin,
  createAnonymousSession,
  guardApiRequest,
  configuredLimit,
  verifyAnonymousSession,
} from '@/lib/request-security';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('anonymous session signing', () => {
  it('accepts an issued session and rejects tampering', () => {
    const session = createAnonymousSession();
    expect(verifyAnonymousSession(session)).toMatch(/^[0-9a-f-]{36}$/i);
    expect(verifyAnonymousSession(`${session}x`)).toBeNull();
  });
});

describe('same-origin enforcement', () => {
  it('accepts the configured origin and rejects a foreign origin', () => {
    vi.stubEnv('APP_ORIGIN', 'https://rassam.example');
    expect(() => assertSameOrigin(new Request('https://rassam.example/api/repo', {
      method: 'POST',
      headers: { Origin: 'https://rassam.example' },
    }))).not.toThrow();
    expect(() => assertSameOrigin(new Request('https://rassam.example/api/repo', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    }))).toThrowError(ApiError);
  });
});

describe('memory quotas and leases', () => {
  it('enforces counters and releases only its own active lease', async () => {
    const store = new MemoryRateLimitStore();
    expect((await store.consume('test', 2, 60)).allowed).toBe(true);
    expect((await store.consume('test', 2, 60)).allowed).toBe(true);
    expect((await store.consume('test', 2, 60)).allowed).toBe(false);

    const first = await store.acquireLease('analysis', 60);
    const second = await store.acquireLease('analysis', 60);
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(false);
    await first.release();
    expect((await store.acquireLease('analysis', 60)).acquired).toBe(true);
  });

  it('returns transparent quota metadata from the request guard', async () => {
    const request = new Request('http://localhost/api/chat', { method: 'POST' });
    const guarded = await guardApiRequest(request, {
      scope: `test-${crypto.randomUUID()}`,
      session: { limit: 2, windowSeconds: 60 },
      ip: { limit: 3, windowSeconds: 60 },
      concurrencyTtlSeconds: 10,
    });
    expect(guarded.sessionId).toBe('local-development');
    expect(guarded.rateLimit.remaining).toBeGreaterThanOrEqual(0);
    await guarded.release();
  });

  it('enforces deployment-wide quotas and bounded work slots', async () => {
    const scope = `global-${crypto.randomUUID()}`;
    const quota = {
      scope,
      session: { limit: 10, windowSeconds: 60 },
      ip: { limit: 10, windowSeconds: 60 },
      global: { limit: 3, windowSeconds: 60 },
      globalConcurrency: { limit: 2, ttlSeconds: 10 },
    };
    const request = new Request('http://localhost/api/chat', { method: 'POST' });
    const first = await guardApiRequest(request, quota);
    const second = await guardApiRequest(request, quota);
    await expect(guardApiRequest(request, quota)).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' });
    await first.release();
    await second.release();
    await expect(guardApiRequest(request, quota)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('bounds configurable circuit-breaker values', () => {
    vi.stubEnv('RASSAM_TEST_LIMIT', '999');
    expect(configuredLimit('RASSAM_TEST_LIMIT', 10, 100)).toBe(100);
    vi.stubEnv('RASSAM_TEST_LIMIT', 'invalid');
    expect(configuredLimit('RASSAM_TEST_LIMIT', 10, 100)).toBe(10);
  });
});
