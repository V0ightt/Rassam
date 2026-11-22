'use client';

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { ArrowRight, Ban, Link2, Unlink, X } from 'lucide-react';

import type { BlueprintEditInput } from '@/blueprint';
import { EDGE_STATUS_STYLE, type EdgeStatus } from './BlueprintEdge';
import { declareDependency, forbidDependency, forbidRuleId, hasDependency, undeclareDependency } from './model';
import type { BlueprintSession } from './session';
import type { BlueprintUi } from './useBlueprintUi';
import { SeverityBadge, SourceLink, iconButtonClass, primaryButtonClass, secondaryButtonClass, type NavigateToSource } from './ui';

export interface EdgePromptTarget {
  from: string;
  to: string;
  /** "new" when the person just drew the edge and nothing is known about it yet. */
  status: EdgeStatus | 'new';
  count?: number;
}

interface EdgePromptProps {
  target: EdgePromptTarget;
  session: BlueprintSession;
  ui: BlueprintUi;
  onClose: () => void;
  /**
   * Stage the ruling as a proposal (previewed on the canvas, then applied or
   * discarded) instead of changing the draft directly.
   */
  onPropose?: (edits: BlueprintEditInput[], label: string) => void;
  /** Called after "Forbid dependency" so the host can reveal the Rules tab. */
  onRevealPanel?: () => void;
  onNavigateToSource?: NavigateToSource;
  style?: CSSProperties;
}

const HEADLINE: Record<EdgePromptTarget['status'], string> = {
  new: 'New dependency. Is it intended?',
  undeclared: 'The code does this, but nobody declared it. Is it intended?',
  declared: 'Declared dependency.',
  missing: 'Declared, but no code uses it.',
  forbidden: 'This dependency breaks a rule.',
};

/**
 * The ruling a person makes on one edge: declare it, forbid it, or read the
 * evidence. Shown when an edge is drawn or clicked on the Blueprint canvas.
 */
export default function EdgePrompt({ target, session, ui, onClose, onPropose, onRevealPanel, onNavigateToSource, style }: EdgePromptProps) {
  const { from, to, status } = target;
  const ref = useRef<HTMLDivElement>(null);
  const { blueprint, report } = session;
  const names = useMemo(() => new Map((blueprint?.components ?? []).map((component) => [component.id, component.name])), [blueprint]);
  const fromName = names.get(from) ?? from;
  const toName = names.get(to) ?? to;
  const declared = blueprint ? hasDependency(blueprint, from, to) : false;
  const existingRule = blueprint?.rules.find((rule) => rule.id === forbidRuleId(from, to)) ?? null;
  const violations = useMemo(() => {
    if (status !== 'forbidden') return [];
    const touching = (report?.findings ?? []).filter((finding) => finding.components.includes(from) && finding.components.includes(to));
    // The same import is often also reported as undeclared; the rule violation is the one to read.
    const ruled = touching.filter((finding) => finding.kind !== 'undeclared-dependency');
    return ruled.length ? ruled : touching;
  }, [from, report, status, to]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [from, to, status]);

  const declare = () => {
    const label = `Declare ${fromName} → ${toName}`;
    if (onPropose) onPropose([{ op: 'declare_dependency', from, to }], label);
    else session.update(declareDependency(from, to), label);
    onClose();
  };
  const forbid = () => {
    const label = `Forbid ${fromName} → ${toName}`;
    if (onPropose && !existingRule) {
      onPropose([{ op: 'forbid_dependency', from, to }], label);
      onClose();
      return;
    }
    if (!existingRule) session.update(forbidDependency(from, to), label);
    ui.editRule(forbidRuleId(from, to), { focusReason: true });
    onRevealPanel?.();
    onClose();
  };
  const undeclare = () => {
    const label = `Remove declared ${fromName} → ${toName}`;
    if (onPropose) onPropose([{ op: 'remove_dependency', from, to }], label);
    else session.update(undeclareDependency(from, to), label);
    onClose();
  };

  const canDeclare = !declared && (status === 'new' || status === 'undeclared');
  const canForbid = status !== 'forbidden';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Dependency from ${fromName} to ${toName}`}
      style={style}
      className="studio nodrag nopan z-20 w-72 animate-pop rounded-lg bg-overlay p-3 text-fg shadow-elev-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      }}
    >
      <div className="flex items-start gap-2">
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs font-semibold">
          <span className="truncate">{fromName}</span>
          <ArrowRight size={12} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">{toName}</span>
        </p>
        <button type="button" className={iconButtonClass} aria-label="Close" onClick={onClose}>
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <p className="mt-1 text-xs leading-4 text-slate-300">
        {status === 'new' && declared ? 'This dependency is already declared.' : HEADLINE[status]}
        {status !== 'new' && target.count ? ` ${target.count} ${target.count === 1 ? 'import' : 'imports'} observed.` : ''}
      </p>
      {status !== 'new' && (
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Status: {EDGE_STATUS_STYLE[status].label}</p>
      )}

      {status === 'forbidden' && (
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
          {violations.length === 0 ? (
            <p className="text-xs text-slate-400">The check report lists no evidence for this edge yet. Rescan to refresh it.</p>
          ) : (
            <ul className="space-y-2" aria-label="Violating imports">
              {violations.map((finding) => (
                <li key={finding.id} className="rounded-md border border-red-500/30 bg-red-500/5 p-2">
                  <p className="flex items-start gap-1.5 text-xs leading-4 text-slate-100">
                    <SeverityBadge severity={finding.severity} />
                    <span>{finding.title}</span>
                  </p>
                  {finding.reason && <p className="mt-1 border-l-2 border-cyan-400/60 pl-2 text-xs italic text-slate-300">“{finding.reason}”</p>}
                  <ul className="mt-1 space-y-0.5">
                    {finding.locations.slice(0, 8).map((location, index) => (
                      <li key={`${location.path}:${location.line ?? 0}:${index}`}>
                        <SourceLink target={{ path: location.path, line: location.line }} onNavigate={onNavigateToSource} />
                      </li>
                    ))}
                    {finding.locations.length > 8 && <li className="text-xs text-slate-500">+{finding.locations.length - 8} more</li>}
                  </ul>
                  {finding.ruleId && (
                    <button
                      type="button"
                      className="mt-1.5 text-xs text-cyan-300 underline underline-offset-2 hover:text-cyan-100"
                      onClick={() => { ui.editRule(finding.ruleId!); onRevealPanel?.(); onClose(); }}
                    >
                      Open rule {finding.ruleId}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {canDeclare && (
          <button type="button" data-autofocus className={primaryButtonClass} onClick={declare}>
            <Link2 size={13} aria-hidden="true" /> Declare dependency
          </button>
        )}
        {canForbid && (
          <button type="button" data-autofocus={canDeclare ? undefined : true} className={secondaryButtonClass} onClick={forbid}>
            <Ban size={13} aria-hidden="true" /> {existingRule ? 'Open forbid rule' : 'Forbid dependency'}
          </button>
        )}
        {declared && status !== 'forbidden' && (
          <button type="button" className={secondaryButtonClass} onClick={undeclare}>
            <Unlink size={13} aria-hidden="true" /> Remove declaration
          </button>
        )}
        {status === 'forbidden' && (
          <button type="button" data-autofocus className={secondaryButtonClass} onClick={onClose}>Done</button>
        )}
      </div>
    </div>
  );
}
