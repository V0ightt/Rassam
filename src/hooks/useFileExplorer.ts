import { useState, useCallback, useEffect, useRef } from 'react';
import { RepoFileEntry, RepoDetails } from '@/types';
import { cacheFile, getCachedPaths } from '@/lib/file-store';

export interface UseFileExplorerParams {
  projectId: string | null;
  fileEntries: RepoFileEntry[];
  repoDetails: RepoDetails | null;
}

export function useFileExplorer({ projectId, fileEntries, repoDetails }: UseFileExplorerParams) {
  const [cachedPaths, setCachedPaths] = useState<Set<string>>(new Set());
  const [fetchingPaths, setFetchingPaths] = useState<Set<string>>(new Set());
  const [isFetchingAll, setIsFetchingAll] = useState(false);

  // Track current project to avoid stale updates
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Load cached paths from IndexedDB when project changes
  useEffect(() => {
    if (!projectId) {
      setCachedPaths(new Set());
      return;
    }

    getCachedPaths(projectId)
      .then((paths) => {
        if (projectIdRef.current === projectId) setCachedPaths(paths);
      })
      .catch(console.error);
  }, [projectId]);

  const fetchFile = useCallback(
    async (filePath: string) => {
      if (!projectId || !repoDetails) return;
      if (cachedPaths.has(filePath) || fetchingPaths.has(filePath)) return;

      setFetchingPaths((prev) => new Set(prev).add(filePath));

      try {
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: repoDetails.owner,
            repo: repoDetails.repo,
            path: filePath,
          }),
        });

        if (!res.ok) throw new Error('Fetch failed');

        const { content } = await res.json();
        await cacheFile(projectId, filePath, content);

        if (projectIdRef.current === projectId) {
          setCachedPaths((prev) => new Set(prev).add(filePath));
        }
      } catch (err) {
        console.error(`Failed to fetch ${filePath}:`, err);
      } finally {
        setFetchingPaths((prev) => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    },
    [projectId, repoDetails, cachedPaths, fetchingPaths],
  );

  const fetchAll = useCallback(async () => {
    if (!projectId || !repoDetails || isFetchingAll) return;

    const blobs = fileEntries.filter((e) => e.type === 'blob' && !cachedPaths.has(e.path));
    if (blobs.length === 0) return;

    setIsFetchingAll(true);

    // Fetch in batches of 5 to avoid overwhelming the API
    const BATCH_SIZE = 5;
    for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
      if (projectIdRef.current !== projectId) break;

      const batch = blobs.slice(i, i + BATCH_SIZE);
      const batchPaths = batch.map((b) => b.path);

      setFetchingPaths((prev) => {
        const next = new Set(prev);
        batchPaths.forEach((p) => next.add(p));
        return next;
      });

      await Promise.allSettled(
        batch.map(async (entry) => {
          try {
            const res = await fetch('/api/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                owner: repoDetails.owner,
                repo: repoDetails.repo,
                path: entry.path,
              }),
            });
            if (!res.ok) return;
            const { content } = await res.json();
            await cacheFile(projectId, entry.path, content);

            if (projectIdRef.current === projectId) {
              setCachedPaths((prev) => new Set(prev).add(entry.path));
            }
          } catch {
            // ignore individual failures
          }
        }),
      );

      setFetchingPaths((prev) => {
        const next = new Set(prev);
        batchPaths.forEach((p) => next.delete(p));
        return next;
      });
    }

    setIsFetchingAll(false);
  }, [projectId, repoDetails, fileEntries, cachedPaths, isFetchingAll]);

  return {
    cachedPaths,
    fetchingPaths,
    isFetchingAll,
    fetchFile,
    fetchAll,
  };
}
