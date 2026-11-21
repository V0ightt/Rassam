// Pure helpers behind the blueprint UI: verdicts, attention ranking and the
// recipes that turn a gesture ("forbid this edge") into a new blueprint.

import {
  matchesAny,
  parseBlueprint,
  selectorComponentRefs,
  type Blueprint,
  type BlueprintComponent,
  type BlueprintDecision,
  type BlueprintInvariant,
  type BlueprintIssue,
  type BlueprintRule,
  type CheckReport,
  type Finding,
  type FindingKind,
  type Selector,
} from '@/blueprint';

export type Recipe = (draft: Blueprint) => Blueprint;

export const ATTENTION_LIMIT = 5;
export const HUMAN_NUDGE_THRESHOLD = 0.5;

export type Verdict = 'pass' | 'warn' | 'fail';

export function reportVerdict(report: CheckReport | null): Verdict | null {
  if (!report) return null;
  if (report.findings.some((finding) => finding.severity === 'error')) return 'fail';
  if (report.findings.some((finding) => finding.severity === 'warning')) return 'warn';
  return 'pass';
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: 'Pass',
  warn: 'Needs review',
  fail: 'Failing',
};

export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  'invalid-blueprint': 'Invalid blueprint',
  'forbidden-dependency': 'Forbidden dependencies',
  'allow-only-violation': 'Allow-only violations',
  'layer-violation': 'Layer violations',
  'dependency-cycle': 'Dependency cycles',
  'undeclared-dependency': 'Undeclared dependencies',
  'unmapped-file': 'Unmapped files',
  'empty-component': 'Empty components',
  'protected-path': 'Protected paths',
  'verification-weakened': 'Weakened verification',
  'contract-weakened': 'Weakened contract',
  'contract-changed': 'Contract changes',
  'secret-access': 'Secret access',
  'inline-secret': 'Inline secrets',
  'agent-permission-change': 'Agent permission changes',
  'assurance-drift': 'Assurance drift',
  'stale-verification': 'Stale verification',
  'invariant-at-risk': 'Invariants at risk',
  'invariant-failed': 'Failed invariants',
};

export interface AttentionSplit {
  top: Finding[];
  rest: Array<{ kind: FindingKind; label: string; findings: Finding[] }>;
}

/** The report is already sorted by score; the first five are the whole "needs attention" list. */
export function splitAttention(report: CheckReport | null, limit = ATTENTION_LIMIT): AttentionSplit {
  const findings = report?.findings ?? [];
  const groups = new Map<FindingKind, Finding[]>();
  for (const finding of findings.slice(limit)) {
    const group = groups.get(finding.kind) ?? [];
    group.push(finding);
    groups.set(finding.kind, group);
  }
  return {
    top: findings.slice(0, limit),
    rest: [...groups.entries()]
      .map(([kind, items]) => ({ kind, label: FINDING_KIND_LABEL[kind] ?? kind, findings: items }))
      .sort((left, right) => right.findings.length - left.findings.length || left.label.localeCompare(right.label)),
  };
}

export function firstLine(value: string | undefined | null): string | null {
  const line = value?.split(/\r?\n/).map((part) => part.trim()).find(Boolean);
  return line || null;
}

export function isDerived(fact: { provenance?: { source: string }; verified?: unknown }): boolean {
  return !fact.verified && Boolean(fact.provenance) && fact.provenance?.source !== 'human';
}

