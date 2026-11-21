import { describe, expect, test, vi } from 'vitest';
import {
  createProjectRevisionChannel,
  parseProjectRevisionNotice,
  type ProjectRevisionNotice,
} from './project-revision-channel';

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  messages: unknown[] = [];
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    if (this.closed) throw new Error('closed');
    this.messages.push(message);
  }

  close() {
    this.closed = true;
  }

  deliver(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

describe('project revision channel', () => {
  test('validates messages and ignores malformed or self-originated notices', () => {
    FakeBroadcastChannel.instances = [];
    const received = vi.fn();
    createProjectRevisionChannel(received, {
      sourceId: 'tab-a',
      BroadcastChannelImpl: FakeBroadcastChannel,
    });
    const transport = FakeBroadcastChannel.instances[0];
    const notice: ProjectRevisionNotice = {
      protocolVersion: 1,
      sourceId: 'tab-b',
      kind: 'saved',
      projectId: 'project-1',
      token: { graphRevision: 4, checksum: 'deadbeef' },
      timestamp: '2026-08-04T00:00:00.000Z',
    };

    transport.deliver({ ...notice, sourceId: 'tab-a' });
    transport.deliver({ ...notice, token: { graphRevision: -1, checksum: 'bad' } });
    transport.deliver(notice);

    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith(notice);
    expect(parseProjectRevisionNotice(notice)).toEqual(notice);
  });

  test('publishes versioned notices and closes without delivering after teardown', () => {
    FakeBroadcastChannel.instances = [];
    const received = vi.fn();
    const bridge = createProjectRevisionChannel(received, {
      sourceId: 'tab-a',
      BroadcastChannelImpl: FakeBroadcastChannel,
    });
    const transport = FakeBroadcastChannel.instances[0];
    bridge.publish({
      kind: 'saved',
      projectId: 'project-1',
      token: { graphRevision: 5, checksum: '1234abcd' },
    });

    expect(transport.messages).toHaveLength(1);
    expect(parseProjectRevisionNotice(transport.messages[0])).toMatchObject({
      protocolVersion: 1,
      sourceId: 'tab-a',
      projectId: 'project-1',
    });

    bridge.close();
    bridge.close();
    expect(transport.closed).toBe(true);
    transport.deliver({});
    expect(received).not.toHaveBeenCalled();
  });

  test('degrades to a no-op when BroadcastChannel is unavailable or blocked', () => {
    const unavailable = createProjectRevisionChannel(vi.fn(), {
      sourceId: 'tab-a',
      BroadcastChannelImpl: null,
    });
    expect(unavailable.available).toBe(false);
    expect(() => unavailable.publish({
      kind: 'deleted',
      projectId: 'project-1',
      token: { graphRevision: 1, checksum: '1234abcd' },
    })).not.toThrow();

    class BlockedBroadcastChannel {
      constructor() { throw new Error('blocked'); }
    }
    const blocked = createProjectRevisionChannel(vi.fn(), {
      sourceId: 'tab-b',
      BroadcastChannelImpl: BlockedBroadcastChannel as never,
    });
    expect(blocked.available).toBe(false);
    expect(() => blocked.close()).not.toThrow();
  });
});
