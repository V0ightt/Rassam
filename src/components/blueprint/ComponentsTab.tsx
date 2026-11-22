'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, PencilLine, Plus, Trash2 } from 'lucide-react';

import { assuranceSchema, type Blueprint, type BlueprintComponent, type BlueprintIssue, type Workspace } from '@/blueprint';
import { cn } from '@/lib/utils';
import { KindIcon, kindColors, kindOptions } from './kinds';
import {
  compact,
  countGlobMatches,
  firstLine,
  linesOf,
  listOf,
  previewRecipe,
  removalImpact,
  removeComponent,
  slugify,
  uniqueId,
  upsertComponent,
} from './model';
import type { BlueprintSession } from './session';
import type { BlueprintUi } from './useBlueprintUi';
import {
  EmptyHint,
  IssueList,
  ProvenanceBadge,
  VerifyControl,
  dangerButtonClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

interface ComponentForm {
  name: string;
  kind: string;
  description: string;
  intent: string;
  owners: string;
  tags: string;
  assurance: string;
  paths: string;
  external: boolean;
}

function toForm(component: BlueprintComponent): ComponentForm {
  return {
    name: component.name,
    kind: component.kind,
    description: component.description ?? '',
    intent: component.intent ?? '',
    owners: (component.owners ?? []).join(', '),
    tags: (component.tags ?? []).join(', '),
    assurance: component.assurance ?? 'unknown',
    paths: component.paths.join('\n'),
    external: Boolean(component.external),
  };
}

function fromForm(base: BlueprintComponent, form: ComponentForm): BlueprintComponent {
  const assurance = assuranceSchema.safeParse(form.assurance);
  return compact({
    ...base,
    name: form.name.trim(),
    kind: form.kind,
    description: form.description.trim() || undefined,
    intent: form.intent.trim() ? form.intent : undefined,
    owners: listOf(form.owners),
    tags: listOf(form.tags),
    assurance: assurance.success && assurance.data !== 'unknown' ? assurance.data : undefined,
    paths: linesOf(form.paths),
    external: form.external || undefined,
  }, ['paths']);
}

const BLANK: BlueprintComponent = { id: '', name: '', kind: 'default', paths: [], provenance: { source: 'human' } };

function ComponentEditor({
  component,
  isNew,
  blueprint,
  workspace,
  focusIntentToken,
  onSave,
  onDelete,
  onVerify,
  onBack,
}: {
  component: BlueprintComponent;
  isNew: boolean;
  blueprint: Blueprint;
  workspace: Workspace | null;
  focusIntentToken: number;
  onSave: (component: BlueprintComponent) => BlueprintIssue[];
  onDelete: () => void;
  onVerify: (by: string, note?: string) => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState(() => toForm(component));
  const signature = JSON.stringify(component);
  const [source, setSource] = useState(signature);
  const [issues, setIssues] = useState<BlueprintIssue[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const intentRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), kind: useId(), description: useId(), intent: useId(), owners: useId(), tags: useId(), assurance: useId(), paths: useId(), pathsHint: useId() };

  // The draft changed underneath the form (save, undo, verify): show what is stored.
  if (source !== signature) {
    setSource(signature);
    setForm(toForm(component));
    setIssues([]);
    setConfirmDelete(false);
  }

  useEffect(() => {
    if (isNew) nameRef.current?.focus();
    else if (focusIntentToken > 0) intentRef.current?.focus();
  }, [focusIntentToken, isNew]);

  const set = <K extends keyof ComponentForm>(key: K, value: ComponentForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const stored = useMemo(() => toForm(component), [component]);
  const dirty = isNew || JSON.stringify(stored) !== JSON.stringify(form);
  const summary = useMemo(() => (isNew ? null : workspace?.componentSummary(component.id) ?? null), [component.id, isNew, workspace]);
  const pathsChanged = isNew || stored.paths !== form.paths;
  const patterns = useMemo(() => linesOf(form.paths), [form.paths]);
  const matchCount = pathsChanged || !summary
    ? countGlobMatches(workspace?.fileGraph.files ?? [], patterns, component.exclude)
    : summary.fileCount;
  const impact = useMemo(() => (isNew ? null : removalImpact(blueprint, component.id)), [blueprint, component.id, isNew]);
  const missingIntent = !form.intent.trim();

  const save = () => {
    if (!form.name.trim()) {
      setIssues([{ path: 'name', message: 'Give the component a name.' }]);
      nameRef.current?.focus();
      return;
    }
    const base = isNew
      ? { ...component, id: uniqueId(slugify(form.name, 'component'), blueprint.components.map((item) => item.id)) }
      : component;
    setIssues(onSave(fromForm(base, form)));
  };

  return (
    <form
      className="space-y-3 p-3"
      aria-label={isNew ? 'New component' : `Edit ${component.name}`}
      onSubmit={(event) => { event.preventDefault(); save(); }}
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100">
          <ArrowLeft size={13} aria-hidden="true" /> All components
        </button>
        {!isNew && <ProvenanceBadge fact={component} />}
      </div>

      <div className={cn('rounded-lg border p-2.5', missingIntent ? 'border-amber-500/50 bg-amber-500/5' : 'border-cyan-500/30 bg-cyan-500/5')}>
        <label htmlFor={ids.intent} className="mb-1 block text-xs font-semibold text-slate-100">
          Intent {missingIntent && <span className="ml-1 font-normal text-amber-200">— not written yet</span>}
        </label>
        <textarea
          id={ids.intent}
          ref={intentRef}
          className={cn(inputClass, 'min-h-28 resize-y leading-5')}
          value={form.intent}
          maxLength={8000}
          onChange={(event) => set('intent', event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
          }}
          placeholder={'What is this component for? What must it never do?\nCode cannot tell an agent this. You can.'}
        />
        <p className={hintClass}>Purpose, responsibilities and boundaries. Agents read this before they touch the component. Ctrl+Enter saves.</p>
      </div>

      <div>
        <label htmlFor={ids.name} className={labelClass}>Name</label>
        <input id={ids.name} ref={nameRef} className={inputClass} value={form.name} maxLength={200} onChange={(event) => set('name', event.target.value)} />
        {!isNew && <p className={hintClass}>ID <code className="font-mono text-slate-400">{component.id}</code></p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.kind} className={labelClass}>Kind</label>
          <select id={ids.kind} className={inputClass} value={form.kind} onChange={(event) => set('kind', event.target.value)}>
            {kindOptions(component.kind).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={ids.assurance} className={labelClass}>Assurance</label>
          <select id={ids.assurance} className={inputClass} value={form.assurance} onChange={(event) => set('assurance', event.target.value)}>
            {assuranceSchema.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={ids.description} className={labelClass}>Description</label>
        <input id={ids.description} className={inputClass} value={form.description} maxLength={2000} onChange={(event) => set('description', event.target.value)} placeholder="One line: what it is" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.owners} className={labelClass}>Owners</label>
          <input id={ids.owners} className={inputClass} value={form.owners} onChange={(event) => set('owners', event.target.value)} placeholder="@team, name" />
        </div>
        <div>
          <label htmlFor={ids.tags} className={labelClass}>Tags</label>
          <input id={ids.tags} className={inputClass} value={form.tags} onChange={(event) => set('tags', event.target.value)} placeholder="core, pii" />
        </div>
      </div>

      <div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
          <input type="checkbox" className="accent-cyan-400" checked={form.external} onChange={(event) => set('external', event.target.checked)} />
          External system (outside this repository)
        </label>
      </div>

      <div>
        <label htmlFor={ids.paths} className={labelClass}>Paths (one glob per line)</label>
        <textarea
          id={ids.paths}
          aria-describedby={ids.pathsHint}
          className={cn(inputClass, 'min-h-16 resize-y font-mono')}
          value={form.paths}
          spellCheck={false}
          onChange={(event) => set('paths', event.target.value)}
          placeholder={form.external ? 'External systems own no files' : 'src/lib/billing/**'}
        />
        <p id={ids.pathsHint} className={cn(hintClass, !form.external && matchCount === 0 && 'text-amber-200')} aria-live="polite">
          matches {matchCount} {matchCount === 1 ? 'file' : 'files'}
          {pathsChanged && !isNew ? ' (preview, save to apply)' : ''}
        </p>
      </div>

      <IssueList issues={issues} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={!dirty}>{isNew ? 'Add component' : 'Save component'}</button>
        {isNew && <button type="button" className={secondaryButtonClass} onClick={onBack}>Cancel</button>}
      </div>

      {!isNew && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          {dirty
            ? <p className={hintClass}>Save your changes before signing off.</p>
            : <VerifyControl targetLabel={component.name} verified={component.verified} onVerify={onVerify} />}

          {summary && (summary.dependsOn.length > 0 || summary.dependents.length > 0) && (
            <p className="text-xs leading-4 text-slate-400">
              Depends on {summary.dependsOn.length} · used by {summary.dependents.length} · {summary.rules.length} {summary.rules.length === 1 ? 'rule' : 'rules'}
            </p>
          )}

          {confirmDelete && impact ? (
            <div role="alertdialog" aria-label={`Delete ${component.name}`} className="space-y-2 rounded-md border border-red-500/40 bg-red-500/5 p-2 text-xs leading-4 text-red-100">
              <p>
                Delete <strong>{component.name}</strong>? This also removes {impact.dependencies} declared {impact.dependencies === 1 ? 'dependency' : 'dependencies'}
                {impact.rulesDropped.length > 0 && <>, drops {impact.rulesDropped.length === 1 ? 'rule' : 'rules'} {impact.rulesDropped.join(', ')}</>}
                {impact.rulesEdited.length > 0 && <>, and edits {impact.rulesEdited.join(', ')}</>}. Undo restores it.
              </p>
              <div className="flex gap-2">
                <button type="button" className={dangerButtonClass} onClick={onDelete}>Delete component</button>
                <button type="button" className={secondaryButtonClass} onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            </div>
          ) : (
            <button type="button" className={dangerButtonClass} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={12} aria-hidden="true" /> Delete component…
            </button>
          )}
        </div>
      )}
    </form>
  );
}

export default function ComponentsTab({ session, ui }: { session: BlueprintSession; ui: BlueprintUi }) {
  const { blueprint, workspace } = session;
  const [creating, setCreating] = useState(false);
  const fileCounts = useMemo(
    () => new Map((workspace?.overview().components ?? []).map((component) => [component.id, component.fileCount])),
    [workspace],
  );
  if (!blueprint) return null;

  const selected = blueprint.components.find((component) => component.id === ui.selectedComponentId) ?? null;

  if (creating || selected) {
    const component = creating ? BLANK : selected!;
    return (
      <ComponentEditor
        key={creating ? '__new__' : component.id}
        component={component}
        isNew={creating}
        blueprint={blueprint}
        workspace={workspace}
        focusIntentToken={ui.intentFocusToken}
        onBack={() => { setCreating(false); ui.selectComponent(null); }}
        onSave={(next) => {
          const recipe = upsertComponent(next);
          const issues = previewRecipe(blueprint, recipe);
          if (issues.length) return issues;
          session.update(recipe, creating ? `Add component ${next.name}` : `Edit ${next.name}`);
          if (creating) {
            setCreating(false);
            ui.selectComponent(next.id, { focusIntent: !next.intent });
            ui.focusComponents([next.id]);
          }
          return [];
        }}
        onDelete={() => {
          session.update(removeComponent(component.id), `Delete ${component.name}`);
          ui.selectComponent(null);
        }}
        onVerify={(by, note) => session.verify(component.id, by, note)}
      />
    );
  }

  const withoutIntent = blueprint.components.filter((component) => !component.intent?.trim()).length;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs leading-4 text-slate-400">
          {blueprint.components.length} {blueprint.components.length === 1 ? 'component' : 'components'}
          {withoutIntent > 0 && <span className="text-amber-200"> · {withoutIntent} without intent</span>}
        </p>
        <button type="button" className={secondaryButtonClass} onClick={() => setCreating(true)}>
          <Plus size={13} aria-hidden="true" /> Add component
        </button>
      </div>

      {blueprint.components.length === 0 ? (
        <EmptyHint>No components yet. Add the first one and say what it is for.</EmptyHint>
      ) : (
        <ul className="space-y-1.5" aria-label="Components">
          {blueprint.components.map((component) => {
            const intent = firstLine(component.intent);
            const fileCount = fileCounts.get(component.id) ?? 0;
            return (
              <li key={component.id} className="rounded-lg border border-slate-800 bg-slate-950/60">
                <button
                  type="button"
                  onClick={() => ui.selectComponent(component.id)}
                  aria-label={`Edit ${component.name}`}
                  className="flex w-full items-start gap-2 rounded-t-lg p-2 text-left hover:bg-slate-800/60"
                >
                  <KindIcon kind={component.kind} size={15} className={cn('mt-0.5 shrink-0', kindColors(component.kind).icon)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-slate-100">{component.name}</span>
                      <ProvenanceBadge fact={component} />
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {component.kind} · {component.external ? 'external' : `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`}
                    </span>
                  </span>
                </button>
                <div className="px-2 pb-2 pl-[31px]">
                  {intent ? (
                    <p className="line-clamp-2 text-xs leading-4 text-slate-300">{intent}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => ui.selectComponent(component.id, { focusIntent: true })}
                      aria-label={`Write intent for ${component.name}`}
                      className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-400/10 px-2.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/20"
                    >
                      <PencilLine size={12} aria-hidden="true" /> Write intent
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
