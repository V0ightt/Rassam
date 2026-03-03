import { useState, useCallback, useRef, useEffect } from 'react';
import { EditorTab, CANVAS_TAB } from '@/components/editor/TabBar';
import { getCachedFile, cacheFile } from '@/lib/file-store';
import { RepoDetails } from '@/types';

export interface UseEditorTabsParams {
  projectId: string | null;
  repoDetails: RepoDetails | null;
}

export function useEditorTabs({ projectId, repoDetails }: UseEditorTabsParams) {
  const [tabs, setTabs] = useState<EditorTab[]>([CANVAS_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>(CANVAS_TAB.id);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const fileContentsRef = useRef<Record<string, string>>({});
  const inFlightFetchesRef = useRef<Map<string, Promise<void>>>(new Map());

  // Reset tabs when project changes
  useEffect(() => {
    setTabs([CANVAS_TAB]);
    setActiveTabId(CANVAS_TAB.id);
    setFileContents({});
    fileContentsRef.current = {};
    setLoadingFiles(new Set());
    inFlightFetchesRef.current.clear();
  }, [projectId]);

  /** Open a file tab (or switch to it if already open). Also fetches content. */
  const openFile = useCallback(
    async (filePath: string, prefetchedContent?: string) => {
      const tabId = filePath;

      // Add tab if not already open
      setTabs((prev) => {
        if (prev.some((t) => t.id === tabId)) return prev;
        const fileName = filePath.split('/').pop() || filePath;
        return [...prev, { id: tabId, label: fileName, filePath }];
      });

      // Set it as active
      setActiveTabId(tabId);

      if (typeof prefetchedContent === 'string') {
        setFileContents((prev) => {
          if (prev[filePath] === prefetchedContent) return prev;
          const next = { ...prev, [filePath]: prefetchedContent };
          fileContentsRef.current = next;
          return next;
        });

        if (projectId) {
          await cacheFile(projectId, filePath, prefetchedContent);
        }

        return;
      }

      // If content already loaded, done
      if (fileContentsRef.current[filePath]) return;

      // If a fetch is already in progress for this file, reuse it.
      const inFlight = inFlightFetchesRef.current.get(filePath);
      if (inFlight) {
        await inFlight;
        return;
      }

      const loadPromise = (async () => {
        // Try IndexedDB cache first
        if (projectId) {
          try {
            const cached = await getCachedFile(projectId, filePath);
            if (cached !== null) {
              if (projectIdRef.current === projectId) {
                setFileContents((prev) => {
                  if (prev[filePath] === cached) return prev;
                  const next = { ...prev, [filePath]: cached };
                  fileContentsRef.current = next;
                  return next;
                });
              }
              return;
            }
          } catch {
            // fall through to network fetch
          }
        }

        // Fetch from API
        if (repoDetails) {
          setLoadingFiles((prev) => new Set(prev).add(filePath));
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

            if (projectIdRef.current === projectId) {
              setFileContents((prev) => {
                if (prev[filePath] === content) return prev;
                const next = { ...prev, [filePath]: content };
                fileContentsRef.current = next;
                return next;
              });
            }

            // Also cache in IndexedDB for the file explorer
            if (projectId) {
              await cacheFile(projectId, filePath, content);
            }
          } catch (err) {
            console.error(`Failed to fetch file ${filePath}:`, err);
          } finally {
            setLoadingFiles((prev) => {
              const next = new Set(prev);
              next.delete(filePath);
              return next;
            });
          }
        }
      })();

      inFlightFetchesRef.current.set(filePath, loadPromise);
      try {
        await loadPromise;
      } finally {
        inFlightFetchesRef.current.delete(filePath);
      }
    },
    [projectId, repoDetails],
  );

  /** Select a tab by its id */
  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  /** Close a tab. If closing the active tab, switch to the nearest neighbor or canvas. */
  const closeTab = useCallback(
    (tabId: string) => {
      // Don't close the canvas tab
      if (tabId === CANVAS_TAB.id) return;

      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);

        // If closing the active tab, pick a new one
        if (tabId === activeTabId) {
          if (idx > 0 && next[idx - 1]) {
            setActiveTabId(next[idx - 1].id);
          } else if (next[idx]) {
            setActiveTabId(next[idx].id);
          } else {
            setActiveTabId(CANVAS_TAB.id);
          }
        }

        return next;
      });

      // Clean up content from memory (keep in IndexedDB)
      setFileContents((prev) => {
        const next = { ...prev };
        if (tabId in next) delete next[tabId];
        return next;
      });
    },
    [activeTabId],
  );

  /** Close all file tabs, keep only canvas */
  const closeAllTabs = useCallback(() => {
    setTabs([CANVAS_TAB]);
    setActiveTabId(CANVAS_TAB.id);
    setFileContents({});
  }, []);

  const isCanvasActive = activeTabId === CANVAS_TAB.id;

  /** The file path of the currently active file tab (undefined if canvas) */
  const activeFilePath = isCanvasActive ? undefined : activeTabId;
  const activeFileContent = activeFilePath ? fileContents[activeFilePath] ?? null : null;
  const isActiveFileLoading = activeFilePath ? loadingFiles.has(activeFilePath) : false;

  return {
    tabs,
    activeTabId,
    isCanvasActive,
    activeFilePath,
    activeFileContent,
    isActiveFileLoading,
    openFile,
    selectTab,
    closeTab,
    closeAllTabs,
  };
}
