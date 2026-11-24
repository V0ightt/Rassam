// Semantic diff of two blueprints. The contract is the thing agents are judged
// by, so every edit is classified: does it loosen the rules (`weakens`), or
// only add, tighten or reword them?

import { compileGlob } from "./glob";
import {
  selectorComponentRefs,
  type Assurance,
  type Blueprint,
  type BlueprintComponent,
  type BlueprintDecision,
  type BlueprintDependency,
  type BlueprintInvariant,
  type BlueprintRule,
  type RuleKind,
  type Selector,
  type Severity,
  type Verification,
} from "./schema";
import type { BlueprintChange } from "./types";

// ── Small helpers ─────────────────────────────────────────────

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function quote(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

function entries(selector: Selector | undefined): string[] {
  if (selector === undefined) return [];
  return Array.isArray(selector) ? selector : [selector];
}

interface SetDiff {
  added: string[];
  removed: string[];
}

function setDiff(base: readonly string[] | undefined, head: readonly string[] | undefined): SetDiff {
  const baseSet = new Set(base ?? []);
  const headSet = new Set(head ?? []);
  return {
    added: [...headSet].filter((value) => !baseSet.has(value)).sort(compareText),
    removed: [...baseSet].filter((value) => !headSet.has(value)).sort(compareText),
  };
}

function hasDiff(diff: SetDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0;
}

function describeSetDiff(diff: SetDiff): string {
  const parts: string[] = [];
  if (diff.removed.length) parts.push(`removed ${quote(diff.removed)}`);
  if (diff.added.length) parts.push(`added ${quote(diff.added)}`);
  return parts.join(", ");
}

/**
 * Selector edits split by effect on the selected set: `widened` means more is
 * selected (entry added or exclusion dropped), `narrowed` means less.
 */
interface SelectorDiff {
  widened: string[];
  narrowed: string[];
}

function selectorDiff(base: Selector | undefined, head: Selector | undefined): SelectorDiff {
  const diff = setDiff(entries(base), entries(head));
  const widened: string[] = [];
  const narrowed: string[] = [];
  for (const entry of diff.added) (entry.startsWith("!") ? narrowed : widened).push(entry);
  for (const entry of diff.removed) (entry.startsWith("!") ? widened : narrowed).push(entry);
  return { widened: widened.sort(compareText), narrowed: narrowed.sort(compareText) };
}

/** Human wording for a selector edit: exclusions read as "excluding X". */
function selectorWords(values: readonly string[], verbs: { plain: string; exclusion: string }): string[] {
  const plain = values.filter((value) => !value.startsWith("!"));
  const exclusions = values.filter((value) => value.startsWith("!")).map((value) => value.slice(1));
  const parts: string[] = [];
  if (plain.length) parts.push(`${verbs.plain} ${quote(plain)}`);
  if (exclusions.length) parts.push(`${verbs.exclusion} ${quote(exclusions)}`);
  return parts;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}

function sortedKeys(...maps: Array<Map<string, unknown>>): string[] {
  const keys = new Set<string>();
  for (const map of maps) for (const key of map.keys()) keys.add(key);
  return [...keys].sort(compareText);
}

const SEVERITY_RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };
const LEVEL_RANK: Record<string, number> = { off: 0, info: 1, warning: 2, error: 3 };
const ASSURANCE_RANK: Record<Assurance, number> = {
  unknown: 0,
  untested: 1,
  tested: 2,
  "property-tested": 3,
  "formally-verified": 4,
};
const DEFAULT_RULE_SEVERITY: Record<RuleKind, Severity> = {
  forbid: "error",
  "allow-only": "error",
  layers: "error",
  "secret-access": "error",
  "no-cycles": "warning",
  protect: "warning",
};
/** Invariants carry no documented default; an unset severity is treated as the strictest. */
const DEFAULT_INVARIANT_SEVERITY: Severity = "error";

// ── What base rules reference ─────────────────────────────────

