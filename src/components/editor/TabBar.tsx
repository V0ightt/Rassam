'use client';

import React, { memo, useCallback } from 'react';
import { MessageSquare, X, XCircle, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CANVAS_TAB, type EditorTab } from '@/lib/editor-tabs';

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

export { CANVAS_TAB, type EditorTab };

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseAll: () => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseAll,
  isChatOpen,
  onToggleChat,
}: TabBarProps) {
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === null) return;

      event.preventDefault();
      onSelectTab(tabs[nextIndex].id);
      requestAnimationFrame(() => document.getElementById(`editor-tab-${nextIndex}`)?.focus());
    },
    [onSelectTab, tabs],
  );

  const hasFileTabs = tabs.some((tab) => tab.id !== CANVAS_TAB.id);

  return (
    <div className="flex shrink-0 select-none items-center border-b border-slate-800 bg-slate-900">
      <div role="tablist" aria-label="Open editors" className="custom-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isCanvas = tab.id === CANVAS_TAB.id;
          const fileName = tab.filePath?.split('/').pop() || tab.label;

          return (
            <div
              key={tab.id}
              className={cn(
                'group flex max-w-[220px] shrink-0 items-center border-r border-slate-800 border-t-2 transition-colors',
                isActive
                  ? 'border-t-cyan-500 bg-slate-950 text-slate-100'
                  : 'border-t-transparent bg-slate-900 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
              )}
              title={tab.filePath || tab.label}
            >
              <button
                id={`editor-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`editor-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5 text-[13px]"
              >
                {isCanvas ? (
                  <Workflow size={13} className="shrink-0 text-cyan-400" />
                ) : (
                  <span aria-hidden="true" className={cn('shrink-0 text-[11px]', fileTabColor(fileName))}>●</span>
                )}
                <span className="truncate">{isCanvas ? 'Canvas' : fileName}</span>
              </button>

              {!isCanvas && (
                <button
                  type="button"
                  aria-label={`Close ${fileName}`}
                  onClick={() => onCloseTab(tab.id)}
                  className={cn(
                    'mr-1 grid min-h-8 min-w-8 shrink-0 place-items-center rounded-lg transition-colors',
                    isActive
                      ? 'opacity-70 hover:bg-slate-800 hover:opacity-100'
                      : 'opacity-60 hover:bg-slate-700 hover:opacity-100 md:opacity-0 md:group-hover:opacity-70 md:group-focus-within:opacity-70',
                  )}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {onToggleChat && (
        <button
          type="button"
          aria-pressed={Boolean(isChatOpen)}
          aria-label={isChatOpen ? 'Hide Rassam' : 'Show Rassam'}
          className={cn(
            'flex min-h-9 shrink-0 items-center gap-1 border-l border-slate-800 px-3 py-1.5 text-[11px] transition-colors',
            isChatOpen
              ? 'bg-slate-800/70 text-cyan-300 hover:bg-slate-700'
              : 'text-slate-400 hover:bg-slate-800 hover:text-cyan-300',
          )}
          onClick={onToggleChat}
        >
          <MessageSquare size={13} />
          <span className="hidden sm:inline">Rassam</span>
        </button>
      )}

      {hasFileTabs && (
        <button
          type="button"
          aria-label="Close all file tabs"
          className="flex min-h-9 shrink-0 items-center gap-1 border-l border-slate-800 px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-300"
          onClick={onCloseAll}
        >
          <XCircle size={13} />
          <span className="hidden sm:inline">Close all</span>
        </button>
      )}
    </div>
  );
}

export default memo(TabBar);
