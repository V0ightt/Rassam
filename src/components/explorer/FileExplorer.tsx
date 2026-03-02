'use client';

import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';
import {
  Files,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Download,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileTreeNode, RepoFileEntry } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

// ── File icon helper ──────────────────────────────────────────

const EXT_COLORS: Record<string, string> = {
  ts: 'text-blue-400',
  tsx: 'text-blue-400',
  js: 'text-yellow-400',
  jsx: 'text-yellow-400',
  json: 'text-yellow-300',
  css: 'text-purple-400',
  scss: 'text-pink-400',
  html: 'text-orange-400',
  md: 'text-slate-300',
  mdx: 'text-slate-300',
  py: 'text-green-400',
  rs: 'text-orange-500',
  go: 'text-cyan-400',
  java: 'text-red-400',
  yml: 'text-red-300',
  yaml: 'text-red-300',
  toml: 'text-red-300',
  env: 'text-yellow-500',
  svg: 'text-amber-400',
  png: 'text-emerald-400',
  jpg: 'text-emerald-400',
  gif: 'text-emerald-400',
  lock: 'text-slate-600',
};

function fileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_COLORS[ext] || 'text-slate-400';
}

// ── Build tree from flat path list ────────────────────────────

export function buildFileTree(entries: RepoFileEntry[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', type: 'folder', children: [] };

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children) current.children = [];
      let child = current.children.find((c) => c.name === part);

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
    }
  }

  // Sort: folders first, then alphabetical
  const sortTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .map((n) => ({ ...n, children: n.children ? sortTree(n.children) : undefined }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortTree(root.children || []);
}

// ── TreeItem ──────────────────────────────────────────────────

interface TreeItemProps {
  node: FileTreeNode;
  depth: number;
  cachedPaths: Set<string>;
  fetchingPaths: Set<string>;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  searchQuery: string;
}

const TreeItem = memo(function TreeItem({
  node,
  depth,
  cachedPaths,
  fetchingPaths,
  expandedPaths,
  onToggle,
  onFileClick,
  searchQuery,
}: TreeItemProps) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedPaths.has(node.path);
  const isCached = cachedPaths.has(node.path);
  const isFetching = fetchingPaths.has(node.path);

  // Filter by search query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (isFolder) {
      const hasMatch = node.children?.some(function hasDeep(c: FileTreeNode): boolean {
        if (c.name.toLowerCase().includes(q)) return true;
        return c.children?.some(hasDeep) || false;
      });
      if (!hasMatch && !node.name.toLowerCase().includes(q)) return null;
    } else {
      if (!node.name.toLowerCase().includes(q) && !node.path.toLowerCase().includes(q)) return null;
    }
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 py-[3px] px-1 rounded-[3px] cursor-pointer transition-colors text-[13px] leading-tight group select-none',
          isCached && !isFolder ? 'text-slate-200' : 'text-slate-400',
          'hover:bg-slate-800/70',
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => {
          if (isFolder) {
            onToggle(node.path);
          } else {
            onFileClick(node.path);
          }
        }}
        title={node.path}
      >
        {/* Chevron */}
        {isFolder ? (
          isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-slate-500" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-slate-500" />
          )
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-yellow-400/80" />
          ) : (
            <Folder size={14} className="shrink-0 text-yellow-400/60" />
          )
        ) : (
          <File size={14} className={cn('shrink-0', fileColor(node.name))} />
        )}

        {/* Name */}
        <span className="truncate flex-1">{node.name}</span>

        {/* Status indicators */}
        {!isFolder && isFetching && (
          <Loader2 size={12} className="shrink-0 animate-spin text-cyan-400" />
        )}
        {!isFolder && isCached && !isFetching && (
          <CheckCircle2 size={12} className="shrink-0 text-green-500/70" />
        )}
        {!isFolder && !isCached && !isFetching && (
          <Download
            size={12}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-cyan-400 transition-all"
          />
        )}
      </div>

      {/* Children */}
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              cachedPaths={cachedPaths}
              fetchingPaths={fetchingPaths}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onFileClick={onFileClick}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </>
  );
});

// ── FileExplorer ──────────────────────────────────────────────

interface FileExplorerProps {
  fileEntries: RepoFileEntry[];
  cachedPaths: Set<string>;
  fetchingPaths: Set<string>;
  onFetchFile: (path: string) => void;
  onFetchAll: () => void;
  projectName?: string;
  totalFiles: number;
  isFetchingAll: boolean;
}

function FileExplorer({
  fileEntries,
  cachedPaths,
  fetchingPaths,
  onFetchFile,
  onFetchAll,
  projectName,
  totalFiles,
  isFetchingAll,
}: FileExplorerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const tree = useMemo(() => buildFileTree(fileEntries), [fileEntries]);

  // Auto-expand root level folders on mount
  useEffect(() => {
    const rootFolders = tree.filter((n) => n.type === 'folder').map((n) => n.path);
    setExpandedPaths(new Set(rootFolders));
  }, [tree]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allFolders = new Set<string>();
    function walk(nodes: FileTreeNode[]) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          allFolders.add(n.path);
          n.children && walk(n.children);
        }
      }
    }
    walk(tree);
    setExpandedPaths(allFolders);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const cachedCount = cachedPaths.size;
  const blobCount = fileEntries.filter((e) => e.type === 'blob').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-slate-100 text-sm flex items-center gap-2 truncate">
          <Files size={16} className="text-cyan-400 shrink-0" />
          <span className="truncate">{projectName || 'Explorer'}</span>
        </h2>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setShowSearch((s) => !s)}
            className="p-1 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
            title="Search files"
          >
            <Search size={14} />
          </button>
          <button
            onClick={expandAll}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            title="Expand all"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={collapseAll}
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            title="Collapse all"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-slate-800 overflow-hidden"
          >
            <div className="p-2 flex items-center gap-1">
              <Search size={12} className="text-slate-500 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600"
                placeholder="Filter files..."
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-600 hover:text-slate-300">
                  <X size={12} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      <div className="px-3 py-1.5 border-b border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
        <span>
          {cachedCount}/{blobCount} files cached
        </span>
        <button
          onClick={onFetchAll}
          disabled={isFetchingAll || cachedCount >= blobCount}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
            isFetchingAll || cachedCount >= blobCount
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-cyan-400 hover:bg-cyan-500/10',
          )}
        >
          {isFetchingAll ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          {isFetchingAll ? 'Fetching...' : cachedCount >= blobCount ? 'All cached' : 'Fetch all'}
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {tree.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-8 px-4">
            No files yet.
            <br />
            Create a project from GitHub to explore its files.
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              cachedPaths={cachedPaths}
              fetchingPaths={fetchingPaths}
              expandedPaths={expandedPaths}
              onToggle={toggleExpanded}
              onFileClick={onFetchFile}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(FileExplorer);
