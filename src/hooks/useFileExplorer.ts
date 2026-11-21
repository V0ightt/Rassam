import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { RepoFileEntry, RepoDetails } from '@/types';
import { cacheFile, DEFAULT_FILE_CACHE_LIMIT_BYTES, getCachedPaths } from '@/lib/file-store';

const MAX_VIEWABLE_FILE_BYTES = 2 * 1024 * 1024;
const BULK_CONCURRENCY = 4;

const BINARY_EXTENSIONS = new Set([
  '7z', 'avi', 'bmp', 'class', 'dll', 'dmg', 'doc', 'docx', 'exe', 'gif', 'gz',
  'ico', 'jar', 'jpeg', 'jpg', 'mov', 'mp3', 'mp4', 'pdf', 'png', 'so', 'tar',
  'ttf', 'wav', 'webm', 'webp', 'woff', 'woff2', 'xls', 'xlsx', 'zip',
]);

const EXCLUDED_PATH = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.git)(\/|$)|(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|crt|cer))$/i;

export interface UseFileExplorerParams {
  projectId: string | null;
  fileEntries: RepoFileEntry[];
  repoDetails: RepoDetails | null;
  refreshSourceGrant?: () => Promise<string>;
}

export interface FileCacheProgress {
  total: number;
  completed: number;
  failed: number;
  estimatedBytes: number;
}

interface FileResponse {
  content: string;
  blobSha?: string;
  commitSha?: string;
  size?: number;
  binary?: boolean;
}

export function isCacheEligible(entry: RepoFileEntry): boolean {
  if (entry.type !== 'blob' || EXCLUDED_PATH.test(entry.path)) return false;
  if (typeof entry.size === 'number' && entry.size > MAX_VIEWABLE_FILE_BYTES) return false;
  const extension = entry.path.split('.').pop()?.toLowerCase() || '';
  return !BINARY_EXTENSIONS.has(extension);
}

function messageFromResponse(response: Response): Promise<string> {
  return response.json()
    .then((data: unknown) => {
      if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') return data.message;
      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
      return `File request failed with status ${response.status}.`;
    })
    .catch(() => `File request failed with status ${response.status}.`);
}

