'use client';

import { useMemo } from 'react';
import { Ban, CheckCircle2, CircleAlert, Crosshair, Link2, TriangleAlert } from 'lucide-react';

import type { BlueprintEditInput, Finding } from '@/blueprint';
import { cn } from '@/lib/utils';
import {
  ATTENTION_LIMIT,
  HUMAN_NUDGE_THRESHOLD,
  VERDICT_LABEL,
  declareDependency,
  forbidDependency,
  forbidRuleId,
  preExistingCount,
  reportVerdict,
  splitAttention,
  type Verdict,
} from './model';
import type { BlueprintSession } from './session';
import type { BlueprintUi } from './useBlueprintUi';
import { EmptyHint, SectionTitle, SeverityBadge, SourceLink, secondaryButtonClass, type NavigateToSource } from './ui';

const VERDICT_STYLE: Record<Verdict, { className: string; icon: typeof CheckCircle2 }> = {
  pass: { className: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200', icon: CheckCircle2 },
  warn: { className: 'border-amber-500/50 bg-amber-500/10 text-amber-200', icon: TriangleAlert },
  fail: { className: 'border-red-500/50 bg-red-500/10 text-red-200', icon: CircleAlert },
};

const GROUP_ROW_LIMIT = 40;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

interface AttentionTabProps {
  session: BlueprintSession;
  ui: BlueprintUi;
  onNavigateToSource?: NavigateToSource;
  onShowOnCanvas?: (componentIds: string[]) => void;
  /** Stage a ruling as a proposal (preview first) instead of changing the draft directly. */
  onPropose?: (edits: BlueprintEditInput[], label: string) => void;
  /** Hide the check summary (the host already shows the verdict). */
  hideSummary?: boolean;
}

export default function AttentionTab({ session, ui, onNavigateToSource, onShowOnCanvas, onPropose, hideSummary = false }: AttentionTabProps) {
  const { report, workspace, blueprint } = session;
  const verdict = reportVerdict(report);
  const inherited = preExistingCount(report);
  const attention = useMemo(() => splitAttention(report), [report]);
  const authorship = useMemo(() => workspace?.overview().authorship ?? null, [workspace]);
  const ratio = authorship?.ratio ?? report?.summary.humanAuthoredRatio ?? 0;
  const percent = Math.round(ratio * 100);
  const names = useMemo(
    () => new Map((blueprint?.components ?? []).map((component) => [component.id, component.name])),
    [blueprint],
  );

  const ruleOnDependency = (finding: Finding) => {
    if (finding.kind !== 'undeclared-dependency' || finding.components.length < 2) return null;
    const [from, to] = finding.components;
    return (
      <>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => (onPropose
            ? onPropose([{ op: 'declare_dependency', from, to }], `Declare ${names.get(from) ?? from} → ${names.get(to) ?? to}`)
            : session.update(declareDependency(from, to), `Declare ${from} → ${to}`))}
        >
          <Link2 size={12} aria-hidden="true" /> Declare
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => {
            if (onPropose) {
              onPropose([{ op: 'forbid_dependency', from, to }], `Forbid ${names.get(from) ?? from} → ${names.get(to) ?? to}`);
              return;
            }
            session.update(forbidDependency(from, to), `Forbid ${from} → ${to}`);
            ui.editRule(forbidRuleId(from, to), { focusReason: true });
          }}
        >
          <Ban size={12} aria-hidden="true" /> Forbid
        </button>
      </>
    );
  };

  const VerdictIcon = verdict ? VERDICT_STYLE[verdict].icon : null;

  return (
    <div className="space-y-4 p-3">
      {!hideSummary && <section aria-label="Check summary" className="space-y-3">
        {report && verdict && VerdictIcon ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="verdict-chip"
                data-verdict={verdict}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', VERDICT_STYLE[verdict].className)}
              >
                <VerdictIcon size={13} aria-hidden="true" /> {VERDICT_LABEL[verdict]}
              </span>
              <span className="text-xs text-slate-300">
                {plural(report.summary.errors, 'error')} · {plural(report.summary.warnings, 'warning')} · {report.summary.infos} info{inherited > 0 ? ` · ${inherited} existed before the contract` : ''}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
              <div className="flex justify-between gap-2"><dt>Components</dt><dd className="text-slate-200">{report.summary.components}</dd></div>
              <div className="flex justify-between gap-2"><dt>Files mapped</dt><dd className="text-slate-200">{report.summary.filesMapped}/{report.summary.filesAnalyzed}</dd></div>
              <div className="flex justify-between gap-2"><dt>Dependencies seen</dt><dd className="text-slate-200">{report.summary.componentEdges}</dd></div>
              <div className="flex justify-between gap-2"><dt>Undeclared</dt><dd className={report.summary.undeclaredEdges ? 'text-amber-200' : 'text-slate-200'}>{report.summary.undeclaredEdges}</dd></div>
            </dl>
          </>
        ) : (
          <EmptyHint>No check has run on this draft yet.</EmptyHint>
        )}

        <div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span id="human-authored-label" className="font-medium text-slate-200">Human-authored {percent}%</span>
            {authorship && (
              <span className="text-xs text-slate-500">
                intent on {authorship.componentsWithIntent}/{authorship.components} components
              </span>
            )}
          </div>
          <div
            role="meter"
            aria-labelledby="human-authored-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent}% of blueprint facts were written or verified by a person`}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className={cn('h-full rounded-full', ratio < HUMAN_NUDGE_THRESHOLD ? 'bg-amber-400' : 'bg-emerald-400')}
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
          {ratio < HUMAN_NUDGE_THRESHOLD && (authorship?.total ?? 1) > 0 && (
            <p className="mt-1.5 text-xs leading-4 text-amber-200/90">Derived facts are guesses until a person confirms them.</p>
          )}
        </div>
      </section>}

      <section aria-labelledby="attention-heading" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 id="attention-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Needs attention</h3>
          {report && report.findings.length > ATTENTION_LIMIT && (
            <span className="text-xs text-slate-500">top {ATTENTION_LIMIT} of {report.findings.length}</span>
          )}
        </div>
        {attention.top.length === 0 ? (
          <EmptyHint>{report ? 'Nothing needs a ruling. The code matches the contract.' : 'Findings appear here once the draft has been checked.'}</EmptyHint>
        ) : (
          <ol className="space-y-2" aria-label="Top findings">
            {attention.top.map((finding) => (
              <li key={finding.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <p className="min-w-0 flex-1 text-xs font-medium leading-5 text-slate-100">{finding.title}</p>
                </div>
                {finding.message && finding.message !== finding.title && (
                  <p className="mt-1 text-xs leading-4 text-slate-400">{finding.message}</p>
                )}
                {finding.reason && (
                  <blockquote className="mt-2 border-l-2 border-cyan-400/60 pl-2 text-xs italic leading-4 text-slate-300">
                    “{finding.reason}”
                    {finding.ruleId && <cite className="ml-1 not-italic text-slate-500">— rule {finding.ruleId}</cite>}
                  </blockquote>
                )}
                {finding.locations.length > 0 && (
                  <ul className="mt-2 space-y-0.5" aria-label="Evidence">
                    {finding.locations.slice(0, 3).map((location, index) => (
                      <li key={`${location.path}:${location.line ?? 0}:${index}`}>
                        <SourceLink target={{ path: location.path, line: location.line }} onNavigate={onNavigateToSource} />
                      </li>
                    ))}
                    {finding.locations.length > 3 && (
                      <li className="text-xs text-slate-500">+{finding.locations.length - 3} more locations</li>
                    )}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {finding.components.length > 0 && onShowOnCanvas && (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      aria-label={`Show on canvas: ${finding.components.map((id) => names.get(id) ?? id).join(', ')}`}
                      onClick={() => onShowOnCanvas(finding.components)}
                    >
                      <Crosshair size={12} aria-hidden="true" /> Show on canvas
                    </button>
                  )}
                  {ruleOnDependency(finding)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {attention.rest.length > 0 && (
        <section aria-label="Remaining findings" className="space-y-1.5">
          <SectionTitle>Everything else</SectionTitle>
          {attention.rest.map((group) => (
            <details key={group.kind} className="rounded-md border border-slate-800 bg-slate-950/40">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100">
                <span>{group.label}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">{group.findings.length}</span>
              </summary>
              <ul className="space-y-1.5 border-t border-slate-800 p-2">
                {group.findings.slice(0, GROUP_ROW_LIMIT).map((finding) => (
                  <li key={finding.id} className="text-xs leading-4 text-slate-300">
                    <span className="mr-1.5"><SeverityBadge severity={finding.severity} /></span>
                    {finding.title}
                    {finding.locations[0] && (
                      <span className="mt-0.5 block">
                        <SourceLink target={{ path: finding.locations[0].path, line: finding.locations[0].line }} onNavigate={onNavigateToSource} />
                      </span>
                    )}
                  </li>
                ))}
                {group.findings.length > GROUP_ROW_LIMIT && (
                  <li className="text-xs text-slate-500">+{group.findings.length - GROUP_ROW_LIMIT} more</li>
                )}
              </ul>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
