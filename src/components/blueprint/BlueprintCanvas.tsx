'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FolderOpen, Maximize2, PanelLeftOpen, Plus, ZoomIn, ZoomOut } from 'lucide-react';

import { cn } from '@/lib/utils';
import BlueprintEdge, { EDGE_STATUS_STYLE, EdgeActivateContext, type BlueprintEdgeData, type EdgeStatus } from './BlueprintEdge';
import BlueprintInspector from './BlueprintInspector';
import BlueprintNode, { type BlueprintNodeData } from './BlueprintNode';
import EdgePrompt, { type EdgePromptTarget } from './EdgePrompt';
import type { BlueprintSession } from './session';
import { QUESTIONS, edgeId, useBlueprintCanvas, type CanvasQuestion } from './useBlueprintCanvas';
import type { BlueprintUi } from './useBlueprintUi';
import { primaryButtonClass, secondaryButtonClass, type NavigateToSource } from './ui';

const nodeTypes = { blueprint: BlueprintNode };
const edgeTypes = { blueprint: BlueprintEdge };
const STATUS_ORDER: EdgeStatus[] = ['declared', 'undeclared', 'forbidden', 'missing'];
const PROMPT_WIDTH = 288;
const PROMPT_HEIGHT = 240;

export interface BlueprintCanvasProps {
  session: BlueprintSession;
  ui: BlueprintUi;
  /** Open the Blueprint side panel (used when an action continues there). */
  onRevealPanel?: () => void;
  onNavigateToSource?: NavigateToSource;
  className?: string;
}