function ruleSelectors(rule: BlueprintRule): Selector[] {
  switch (rule.kind) {
    case "forbid":
    case "allow-only":
      return [rule.from, rule.to];
    case "layers":
      return rule.layers;
    case "no-cycles":
      return rule.scope ? [rule.scope] : [];
    case "secret-access":
      return [rule.allow];
    case "protect":
      return [];
  }
}

interface RuleReferences {
  components: Set<string>;
  tagPatterns: string[];
}

function ruleReferences(blueprint: Blueprint): RuleReferences {
  const components = new Set<string>();
  const tagPatterns = new Set<string>();
  for (const rule of blueprint.rules) {
    for (const selector of ruleSelectors(rule)) {
      for (const ref of selectorComponentRefs(selector)) components.add(ref);
      for (const raw of entries(selector)) {
        const entry = raw.startsWith("!") ? raw.slice(1) : raw;
        if (entry.startsWith("tag:")) tagPatterns.add(entry.slice("tag:".length));
      }
    }
  }
  return { components, tagPatterns: [...tagPatterns].sort(compareText) };
}

/** Same matching as selectors: tag patterns are anchored globs. */
function tagSelected(tag: string, refs: RuleReferences): boolean {
  return refs.tagPatterns.some((pattern) => pattern === tag || compileGlob(`/${pattern}`).test(tag));
}

function isReferenced(component: BlueprintComponent, refs: RuleReferences): boolean {
  return refs.components.has(component.id) || (component.tags ?? []).some((tag) => tagSelected(tag, refs));
}

// ── Policy ────────────────────────────────────────────────────

function diffLevel(field: "undeclaredDependencies" | "unmappedFiles", base: string, head: string): BlueprintChange[] {
  if (base === head) return [];
  const lowered = LEVEL_RANK[head] < LEVEL_RANK[base];
  return [
    {
      kind: lowered ? "policy-weakened" : "policy-changed",
      target: `policy.${field}`,
      summary: `Policy ${field} ${lowered ? "lowered" : "raised"} from "${base}" to "${head}"`,
      weakens: lowered,
    },
  ];
}

function diffFlag(field: string, base: boolean, head: boolean, offMeaning: string): BlueprintChange[] {
  if (base === head) return [];
  const disabled = base && !head;
  return [
    {
      kind: disabled ? "policy-weakened" : "policy-changed",
      target: `policy.${field}`,
      summary: disabled ? `Policy ${field} turned off: ${offMeaning}` : `Policy ${field} turned on`,
      weakens: disabled,
    },
  ];
}

function diffPolicy(base: Blueprint, head: Blueprint): BlueprintChange[] {
  const changes: BlueprintChange[] = [
    ...diffLevel("undeclaredDependencies", base.policy.undeclaredDependencies, head.policy.undeclaredDependencies),
    ...diffLevel("unmappedFiles", base.policy.unmappedFiles, head.policy.unmappedFiles),
    ...diffFlag(
      "includeTypeOnly",
      base.policy.includeTypeOnly,
      head.policy.includeTypeOnly,
      "type-only imports no longer count in rules",
    ),
    ...diffFlag(
      "tripwires.defaults",
      base.policy.tripwires.defaults,
      head.policy.tripwires.defaults,
      "built-in tripwires for tests, CI, lockfiles and agent permissions are disabled",
    ),
  ];

  const tripwirePaths = setDiff(base.policy.tripwires.paths, head.policy.tripwires.paths);
  if (hasDiff(tripwirePaths)) {
    const weakens = tripwirePaths.removed.length > 0;
    changes.push({
      kind: weakens ? "policy-weakened" : "policy-changed",
      target: "policy.tripwires.paths",
      summary: weakens
        ? `Policy tripwires no longer protect ${quote(tripwirePaths.removed)}${
            tripwirePaths.added.length ? ` (added ${quote(tripwirePaths.added)})` : ""
          }`
        : `Policy tripwires now also protect ${quote(tripwirePaths.added)}`,
      weakens,
    });
  }

  changes.push(
    ...diffFlag(
      "verificationHeuristics",
      base.policy.verificationHeuristics,
      head.policy.verificationHeuristics,
      "weakened verification (skipped tests, removed assertions) is no longer flagged",
    ),
  );

  const before = base.policy.verificationWeakening;
  const after = head.policy.verificationWeakening;
  if (before !== after) {
    const loosened = after === "warn";
    changes.push({
      kind: loosened ? "policy-weakened" : "policy-changed",
      target: "policy.verificationWeakening",
      summary: loosened
        ? `Policy verificationWeakening lowered from "${before}" to "${after}": skipped, deleted or gutted tests no longer need a human approval`
        : `Policy verificationWeakening raised from "${before}" to "${after}": skipped, deleted or gutted tests need a human approval`,
      weakens: loosened,
    });
  }

  const ignore = setDiff(base.policy.ignore, head.policy.ignore);
  if (hasDiff(ignore)) {
    const weakens = ignore.added.length > 0;
    changes.push({
      kind: weakens ? "policy-weakened" : "policy-changed",
      target: "policy.ignore",
      summary: weakens
        ? `Policy ignore now hides ${quote(ignore.added)} from analysis${
            ignore.removed.length ? ` (removed ${quote(ignore.removed)})` : ""
          }`
        : `Policy ignore no longer hides ${quote(ignore.removed)}`,
      weakens,
    });
  }
  return changes;
}

