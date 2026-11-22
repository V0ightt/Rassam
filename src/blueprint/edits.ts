// Typed, validated, previewable edits to a blueprint. People (and models)
// should not hand-edit the contract: they state a change, Rassam turns it into
// one of these operations, shows what it will do, and applies or undoes it.
// Pure and isomorphic: no I/O, never mutates its input.

import { z } from "zod";

import {
  assuranceSchema,
  blueprintIdSchema,
  componentKindSchema,
  dependencyKindSchema,
  parseBlueprint,
  selectorComponentRefs,
  selectorSchema,
  severitySchema,
  type Blueprint,
  type BlueprintComponent,
  type BlueprintIssue,
  type BlueprintRule,
  type Provenance,
  type Selector,
  type Severity,
} from "./schema";
import { slugify } from "./util";

// ── Edit format ───────────────────────────────────────────────

const globSchema = z.string().trim().min(1).max(400);
const globListSchema = z.array(globSchema).max(200);
const tagListSchema = z.array(z.string().trim().min(1).max(80)).max(50);
const ownerListSchema = z.array(z.string().trim().min(1).max(120)).max(50);
const nameSchema = z.string().trim().min(1).max(200);
const reasonSchema = z.string().max(2_000);
const longTextSchema = z.string().max(8_000);
const componentIdListSchema = z.array(blueprintIdSchema).max(100);
const secretListSchema = z.array(z.string().trim().min(1).max(200)).min(1).max(200);

const componentPatchSchema = z.strictObject({
  name: nameSchema.optional(),
  kind: componentKindSchema.optional(),
  description: z.string().max(2_000).nullable().optional(),
  intent: longTextSchema.nullable().optional(),
  paths: globListSchema.optional(),
  exclude: globListSchema.nullable().optional(),
  tags: tagListSchema.nullable().optional(),
  owners: ownerListSchema.nullable().optional(),
  assurance: assuranceSchema.nullable().optional(),
  external: z.boolean().optional(),
  public: z.boolean().optional(),
  priority: z.number().int().min(-100).max(100).nullable().optional(),
});

const rulePatchSchema = z.strictObject({
  severity: severitySchema.optional(),
  reason: reasonSchema.nullable().optional(),
  from: selectorSchema.optional(),
  to: selectorSchema.optional(),
  layers: z.array(selectorSchema).min(2).max(20).optional(),
  paths: globListSchema.min(1).optional(),
  secrets: secretListSchema.optional(),
  allow: selectorSchema.optional(),
  scope: selectorSchema.nullable().optional(),
  includeTypeOnly: z.boolean().optional(),
});

