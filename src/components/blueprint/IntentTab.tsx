'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

import type { Blueprint, BlueprintDecision, BlueprintInvariant, BlueprintIssue } from '@/blueprint';
import { cn } from '@/lib/utils';
import {
  compact,
  linesOf,
  previewRecipe,
  removeDecision,
  removeInvariant,
  slugify,
  uniqueId,
  upsertDecision,
  upsertInvariant,
  type Recipe,
} from './model';
import type { BlueprintSession } from './session';
import {
  ComponentChecklist,
  EmptyHint,
  IssueList,
  ProvenanceBadge,
  SectionTitle,
  VerifyControl,
  dangerButtonClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

const DECISION_STATUSES: BlueprintDecision['status'][] = ['proposed', 'accepted', 'superseded', 'deprecated'];

const STATUS_CLASS: Record<BlueprintDecision['status'], string> = {
  proposed: 'border-amber-500/40 text-amber-200',
  accepted: 'border-emerald-500/40 text-emerald-200',
  superseded: 'border-slate-600 text-slate-400',
  deprecated: 'border-slate-600 text-slate-400',
};

type ComponentOption = { id: string; name: string };

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100">
      <ArrowLeft size={13} aria-hidden="true" /> Invariants and decisions
    </button>
  );
}

function InvariantEditor({
  invariant,
  components,
  takenIds,
  onSave,
  onDelete,
  onVerify,
  onBack,
}: {
  invariant: BlueprintInvariant | null;
  components: ComponentOption[];
  takenIds: string[];
  onSave: (invariant: BlueprintInvariant) => BlueprintIssue[];
  onDelete: () => void;
  onVerify: (by: string, note?: string) => void;
  onBack: () => void;
}) {
  const [statement, setStatement] = useState(invariant?.statement ?? '');
  const [selected, setSelected] = useState<string[]>(invariant?.components ?? []);
  const [run, setRun] = useState(invariant?.check?.run ?? '');
  const [tests, setTests] = useState((invariant?.check?.tests ?? []).join('\n'));
  const [issues, setIssues] = useState<BlueprintIssue[]>([]);
  const ids = { statement: useId(), run: useId(), tests: useId() };

  const save = () => {
    if (!statement.trim()) {
      setIssues([{ path: 'statement', message: 'State the invariant in one sentence.' }]);
      return;
    }
    const check = compact({ run: run.trim() || undefined, tests: linesOf(tests) });
    const next: BlueprintInvariant = compact({
      ...(invariant ?? { id: uniqueId(slugify(statement, 'invariant').slice(0, 40), takenIds), provenance: { source: 'human' as const } }),
      statement: statement.trim(),
      components: selected,
      check: Object.keys(check).length ? check : undefined,
    });
    setIssues(onSave(next));
  };

  return (
    <form className="space-y-3 p-3" aria-label={invariant ? `Edit invariant ${invariant.id}` : 'New invariant'} onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        {invariant && <ProvenanceBadge fact={invariant} />}
      </div>
      <div>
        <label htmlFor={ids.statement} className="mb-1 block text-xs font-semibold text-slate-100">What must always be true?</label>
        <textarea id={ids.statement} autoFocus={!invariant} className={cn(inputClass, 'min-h-20 resize-y leading-5')} value={statement} maxLength={2000} onChange={(event) => setStatement(event.target.value)} placeholder="e.g. Every write to the ledger is idempotent." />
      </div>
      <ComponentChecklist legend="Applies to" components={components} value={selected} onChange={setSelected} />
      <div>
        <label htmlFor={ids.run} className={labelClass}>Check command (optional)</label>
        <input id={ids.run} className={cn(inputClass, 'font-mono')} spellCheck={false} value={run} maxLength={1000} onChange={(event) => setRun(event.target.value)} placeholder="npm test -- ledger" />
        <p className={hintClass}>Run by <code className="font-mono">rassam check --run-invariants</code>.</p>
      </div>
      <div>
        <label htmlFor={ids.tests} className={labelClass}>Tests that exercise it (one glob per line)</label>
        <textarea id={ids.tests} className={cn(inputClass, 'min-h-14 resize-y font-mono')} spellCheck={false} value={tests} onChange={(event) => setTests(event.target.value)} placeholder="src/ledger/**/*.test.ts" />
      </div>
      <IssueList issues={issues} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass}>{invariant ? 'Save invariant' : 'Add invariant'}</button>
        <button type="button" className={secondaryButtonClass} onClick={onBack}>Cancel</button>
      </div>
      {invariant && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <VerifyControl targetLabel={`invariant ${invariant.id}`} verified={invariant.verified} onVerify={onVerify} />
          <button type="button" className={dangerButtonClass} onClick={onDelete}><Trash2 size={12} aria-hidden="true" /> Delete invariant</button>
        </div>
      )}
    </form>
  );
}