// ── Components ────────────────────────────────────────────────

function diffComponent(base: BlueprintComponent, head: BlueprintComponent, refs: RuleReferences): BlueprintChange | null {
  const parts: string[] = [];
  let weakens = false;
  const referenced = isReferenced(base, refs);

  if (base.name !== head.name) parts.push(`name "${base.name}" → "${head.name}"`);
  if (base.kind !== head.kind) {
    parts.push(`kind "${base.kind}" → "${head.kind}"`);
    // Components of kind "test" are exempt from undeclared-dependency checks.
    if (head.kind === "test" && base.kind !== "test") weakens = true;
  }
  if (Boolean(base.public) !== Boolean(head.public)) {
    parts.push(head.public ? "now public (open to every component)" : "no longer public");
    // A public component accepts undeclared dependencies from everyone.
    if (head.public) weakens = true;
  }

  const paths = setDiff(base.paths, head.paths);
  if (hasDiff(paths)) {
    parts.push(`paths (${describeSetDiff(paths)})`);
    if (referenced && paths.removed.length) weakens = true;
  }
  const exclude = setDiff(base.exclude, head.exclude);
  if (hasDiff(exclude)) {
    parts.push(`exclude (${describeSetDiff(exclude)})`);
    if (referenced && exclude.added.length) weakens = true;
  }
  if (base.priority !== head.priority) {
    parts.push(`priority ${base.priority ?? "unset"} → ${head.priority ?? "unset"}`);
    // A constrained component with lower priority can lose paths to overlapping components.
    // (Raised priorities elsewhere are checked against actual ownership by the gate.)
    if (referenced && (head.priority ?? 0) < (base.priority ?? 0)) weakens = true;
  }

  const tags = setDiff(base.tags, head.tags);
  if (hasDiff(tags)) {
    parts.push(`tags (${describeSetDiff(tags)})`);
    if (tags.removed.some((tag) => tagSelected(tag, refs))) weakens = true;
  }
  const owners = setDiff(base.owners, head.owners);
  if (hasDiff(owners)) parts.push(`owners (${describeSetDiff(owners)})`);
  if ((base.intent ?? "") !== (head.intent ?? "")) parts.push("intent");

  if (base.assurance !== head.assurance) {
    const before = base.assurance ?? "unknown";
    const after = head.assurance ?? "unknown";
    if (before !== after) {
      parts.push(`assurance ${before} → ${after}`);
      if (before !== "unknown" && ASSURANCE_RANK[after] < ASSURANCE_RANK[before]) weakens = true;
    }
  }
  if (Boolean(base.external) !== Boolean(head.external)) {
    parts.push(head.external ? "now marked external" : "no longer marked external");
  }
  if (stable(base.runtime ?? null) !== stable(head.runtime ?? null)) parts.push("runtime");

  if (parts.length === 0) return null;
  return {
    kind: "component-changed",
    target: base.id,
    summary: `Component "${base.id}" changed: ${parts.join("; ")}`,
    weakens,
  };
}

