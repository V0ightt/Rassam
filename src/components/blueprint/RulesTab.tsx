'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

import {
  ruleSeverity,
  summarizeRule,
  type Blueprint,
  type BlueprintIssue,
  type BlueprintRule,
  type RuleKind,
  type Selector,
  type Severity,
} from '@/blueprint';
import { cn } from '@/lib/utils';
import {
  entriesToSelector,
  linesOf,
  listOf,
  previewRecipe,
  removeRule,
  selectorToEntries,
  slugify,
  uniqueId,
  upsertRule,
} from './model';
import SelectorPicker from './SelectorPicker';
import type { BlueprintSession } from './session';
import type { BlueprintUi } from './useBlueprintUi';
import {
  EmptyHint,
  IssueList,
  ProvenanceBadge,
  SeverityBadge,
  VerifyControl,
  dangerButtonClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

const RULE_KINDS: Array<{ kind: RuleKind; label: string; help: string }> = [
  { kind: 'forbid', label: 'Forbid', help: 'No dependency may go from one set to another.' },
  { kind: 'allow-only', label: 'Allow only', help: 'A set may depend only on itself and the listed targets.' },
  { kind: 'layers', label: 'Layers', help: 'Ordered top to bottom. A layer may use the layers below it, never above.' },
  { kind: 'no-cycles', label: 'No cycles', help: 'Components must not depend on each other in a loop.' },
  { kind: 'protect', label: 'Protect paths', help: 'Changes to these paths always need a human review.' },
  { kind: 'secret-access', label: 'Secret access', help: 'Only the listed components may read these secrets.' },
];

type SeverityChoice = Severity | 'default';

interface RuleForm {
  id: string;
  kind: RuleKind;
  severity: SeverityChoice;
  reason: string;
  from: string[];
  to: string[];
  layers: string[][];
  scope: string[];
  paths: string;
  secrets: string;
  allow: string[];
}

function toForm(rule: BlueprintRule | null): RuleForm {
  const form: RuleForm = {
    id: rule?.id ?? '',
    kind: rule?.kind ?? 'forbid',
    severity: rule ? rule.severity ?? 'default' : 'error',
    reason: rule?.reason ?? '',
    from: [],
    to: [],
    layers: [[], []],
    scope: [],
    paths: '',
    secrets: '',
    allow: [],
  };
  if (!rule) return form;
  switch (rule.kind) {
    case 'forbid':
    case 'allow-only':
      return { ...form, from: selectorToEntries(rule.from), to: selectorToEntries(rule.to) };
    case 'layers':
      return { ...form, layers: rule.layers.map((layer) => selectorToEntries(layer)) };
    case 'no-cycles':
      return { ...form, scope: selectorToEntries(rule.scope) };
    case 'protect':
      return { ...form, paths: rule.paths.join('\n') };
    case 'secret-access':
      return { ...form, secrets: rule.secrets.join('\n'), allow: selectorToEntries(rule.allow) };
  }
}

function autoId(form: RuleForm): string {
  const part = (entries: string[]) => slugify(entries.slice(0, 2).join('-'), 'any');
  switch (form.kind) {
    case 'forbid':
      return `forbid-${part(form.from)}-${part(form.to)}`;
    case 'allow-only':
      return `allow-only-${part(form.from)}`;
    case 'layers':
      return 'layers';
    case 'no-cycles':
      return form.scope.length ? `no-cycles-${part(form.scope)}` : 'no-cycles';
    case 'protect':
      return `protect-${part(linesOf(form.paths))}`;
    case 'secret-access':
      return `secret-access-${part(listOf(form.secrets))}`;
  }
}

/** Turn the form into a rule, or explain what is missing. */
export function buildRule(form: RuleForm, base: BlueprintRule | null, takenIds: string[]): { rule: BlueprintRule } | { issues: BlueprintIssue[] } {
  const issues: BlueprintIssue[] = [];
  const need = (selector: Selector | undefined, path: string, what: string): Selector => {
    if (!selector) issues.push({ path, message: `Choose ${what}.` });
    return selector ?? '*';
  };
  const id = base?.id ?? uniqueId(slugify(form.id.trim() || autoId(form), 'rule').slice(0, 70), takenIds);
  const shared = {
    id,
    severity: form.severity === 'default' ? undefined : form.severity,
    reason: form.reason.trim() || undefined,
    provenance: base ? base.provenance : { source: 'human' as const },
    verified: base?.verified,
  };
  const includeTypeOnly = base && 'includeTypeOnly' in base ? base.includeTypeOnly : undefined;
  let rule: BlueprintRule;
  switch (form.kind) {
    case 'forbid':
    case 'allow-only':
      rule = {
        ...shared,
        kind: form.kind,
        from: need(entriesToSelector(form.from), 'from', 'what the rule applies to'),
        to: need(entriesToSelector(form.to), 'to', form.kind === 'forbid' ? 'what must not be depended on' : 'what may be depended on'),
        includeTypeOnly,
      };
      break;
    case 'layers': {
      const layers = form.layers.map((layer) => entriesToSelector(layer)).filter((layer): layer is Selector => layer !== undefined);
      if (layers.length < 2) issues.push({ path: 'layers', message: 'A layering needs at least two non-empty layers.' });
      rule = { ...shared, kind: 'layers', layers, includeTypeOnly };
      break;
    }
    case 'no-cycles':
      rule = { ...shared, kind: 'no-cycles', scope: entriesToSelector(form.scope), includeTypeOnly };
      break;
    case 'protect': {
      const paths = linesOf(form.paths);
      if (!paths.length) issues.push({ path: 'paths', message: 'List at least one path glob to protect.' });
      rule = { ...shared, kind: 'protect', paths };
      break;
    }
    case 'secret-access': {
      const secrets = listOf(form.secrets);
      if (!secrets.length) issues.push({ path: 'secrets', message: 'Name at least one secret or environment variable.' });
      rule = { ...shared, kind: 'secret-access', secrets, allow: need(entriesToSelector(form.allow), 'allow', 'who may read the secrets') };
      break;
    }
  }
  if (issues.length) return { issues };
  // Strip undefined keys so the saved JSON has no noise.
  return { rule: JSON.parse(JSON.stringify(rule)) as BlueprintRule };
}

function RuleEditor({
  rule,
  blueprint,
  focusReasonToken,
  onSave,
  onDelete,
  onVerify,
  onBack,
}: {
  rule: BlueprintRule | null;
  blueprint: Blueprint;
  focusReasonToken: number;
  onSave: (rule: BlueprintRule) => BlueprintIssue[];
  onDelete: () => void;
  onVerify: (by: string, note?: string) => void;
  onBack: () => void;
}) {
  const signature = JSON.stringify(rule);
  const [source, setSource] = useState(signature);
  const [form, setForm] = useState(() => toForm(rule));
  const [issues, setIssues] = useState<BlueprintIssue[]>([]);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const ids = { id: useId(), kind: useId(), severity: useId(), reason: useId(), paths: useId(), secrets: useId() };
  const isNew = rule === null;

  if (source !== signature) {
    setSource(signature);
    setForm(toForm(rule));
    setIssues([]);
  }

  useEffect(() => {
    if (focusReasonToken > 0) reasonRef.current?.focus();
  }, [focusReasonToken]);

  const components = useMemo(() => blueprint.components.map((component) => ({ id: component.id, name: component.name })), [blueprint.components]);
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const dirty = isNew || JSON.stringify(toForm(rule)) !== JSON.stringify(form);
  const kindInfo = RULE_KINDS.find((item) => item.kind === form.kind)!;

  const save = () => {
    const built = buildRule(form, rule, blueprint.rules.map((item) => item.id));
    setIssues('issues' in built ? built.issues : onSave(built.rule));
  };

  return (
    <form
      className="space-y-3 p-3"
      aria-label={isNew ? 'New rule' : `Edit rule ${rule.id}`}
      onSubmit={(event) => { event.preventDefault(); save(); }}
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100">
          <ArrowLeft size={13} aria-hidden="true" /> All rules
        </button>
        {rule && <ProvenanceBadge fact={rule} />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.kind} className={labelClass}>Kind</label>
          <select id={ids.kind} className={inputClass} value={form.kind} disabled={!isNew} onChange={(event) => set('kind', event.target.value as RuleKind)}>
            {RULE_KINDS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={ids.severity} className={labelClass}>Severity</label>
          <select id={ids.severity} className={inputClass} value={form.severity} onChange={(event) => set('severity', event.target.value as SeverityChoice)}>
            <option value="error">error (blocks)</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
            <option value="default">default for this kind</option>
          </select>
        </div>
      </div>
      <p className={hintClass}>{kindInfo.help}</p>

      {(form.kind === 'forbid' || form.kind === 'allow-only') && (
        <>
          <SelectorPicker legend="From" hint="The code this rule constrains." components={components} value={form.from} onChange={(next) => set('from', next)} />
          <SelectorPicker
            legend={form.kind === 'forbid' ? 'Must not depend on' : 'May only depend on'}
            hint={form.kind === 'allow-only' ? 'External packages are restricted only when you list a package: selector.' : undefined}
            components={components}
            value={form.to}
            onChange={(next) => set('to', next)}
          />
        </>
      )}

      {form.kind === 'layers' && (
        <div className="space-y-2">
          {form.layers.map((layer, index) => (
            <div key={index} className="space-y-1">
              <SelectorPicker
                legend={`Layer ${index + 1}${index === 0 ? ' (top)' : index === form.layers.length - 1 ? ' (bottom)' : ''}`}
                components={components}
                value={layer}
                onChange={(next) => set('layers', form.layers.map((item, position) => (position === index ? next : item)))}
              />
              {form.layers.length > 2 && (
                <button type="button" className="text-xs text-slate-400 hover:text-red-200" onClick={() => set('layers', form.layers.filter((_, position) => position !== index))}>
                  Remove layer {index + 1}
                </button>
              )}
            </div>
          ))}
          <button type="button" className={secondaryButtonClass} disabled={form.layers.length >= 20} onClick={() => set('layers', [...form.layers, []])}>
            <Plus size={12} aria-hidden="true" /> Add layer
          </button>
        </div>
      )}

      {form.kind === 'no-cycles' && (
        <SelectorPicker legend="Scope (optional)" hint="Leave empty to forbid cycles everywhere." components={components} value={form.scope} onChange={(next) => set('scope', next)} />
      )}

      {form.kind === 'protect' && (
        <div>
          <label htmlFor={ids.paths} className={labelClass}>Protected paths (one glob per line)</label>
          <textarea id={ids.paths} className={cn(inputClass, 'min-h-16 resize-y font-mono')} spellCheck={false} value={form.paths} onChange={(event) => set('paths', event.target.value)} placeholder={'migrations/**\n.github/workflows/**'} />
        </div>
      )}

      {form.kind === 'secret-access' && (
        <>
          <div>
            <label htmlFor={ids.secrets} className={labelClass}>Secrets (names or globs, one per line)</label>
            <textarea id={ids.secrets} className={cn(inputClass, 'min-h-14 resize-y font-mono')} spellCheck={false} value={form.secrets} onChange={(event) => set('secrets', event.target.value)} placeholder={'STRIPE_*\nDATABASE_URL'} />
          </div>
          <SelectorPicker legend="May be read by" components={components} value={form.allow} onChange={(next) => set('allow', next)} />
        </>
      )}

      <div className={cn('rounded-lg border p-2.5', form.reason.trim() ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-amber-500/50 bg-amber-500/5')}>
        <label htmlFor={ids.reason} className="mb-1 block text-xs font-semibold text-slate-100">Why does this rule exist?</label>
        <textarea
          id={ids.reason}
          ref={reasonRef}
          className={cn(inputClass, 'min-h-20 resize-y leading-5')}
          value={form.reason}
          maxLength={2000}
          onChange={(event) => set('reason', event.target.value)}
          placeholder="e.g. Billing must stay deployable without the admin UI."
        />
        <p className={hintClass}>Agents and reviewers see this sentence every time the rule fires. A rule without a reason gets argued with.</p>
      </div>

      {isNew && (
        <div>
          <label htmlFor={ids.id} className={labelClass}>Rule ID (optional)</label>
          <input id={ids.id} className={cn(inputClass, 'font-mono')} value={form.id} spellCheck={false} maxLength={70} onChange={(event) => set('id', event.target.value)} placeholder={autoId(form)} />
        </div>
      )}

      <IssueList issues={issues} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={!dirty}>{isNew ? 'Add rule' : 'Save rule'}</button>
        {isNew && <button type="button" className={secondaryButtonClass} onClick={onBack}>Cancel</button>}
      </div>

      {rule && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          {dirty
            ? <p className={hintClass}>Save your changes before signing off.</p>
            : <VerifyControl targetLabel={`rule ${rule.id}`} verified={rule.verified} onVerify={onVerify} />}
          <button type="button" className={dangerButtonClass} onClick={onDelete}>
            <Trash2 size={12} aria-hidden="true" /> Delete rule
          </button>
        </div>
      )}
    </form>
  );
}

export default function RulesTab({ session, ui }: { session: BlueprintSession; ui: BlueprintUi }) {
  const { blueprint } = session;
  const [creating, setCreating] = useState(false);
  if (!blueprint) return null;

  const editing = blueprint.rules.find((rule) => rule.id === ui.editingRuleId) ?? null;

  if (creating || editing) {
    return (
      <RuleEditor
        key={creating ? '__new__' : editing!.id}
        rule={creating ? null : editing}
        blueprint={blueprint}
        focusReasonToken={creating ? 0 : ui.ruleFocusToken}
        onBack={() => { setCreating(false); ui.editRule(null); }}
        onSave={(rule) => {
          const recipe = upsertRule(rule);
          const issues = previewRecipe(blueprint, recipe);
          if (issues.length) return issues;
          session.update(recipe, creating ? `Add rule ${rule.id}` : `Edit rule ${rule.id}`);
          setCreating(false);
          ui.editRule(null);
          return [];
        }}
        onDelete={() => {
          if (editing) session.update(removeRule(editing.id), `Delete rule ${editing.id}`);
          ui.editRule(null);
        }}
        onVerify={(by, note) => { if (editing) session.verify(editing.id, by, note); }}
      />
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">{blueprint.rules.length} {blueprint.rules.length === 1 ? 'rule' : 'rules'}</p>
        <button type="button" className={secondaryButtonClass} onClick={() => setCreating(true)}>
          <Plus size={13} aria-hidden="true" /> Add rule
        </button>
      </div>
      {blueprint.rules.length === 0 ? (
        <EmptyHint>No rules yet. Draw an edge between two components on the Blueprint canvas and choose “Forbid dependency”, or add a rule here.</EmptyHint>
      ) : (
        <ul className="space-y-1.5" aria-label="Rules">
          {blueprint.rules.map((rule) => (
            <li key={rule.id}>
              <button
                type="button"
                onClick={() => ui.editRule(rule.id)}
                aria-label={`Edit rule ${rule.id}`}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-left hover:bg-slate-800/60"
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={ruleSeverity(rule)} />
                  <ProvenanceBadge fact={rule} />
                  <code className="truncate font-mono text-xs text-slate-500">{rule.id}</code>
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-100">{summarizeRule(rule)}</span>
                {rule.reason?.trim() ? (
                  <span className="mt-1 block border-l-2 border-cyan-400/60 pl-2 text-xs italic leading-4 text-slate-300">“{rule.reason}”</span>
                ) : (
                  <span className="mt-1 block text-xs font-medium text-amber-200">No reason yet. Say why this rule exists.</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
