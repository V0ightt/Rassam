import {
  chatStreamEventV2Schema,
  type ChatStreamEventV2Contract,
} from '@/lib/contracts';

/**
 * Incremental, fail-closed decoder for the versioned chat NDJSON protocol.
 * A response is accepted only when every event validates, request identity is
 * stable, sequence numbers are contiguous, and exactly one terminal event is
 * observed.
 */
export class ChatStreamV2Decoder {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private requestId: string | null = null;
  private nextSequence = 1;
  private terminalSeen = false;

  push(chunk: Uint8Array): ChatStreamEventV2Contract[] {
    if (this.terminalSeen && chunk.byteLength > 0) {
      throw new Error('The chat stream sent data after its terminal event.');
    }
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drainCompleteLines();
  }

  finish(): ChatStreamEventV2Contract[] {
    this.buffer += this.decoder.decode();
    const events = this.drainCompleteLines();
    const remainder = this.buffer.trim();
    this.buffer = '';
    if (remainder) events.push(this.parseLine(remainder));
    if (!this.terminalSeen) {
      throw new Error('The chat stream ended without a terminal event.');
    }
    return events;
  }

  private drainCompleteLines(): ChatStreamEventV2Contract[] {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => this.parseLine(line));
  }

  private parseLine(line: string): ChatStreamEventV2Contract {
    if (this.terminalSeen) {
      throw new Error('The chat stream sent more than one terminal event.');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error('The chat stream returned malformed NDJSON.');
    }

    const parsed = chatStreamEventV2Schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('The chat stream returned an invalid protocol event.');
    }

    const event = parsed.data;
    if (this.requestId === null) this.requestId = event.requestId;
    if (event.requestId !== this.requestId) {
      throw new Error('The chat stream changed request identity.');
    }
    if (event.sequence !== this.nextSequence) {
      throw new Error(`The chat stream sequence is invalid (expected ${this.nextSequence}).`);
    }
    this.nextSequence += 1;
    if (event.type === 'done') this.terminalSeen = true;
    return event;
  }
}

