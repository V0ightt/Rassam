'use client';

import { useMemo } from 'react';
import { KeyRound, PencilLine, X } from 'lucide-react';

import type { ComponentSummary } from '@/blueprint';
import { cn } from '@/lib/utils';
import { EDGE_STATUS_STYLE, type EdgeStatus } from './BlueprintEdge';
import { KindIcon, kindColors } from './kinds';
import type { BlueprintSession } from './session';
import { ProvenanceBadge, SectionTitle, SeverityBadge, SourceLink, iconButtonClass, type NavigateToSource } from './ui';

const FILE_LIMIT = 8;

interface BlueprintInspectorProps {
  componentId: string;
  session: Pick<BlueprintSession, 'workspace' | 'blueprint'>;
  /** Status of the drawn edge between two components, if any. */
  edgeStatus: (from: string, to: string) => EdgeStatus | null;
  onSelectComponent: (id: string) => void;
  onOpenEdge: (from: string, to: string) => void;
  onWriteIntent: () => void;
  onClose: () => void;
  onNavigateToSource?: NavigateToSource;
  className?: string;
}

function NeighborList({
  title,
  items,
  names,
  pair,
  edgeStatus,
  onSelectComponent,
  onOpenEdge,
}: {
  title: string;
  items: ComponentSummary['dependsOn'];
  names: Map<string, string>;
  pair: (other: string) => [string, string];
  edgeStatus: BlueprintInspectorProps['edgeStatus'];
  onSelectComponent: (id: string) => void;
  onOpenEdge: (from: string, to: string) => void;
}) {
  return (
    <section className="space-y-1.5" aria-label={title}>
      <SectionTitle count={items.length}>{title}</SectionTitle>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-500">None.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => {
            const [from, to] = pair(item.id);
            const status = edgeStatus(from, to) ?? (item.declared ? (item.observed ? 'declared' : 'missing') : 'undeclared');
            const name = names.get(item.id) ?? item.id;
            return (
              <li key={item.id} className="flex items-center gap-1.5 text-[11px]">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-slate-200 hover:text-cyan-200" onClick={() => onSelectComponent(item.id)}>
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenEdge(from, to)}
                  aria-label={`${names.get(from) ?? from} to ${names.get(to) ?? to}: ${EDGE_STATUS_STYLE[status].label}. Open actions`}
                  className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] hover:brightness-125', EDGE_STATUS_STYLE[status].chip)}
                >
                  {EDGE_STATUS_STYLE[status].label}{item.imports ? ` · ${item.imports}` : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Read-only answer to "what is this component and what is it tied to?" for the selected node. */
export default function BlueprintInspector({
  componentId,
  session,
  edgeStatus,
  onSelectComponent,
  onOpenEdge,
  onWriteIntent,
  onClose,
  onNavigateToSource,
  className,
}: BlueprintInspectorProps) {
  const summary = useMemo(() => session.workspace?.componentSummary(componentId) ?? null, [componentId, session.workspace]);
  const names = useMemo(
    () => new Map((session.blueprint?.components ?? []).map((component) => [component.id, component.name])),
    [session.blueprint],
  );
  if (!summary) return null;
  const { component } = summary;

  return (
    <aside
      aria-label={`${component.name} details`}
      className={cn('nowheel flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur', className)}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-slate-800 p-3">
        <KindIcon kind={component.kind} size={16} className={cn('mt-0.5 shrink-0', kindColors(component.kind).icon)} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-50">{component.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span>{component.kind}</span>
            <ProvenanceBadge fact={component} />
            {component.assurance && component.assurance !== 'unknown' && <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{component.assurance}</span>}
          </p>
        </div>
        <button type="button" className={iconButtonClass} aria-label="Close details" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section aria-label="Intent">
          {component.intent?.trim() ? (
            <>
              <p className="whitespace-pre-wrap text-xs leading-5 text-slate-200">{component.intent}</p>
              <button type="button" onClick={onWriteIntent} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-100">
                <PencilLine size={11} aria-hidden="true" /> Edit intent
              </button>
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5">
              <p className="text-[11px] leading-4 text-amber-100">Nobody has said what this component is for. Agents will guess.</p>
              <button type="button" onClick={onWriteIntent} className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-400/15 px-3 text-xs font-semibold text-amber-50 hover:bg-amber-400/25">
                <PencilLine size={13} aria-hidden="true" /> Write intent
              </button>
            </div>
          )}
          {component.description && <p className="mt-2 text-[11px] leading-4 text-slate-400">{component.description}</p>}
          {component.owners?.length ? <p className="mt-1 text-[11px] text-slate-500">Owners: {component.owners.join(', ')}</p> : null}
        </section>

        <NeighborList title="Depends on" items={summary.dependsOn} names={names} pair={(other) => [componentId, other]} edgeStatus={edgeStatus} onSelectComponent={onSelectComponent} onOpenEdge={onOpenEdge} />
        <NeighborList title="Used by" items={summary.dependents} names={names} pair={(other) => [other, componentId]} edgeStatus={edgeStatus} onSelectComponent={onSelectComponent} onOpenEdge={onOpenEdge} />

        {summary.rules.length > 0 && (
          <section className="space-y-1.5" aria-label="Rules">
            <SectionTitle count={summary.rules.length}>Rules</SectionTitle>
            <ul className="space-y-1.5">
              {summary.rules.map((rule) => (
                <li key={rule.id} className="text-[11px] leading-4 text-slate-300">
                  <span className="mr-1.5"><SeverityBadge severity={rule.severity} /></span>
                  {rule.summary}
                  {rule.reason && <span className="mt-0.5 block border-l-2 border-cyan-400/60 pl-2 italic text-slate-400">“{rule.reason}”</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {summary.invariants.length > 0 && (
          <section className="space-y-1.5" aria-label="Invariants">
            <SectionTitle count={summary.invariants.length}>Invariants</SectionTitle>
            <ul className="list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-300">
              {summary.invariants.map((invariant) => <li key={invariant.id}>{invariant.statement}</li>)}
            </ul>
          </section>
        )}

        {summary.decisions.length > 0 && (
          <section className="space-y-1.5" aria-label="Decisions">
            <SectionTitle count={summary.decisions.length}>Decisions</SectionTitle>
            <ul className="space-y-1 text-[11px] leading-4 text-slate-300">
              {summary.decisions.map((decision) => <li key={decision.id}>{decision.title} <span className="text-slate-500">({decision.status})</span></li>)}
            </ul>
          </section>
        )}

        {summary.env.length > 0 && (
          <section className="space-y-1.5" aria-label="Environment variables">
            <SectionTitle count={summary.env.length}>Environment</SectionTitle>
            <ul className="space-y-1">
              {summary.env.map((entry) => (
                <li key={entry.name} className="text-[11px]">
                  <span className={cn('inline-flex items-center gap-1 font-mono', entry.secretLike ? 'text-amber-200' : 'text-slate-300')}>
                    {entry.secretLike && <KeyRound size={10} aria-hidden="true" />}
                    {entry.name}
                    {entry.secretLike && <span className="font-sans text-[10px]">secret-like</span>}
                  </span>
                  {entry.files[0] && <span className="block"><SourceLink target={{ path: entry.files[0] }} onNavigate={onNavigateToSource} /></span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-1.5" aria-label="Files">
          <SectionTitle count={summary.fileCount}>Files</SectionTitle>
          {summary.fileCount === 0 ? (
            <p className="text-[11px] text-slate-500">{component.external ? 'External systems own no files.' : 'No files match its paths.'}</p>
          ) : (
            <ul className="space-y-0.5">
              {summary.files.slice(0, FILE_LIMIT).map((file) => <li key={file}><SourceLink target={{ path: file }} onNavigate={onNavigateToSource} /></li>)}
              {summary.fileCount > FILE_LIMIT && <li className="text-[11px] text-slate-500">+{summary.fileCount - FILE_LIMIT} more</li>}
            </ul>
          )}
          {summary.tests.length > 0 && <p className="text-[11px] text-slate-500">{summary.tests.length} test {summary.tests.length === 1 ? 'file exercises' : 'files exercise'} it.</p>}
        </section>

        {summary.externals.length > 0 && (
          <section className="space-y-1.5" aria-label="Packages">
            <SectionTitle count={summary.externals.length}>Packages</SectionTitle>
            <p className="break-words font-mono text-[11px] leading-4 text-slate-400">{summary.externals.slice(0, 20).join(', ')}{summary.externals.length > 20 ? ` +${summary.externals.length - 20}` : ''}</p>
          </section>
        )}
      </div>
    </aside>
  );
}
