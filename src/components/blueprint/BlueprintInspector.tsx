'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { KeyRound, PencilLine, SlidersHorizontal, X } from 'lucide-react';

import type { ComponentStatus, ComponentSummary, PathExplanation } from '@/blueprint';
import { Button, IconButton } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Pill';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { EDGE_STATUS_STYLE, type EdgeStatus } from './BlueprintEdge';
import { RUNTIME_STATUS } from './BlueprintNode';
import { KindIcon } from './kinds';
import { isDerived } from './model';
import type { BlueprintSession } from './session';
import { SeverityBadge, SourceLink, VerifyControl, type NavigateToSource } from './ui';

const FILE_LIMIT = 8;
const INTENT_MAX = 4_000;

interface BlueprintInspectorProps {
  componentId: string;
  session: Pick<BlueprintSession, 'workspace' | 'blueprint'>;
  /** Status of the drawn edge between two components, if any. */
  edgeStatus: (from: string, to: string) => EdgeStatus | null;
  onSelectComponent: (id: string) => void;
  onOpenEdge: (from: string, to: string) => void;
  /** Save the intent written inline. Without it the intent is read-only. */
  onSaveIntent?: (intent: string) => void;
  /** Record a human sign-off for this component. */
  onVerify?: (by: string, note?: string) => void;
  /** Open the full manual editor for this component ("More"). */
  onOpenManual?: () => void;
  /** Runtime state of this component, when it is monitored. */
  runtime?: ComponentStatus | null;
  /** The runtime status is older than it should be. */
  runtimeStale?: boolean;
  onClose: () => void;
  onNavigateToSource?: NavigateToSource;
  className?: string;
}

