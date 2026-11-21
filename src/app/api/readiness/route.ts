import { NextRequest, NextResponse } from 'next/server';
import { createRequestId } from '@/lib/api-error';
import { getAllProviderMetadata } from '@/lib/llm/catalog';
import { emitOperationalEvent, telemetryDuration, telemetryNow } from '@/lib/operational-telemetry';
import { getRateLimitStore, isPublicProductionProfile } from '@/lib/request-security';
import { APP_VERSION, PROJECT_SCHEMA_VERSION, STREAM_PROTOCOL_VERSION } from '@/lib/version';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request.headers.get('x-request-id'));
  const requestStartedAt = telemetryNow();
  const checks: Record<string, { ready: boolean; reason?: string }> = {};
  const sourceSecret = process.env.SOURCE_GRANT_SECRET;
  const sessionSecret = process.env.SESSION_SIGNING_SECRET || sourceSecret;

  checks.sourceGrants = {
    ready: !isPublicProductionProfile() || Boolean(sourceSecret && Buffer.byteLength(sourceSecret) >= 32),
    ...(!sourceSecret && isPublicProductionProfile() ? { reason: 'not configured' } : {}),
  };
  checks.sessions = {
    ready: !isPublicProductionProfile() || Boolean(sessionSecret && Buffer.byteLength(sessionSecret) >= 32),
    ...(!sessionSecret && isPublicProductionProfile() ? { reason: 'not configured' } : {}),
  };

  checks.schemaVersions = {
    ready: PROJECT_SCHEMA_VERSION === 2 && STREAM_PROTOCOL_VERSION === 2,
    ...(PROJECT_SCHEMA_VERSION !== 2 || STREAM_PROTOCOL_VERSION !== 2 ? { reason: 'unsupported schema version' } : {}),
  };

  const providers = getAllProviderMetadata();
  checks.providerCatalog = {
    // AI is optional for deterministic analysis, so readiness checks that the
    // static catalog is valid rather than making a billable provider request.
    ready: providers.length > 0 && providers.every((provider) => provider.models.length > 0),
    ...(providers.length === 0 ? { reason: 'provider catalog is empty' } : {}),
  };

  const limiterStartedAt = telemetryNow();
  try {
    const limiter = getRateLimitStore();
    const reachable = await limiter.ping();
    checks.rateLimitStore = {
      ready: reachable && (!isPublicProductionProfile() || limiter.durable),
      ...(!limiter.durable ? { reason: 'development-only memory store' } : {}),
    };
    emitOperationalEvent({
      event: 'upstream.completed',
      requestId,
      route: '/api/readiness',
      upstream: 'rate-limit-store',
      operation: 'readiness-ping',
      outcome: checks.rateLimitStore.ready ? 'success' : 'unavailable',
      durationMs: telemetryDuration(limiterStartedAt),
    });
  } catch {
    checks.rateLimitStore = { ready: false, reason: 'unavailable' };
    emitOperationalEvent({
      event: 'upstream.completed',
      requestId,
      route: '/api/readiness',
      upstream: 'rate-limit-store',
      operation: 'readiness-ping',
      outcome: 'unavailable',
      durationMs: telemetryDuration(limiterStartedAt),
      errorCode: 'RATE_LIMIT_STORE_UNAVAILABLE',
    });
  }

  const ready = Object.values(checks).every((check) => check.ready);
  const status = ready ? 200 : 503;
  const response = NextResponse.json(
    {
      status: ready ? 'ready' : 'not-ready',
      appVersion: APP_VERSION,
      projectSchemaVersion: PROJECT_SCHEMA_VERSION,
      streamProtocolVersion: STREAM_PROTOCOL_VERSION,
      requestId,
      deploymentProfile: isPublicProductionProfile() ? 'public' : 'local',
      providers: providers.map((provider) => ({
        id: provider.id,
        configured: provider.available,
        capabilities: provider.capabilities,
      })),
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    },
  );
  emitOperationalEvent({
    event: 'request.completed',
    requestId,
    route: '/api/readiness',
    method: 'GET',
    status,
    outcome: ready ? 'success' : 'unavailable',
    durationMs: telemetryDuration(requestStartedAt),
    ...(!ready ? { errorCode: 'READINESS_CHECK_FAILED' } : {}),
  });
  return response;
}
