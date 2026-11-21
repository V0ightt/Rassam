import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/api-error';
import { emitOperationalEvent, type TelemetryRoute } from '@/lib/operational-telemetry';

const SESSION_COOKIE = 'rassam_session';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  readonly durable: boolean;
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  acquireLease(key: string, ttlSeconds: number): Promise<{ acquired: boolean; release: () => Promise<void> }>;
  ping(): Promise<boolean>;
}

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

interface MemoryLease {
  token: string;
  expiresAt: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly durable = false;
  private counters = new Map<string, MemoryCounter>();
  private leases = new Map<string, MemoryLease>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const prior = this.counters.get(key);
    const counter = !prior || prior.expiresAt <= now
      ? { count: 0, expiresAt: now + windowSeconds * 1000 }
      : prior;
    counter.count += 1;
    this.counters.set(key, counter);
    return {
      allowed: counter.count <= limit,
      limit,
      remaining: Math.max(0, limit - counter.count),
      resetAt: counter.expiresAt,
    };
  }

  async acquireLease(key: string, ttlSeconds: number) {
    const now = Date.now();
    const current = this.leases.get(key);
    if (current && current.expiresAt > now) {
      return { acquired: false, release: async () => undefined };
    }
    const token = randomUUID();
    this.leases.set(key, { token, expiresAt: now + ttlSeconds * 1000 });
    return {
      acquired: true,
      release: async () => {
        if (this.leases.get(key)?.token === token) this.leases.delete(key);
      },
    };
  }

  async ping() {
    return true;
  }
}

interface RedisRestResponse {
  result?: unknown;
  error?: string;
}

export class RedisRestRateLimitStore implements RateLimitStore {
  readonly durable = true;

  constructor(private readonly url: string, private readonly token: string) {}

  private async pipeline(commands: Array<Array<string | number>>): Promise<RedisRestResponse[]> {
    const response = await fetch(`${this.url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Rate-limit store returned HTTP ${response.status}.`);
    const result = await response.json() as RedisRestResponse[];
    if (!Array.isArray(result) || result.some((item) => item.error)) {
      throw new Error('Rate-limit store rejected a command.');
    }
    return result;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const result = await this.pipeline([
      ['INCR', key],
      ['EXPIRE', key, windowSeconds],
      ['TTL', key],
    ]);
    const count = Number(result[0]?.result);
    const ttl = Math.max(1, Number(result[2]?.result) || windowSeconds);
    if (!Number.isFinite(count)) throw new Error('Rate-limit store returned an invalid counter.');
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: Date.now() + ttl * 1000,
    };
  }

  async acquireLease(key: string, ttlSeconds: number) {
    const token = randomUUID();
    const result = await this.pipeline([['SET', key, token, 'NX', 'EX', ttlSeconds]]);
    const acquired = result[0]?.result === 'OK';
    return {
      acquired,
      release: async () => {
        if (!acquired) return;
        const script = "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";
        await this.pipeline([['EVAL', script, 1, key, token]]);
      },
    };
  }

  async ping() {
    const result = await this.pipeline([['PING']]);
    return result[0]?.result === 'PONG';
  }
}

let memoryStore: MemoryRateLimitStore | null = null;
let redisStore: RedisRestRateLimitStore | null = null;

export function isPublicProductionProfile(): boolean {
  return process.env.NODE_ENV === 'production'
    && process.env.RASSAM_DEPLOYMENT_PROFILE !== 'local';
}

export function getRateLimitStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redisStore ??= new RedisRestRateLimitStore(url, token);
    return redisStore;
  }
  if (isPublicProductionProfile()) {
    throw new ApiError(
      'RATE_LIMIT_STORE_UNAVAILABLE',
      503,
      'This deployment is not ready to accept public requests.',
      true,
    );
  }
  memoryStore ??= new MemoryRateLimitStore();
  return memoryStore;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET || process.env.SOURCE_GRANT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isPublicProductionProfile()) {
    throw new ApiError('SESSION_CONFIG_INVALID', 503, 'Session security is not configured.', false);
  }
  return 'rassam-local-development-session-secret';
}

