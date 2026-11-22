'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import type { BlueprintEditInput } from '@/blueprint';
import type { CanvasApi, CanvasChanges } from '@/components/blueprint/BlueprintCanvas';
import BlueprintInspector from '@/components/blueprint/BlueprintInspector';
import BlueprintPanel from '@/components/blueprint/BlueprintPanel';
import type { CanvasQuestion } from '@/components/blueprint/useBlueprintCanvas';
import { useBlueprintUi } from '@/components/blueprint/useBlueprintUi';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { Toast } from '@/components/ui/Toast';
import { useAppearance } from '@/components/ui/theme';
import { useBlueprint } from '@/hooks/useBlueprint';

import AttentionSheet from './AttentionSheet';
import CanvasOutline from './CanvasOutline';
import { buildCommands } from './commands';
import { describeHealth } from './health';
import HealthPill from './HealthPill';
import IntentBar, { type IntentBarHandle } from './IntentBar';
import { proposalChanges } from './proposal';
import SourcePill from './SourcePill';
import SourceSheet from './SourceSheet';
import StartScreen from './StartScreen';
import { useSourceActions } from './useSourceActions';
import ZoomCluster from './ZoomCluster';

const BlueprintCanvas = dynamic(() => import('@/components/blueprint/BlueprintCanvas'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-canvas" aria-label="Loading the canvas" aria-busy="true" />,
});

const RECENT_CHANGE_MS = 12_000;