function diffComponents(base: Blueprint, head: Blueprint, refs: RuleReferences): BlueprintChange[] {
  const before = byId(base.components);
  const after = byId(head.components);
  const changes: BlueprintChange[] = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "component-added", target: id, summary: `Component "${id}" added`, weakens: false });
    } else if (old && !next) {
      const referenced = isReferenced(old, refs);
      changes.push({
        kind: "component-removed",
        target: id,
        summary: referenced
          ? `Component "${id}" removed while rules still reference it`
          : `Component "${id}" removed`,
        weakens: referenced,
      });
    } else if (old && next) {
      const change = diffComponent(old, next, refs);
      if (change) changes.push(change);
    }
  }
  return changes;
}

// ── Dependencies ──────────────────────────────────────────────

function dependencyKey(dependency: BlueprintDependency): string {
  return `${dependency.from}->${dependency.to}`;
}

function dependencyMap(blueprint: Blueprint): Map<string, BlueprintDependency> {
  const map = new Map<string, BlueprintDependency>();
  for (const dependency of blueprint.dependencies) {
    const key = dependencyKey(dependency);
    if (!map.has(key)) map.set(key, dependency);
  }
  return map;
}

function diffDependencies(base: Blueprint, head: Blueprint): BlueprintChange[] {
  const before = dependencyMap(base);
  const after = dependencyMap(head);
  const strict = base.policy.undeclaredDependencies === "error";
  const changes: BlueprintChange[] = [];
  for (const key of sortedKeys(before, after)) {
    const old = before.get(key);
    const next = after.get(key);
    if (!old && next) {
      changes.push({
        kind: "dependency-added",
        target: key,
        summary: strict
          ? `Dependency "${next.from}" → "${next.to}" declared; undeclared dependencies are errors, so this legalizes a new edge`
          : `Dependency "${next.from}" → "${next.to}" declared`,
        weakens: strict,
      });
    } else if (old && !next) {
      changes.push({
        kind: "dependency-removed",
        target: key,
        summary: `Dependency "${old.from}" → "${old.to}" is no longer declared`,
        weakens: false,
      });
    }
  }
  return changes;
}

// ── Rules ─────────────────────────────────────────────────────

interface RuleEdits {
  weakened: string[];
  strengthened: string[];
  neutral: string[];
}

function ruleSeverity(rule: BlueprintRule): Severity {
  return rule.severity ?? DEFAULT_RULE_SEVERITY[rule.kind];
}

function includesTypeOnly(rule: BlueprintRule): boolean {
  return "includeTypeOnly" in rule ? rule.includeTypeOnly ?? true : true;
}

function layerKey(layer: Selector): string {
  return [...entries(layer)].sort(compareText).join(" + ");
}

function diffSeverity(base: Severity, head: Severity, edits: RuleEdits): void {
  if (base === head) return;
  const lowered = SEVERITY_RANK[head] < SEVERITY_RANK[base];
  (lowered ? edits.weakened : edits.strengthened).push(
    `severity ${lowered ? "lowered" : "raised"} from "${base}" to "${head}"`,
  );
}

