'use client';

import { createContext, memo, useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';

import type { WorkspaceGraphView } from '@/blueprint';
import { cn } from '@/lib/utils';

export type EdgeStatus = WorkspaceGraphView['edges'][number]['status'];

export interface BlueprintEdgeData {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  status: EdgeStatus;
  count?: number;
  dim?: boolean;
}

/** One source of truth for the canvas and its legend. Status is carried by pattern and text, not colour alone. */
export const EDGE_STATUS_STYLE: Record<EdgeStatus, { stroke: string; dash?: string; width: number; label: string; description: string; chip: string }> = {
  declared: { stroke: '#94a3b8', width: 1.5, label: 'declared', description: 'Declared and observed in code', chip: 'border-slate-600 bg-slate-900 text-slate-300' },
  undeclared: { stroke: '#fbbf24', dash: '7 5', width: 1.75, label: 'undeclared', description: 'Observed in code, nobody declared it', chip: 'border-amber-500/60 bg-slate-900 text-amber-200' },
  forbidden: { stroke: '#f87171', width: 2.5, label: 'forbidden', description: 'Breaks a rule', chip: 'border-red-500/70 bg-red-950 text-red-100' },
  missing: { stroke: '#64748b', dash: '1.5 5', width: 1.75, label: 'not observed', description: 'Declared, but no code uses it', chip: 'border-slate-700 bg-slate-900 text-slate-400' },
};

export function edgeLabel(data: Pick<BlueprintEdgeData, 'status' | 'count'>): string {
  const style = EDGE_STATUS_STYLE[data.status];
  if (data.status === 'missing') return style.label;
  const count = data.count ?? 0;
  if (data.status === 'declared') return count ? `${count}` : style.label;
  return count ? `${style.label} · ${count}` : style.label;
}

export function edgeDescription(data: BlueprintEdgeData): string {
  const count = data.count ? `, ${data.count} ${data.count === 1 ? 'import' : 'imports'}` : '';
  return `${data.fromName} to ${data.toName}: ${EDGE_STATUS_STYLE[data.status].label} dependency${count}`;
}

type ActivateEdge = (edge: { from: string; to: string }, anchor: { clientX: number; clientY: number }) => void;
export const EdgeActivateContext = createContext<ActivateEdge | null>(null);

function BlueprintEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<BlueprintEdgeData>) {
  const activate = useContext(EdgeActivateContext);
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const style = EDGE_STATUS_STYLE[data.status];
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? style.width + 1 : style.width,
          strokeDasharray: style.dash,
          strokeLinecap: data.status === 'missing' ? 'round' : undefined,
          opacity: data.dim ? 0.12 : 1,
        }}
      />
      <EdgeLabelRenderer>
        {/* The wrapper carries position and type size: buttons inherit their font in this app. */}
        <div
          className={cn('nodrag nopan absolute text-[10px] font-medium leading-none', data.dim && 'opacity-20')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
        >
          <button
            type="button"
            data-status={data.status}
            aria-label={edgeDescription(data)}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              activate?.({ from: data.from, to: data.to }, { clientX: rect.left + rect.width / 2, clientY: rect.bottom });
            }}
            className={cn('rounded-full border px-1.5 py-0.5 hover:brightness-125', style.chip)}
          >
            {edgeLabel(data)}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const BlueprintEdge = memo(BlueprintEdgeView);
BlueprintEdge.displayName = 'BlueprintEdge';
export default BlueprintEdge;
