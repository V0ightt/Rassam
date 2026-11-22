'use client';

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  File,
  Files,
  Folder,
  FolderOpen,
  Loader2,
  Search,
  Square,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTreeNode, RepoFileEntry } from '@/types';

const EXT_COLORS: Record<string, string> = {
  ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400', jsx: 'text-yellow-400',
  json: 'text-yellow-300', css: 'text-purple-400', scss: 'text-pink-400', html: 'text-orange-400',
  md: 'text-slate-300', mdx: 'text-slate-300', py: 'text-green-400', rs: 'text-orange-500',
  go: 'text-cyan-400', java: 'text-red-400', yml: 'text-red-300', yaml: 'text-red-300',
  toml: 'text-red-300', env: 'text-yellow-500', svg: 'text-amber-400', lock: 'text-slate-600',
};

function fileColor(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() || '';
  return EXT_COLORS[extension] || 'text-slate-400';
}

export function buildFileTree(entries: RepoFileEntry[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', type: 'folder', children: [] };

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join('/');
      current.children ??= [];
      let child = current.children.find((candidate) => candidate.name === part);
      if (!child) {
        child = {
          name: part,
          path: currentPath,
          type: isLast && entry.type === 'blob' ? 'file' : 'folder',
          children: isLast && entry.type === 'blob' ? undefined : [],
        };
        current.children.push(child);
      }
      current = child;
    });
  }

  const sortTree = (nodes: FileTreeNode[]): FileTreeNode[] => nodes
    .map((node) => ({ ...node, children: node.children ? sortTree(node.children) : undefined }))
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

  return sortTree(root.children || []);
}

interface VisibleRow {
  node: FileTreeNode;
  depth: number;
}

function containsQuery(node: FileTreeNode, query: string): boolean {
  if (!query) return true;
  if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) return true;
  return node.children?.some((child) => containsQuery(child, query)) ?? false;
}

function flattenTree(
  tree: FileTreeNode[],
  expandedPaths: Set<string>,
  query: string,
  depth = 0,
  rows: VisibleRow[] = [],
): VisibleRow[] {
  for (const node of tree) {
    if (!containsQuery(node, query)) continue;
    rows.push({ node, depth });
    if (node.type === 'folder' && node.children && (query || expandedPaths.has(node.path))) {
      flattenTree(node.children, expandedPaths, query, depth + 1, rows);
    }
  }
  return rows;
}

interface FileExplorerProps {
  fileEntries: RepoFileEntry[];
  cachedPaths: Set<string>;
  fetchingPaths: Set<string>;
  onFetchFile: (path: string) => void;
  onFetchAll: () => void;
  onCancelFetchAll?: () => void;
  projectName?: string;
  totalFiles: number;
  isFetchingAll: boolean;
  activeFilePath?: string;
  cacheProgress?: { total: number; completed: number; failed: number; estimatedBytes: number } | null;
  error?: string | null;
}

