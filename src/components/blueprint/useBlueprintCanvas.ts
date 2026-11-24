'use client';

import { useMemo } from 'react';
import dagre from 'dagre';
import { MarkerType, type Edge, type Node } from 'reactflow';

import type { Workspace, WorkspaceGraphView } from '@/blueprint';
import { calmEdgeKey, calmGraphView } from '@/blueprint/calm';
import { edgeStyle, type BlueprintEdgeData } from './BlueprintEdge';
import { BLUEPRINT_NODE_HEIGHT, BLUEPRINT_NODE_WIDTH, type BlueprintNodeData, type NodeEmphasis } from './BlueprintNode';
import type { BlueprintSession } from './session';

export type CanvasQuestion = 'dependencies' | 'impact' | 'reach';

export const QUESTIONS: Array<{ id: CanvasQuestion; label: string; question: string }> = [
  { id: 'dependencies', label: 'Dependencies', question: 'What may depend on what?' },
  { id: 'impact', label: 'Impact', question: 'What breaks if this changes?' },
  { id: 'reach', label: 'Reach', question: 'What can agents reach?' },
];

type Position = { x: number; y: number };

export const edgeId = (from: string, to: string) => `${from}->${to}`;

/**
 * Top-to-bottom dagre layout for components that have no saved position, with
 * the lanes dagre reserved for edges that span several ranks.
 */
export function layoutWithRoutes(view: WorkspaceGraphView): { positions: Record<string, Position>; routes: Record<string, Position[]> } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', nodesep: 56, ranksep: 96, marginx: 40, marginy: 40 });
  const ids = new Set(view.components.map((component) => component.id));
  for (const id of ids) graph.setNode(id, { width: BLUEPRINT_NODE_WIDTH, height: BLUEPRINT_NODE_HEIGHT });
  for (const edge of view.edges) {
    if (edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to)) graph.setEdge(edge.from, edge.to);
  }
  dagre.layout(graph);
  const positions: Record<string, Position> = {};
  let fallback = 0;
  for (const id of ids) {
    const node = graph.node(id) as { x?: number; y?: number } | undefined;
    positions[id] = Number.isFinite(node?.x) && Number.isFinite(node?.y)
      ? { x: node!.x! - BLUEPRINT_NODE_WIDTH / 2, y: node!.y! - BLUEPRINT_NODE_HEIGHT / 2 }
      : { x: (fallback % 4) * (BLUEPRINT_NODE_WIDTH + 60), y: Math.floor(fallback++ / 4) * (BLUEPRINT_NODE_HEIGHT + 80) };
  }
  const routes: Record<string, Position[]> = {};
  for (const edge of graph.edges()) {
    const points = (graph.edge(edge) as { points?: Position[] } | undefined)?.points ?? [];
    // The first and last points sit on the node borders; only the bends in between matter.
    const bends = points.slice(1, -1).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (bends.length > 1) routes[edgeId(edge.v, edge.w)] = bends.map((point) => ({ x: point.x, y: point.y }));
  }
  return { positions, routes };
}

/** Top-to-bottom dagre layout for components that have no saved position. */
export function autoLayout(view: WorkspaceGraphView): Record<string, Position> {
  return layoutWithRoutes(view).positions;
}

/** Transitive dependents of a component: id → how many steps away. */
export function impactDepths(workspace: Workspace, view: WorkspaceGraphView, componentId: string): Map<string, number> {
  const depths = new Map<string, number>();
  const files = workspace.componentSummary(componentId)?.files ?? [];
  if (files.length) {
    for (const dependent of workspace.impact(files).dependents) {
      if (dependent.id !== componentId) depths.set(dependent.id, dependent.depth);
    }
  }
  // Declared-only edges and external components have no files to trace: walk the drawn edges too.
  const reverse = new Map<string, string[]>();
  for (const edge of view.edges) reverse.set(edge.to, [...(reverse.get(edge.to) ?? []), edge.from]);
  const queue: Array<{ id: string; depth: number }> = [{ id: componentId, depth: 0 }];
  const seen = new Set([componentId]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependent of reverse.get(current.id) ?? []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      if (!depths.has(dependent)) depths.set(dependent, current.depth + 1);
      queue.push({ id: dependent, depth: current.depth + 1 });
    }
  }
  return depths;
}