function diffRuleBody(base: BlueprintRule, head: BlueprintRule, edits: RuleEdits): void {
  if (base.kind === "forbid" && head.kind === "forbid") {
    const from = selectorDiff(base.from, head.from);
    const to = selectorDiff(base.to, head.to);
    edits.weakened.push(
      ...selectorWords(from.narrowed, { plain: "no longer applies to", exclusion: "now exempts" }),
      ...selectorWords(to.narrowed, { plain: "no longer forbids", exclusion: "now permits" }),
    );
    edits.strengthened.push(
      ...selectorWords(from.widened, { plain: "now also applies to", exclusion: "no longer exempts" }),
      ...selectorWords(to.widened, { plain: "now also forbids", exclusion: "no longer permits" }),
    );
  } else if (base.kind === "allow-only" && head.kind === "allow-only") {
    const from = selectorDiff(base.from, head.from);
    const to = selectorDiff(base.to, head.to);
    edits.weakened.push(
      ...selectorWords(from.narrowed, { plain: "no longer restricts", exclusion: "now exempts" }),
      ...selectorWords(to.widened, { plain: "now also allows", exclusion: "no longer excludes" }),
    );
    edits.strengthened.push(
      ...selectorWords(from.widened, { plain: "now also restricts", exclusion: "no longer exempts" }),
      ...selectorWords(to.narrowed, { plain: "no longer allows", exclusion: "now excludes" }),
    );
  } else if (base.kind === "layers" && head.kind === "layers") {
    const before = base.layers.map(layerKey);
    const after = head.layers.map(layerKey);
    const removed = before.filter((layer) => !after.includes(layer));
    const added = after.filter((layer) => !before.includes(layer));
    const commonBefore = before.filter((layer) => after.includes(layer));
    const commonAfter = after.filter((layer) => before.includes(layer));
    if (removed.length) edits.weakened.push(`no longer has layer ${quote(removed)}`);
    if (commonBefore.join("\u0000") !== commonAfter.join("\u0000")) {
      edits.weakened.push(`layer order changed to ${after.join(" > ")}`);
    }
    if (added.length) edits.strengthened.push(`added layer ${quote(added)}`);
  } else if (base.kind === "protect" && head.kind === "protect") {
    const paths = setDiff(base.paths, head.paths);
    if (paths.removed.length) edits.weakened.push(`no longer protects ${quote(paths.removed)}`);
    if (paths.added.length) edits.strengthened.push(`now also protects ${quote(paths.added)}`);
  } else if (base.kind === "secret-access" && head.kind === "secret-access") {
    const allow = selectorDiff(base.allow, head.allow);
    const secrets = setDiff(base.secrets, head.secrets);
    edits.weakened.push(
      ...selectorWords(allow.widened, { plain: "now also lets", exclusion: "no longer excludes" }).map((part) =>
        part.startsWith("now also lets") ? `${part} read the secrets` : part,
      ),
    );
    if (secrets.removed.length) edits.weakened.push(`no longer guards ${quote(secrets.removed)}`);
    edits.strengthened.push(
      ...selectorWords(allow.narrowed, { plain: "no longer lets", exclusion: "now excludes" }).map((part) =>
        part.startsWith("no longer lets") ? `${part} read the secrets` : part,
      ),
    );
    if (secrets.added.length) edits.strengthened.push(`now also guards ${quote(secrets.added)}`);
  } else if (base.kind === "no-cycles" && head.kind === "no-cycles") {
    if (base.scope === undefined && head.scope !== undefined) {
      edits.weakened.push(`now only checks cycles within ${quote(entries(head.scope))}`);
    } else if (base.scope !== undefined && head.scope === undefined) {
      edits.strengthened.push("now checks cycles across every component");
    } else {
      const scope = selectorDiff(base.scope, head.scope);
      if (scope.narrowed.length) {
        edits.weakened.push(
          ...selectorWords(scope.narrowed, { plain: "scope no longer covers", exclusion: "scope now excludes" }),
        );
      }
      if (scope.widened.length) {
        edits.strengthened.push(
          ...selectorWords(scope.widened, { plain: "scope now also covers", exclusion: "scope no longer excludes" }),
        );
      }
    }
  }
}

function diffRule(base: BlueprintRule, head: BlueprintRule): BlueprintChange | null {
  if (base.kind !== head.kind) {
    return {
      kind: "rule-changed",
      target: base.id,
      summary: `Rule "${base.id}" changed kind from "${base.kind}" to "${head.kind}"`,
      weakens: true,
    };
  }
  const edits: RuleEdits = { weakened: [], strengthened: [], neutral: [] };
  diffSeverity(ruleSeverity(base), ruleSeverity(head), edits);
  if (includesTypeOnly(base) !== includesTypeOnly(head)) {
    if (includesTypeOnly(base)) edits.weakened.push("no longer counts type-only imports");
    else edits.strengthened.push("now counts type-only imports");
  }
  diffRuleBody(base, head, edits);
  if ((base.reason ?? "") !== (head.reason ?? "")) edits.neutral.push("reason reworded");

  const parts = [...edits.weakened, ...edits.strengthened, ...edits.neutral];
  if (parts.length === 0) return null;
  const kind = edits.weakened.length ? "rule-weakened" : edits.strengthened.length ? "rule-strengthened" : "rule-changed";
  return { kind, target: base.id, summary: `Rule "${base.id}" ${parts.join("; ")}`, weakens: kind === "rule-weakened" };
}