const healthSchema = z.strictObject({
  url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, "health.url is an http(s) URL"),
  method: z.enum(["GET", "HEAD"]).optional(),
  expectStatus: z.number().int().min(100).max(599).optional(),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

export const blueprintEditSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("add_component"),
    id: blueprintIdSchema.optional(),
    name: nameSchema,
    kind: componentKindSchema.optional(),
    paths: globListSchema.default([]),
    description: z.string().max(2_000).optional(),
    intent: longTextSchema.optional(),
    tags: tagListSchema.optional(),
    owners: ownerListSchema.optional(),
    external: z.boolean().optional(),
  }),
  z.strictObject({ op: z.literal("update_component"), id: blueprintIdSchema, set: componentPatchSchema }),
  z.strictObject({ op: z.literal("remove_component"), id: blueprintIdSchema }),
  z.strictObject({
    op: z.literal("rename_component"),
    id: blueprintIdSchema,
    newId: blueprintIdSchema.optional(),
    name: nameSchema.optional(),
  }),
  z.strictObject({
    op: z.literal("declare_dependency"),
    from: blueprintIdSchema,
    to: blueprintIdSchema,
    kind: dependencyKindSchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.strictObject({ op: z.literal("remove_dependency"), from: blueprintIdSchema, to: blueprintIdSchema }),
  z.strictObject({
    op: z.literal("forbid_dependency"),
    from: selectorSchema,
    to: selectorSchema,
    id: blueprintIdSchema.optional(),
    severity: severitySchema.optional(),
    reason: reasonSchema.optional(),
    includeTypeOnly: z.boolean().optional(),
  }),
  z.strictObject({
    op: z.literal("allow_only"),
    from: selectorSchema,
    to: selectorSchema,
    id: blueprintIdSchema.optional(),
    severity: severitySchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.strictObject({
    op: z.literal("set_layers"),
    layers: z.array(selectorSchema).min(2).max(20),
    id: blueprintIdSchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.strictObject({
    op: z.literal("forbid_cycles"),
    scope: selectorSchema.optional(),
    id: blueprintIdSchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.strictObject({
    op: z.literal("protect_paths"),
    paths: globListSchema.min(1),
    id: blueprintIdSchema.optional(),
    reason: reasonSchema.optional(),
    severity: severitySchema.optional(),
  }),
  z.strictObject({
    op: z.literal("restrict_secret"),
    secrets: secretListSchema,
    allow: selectorSchema,
    id: blueprintIdSchema.optional(),
    reason: reasonSchema.optional(),
  }),
  z.strictObject({ op: z.literal("update_rule"), id: blueprintIdSchema, set: rulePatchSchema }),
  z.strictObject({ op: z.literal("remove_rule"), id: blueprintIdSchema }),
  z.strictObject({
    op: z.literal("add_invariant"),
    id: blueprintIdSchema.optional(),
    statement: z.string().trim().min(1).max(2_000),
    components: componentIdListSchema.optional(),
    run: z.string().trim().min(1).max(1_000).optional(),
    tests: z.array(globSchema).max(100).optional(),
    severity: severitySchema.optional(),
  }),
  z.strictObject({ op: z.literal("remove_invariant"), id: blueprintIdSchema }),
  z.strictObject({
    op: z.literal("add_decision"),
    id: blueprintIdSchema.optional(),
    title: z.string().trim().min(1).max(300),
    decision: longTextSchema,
    context: longTextSchema.optional(),
    consequences: longTextSchema.optional(),
    status: z.enum(["proposed", "accepted", "superseded", "deprecated"]).optional(),
    components: componentIdListSchema.optional(),
    date: z.string().trim().min(4).max(40).optional(),
  }),
  z.strictObject({ op: z.literal("remove_decision"), id: blueprintIdSchema }),
  z.strictObject({
    op: z.literal("set_policy"),
    undeclaredDependencies: z.enum(["off", "info", "warning", "error"]).optional(),
    unmappedFiles: z.enum(["off", "info", "warning"]).optional(),
    includeTypeOnly: z.boolean().optional(),
    verificationHeuristics: z.boolean().optional(),
    ignoreAdd: z.array(globSchema).max(500).optional(),
    ignoreRemove: z.array(globSchema).max(500).optional(),
  }),
  z.strictObject({
    op: z.literal("set_runtime"),
    id: blueprintIdSchema,
    health: healthSchema.nullable().optional(),
    deployment: z.strictObject({ environment: z.string().trim().min(1).max(100) }).nullable().optional(),
    workflow: z.strictObject({ file: z.string().trim().min(1).max(200) }).nullable().optional(),
  }),
]);

/** A validated edit (defaults applied). */
export type BlueprintEdit = z.infer<typeof blueprintEditSchema>;
/** What callers may pass: the same shape before defaults (e.g. `paths` optional on add_component). */
export type BlueprintEditInput = z.input<typeof blueprintEditSchema>;
export type BlueprintEditOp = BlueprintEdit["op"];

export interface AppliedEdit {
  index: number;
  op: BlueprintEditOp;
  /** One precise human sentence. */
  summary: string;
  /** Component, rule, invariant and decision ids touched ("from->to" for dependencies). */
  targets: string[];
  /** True when the edit loosens the contract. */
  weakens: boolean;
}

export interface ApplyEditsOptions {
  /** Stamped on every new fact. Default `{ source: "human" }`. */
  provenance?: Provenance;
  /** ISO timestamp used for provenance.at and decision dates. Omitted → no timestamp is invented. */
  now?: string;
}

export class BlueprintEditError extends Error {
  readonly index: number;
  readonly op: string;
  readonly suggestions?: string[];
  readonly issues?: BlueprintIssue[];

  constructor(index: number, op: string, message: string, extra: { suggestions?: string[]; issues?: BlueprintIssue[] } = {}) {
    super(message);
    this.name = "BlueprintEditError";
    this.index = index;
    this.op = op;
    if (extra.suggestions?.length) this.suggestions = extra.suggestions;
    if (extra.issues?.length) this.issues = extra.issues;
  }
}

// ── Text helpers ──────────────────────────────────────────────

/** Levenshtein distance. */
export function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length];
}

/** Closest candidates to `text` (substring matches first, then by edit distance). */
export function nearestIds(text: string, pool: readonly string[], limit = 3): string[] {
  const needle = text.toLowerCase();
  const scored = pool.map((candidate) => {
    const lower = candidate.toLowerCase();
    const contains = needle.length >= 2 && (lower.includes(needle) || needle.includes(lower));
    return { candidate, score: contains ? 0 : editDistance(needle, lower) };
  });
  const cutoff = Math.max(2, Math.floor(needle.length / 3));
  return scored
    .filter((item) => item.score <= cutoff)
    .sort((left, right) => left.score - right.score || left.candidate.localeCompare(right.candidate))
    .slice(0, limit)
    .map((item) => item.candidate);
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueId(base: string, used: ReadonlySet<string>): string {
  const trimmed = base.slice(0, 74).replace(/[-._:]+$/, "") || "item";
  let candidate = trimmed;
  let counter = 2;
  while (used.has(candidate)) candidate = `${trimmed}-${counter++}`;
  return candidate;
}

// ── Selector helpers ──────────────────────────────────────────

function entriesOf(selector: Selector | undefined): string[] {
  if (selector === undefined) return [];
  return Array.isArray(selector) ? [...selector] : [selector];
}

function entryComponent(entry: string): string | null {
  const body = entry.startsWith("!") ? entry.slice(1) : entry;
  if (body === "*") return null;
  if (body.startsWith("component:")) return body.slice("component:".length);
  if (/^(tag|path|package):/.test(body)) return null;
  return body;
}

function canonicalEntry(entry: string): string {
  const negated = entry.startsWith("!");
  const body = negated ? entry.slice(1) : entry;
  return `${negated ? "!" : ""}${body.startsWith("component:") ? body.slice("component:".length) : body}`;
}

function positives(selector: Selector | undefined): Set<string> {
  return new Set(entriesOf(selector).map(canonicalEntry).filter((entry) => !entry.startsWith("!")));
}

function negatives(selector: Selector | undefined): Set<string> {
  return new Set(entriesOf(selector).map(canonicalEntry).filter((entry) => entry.startsWith("!")));
}

/** True when `after` may select less than `before` (an entry was dropped or an exclusion was added). */
function narrowed(before: Selector | undefined, after: Selector | undefined): boolean {
  const afterPositives = positives(after);
  if (afterPositives.has("*") && [...negatives(after)].every((entry) => negatives(before).has(entry))) return false;
  const beforeNegatives = negatives(before);
  return [...positives(before)].some((entry) => !afterPositives.has(entry)) || [...negatives(after)].some((entry) => !beforeNegatives.has(entry));
}

function widened(before: Selector | undefined, after: Selector | undefined): boolean {
  return narrowed(after, before);
}

/** Rewrite component references in a selector. `map` returns the new id, or null to drop the entry. */
function rewriteSelector(selector: Selector, map: (id: string) => string | null): Selector | null {
  const next: string[] = [];
  for (const entry of entriesOf(selector)) {
    const id = entryComponent(entry);
    if (id === null) {
      next.push(entry);
      continue;
    }
    const mapped = map(id);
    if (mapped === null) continue;
    if (mapped === id) {
      next.push(entry);
      continue;
    }
    const negated = entry.startsWith("!");
    const prefixed = (negated ? entry.slice(1) : entry).startsWith("component:");
    next.push(`${negated ? "!" : ""}${prefixed ? "component:" : ""}${mapped}`);
  }
  if (!next.some((entry) => !entry.startsWith("!"))) return null;
  return Array.isArray(selector) ? next : next[0];
}

function ruleReferences(rule: BlueprintRule, id: string): boolean {
  const selectors: Array<Selector | undefined> =
    rule.kind === "forbid" || rule.kind === "allow-only"
      ? [rule.from, rule.to]
      : rule.kind === "layers"
        ? rule.layers
        : rule.kind === "no-cycles"
          ? [rule.scope]
          : rule.kind === "secret-access"
            ? [rule.allow]
            : [];
  return selectors.some((selector) => selectorComponentRefs(selector).includes(id));
}

/** Rewrites a rule in place. Returns false when the rule no longer selects anything and must be removed. */
function rewriteRule(rule: BlueprintRule, map: (id: string) => string | null): boolean {
  switch (rule.kind) {
    case "forbid":
    case "allow-only": {
      const from = rewriteSelector(rule.from, map);
      const to = rewriteSelector(rule.to, map);
      if (from === null || to === null) return false;
      rule.from = from;
      rule.to = to;
      return true;
    }
    case "layers": {
      const layers = rule.layers.map((layer) => rewriteSelector(layer, map)).filter((layer): layer is Selector => layer !== null);
      if (layers.length < 2) return false;
      rule.layers = layers;
      return true;
    }
    case "no-cycles": {
      if (rule.scope === undefined) return true;
      const scope = rewriteSelector(rule.scope, map);
      if (scope === null) return false;
      rule.scope = scope;
      return true;
    }
    case "secret-access": {
      const allow = rewriteSelector(rule.allow, map);
      if (allow === null) return false;
      rule.allow = allow;
      return true;
    }
    case "protect":
      return true;
  }
}

function selectorSlug(selector: Selector): string {
  const parts = entriesOf(selector)
    .filter((entry) => !entry.startsWith("!"))
    .map((entry) => (entry === "*" ? "any" : entry.replace(/^(component|path|package|tag):/, "")));
  return slugify(parts.join(" ") || "any", 30);
}

function componentLabel(blueprint: Blueprint, id: string): string {
  const component = blueprint.components.find((item) => item.id === id);
  return component ? `"${component.name}"` : `"${id}"`;
}

function selectorText(blueprint: Blueprint, selector: Selector | undefined): string {
  const parts = entriesOf(selector).map((entry) => {
    const negated = entry.startsWith("!");
    const body = negated ? entry.slice(1) : entry;
    let text: string;
    if (body === "*") text = "everything";
    else if (body.startsWith("package:")) text = `package ${body.slice(8)}`;
    else if (body.startsWith("path:")) text = `files matching ${body.slice(5)}`;
    else if (body.startsWith("tag:")) text = `components tagged ${body.slice(4)}`;
    else text = componentLabel(blueprint, body.startsWith("component:") ? body.slice(10) : body);
    return negated ? `except ${text}` : text;
  });
  if (!parts.length) return "nothing";
  const kept = parts.filter((part) => !part.startsWith("except "));
  const excluded = parts.filter((part) => part.startsWith("except ")).map((part) => part.slice(7));
  return `${list(kept)}${excluded.length ? ` except ${list(excluded)}` : ""}`;
}

// ── Component references ──────────────────────────────────────

const KIND_WORDS: Array<{ words: string[]; kinds: string[] }> = [
  { words: ["ui", "frontend", "front-end", "front end", "user interface", "web ui"], kinds: ["component", "route", "client", "ui", "frontend", "page", "view"] },
  { words: ["db", "database", "databases", "storage", "data store", "datastore", "persistence"], kinds: ["database", "storage", "db", "datastore"] },
  { words: ["api", "apis"], kinds: ["api"] },
  { words: ["tests", "test", "specs", "test suite"], kinds: ["test", "tests"] },
];

function cleanReference(text: string): string {
  return text
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/^(?:the|our|my)\s+/i, "")
    .replace(/^component\s+/i, "")
    .replace(/\s+(?:component|layer|module|code)$/i, "")
    .trim();
}

/**
 * Resolve a human reference ("the UI", "payments", "Storefront UI", "db") to a
 * component: exact id, exact name, kind word, unique prefix/substring, then
 * edit distance ≤ 2. Ambiguous or unknown references return candidates.
 */
export function resolveComponentRef(blueprint: Blueprint, text: string): { id: string } | { candidates: string[] } {
  const reference = cleanReference(text);
  const lower = reference.toLowerCase();
  if (!lower) return { candidates: [] };
  const components = blueprint.components;
  const pick = (ids: string[]): { id: string } | { candidates: string[] } | null =>
    ids.length === 1 ? { id: ids[0] } : ids.length > 1 ? { candidates: ids } : null;

  const exactId = components.find((component) => component.id === reference) ?? components.find((component) => component.id.toLowerCase() === lower);
  if (exactId) return { id: exactId.id };

  const slug = slugify(reference, 80);
  const byName = pick(components.filter((component) => component.name.toLowerCase() === lower).map((component) => component.id));
  if (byName) return byName;
  const bySlug = pick(components.filter((component) => component.id.toLowerCase() === slug || slugify(component.name, 80) === slug).map((component) => component.id));
  if (bySlug) return bySlug;

  const group = KIND_WORDS.find((item) => item.words.includes(lower));
  const kinds = group ? group.kinds : [lower, lower.replace(/s$/, "")];
  const byKind = pick(components.filter((component) => kinds.includes(component.kind)).map((component) => component.id));
  if (byKind) return byKind;

  const haystacks = components.map((component) => ({ id: component.id, values: [component.id.toLowerCase(), component.name.toLowerCase()] }));
  const byPrefix = pick(haystacks.filter((item) => item.values.some((value) => value.startsWith(lower))).map((item) => item.id));
  if (byPrefix) return byPrefix;
  if (lower.length >= 2) {
    const bySubstring = pick(haystacks.filter((item) => item.values.some((value) => value.includes(lower))).map((item) => item.id));
    if (bySubstring) return bySubstring;
  }

  // Short words get a tighter budget: "db" is not a typo of "ui".
  const budget = Math.min(2, Math.floor(lower.length / 3));
  if (budget > 0) {
    const scored = haystacks
      .map((item) => ({ id: item.id, distance: Math.min(...item.values.map((value) => editDistance(lower, value))) }))
      .filter((item) => item.distance <= budget);
    if (scored.length) {
      const best = Math.min(...scored.map((item) => item.distance));
      const closest = pick(scored.filter((item) => item.distance === best).map((item) => item.id));
      if (closest) return closest;
    }
  }
  return { candidates: [] };
}

// ── Applying edits ────────────────────────────────────────────

class EditFailure extends Error {
  readonly suggestions?: string[];
  constructor(message: string, suggestions?: string[]) {
    super(message);
    this.suggestions = suggestions;
  }
}

interface EditContext {
  blueprint: Blueprint;
  provenance: Provenance;
  now?: string;
}

type EditOutcome = Omit<AppliedEdit, "index" | "op">;
type EditOf<Op extends BlueprintEditOp> = Extract<BlueprintEdit, { op: Op }>;

const SEVERITY_RANK: Record<string, number> = { off: 0, info: 1, warning: 2, error: 3 };
const DEFAULT_SEVERITY: Record<BlueprintRule["kind"], Severity> = {
  forbid: "error",
  "allow-only": "error",
  layers: "error",
  "secret-access": "error",
  "no-cycles": "warning",
  protect: "warning",
};

function componentOrFail(blueprint: Blueprint, id: string): BlueprintComponent {
  const component = blueprint.components.find((item) => item.id === id);
  if (component) return component;
  const suggestions = nearestIds(id, blueprint.components.map((item) => item.id));
  throw new EditFailure(
    `There is no component "${id}".${suggestions.length ? ` Did you mean ${list(suggestions.map((item) => `"${item}"`))}?` : ""}`,
    suggestions,
  );
}

function ruleOrFail(blueprint: Blueprint, id: string): BlueprintRule {
  const rule = blueprint.rules.find((item) => item.id === id);
  if (rule) return rule;
  const suggestions = nearestIds(id, blueprint.rules.map((item) => item.id));
  throw new EditFailure(
    `There is no rule "${id}".${suggestions.length ? ` Did you mean ${list(suggestions.map((item) => `"${item}"`))}?` : ""}`,
    suggestions,
  );
}

function checkSelector(blueprint: Blueprint, selector: Selector | undefined, label: string): void {
  for (const ref of selectorComponentRefs(selector)) {
    if (blueprint.components.some((component) => component.id === ref)) continue;
    const suggestions = nearestIds(ref, blueprint.components.map((item) => item.id));
    throw new EditFailure(
      `"${ref}" in ${label} is not a component. Use a component id, or a path:, package: or tag: selector.${
        suggestions.length ? ` Did you mean ${list(suggestions.map((item) => `"${item}"`))}?` : ""
      }`,
      suggestions,
    );
  }
}

function checkComponentList(blueprint: Blueprint, ids: readonly string[] | undefined): void {
  for (const id of ids ?? []) componentOrFail(blueprint, id);
}

function newRuleId(blueprint: Blueprint, requested: string | undefined, fallback: string): string {
  const used = new Set(blueprint.rules.map((rule) => rule.id));
  if (requested !== undefined) {
    if (used.has(requested)) throw new EditFailure(`A rule with id "${requested}" already exists. Use update_rule to change it, or pick another id.`);
    return requested;
  }
  return uniqueId(fallback, used);
}

function unverify(fact: { verified?: { by: string } }, why: string): string {
  if (!fact.verified) return "";
  const by = fact.verified.by;
  delete fact.verified;
  return ` Removed the verified stamp by ${by} because ${why}; it needs a new sign-off.`;
}

function addComponent(context: EditContext, edit: EditOf<"add_component">): EditOutcome {
  const { blueprint } = context;
  const used = new Set(blueprint.components.map((component) => component.id));
  if (edit.id !== undefined && used.has(edit.id)) {
    throw new EditFailure(`A component with id "${edit.id}" already exists. Use update_component to change it, or pick another id.`);
  }
  if (!edit.external && edit.paths.length === 0) {
    throw new EditFailure(`Component "${edit.name}" needs at least one path glob, or mark it external if it lives outside the repository.`);
  }
  const id = edit.id ?? uniqueId(slugify(edit.name), used);
  const component: BlueprintComponent = {
    id,
    name: edit.name,
    kind: edit.kind ?? (edit.external ? "external" : "default"),
    ...(edit.description !== undefined ? { description: edit.description } : {}),
    ...(edit.intent !== undefined ? { intent: edit.intent } : {}),
    paths: [...edit.paths],
    ...(edit.external ? { external: true } : {}),
    ...(edit.tags?.length ? { tags: [...edit.tags] } : {}),
    ...(edit.owners?.length ? { owners: [...edit.owners] } : {}),
    provenance: context.provenance,
  };
  blueprint.components.push(component);
  const owning = edit.paths.length ? ` owning ${list(edit.paths)}` : "";
  return {
    summary: `Added ${edit.external ? "external " : ""}component "${edit.name}" (${id})${owning}.`,
    targets: [id],
    weakens: false,
  };
}

function updateComponent(context: EditContext, edit: EditOf<"update_component">): EditOutcome {
  const component = componentOrFail(context.blueprint, edit.id);
  const label = `"${component.name}"`;
  const target = component as Record<string, unknown>;
  const changes: string[] = [];
  let weakens = false;
  let structural = false;

  for (const [key, value] of Object.entries(edit.set)) {
    if (value === undefined) continue;
    const before = target[key];
    if (value === null) {
      if (before === undefined) continue;
      delete target[key];
      changes.push(`${key} cleared`);
      if (key === "exclude") structural = true;
      continue;
    }
    if (same(before, value)) continue;
    target[key] = clone(value);
    if (key === "paths" || key === "exclude") {
      const old = new Set((before as string[] | undefined) ?? []);
      const next = new Set(value as string[]);
      const added = [...next].filter((item) => !old.has(item));
      const removed = [...old].filter((item) => !next.has(item));
      changes.push(`${key} ${[...added.map((item) => `+${item}`), ...removed.map((item) => `−${item}`)].join(" ") || "reordered"}`);
      if (key === "paths" ? removed.length > 0 : added.length > 0) weakens = true;
      structural = true;
    } else if (key === "intent" || key === "description") {
      changes.push(`${key} ${before === undefined ? "set" : "rewritten"}`);
    } else if (Array.isArray(value)) {
      changes.push(`${key} → ${value.join(", ") || "none"}`);
    } else {
      changes.push(`${key} ${before === undefined ? "" : `${String(before)} `}→ ${String(value)}`);
      if (key === "kind" || key === "external") structural = true;
      if (key === "public" && value === true) weakens = true;
    }
  }
  if (!changes.length) throw new EditFailure(`Nothing to change: component ${label} already has these values.`);
  const note = structural ? unverify(component, "what it covers changed") : "";
  return { summary: `Updated component ${label}: ${changes.join("; ")}.${note}`, targets: [component.id], weakens };
}

function removeComponent(context: EditContext, edit: EditOf<"remove_component">): EditOutcome {
  const { blueprint } = context;
  const component = componentOrFail(blueprint, edit.id);
  const id = component.id;
  const targets = [id];
  const notes: string[] = [];

  blueprint.components = blueprint.components.filter((item) => item.id !== id);
  const droppedDependencies = blueprint.dependencies.filter((item) => item.from === id || item.to === id);
  if (droppedDependencies.length) {
    blueprint.dependencies = blueprint.dependencies.filter((item) => item.from !== id && item.to !== id);
    notes.push(`removed ${droppedDependencies.length} declared ${droppedDependencies.length === 1 ? "dependency" : "dependencies"}`);
  }

  const removedRules: string[] = [];
  const trimmedRules: string[] = [];
  const unverified: string[] = [];
  blueprint.rules = blueprint.rules.filter((rule) => {
    if (!ruleReferences(rule, id)) return true;
    targets.push(rule.id);
    if (!rewriteRule(rule, (ref) => (ref === id ? null : ref))) {
      removedRules.push(rule.id);
      return false;
    }
    trimmedRules.push(rule.id);
    if (rule.verified) {
      delete rule.verified;
      unverified.push(rule.id);
    }
    return true;
  });
  if (removedRules.length) notes.push(`removed ${removedRules.length === 1 ? "rule" : "rules"} ${list(removedRules)} (nothing left to constrain)`);
  if (trimmedRules.length) notes.push(`stripped it from ${trimmedRules.length === 1 ? "rule" : "rules"} ${list(trimmedRules)}`);
  if (unverified.length) notes.push(`cleared the verified stamp on ${list(unverified)}`);

  let references = 0;
  for (const item of [...blueprint.invariants, ...blueprint.decisions]) {
    if (!item.components?.includes(id)) continue;
    references += 1;
    targets.push(item.id);
    const rest = item.components.filter((ref) => ref !== id);
    if (rest.length) item.components = rest;
    else delete item.components;
  }
  if (references) notes.push(`unlinked it from ${references} ${references === 1 ? "invariant or decision" : "invariants and decisions"}`);

  return {
    summary: `Removed component "${component.name}" (${id})${notes.length ? `; also ${notes.join(", ")}` : ""}.`,
    targets,
    weakens: component.paths.length > 0 || removedRules.length > 0 || trimmedRules.length > 0,
  };
}

function renameComponent(context: EditContext, edit: EditOf<"rename_component">): EditOutcome {
  const { blueprint } = context;
  const component = componentOrFail(blueprint, edit.id);
  const oldId = component.id;
  const oldName = component.name;
  const newId = edit.newId ?? oldId;
  const newName = edit.name ?? oldName;
  if (edit.newId === undefined && edit.name === undefined) throw new EditFailure("A rename needs a newId, a name, or both.");
  if (newId === oldId && newName === oldName) throw new EditFailure(`Nothing to change: the component is already called "${oldName}" (${oldId}).`);
  if (newId !== oldId && blueprint.components.some((item) => item.id === newId)) {
    throw new EditFailure(`Cannot rename "${oldId}" to "${newId}": a component with that id already exists.`);
  }
  component.name = newName;
  const targets = [oldId];
  let rewritten = 0;
  if (newId !== oldId) {
    component.id = newId;
    targets.push(newId);
    for (const dependency of blueprint.dependencies) {
      if (dependency.from === oldId) dependency.from = newId;
      if (dependency.to === oldId) dependency.to = newId;
    }
    for (const rule of blueprint.rules) {
      if (!ruleReferences(rule, oldId)) continue;
      rewriteRule(rule, (ref) => (ref === oldId ? newId : ref));
      targets.push(rule.id);
      rewritten += 1;
    }
    for (const item of [...blueprint.invariants, ...blueprint.decisions]) {
      if (!item.components?.includes(oldId)) continue;
      item.components = item.components.map((ref) => (ref === oldId ? newId : ref));
      targets.push(item.id);
    }
  }
  const idPart = newId !== oldId ? ` (${oldId} → ${newId})` : "";
  const namePart = newName !== oldName ? ` to "${newName}"` : "";
  const rulePart = rewritten ? `; updated ${rewritten} ${rewritten === 1 ? "rule" : "rules"} that reference it` : "";
  return { summary: `Renamed component "${oldName}"${namePart}${idPart}${rulePart}.`, targets, weakens: false };
}

function declareDependency(context: EditContext, edit: EditOf<"declare_dependency">): EditOutcome {
  const { blueprint } = context;
  const from = componentOrFail(blueprint, edit.from);
  const to = componentOrFail(blueprint, edit.to);
  if (from.id === to.id) throw new EditFailure(`A component cannot declare a dependency on itself ("${from.id}").`);
  if (blueprint.dependencies.some((item) => item.from === from.id && item.to === to.id)) {
    throw new EditFailure(`The dependency "${from.name}" → "${to.name}" is already declared.`);
  }
  blueprint.dependencies.push({
    from: from.id,
    to: to.id,
    ...(edit.kind ? { kind: edit.kind } : {}),
    ...(edit.reason ? { reason: edit.reason } : {}),
    provenance: context.provenance,
  });
  return {
    summary: `Declared that "${from.name}" depends on "${to.name}"${edit.kind ? ` (${edit.kind})` : ""}.`,
    targets: [from.id, to.id, `${from.id}->${to.id}`],
    weakens: false,
  };
}

function removeDependency(context: EditContext, edit: EditOf<"remove_dependency">): EditOutcome {
  const { blueprint } = context;
  const from = componentOrFail(blueprint, edit.from);
  const to = componentOrFail(blueprint, edit.to);
  const before = blueprint.dependencies.length;
  blueprint.dependencies = blueprint.dependencies.filter((item) => !(item.from === from.id && item.to === to.id));
  if (blueprint.dependencies.length === before) {
    const outgoing = blueprint.dependencies.filter((item) => item.from === from.id).map((item) => `${item.from}->${item.to}`);
    throw new EditFailure(`No dependency from "${from.name}" to "${to.name}" is declared.`, outgoing.slice(0, 5));
  }
  return {
    summary: `Removed the declared dependency "${from.name}" → "${to.name}".`,
    targets: [from.id, to.id, `${from.id}->${to.id}`],
    weakens: false,
  };
}

function pushRule(context: EditContext, rule: BlueprintRule, summary: string): EditOutcome {
  context.blueprint.rules.push(rule);
  const refs = new Set<string>();
  for (const component of context.blueprint.components) if (ruleReferences(rule, component.id)) refs.add(component.id);
  return { summary: `${summary} (rule ${rule.id}).`, targets: [rule.id, ...refs], weakens: false };
}

function ruleExtras(context: EditContext, edit: { severity?: Severity; reason?: string }) {
  return {
    ...(edit.severity ? { severity: edit.severity } : {}),
    ...(edit.reason ? { reason: edit.reason } : {}),
    provenance: context.provenance,
  };
}

function forbidDependency(context: EditContext, edit: EditOf<"forbid_dependency">): EditOutcome {
  const { blueprint } = context;
  checkSelector(blueprint, edit.from, "from");
  checkSelector(blueprint, edit.to, "to");
  const id = newRuleId(blueprint, edit.id, `forbid-${selectorSlug(edit.from)}-${selectorSlug(edit.to)}`);
  const typeNote = edit.includeTypeOnly === false ? ", type-only imports excepted" : "";
  return pushRule(
    context,
    {
      id,
      kind: "forbid",
      from: clone(edit.from),
      to: clone(edit.to),
      ...(edit.includeTypeOnly !== undefined ? { includeTypeOnly: edit.includeTypeOnly } : {}),
      ...ruleExtras(context, edit),
    },
    `Forbade ${selectorText(blueprint, edit.from)} from depending on ${selectorText(blueprint, edit.to)}${typeNote}${edit.severity ? ` as ${edit.severity}` : ""}`,
  );
}

function allowOnly(context: EditContext, edit: EditOf<"allow_only">): EditOutcome {
  const { blueprint } = context;
  checkSelector(blueprint, edit.from, "from");
  checkSelector(blueprint, edit.to, "to");
  const id = newRuleId(blueprint, edit.id, `allow-only-${selectorSlug(edit.from)}`);
  return pushRule(
    context,
    { id, kind: "allow-only", from: clone(edit.from), to: clone(edit.to), ...ruleExtras(context, edit) },
    `Restricted ${selectorText(blueprint, edit.from)} to depend only on ${selectorText(blueprint, edit.to)}${edit.severity ? ` as ${edit.severity}` : ""}`,
  );
}

function setLayers(context: EditContext, edit: EditOf<"set_layers">): EditOutcome {
  const { blueprint } = context;
  edit.layers.forEach((layer, index) => checkSelector(blueprint, layer, `layer ${index + 1}`));
  const id = newRuleId(blueprint, edit.id, "layers");
  return pushRule(
    context,
    { id, kind: "layers", layers: clone(edit.layers), ...ruleExtras(context, edit) },
    `Set layers, top to bottom: ${edit.layers.map((layer) => selectorText(blueprint, layer)).join(" → ")}`,
  );
}

function forbidCycles(context: EditContext, edit: EditOf<"forbid_cycles">): EditOutcome {
  const { blueprint } = context;
  checkSelector(blueprint, edit.scope, "scope");
  const duplicate = blueprint.rules.find((rule) => rule.kind === "no-cycles" && same(rule.scope, edit.scope));
  if (duplicate) throw new EditFailure(`Rule "${duplicate.id}" already forbids dependency cycles${edit.scope ? " in that scope" : ""}.`, [duplicate.id]);
  const id = newRuleId(blueprint, edit.id, edit.scope ? `no-cycles-${selectorSlug(edit.scope)}` : "no-cycles");
  return pushRule(
    context,
    { id, kind: "no-cycles", ...(edit.scope ? { scope: clone(edit.scope) } : {}), ...ruleExtras(context, edit) },
    `Forbade dependency cycles${edit.scope ? ` within ${selectorText(blueprint, edit.scope)}` : " between components"}`,
  );
}

function protectPaths(context: EditContext, edit: EditOf<"protect_paths">): EditOutcome {
  const id = newRuleId(context.blueprint, edit.id, `protect-${slugify(edit.paths[0], 40)}`);
  return pushRule(
    context,
    { id, kind: "protect", paths: [...edit.paths], ...ruleExtras(context, edit) },
    `Protected ${list(edit.paths)}: changes there require human review`,
  );
}

function restrictSecret(context: EditContext, edit: EditOf<"restrict_secret">): EditOutcome {
  const { blueprint } = context;
  checkSelector(blueprint, edit.allow, "allow");
  const id = newRuleId(blueprint, edit.id, `secret-${slugify(edit.secrets[0], 30)}-${selectorSlug(edit.allow)}`);
  return pushRule(
    context,
    { id, kind: "secret-access", secrets: [...edit.secrets], allow: clone(edit.allow), ...ruleExtras(context, edit) },
    `Restricted ${list(edit.secrets)} so that only ${selectorText(blueprint, edit.allow)} may read ${edit.secrets.length === 1 && !edit.secrets[0].includes("*") ? "it" : "them"}`,
  );
}

const RULE_FIELDS: Record<BlueprintRule["kind"], string[]> = {
  forbid: ["severity", "reason", "from", "to", "includeTypeOnly"],
  "allow-only": ["severity", "reason", "from", "to", "includeTypeOnly"],
  layers: ["severity", "reason", "layers", "includeTypeOnly"],
  "no-cycles": ["severity", "reason", "scope", "includeTypeOnly"],
  protect: ["severity", "reason", "paths"],
  "secret-access": ["severity", "reason", "secrets", "allow"],
};

function isSubsequence(short: readonly Selector[], long: readonly Selector[]): boolean {
  let cursor = 0;
  for (const item of long) if (cursor < short.length && same(item, short[cursor])) cursor += 1;
  return cursor === short.length;
}

function updateRule(context: EditContext, edit: EditOf<"update_rule">): EditOutcome {
  const { blueprint } = context;
  const rule = ruleOrFail(blueprint, edit.id);
  const before = clone(rule) as Record<string, unknown>;
  const target = rule as Record<string, unknown>;
  const allowed = RULE_FIELDS[rule.kind];
  const changes: string[] = [];
  let weakens = false;
  let semantic = false;

  for (const [key, value] of Object.entries(edit.set)) {
    if (value === undefined) continue;
    if (!allowed.includes(key)) {
      throw new EditFailure(`Rule "${rule.id}" is a ${rule.kind} rule and has no "${key}" field. It accepts ${list(allowed)}.`, allowed);
    }
    if (value === null) {
      if (target[key] === undefined) continue;
      delete target[key];
      changes.push(`${key} cleared`);
      if (key !== "reason") semantic = true;
      continue;
    }
    if (same(target[key], value)) continue;
    if (key === "layers") (value as Selector[]).forEach((layer, index) => checkSelector(blueprint, layer, `layer ${index + 1}`));
    else if (key === "from" || key === "to" || key === "allow" || key === "scope") checkSelector(blueprint, value as Selector, key);
    target[key] = clone(value);
    if (key !== "reason") semantic = true;

    const old = before[key];
    switch (key) {
      case "severity": {
        const previous = (old as Severity | undefined) ?? DEFAULT_SEVERITY[rule.kind];
        changes.push(`severity ${previous} → ${String(value)}`);
        if (SEVERITY_RANK[String(value)] < SEVERITY_RANK[previous]) weakens = true;
        break;
      }
      case "reason":
        changes.push(`reason ${old === undefined ? "set" : "rewritten"}`);
        break;
      case "includeTypeOnly": {
        changes.push(`type-only imports ${value ? "counted" : "ignored"}`);
        if (value === false && ((old as boolean | undefined) ?? blueprint.policy.includeTypeOnly)) weakens = true;
        break;
      }
      case "layers": {
        changes.push(`layers → ${(value as Selector[]).map((layer) => selectorText(blueprint, layer)).join(" → ")}`);
        if (!isSubsequence(old as Selector[], value as Selector[])) weakens = true;
        break;
      }
      case "paths":
      case "secrets": {
        const next = new Set(value as string[]);
        changes.push(`${key} → ${(value as string[]).join(", ")}`);
        if ((old as string[]).some((item) => !next.has(item))) weakens = true;
        break;
      }
      default: {
        changes.push(`${key} → ${selectorText(blueprint, value as Selector)}`);
        const oldSelector = old as Selector | undefined;
        const nextSelector = value as Selector;
        if (key === "scope") {
          if (oldSelector === undefined || narrowed(oldSelector, nextSelector)) weakens = true;
        } else if (key === "allow" || (key === "to" && rule.kind === "allow-only")) {
          if (widened(oldSelector, nextSelector)) weakens = true;
        } else if (narrowed(oldSelector, nextSelector)) {
          weakens = true;
        }
      }
    }
  }
  if (!changes.length) throw new EditFailure(`Nothing to change: rule "${rule.id}" already has these values.`);
  const note = semantic ? unverify(rule, "what it enforces changed") : "";
  return { summary: `Updated rule ${rule.id}: ${changes.join("; ")}.${note}`, targets: [rule.id], weakens };
}

function removeRule(context: EditContext, edit: EditOf<"remove_rule">): EditOutcome {
  const rule = ruleOrFail(context.blueprint, edit.id);
  context.blueprint.rules = context.blueprint.rules.filter((item) => item.id !== rule.id);
  return { summary: `Removed the ${rule.kind} rule ${rule.id}.`, targets: [rule.id], weakens: true };
}

function addInvariant(context: EditContext, edit: EditOf<"add_invariant">): EditOutcome {
  const { blueprint } = context;
  const used = new Set(blueprint.invariants.map((item) => item.id));
  if (edit.id !== undefined && used.has(edit.id)) throw new EditFailure(`An invariant with id "${edit.id}" already exists.`);
  checkComponentList(blueprint, edit.components);
  const id = edit.id ?? uniqueId(slugify(edit.statement, 48), used);
  blueprint.invariants.push({
    id,
    statement: edit.statement,
    ...(edit.components?.length ? { components: [...edit.components] } : {}),
    ...(edit.run !== undefined || edit.tests?.length
      ? { check: { ...(edit.run !== undefined ? { run: edit.run } : {}), ...(edit.tests?.length ? { tests: [...edit.tests] } : {}) } }
      : {}),
    ...(edit.severity ? { severity: edit.severity } : {}),
    provenance: context.provenance,
  });
  const check = edit.run !== undefined ? `, checked by \`${edit.run}\`` : edit.tests?.length ? `, covered by ${list(edit.tests)}` : "";
  return { summary: `Added invariant ${id}: "${edit.statement}"${check}.`, targets: [id, ...(edit.components ?? [])], weakens: false };
}

function removeInvariant(context: EditContext, edit: EditOf<"remove_invariant">): EditOutcome {
  const { blueprint } = context;
  const invariant = blueprint.invariants.find((item) => item.id === edit.id);
  if (!invariant) {
    const suggestions = nearestIds(edit.id, blueprint.invariants.map((item) => item.id));
    throw new EditFailure(`There is no invariant "${edit.id}".`, suggestions);
  }
  blueprint.invariants = blueprint.invariants.filter((item) => item.id !== edit.id);
  return { summary: `Removed invariant ${invariant.id}: "${invariant.statement}".`, targets: [invariant.id], weakens: true };
}

function addDecision(context: EditContext, edit: EditOf<"add_decision">): EditOutcome {
  const { blueprint } = context;
  const used = new Set(blueprint.decisions.map((item) => item.id));
  if (edit.id !== undefined && used.has(edit.id)) throw new EditFailure(`A decision with id "${edit.id}" already exists.`);
  checkComponentList(blueprint, edit.components);
  let id = edit.id;
  if (id === undefined) {
    let next = 1;
    for (const existing of used) {
      const match = /^ADR-(\d+)$/i.exec(existing);
      if (match) next = Math.max(next, Number(match[1]) + 1);
    }
    id = `ADR-${String(next).padStart(3, "0")}`;
  }
  const date = edit.date ?? context.now?.slice(0, 10);
  const status = edit.status ?? "accepted";
  blueprint.decisions.push({
    id,
    title: edit.title,
    status,
    ...(date ? { date } : {}),
    ...(edit.components?.length ? { components: [...edit.components] } : {}),
    ...(edit.context !== undefined ? { context: edit.context } : {}),
    decision: edit.decision,
    ...(edit.consequences !== undefined ? { consequences: edit.consequences } : {}),
    provenance: context.provenance,
  });
  return { summary: `Recorded decision ${id} (${status}): "${edit.title}".`, targets: [id, ...(edit.components ?? [])], weakens: false };
}

function removeDecision(context: EditContext, edit: EditOf<"remove_decision">): EditOutcome {
  const { blueprint } = context;
  const decision = blueprint.decisions.find((item) => item.id === edit.id);
  if (!decision) {
    const suggestions = nearestIds(edit.id, blueprint.decisions.map((item) => item.id));
    throw new EditFailure(`There is no decision "${edit.id}".`, suggestions);
  }
  blueprint.decisions = blueprint.decisions.filter((item) => item.id !== edit.id);
  const targets = [decision.id];
  for (const other of blueprint.decisions) {
    if (other.supersededBy !== decision.id) continue;
    delete other.supersededBy;
    targets.push(other.id);
  }
  const note = targets.length > 1 ? `; ${list(targets.slice(1))} no longer point${targets.length === 2 ? "s" : ""} to it as superseding` : "";
  return { summary: `Removed decision ${decision.id}: "${decision.title}"${note}.`, targets, weakens: false };
}

function setPolicy(context: EditContext, edit: EditOf<"set_policy">): EditOutcome {
  const policy = context.blueprint.policy;
  const changes: string[] = [];
  let weakens = false;
  for (const key of ["undeclaredDependencies", "unmappedFiles"] as const) {
    const value = edit[key];
    if (value === undefined || value === policy[key]) continue;
    if (SEVERITY_RANK[value] < SEVERITY_RANK[policy[key]]) weakens = true;
    changes.push(`${key === "undeclaredDependencies" ? "undeclared dependencies" : "unmapped files"} ${policy[key]} → ${value}`);
    (policy as Record<string, unknown>)[key] = value;
  }
  for (const key of ["includeTypeOnly", "verificationHeuristics"] as const) {
    const value = edit[key];
    if (value === undefined || value === policy[key]) continue;
    if (!value) weakens = true;
    changes.push(key === "includeTypeOnly" ? `type-only imports ${value ? "counted" : "ignored"}` : `verification heuristics ${value ? "on" : "off"}`);
    policy[key] = value;
  }
  const added = [...new Set(edit.ignoreAdd ?? [])].filter((glob) => !policy.ignore.includes(glob));
  if (added.length) {
    policy.ignore = [...policy.ignore, ...added];
    changes.push(`now ignoring ${list(added)}`);
    weakens = true;
  }
  const removed = [...new Set(edit.ignoreRemove ?? [])];
  const missing = removed.filter((glob) => !policy.ignore.includes(glob));
  if (missing.length) throw new EditFailure(`${list(missing)} ${missing.length === 1 ? "is" : "are"} not in the ignore list.`, policy.ignore.slice(0, 5));
  if (removed.length) {
    policy.ignore = policy.ignore.filter((glob) => !removed.includes(glob));
    changes.push(`no longer ignoring ${list(removed)}`);
  }
  if (!changes.length) throw new EditFailure("Nothing to change: the policy already has these values.");
  return { summary: `Updated policy: ${changes.join("; ")}.`, targets: [], weakens };
}

function setRuntime(context: EditContext, edit: EditOf<"set_runtime">): EditOutcome {
  const component = componentOrFail(context.blueprint, edit.id);
  const target = component as Record<string, unknown>;
  const runtime: Record<string, unknown> = { ...((target.runtime as Record<string, unknown> | undefined) ?? {}) };
  const changes: string[] = [];
  if (edit.health !== undefined) {
    if (edit.health === null) {
      if (runtime.health !== undefined) changes.push("health check removed");
      delete runtime.health;
    } else if (!same(runtime.health, edit.health)) {
      runtime.health = { ...edit.health };
      changes.push(`health check ${edit.health.method ?? "GET"} ${edit.health.url}${edit.health.expectStatus ? ` expecting ${edit.health.expectStatus}` : ""}`);
    }
  }
  if (edit.deployment !== undefined) {
    if (edit.deployment === null) {
      if (runtime.deployment !== undefined) changes.push("deployment removed");
      delete runtime.deployment;
    } else if (!same(runtime.deployment, edit.deployment)) {
      runtime.deployment = { ...edit.deployment };
      changes.push(`deployed to environment ${edit.deployment.environment}`);
    }
  }
  if (edit.workflow !== undefined) {
    if (edit.workflow === null) {
      if (runtime.workflow !== undefined) changes.push("workflow removed");
      delete runtime.workflow;
    } else if (!same(runtime.workflow, edit.workflow)) {
      runtime.workflow = { ...edit.workflow };
      changes.push(`workflow ${edit.workflow.file}`);
    }
  }
  if (!changes.length) throw new EditFailure(`Nothing to change: the runtime of "${component.name}" already has these values.`);
  if (Object.keys(runtime).length) target.runtime = runtime;
  else delete target.runtime;
  return { summary: `Set runtime of "${component.name}": ${changes.join("; ")}.`, targets: [component.id], weakens: false };
}

function applyOne(context: EditContext, edit: BlueprintEdit): EditOutcome {
  switch (edit.op) {
    case "add_component":
      return addComponent(context, edit);
    case "update_component":
      return updateComponent(context, edit);
    case "remove_component":
      return removeComponent(context, edit);
    case "rename_component":
      return renameComponent(context, edit);
    case "declare_dependency":
      return declareDependency(context, edit);
    case "remove_dependency":
      return removeDependency(context, edit);
    case "forbid_dependency":
      return forbidDependency(context, edit);
    case "allow_only":
      return allowOnly(context, edit);
    case "set_layers":
      return setLayers(context, edit);
    case "forbid_cycles":
      return forbidCycles(context, edit);
    case "protect_paths":
      return protectPaths(context, edit);
    case "restrict_secret":
      return restrictSecret(context, edit);
    case "update_rule":
      return updateRule(context, edit);
    case "remove_rule":
      return removeRule(context, edit);
    case "add_invariant":
      return addInvariant(context, edit);
    case "remove_invariant":
      return removeInvariant(context, edit);
    case "add_decision":
      return addDecision(context, edit);
    case "remove_decision":
      return removeDecision(context, edit);
    case "set_policy":
      return setPolicy(context, edit);
    case "set_runtime":
      return setRuntime(context, edit);
  }
}

function issueText(issues: readonly BlueprintIssue[]): string {
  return issues
    .slice(0, 4)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
}

/**
 * Apply typed edits in order. Pure (the input is never mutated) and atomic:
 * the first invalid edit throws a `BlueprintEditError` and nothing is applied.
 * The blueprint is re-validated after every edit, so the error names the edit
 * that broke it.
 */
export function applyBlueprintEdits(
  blueprint: Blueprint,
  edits: readonly BlueprintEditInput[],
  options: ApplyEditsOptions = {},
): { blueprint: Blueprint; applied: AppliedEdit[] } {
  const start = parseBlueprint(clone(blueprint));
  if (!start.ok) {
    throw new BlueprintEditError(-1, "", `The blueprint is invalid before any edit: ${issueText(start.issues)}`, { issues: start.issues });
  }
  const provenance: Provenance = {
    ...(options.provenance ?? { source: "human" as const }),
    ...(options.now !== undefined && options.provenance?.at === undefined ? { at: options.now } : {}),
  };
  let draft = start.blueprint;
  const applied: AppliedEdit[] = [];

  edits.forEach((raw, index) => {
    const opName = typeof (raw as { op?: unknown } | null)?.op === "string" ? (raw as { op: string }).op : "";
    const parsed = blueprintEditSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`)
        .join("; ");
      const ops = blueprintEditSchema.options.map((option) => option.shape.op.value);
      const unknownOp = !ops.includes(opName as BlueprintEditOp);
      throw new BlueprintEditError(index, opName, `Edit ${index + 1}${opName ? ` (${opName})` : ""} is not a valid edit: ${detail}`, {
        suggestions: unknownOp ? nearestIds(opName, ops) : undefined,
      });
    }
    const edit = parsed.data;
    let outcome: EditOutcome;
    try {
      outcome = applyOne({ blueprint: draft, provenance: { ...provenance }, now: options.now }, edit);
    } catch (error) {
      if (error instanceof EditFailure) throw new BlueprintEditError(index, edit.op, error.message, { suggestions: error.suggestions });
      throw error;
    }
    const checked = parseBlueprint(draft);
    if (!checked.ok) {
      throw new BlueprintEditError(index, edit.op, `Edit ${index + 1} (${edit.op}) would make the blueprint invalid: ${issueText(checked.issues)}`, {
        issues: checked.issues,
      });
    }
    draft = checked.blueprint;
    applied.push({ index, op: edit.op, ...outcome, targets: [...new Set(outcome.targets)] });
  });

  return { blueprint: draft, applied };
}

// ── Previews ──────────────────────────────────────────────────

/** Short multi-line summary of applied edits. */
export function describeEdits(applied: readonly AppliedEdit[]): string {
  if (!applied.length) return "No changes.";
  const lines = applied.map((edit, position) => `${position + 1}. ${edit.summary}${edit.weakens ? " [weakens the contract]" : ""}`);
  const weakening = applied.filter((edit) => edit.weakens).length;
  lines.push(
    `${applied.length} ${applied.length === 1 ? "change" : "changes"}${weakening ? `, ${weakening} of which ${weakening === 1 ? "weakens" : "weaken"} the contract` : ""}.`,
  );
  return lines.join("\n");
}

export interface BlueprintDelta {
  componentsAdded: string[];
  componentsRemoved: string[];
  componentsChanged: string[];
  rulesAdded: string[];
  rulesRemoved: string[];
  rulesChanged: string[];
  dependenciesAdded: string[];
  dependenciesRemoved: string[];
  other: string[];
}

function diffById<T extends { id: string }>(before: readonly T[], after: readonly T[]): { added: string[]; removed: string[]; changed: string[] } {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  return {
    added: after.filter((item) => !old.has(item.id)).map((item) => item.id),
    removed: before.filter((item) => !next.has(item.id)).map((item) => item.id),
    changed: after.filter((item) => old.has(item.id) && !same(old.get(item.id), item)).map((item) => item.id),
  };
}

/** Structural before/after delta for UI previews. Dependencies are written "from -> to". */
export function summarizeBlueprintDelta(before: Blueprint, after: Blueprint): BlueprintDelta {
  const components = diffById(before.components, after.components);
  const rules = diffById(before.rules, after.rules);
  const edge = (dependency: { from: string; to: string }) => `${dependency.from} -> ${dependency.to}`;
  const oldEdges = new Map(before.dependencies.map((dependency) => [edge(dependency), dependency]));
  const newEdges = new Map(after.dependencies.map((dependency) => [edge(dependency), dependency]));
  const other: string[] = [];

  for (const [key, dependency] of newEdges) {
    if (oldEdges.has(key) && !same(oldEdges.get(key), dependency)) other.push(`dependency changed: ${key}`);
  }
  const invariants = diffById(before.invariants, after.invariants);
  const decisions = diffById(before.decisions, after.decisions);
  for (const [label, diff] of [["invariant", invariants], ["decision", decisions]] as const) {
    for (const id of diff.added) other.push(`${label} added: ${id}`);
    for (const id of diff.removed) other.push(`${label} removed: ${id}`);
    for (const id of diff.changed) other.push(`${label} changed: ${id}`);
  }
  const oldPolicy = before.policy as Record<string, unknown>;
  const newPolicy = after.policy as Record<string, unknown>;
  for (const key of new Set([...Object.keys(oldPolicy), ...Object.keys(newPolicy)])) {
    if (same(oldPolicy[key], newPolicy[key])) continue;
    if (key === "ignore") {
      const old = new Set(before.policy.ignore);
      const next = new Set(after.policy.ignore);
      for (const glob of next) if (!old.has(glob)) other.push(`policy.ignore added: ${glob}`);
      for (const glob of old) if (!next.has(glob)) other.push(`policy.ignore removed: ${glob}`);
    } else if (typeof newPolicy[key] === "object" || typeof oldPolicy[key] === "object") {
      other.push(`policy.${key} changed`);
    } else {
      other.push(`policy.${key}: ${String(oldPolicy[key])} → ${String(newPolicy[key])}`);
    }
  }
  if (!same(before.system, after.system)) other.push("system changed");

  return {
    componentsAdded: components.added,
    componentsRemoved: components.removed,
    componentsChanged: components.changed,
    rulesAdded: rules.added,
    rulesRemoved: rules.removed,
    rulesChanged: rules.changed,
    dependenciesAdded: [...newEdges.keys()].filter((key) => !oldEdges.has(key)),
    dependenciesRemoved: [...oldEdges.keys()].filter((key) => !newEdges.has(key)),
    other,
  };
}
