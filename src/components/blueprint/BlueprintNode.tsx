'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BadgeCheck, KeyRound, TriangleAlert } from 'lucide-react';

import type { BlueprintComponent } from '@/blueprint';
import { cn } from '@/lib/utils';
import { KindIcon, kindColors } from './kinds';
import { firstLine, isDerived } from './model';

export type NodeEmphasis = 'normal' | 'dim' | 'highlight' | 'origin';

export interface BlueprintNodeData {
  component: BlueprintComponent;
  fileCount: number;
  findings: number;
  emphasis: NodeEmphasis;
  /** Extra line for the active question, e.g. "breaks 2 steps away". */
  note?: string;
  /** Secret-like environment variables this component reads (Reach question). */
  secrets?: string[];
  /** Ring drawn by "Show on canvas". */
  spotlight?: boolean;
}

export const BLUEPRINT_NODE_WIDTH = 248;
export const BLUEPRINT_NODE_HEIGHT = 124;

function BlueprintNodeView({ data, selected }: NodeProps<BlueprintNodeData>) {
  const { component, fileCount, findings, emphasis, note, secrets, spotlight } = data;
  const colors = kindColors(component.kind);
  const intent = firstLine(component.intent);
  const assurance = component.assurance && component.assurance !== 'unknown' ? component.assurance : null;

  return (
    <div
      data-testid={`blueprint-node-${component.id}`}
      data-emphasis={emphasis}
      data-external={component.external ? 'true' : 'false'}
      style={{ width: BLUEPRINT_NODE_WIDTH }}
      className={cn(
        'rounded-xl border-2 bg-slate-900 px-3 py-2.5 text-left shadow-lg transition-opacity',
        component.external ? 'border-dashed border-slate-500' : colors.border,
        selected && 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-slate-950',
        spotlight && !selected && 'ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-950',
        emphasis === 'dim' && 'opacity-25',
        emphasis === 'highlight' && 'shadow-cyan-500/30',
        emphasis === 'origin' && 'shadow-cyan-400/50',
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-slate-900 !bg-slate-400" />

      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md', colors.bg)}>
          <KindIcon kind={component.kind} size={15} className={colors.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5 text-slate-50">{component.name}</p>
          <p className="truncate text-[10px] text-slate-400">
            {component.kind}
            {component.external ? ' · external' : ` · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
          </p>
        </div>
        {findings > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-500/60 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-100"
            aria-label={`${findings} ${findings === 1 ? 'finding' : 'findings'}`}
          >
            <TriangleAlert size={10} aria-hidden="true" /> {findings}
          </span>
        )}
      </div>

      <p className={cn('mt-2 line-clamp-2 text-[11px] leading-4', intent ? 'text-slate-300' : 'font-medium text-amber-300')}>
        {intent ?? 'No intent yet'}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {component.verified ? (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
            <BadgeCheck size={10} aria-hidden="true" /> verified
          </span>
        ) : isDerived(component) ? (
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] italic text-slate-400">derived</span>
        ) : null}
        {assurance && (
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{assurance}</span>
        )}
        {note && <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-100">{note}</span>}
      </div>

      {secrets && secrets.length > 0 && (
        <p className="mt-2 flex items-start gap-1 text-[10px] leading-4 text-amber-200" aria-label={`Reads secrets: ${secrets.join(', ')}`}>
          <KeyRound size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-all font-mono">{secrets.slice(0, 4).join(', ')}{secrets.length > 4 ? ` +${secrets.length - 4}` : ''}</span>
        </p>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-slate-900 !bg-cyan-400" />
    </div>
  );
}

const BlueprintNode = memo(BlueprintNodeView);
BlueprintNode.displayName = 'BlueprintNode';
export default BlueprintNode;
