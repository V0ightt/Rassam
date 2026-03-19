import type { CanvasSyncSnapshot, RepoFileEntry } from '@/types';
import { sanitizeAvailableFiles } from '@/lib/chat-file-resolution';

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function buildAvailableFiles(
  fileTree: RepoFileEntry[] | null | undefined,
  limit = 2000,
): string[] {
  return sanitizeAvailableFiles(
    (fileTree || [])
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path),
    limit,
  );
}

export function shouldPreferLiveCanvas(
  liveCanvasLastModifiedAt: string | null | undefined,
  syncedCanvasContext: CanvasSyncSnapshot | null | undefined,
): boolean {
  if (!syncedCanvasContext) return true;

  const liveTimestamp = parseTimestamp(liveCanvasLastModifiedAt);
  if (liveTimestamp === null) return false;

  const syncedTimestamp = parseTimestamp(syncedCanvasContext.syncedAt);
  if (syncedTimestamp === null) return true;

  return liveTimestamp > syncedTimestamp;
}

export function selectCanvasContextForChat(
  liveCanvasContext: CanvasSyncSnapshot,
  syncedCanvasContext: CanvasSyncSnapshot | null | undefined,
  liveCanvasLastModifiedAt: string | null | undefined,
): CanvasSyncSnapshot {
  return shouldPreferLiveCanvas(liveCanvasLastModifiedAt, syncedCanvasContext)
    ? liveCanvasContext
    : (syncedCanvasContext || liveCanvasContext);
}