function DecisionEditor({
  decision,
  components,
  takenIds,
  onSave,
  onDelete,
  onBack,
}: {
  decision: BlueprintDecision | null;
  components: ComponentOption[];
  takenIds: string[];
  onSave: (decision: BlueprintDecision) => BlueprintIssue[];
  onDelete: () => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(decision?.title ?? '');
  const [status, setStatus] = useState<BlueprintDecision['status']>(decision?.status ?? 'accepted');
  const [context, setContext] = useState(decision?.context ?? '');
  const [body, setBody] = useState(decision?.decision ?? '');
  const [consequences, setConsequences] = useState(decision?.consequences ?? '');
  const [selected, setSelected] = useState<string[]>(decision?.components ?? []);
  const [issues, setIssues] = useState<BlueprintIssue[]>([]);
  const ids = { title: useId(), status: useId(), context: useId(), decision: useId(), consequences: useId() };

  const save = () => {
    const missing: BlueprintIssue[] = [];
    if (!title.trim()) missing.push({ path: 'title', message: 'Give the decision a title.' });
    if (!body.trim()) missing.push({ path: 'decision', message: 'Write what was decided.' });
    if (missing.length) {
      setIssues(missing);
      return;
    }
    const next: BlueprintDecision = compact({
      ...(decision ?? {
        id: uniqueId(slugify(title, 'decision').slice(0, 40), takenIds),
        date: new Date().toISOString().slice(0, 10),
        provenance: { source: 'human' as const },
      }),
      title: title.trim(),
      status,
      context: context.trim() || undefined,
      decision: body.trim(),
      consequences: consequences.trim() || undefined,
      components: selected,
    });
    setIssues(onSave(next));
  };

  return (
    <form className="space-y-3 p-3" aria-label={decision ? `Edit decision ${decision.id}` : 'New decision'} onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        {decision && <ProvenanceBadge fact={decision} />}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label htmlFor={ids.title} className={labelClass}>Title</label>
          <input id={ids.title} autoFocus={!decision} className={inputClass} value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} placeholder="Use Postgres for the ledger" />
        </div>
        <div>
          <label htmlFor={ids.status} className={labelClass}>Status</label>
          <select id={ids.status} className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as BlueprintDecision['status'])}>
            {DECISION_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={ids.context} className={labelClass}>Context</label>
        <textarea id={ids.context} className={cn(inputClass, 'min-h-16 resize-y leading-5')} value={context} maxLength={8000} onChange={(event) => setContext(event.target.value)} placeholder="What forced a choice?" />
      </div>
      <div>
        <label htmlFor={ids.decision} className="mb-1 block text-xs font-semibold text-slate-100">Decision</label>
        <textarea id={ids.decision} className={cn(inputClass, 'min-h-20 resize-y leading-5')} value={body} maxLength={8000} onChange={(event) => setBody(event.target.value)} placeholder="What did we choose?" />
      </div>
      <div>
        <label htmlFor={ids.consequences} className={labelClass}>Consequences</label>
        <textarea id={ids.consequences} className={cn(inputClass, 'min-h-16 resize-y leading-5')} value={consequences} maxLength={8000} onChange={(event) => setConsequences(event.target.value)} placeholder="What does this make easier or harder?" />
      </div>
      <ComponentChecklist legend="Components" components={components} value={selected} onChange={setSelected} />
      <IssueList issues={issues} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass}>{decision ? 'Save decision' : 'Add decision'}</button>
        <button type="button" className={secondaryButtonClass} onClick={onBack}>Cancel</button>
      </div>
      {decision && (
        <div className="border-t border-slate-800 pt-3">
          <button type="button" className={dangerButtonClass} onClick={onDelete}><Trash2 size={12} aria-hidden="true" /> Delete decision</button>
        </div>
      )}
    </form>
  );
}