type Point = { x: number; y: number };
type Size = { width: number; height: number };

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function Legend() {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-2 shadow-lg backdrop-blur" role="group" aria-label="Legend">
      <ul className="space-y-1">
        {STATUS_ORDER.map((status) => {
          const style = EDGE_STATUS_STYLE[status];
          return (
            <li key={status} className="flex items-center gap-2 text-[10px] text-slate-300">
              <svg width="34" height="8" aria-hidden="true" className="shrink-0">
                <line x1="1" y1="4" x2="33" y2="4" stroke={style.stroke} strokeWidth={style.width + 0.5} strokeDasharray={style.dash} strokeLinecap={status === 'missing' ? 'round' : undefined} />
              </svg>
              <span><span className="font-medium text-slate-100">{style.label}</span> · {style.description}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 text-[10px] text-slate-300">
          <span className="h-2.5 w-[34px] shrink-0 rounded-sm border border-dashed border-slate-400" aria-hidden="true" />
          <span><span className="font-medium text-slate-100">dashed box</span> · external system</span>
        </li>
      </ul>
    </div>
  );
}

function CanvasInner({ session, ui, onRevealPanel, onNavigateToSource, className }: BlueprintCanvasProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const initialized = useNodesInitialized();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<Point | null>(null);
  const [question, setQuestion] = useState<CanvasQuestion>('dependencies');
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({});
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [prompt, setPrompt] = useState<{ target: EdgePromptTarget; at: Point } | null>(null);
  const [layoutSeen, setLayoutSeen] = useState(session.layout);

  // Saved positions changed (drop committed, undo, reload): they win over the in-flight drag.
  if (layoutSeen !== session.layout) {
    setLayoutSeen(session.layout);
    setDragPositions({});
  }

  const selectedId = session.blueprint?.components.some((component) => component.id === ui.selectedComponentId)
    ? ui.selectedComponentId
    : null;
  const spotlightIds = useMemo(() => ui.focus?.ids ?? [], [ui.focus]);
  const model = useBlueprintCanvas({ session, question, selectedId, spotlightIds, dragPositions });

  const nodes = useMemo<Node<BlueprintNodeData>[]>(
    () => model.nodes.map((node) => (sizes[node.id] ? { ...node, ...sizes[node.id] } : node)),
    [model.nodes, sizes],
  );

  const statusOf = useCallback((from: string, to: string) => {
    const edge = model.view.edges.find((candidate) => candidate.from === from && candidate.to === to);
    return edge ? { status: edge.status, count: edge.count } : null;
  }, [model.view]);

  const openPrompt = useCallback((from: string, to: string, anchor?: { clientX: number; clientY: number } | null) => {
    if (from === to) return;
    const known = statusOf(from, to);
    const rect = wrapperRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 800;
    const height = rect?.height ?? 600;
    const raw = anchor && rect
      ? { x: anchor.clientX - rect.left - PROMPT_WIDTH / 2, y: anchor.clientY - rect.top + 10 }
      : { x: width / 2 - PROMPT_WIDTH / 2, y: 72 };
    setPrompt({
      target: { from, to, status: known?.status ?? 'new', count: known?.count },
      at: {
        x: Math.max(8, Math.min(raw.x, width - PROMPT_WIDTH - 8)),
        y: Math.max(8, Math.min(raw.y, height - PROMPT_HEIGHT - 8)),
      },
    });
  }, [statusOf]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const { id, position } = change;
        setDragPositions((current) => ({ ...current, [id]: position }));
      } else if (change.type === 'dimensions' && change.dimensions) {
        const { id, dimensions } = change;
        setSizes((current) => (current[id]?.width === dimensions.width && current[id]?.height === dimensions.height
          ? current
          : { ...current, [id]: dimensions }));
      } else if (change.type === 'select' && change.selected) {
        // Keyboard selection (Enter on a focused node) arrives here, not through onNodeClick.
        ui.selectComponent(change.id, { openTab: true });
      }
    }
  }, [ui]);

  const handleNodeDragStop = useCallback((_: unknown, node: Node, dragged: Node[]) => {
    for (const item of dragged.length ? dragged : [node]) {
      session.setPosition(item.id, { x: Math.round(item.position.x), y: Math.round(item.position.y) });
    }
  }, [session]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const pointer = lastPointer.current;
    openPrompt(connection.source, connection.target, pointer ? { clientX: pointer.x, clientY: pointer.y } : null);
  }, [openPrompt]);

  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge<BlueprintEdgeData>) => {
    openPrompt(edge.source, edge.target, event);
  }, [openPrompt]);

  const activateEdge = useCallback(
    (edge: { from: string; to: string }, anchor: { clientX: number; clientY: number }) => openPrompt(edge.from, edge.to, anchor),
    [openPrompt],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (prompt) setPrompt(null);
      else if (selectedId) ui.selectComponent(null);
      return;
    }
    if (isEditable(event.target) || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey && session.canUndo) {
      event.preventDefault();
      session.undo();
    } else if ((key === 'y' || (key === 'z' && event.shiftKey)) && session.canRedo) {
      event.preventDefault();
      session.redo();
    }
  };

  const focusToken = ui.focus?.token;
  useEffect(() => {
    if (!focusToken || !initialized || !spotlightIds.length) return;
    fitView({ nodes: spotlightIds.map((id) => ({ id })), padding: 0.6, duration: 300, maxZoom: 1.25 });
  }, [fitView, focusToken, initialized, spotlightIds]);

  const onQuestionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = QUESTIONS[(index + offset + QUESTIONS.length) % QUESTIONS.length];
    setQuestion(next.id);
    wrapperRef.current?.querySelector<HTMLElement>(`[data-question="${next.id}"]`)?.focus();
  };

  const blueprint = session.blueprint;
  const activeQuestion = QUESTIONS.find((item) => item.id === question)!;

  let body;
  if (!blueprint) {
    body = (
      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="max-w-md text-center">
          {session.status === 'loading' ? (
            <p role="status" className="text-sm text-slate-300">{session.progress?.phase ?? 'Loading blueprint'}…</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-50">No blueprint is open</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Open a folder that contains your code, or load the blueprint of the open GitHub project from the Blueprint panel.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className={primaryButtonClass} onClick={() => { onRevealPanel?.(); void session.openLocalFolder().catch(() => undefined); }}>
                  <FolderOpen size={14} aria-hidden="true" /> Open local folder
                </button>
                {onRevealPanel && (
                  <button type="button" className={secondaryButtonClass} onClick={onRevealPanel}>
                    <PanelLeftOpen size={14} aria-hidden="true" /> Open Blueprint panel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  } else if (blueprint.components.length === 0) {
    body = (
      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-slate-50">This blueprint has no components yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Name the parts of the system and say what each one is for. Rules and checks build on that.</p>
          <button type="button" className={cn(primaryButtonClass, 'mt-4')} onClick={() => { ui.setTab('components'); onRevealPanel?.(); }}>
            <Plus size={14} aria-hidden="true" /> Add the first component
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <div className="absolute left-3 top-3 z-10 max-w-[min(36rem,calc(100%-14rem))] space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Question this view answers" className="flex rounded-lg border border-slate-700 bg-slate-900/95 p-0.5 shadow-lg">
              {QUESTIONS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  data-question={item.id}
                  aria-checked={question === item.id}
                  tabIndex={question === item.id ? 0 : -1}
                  title={item.question}
                  onClick={() => setQuestion(item.id)}
                  onKeyDown={(event) => onQuestionKeyDown(event, index)}
                  className={cn(
                    'min-h-7 rounded-md px-2.5 text-[11px] font-medium',
                    question === item.id ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-slate-100',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-700 bg-slate-900/95 p-0.5 shadow-lg" role="group" aria-label="Zoom">
              <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Zoom out" onClick={() => zoomOut()}><ZoomOut size={13} aria-hidden="true" /></button>
              <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Zoom in" onClick={() => zoomIn()}><ZoomIn size={13} aria-hidden="true" /></button>
              <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Fit blueprint to view" onClick={() => fitView({ padding: 0.2, duration: 250, maxZoom: 1 })}><Maximize2 size={13} aria-hidden="true" /></button>
            </div>
          </div>
          <p className="rounded-md bg-slate-950/80 px-2 py-1 text-[11px] leading-4 text-slate-300" aria-live="polite">
            <span className="font-semibold text-slate-100">{activeQuestion.question}</span>{' '}
            {model.caption}
          </p>
        </div>

        <EdgeActivateContext.Provider value={activateEdge}>
          <ReactFlow
            aria-label="Blueprint canvas"
            nodes={nodes}
            edges={model.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={(_, node) => { ui.selectComponent(node.id, { openTab: true }); setPrompt(null); }}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onEdgeClick={handleEdgeClick}
            onPaneClick={() => { setPrompt(null); ui.selectComponent(null); ui.clearFocus(); }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
            nodesConnectable
            elementsSelectable
            selectNodesOnDrag={false}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            nodeDragThreshold={2}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: '#22d3ee', strokeWidth: 2, strokeDasharray: '4 4' }}
            className="bg-slate-950"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
          </ReactFlow>
        </EdgeActivateContext.Provider>

        <div className="absolute bottom-3 left-3 z-10"><Legend /></div>

        {selectedId && (
          <BlueprintInspector
            componentId={selectedId}
            session={session}
            edgeStatus={(from, to) => statusOf(from, to)?.status ?? null}
            onSelectComponent={(id) => { ui.selectComponent(id, { openTab: true }); ui.focusComponents([id]); }}
            onOpenEdge={(from, to) => openPrompt(from, to, null)}
            onWriteIntent={() => { ui.selectComponent(selectedId, { openTab: true, focusIntent: true }); onRevealPanel?.(); }}
            onClose={() => ui.selectComponent(null)}
            onNavigateToSource={onNavigateToSource}
            className="absolute bottom-3 right-3 top-14 z-10 w-80 max-w-[calc(100%-1.5rem)]"
          />
        )}

        {prompt && (
          <EdgePrompt
            key={`${edgeId(prompt.target.from, prompt.target.to)}:${prompt.target.status}`}
            target={prompt.target}
            session={session}
            ui={ui}
            onClose={() => setPrompt(null)}
            onRevealPanel={onRevealPanel}
            onNavigateToSource={onNavigateToSource}
            style={{ position: 'absolute', left: prompt.at.x, top: prompt.at.y }}
          />
        )}
      </>
    );
  }

  return (
    <div
      ref={wrapperRef}
      data-canvas-shortcuts="off"
      // Controls inherit their font (global reset), so the base size for every overlay is set here.
      className={cn('relative h-full w-full overflow-hidden bg-slate-950 text-xs text-slate-100', className)}
      onKeyDown={handleKeyDown}
      onPointerUpCapture={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}
    >
      {body}
    </div>
  );
}

/** The Blueprint view: components and the dependencies between them, judged against the contract. */
export default function BlueprintCanvas(props: BlueprintCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
