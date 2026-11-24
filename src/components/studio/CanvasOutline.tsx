'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';

import { CYCLE_EDGE_STYLE, EDGE_STATUS_STYLE } from '@/components/blueprint/BlueprintEdge';
import { findingsLabel } from '@/components/blueprint/BlueprintNode';
import { firstLine } from '@/components/blueprint/model';
import type { BlueprintSession } from '@/components/blueprint/session';
import { IconButton } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';

/**
 * The same model as the canvas, as a list: every component and every
 * dependency with its status in words. The accessible alternative to the
 * diagram, and the fast way to reach an edge from the keyboard.
 */
export default function CanvasOutline({
  session,
  selectedId,
  onSelect,
  onOpenEdge,
  onClose,
  className,
}: {
  session: Pick<BlueprintSession, 'blueprint' | 'workspace'>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenEdge: (from: string, to: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const view = useMemo(() => session.workspace?.graphView() ?? { components: [], edges: [] }, [session.workspace]);
  const names = useMemo(() => new Map((session.blueprint?.components ?? []).map((component) => [component.id, component.name])), [session.blueprint]);
  const components = session.blueprint?.components ?? [];
  // Each dependency cycle is stated once, as the loop it makes; members are not counted as findings.
  const cycles = (view.cycles ?? []).map((cycle) => cycle.path.map((id) => names.get(id) ?? id).join(' → '));

  return (
    <nav
      aria-label="Outline"
      data-canvas-shortcuts="off"
      className={cx('studio flex animate-rise flex-col overflow-hidden rounded-xl bg-raised text-fg shadow-elev-2', className)}
    >
      <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="flex-1 text-body font-medium text-fg">Outline</h2>
        <span className="tabular text-meta text-fg-3">
          {components.length} components · {view.edges.length} dependencies
          {cycles.length > 0 && ` · ${cycles.length} dependency ${cycles.length === 1 ? 'cycle' : 'cycles'}`}
        </span>
        <IconButton label="Close outline" size="sm" onClick={onClose}>
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
      </header>
      {cycles.length > 0 && (
        <ul aria-label="Dependency cycles" className="shrink-0 space-y-0.5 px-4 pb-2">
          {cycles.map((cycle) => (
            <li key={cycle} className="text-meta text-fg-2">
              <span className="font-medium text-warn">Dependency cycle:</span> {cycle}
            </li>
          ))}
        </ul>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {components.map((component) => {
          const outgoing = view.edges.filter((edge) => edge.from === component.id && names.has(edge.to));
          const judged = view.components.find((item) => item.id === component.id);
          const findings = judged?.findings ?? 0;
          const intent = firstLine(component.intent);
          return (
            <li key={component.id}>
              <button
                type="button"
                aria-current={component.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(component.id)}
                className={cx(
                  'focus-ring block w-full rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover',
                  component.id === selectedId && 'bg-active',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-small font-medium text-fg">{component.name}</span>
                  {findings > 0 && <span className={cx('tabular shrink-0 text-meta', judged?.severity === 'error' ? 'text-bad' : 'text-warn')}>{findingsLabel(findings, judged?.severity)}</span>}
                </span>
                <span className="block truncate text-meta text-fg-3">{intent ?? 'No intent yet'}</span>
              </button>
              {outgoing.length > 0 && (
                <ul aria-label={`${component.name} depends on`} className="ml-4 border-l border-line-subtle pl-2">
                  {outgoing.map((edge) => {
                    const style = EDGE_STATUS_STYLE[edge.status];
                    return (
                      <li key={edge.to}>
                        <button
                          type="button"
                          onClick={() => onOpenEdge(edge.from, edge.to)}
                          className="focus-ring flex min-h-6 w-full items-center gap-2 rounded-sm px-2 text-left text-meta text-fg-2 hover:bg-hover"
                        >
                          <span className="min-w-0 flex-1 truncate">→ {names.get(edge.to)}</span>
                          <span className={cx('shrink-0', edge.status === 'forbidden' ? 'text-bad' : edge.status === 'undeclared' || edge.cycle ? 'text-warn' : 'text-fg-3')}>
                            {edge.cycle ? (edge.status === 'declared' ? CYCLE_EDGE_STYLE.label : `${style.label} · ${CYCLE_EDGE_STYLE.label}`) : style.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