const WIDE_QUERY = '(min-width: 1024px)';
const isWide = () => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE_QUERY).matches;
function subscribeWide(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * The Studio: one live map and one sentence box. Five persistent elements
 * (source pill, health pill, canvas, intent bar, zoom cluster); everything
 * else is one step behind them. This file is wiring only.
 */
export default function Studio() {
  const session = useBlueprint();
  const actions = useSourceActions(session);
  const ui = useBlueprintUi();
  const router = useRouter();
  const { theme, toggleTheme } = useAppearance();
  const [selection, setSelection] = useState<string[]>([]);
  const [question, setQuestion] = useState<CanvasQuestion>('dependencies');
  const [sheet, setSheet] = useState<null | 'source' | 'attention' | 'manual'>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [canvasApi, setCanvasApi] = useState<CanvasApi | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [fadedChangeAt, setFadedChangeAt] = useState<string | null>(null);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const intentRef = useRef<IntentBarHandle>(null);
  const restoredRef = useRef(false);

  const { blueprint, report, workspace, intent, live, systemStatus } = session;
  const proposal = intent.status === 'proposed' ? intent.proposal : null;

  // A reload returns to the sample when that was the last thing open (its draft is restored by the data layer).
  const { last, trySample } = actions;
  useEffect(() => {
    if (restoredRef.current || !last) return;
    restoredRef.current = true;
    if (last.kind === 'sample' && session.status === 'idle') void trySample();
  }, [last, session.status, trySample]);

  const componentIds = useMemo(() => (blueprint?.components ?? []).map((component) => component.id), [blueprint]);
  const liveSelection = useMemo(() => selection.filter((id) => componentIds.includes(id)), [componentIds, selection]);
  const selectedId = liveSelection.at(-1) ?? null;

  const select = useCallback((id: string | null, options?: { additive?: boolean }) => {
    setSelection((current) => {
      if (id === null) return [];
      if (!options?.additive) return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }, []);

  const humanRatio = useMemo(() => workspace?.overview().authorship.ratio ?? null, [workspace]);
  const health = useMemo(
    () => describeHealth({ blueprint, report, status: systemStatus, humanRatio }),
    [blueprint, humanRatio, report, systemStatus],
  );

  // What the last sync changed stays marked on the canvas for a moment.
  const lastChange = live.lastChange;
  useEffect(() => {
    if (!lastChange?.diff.changed) return;
    const at = lastChange.at;
    const timer = setTimeout(() => setFadedChangeAt(at), RECENT_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [lastChange]);

  const changes = useMemo<CanvasChanges | null>(() => {
    if (proposal) return proposalChanges(proposal, blueprint);
    if (lastChange?.diff.changed && fadedChangeAt !== lastChange.at) return { mode: 'recent', key: lastChange.at, graphDiff: lastChange.diff };
    return null;
  }, [blueprint, fadedChangeAt, lastChange, proposal]);

  const proposeEdits = useCallback((edits: BlueprintEditInput[], label: string) => session.proposeEdits(edits, label), [session]);

  const showOnCanvas = useCallback((ids: string[]) => {
    setSelection(ids.slice(0, 1));
    ui.focusComponents(ids);
  }, [ui]);

  const openManual = useCallback((componentId?: string | null) => {
    if (componentId) ui.selectComponent(componentId, { openTab: true });
    setSheet('manual');
  }, [ui]);

  const save = useCallback(() => {
    if (session.canSaveToDisk) void session.saveToDisk();
    else session.download();
  }, [session]);

  const commands = useMemo(() => buildCommands({
    watching: live.watching,
    canUndo: session.canUndo,
    canRedo: session.canRedo,
    canSave: session.canSaveToDisk,
    theme,
    openSettings: () => router.push('/settings'),
    toggleWatch: () => session.setWatching(!live.watching),
    fitView: () => canvasApi?.fit(),
    undo: () => session.undo(),
    redo: () => session.redo(),
    save,
    switchTheme: toggleTheme,
    openAttention: () => setSheet('attention'),
    openSource: () => setSheet('source'),
    toggleOutline: () => setOutlineOpen((open) => !open),
    openManual: () => openManual(null),
  }), [canvasApi, live.watching, openManual, router, save, session, theme, toggleTheme]);

  // ── Keyboard ────────────────────────────────────────────────
  useEffect(() => {
    if (!blueprint) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'k') {
        event.preventDefault();
        setSheet(null);
        intentRef.current?.focus();
        return;
      }
      // A modal sheet owns the keyboard while it is open.
      if (sheet) return;
      if (modifier && event.key === '\\') {
        event.preventDefault();
        setOutlineOpen((open) => !open);
        return;
      }
      if (isEditable(event.target)) return;
      if (event.key === '/' && !modifier) {
        event.preventDefault();
        intentRef.current?.focus();
      } else if (modifier && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        session.undo();
      } else if (modifier && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        session.redo();
      } else if (event.shiftKey && event.code === 'Digit1' && !modifier) {
        event.preventDefault();
        canvasApi?.fit();
      } else if (event.key === 'Escape') {
        // Back out one level at a time: staged proposal, then selection.
        if (intent.status !== 'idle') session.discardProposal();
        else if (outlineOpen) setOutlineOpen(false);
        else if (liveSelection.length) setSelection([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blueprint, canvasApi, intent.status, liveSelection.length, outlineOpen, session, sheet]);

  if (!blueprint) return <StartScreen session={session} actions={actions} />;

  const runtime = selectedId ? systemStatus?.components[selectedId] ?? null : null;
  const error = session.error && session.error !== dismissedError ? session.error : null;
  const loading = session.status === 'loading';
  const selectedName = selectedId ? blueprint.components.find((component) => component.id === selectedId)?.name ?? selectedId : null;

  return (
    <main className="studio relative h-dvh w-screen overflow-hidden bg-canvas text-fg">
      <h1 className="sr-only">{blueprint.system.name}: live system design</h1>

      <BlueprintCanvas
        session={session}
        ui={ui}
        question={question}
        selectedIds={liveSelection}
        onSelect={select}
        changes={changes}
        status={systemStatus}
        onProposeEdits={proposeEdits}
        onRevealPanel={() => setSheet('manual')}
        onReady={setCanvasApi}
        insets={{
          top: 64,
          // Under 1024px the zoom cluster sits above the intent bar instead of beside it.
          bottom: proposal ? 320 : wide ? 88 : 176,
          right: selectedId && !proposal ? 392 : 16,
          left: outlineOpen ? 352 : 16,
        }}
        emptyState={(
          <div className="max-w-md text-center">
            <h2 className="text-title font-semibold text-fg">This blueprint has no components yet</h2>
            <p className="mt-2 text-body text-fg-2">Name the parts of the system and say what each one is for. Rules and checks build on that.</p>
            <Button variant="primary" size="lg" className="mt-4" onClick={() => intentRef.current?.fill('add a component API for src/api/**')}>
              Add the first component
            </Button>
          </div>
        )}
      />

      {/* Top bar: transparent over the canvas */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-3">
        <div className="pointer-events-auto min-w-0"><SourcePill session={session} onOpen={() => setSheet('source')} /></div>
        <div className="pointer-events-auto shrink-0"><HealthPill health={health} onOpen={() => setSheet('attention')} /></div>
      </div>

      {/* Notices: one column, top centre */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-20 mx-auto flex w-[min(34rem,calc(100vw-2rem))] flex-col items-center gap-2">
        {loading && (
          <div className="glass pointer-events-auto rounded-full px-3 py-1.5 text-small shadow-elev-2" role="status">
            <StatusGlyph tone="working" label={`${session.progress?.phase ?? 'Loading'}${session.progress?.total ? ` · ${session.progress.completed ?? 0}/${session.progress.total}` : '…'}`} />
          </div>
        )}
        {error && (
          <Toast tone="bad" toneLabel="Problem" className="pointer-events-auto w-full" onDismiss={() => setDismissedError(error)}>
            {error}
          </Toast>
        )}
        {session.origin === 'derived' && (
          <div role="note" aria-label="Derived draft" className="glass pointer-events-auto flex items-center gap-3 rounded-full py-1 pl-3 pr-1 text-small text-fg-2 shadow-elev-2">
            <span>Draft derived from code — confirm what is true</span>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => session.adoptDraft()}>Adopt</Button>
          </div>
        )}
        {live.behind && !loading && (
          <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-1 pl-3 pr-1 text-small text-fg-2 shadow-elev-2" role="status">
            <span>A newer commit is available</span>
            <Button variant="primary" size="sm" className="rounded-full" icon={<RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void session.syncToLatest()}>
              Sync to latest
            </Button>
          </div>
        )}
        {changes?.mode === 'recent' && lastChange && (
          <div className="glass pointer-events-auto rounded-full px-3 py-1.5 text-small text-fg-2 shadow-elev-2" role="status" data-testid="sync-summary">
            Synced: {lastChange.diff.summary}
          </div>
        )}
      </div>

      {outlineOpen && (
        <CanvasOutline
          session={session}
          selectedId={selectedId}
          onSelect={(id) => { select(id); ui.focusComponents([id]); }}
          onOpenEdge={(from, to) => canvasApi?.openEdge(from, to)}
          onClose={() => setOutlineOpen(false)}
          className="absolute bottom-24 left-4 top-16 z-20 w-80 max-w-[calc(100vw-2rem)]"
        />
      )}

      {selectedId && !proposal && (
        <BlueprintInspector
          key={selectedId}
          componentId={selectedId}
          session={session}
          edgeStatus={(from, to) => workspace?.graphView().edges.find((edge) => edge.from === from && edge.to === to)?.status ?? null}
          onSelectComponent={(id) => { select(id); ui.focusComponents([id]); }}
          onOpenEdge={(from, to) => canvasApi?.openEdge(from, to)}
          onSaveIntent={(text) => session.applyEditsNow(
            [{ op: 'update_component', id: selectedId, set: { intent: text || null } }],
            text ? `Set intent of ${selectedName}` : `Cleared intent of ${selectedName}`,
          )}
          onVerify={(by, note) => session.verify(selectedId, by, note)}
          onOpenManual={() => openManual(selectedId)}
          runtime={runtime}
          runtimeStale={health.stale}
          onClose={() => setSelection([])}
          className="absolute bottom-[7.5rem] right-4 top-16 z-20 w-[360px] max-w-[calc(100vw-2rem)] max-[720px]:inset-x-4 max-[720px]:w-auto"
        />
      )}

      <ZoomCluster
        api={canvasApi}
        question={question}
        onQuestionChange={setQuestion}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        className="absolute bottom-24 right-4 z-10 lg:bottom-4"
      />

      <IntentBar
        ref={intentRef}
        session={session}
        selection={liveSelection}
        onRemoveScope={(id) => setSelection((current) => current.filter((item) => item !== id))}
        commands={commands}
        className="absolute bottom-4 left-1/2 z-30 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 lg:w-[min(640px,calc(100vw-37rem))]"
      />

      <SourceSheet open={sheet === 'source'} onOpenChange={(open) => setSheet(open ? 'source' : null)} session={session} actions={actions} />
      <AttentionSheet
        open={sheet === 'attention'}
        onOpenChange={(open) => setSheet(open ? 'attention' : null)}
        session={session}
        ui={ui}
        health={health}
        onShowOnCanvas={showOnCanvas}
        onPropose={proposeEdits}
      />
      <Sheet open={sheet === 'manual'} onOpenChange={(open) => setSheet(open ? 'manual' : null)} title="Edit blueprint" description="The full forms. Each change is one undo step." width={460}>
        <BlueprintPanel session={session} ui={ui} embedded tabs={['components', 'rules', 'intent']} onShowOnCanvas={showOnCanvas} className="bg-transparent" />
      </Sheet>
    </main>
  );
}