export function slugify(value: string, fallback = 'item'): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base.slice(0, 74)}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 60)}-${Date.now()}`;
}

export function linesOf(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function listOf(value: string): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

/** Preview how many known files a set of globs would claim (ignores overlap between components). */
export function countGlobMatches(files: readonly string[], patterns: readonly string[], exclude?: readonly string[]): number {
  if (!patterns.length) return 0;
  let count = 0;
  for (const file of files) {
    try {
      if (matchesAny(file, patterns) && !matchesAny(file, exclude)) count += 1;
    } catch {
      return 0;
    }
  }
  return count;
}

// ── Selectors ────────────────────────────────────────────────

export function selectorToEntries(selector: Selector | undefined): string[] {
  if (selector === undefined) return [];
  return Array.isArray(selector) ? [...selector] : [selector];
}

export function entriesToSelector(entries: readonly string[]): Selector | undefined {
  const cleaned = [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))];
  if (!cleaned.length) return undefined;
  return cleaned.length === 1 ? cleaned[0] : cleaned;
}

const FREE_SELECTOR_PREFIXES = ['tag:', 'path:', 'package:', 'component:'];

/** Returns an error message for a hand-typed selector entry, or null when it is well-formed. */
export function freeSelectorError(raw: string): string | null {
  const entry = raw.trim();
  if (!entry) return 'Type a selector such as tag:core, path:src/lib/** or package:react.';
  if (entry === '*') return null;
  const body = entry.startsWith('!') ? entry.slice(1) : entry;
  if (!FREE_SELECTOR_PREFIXES.some((prefix) => body.startsWith(prefix) && body.length > prefix.length)) {
    return 'Start with tag:, path: or package: (prefix with ! to exclude). Pick components from the list.';
  }
  return null;
}

// ── Validation ───────────────────────────────────────────────

/** Dry-run a recipe so forms can show issues next to the field that caused them. */
export function previewRecipe(blueprint: Blueprint, recipe: Recipe): BlueprintIssue[] {
  try {
    const result = parseBlueprint(recipe(structuredClone(blueprint)));
    return result.ok ? [] : result.issues;
  } catch (error) {
    return [{ path: '(root)', message: error instanceof Error ? error.message : String(error) }];
  }
}

// ── Recipes ──────────────────────────────────────────────────

const HUMAN = { source: 'human' as const };

export function hasDependency(blueprint: Blueprint, from: string, to: string): boolean {
  return blueprint.dependencies.some((dependency) => dependency.from === from && dependency.to === to);
}

export function declareDependency(from: string, to: string): Recipe {
  return (draft) => (hasDependency(draft, from, to)
    ? draft
    : { ...draft, dependencies: [...draft.dependencies, { from, to, kind: 'imports', provenance: { ...HUMAN } }] });
}

export function undeclareDependency(from: string, to: string): Recipe {
  return (draft) => ({
    ...draft,
    dependencies: draft.dependencies.filter((dependency) => !(dependency.from === from && dependency.to === to)),
  });
}

export function forbidRuleId(from: string, to: string): string {
  return `forbid-${from}-${to}`.slice(0, 80);
}

export function forbidDependency(from: string, to: string): Recipe {
  const id = forbidRuleId(from, to);
  return (draft) => (draft.rules.some((rule) => rule.id === id)
    ? draft
    : {
        ...draft,
        rules: [...draft.rules, { id, kind: 'forbid', from, to, severity: 'error', reason: '', provenance: { ...HUMAN } }],
      });
}

export function upsertComponent(component: BlueprintComponent): Recipe {
  return (draft) => ({
    ...draft,
    components: draft.components.some((item) => item.id === component.id)
      ? draft.components.map((item) => (item.id === component.id ? component : item))
      : [...draft.components, component],
  });
}

export function newComponent(blueprint: Blueprint, name = 'New component'): BlueprintComponent {
  const id = uniqueId(slugify(name, 'component'), blueprint.components.map((component) => component.id));
  return { id, name, kind: 'default', paths: [`src/${id}/**`], provenance: { ...HUMAN } };
}

function stripSelector(selector: Selector, componentId: string): Selector | undefined {
  return entriesToSelector(selectorToEntries(selector).filter((entry) => {
    const body = entry.startsWith('!') ? entry.slice(1) : entry;
    return body !== componentId && body !== `component:${componentId}`;
  }));
}

function stripRule(rule: BlueprintRule, componentId: string): BlueprintRule | null {
  switch (rule.kind) {
    case 'forbid':
    case 'allow-only': {
      const from = stripSelector(rule.from, componentId);
      const to = stripSelector(rule.to, componentId);
      return from && to ? { ...rule, from, to } : null;
    }
    case 'layers': {
      const layers = rule.layers
        .map((layer) => stripSelector(layer, componentId))
        .filter((layer): layer is Selector => layer !== undefined);
      return layers.length >= 2 ? { ...rule, layers } : null;
    }
    case 'no-cycles': {
      if (!rule.scope) return rule;
      const scope = stripSelector(rule.scope, componentId);
      return scope ? { ...rule, scope } : null;
    }
    case 'secret-access': {
      const allow = stripSelector(rule.allow, componentId);
      return allow ? { ...rule, allow } : null;
    }
    case 'protect':
      return rule;
  }
}

export interface RemovalImpact {
  dependencies: number;
  rulesDropped: string[];
  rulesEdited: string[];
}

export function ruleReferences(rule: BlueprintRule, componentId: string): boolean {
  const selectors: Array<Selector | undefined> = rule.kind === 'forbid' || rule.kind === 'allow-only'
    ? [rule.from, rule.to]
    : rule.kind === 'layers' ? rule.layers
      : rule.kind === 'no-cycles' ? [rule.scope]
        : rule.kind === 'secret-access' ? [rule.allow] : [];
  return selectors.some((selector) => selectorComponentRefs(selector).includes(componentId));
}

export function removalImpact(blueprint: Blueprint, componentId: string): RemovalImpact {
  const touched = blueprint.rules.filter((rule) => ruleReferences(rule, componentId));
  return {
    dependencies: blueprint.dependencies.filter((dependency) => dependency.from === componentId || dependency.to === componentId).length,
    rulesDropped: touched.filter((rule) => stripRule(rule, componentId) === null).map((rule) => rule.id),
    rulesEdited: touched.filter((rule) => stripRule(rule, componentId) !== null).map((rule) => rule.id),
  };
}

/** Remove a component together with every reference that would otherwise dangle. */
export function removeComponent(componentId: string): Recipe {
  const without = (ids: string[] | undefined) => ids?.filter((id) => id !== componentId);
  return (draft) => ({
    ...draft,
    components: draft.components.filter((component) => component.id !== componentId),
    dependencies: draft.dependencies.filter((dependency) => dependency.from !== componentId && dependency.to !== componentId),
    rules: draft.rules
      .map((rule) => (ruleReferences(rule, componentId) ? stripRule(rule, componentId) : rule))
      .filter((rule): rule is BlueprintRule => rule !== null),
    invariants: draft.invariants.map((invariant) => (invariant.components?.includes(componentId)
      ? { ...invariant, components: without(invariant.components) }
      : invariant)),
    decisions: draft.decisions.map((decision) => (decision.components?.includes(componentId)
      ? { ...decision, components: without(decision.components) }
      : decision)),
  });
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];
}