export function useFileExplorer({
  projectId,
  fileEntries,
  repoDetails,
  refreshSourceGrant,
}: UseFileExplorerParams) {
  const [cachedPaths, setCachedPaths] = useState<Set<string>>(new Set());
  const [fetchingPaths, setFetchingPaths] = useState<Set<string>>(new Set());
  const [isFetchingAll, setIsFetchingAll] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<FileCacheProgress | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const projectIdRef = useRef(projectId);
  const bulkAbortRef = useRef<AbortController | null>(null);
  const entryByPath = useMemo(
    () => new Map(fileEntries.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry])),
    [fileEntries],
  );

  useEffect(() => {
    projectIdRef.current = projectId;
    bulkAbortRef.current?.abort();
    bulkAbortRef.current = null;
    setIsFetchingAll(false);
    setCacheProgress(null);
    setLastError(null);

    if (!projectId) {
      setCachedPaths(new Set());
      return;
    }

    void getCachedPaths(projectId, repoDetails?.commitSha)
      .then((paths) => {
        if (projectIdRef.current === projectId) setCachedPaths(paths);
      })
      .catch(() => {
        if (projectIdRef.current === projectId) setLastError('The local source cache is unavailable.');
      });
  }, [projectId, repoDetails?.commitSha]);

  const requestFile = useCallback(async (entry: RepoFileEntry, signal?: AbortSignal): Promise<FileResponse> => {
    if (!repoDetails?.sourceGrant) {
      throw new Error('This project predates revision-pinned file access. Refresh its analysis to read source.');
    }

    const send = (sourceGrant: string) => fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          sourceGrant,
          path: entry.path,
          blobSha: entry.sha,
          maxBytes: MAX_VIEWABLE_FILE_BYTES,
        }),
      });
    let response = await send(repoDetails.sourceGrant);
    if (response.status === 401 && refreshSourceGrant && !signal?.aborted) {
      response = await send(await refreshSourceGrant());
    }

    if (!response.ok) throw new Error(await messageFromResponse(response));
    const result = await response.json() as Partial<FileResponse>;
    if (typeof result.content !== 'string' || result.binary) {
      throw new Error('This file is binary or is not valid UTF-8 text.');
    }
    return result as FileResponse;
  }, [refreshSourceGrant, repoDetails?.sourceGrant]);

  const fetchFile = useCallback(async (filePath: string): Promise<string | null> => {
    if (!projectId || fetchingPaths.has(filePath)) return null;
    const entry = entryByPath.get(filePath);
    if (!entry || !isCacheEligible(entry)) {
      setLastError('This file is binary, secret-like, generated, or larger than the viewer limit.');
      return null;
    }

    setLastError(null);
    setFetchingPaths((previous) => new Set(previous).add(filePath));

    try {
      const result = await requestFile(entry);
      await cacheFile(projectId, filePath, result.content, {
        commitSha: result.commitSha ?? entry.commitSha ?? repoDetails?.commitSha,
        blobSha: result.blobSha ?? entry.sha,
        sizeBytes: result.size ?? entry.size,
        isText: !result.binary,
      });
      if (projectIdRef.current === projectId) {
        setCachedPaths((previous) => new Set(previous).add(filePath));
      }
      return result.content;
    } catch (error) {
      if (projectIdRef.current === projectId) {
        setLastError(error instanceof Error ? error.message : 'Unable to fetch this file.');
      }
      return null;
    } finally {
      if (projectIdRef.current === projectId) {
        setFetchingPaths((previous) => {
          const next = new Set(previous);
          next.delete(filePath);
          return next;
        });
      }
    }
  }, [entryByPath, fetchingPaths, projectId, repoDetails?.commitSha, requestFile]);

  const cancelFetchAll = useCallback(() => {
    bulkAbortRef.current?.abort();
  }, []);

  const fetchAll = useCallback(async () => {
    if (!projectId || isFetchingAll) return;

    let estimatedBytes = 0;
    const eligible: RepoFileEntry[] = [];
    for (const entry of fileEntries) {
      if (!isCacheEligible(entry) || cachedPaths.has(entry.path)) continue;
      const nextSize = entry.size ?? 0;
      if (estimatedBytes + nextSize > DEFAULT_FILE_CACHE_LIMIT_BYTES) break;
      estimatedBytes += nextSize;
      eligible.push(entry);
    }
    if (eligible.length === 0) return;

    const controller = new AbortController();
    bulkAbortRef.current = controller;
    setLastError(null);
    setIsFetchingAll(true);
    setCacheProgress({ total: eligible.length, completed: 0, failed: 0, estimatedBytes });

    let completed = 0;
    let failed = 0;
    for (let index = 0; index < eligible.length && !controller.signal.aborted; index += BULK_CONCURRENCY) {
      const batch = eligible.slice(index, index + BULK_CONCURRENCY);
      const batchPaths = batch.map((entry) => entry.path);
      setFetchingPaths((previous) => new Set([...previous, ...batchPaths]));

      const results = await Promise.allSettled(batch.map(async (entry) => {
        const result = await requestFile(entry, controller.signal);
        await cacheFile(projectId, entry.path, result.content, {
          commitSha: result.commitSha ?? entry.commitSha ?? repoDetails?.commitSha,
          blobSha: result.blobSha ?? entry.sha,
          sizeBytes: result.size ?? entry.size,
          isText: !result.binary,
        });
        return entry.path;
      }));

      const successful: string[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') successful.push(result.value);
        else if (!controller.signal.aborted) failed += 1;
      });
      completed += results.length;

      if (projectIdRef.current === projectId) {
        setCachedPaths((previous) => new Set([...previous, ...successful]));
        setFetchingPaths((previous) => {
          const next = new Set(previous);
          batchPaths.forEach((path) => next.delete(path));
          return next;
        });
        setCacheProgress({ total: eligible.length, completed, failed, estimatedBytes });
      }
    }

    if (projectIdRef.current === projectId) {
      if (controller.signal.aborted) setLastError('Repository caching was cancelled. Completed files remain available.');
      else if (failed > 0) setLastError(`${failed} files could not be cached. You can retry.`);
      setIsFetchingAll(false);
    }
    bulkAbortRef.current = null;
  }, [cachedPaths, fileEntries, isFetchingAll, projectId, repoDetails?.commitSha, requestFile]);

  return {
    cachedPaths,
    fetchingPaths,
    isFetchingAll,
    cacheProgress,
    lastError,
    fetchFile,
    fetchAll,
    cancelFetchAll,
  };
}
