'use client';

import { createContext, memo, useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import { Minus, Plus, RefreshCw, Sparkles, TriangleAlert, X, type LucideIcon } from 'lucide-react';

import type { WorkspaceGraphView } from '@/blueprint';
import { cx } from '@/components/ui/cx';

export type EdgeStatus = WorkspaceGraphView['edges'][number]['status'];
/** How a staged proposal (or the last sync) changes this dependency. */
export type EdgeDiff = 'added' | 'removed' | 'changed';

export interface BlueprintEdgeData {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  status: EdgeStatus;
  count?: number;
  /** On the path of a dependency cycle. */
  cycle?: boolean;
  dim?: boolean;
  diff?: EdgeDiff;
  /** Status before the staged change, for "changed" edges. */
  previousStatus?: EdgeStatus;
  /** Bends from the automatic layout, so a long dependency goes around the components in between. */
  waypoints?: Array<{ x: number; y: number }>;
  /** The opposite dependency is drawn too (a two-member cycle): one of the two labels moves aside so both stay readable. */
  reverseDrawn?: boolean;
}

/** A smooth top-to-bottom path through the given points, and where its label goes. */
export function routedPath(points: Array<{ x: number; y: number }>): [path: string, labelX: number, labelY: number] {
  let path = `M ${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const middle = (from.y + to.y) / 2;
    path += ` C ${from.x},${middle} ${to.x},${middle} ${to.x},${to.y}`;
  }
  const label = points[Math.floor(points.length / 2)];
  return [path, label.x, label.y];
}

/**
 * One source of truth for the canvas, its legend and the inspector.
 * Status is carried by line pattern, a glyph and text, never by colour alone.
 */
export const EDGE_STATUS_STYLE: Record<EdgeStatus, {
  stroke: string;
  dash?: string;
  width: number;
  opacity: number;
  label: string;
  description: string;
  chip: string;
  icon?: LucideIcon;
}> = {
  declared: { stroke: 'var(--border-strong)', width: 1.25, opacity: 0.75, label: 'declared', description: 'Declared and observed in code', chip: 'bg-raised text-fg-3 shadow-[0_0_0_1px_var(--border-default)]' },
  undeclared: { stroke: 'var(--status-warn)', dash: '6 5', width: 1.5, opacity: 1, label: 'undeclared', description: 'Observed in code, nobody declared it', chip: 'bg-warn-bg text-warn', icon: TriangleAlert },
  forbidden: { stroke: 'var(--status-bad)', width: 1.75, opacity: 1, label: 'forbidden', description: 'Breaks a rule', chip: 'bg-bad-bg text-bad', icon: X },
  missing: { stroke: 'var(--status-unknown)', dash: '1.5 5', width: 1.5, opacity: 0.9, label: 'not observed', description: 'Declared, but no code uses it', chip: 'border border-dashed border-line-strong bg-raised text-fg-3' },
};

/**
 * A declared dependency on a dependency cycle: warning stroke, a dash-dot
 * line and a "cycle" chip. Undeclared or forbidden edges on a cycle keep their
 * own stroke and add "cycle" to their label. The cycle is shown once, on its
 * edges, never as a finding on every member.
 */
export const CYCLE_EDGE_STYLE: (typeof EDGE_STATUS_STYLE)[EdgeStatus] = {
  stroke: 'var(--status-warn)',
  dash: '9 3 2 3',
  width: 1.75,
  opacity: 1,
  label: 'cycle',
  description: 'Part of a dependency cycle',
  chip: 'bg-warn-bg text-warn',
  icon: RefreshCw,
};

/** The line style an edge is drawn with. */
export function edgeStyle(data: Pick<BlueprintEdgeData, 'status' | 'cycle'>): (typeof EDGE_STATUS_STYLE)[EdgeStatus] {
  return data.cycle && data.status === 'declared' ? CYCLE_EDGE_STYLE : EDGE_STATUS_STYLE[data.status];
}

const DIFF_STYLE: Record<EdgeDiff, { stroke: string; dash?: string; label: string; chip: string; icon: LucideIcon }> = {
  added: { stroke: 'var(--status-ok)', label: 'added', chip: 'bg-ok-bg text-ok', icon: Plus },
  removed: { stroke: 'var(--status-bad)', dash: '3 5', label: 'removed', chip: 'bg-bad-bg text-bad', icon: Minus },
  changed: { stroke: 'var(--accent)', dash: '4 4', label: 'proposed', chip: 'bg-accent-muted text-accent-text', icon: Sparkles },
};

export function edgeLabel(data: Pick<BlueprintEdgeData, 'status' | 'count' | 'cycle'>): string {
  const style = EDGE_STATUS_STYLE[data.status];
  if (data.status === 'missing') return style.label;
  const count = data.count ?? 0;
  if (data.status === 'declared') {
    if (data.cycle) return count ? `${CYCLE_EDGE_STYLE.label} · ${count}` : CYCLE_EDGE_STYLE.label;
    return count ? `${count}` : style.label;
  }
  const label = count ? `${style.label} · ${count}` : style.label;
  return data.cycle ? `${label} · ${CYCLE_EDGE_STYLE.label}` : label;
}

export function edgeDescription(data: BlueprintEdgeData): string {
  const count = data.count ? `, ${data.count} ${data.count === 1 ? 'import' : 'imports'}` : '';
  const base = `${data.fromName} to ${data.toName}: ${EDGE_STATUS_STYLE[data.status].label} dependency${count}${data.cycle ? ', part of a dependency cycle' : ''}`;
  if (!data.diff) return base;
  if (data.diff === 'changed' && data.previousStatus) return `${base}. Proposed change, was ${EDGE_STATUS_STYLE[data.previousStatus].label}`;
  return `${base}. ${data.diff === 'added' ? 'Added' : data.diff === 'removed' ? 'Removed' : 'Changed'} by the proposal`;
}

type ActivateEdge = (edge: { from: string; to: string }, anchor: { clientX: number; clientY: number }) => void;
export const EdgeActivateContext = createContext<ActivateEdge | null>(null);

/** Vertical gap between the labels of a dependency and its reverse (a label is 20px tall). */
const REVERSE_LABEL_SHIFT = 24;

function BlueprintEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<BlueprintEdgeData>) {
  const activate = useContext(EdgeActivateContext);
  const [path, labelX, labelY] = data?.waypoints?.length
    ? routedPath([{ x: sourceX, y: sourceY }, ...data.waypoints, { x: targetX, y: targetY }])
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const style = edgeStyle(data);
  const diff = data.diff ? DIFF_STYLE[data.diff] : null;
  const Icon = diff?.icon ?? style.icon;
  const text = data.diff === 'changed' ? edgeLabel(data) : diff ? diff.label : edgeLabel(data);
  // Healthy, unchanged dependencies stay quiet: their label disappears when zoomed out.
  const quiet = !diff && data.status === 'declared' && !data.cycle;
  // a → b and b → a share a midpoint: move one label (a fixed one of the pair) below the other.
  const labelShift = data.reverseDrawn && data.from > data.to ? REVERSE_LABEL_SHIFT : 0;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{
          stroke: diff?.stroke ?? style.stroke,
          strokeWidth: selected ? style.width + 0.75 : diff ? Math.max(style.width, 1.75) : style.width,
          strokeDasharray: diff ? diff.dash : style.dash,
          strokeLinecap: data.status === 'missing' && !diff ? 'round' : undefined,
          opacity: data.dim ? 0.15 : data.diff === 'removed' ? 0.7 : style.opacity,
          transition: 'opacity 200ms',
        }}
      />
      <EdgeLabelRenderer>
        <div
          data-quiet={quiet ? 'true' : 'false'}
          className={cx('studio-edge-label nodrag nopan absolute text-meta font-medium leading-none', data.dim && 'opacity-25')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelShift}px)`, pointerEvents: 'all' }}
        >
          <button
            type="button"
            data-status={data.status}
            data-cycle={data.cycle ? 'true' : undefined}
            data-diff={data.diff}
            aria-label={edgeDescription(data)}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              activate?.({ from: data.from, to: data.to }, { clientX: rect.left + rect.width / 2, clientY: rect.bottom });
            }}
            className={cx('tabular inline-flex h-5 items-center gap-1 rounded-full px-1.5 transition-[filter] duration-100 hover:brightness-125', diff?.chip ?? style.chip)}
          >
            {Icon && <Icon size={11} strokeWidth={2} aria-hidden="true" />}
            {text}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const BlueprintEdge = memo(BlueprintEdgeView);
BlueprintEdge.displayName = 'BlueprintEdge';
export default BlueprintEdge;
