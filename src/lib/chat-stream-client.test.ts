import { describe, expect, it } from 'vitest';

import { ChatStreamV2Decoder } from './chat-stream-client';

function event(type: 'status' | 'text' | 'done', sequence: number, extras: Record<string, unknown> = {}) {
  return JSON.stringify({
    protocolVersion: 2,
    requestId: 'request-1234',
    sequence,
    timestamp: '2026-08-04T00:00:00.000Z',
    terminal: type === 'done',
    type,
    ...extras,
  });
}

describe('ChatStreamV2Decoder', () => {
  it('decodes fragmented NDJSON and requires one terminal event', () => {
    const decoder = new ChatStreamV2Decoder();
    const payload = `${event('status', 1, { text: 'Reading' })}\n${event('text', 2, { text: 'Hello' })}\n${event('done', 3)}\n`;
    const bytes = new TextEncoder().encode(payload);

    expect(decoder.push(bytes.slice(0, 19))).toEqual([]);
    expect(decoder.push(bytes.slice(19))).toHaveLength(3);
    expect(decoder.finish()).toEqual([]);
  });

  it('rejects malformed, skipped, mixed-request, and unterminated streams', () => {
    expect(() => {
      const decoder = new ChatStreamV2Decoder();
      decoder.push(new TextEncoder().encode('{bad}\n'));
    }).toThrow(/malformed/i);

    expect(() => {
      const decoder = new ChatStreamV2Decoder();
      decoder.push(new TextEncoder().encode(`${event('text', 2, { text: 'late' })}\n`));
    }).toThrow(/sequence/i);

    expect(() => {
      const decoder = new ChatStreamV2Decoder();
      decoder.push(new TextEncoder().encode(`${event('text', 1, { text: 'partial' })}\n`));
      decoder.finish();
    }).toThrow(/terminal/i);
  });

  it('rejects events after done', () => {
    const decoder = new ChatStreamV2Decoder();
    decoder.push(new TextEncoder().encode(`${event('done', 1)}\n`));
    expect(() => decoder.push(new TextEncoder().encode(`${event('text', 2, { text: 'late' })}\n`))).toThrow(/after/i);
  });
});