function signature(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

export function createAnonymousSession(): string {
  const id = randomUUID();
  return `${id}.${signature(id)}`;
}

export function verifyAnonymousSession(value: string | undefined): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const id = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(id));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;
  for (const pair of cookie.split(';')) {
    const [candidate, ...value] = pair.trim().split('=');
    if (candidate === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function getRequestSessionId(request: Request): string {
  const session = verifyAnonymousSession(readCookie(request, SESSION_COOKIE));
  if (session) return session;
  if (!isPublicProductionProfile()) return 'local-development';
  throw new ApiError('SESSION_REQUIRED', 401, 'A valid browser session is required.', true);
}

export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get('origin');
  if (!origin && !isPublicProductionProfile()) return;
  if (!origin) throw new ApiError('ORIGIN_REQUIRED', 403, 'Request origin is required.', false);
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (new URL(origin).origin !== new URL(expected).origin) {
    throw new ApiError('ORIGIN_REJECTED', 403, 'Cross-origin requests are not allowed.', false);
  }
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const raw = forwarded || request.headers.get('x-real-ip') || 'unknown';
  return createHmac('sha256', sessionSecret()).update(raw).digest('hex').slice(0, 32);
}

export interface RequestQuota {
  scope: string;
  session: { limit: number; windowSeconds: number };
  ip: { limit: number; windowSeconds: number };
  /** Deployment-wide circuit breaker, normally a daily request/token-cost proxy. */
  global?: { limit: number; windowSeconds: number };
  concurrencyTtlSeconds?: number;
  /** Bounded deployment-wide work slots. Each slot is a short-lived durable lease. */
  globalConcurrency?: { limit: number; ttlSeconds: number };
  telemetry?: {
    requestId: string;
    route: TelemetryRoute;
    scope: 'analysis' | 'chat' | 'source-read' | 'grant-refresh' | 'model-validation';
  };
}

export interface GuardedRequest {
  sessionId: string;
  rateLimit: RateLimitResult;
  release: () => Promise<void>;
}

export async function guardApiRequest(request: Request, quota: RequestQuota): Promise<GuardedRequest> {
  assertSameOrigin(request);
  const sessionId = getRequestSessionId(request);
  const address = clientAddress(request);
  let store: RateLimitStore;
  try {
    store = getRateLimitStore();
  } catch (error) {
    if (quota.telemetry) {
      emitOperationalEvent({
        event: 'quota.outcome',
        ...quota.telemetry,
        outcome: 'unavailable',
      });
    }
    throw error;
  }
  let sessionLimit: RateLimitResult;
  let ipLimit: RateLimitResult;
  let globalLimit: RateLimitResult | undefined;
  try {
    [sessionLimit, ipLimit, globalLimit] = await Promise.all([
      store.consume(`rassam:quota:${quota.scope}:session:${sessionId}`, quota.session.limit, quota.session.windowSeconds),
      store.consume(`rassam:quota:${quota.scope}:ip:${address}`, quota.ip.limit, quota.ip.windowSeconds),
      quota.global
        ? store.consume(`rassam:quota:${quota.scope}:global`, quota.global.limit, quota.global.windowSeconds)
        : Promise.resolve(undefined),
    ]);
  } catch {
    if (quota.telemetry) {
      emitOperationalEvent({
        event: 'quota.outcome',
        ...quota.telemetry,
        outcome: 'unavailable',
      });
    }
    throw new ApiError('RATE_LIMIT_STORE_UNAVAILABLE', 503, 'Request limits are temporarily unavailable.', true);
  }
  const limits = [sessionLimit, ipLimit, ...(globalLimit ? [globalLimit] : [])];
  const strictest = limits.reduce((current, candidate) => (
    candidate.remaining / candidate.limit < current.remaining / current.limit ? candidate : current
  ));
  if (limits.some((limit) => !limit.allowed)) {
    if (quota.telemetry) {
      emitOperationalEvent({
        event: 'quota.outcome',
        ...quota.telemetry,
        outcome: 'quota-rejected',
        limit: strictest.limit,
        remaining: 0,
        resetAt: strictest.resetAt,
      });
    }
    throw new ApiError('RATE_LIMITED', 429, 'Request quota exceeded. Try again after the reset time.', true, {
      limit: strictest.limit,
      remaining: 0,
      resetAt: strictest.resetAt,
    });
  }

  const releases: Array<() => Promise<void>> = [];
  if (quota.concurrencyTtlSeconds) {
    let lease: Awaited<ReturnType<RateLimitStore['acquireLease']>>;
    try {
      lease = await store.acquireLease(
        `rassam:lease:${quota.scope}:${sessionId}`,
        quota.concurrencyTtlSeconds,
      );
    } catch {
      if (quota.telemetry) {
        emitOperationalEvent({
          event: 'quota.outcome',
          ...quota.telemetry,
          outcome: 'unavailable',
        });
      }
      throw new ApiError('RATE_LIMIT_STORE_UNAVAILABLE', 503, 'Request limits are temporarily unavailable.', true);
    }
    if (!lease.acquired) {
      if (quota.telemetry) {
        emitOperationalEvent({
          event: 'quota.outcome',
          ...quota.telemetry,
          outcome: 'capacity-rejected',
          limit: strictest.limit,
          remaining: strictest.remaining,
          resetAt: strictest.resetAt,
        });
      }
      throw new ApiError('REQUEST_IN_PROGRESS', 409, `Another ${quota.scope} request is already active.`, true);
    }
    releases.push(lease.release);
  }

  if (quota.globalConcurrency) {
    let globalLease: Awaited<ReturnType<RateLimitStore['acquireLease']>> | null = null;
    try {
      for (let slot = 0; slot < quota.globalConcurrency.limit; slot += 1) {
        const candidate = await store.acquireLease(
          `rassam:lease:${quota.scope}:global:${slot}`,
          quota.globalConcurrency.ttlSeconds,
        );
        if (candidate.acquired) {
          globalLease = candidate;
          break;
        }
      }
    } catch {
      await Promise.allSettled(releases.map((release) => release()));
      if (quota.telemetry) {
        emitOperationalEvent({
          event: 'quota.outcome',
          ...quota.telemetry,
          outcome: 'unavailable',
        });
      }
      throw new ApiError('RATE_LIMIT_STORE_UNAVAILABLE', 503, 'Request limits are temporarily unavailable.', true);
    }
    if (!globalLease) {
      await Promise.allSettled(releases.map((release) => release()));
      if (quota.telemetry) {
        emitOperationalEvent({
          event: 'quota.outcome',
          ...quota.telemetry,
          outcome: 'capacity-rejected',
          limit: strictest.limit,
          remaining: strictest.remaining,
          resetAt: strictest.resetAt,
        });
      }
      throw new ApiError('CAPACITY_EXCEEDED', 503, 'Rassam is at capacity. Please retry shortly.', true);
    }
    releases.push(globalLease.release);
  }

  const release = async () => {
    await Promise.allSettled(releases.map((releaseLease) => releaseLease()));
  };
  if (quota.telemetry) {
    emitOperationalEvent({
      event: 'quota.outcome',
      ...quota.telemetry,
      outcome: 'success',
      limit: strictest.limit,
      remaining: strictest.remaining,
      resetAt: strictest.resetAt,
    });
  }
  return { sessionId, rateLimit: strictest, release };
}

export function configuredLimit(name: string, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

export const anonymousSessionCookie = {
  name: SESSION_COOKIE,
  maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
};