type Editing = { type: 'invariant' | 'decision'; id: string | null } | null;

export default function IntentTab({ session }: { session: BlueprintSession }) {
  const { blueprint } = session;
  const [editing, setEditing] = useState<Editing>(null);
  const components = useMemo(
    () => (blueprint?.components ?? []).map((component) => ({ id: component.id, name: component.name })),
    [blueprint],
  );
  if (!blueprint) return null;
  const names = new Map(components.map((component) => [component.id, component.name]));

  const commit = (bp: Blueprint, recipe: Recipe, label: string): BlueprintIssue[] => {
    const issues = previewRecipe(bp, recipe);
    if (issues.length) return issues;
    session.update(recipe, label);
    setEditing(null);
    return [];
  };

  if (editing?.type === 'invariant') {
    const invariant = blueprint.invariants.find((item) => item.id === editing.id) ?? null;
    return (
      <InvariantEditor
        key={editing.id ?? '__new__'}
        invariant={invariant}
        components={components}
        takenIds={blueprint.invariants.map((item) => item.id)}
        onBack={() => setEditing(null)}
        onSave={(next) => commit(blueprint, upsertInvariant(next), invariant ? `Edit invariant ${next.id}` : `Add invariant ${next.id}`)}
        onDelete={() => { if (invariant) commit(blueprint, removeInvariant(invariant.id), `Delete invariant ${invariant.id}`); }}
        onVerify={(by, note) => { if (invariant) session.verify(invariant.id, by, note); }}
      />
    );
  }

  if (editing?.type === 'decision') {
    const decision = blueprint.decisions.find((item) => item.id === editing.id) ?? null;
    return (
      <DecisionEditor
        key={editing.id ?? '__new__'}
        decision={decision}
        components={components}
        takenIds={blueprint.decisions.map((item) => item.id)}
        onBack={() => setEditing(null)}
        onSave={(next) => commit(blueprint, upsertDecision(next), decision ? `Edit decision ${next.id}` : `Add decision ${next.id}`)}
        onDelete={() => { if (decision) commit(blueprint, removeDecision(decision.id), `Delete decision ${decision.id}`); }}
      />
    );
  }

  const scope = (ids: string[] | undefined) => (ids?.length ? ids.map((id) => names.get(id) ?? id).join(', ') : 'whole system');

  return (
    <div className="space-y-5 p-3">
      <section aria-label="Invariants" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle count={blueprint.invariants.length}>Invariants</SectionTitle>
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing({ type: 'invariant', id: null })}>
            <Plus size={13} aria-hidden="true" /> Add invariant
          </button>
        </div>
        {blueprint.invariants.length === 0 ? (
          <EmptyHint>An invariant is a sentence that must stay true whatever an agent changes. Nobody can derive it from code.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {blueprint.invariants.map((invariant) => (
              <li key={invariant.id}>
                <button type="button" onClick={() => setEditing({ type: 'invariant', id: invariant.id })} aria-label={`Edit invariant ${invariant.id}`} className="w-full rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-left hover:bg-slate-800/60">
                  <span className="block text-xs leading-5 text-slate-100">{invariant.statement}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <ProvenanceBadge fact={invariant} />
                    <span>{scope(invariant.components)}</span>
                    <span className={invariant.check?.run || invariant.check?.tests?.length ? 'text-emerald-300' : 'text-amber-200'}>
                      · {invariant.check?.run ? 'checked by command' : invariant.check?.tests?.length ? 'covered by tests' : 'not checked'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Decisions" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle count={blueprint.decisions.length}>Decisions</SectionTitle>
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing({ type: 'decision', id: null })}>
            <Plus size={13} aria-hidden="true" /> Add decision
          </button>
        </div>
        {blueprint.decisions.length === 0 ? (
          <EmptyHint>Record why the system is shaped this way, so the next agent does not undo it.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {blueprint.decisions.map((decision) => (
              <li key={decision.id}>
                <button type="button" onClick={() => setEditing({ type: 'decision', id: decision.id })} aria-label={`Edit decision ${decision.id}`} className="w-full rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-left hover:bg-slate-800/60">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium leading-5 text-slate-100">{decision.title}</span>
                    <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px]', STATUS_CLASS[decision.status])}>{decision.status}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-slate-400">{decision.decision}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">{decision.date ? `${decision.date} · ` : ''}{scope(decision.components)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
