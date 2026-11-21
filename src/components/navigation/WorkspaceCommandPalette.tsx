'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Command,
  FileCode2,
  FilterX,
  GitBranch,
  LocateFixed,
  Network,
  Search,
  Tag,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentType,
} from 'react';

import {
  buildWorkspaceSearchIndex,
  getWorkspaceTransientMatches,
  searchWorkspace,
  type WorkspaceSearchFilter,
  type WorkspaceSearchResult,
  type WorkspaceSearchResultKind,
  type WorkspaceTransientMatches,
} from '@/lib/workspace-search';
import { cn } from '@/lib/utils';
import type { FlowEdge, FlowNode, RepoFileEntry } from '@/types';

const DISPLAY_LIMIT = 120;

const FILTERS: Array<{
  value: WorkspaceSearchFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'node', label: 'Nodes' },
  { value: 'file', label: 'Files' },
  { value: 'relationship', label: 'Relationships' },
  { value: 'category', label: 'Categories' },
];

const RESULT_META: Record<WorkspaceSearchResultKind, {
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}> = {
  node: { label: 'Node', icon: Boxes },
  file: { label: 'File', icon: FileCode2 },
  relationship: { label: 'Relationship', icon: GitBranch },
  category: { label: 'Category', icon: Tag },
};

export interface WorkspaceCommandPaletteProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  files?: RepoFileEntry[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRevealResult: (result: WorkspaceSearchResult) => void;
  onIsolateNeighbors?: (nodeId: string) => void;
  onClearFilters?: () => void;
  onTransientMatchesChange?: (matches: WorkspaceTransientMatches | null) => void;
  activeGraphFilterLabel?: string | null;
  showTrigger?: boolean;
  shortcutEnabled?: boolean;
  className?: string;
}

function resultDetail(result: WorkspaceSearchResult): string {
  if (result.kind === 'node') {
    return `${result.fileCount} ${result.fileCount === 1 ? 'file' : 'files'}`;
  }
  if (result.kind === 'file') {
    const ownerCount = result.ownerNodeIds.length;
    return ownerCount === 0 ? 'Unassigned' : `${ownerCount} ${ownerCount === 1 ? 'owner' : 'owners'}`;
  }
  if (result.kind === 'relationship') return 'Graph edge';
  return result.subtitle;
}

/**
 * Keyboard-first, project-local graph/source search. Consumers receive IDs and
 * navigation intents only; the component never changes canonical graph data.
 */