function FileExplorer({
  fileEntries,
  cachedPaths,
  fetchingPaths,
  onFetchFile,
  onFetchAll,
  onCancelFetchAll,
  projectName,
  totalFiles,
  isFetchingAll,
  activeFilePath,
  cacheProgress,
  error,
}: FileExplorerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildFileTree(fileEntries), [fileEntries]);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const rows = useMemo(
    () => flattenTree(tree, expandedPaths, normalizedQuery),
    [expandedPaths, normalizedQuery, tree],
  );
  // TanStack Virtual intentionally returns imperative methods that the React
  // compiler cannot memoize. Keep this localized to the virtual tree boundary.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allFolders = new Set<string>();
    const visit = (nodes: FileTreeNode[]) => nodes.forEach((node) => {
      if (node.type !== 'folder') return;
      allFolders.add(node.path);
      if (node.children) visit(node.children);
    });
    visit(tree);
    setExpandedPaths(allFolders);
  }, [tree]);

  const focusRow = useCallback((index: number) => {
    if (index < 0 || index >= rows.length) return;
    virtualizer.scrollToIndex(index, { align: 'auto' });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-file-row="${index}"]`)?.focus());
  }, [rows.length, virtualizer]);

  const handleRowKeyDown = useCallback((event: React.KeyboardEvent, index: number, row: VisibleRow) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusRow(index + 1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); focusRow(index - 1); return; }
    if (event.key === 'Home') { event.preventDefault(); focusRow(0); return; }
    if (event.key === 'End') { event.preventDefault(); focusRow(rows.length - 1); return; }
    if (event.key === 'ArrowRight' && row.node.type === 'folder') {
      event.preventDefault();
      if (!expandedPaths.has(row.node.path)) toggleExpanded(row.node.path);
      else focusRow(index + 1);
      return;
    }
    if (event.key === 'ArrowLeft' && row.node.type === 'folder' && expandedPaths.has(row.node.path)) {
      event.preventDefault();
      toggleExpanded(row.node.path);
    }
  }, [expandedPaths, focusRow, rows.length, toggleExpanded]);

  const cachedCount = cachedPaths.size;
  const cachePercent = cacheProgress?.total
    ? Math.round((cacheProgress.completed / cacheProgress.total) * 100)
    : 0;

  return (
    <section aria-label="Repository files" className="flex h-full flex-col bg-slate-900">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 p-3">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-slate-100">
          <Files size={16} className="shrink-0 text-cyan-400" aria-hidden="true" />
          <span className="truncate">{projectName || 'Explorer'}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setShowSearch((value) => !value)} aria-expanded={showSearch} aria-controls="file-search" aria-label="Search files" className="grid min-h-9 min-w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-cyan-300">
            <Search size={14} />
          </button>
          <button type="button" onClick={expandAll} aria-label="Expand all folders" className="grid min-h-9 min-w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <ChevronDown size={14} />
          </button>
          <button type="button" onClick={() => setExpandedPaths(new Set())} aria-label="Collapse all folders" className="grid min-h-9 min-w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {showSearch && (
        <div id="file-search" className="flex items-center gap-2 border-b border-slate-800 p-2">
          <Search size={13} className="shrink-0 text-slate-500" aria-hidden="true" />
          <label htmlFor="file-search-input" className="sr-only">Filter repository files</label>
          <input id="file-search-input" autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500" placeholder="Filter files" />
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear file filter" className="grid min-h-8 min-w-8 place-items-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"><X size={13} /></button>}
        </div>
      )}

      <div className="shrink-0 border-b border-slate-800/70 px-3 py-2 text-[11px] text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <span>{cachedCount.toLocaleString()} of {totalFiles.toLocaleString()} files cached</span>
          {isFetchingAll ? (
            <button type="button" onClick={onCancelFetchAll} className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-red-300 hover:bg-red-500/10">
              <Square size={10} fill="currentColor" aria-hidden="true" /> Stop
            </button>
          ) : (
            <button type="button" onClick={onFetchAll} disabled={cachedCount >= totalFiles || totalFiles === 0} className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:text-slate-600">
              <Download size={12} aria-hidden="true" /> Cache files
            </button>
          )}
        </div>
        {cacheProgress && (
          <p role="status" aria-live="polite" className="mt-1 text-slate-500">
            {cachePercent}% complete, {cacheProgress.failed} failed, up to {(cacheProgress.estimatedBytes / 1024 / 1024).toFixed(1)} MiB
          </p>
        )}
        {error && <p role="alert" className="mt-1 text-amber-300">{error}</p>}
      </div>

      <div ref={scrollRef} role="tree" aria-label="Repository file tree" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs leading-5 text-slate-400">
            {fileEntries.length === 0 ? 'No repository files are available.' : 'No files match this filter.'}
          </div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const isFolder = row.node.type === 'folder';
              const isExpanded = isFolder && (Boolean(normalizedQuery) || expandedPaths.has(row.node.path));
              const isCached = cachedPaths.has(row.node.path);
              const isFetching = fetchingPaths.has(row.node.path);
              const isActive = !isFolder && activeFilePath === row.node.path;

              return (
                <button
                  key={row.node.path}
                  type="button"
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={isFolder ? isExpanded : undefined}
                  aria-selected={isActive}
                  aria-current={isActive ? 'true' : undefined}
                  data-file-row={virtualRow.index}
                  tabIndex={virtualRow.index === 0 || isActive ? 0 : -1}
                  onKeyDown={(event) => handleRowKeyDown(event, virtualRow.index, row)}
                  onClick={() => isFolder ? toggleExpanded(row.node.path) : onFetchFile(row.node.path)}
                  title={row.node.path}
                  className={cn(
                    'absolute left-0 top-0 flex w-full items-center gap-1 rounded-sm pr-2 text-left text-[13px] text-slate-400 hover:bg-slate-800/80 hover:text-slate-100',
                    isActive && 'bg-cyan-500/10 text-cyan-100',
                    isCached && !isFolder && 'text-slate-200',
                  )}
                  style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`, paddingLeft: `${row.depth * 16 + 6}px` }}
                >
                  {isFolder ? (isExpanded ? <ChevronDown size={14} className="shrink-0 text-slate-500" /> : <ChevronRight size={14} className="shrink-0 text-slate-500" />) : <span className="w-[14px] shrink-0" />}
                  {isFolder ? (isExpanded ? <FolderOpen size={14} className="shrink-0 text-amber-300/80" /> : <Folder size={14} className="shrink-0 text-amber-300/60" />) : <File size={14} className={cn('shrink-0', fileColor(row.node.name))} />}
                  <span className="min-w-0 flex-1 truncate">{row.node.name}</span>
                  {!isFolder && isFetching && <Loader2 size={12} className="shrink-0 animate-spin text-cyan-300" aria-label="Fetching" />}
                  {!isFolder && isCached && !isFetching && <CheckCircle2 size={12} className="shrink-0 text-cyan-400/80" aria-label="Cached" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(FileExplorer);
