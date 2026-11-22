import { NextRequest, NextResponse } from 'next/server';
import { createRequestId } from '@/lib/api-error';
import { emitOperationalEvent, telemetryDuration, telemetryNow } from '@/lib/operational-telemetry';
import { APP_VERSION } from '@/lib/version';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request.headers.get('x-request-id'));
  const startedAt = telemetryNow();
  const response = NextResponse.json(
    {
      status: 'ok',
      appVersion: APP_VERSION,
      requestId,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
  emitOperationalEvent({
    event: 'request.completed',
    requestId,
    route: '/api/health',
    method: 'GET',
    status: 200,
    outcome: 'success',
    durationMs: telemetryDuration(startedAt),
  });
  return response;
}