export const upsertRule = (rule: BlueprintRule): Recipe => (draft) => ({ ...draft, rules: upsertById(draft.rules, rule) });
export const removeRule = (id: string): Recipe => (draft) => ({ ...draft, rules: draft.rules.filter((rule) => rule.id !== id) });
export const upsertInvariant = (invariant: BlueprintInvariant): Recipe => (draft) => ({ ...draft, invariants: upsertById(draft.invariants, invariant) });
export const removeInvariant = (id: string): Recipe => (draft) => ({ ...draft, invariants: draft.invariants.filter((item) => item.id !== id) });
export const upsertDecision = (decision: BlueprintDecision): Recipe => (draft) => ({ ...draft, decisions: upsertById(draft.decisions, decision) });
export const removeDecision = (id: string): Recipe => (draft) => ({
  ...draft,
  decisions: draft.decisions
    .filter((item) => item.id !== id)
    .map((item) => (item.supersededBy === id ? { ...item, supersededBy: undefined } : item)),
});

/** Drop keys whose value is undefined, an empty string or an empty array, so saved JSON stays tidy. */
export function compact<T extends Record<string, unknown>>(value: T, keep: ReadonlyArray<keyof T> = []): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const empty = entry === undefined || entry === '' || (Array.isArray(entry) && entry.length === 0);
    if (!empty || keep.includes(key as keyof T)) result[key] = entry;
  }
  return result as T;
}
