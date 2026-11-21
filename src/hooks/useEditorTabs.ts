import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CANVAS_TAB, type EditorTab } from '@/lib/editor-tabs';
import { MAX_VIEWER_FILE_BYTES } from '@/lib/contracts';
import {
  type FileRevisionExpectation,
  verifyFileRevision,
} from '@/lib/editor-file';
import { cacheFile, getCachedFileRecord } from '@/lib/file-store';
import type { SourceLocation } from '@/lib/source-location';
import type { RepoDetails, RepoFileEntry } from '@/types';

export interface UseEditorTabsParams {
  projectId: string | null;
  repoDetails: RepoDetails | null;
  fileEntries?: RepoFileEntry[];
  refreshSourceGrant?: () => Promise<string>;
}

export interface OpenFileOptions {
  /** Ignore memory and IndexedDB, then read the file again from the pinned commit. */
  forceRefresh?: boolean;
}

export interface EditorFileRevision extends FileRevisionExpectation {
  actualCommitSha?: string;
  actualBlobSha?: string;
  verified: boolean;
  source: 'cache' | 'network' | 'prefetched';
  sizeBytes?: number;
}

export interface EditorFileViewState {
  location?: SourceLocation;
  /** Changes whenever the same location is explicitly revealed again. */
  navigationKey: number;
  scrollTop: number;
}

interface EditorWorkspaceMemory {
  repositoryCommitSha?: string;
  tabs: EditorTab[];
  activeTabId: string;
  fileContents: Record<string, string>;
  fileErrors: Record<string, string>;
  fileRevisions: Record<string, EditorFileRevision>;
  fileViews: Record<string, Omit<EditorFileViewState, 'scrollTop'>>;
  scrollPositions: Map<string, number>;
}

interface PinnedFileResponse {
  path?: string;
  content: string | null;
  blobSha?: string;
  commitSha?: string;
  size?: number;
  binary?: boolean;
}

function workspaceKey(projectId: string | null): string | null {
  return projectId ? `project:${projectId}` : null;
}

function sameSha(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  } catch {
    // A safe generic message is used when the response is not JSON.
  }
  return response.status === 413
    ? 'This file exceeds the 2 MiB viewer limit.'
    : 'The pinned source file could not be loaded.';
}

function initialWorkspace(): EditorWorkspaceMemory {
  return {
    repositoryCommitSha: undefined,
    tabs: [CANVAS_TAB],
    activeTabId: CANVAS_TAB.id,
    fileContents: {},
    fileErrors: {},
    fileRevisions: {},
    fileViews: {},
    scrollPositions: new Map(),
  };
}