/** component id → secret-like environment variables its files read. */
export function secretReads(workspace: Workspace): Map<string, string[]> {
  const secrets = new Map<string, string[]>();
  for (const [id, refs] of workspace.componentGraph.env) {
    const names = [...new Set(refs.filter((ref) => ref.secretLike).map((ref) => ref.name))].sort();
    if (names.length) secrets.set(id, names);
  }
  return secrets;
}

export type CanvasDetail = 'calm' | 'full';

export interface BlueprintCanvasModel {
  /** The graph as drawn (simplified in calm mode). */
  view: WorkspaceGraphView;
  /** What calm mode left out, as one sentence; empty when nothing is hidden. */
  hiddenNote: string;
  nodes: Node<BlueprintNodeData>[];
  edges: Edge<BlueprintEdgeData>[];
  /** Short sentence describing what the active question currently shows. */
  caption: string;
}

export function useBlueprintCanvas({
  session,
  question,
  selectedId,
  spotlightIds,
  dragPositions,
  detail = 'calm',
}: {
  session: Pick<BlueprintSession, 'blueprint' | 'workspace' | 'layout'>;
  question: CanvasQuestion;
  selectedId: string | null;
  spotlightIds: readonly string[];
  dragPositions: Record<string, Position>;
  detail?: CanvasDetail;
}): BlueprintCanvasModel {
  const { blueprint, workspace, layout } = session;

  const fullView = useMemo<WorkspaceGraphView>(() => workspace?.graphView() ?? { components: [], edges: [] }, [workspace]);
  // Calm mode hides what a reader can take for granted (tests, edges into
  // shared components, implied dependencies). Whatever is selected or part of
  // a previewed change always stays visible.
  const spotlightKey = spotlightIds.join('|');
  const calm = useMemo(() => {
    if (detail === 'full') return null;
    const pinned = new Set<string>(spotlightKey ? spotlightKey.split('|') : []);
    if (selectedId) pinned.add(selectedId);
    const keepEdges = new Set(
      fullView.edges.filter((edge) => pinned.has(edge.from) && pinned.has(edge.to)).map((edge) => calmEdgeKey(edge)),
    );
    return calmGraphView(fullView, blueprint, { keepComponents: pinned, keepEdges });
  }, [blueprint, detail, fullView, selectedId, spotlightKey]);
  const view = calm?.view ?? fullView;
  const hiddenIds = calm?.hiddenComponents;
  const fileCounts = useMemo(
    () => new Map((workspace?.overview().components ?? []).map((component) => [component.id, component.fileCount])),
    [workspace],
  );
  // Only recompute the automatic layout when the shape of the graph changes.
  const shapeKey = useMemo(
    () => `${view.components.map((component) => component.id).join('|')}#${view.edges.map((edge) => edgeId(edge.from, edge.to)).join('|')}`,
    [view],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { positions: auto, routes } = useMemo(() => layoutWithRoutes(view), [shapeKey]);

  const impact = useMemo(
    () => (question === 'impact' && selectedId && workspace ? impactDepths(workspace, fullView, selectedId) : null),
    [fullView, question, selectedId, workspace],
  );
  const secrets = useMemo(() => (question === 'reach' && workspace ? secretReads(workspace) : null), [question, workspace]);

  const nodes = useMemo<Node<BlueprintNodeData>[]>(() => {
    // Findings per card never include dependency cycles: those are drawn once, on their edges.
    const judged = new Map(view.components.map((component) => [component.id, component]));
    return (blueprint?.components ?? []).filter((component) => !hiddenIds?.has(component.id)).map((component) => {
      const severity = judged.get(component.id)?.severity;
      let emphasis: NodeEmphasis = 'normal';
      let note: string | undefined;
      if (impact) {
        const depth = impact.get(component.id);
        emphasis = component.id === selectedId ? 'origin' : depth !== undefined ? 'highlight' : 'dim';
        note = component.id === selectedId ? 'changed' : depth !== undefined ? (depth === 1 ? 'depends directly' : `${depth} steps away`) : undefined;
      } else if (secrets) {
        emphasis = secrets.has(component.id) ? 'highlight' : 'dim';
      }
      return {
        id: component.id,
        type: 'blueprint',
        position: dragPositions[component.id] ?? layout[component.id] ?? auto[component.id] ?? { x: 0, y: 0 },
        selected: component.id === selectedId,
        ariaLabel: `${component.name}, ${component.kind} component`,
        data: {
          component,
          fileCount: fileCounts.get(component.id) ?? 0,
          findings: judged.get(component.id)?.findings ?? 0,
          ...(severity ? { findingSeverity: severity } : {}),
          emphasis,
          note,
          secrets: secrets?.get(component.id),
          spotlight: spotlightIds.includes(component.id),
        },
      };
    });
  }, [auto, blueprint, dragPositions, fileCounts, hiddenIds, impact, layout, secrets, selectedId, spotlightIds, view]);

  const edges = useMemo<Edge<BlueprintEdgeData>[]>(() => {
    const names = new Map((blueprint?.components ?? []).map((component) => [component.id, component.name]));
    const shown = view.edges.filter((edge) => names.has(edge.from) && names.has(edge.to) && !hiddenIds?.has(edge.from) && !hiddenIds?.has(edge.to));
    const shownIds = new Set(shown.map((edge) => edgeId(edge.from, edge.to)));
    return shown
      .map((edge) => {
        const inImpact = impact
          ? (edge.to === selectedId || impact.has(edge.to)) && (edge.from === selectedId || impact.has(edge.from))
          : true;
        const dim = impact ? !inImpact : Boolean(secrets);
        // A reserved lane only makes sense while both ends are where the layout put them.
        const placed = (id: string) => !dragPositions[id] && !layout[id];
        const waypoints = placed(edge.from) && placed(edge.to) ? routes[edgeId(edge.from, edge.to)] : undefined;
        return {
          id: edgeId(edge.from, edge.to),
          source: edge.from,
          target: edge.to,
          type: 'blueprint',
          focusable: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(edge).stroke, width: 16, height: 16 },
          zIndex: edge.status === 'forbidden' ? 2 : edge.status === 'undeclared' || edge.cycle ? 1 : 0,
          data: {
            from: edge.from,
            to: edge.to,
            fromName: names.get(edge.from)!,
            toName: names.get(edge.to)!,
            status: edge.status,
            count: edge.count,
            ...(edge.cycle ? { cycle: true } : {}),
            ...(shownIds.has(edgeId(edge.to, edge.from)) ? { reverseDrawn: true } : {}),
            dim,
            ...(waypoints ? { waypoints } : {}),
          },
        };
      });
  }, [blueprint, dragPositions, hiddenIds, impact, layout, routes, secrets, selectedId, view]);

  const caption = useMemo(() => {
    if (question === 'impact') {
      if (!selectedId) return 'Select a component to see everything that depends on it.';
      const count = impact?.size ?? 0;
      return count === 0 ? 'Nothing else depends on this component.' : `${count} ${count === 1 ? 'component depends' : 'components depend'} on this, directly or indirectly.`;
    }
    if (question === 'reach') {
      const count = secrets?.size ?? 0;
      return count === 0 ? 'No component reads a secret-like environment variable.' : `${count} ${count === 1 ? 'component reads' : 'components read'} secret-like environment variables.`;
    }
    const undeclared = fullView.edges.filter((edge) => edge.status === 'undeclared').length;
    const forbidden = fullView.edges.filter((edge) => edge.status === 'forbidden').length;
    const cycles = fullView.cycles?.length ?? 0;
    const loops = cycles ? ` · ${cycles} dependency ${cycles === 1 ? 'cycle' : 'cycles'}` : '';
    return `${fullView.edges.length} dependencies · ${undeclared} undeclared · ${forbidden} forbidden${loops}. Draw an edge to declare or forbid one.`;
  }, [fullView, impact, question, secrets, selectedId]);

  return { view, hiddenNote: calm?.note ?? '', nodes, edges, caption };
}