function sentenceList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-line-subtle px-4 py-4">
      <h4 className="mb-2 flex items-center gap-2 text-meta font-medium uppercase tracking-wider text-fg-3">
        {title}
        {count !== undefined && <span className="tabular normal-case tracking-normal">{count}</span>}
      </h4>
      {children}
    </section>
  );
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
    <section className="mt-3" aria-label={title}>
      <h5 className="text-meta text-fg-3">{title} <span className="tabular">{items.length}</span></h5>
      {items.length === 0 ? (
        <p className="mt-1 text-small text-fg-3">None.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {items.map((item) => {
            const [from, to] = pair(item.id);
            const status = edgeStatus(from, to) ?? (item.declared ? (item.observed ? 'declared' : 'missing') : 'undeclared');
            const style = EDGE_STATUS_STYLE[status];
            const Icon = style.icon;
            const name = names.get(item.id) ?? item.id;
            return (
              <li key={item.id} className="flex items-center gap-2">
                <button type="button" className="focus-ring -mx-1 min-h-6 min-w-0 flex-1 truncate rounded-xs px-1 text-left text-small text-fg hover:text-accent-text" onClick={() => onSelectComponent(item.id)}>
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenEdge(from, to)}
                  aria-label={`${names.get(from) ?? from} to ${names.get(to) ?? to}: ${style.label}. Open actions`}
                  className={cx('focus-ring tabular inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-meta font-medium hover:brightness-110', style.chip)}
                >
                  {Icon && <Icon size={11} strokeWidth={2} aria-hidden="true" />}
                  {style.label}{item.imports ? ` · ${item.imports}` : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IntentField({ name, intent, onSave }: { name: string; intent: string; onSave?: (intent: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(intent);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useEffect(() => {
    if (!editing) return;
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [editing]);

  const start = () => { setDraft(intent); setEditing(true); };
  const save = () => {
    const next = draft.trim();
    if (next !== intent.trim()) onSave?.(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label htmlFor={id} className="sr-only">Intent of {name}</label>
        <Textarea
          id={id}
          ref={fieldRef}
          rows={4}
          maxLength={INTENT_MAX}
          value={draft}
          placeholder="What is this component for? What must it never do?"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(false); }
          }}
          className="text-body leading-5"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm">Save intent</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <span className="ml-auto text-meta text-fg-3">Ctrl+Enter saves</span>
        </div>
      </form>
    );
  }

  if (!intent.trim()) {
    return (
      <div>
        <p className="text-body text-fg-2">Nobody has said what this component is for. Agents will guess.</p>
        {onSave && (
          <Button variant="primary" size="md" className="mt-3" icon={<PencilLine size={14} strokeWidth={1.75} aria-hidden="true" />} onClick={start}>
            Write intent
          </Button>
        )}
      </div>
    );
  }

  return onSave ? (
    <button
      type="button"
      onClick={start}
      aria-label={`Edit intent: ${intent}`}
      className="focus-ring group -mx-2 -my-1 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left transition-colors duration-100 hover:bg-hover"
    >
      <span className="block max-w-[68ch] whitespace-pre-wrap text-body text-fg">{intent}</span>
      <span className="mt-1 inline-flex items-center gap-1 text-meta text-fg-3 group-hover:text-accent-text">
        <PencilLine size={12} strokeWidth={1.75} aria-hidden="true" /> Edit intent
      </span>
    </button>
  ) : (
    <p className="max-w-[68ch] whitespace-pre-wrap text-body text-fg">{intent}</p>
  );
}

/** What the contract lets this component depend on, as plain sentences. */
export function boundarySentences(
  name: string,
  summary: ComponentSummary,
  explanation: Pick<PathExplanation, 'allowedComponents' | 'forbiddenComponents' | 'forbiddenPackages'> | null,
  names: Map<string, string>,
): { may: string; mustNot: string } {
  const label = (id: string) => names.get(id) ?? id;
  const declared = summary.dependsOn.filter((item) => item.declared).map((item) => label(item.id));
  const allowOnly = explanation?.allowedComponents ?? null;
  const may = allowOnly
    ? allowOnly.length ? `${name} may only depend on ${sentenceList(allowOnly.map(label))}.` : `${name} may not depend on any other component.`
    : declared.length ? `${name} may depend on ${sentenceList(declared)}.` : `${name} has no declared dependencies.`;
  const forbidden = [...(explanation?.forbiddenComponents ?? []).map(label), ...(explanation?.forbiddenPackages ?? []).map((pkg) => `the ${pkg} package`)];
  const mustNot = forbidden.length ? `It must not depend on ${sentenceList(forbidden)}.` : 'No rule forbids it anything yet.';
  return { may, mustNot };
}

/** The inspector sheet: what the selected component is for, what it is tied to, and the evidence. */
export default function BlueprintInspector({
  componentId,
  session,
  edgeStatus,
  onSelectComponent,
  onOpenEdge,
  onSaveIntent,
  onVerify,
  onOpenManual,
  runtime,
  runtimeStale,
  onClose,
  onNavigateToSource,
  className,
}: BlueprintInspectorProps) {
  const summary = useMemo(() => session.workspace?.componentSummary(componentId) ?? null, [componentId, session.workspace]);
  const names = useMemo(
    () => new Map((session.blueprint?.components ?? []).map((component) => [component.id, component.name])),
    [session.blueprint],
  );
  const explanation = useMemo(() => {
    const file = summary?.files[0];
    if (!file || !session.workspace) return null;
    try {
      return session.workspace.explainPath(file);
    } catch {
      return null;
    }
  }, [session.workspace, summary]);
  if (!summary) return null;
  const { component } = summary;
  const boundaries = boundarySentences(component.name, summary, explanation, names);
  const secrets = summary.env.filter((entry) => entry.secretLike);

  return (
    <aside
      aria-label={`${component.name} details`}
      data-canvas-shortcuts="off"
      className={cx('studio nowheel flex animate-sheet flex-col overflow-hidden rounded-xl bg-raised text-fg shadow-elev-2', className)}
    >
      <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-4">
        <KindIcon kind={component.kind} size={18} className="mt-1 shrink-0 text-fg-3" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-title font-semibold text-fg">{component.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-small text-fg-3">
            <span>{component.kind}</span>
            {component.external && <span>· external</span>}
            {component.verified
              ? <Badge tone="neutral" title={`Verified by ${component.verified.by}`}>verified</Badge>
              : isDerived(component) ? <Badge tone="unknown" title="Guessed from code, not yet confirmed">derived</Badge> : null}
            {component.assurance && component.assurance !== 'unknown' && <Badge>{component.assurance}</Badge>}
          </p>
        </div>
        <IconButton label="Close details" shortcut="Esc" tooltipSide="bottom" onClick={onClose}>
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section aria-label="Intent" className="px-4 pb-4">
          <IntentField key={componentId} name={component.name} intent={component.intent ?? ''} onSave={onSaveIntent} />
          {component.description && <p className="mt-2 text-small text-fg-3">{component.description}</p>}
          {component.owners?.length ? <p className="mt-1 text-small text-fg-3">Owners: {component.owners.join(', ')}</p> : null}
        </section>

        {component.runtime && (
          <Section title="Runtime">
            <div className="flex items-center gap-2 text-small">
              <StatusGlyph tone={RUNTIME_STATUS[runtime?.state ?? 'unknown'].tone} label={RUNTIME_STATUS[runtime?.state ?? 'unknown'].label} />
              {runtime?.latencyMs !== undefined && <span className="tabular text-fg-3">{Math.round(runtime.latencyMs)} ms</span>}
              {runtimeStale && <Badge tone="unknown">stale</Badge>}
            </div>
            {runtime?.detail && <p className="mt-1 text-small text-fg-3">{runtime.detail}</p>}
            {runtime?.checkedAt && <p className="tabular mt-1 text-meta text-fg-3">as of {runtime.checkedAt.replace('T', ' ').slice(0, 16)}</p>}
          </Section>
        )}

        <Section title="Boundaries">
          <p className="text-small text-fg-2">{boundaries.may}</p>
          <p className="mt-1 text-small text-fg-2">{boundaries.mustNot}</p>
          <NeighborList title="Depends on" items={summary.dependsOn} names={names} pair={(other) => [componentId, other]} edgeStatus={edgeStatus} onSelectComponent={onSelectComponent} onOpenEdge={onOpenEdge} />
          <NeighborList title="Used by" items={summary.dependents} names={names} pair={(other) => [other, componentId]} edgeStatus={edgeStatus} onSelectComponent={onSelectComponent} onOpenEdge={onOpenEdge} />
        </Section>

        {summary.rules.length > 0 && (
          <Section title="Rules" count={summary.rules.length}>
            <ul className="space-y-2">
              {summary.rules.map((rule) => (
                <li key={rule.id} className="text-small text-fg-2">
                  <span className="mr-1.5 align-middle"><SeverityBadge severity={rule.severity} /></span>
                  {rule.summary}
                  {rule.reason && <span className="mt-1 block border-l-2 border-line-strong pl-2 text-fg-3">“{rule.reason}”</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(summary.invariants.length > 0 || summary.decisions.length > 0) && (
          <Section title="Invariants and decisions" count={summary.invariants.length + summary.decisions.length}>
            <ul className="list-disc space-y-1 pl-4 text-small text-fg-2">
              {summary.invariants.map((invariant) => <li key={invariant.id}>{invariant.statement}</li>)}
              {summary.decisions.map((decision) => <li key={decision.id}>{decision.title} <span className="text-fg-3">({decision.status})</span></li>)}
            </ul>
          </Section>
        )}

        {summary.env.length > 0 && (
          <Section title="Environment and secrets" count={summary.env.length}>
            {secrets.length > 0 && <p className="mb-2 text-small text-fg-2">Reads {secrets.length} secret-like {secrets.length === 1 ? 'variable' : 'variables'}. Values are never shown.</p>}
            <ul className="space-y-1.5">
              {summary.env.map((entry) => (
                <li key={entry.name} className="text-small">
                  <span className={cx('inline-flex items-center gap-1.5 font-mono text-meta', entry.secretLike ? 'text-warn' : 'text-fg-2')}>
                    {entry.secretLike && <KeyRound size={12} aria-hidden="true" />}
                    {entry.name}
                    {entry.secretLike && <span className="font-sans">secret-like</span>}
                  </span>
                  {entry.files[0] && <span className="block"><SourceLink target={{ path: entry.files[0] }} onNavigate={onNavigateToSource} /></span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Files" count={summary.fileCount}>
          {summary.fileCount === 0 ? (
            <p className="text-small text-fg-3">{component.external ? 'External systems own no files.' : 'No files match its paths.'}</p>
          ) : (
            <ul className="space-y-0.5">
              {summary.files.slice(0, FILE_LIMIT).map((file) => <li key={file}><SourceLink target={{ path: file }} onNavigate={onNavigateToSource} /></li>)}
              {summary.fileCount > FILE_LIMIT && <li className="text-meta text-fg-3">+{summary.fileCount - FILE_LIMIT} more</li>}
            </ul>
          )}
          <p className="mt-2 text-small text-fg-3">
            {summary.tests.length > 0
              ? `${summary.tests.length} test ${summary.tests.length === 1 ? 'file exercises' : 'files exercise'} it.`
              : component.external ? null : 'No test file exercises it.'}
          </p>
          {summary.externals.length > 0 && (
            <p className="mt-2 break-words font-mono text-meta leading-5 text-fg-3">
              <span className="font-sans">Packages: </span>
              {summary.externals.slice(0, 20).join(', ')}{summary.externals.length > 20 ? ` +${summary.externals.length - 20}` : ''}
            </p>
          )}
        </Section>

        {onVerify && (
          <Section title="Sign-off">
            <VerifyControl targetLabel={component.name} verified={component.verified} onVerify={onVerify} />
          </Section>
        )}
      </div>

      {onOpenManual && (
        <footer className="shrink-0 border-t border-line-subtle px-4 py-3">
          <Button variant="ghost" size="md" className="w-full justify-start" icon={<SlidersHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />} onClick={onOpenManual}>
            More: paths, kind, tags, delete…
          </Button>
        </footer>
      )}
    </aside>
  );
}
