'use client';

import React, { memo, useCallback } from 'react';
import { X, XCircle, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── File icon color helper ────────────────────────────────────

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

function fileTabColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_COLORS[ext] || 'text-slate-400';
}

// ── Types ─────────────────────────────────────────────────────

export interface EditorTab {
  /** Unique id: 'canvas' for the canvas tab, or the file path */
  id: string;
  /** Display label (filename or "Canvas") */
  label: string;
  /** Full file path (undefined for canvas tab) */
  filePath?: string;
}

export const CANVAS_TAB: EditorTab = {
  id: '__canvas__',
  label: 'Canvas',
};

// ── TabBar Component ──────────────────────────────────────────

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseAll: () => void;
}

function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onCloseAll }: TabBarProps) {
  const handleClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab],
  );

  // Track whether there are file tabs open (beyond the canvas default)
  const hasFileTabs = tabs.some((t) => t.id !== CANVAS_TAB.id);

  return (
    <div className="flex items-center bg-slate-900 border-b border-slate-800 shrink-0 select-none">
      {/* Tabs scroll container */}
      <div className="flex-1 flex items-center overflow-x-auto custom-scrollbar min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isCanvas = tab.id === CANVAS_TAB.id;
          const fileName = tab.filePath?.split('/').pop() || tab.label;

          return (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-[13px] border-r border-slate-800 shrink-0 transition-colors max-w-[200px]',
                isActive
                  ? 'bg-slate-950 text-slate-100 border-t-2 border-t-cyan-500'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800/70 hover:text-slate-300 border-t-2 border-t-transparent',
              )}
              onClick={() => onSelectTab(tab.id)}
              title={tab.filePath || tab.label}
            >
              {/* Tab icon */}
              {isCanvas ? (
                <Workflow size={13} className="shrink-0 text-cyan-400" />
              ) : (
                <span className={cn('shrink-0 text-[11px]', fileTabColor(fileName))}>●</span>
              )}

              {/* Tab label */}
              <span className="truncate">{isCanvas ? 'Canvas' : fileName}</span>

              {/* Close button (not on canvas tab) */}
              {!isCanvas && (
                <button
                  className={cn(
                    'shrink-0 p-0.5 rounded transition-colors',
                    isActive
                      ? 'opacity-70 hover:opacity-100 hover:bg-slate-800'
                      : 'opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-slate-700',
                  )}
                  onClick={(e) => handleClose(e, tab.id)}
                  title="Close"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Close all button */}
      {hasFileTabs && (
        <button
          className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors shrink-0 border-l border-slate-800"
          onClick={onCloseAll}
          title="Close all file tabs"
        >
          <XCircle size={13} />
          <span className="hidden sm:inline">Close All</span>
        </button>
      )}
    </div>
  );
}

export default memo(TabBar);
