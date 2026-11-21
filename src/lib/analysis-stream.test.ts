import { describe, expect, it } from 'vitest';
import { consumeAnalysisResponse } from '@/lib/analysis-stream';

function event(sequence: number, type: 'progress' | 'error', payload: Record<string, unknown>) {
  return JSON.stringify({
    protocolVersion: 2,
    requestId: 'request-1234',
    sequence,
    type,
    payload,
    timestamp: new Date(0).toISOString(),
    ...(type === 'error' ? { terminal: true } : {}),
  });
}

describe('consumeAnalysisResponse', () => {
  it('handles fragmented progress events and a safe terminal error', async () => {
    const body = `${event(1, 'progress', {
      stage: 'validate',
      message: 'Validated',
      progress: 0.1,
    })}\n${event(2, 'error', {
      code: 'REPOSITORY_PRIVATE',
      message: 'Private repositories are not supported.',
      retryable: false,
    })}\n`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body.slice(0, 47)));
        controller.enqueue(new TextEncoder().encode(body.slice(47)));
        controller.close();
      },
    });
    const progress: string[] = [];
    await expect(consumeAnalysisResponse(new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    }), (update) => progress.push(update.stage))).rejects.toMatchObject({
      code: 'REPOSITORY_PRIVATE',
    });
    expect(progress).toEqual(['validate']);
  });

  it('rejects skipped sequence numbers', async () => {
    const body = `${event(2, 'progress', {
      stage: 'validate',
      message: 'Validated',
      progress: 0.1,
    })}\n`;
    await expect(consumeAnalysisResponse(new Response(body, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    }), () => undefined)).rejects.toMatchObject({ code: 'INVALID_STREAM' });
  });
});
