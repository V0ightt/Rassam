'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BadgeCheck, KeyRound, Minus, PencilLine, Plus, TriangleAlert } from 'lucide-react';

import type { BlueprintComponent, ComponentState } from '@/blueprint';
import { cx } from '@/components/ui/cx';
import { StatusGlyph, type StatusTone } from '@/components/ui/StatusGlyph';
import { KindIcon } from './kinds';
import { firstLine, isDerived } from './model';

export type NodeEmphasis = 'normal' | 'dim' | 'highlight' | 'origin';
/** How a staged proposal (or the last sync) changes this component. */
export type NodeDiff = 'added' | 'removed' | 'changed';

export interface BlueprintNodeData {
  component: BlueprintComponent;
  fileCount: number;
  findings: number;
  emphasis: NodeEmphasis;
  /** Extra line for the active question, e.g. "2 steps away". */
  note?: string;
  /** Secret-like environment variables this component reads (Reach question). */
  secrets?: string[];
  /** Ring drawn by "Show on canvas". */
  spotlight?: boolean;
  /** Runtime state from `.rassam/status.json`, when the component is monitored. */
  runtime?: ComponentState;
  diff?: NodeDiff;
  /** Part of the current intent scope (multi-selection). */
  scoped?: boolean;
}

export const BLUEPRINT_NODE_WIDTH = 220;
export const BLUEPRINT_NODE_HEIGHT = 92;

export const RUNTIME_STATUS: Record<ComponentState, { tone: StatusTone; label: string }> = {
  up: { tone: 'ok', label: 'Up' },
  degraded: { tone: 'warn', label: 'Degraded' },
  down: { tone: 'bad', label: 'Down' },
  unknown: { tone: 'unknown', label: 'Status unknown' },
};

const DIFF_STYLE: Record<NodeDiff, { label: string; icon: typeof Plus; card: string; badge: string }> = {
  added: { label: 'Added', icon: Plus, card: 'shadow-[0_0_0_1.5px_var(--status-ok)]', badge: 'bg-ok-bg text-ok' },
  removed: { label: 'Removed', icon: Minus, card: 'border border-dashed border-bad shadow-none opacity-60', badge: 'bg-bad-bg text-bad' },
  changed: { label: 'Changed', icon: PencilLine, card: 'border border-dashed border-accent shadow-none', badge: 'bg-accent-muted text-accent-text' },
};

function BlueprintNodeView({ data, selected }: NodeProps<BlueprintNodeData>) {
  const { component, fileCount, findings, emphasis, note, secrets, spotlight, runtime, diff, scoped } = data;
  const intent = firstLine(component.intent);
  const assurance = component.assurance && component.assurance !== 'unknown' ? component.assurance : null;
  const diffStyle = diff ? DIFF_STYLE[diff] : null;
  const DiffIcon = diffStyle?.icon;
  const active = selected || scoped;

  return (
    <div
      data-testid={`blueprint-node-${component.id}`}
      data-emphasis={emphasis}
      data-external={component.external ? 'true' : 'false'}
      data-diff={diff}
      style={{ width: BLUEPRINT_NODE_WIDTH }}
      className={cx(
        'studio-node relative min-h-16 rounded-lg bg-raised p-3 text-left transition-[opacity,box-shadow] duration-200',
        diffStyle
          ? diffStyle.card
          : component.external
            ? 'border border-dashed border-line-strong'
            : 'shadow-elev-1',
        active && 'outline outline-2 outline-offset-2 outline-accent',
        spotlight && !active && 'outline outline-2 outline-offset-2 outline-warn',
        emphasis === 'dim' && 'opacity-35',
        emphasis === 'origin' && !active && 'outline outline-2 outline-offset-2 outline-accent',
      )}
    >
      <Handle type="target" position={Position.Top} />

      {diffStyle && DiffIcon && (
        <span className={cx('absolute -top-2.5 right-3 inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-meta font-medium', diffStyle.badge)}>
          <DiffIcon size={12} strokeWidth={2} aria-hidden="true" /> {diffStyle.label}
        </span>
      )}

      <div className="flex items-center gap-2">
        <KindIcon kind={component.kind} size={16} className="shrink-0 text-fg-3" />
        <p className="min-w-0 flex-1 truncate text-body font-medium text-fg">{component.name}</p>
        {runtime && <StatusGlyph tone={RUNTIME_STATUS[runtime].tone} label={RUNTIME_STATUS[runtime].label} hideLabel />}
        {findings > 0 && (
          <span
            className="tabular inline-flex h-5 shrink-0 items-center gap-1 rounded-xs bg-warn-bg px-1.5 text-meta font-medium text-warn"
            aria-label={`${findings} ${findings === 1 ? 'finding' : 'findings'}`}
          >
            <TriangleAlert size={12} strokeWidth={1.75} aria-hidden="true" /> {findings}
          </span>
        )}
      </div>

      <p className={cx('studio-node-secondary mt-1 truncate text-small', intent ? 'text-fg-2' : 'text-fg-3')}>
        {intent ?? 'No intent yet'}
      </p>

      <div className="studio-node-secondary mt-2 flex items-center gap-1.5 text-meta text-fg-3">
        <span className="min-w-0 truncate">
          {component.kind}
          {component.external ? ' · external' : ` · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {note && <span className="rounded-xs bg-accent-muted px-1.5 text-accent-text">{note}</span>}
          {assurance && <span>{assurance}</span>}
          {component.verified ? (
            <span className="inline-flex items-center gap-1 text-fg-2">
              <BadgeCheck size={12} strokeWidth={1.75} aria-hidden="true" /> verified
            </span>
          ) : isDerived(component) ? (
            <span className="rounded-xs border border-dashed border-line-strong px-1">derived</span>
          ) : null}
        </span>
      </div>

      {secrets && secrets.length > 0 && (
        <p className="mt-2 flex items-start gap-1 text-meta leading-4 text-warn" aria-label={`Reads secrets: ${secrets.join(', ')}`}>
          <KeyRound size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-all font-mono">{secrets.slice(0, 4).join(', ')}{secrets.length > 4 ? ` +${secrets.length - 4}` : ''}</span>
        </p>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const BlueprintNode = memo(BlueprintNodeView);
BlueprintNode.displayName = 'BlueprintNode';
export default BlueprintNode;
