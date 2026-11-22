'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
  ReactFlowProvider,
  getRectOfNodes,
  getTransformForBounds,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  createWorkspace,
  type ArchitectureDiff,
  type Blueprint,
  type BlueprintDelta,
  type BlueprintEditInput,
  type SystemStatus,
} from '@/blueprint';
import { cx } from '@/components/ui/cx';
import BlueprintEdge, { EDGE_STATUS_STYLE, EdgeActivateContext, type BlueprintEdgeData, type EdgeDiff, type EdgeStatus } from './BlueprintEdge';
import BlueprintNode, { type BlueprintNodeData, type NodeDiff } from './BlueprintNode';
import EdgePrompt, { type EdgePromptTarget } from './EdgePrompt';
import type { BlueprintSession } from './session';
import { QUESTIONS, edgeId, useBlueprintCanvas, type CanvasQuestion } from './useBlueprintCanvas';
import type { BlueprintUi } from './useBlueprintUi';
import type { NavigateToSource } from './ui';

const nodeTypes = { blueprint: BlueprintNode };
const edgeTypes = { blueprint: BlueprintEdge };
const STATUS_ORDER: EdgeStatus[] = ['declared', 'undeclared', 'forbidden', 'missing'];
const PROMPT_WIDTH = 288;
const PROMPT_HEIGHT = 240;
const FAR_ZOOM = 0.55;

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** A set of changes drawn over the graph: a staged proposal, or what the last sync changed. */
export interface CanvasChanges {
  /** "proposal" previews `blueprint` and dims what is untouched; "recent" only marks what changed. */
  mode: 'proposal' | 'recent';
  /** Changes when the camera should move to the changed region. */
  key: string;
  /** The blueprint to draw instead of the working draft (proposal mode). */
  blueprint?: Blueprint;
  graphDiff: ArchitectureDiff | null;
  delta?: BlueprintDelta;
  /** Components the change is about, even when the graph itself does not change. */
  touched?: string[];
}

export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  focus(ids: string[]): void;
  /** Open the ruling prompt for one dependency (keyboard and outline path). */
  openEdge(from: string, to: string): void;
}

export interface BlueprintCanvasProps {
  session: BlueprintSession;
  ui: BlueprintUi;
  question?: CanvasQuestion;
  /** Selected component ids; the last one is the primary selection. */
  selectedIds?: string[];
  onSelect?: (id: string | null, options?: { additive?: boolean }) => void;
  changes?: CanvasChanges | null;
  status?: SystemStatus | null;
  /** Route rulings through a staged proposal instead of applying them directly. */
  onProposeEdits?: (edits: BlueprintEditInput[], label: string) => void;
  /** Open the manual rule editor (from "Open rule" in the ruling prompt). */
  onRevealPanel?: () => void;
  onNavigateToSource?: NavigateToSource;
  onReady?: (api: CanvasApi | null) => void;
  /** Space taken by floating UI on each side, so the camera frames what is actually visible. */
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Rendered in the centre when the blueprint has no components. */
  emptyState?: React.ReactNode;
  className?: string;
}

/** Key to the line patterns. Shown from the zoom cluster. */
export function CanvasLegend() {
  return (
    <ul className="space-y-2" aria-label="Legend">
      {STATUS_ORDER.map((status) => {
        const style = EDGE_STATUS_STYLE[status];
        return (
          <li key={status} className="flex items-center gap-2.5 text-meta text-fg-2">
            <svg width="34" height="8" aria-hidden="true" className="shrink-0">
              <line x1="1" y1="4" x2="33" y2="4" stroke={style.stroke} strokeWidth={style.width + 0.5} strokeDasharray={style.dash} strokeLinecap={status === 'missing' ? 'round' : undefined} style={{ stroke: style.stroke }} />
            </svg>
            <span><span className="font-medium text-fg">{style.label}</span> · {style.description}</span>
          </li>
        );
      })}
      <li className="flex items-center gap-2.5 text-meta text-fg-2">
        <span className="h-2.5 w-[34px] shrink-0 rounded-xs border border-dashed border-line-strong" aria-hidden="true" />
        <span><span className="font-medium text-fg">dashed box</span> · external system</span>
      </li>
    </ul>
  );
}

