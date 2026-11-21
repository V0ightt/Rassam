import type { ProjectPersistenceToken } from './project-store';

const CHANNEL_NAME = 'rassam-project-revisions-v2';

export type ProjectRevisionNotice =
  | {
      protocolVersion: 1;
      sourceId: string;
      kind: 'saved';
      projectId: string;
      token: ProjectPersistenceToken;
      timestamp: string;
    }
  | {
      protocolVersion: 1;
      sourceId: string;
      kind: 'deleted';
      projectId: string;
      token: ProjectPersistenceToken;
      timestamp: string;
    };

export interface ProjectRevisionChannel {
  readonly sourceId: string;
  readonly available: boolean;
  publish(notice: Omit<ProjectRevisionNotice, 'protocolVersion' | 'sourceId' | 'timestamp'>): void;
  close(): void;
}

interface BroadcastChannelLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

type BroadcastChannelConstructor = new (name: string) => BroadcastChannelLike;

function isPersistenceToken(value: unknown): value is ProjectPersistenceToken {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProjectPersistenceToken>;
  return Number.isSafeInteger(candidate.graphRevision)
    && (candidate.graphRevision ?? -1) >= 0
    && typeof candidate.checksum === 'string'
    && /^[0-9a-f]{8}$/i.test(candidate.checksum);
}

export function parseProjectRevisionNotice(value: unknown): ProjectRevisionNotice | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<ProjectRevisionNotice>;
  if (
    candidate.protocolVersion !== 1
    || typeof candidate.sourceId !== 'string'
    || candidate.sourceId.length === 0
    || (candidate.kind !== 'saved' && candidate.kind !== 'deleted')
    || typeof candidate.projectId !== 'string'
    || candidate.projectId.length === 0
    || typeof candidate.timestamp !== 'string'
    || !Number.isFinite(Date.parse(candidate.timestamp))
    || !isPersistenceToken(candidate.token)
  ) {
    return null;
  }
  return candidate as ProjectRevisionNotice;
}

/**
 * BroadcastChannel is an optimization for immediate conflict feedback. The
 * IndexedDB compare-and-swap remains authoritative when the API is missing,
 * blocked by privacy settings, or throws during construction/message delivery.
 */
export function createProjectRevisionChannel(
  onNotice: (notice: ProjectRevisionNotice) => void,
  options: {
    sourceId?: string;
    BroadcastChannelImpl?: BroadcastChannelConstructor | null;
  } = {},
): ProjectRevisionChannel {
  const sourceId = options.sourceId ?? crypto.randomUUID();
  const Constructor = options.BroadcastChannelImpl === undefined
    ? (typeof BroadcastChannel === 'function' ? BroadcastChannel : null)
    : options.BroadcastChannelImpl;
  let channel: BroadcastChannelLike | null = null;
  let closed = false;

  if (Constructor) {
    try {
      channel = new Constructor(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (closed) return;
        const notice = parseProjectRevisionNotice(event.data);
        if (!notice || notice.sourceId === sourceId) return;
        onNotice(notice);
      };
    } catch {
      channel = null;
    }
  }

  return {
    sourceId,
    available: channel !== null,
    publish(notice) {
      if (closed || !channel) return;
      try {
        channel.postMessage({
          ...notice,
          protocolVersion: 1,
          sourceId,
          timestamp: new Date().toISOString(),
        } satisfies ProjectRevisionNotice);
      } catch {
        // CAS still protects the persisted document when notification fails.
      }
    },
    close() {
      if (closed) return;
      closed = true;
      if (!channel) return;
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Browser teardown may close the underlying port first.
      }
      channel = null;
    },
  };
}