function diffRules(base: Blueprint, head: Blueprint): BlueprintChange[] {
  const before = byId(base.rules);
  const after = byId(head.rules);
  const changes: BlueprintChange[] = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "rule-added", target: id, summary: `Rule "${id}" (${next.kind}) added`, weakens: false });
    } else if (old && !next) {
      changes.push({ kind: "rule-removed", target: id, summary: `Rule "${id}" (${old.kind}) removed`, weakens: true });
    } else if (old && next) {
      const change = diffRule(old, next);
      if (change) changes.push(change);
    }
  }
  return changes;
}

// ── Invariants ────────────────────────────────────────────────

function diffInvariant(base: BlueprintInvariant, head: BlueprintInvariant): BlueprintChange | null {
  const weakened: string[] = [];
  const other: string[] = [];

  const beforeRun = base.check?.run;
  const afterRun = head.check?.run;
  if (beforeRun !== afterRun) {
    if (beforeRun === undefined) other.push("check command added");
    else weakened.push(afterRun === undefined ? "check command removed" : "check command changed");
  }
  const tests = setDiff(base.check?.tests, head.check?.tests);
  if (tests.removed.length) weakened.push(`no longer checked by tests ${quote(tests.removed)}`);
  if (tests.added.length) other.push(`now also checked by tests ${quote(tests.added)}`);

  const beforeSeverity = base.severity ?? DEFAULT_INVARIANT_SEVERITY;
  const afterSeverity = head.severity ?? DEFAULT_INVARIANT_SEVERITY;
  if (beforeSeverity !== afterSeverity) {
    const lowered = SEVERITY_RANK[afterSeverity] < SEVERITY_RANK[beforeSeverity];
    (lowered ? weakened : other).push(
      `severity ${lowered ? "lowered" : "raised"} from "${beforeSeverity}" to "${afterSeverity}"`,
    );
  }
  if (base.statement !== head.statement) other.push("statement reworded");
  const components = setDiff(base.components, head.components);
  if (hasDiff(components)) other.push(`components (${describeSetDiff(components)})`);

  const parts = [...weakened, ...other];
  if (parts.length === 0) return null;
  return {
    kind: "invariant-changed",
    target: base.id,
    summary: `Invariant "${base.id}" changed: ${parts.join("; ")}`,
    weakens: weakened.length > 0,
  };
}

function diffInvariants(base: Blueprint, head: Blueprint): BlueprintChange[] {
  const before = byId(base.invariants);
  const after = byId(head.invariants);
  const changes: BlueprintChange[] = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "invariant-added", target: id, summary: `Invariant "${id}" added`, weakens: false });
    } else if (old && !next) {
      changes.push({ kind: "invariant-removed", target: id, summary: `Invariant "${id}" removed`, weakens: true });
    } else if (old && next) {
      const change = diffInvariant(old, next);
      if (change) changes.push(change);
    }
  }
  return changes;
}

// ── Decisions ─────────────────────────────────────────────────

function diffDecision(base: BlueprintDecision, head: BlueprintDecision): BlueprintChange | null {
  const parts: string[] = [];
  if (base.status !== head.status) parts.push(`status "${base.status}" → "${head.status}"`);
  if (base.title !== head.title) parts.push("title reworded");
  if (base.decision !== head.decision) parts.push("decision text changed");
  if (parts.length === 0) return null;
  return {
    kind: "decision-changed",
    target: base.id,
    summary: `Decision "${base.id}" changed: ${parts.join("; ")}`,
    weakens: false,
  };
}