function samePositions(left: Record<string, Point>, right: Record<string, Point>): boolean {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => right[key] && right[key].x === left[key].x && right[key].y === left[key].y);
}

function CanvasInner({
  session,
  ui,
  question = 'dependencies',
  selectedIds,
  onSelect,
  changes = null,
  status = null,
  onProposeEdits,
  onRevealPanel,
  onNavigateToSource,
  onReady,
  insets,
  emptyState,
  className,
}: BlueprintCanvasProps) {
  const { getNodes, getNode, getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();
  const initialized = useNodesInitialized();
  const far = useStore((state) => state.transform[2] < FAR_ZOOM);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<Point | null>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({});
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [prompt, setPrompt] = useState<{ target: EdgePromptTarget; at: Point } | null>(null);
  const [layoutSeen, setLayoutSeen] = useState(session.layout);
  const [connecting, setConnecting] = useState(false);
  /** Positions of the working draft, so a staged preview does not reshuffle the map. */
  const [settled, setSettled] = useState<Record<string, Point>>({});

  // Saved positions changed (drop committed, undo, reload): they win over the in-flight drag.
  if (layoutSeen !== session.layout) {
    setLayoutSeen(session.layout);
    setDragPositions({});
  }

  const proposal = changes?.mode === 'proposal' && changes.blueprint ? changes : null;
  const { workspace, report } = session;
  const previewWorkspace = useMemo(() => {
    if (!proposal?.blueprint || !workspace) return null;
    try {
      const reach = report?.reach;
      return createWorkspace([], proposal.blueprint, { fileGraph: workspace.fileGraph, ...(reach ? { reach } : {}) });
    } catch {
      return null;
    }
  }, [proposal, report, workspace]);

  const drawn = useMemo(() => {
    if (!proposal?.blueprint || !previewWorkspace) return { blueprint: session.blueprint, workspace: session.workspace, layout: session.layout };
    // Same components and dependencies: the automatic layout is unchanged, so nothing needs pinning.
    const shape = (view: { components: Array<{ id: string }>; edges: Array<{ from: string; to: string }> }) =>
      `${view.components.map((component) => component.id).join('|')}#${view.edges.map((edge) => edgeId(edge.from, edge.to)).join('|')}`;
    const sameShape = Boolean(session.workspace) && shape(session.workspace!.graphView()) === shape(previewWorkspace.graphView());
    return { blueprint: proposal.blueprint, workspace: previewWorkspace, layout: sameShape ? session.layout : { ...settled, ...session.layout } };
  }, [previewWorkspace, proposal, session.blueprint, session.layout, session.workspace, settled]);

  const selection = useMemo(() => {
    const known = new Set((drawn.blueprint?.components ?? []).map((component) => component.id));
    return (selectedIds ?? (ui.selectedComponentId ? [ui.selectedComponentId] : [])).filter((id) => known.has(id));
  }, [drawn.blueprint, selectedIds, ui.selectedComponentId]);
  const selectedId = selection.at(-1) ?? null;
  const spotlightIds = useMemo(() => ui.focus?.ids ?? [], [ui.focus]);
  const model = useBlueprintCanvas({ session: drawn, question, selectedId, spotlightIds, dragPositions });

  const select = useCallback((id: string | null, options?: { additive?: boolean }) => {
    if (onSelect) onSelect(id, options);
    else ui.selectComponent(id, { openTab: true });
  }, [onSelect, ui]);

  // ── Changes drawn over the graph ────────────────────────────
  const decorated = useMemo(() => {
    const graphDiff = changes?.graphDiff ?? null;
    const delta = changes?.delta;
    const nodeDiff = new Map<string, NodeDiff>();
    for (const id of delta?.componentsChanged ?? []) nodeDiff.set(id, 'changed');
    for (const id of [...(graphDiff?.components.added ?? []), ...(delta?.componentsAdded ?? [])]) nodeDiff.set(id, 'added');
    const edgeDiff = new Map<string, { diff: EdgeDiff; previous?: EdgeStatus }>();
    for (const edge of graphDiff?.edges.added ?? []) edgeDiff.set(edgeId(edge.from, edge.to), { diff: 'added' });
    for (const change of graphDiff?.edges.statusChanged ?? []) edgeDiff.set(edgeId(change.from, change.to), { diff: 'changed', previous: change.before });

    const touched = new Set<string>([...(changes?.touched ?? []), ...nodeDiff.keys()]);
    for (const edge of [...(graphDiff?.edges.added ?? []), ...(graphDiff?.edges.removed ?? []), ...(graphDiff?.edges.statusChanged ?? [])]) {
      touched.add(edge.from);
      touched.add(edge.to);
    }
    const dimOthers = Boolean(proposal) && touched.size > 0;

    const nodes: Node<BlueprintNodeData>[] = model.nodes.map((node) => {
      const component = node.data.component;
      const runtime = component.runtime ? status?.components[component.id]?.state ?? (status ? 'unknown' : undefined) : undefined;
      const diff = nodeDiff.get(node.id);
      return {
        ...node,
        ...(sizes[node.id] ?? {}),
        data: {
          ...node.data,
          ...(runtime ? { runtime } : {}),
          ...(diff ? { diff } : {}),
          scoped: selection.includes(node.id),
          emphasis: dimOthers && !touched.has(node.id) && node.data.emphasis === 'normal' ? 'dim' : node.data.emphasis,
        },
      };
    });
    const edges: Edge<BlueprintEdgeData>[] = model.edges.map((edge) => {
      const change = edgeDiff.get(edge.id);
      if (!edge.data) return edge;
      return {
        ...edge,
        ...(change ? { zIndex: 3 } : {}),
        data: {
          ...edge.data,
          ...(change ? { diff: change.diff, previousStatus: change.previous } : {}),
          dim: edge.data.dim || (dimOthers && !change),
        },
      };
    });

    // What the proposal removes stays in place as a ghost until it is applied.
    if (proposal) {
      const drawnIds = new Set(nodes.map((node) => node.id));
      for (const component of session.blueprint?.components ?? []) {
        if (drawnIds.has(component.id) || !(graphDiff?.components.removed.includes(component.id) || delta?.componentsRemoved.includes(component.id))) continue;
        drawnIds.add(component.id);
        nodes.push({
          id: component.id,
          type: 'blueprint',
          position: settled[component.id] ?? session.layout[component.id] ?? { x: 0, y: 0 },
          selectable: false,
          draggable: false,
          connectable: false,
          ariaLabel: `${component.name}, removed by the proposal`,
          data: { component, fileCount: 0, findings: 0, emphasis: 'normal', diff: 'removed' },
        });
      }
      const names = new Map(nodes.map((node) => [node.id, node.data.component.name]));
      for (const edge of graphDiff?.edges.removed ?? []) {
        if (!drawnIds.has(edge.from) || !drawnIds.has(edge.to)) continue;
        edges.push({
          id: `${edgeId(edge.from, edge.to)}:removed`,
          source: edge.from,
          target: edge.to,
          type: 'blueprint',
          focusable: false,
          zIndex: 3,
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--status-bad)', width: 16, height: 16 },
          data: { from: edge.from, to: edge.to, fromName: names.get(edge.from) ?? edge.from, toName: names.get(edge.to) ?? edge.to, status: edge.status, count: edge.count, diff: 'removed' },
        });
      }
    }
    return { nodes, edges, touched: [...touched] };
  }, [changes, model.edges, model.nodes, proposal, selection, session.blueprint, session.layout, settled, sizes, status]);

  // Remember where the working draft sits while nothing is staged.
  useEffect(() => {
    if (proposal) return;
    const positions = Object.fromEntries(model.nodes.map((node) => [node.id, node.position]));
    setSettled((current) => (samePositions(current, positions) ? current : positions));
  }, [model.nodes, proposal]);

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
      : { x: width / 2 - PROMPT_WIDTH / 2, y: 96 };
    setPrompt({
      target: { from, to, status: known?.status ?? 'new', count: known?.count },
      at: {
        x: Math.max(16, Math.min(raw.x, width - PROMPT_WIDTH - 16)),
        y: Math.max(64, Math.min(raw.y, height - PROMPT_HEIGHT - 96)),
      },
    });
  }, [statusOf]);

  const handleNodesChange = useCallback((changesList: NodeChange[]) => {
    for (const change of changesList) {
      if (change.type === 'position' && change.position) {
        const { id, position } = change;
        setDragPositions((current) => ({ ...current, [id]: position }));
      } else if (change.type === 'dimensions' && change.dimensions) {
        const { id, dimensions } = change;
        setSizes((current) => (current[id]?.width === dimensions.width && current[id]?.height === dimensions.height
          ? current
          : { ...current, [id]: dimensions }));
      } else if (change.type === 'select' && change.selected && change.id !== selectedId) {
        // Keyboard selection (Enter on a focused node) arrives here, not through onNodeClick.
        select(change.id);
      }
    }
  }, [select, selectedId]);

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

  const activateEdge = useCallback(
    (edge: { from: string; to: string }, anchor: { clientX: number; clientY: number }) => openPrompt(edge.from, edge.to, anchor),
    [openPrompt],
  );

  // ── Camera ──────────────────────────────────────────────────
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reducedMotion ? 0 : 320;

  const insetTop = insets?.top ?? 0;
  const insetRight = insets?.right ?? 0;
  const insetBottom = insets?.bottom ?? 0;
  const insetLeft = insets?.left ?? 0;

  /** Frame the given components (or everything) inside the part of the canvas no floating UI covers. */
  const fitTo = useCallback((ids: readonly string[] | null, options: { padding?: number; maxZoom?: number } = {}) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const all = getNodes();
    const targets = ids ? all.filter((node) => ids.includes(node.id)) : all;
    if (!rect || !targets.length) return;
    const width = Math.max(200, rect.width - insetLeft - insetRight);
    const height = Math.max(160, rect.height - insetTop - insetBottom);
    const [x, y, zoom] = getTransformForBounds(getRectOfNodes(targets), width, height, 0.1, options.maxZoom ?? 1, options.padding ?? 0.15);
    setViewport({ x: x + insetLeft, y: y + insetTop, zoom }, { duration });
  }, [duration, getNodes, insetBottom, insetLeft, insetRight, insetTop, setViewport]);

  const focusToken = ui.focus?.token;
  useEffect(() => {
    if (!focusToken || !initialized || !spotlightIds.length) return;
    fitTo(spotlightIds, { padding: 0.6, maxZoom: 1.25 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one camera move per focus request
  }, [focusToken, initialized]);

  // First frame, and whenever a different source is drawn: show the whole system.
  const sourceKey = session.source ? JSON.stringify(session.source) : 'none';
  const fittedSource = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || fittedSource.current === sourceKey) return;
    fittedSource.current = sourceKey;
    const frame = requestAnimationFrame(() => fitTo(null));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one camera move per source
  }, [initialized, sourceKey]);

  // Floating UI must not cover the selection: nudge the camera when it would.
  useEffect(() => {
    if (!selectedId || !initialized) return;
    const node = getNode(selectedId);
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!node || !rect) return;
    const viewport = getViewport();
    const margin = 24;
    const left = node.position.x * viewport.zoom + viewport.x;
    const top = node.position.y * viewport.zoom + viewport.y;
    const right = left + (node.width ?? 220) * viewport.zoom;
    const bottom = top + (node.height ?? 92) * viewport.zoom;
    let dx = 0;
    let dy = 0;
    if (right > rect.width - insetRight - margin) dx = rect.width - insetRight - margin - right;
    if (left + dx < insetLeft + margin) dx = insetLeft + margin - left;
    if (bottom > rect.height - insetBottom - margin) dy = rect.height - insetBottom - margin - bottom;
    if (top + dy < insetTop + margin) dy = insetTop + margin - top;
    if (dx || dy) setViewport({ x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom }, { duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the selection and to the space the inspector takes
  }, [selectedId, insetRight, initialized]);

  // One camera move per staged proposal: bring what changes into view.
  const changesKey = proposal ? changes?.key : null;
  const touchedRef = useRef<string[]>([]);
  const viewBeforeProposal = useRef<{ x: number; y: number; zoom: number } | null>(null);
  useEffect(() => { touchedRef.current = decorated.touched; }, [decorated.touched]);
  useEffect(() => {
    if (!initialized) return;
    if (!changesKey) {
      // The proposal was applied or discarded: go back to where the person was looking.
      const before = viewBeforeProposal.current;
      viewBeforeProposal.current = null;
      if (before) setViewport(before, { duration });
      return;
    }
    if (!viewBeforeProposal.current) viewBeforeProposal.current = getViewport();
    // Two frames: the preview graph, then the space the review card takes, must be laid out first.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const ids = touchedRef.current;
        if (ids.length) fitTo(ids, { padding: 0.3 });
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one camera move per staged proposal
  }, [changesKey, initialized, insetBottom]);

  useEffect(() => {
    if (!onReady) return;
    onReady({
      zoomIn: () => zoomIn({ duration: reducedMotion ? 0 : 160 }),
      zoomOut: () => zoomOut({ duration: reducedMotion ? 0 : 160 }),
      fit: () => fitTo(null),
      focus: (ids) => { if (ids.length) fitTo(ids, { padding: 0.6, maxZoom: 1.25 }); },
      openEdge: (from, to) => openPrompt(from, to, null),
    });
    return () => onReady(null);
  }, [fitTo, onReady, openPrompt, reducedMotion, zoomIn, zoomOut]);

  const blueprint = drawn.blueprint;
  if (!blueprint) return null;
  const activeQuestion = QUESTIONS.find((item) => item.id === question)!;

  return (
    <div
      ref={wrapperRef}
      data-canvas-shortcuts="off"
      data-zoom={far ? 'far' : 'near'}
      data-connecting={connecting ? 'true' : 'false'}
      data-preview={proposal ? 'true' : 'false'}
      className={cx('studio-canvas relative h-full w-full overflow-hidden bg-canvas text-fg', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && prompt) {
          event.stopPropagation();
          setPrompt(null);
        }
      }}
      onPointerUpCapture={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }}
    >
      {blueprint.components.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center px-6">
          {emptyState ?? (
            <div className="max-w-md text-center">
              <h2 className="text-title font-semibold text-fg">This blueprint has no components yet</h2>
              <p className="mt-2 text-body text-fg-2">Name the parts of the system and say what each one is for. Rules and checks build on that.</p>
            </div>
          )}
        </div>
      ) : (
        <EdgeActivateContext.Provider value={activateEdge}>
          <ReactFlow
            aria-label="Blueprint canvas"
            nodes={decorated.nodes}
            edges={decorated.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onNodeClick={(event, node) => {
              if (node.data.diff === 'removed') return;
              select(node.id, { additive: event.shiftKey || event.metaKey || event.ctrlKey });
              setPrompt(null);
            }}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onConnectStart={() => setConnecting(true)}
            onConnectEnd={() => setConnecting(false)}
            onEdgeClick={(event, edge) => openPrompt(edge.source, edge.target, event)}
            onPaneClick={() => { setPrompt(null); select(null); ui.clearFocus(); }}
            minZoom={0.1}
            maxZoom={2}
            nodesConnectable={!proposal}
            nodesDraggable={!proposal}
            elementsSelectable
            selectNodesOnDrag={false}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            nodeDragThreshold={2}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 1.75, strokeDasharray: '4 4' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.25} />
          </ReactFlow>
        </EdgeActivateContext.Provider>
      )}

      {question !== 'dependencies' && blueprint.components.length > 0 && (
        <p
          aria-live="polite"
          className="glass pointer-events-none absolute left-1/2 top-16 z-10 max-w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-full px-3 py-1.5 text-center text-small text-fg-2 shadow-elev-2"
        >
          <span className="font-medium text-fg">{activeQuestion.question}</span>{' '}
          {model.caption}
        </p>
      )}

      {prompt && (
        <EdgePrompt
          key={`${edgeId(prompt.target.from, prompt.target.to)}:${prompt.target.status}`}
          target={prompt.target}
          session={session}
          ui={ui}
          onClose={() => setPrompt(null)}
          onPropose={onProposeEdits}
          onRevealPanel={onRevealPanel}
          onNavigateToSource={onNavigateToSource}
          style={{ position: 'absolute', left: prompt.at.x, top: prompt.at.y }}
        />
      )}
    </div>
  );
}

/** The live system design: components and the dependencies between them, judged against the contract. */
export default function BlueprintCanvas(props: BlueprintCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