export default function WorkspaceCommandPalette({
  nodes,
  edges,
  files = [],
  open: controlledOpen,
  onOpenChange,
  onRevealResult,
  onIsolateNeighbors,
  onClearFilters,
  onTransientMatchesChange,
  activeGraphFilterLabel,
  showTrigger = true,
  shortcutEnabled = true,
  className,
}: WorkspaceCommandPaletteProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WorkspaceSearchFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const isOpen = controlledOpen ?? uncontrolledOpen;

  const setOpen = useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlledOpen, onOpenChange]);

  useEffect(() => {
    if (!shortcutEnabled) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isOpen, setOpen, shortcutEnabled]);

  const index = useMemo(
    () => buildWorkspaceSearchIndex({ nodes, edges, files }),
    [edges, files, nodes],
  );
  const response = useMemo(
    () => searchWorkspace(index, query, filter),
    [filter, index, query],
  );
  const visibleResults = response.results.slice(0, DISPLAY_LIMIT);
  const selectedIndex = visibleResults.length === 0
    ? 0
    : Math.min(activeIndex, visibleResults.length - 1);
  const selectedResult = visibleResults[selectedIndex];

  useEffect(() => {
    if (!onTransientMatchesChange) return;
    if (!isOpen || !response.normalizedQuery) {
      onTransientMatchesChange(null);
      return;
    }
    onTransientMatchesChange(getWorkspaceTransientMatches(response.results));
    return () => onTransientMatchesChange(null);
  }, [isOpen, onTransientMatchesChange, response.normalizedQuery, response.results]);

  const reveal = useCallback((result: WorkspaceSearchResult | undefined) => {
    if (!result) return;
    onRevealResult(result);
    setOpen(false);
  }, [onRevealResult, setOpen]);

  const isolate = useCallback((result: WorkspaceSearchResult | undefined) => {
    if (!result || result.kind !== 'node' || !onIsolateNeighbors) return;
    onIsolateNeighbors(result.nodeId);
    setOpen(false);
  }, [onIsolateNeighbors, setOpen]);

  const moveSelection = useCallback((delta: number) => {
    if (visibleResults.length === 0) return;
    setActiveIndex((current) => {
      const safeCurrent = Math.min(current, visibleResults.length - 1);
      return (safeCurrent + delta + visibleResults.length) % visibleResults.length;
    });
  }, [visibleResults.length]);

  const clear = useCallback(() => {
    setQuery('');
    setFilter('all');
    setActiveIndex(0);
    onTransientMatchesChange?.(null);
    onClearFilters?.();
  }, [onClearFilters, onTransientMatchesChange]);

  const activeResultId = selectedResult ? `${listId}-result-${selectedIndex}` : undefined;

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      {showTrigger && (
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={cn(
              'relative inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)]',
              'bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-secondary)] transition-colors',
              'hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] active:translate-y-px',
              className,
            )}
            aria-label="Search workspace and open commands"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Command size={15} aria-hidden />
            <span>Search</span>
            <kbd className="ml-1 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              Ctrl K
            </kbd>
            {activeGraphFilterLabel && (
              <span
                className="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--accent)]"
                aria-label={`Active graph filter: ${activeGraphFilterLabel}`}
              />
            )}
          </button>
        </Dialog.Trigger>
      )}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--layer-dialog)] bg-slate-950/70 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-[calc(var(--layer-dialog)+1)] flex max-h-[76dvh] w-[min(720px,calc(100vw-2rem))]',
            '-translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-strong)]',
            'bg-[var(--surface-base)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]',
          )}
        >
          <Dialog.Title className="sr-only">Search workspace and commands</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search nodes, repository files, relationships, and categories. Use the arrow keys to move and Enter to reveal a result.
          </Dialog.Description>

          <div className="flex min-h-14 items-center gap-3 border-b border-[var(--border-subtle)] px-4">
            <Search size={18} className="shrink-0 text-[var(--accent)]" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveSelection(1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveSelection(-1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  setActiveIndex(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  setActiveIndex(Math.max(visibleResults.length - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  if ((event.ctrlKey || event.metaKey) && selectedResult?.kind === 'node') {
                    isolate(selectedResult);
                  } else {
                    reveal(selectedResult);
                  }
                }
              }}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder="Search nodes, files, relationships, categories…"
              role="combobox"
              aria-label="Search workspace"
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={activeResultId}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setActiveIndex(0);
                }}
                className="icon-button"
                aria-label="Clear search query"
              >
                <X size={16} aria-hidden />
              </button>
            )}
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close search">
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] px-3 py-2" aria-label="Search result types">
            {FILTERS.map((option) => {
              const count = response.counts[option.value];
              const active = response.effectiveFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFilter(option.value);
                    setActiveIndex(0);
                  }}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs transition-colors',
                    active
                      ? 'bg-cyan-400/15 text-cyan-200'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]',
                  )}
                  aria-pressed={active}
                  aria-label={`${option.label}, ${count} ${count === 1 ? 'result' : 'results'}`}
                >
                  {option.label}
                  <span className="font-mono text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
            {(query || filter !== 'all' || activeGraphFilterLabel) && (
              <button
                type="button"
                onClick={clear}
                className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              >
                <FilterX size={14} aria-hidden />
                Clear filters
              </button>
            )}
          </div>

          {activeGraphFilterLabel && (
            <div className="border-b border-[var(--border-subtle)] bg-cyan-400/5 px-4 py-2 text-xs text-cyan-100" role="status">
              Canvas filter: {activeGraphFilterLabel}
            </div>
          )}

          <div
            id={listId}
            role="listbox"
            aria-label="Workspace search results"
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
          >
            {visibleResults.length === 0 ? (
              <div className="grid min-h-40 place-items-center px-6 text-center">
                <div>
                  <Search size={22} className="mx-auto mb-3 text-[var(--text-muted)]" aria-hidden />
                  <p className="text-sm font-medium text-[var(--text-secondary)]">No matching workspace items</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Try a filename, node label, category, or relationship.</p>
                </div>
              </div>
            ) : visibleResults.map((result, resultIndex) => {
              const meta = RESULT_META[result.kind];
              const Icon = meta.icon;
              const active = resultIndex === selectedIndex;
              return (
                <button
                  key={result.id}
                  id={`${listId}-result-${resultIndex}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(resultIndex)}
                  onFocus={() => setActiveIndex(resultIndex)}
                  onClick={() => reveal(result)}
                  className={cn(
                    'grid min-h-14 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-control)] px-2 text-left transition-colors',
                    active
                      ? 'bg-cyan-400/[0.12] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]',
                  )}
                >
                  <span className={cn(
                    'grid size-7 place-items-center rounded border',
                    active
                      ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)]',
                  )}>
                    <Icon size={14} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{result.title}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{result.subtitle}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{meta.label}</span>
                    <span className="block max-w-28 truncate text-[10px] text-[var(--text-muted)]">{resultDetail(result)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
            <span className="mr-auto" role="status" aria-live="polite">
              {response.results.length === 0
                ? 'No results'
                : response.results.length > DISPLAY_LIMIT
                  ? `Showing best ${DISPLAY_LIMIT} of ${response.results.length} results`
                  : `${response.results.length} ${response.results.length === 1 ? 'result' : 'results'}`}
            </span>
            <button
              type="button"
              onClick={() => moveSelection(-1)}
              disabled={visibleResults.length === 0}
              className="icon-button disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous result"
            >
              <ChevronUp size={15} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => moveSelection(1)}
              disabled={visibleResults.length === 0}
              className="icon-button disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next result"
            >
              <ChevronDown size={15} aria-hidden />
            </button>
            {selectedResult?.kind === 'node' && onIsolateNeighbors && (
              <button
                type="button"
                onClick={() => isolate(selectedResult)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                aria-label={`Isolate neighbors of ${selectedResult.title}`}
              >
                <Network size={14} aria-hidden />
                Isolate neighbors
              </button>
            )}
            <button
              type="button"
              onClick={() => reveal(selectedResult)}
              disabled={!selectedResult}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] bg-cyan-500 px-3 font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LocateFixed size={14} aria-hidden />
              Reveal
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