function diffDecisions(base: Blueprint, head: Blueprint): BlueprintChange[] {
  const before = byId(base.decisions);
  const after = byId(head.decisions);
  const changes: BlueprintChange[] = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "decision-added", target: id, summary: `Decision "${id}" added`, weakens: false });
    } else if (old && !next) {
      changes.push({ kind: "decision-removed", target: id, summary: `Decision "${id}" removed`, weakens: false });
    } else if (old && next) {
      const change = diffDecision(old, next);
      if (change) changes.push(change);
    }
  }
  return changes;
}

// ── Verification stamps ───────────────────────────────────────

interface Stamped {
  verified?: Verification;
}

function signer(stamp: Verification): string {
  return `${stamp.by} at ${stamp.at}`;
}

function diffStamps(
  label: string,
  before: Map<string, Stamped>,
  after: Map<string, Stamped>,
): BlueprintChange[] {
  const changes: BlueprintChange[] = [];
  for (const key of [...after.keys()].sort(compareText)) {
    const old = before.get(key)?.verified;
    const next = after.get(key)?.verified;
    if (stable(old ?? null) === stable(next ?? null)) continue;
    let detail: string;
    if (!old && next) detail = `added (signed by ${signer(next)})`;
    else if (old && !next) detail = `removed (was signed by ${signer(old)})`;
    else if (old && next) detail = `changed (signed by ${signer(next)}; previously ${signer(old)})`;
    else continue;
    changes.push({
      kind: "verification-changed",
      target: `${label}:${key}`,
      summary: `Verification of ${label} "${key}" ${detail}`,
      weakens: false,
    });
  }
  return changes;
}

function diffVerification(base: Blueprint, head: Blueprint): BlueprintChange[] {
  return [
    ...diffStamps("component", byId(base.components), byId(head.components)),
    ...diffStamps("dependency", dependencyMap(base), dependencyMap(head)),
    ...diffStamps("rule", byId(base.rules), byId(head.rules)),
    ...diffStamps("invariant", byId(base.invariants), byId(head.invariants)),
  ];
}

// ── Entry point ───────────────────────────────────────────────

function sortedIds<T extends { id: string }>(items: readonly T[]): string[] {
  return [...byId(items).keys()].sort(compareText);
}

function describeNewBlueprint(head: Blueprint): BlueprintChange[] {
  const rules = byId(head.rules);
  return [
    ...sortedIds(head.components).map<BlueprintChange>((id) => ({
      kind: "component-added",
      target: id,
      summary: `Component "${id}" added`,
      weakens: false,
    })),
    ...[...dependencyMap(head).entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map<BlueprintChange>(([key, dependency]) => ({
        kind: "dependency-added",
        target: key,
        summary: `Dependency "${dependency.from}" → "${dependency.to}" declared`,
        weakens: false,
      })),
    ...sortedIds(head.rules).map<BlueprintChange>((id) => ({
      kind: "rule-added",
      target: id,
      summary: `Rule "${id}" (${rules.get(id)?.kind ?? "rule"}) added`,
      weakens: false,
    })),
    ...sortedIds(head.invariants).map<BlueprintChange>((id) => ({
      kind: "invariant-added",
      target: id,
      summary: `Invariant "${id}" added`,
      weakens: false,
    })),
    ...sortedIds(head.decisions).map<BlueprintChange>((id) => ({
      kind: "decision-added",
      target: id,
      summary: `Decision "${id}" added`,
      weakens: false,
    })),
  ];
}

/**
 * Semantic diff between the blueprint at the base of a change and at its head.
 * Order: policy, components, dependencies, rules, invariants, decisions,
 * verification; within each section by id.
 */
export function diffBlueprints(base: Blueprint | null, head: Blueprint | null): BlueprintChange[] {
  if (!base && !head) return [];
  if (base && !head) {
    return [{ kind: "policy-weakened", target: "blueprint", summary: "The blueprint was deleted", weakens: true }];
  }
  if (!base && head) return describeNewBlueprint(head);
  if (!base || !head) return [];

  const refs = ruleReferences(base);
  return [
    ...diffPolicy(base, head),
    ...diffComponents(base, head, refs),
    ...diffDependencies(base, head),
    ...diffRules(base, head),
    ...diffInvariants(base, head),
    ...diffDecisions(base, head),
    ...diffVerification(base, head),
  ];
}