export function useEditorTabs({
  projectId,
  repoDetails,
  fileEntries = [],
  refreshSourceGrant,
}: UseEditorTabsParams) {
  const [tabs, setTabs] = useState<EditorTab[]>([CANVAS_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>(CANVAS_TAB.id);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [fileRevisions, setFileRevisions] = useState<Record<string, EditorFileRevision>>({});
  const [fileViews, setFileViews] = useState<Record<string, Omit<EditorFileViewState, 'scrollTop'>>>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const fileContentsRef = useRef(fileContents);
  const fileErrorsRef = useRef(fileErrors);
  const fileRevisionsRef = useRef(fileRevisions);
  const fileViewsRef = useRef(fileViews);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const projectIdRef = useRef(projectId);
  const repositoryCommitRef = useRef(repoDetails?.commitSha);
  const currentWorkspaceKeyRef = useRef<string | null>(workspaceKey(projectId));
  const workspacesRef = useRef<Map<string, EditorWorkspaceMemory>>(new Map());
  const inFlightFetchesRef = useRef<Map<string, {
    promise: Promise<boolean>;
    controller: AbortController;
  }>>(new Map());

  const entryByPath = useMemo(
    () => new Map(fileEntries.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry])),
    [fileEntries],
  );

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { fileContentsRef.current = fileContents; }, [fileContents]);
  useEffect(() => { fileErrorsRef.current = fileErrors; }, [fileErrors]);
  useEffect(() => { fileRevisionsRef.current = fileRevisions; }, [fileRevisions]);
  useEffect(() => { fileViewsRef.current = fileViews; }, [fileViews]);

  // Keep open tabs and scroll positions isolated by project for the lifetime of
  // the workbench. Source content remains backed by the revision-aware cache.
  useEffect(() => {
    const previousKey = currentWorkspaceKeyRef.current;
    if (previousKey) {
      workspacesRef.current.set(previousKey, {
        repositoryCommitSha: repositoryCommitRef.current,
        tabs: tabsRef.current,
        activeTabId: activeTabIdRef.current,
        fileContents: fileContentsRef.current,
        fileErrors: fileErrorsRef.current,
        fileRevisions: fileRevisionsRef.current,
        fileViews: fileViewsRef.current,
        scrollPositions: new Map(scrollPositionsRef.current),
      });
    }

    for (const request of inFlightFetchesRef.current.values()) request.controller.abort();
    inFlightFetchesRef.current.clear();

    projectIdRef.current = projectId;
    repositoryCommitRef.current = repoDetails?.commitSha;
    const nextKey = workspaceKey(projectId);
    currentWorkspaceKeyRef.current = nextKey;
    const stored = nextKey ? workspacesRef.current.get(nextKey) : undefined;
    const sameRepositoryRevision = stored?.repositoryCommitSha?.toLowerCase()
      === repoDetails?.commitSha?.toLowerCase();
    const next = stored && sameRepositoryRevision
      ? stored
      : stored
        ? {
            ...stored,
            repositoryCommitSha: repoDetails?.commitSha,
            fileContents: {},
            fileErrors: {},
            fileRevisions: {},
          }
        : { ...initialWorkspace(), repositoryCommitSha: repoDetails?.commitSha };

    tabsRef.current = next.tabs;
    activeTabIdRef.current = next.activeTabId;
    fileContentsRef.current = next.fileContents;
    fileErrorsRef.current = next.fileErrors;
    fileRevisionsRef.current = next.fileRevisions;
    fileViewsRef.current = next.fileViews;
    scrollPositionsRef.current = new Map(next.scrollPositions);
    setTabs(next.tabs);
    setActiveTabId(next.activeTabId);
    setFileContents(next.fileContents);
    setFileErrors(next.fileErrors);
    setFileRevisions(next.fileRevisions);
    setFileViews(next.fileViews);
    setLoadingFiles(new Set());
  }, [projectId, repoDetails?.commitSha]);

  useEffect(() => () => {
    for (const request of inFlightFetchesRef.current.values()) request.controller.abort();
  }, []);

  const setError = useCallback((filePath: string, message?: string) => {
    setFileErrors((previous) => {
      const next = { ...previous };
      if (message) next[filePath] = message;
      else delete next[filePath];
      fileErrorsRef.current = next;
      return next;
    });
  }, []);

  const applyLoadedFile = useCallback((
    sourceProjectId: string | null,
    sourceCommitSha: string | undefined,
    filePath: string,
    content: string,
    revision: EditorFileRevision,
  ) => {
    if (
      projectIdRef.current !== sourceProjectId
      || repositoryCommitRef.current?.toLowerCase() !== sourceCommitSha?.toLowerCase()
    ) return;

    setFileContents((previous) => {
      const next = { ...previous, [filePath]: content };
      fileContentsRef.current = next;
      return next;
    });
    setFileRevisions((previous) => {
      const next = { ...previous, [filePath]: revision };
      fileRevisionsRef.current = next;
      return next;
    });
    setError(filePath);
  }, [setError]);

  /**
   * Open a path or evidence-backed source location. Existing string callers
   * remain supported; graph and chat callers can pass SourceLocation directly.
   */
  const openFile = useCallback(async (
    target: string | SourceLocation,
    prefetchedContent?: string,
    options: OpenFileOptions = {},
  ): Promise<boolean> => {
    const location: SourceLocation = typeof target === 'string' ? { path: target } : target;
    const filePath = location.path;
    const sourceProjectId = projectId;
    const sourceCommitSha = repoDetails?.commitSha;
    const entry = entryByPath.get(filePath);
    const expectedBlobSha = location.blobSha ?? entry?.sha;
    const expectation: FileRevisionExpectation = {
      expectedCommitSha: sourceCommitSha,
      expectedBlobSha,
    };

    setTabs((previous) => {
      if (previous.some((tab) => tab.id === filePath)) return previous;
      const fileName = filePath.split('/').pop() || filePath;
      return [...previous, { id: filePath, label: fileName, filePath }];
    });
    setActiveTabId(filePath);
    setFileViews((previous) => {
      const current = previous[filePath];
      const next = {
        ...previous,
        [filePath]: {
          location,
          navigationKey: (current?.navigationKey ?? 0) + 1,
        },
      };
      fileViewsRef.current = next;
      return next;
    });

    if (fileEntries.length > 0 && !entry) {
      setError(filePath, 'This path is not present in the pinned repository snapshot.');
      return false;
    }
    if (location.blobSha && entry?.sha && !sameSha(location.blobSha, entry.sha)) {
      setError(filePath, 'The evidence blob does not match the pinned repository tree.');
      return false;
    }

    if (typeof prefetchedContent === 'string' && !options.forceRefresh) {
      const actualCommitSha = entry?.commitSha ?? sourceCommitSha;
      const actualBlobSha = entry?.sha;
      const verification = verifyFileRevision(expectation, { actualCommitSha, actualBlobSha });
      if (verification.error) {
        setError(filePath, verification.error);
        return false;
      }
      applyLoadedFile(sourceProjectId, sourceCommitSha, filePath, prefetchedContent, {
        ...expectation,
        actualCommitSha,
        actualBlobSha,
        verified: verification.verified,
        source: 'prefetched',
        sizeBytes: entry?.size,
      });
      if (sourceProjectId) {
        await cacheFile(sourceProjectId, filePath, prefetchedContent, {
          commitSha: actualCommitSha,
          blobSha: actualBlobSha,
          sizeBytes: entry?.size,
          isText: true,
        });
      }
      return true;
    }

    if (!options.forceRefresh && Object.hasOwn(fileContentsRef.current, filePath)) {
      const loadedRevision = fileRevisionsRef.current[filePath];
      const verification = loadedRevision
        ? verifyFileRevision(expectation, {
            actualCommitSha: loadedRevision.actualCommitSha,
            actualBlobSha: loadedRevision.actualBlobSha,
          })
        : { verified: false, error: 'The in-memory file revision cannot be verified.' };
      if (!verification.error) return true;
    }

    const fetchKey = [
      sourceProjectId ?? 'none',
      sourceCommitSha ?? 'unversioned',
      filePath,
      expectedBlobSha ?? 'any',
      options.forceRefresh ? 'refresh' : 'load',
    ].join(':');
    const inFlight = inFlightFetchesRef.current.get(fetchKey);
    if (inFlight) {
      return inFlight.promise;
    }

    const controller = new AbortController();
    const loadPromise = (async (): Promise<boolean> => {
      if (!options.forceRefresh && sourceProjectId) {
        try {
          const cached = await getCachedFileRecord(sourceProjectId, filePath);
          if (cached) {
            const verification = verifyFileRevision(expectation, {
              actualCommitSha: cached.commitSha,
              actualBlobSha: cached.blobSha,
            });
            if (!verification.error && cached.isText) {
              applyLoadedFile(sourceProjectId, sourceCommitSha, filePath, cached.content, {
                ...expectation,
                actualCommitSha: cached.commitSha,
                actualBlobSha: cached.blobSha,
                verified: verification.verified,
                source: 'cache',
                sizeBytes: cached.sizeBytes,
              });
              return true;
            }
          }
        } catch {
          // IndexedDB may be unavailable; the pinned network read can continue.
        }
      }

      if (!repoDetails?.sourceGrant) {
        setError(filePath, 'Pinned source access is unavailable for this project.');
        return false;
      }

      if (projectIdRef.current === sourceProjectId) {
        setLoadingFiles((previous) => new Set(previous).add(filePath));
        setError(filePath);
      }

      try {
        const send = (sourceGrant: string) => fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceGrant,
            path: filePath,
            blobSha: expectedBlobSha,
            maxBytes: MAX_VIEWER_FILE_BYTES,
          }),
          signal: controller.signal,
        });
        let response = await send(repoDetails.sourceGrant);
        if (response.status === 401 && refreshSourceGrant) {
          response = await send(await refreshSourceGrant());
        }
        if (!response.ok) throw new Error(await responseErrorMessage(response));

        const result = await response.json() as PinnedFileResponse;
        if (result.path !== undefined && result.path !== filePath) {
          throw new Error('The source response returned a different repository path.');
        }
        if (typeof result.content !== 'string' || result.binary) {
          throw new Error('This file is binary or is not valid UTF-8 text.');
        }

        const verification = verifyFileRevision(expectation, {
          actualCommitSha: result.commitSha,
          actualBlobSha: result.blobSha,
        });
        if (verification.error) throw new Error(verification.error);

        applyLoadedFile(sourceProjectId, sourceCommitSha, filePath, result.content, {
          ...expectation,
          actualCommitSha: result.commitSha,
          actualBlobSha: result.blobSha,
          verified: verification.verified,
          source: 'network',
          sizeBytes: result.size,
        });

        if (sourceProjectId) {
          await cacheFile(sourceProjectId, filePath, result.content, {
            commitSha: result.commitSha,
            blobSha: result.blobSha,
            sizeBytes: result.size,
            isText: true,
          });
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        setError(filePath, error instanceof Error ? error.message : 'The pinned source file could not be loaded.');
        return false;
      } finally {
        if (projectIdRef.current === sourceProjectId) {
          setLoadingFiles((previous) => {
            const next = new Set(previous);
            next.delete(filePath);
            return next;
          });
        }
      }
    })();

    inFlightFetchesRef.current.set(fetchKey, { promise: loadPromise, controller });
    try {
      await loadPromise;
    } finally {
      inFlightFetchesRef.current.delete(fetchKey);
    }
    return loadPromise;
  }, [applyLoadedFile, entryByPath, fileEntries.length, projectId, refreshSourceGrant, repoDetails, setError]);

  const retryFile = useCallback((filePath: string) => {
    const location = fileViewsRef.current[filePath]?.location ?? { path: filePath };
    return openFile(location, undefined, { forceRefresh: true });
  }, [openFile]);

  const refreshFile = retryFile;

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const setFileScrollTop = useCallback((filePath: string, scrollTop: number) => {
    if (!Number.isFinite(scrollTop)) return;
    scrollPositionsRef.current.set(filePath, Math.max(0, scrollTop));
  }, []);

  const closeTab = useCallback((tabId: string) => {
    if (tabId === CANVAS_TAB.id) return;

    setTabs((previous) => {
      const index = previous.findIndex((tab) => tab.id === tabId);
      const next = previous.filter((tab) => tab.id !== tabId);
      if (tabId === activeTabIdRef.current) {
        const fallback = next[Math.max(0, index - 1)] ?? next[index] ?? CANVAS_TAB;
        setActiveTabId(fallback.id);
      }
      return next;
    });
    setFileContents((previous) => {
      const next = { ...previous };
      delete next[tabId];
      fileContentsRef.current = next;
      return next;
    });
    setFileErrors((previous) => {
      const next = { ...previous };
      delete next[tabId];
      fileErrorsRef.current = next;
      return next;
    });
    setFileRevisions((previous) => {
      const next = { ...previous };
      delete next[tabId];
      fileRevisionsRef.current = next;
      return next;
    });
    setFileViews((previous) => {
      const next = { ...previous };
      delete next[tabId];
      fileViewsRef.current = next;
      return next;
    });
    scrollPositionsRef.current.delete(tabId);
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([CANVAS_TAB]);
    setActiveTabId(CANVAS_TAB.id);
    setFileContents({});
    setFileErrors({});
    setFileRevisions({});
    setFileViews({});
    fileContentsRef.current = {};
    fileErrorsRef.current = {};
    fileRevisionsRef.current = {};
    fileViewsRef.current = {};
    scrollPositionsRef.current.clear();
  }, []);

  const isCanvasActive = activeTabId === CANVAS_TAB.id;
  const activeFilePath = isCanvasActive ? undefined : activeTabId;
  const activeFileContent = activeFilePath ? fileContents[activeFilePath] ?? null : null;
  const activeFileError = activeFilePath ? fileErrors[activeFilePath] ?? null : null;
  const activeFileRevision = activeFilePath ? fileRevisions[activeFilePath] : undefined;
  const isActiveFileLoading = activeFilePath ? loadingFiles.has(activeFilePath) : false;
  const activeFileViewState: EditorFileViewState | undefined = activeFilePath
    ? {
        ...(fileViews[activeFilePath] ?? { navigationKey: 0 }),
        scrollTop: scrollPositionsRef.current.get(activeFilePath) ?? 0,
      }
    : undefined;

  return {
    tabs,
    activeTabId,
    isCanvasActive,
    activeFilePath,
    activeFileContent,
    activeFileError,
    activeFileRevision,
    activeFileViewState,
    isActiveFileLoading,
    openFile,
    retryFile,
    refreshFile,
    setFileScrollTop,
    selectTab,
    closeTab,
    closeAllTabs,
  };
}
