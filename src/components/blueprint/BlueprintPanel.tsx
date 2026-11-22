'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ClipboardCopy,
  Download,
  FolderOpen,
  Github,
  Redo2,
  RefreshCw,
  Save,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import AttentionTab from './AttentionTab';
import ComponentsTab from './ComponentsTab';
import IntentTab from './IntentTab';
import ReachTab from './ReachTab';
import RulesTab from './RulesTab';
import type { BlueprintSession } from './session';
import type { BlueprintTab, BlueprintUi } from './useBlueprintUi';
import { IssueList, iconButtonClass, primaryButtonClass, secondaryButtonClass, type NavigateToSource } from './ui';

export interface BlueprintGithubProject {
  owner: string;
  repo: string;
  commitSha: string;
  sourceGrant?: string;
  /** Mint a fresh source grant for the pinned commit. */
  refreshSourceGrant?: () => Promise<string | null | undefined>;
}

export interface BlueprintPanelProps {
  session: BlueprintSession;
  ui: BlueprintUi;
  /** The GitHub project open in the Studio, if any. */
  githubProject?: BlueprintGithubProject | null;
  onNavigateToSource?: NavigateToSource;
  onShowOnCanvas?: (componentIds: string[]) => void;
  onClose?: () => void;
  /** Inside a sheet that already has a title: no header, no source actions, no derived banner. */
  embedded?: boolean;
  /** Sections to offer, in order. Defaults to all five. */
  tabs?: BlueprintTab[];
  className?: string;
}

const TABS: Array<{ id: BlueprintTab; label: string }> = [
  { id: 'attention', label: 'Attention' },
  { id: 'components', label: 'Components' },
  { id: 'rules', label: 'Rules' },
  { id: 'intent', label: 'Intent' },
  { id: 'reach', label: 'Reach' },
];

function sourceLabel(session: BlueprintSession): string | null {
  const { source } = session;
  if (!source) return null;
  return source.kind === 'github'
    ? `${source.owner}/${source.repo}@${source.commitSha.slice(0, 7)}`
    : source.name;
}

export default function BlueprintPanel({
  session,
  ui,
  githubProject,
  onNavigateToSource,
  onShowOnCanvas,
  onClose,
  embedded = false,
  tabs,
  className,
}: BlueprintPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const tabRefs = useRef<Partial<Record<BlueprintTab, HTMLButtonElement | null>>>({});
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const run = useCallback(async (name: string, action: () => Promise<unknown> | void) => {
    setActionError(null);
    setBusy(name);
    try {
      await action();
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setActionError(error instanceof Error ? error.message : `${name} failed.`);
      }
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const loadFromGitHub = () => run('Load blueprint', async () => {
    if (!githubProject) return;
    let grant: string | null | undefined;
    try {
      grant = await githubProject.refreshSourceGrant?.();
    } catch {
      grant = null;
    }
    grant = grant || githubProject.sourceGrant;
    if (!grant) throw new Error('Could not get read access to this repository revision. Refresh the analysis and try again.');
    await session.loadFromGitHub({
      owner: githubProject.owner,
      repo: githubProject.repo,
      commitSha: githubProject.commitSha,
      sourceGrant: grant,
    });
  });

  const shownTabs = tabs ? TABS.filter((tab) => tabs.includes(tab.id)) : TABS;
  const activeTab: BlueprintTab = shownTabs.some((tab) => tab.id === ui.tab) ? ui.tab : shownTabs[0]?.id ?? 'attention';

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? shownTabs.length - 1 : offset ? (index + offset + shownTabs.length) % shownTabs.length : null;
    if (next === null) return;
    event.preventDefault();
    ui.setTab(shownTabs[next].id);
    tabRefs.current[shownTabs[next].id]?.focus();
  };

  const { blueprint, report } = session;
  const badge = sourceLabel(session);
  const loaded = Boolean(blueprint);
  const mismatch = Boolean(
    loaded && githubProject && session.source?.kind === 'github'
    && (session.source.owner !== githubProject.owner || session.source.repo !== githubProject.repo || session.source.commitSha !== githubProject.commitSha),
  );
  const attentionCount = report ? report.summary.errors + report.summary.warnings : 0;
  const githubName = githubProject ? `${githubProject.owner}/${githubProject.repo}@${githubProject.commitSha.slice(0, 7)}` : null;

  const loadButton = githubProject && (
    <button type="button" className={primaryButtonClass} disabled={busy !== null || session.status === 'loading'} onClick={() => void loadFromGitHub()}>
      <Github size={13} aria-hidden="true" /> Load blueprint
    </button>
  );

  return (
    <aside
      aria-label="Blueprint"
      data-canvas-shortcuts="off"
      // Controls inherit their font (global reset), so the base size is set here rather than on each button.
      className={cn('flex h-full min-w-0 flex-col bg-slate-900 text-xs text-slate-100', className)}
    >
      {!embedded && <header className="shrink-0 border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="shrink-0 text-cyan-300" aria-hidden="true" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-50">
            {blueprint?.system.name ?? 'Blueprint'}
          </h2>
          {session.dirty && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-200" title="Unsaved changes">
              <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
              <span>Unsaved</span>
            </span>
          )}
          {onClose && (
            <button type="button" className={iconButtonClass} aria-label="Close Blueprint panel" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {badge && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            {session.source?.kind === 'github' ? <Github size={11} aria-hidden="true" /> : <FolderOpen size={11} aria-hidden="true" />}
            <span data-testid="blueprint-source" className="truncate font-mono">{badge}</span>
          </p>
        )}

        {loaded && (
          <div className="mt-2 flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Blueprint actions">
            {session.canSaveToDisk && (
              <button type="button" className={iconButtonClass} title="Save to .rassam/blueprint.json" aria-label="Save to disk" disabled={!session.dirty || busy !== null} onClick={() => void run('Save', () => session.saveToDisk())}>
                <Save size={14} aria-hidden="true" />
              </button>
            )}
            <button type="button" className={iconButtonClass} title="Download blueprint.json" aria-label="Download blueprint" onClick={() => void run('Download', () => session.download())}>
              <Download size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              title="Copy blueprint JSON"
              aria-label={copied ? 'Copied blueprint JSON' : 'Copy blueprint JSON'}
              onClick={() => void run('Copy', () => session.copyToClipboard()).then((ok) => {
                if (!ok) return;
                setCopied(true);
                if (copiedTimer.current) clearTimeout(copiedTimer.current);
                copiedTimer.current = setTimeout(() => setCopied(false), 1500);
              })}
            >
              <ClipboardCopy size={14} className={copied ? 'text-emerald-300' : undefined} aria-hidden="true" />
            </button>
            <span className="mx-1 h-4 w-px bg-slate-700" aria-hidden="true" />
            <button type="button" className={iconButtonClass} title="Undo" aria-label="Undo blueprint change" disabled={!session.canUndo} onClick={() => session.undo()}>
              <Undo2 size={14} aria-hidden="true" />
            </button>
            <button type="button" className={iconButtonClass} title="Redo" aria-label="Redo blueprint change" disabled={!session.canRedo} onClick={() => session.redo()}>
              <Redo2 size={14} aria-hidden="true" />
            </button>
            <button type="button" className={iconButtonClass} title="Rescan source files" aria-label="Rescan source files" disabled={busy !== null || session.status === 'loading'} onClick={() => void run('Rescan', () => session.rescan())}>
              <RefreshCw size={14} className={busy === 'Rescan' ? 'animate-spin' : undefined} aria-hidden="true" />
            </button>
            {session.dirty && (
              confirmDiscard ? (
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" className="rounded px-1.5 py-1 text-xs text-red-200 hover:bg-red-500/15" onClick={() => { session.discardChanges(); setConfirmDiscard(false); }}>
                    Discard all changes
                  </button>
                  <button type="button" className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-800" onClick={() => setConfirmDiscard(false)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="ml-auto rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100" onClick={() => setConfirmDiscard(true)}>
                  Discard…
                </button>
              )
            )}
          </div>
        )}
        <span className="sr-only" role="status">{copied ? 'Blueprint JSON copied to the clipboard' : ''}</span>
      </header>}

      {(session.error || actionError) && (
        <div role="alert" className="shrink-0 border-b border-red-500/40 bg-red-500/10 px-3 py-2 text-xs leading-4 text-red-100">
          {actionError ?? session.error}
        </div>
      )}

      {session.status === 'loading' && (
        <div className="shrink-0 border-b border-slate-800 px-3 py-2" role="status" aria-live="polite">
          <p className="text-xs text-slate-300">
            {session.progress?.phase ?? 'Loading'}
            {session.progress?.total ? ` · ${session.progress.completed ?? 0}/${session.progress.total}` : '…'}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn('h-full rounded-full bg-cyan-400', !session.progress?.total && 'w-1/3 animate-pulse')}
              style={session.progress?.total
                ? { width: `${Math.min(100, Math.round(((session.progress.completed ?? 0) / session.progress.total) * 100))}%` }
                : undefined}
            />
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="flex-1 overflow-y-auto p-3">
          {session.status !== 'loading' && (
            <div className="space-y-3">
              <p className="text-xs leading-5 text-slate-300">
                A blueprint is the architecture contract your coding agents must obey. It lives in your repository at{' '}
                <code className="font-mono text-slate-100">.rassam/blueprint.json</code>.
              </p>
              {githubProject && (
                <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5">
                  <p className="text-xs leading-4 text-slate-300">
                    Read the contract from <span className="font-mono text-slate-100">{githubName}</span>, or derive a first draft from its code.
                  </p>
                  {loadButton}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={githubProject ? secondaryButtonClass : primaryButtonClass} disabled={busy !== null} onClick={() => void run('Open folder', () => session.openLocalFolder())}>
                  <FolderOpen size={13} aria-hidden="true" /> Open local folder
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => session.startEmpty(githubProject?.repo ?? 'Untitled system')}>
                  Start empty
                </button>
              </div>
              <p className="text-xs leading-4 text-slate-500">Opening a folder needs a Chromium browser. Files stay on your machine.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {session.origin === 'derived' && !embedded && (
            <div role="note" aria-label="Derived draft" className="shrink-0 space-y-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-xs leading-4 text-amber-100">This is a draft derived from code. It becomes a contract when you confirm it.</p>
              <button type="button" className="inline-flex min-h-8 items-center rounded-md border border-amber-400/60 bg-amber-400/15 px-3 text-xs font-semibold text-amber-50 hover:bg-amber-400/25" onClick={() => session.adoptDraft()}>
                Adopt draft
              </button>
            </div>
          )}

          {mismatch && !embedded && (
            <div role="note" className="shrink-0 space-y-2 border-b border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-xs leading-4 text-slate-300">The open project is <span className="font-mono text-slate-100">{githubName}</span>. This blueprint belongs to a different revision.</p>
              {loadButton}
            </div>
          )}

          {session.issues.length > 0 && !embedded && (
            <div className="shrink-0 border-b border-slate-800 p-2">
              <IssueList issues={session.issues} title={`${session.issues.length} blueprint ${session.issues.length === 1 ? 'issue' : 'issues'}`} />
            </div>
          )}

          <div role="tablist" aria-label="Blueprint sections" className="flex shrink-0 overflow-x-auto border-b border-slate-800 bg-slate-950" style={{ scrollbarWidth: 'none' }}>
            {shownTabs.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(element) => { tabRefs.current[tab.id] = element; }}
                  type="button"
                  role="tab"
                  id={`blueprint-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls="blueprint-tabpanel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => ui.setTab(tab.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={cn(
                    'flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1 border-b-2 px-2 text-xs',
                    selected ? 'border-cyan-400 text-cyan-200' : 'border-transparent text-slate-400 hover:text-slate-200',
                  )}
                >
                  {tab.label}
                  {tab.id === 'attention' && attentionCount > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-200" aria-label={`${attentionCount} errors and warnings`}>{attentionCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div id="blueprint-tabpanel" role="tabpanel" aria-labelledby={`blueprint-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === 'attention' && <AttentionTab session={session} ui={ui} onNavigateToSource={onNavigateToSource} onShowOnCanvas={onShowOnCanvas} />}
            {activeTab === 'components' && <ComponentsTab session={session} ui={ui} />}
            {activeTab === 'rules' && <RulesTab session={session} ui={ui} />}
            {activeTab === 'intent' && <IntentTab session={session} />}
            {activeTab === 'reach' && <ReachTab session={session} onNavigateToSource={onNavigateToSource} />}
          </div>
        </>
      )}
    </aside>
  );
}
