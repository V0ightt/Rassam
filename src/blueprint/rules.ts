import { cyclePath, findCycles } from "./graph";
import {
  describeSelector,
  matchesComponent,
  matchesFile,
  matchesPackage,
  resolveSelector,
  type ResolvedSelector,
} from "./selectors";
import type { Blueprint, BlueprintRule, Severity } from "./schema";
import type { ComponentGraph, ComponentMembership, FileGraph, Finding, FindingKind, FindingLocation } from "./types";
import { compileGlob } from "./glob";
import { fingerprint, plural } from "./util";

/** A finding before novelty and scoring are known. */
export type Violation = Omit<Finding, "isNew" | "score">;

const DEFAULT_RULE_SEVERITY: Record<BlueprintRule["kind"], Severity> = {
  forbid: "error",
  "allow-only": "error",
  layers: "error",
  "secret-access": "error",
  "no-cycles": "warning",
  protect: "warning",
};

export function ruleSeverity(rule: BlueprintRule): Severity {
  return rule.severity ?? DEFAULT_RULE_SEVERITY[rule.kind];
}

export type CompiledRule =
  | { rule: Extract<BlueprintRule, { kind: "forbid" }>; from: ResolvedSelector; to: ResolvedSelector; includeTypeOnly: boolean }
  | { rule: Extract<BlueprintRule, { kind: "allow-only" }>; from: ResolvedSelector; to: ResolvedSelector; includeTypeOnly: boolean }
  | { rule: Extract<BlueprintRule, { kind: "layers" }>; layers: ResolvedSelector[]; includeTypeOnly: boolean }
  | { rule: Extract<BlueprintRule, { kind: "no-cycles" }>; scope: ResolvedSelector | null; includeTypeOnly: boolean }
  | { rule: Extract<BlueprintRule, { kind: "secret-access" }>; allow: ResolvedSelector; secrets: ReturnType<typeof compileGlob>[] }
  | { rule: Extract<BlueprintRule, { kind: "protect" }> };

export function compileRules(blueprint: Blueprint): CompiledRule[] {
  const typeOnlyDefault = blueprint.policy.includeTypeOnly;
  return blueprint.rules.map((rule): CompiledRule => {
    switch (rule.kind) {
      case "forbid":
      case "allow-only":
        return {
          rule,
          from: resolveSelector(rule.from, blueprint),
          to: resolveSelector(rule.to, blueprint),
          includeTypeOnly: rule.includeTypeOnly ?? typeOnlyDefault,
        } as CompiledRule;
      case "layers":
        return {
          rule,
          layers: rule.layers.map((layer) => resolveSelector(layer, blueprint)),
          includeTypeOnly: rule.includeTypeOnly ?? typeOnlyDefault,
        };
      case "no-cycles":
        return {
          rule,
          scope: rule.scope ? resolveSelector(rule.scope, blueprint) : null,
          includeTypeOnly: rule.includeTypeOnly ?? typeOnlyDefault,
        };
      case "secret-access":
        return {
          rule,
          allow: resolveSelector(rule.allow, blueprint),
          secrets: rule.secrets.map((pattern) => compileGlob(`/${pattern}`)),
        };
      case "protect":
        return { rule };
    }
  });
}

export interface Labeler {
  component(id: string | null | undefined): string;
  file(path: string): string;
}

export function createLabeler(blueprint: Blueprint | null): Labeler {
  const names = new Map((blueprint?.components ?? []).map((component) => [component.id, component.name]));
  return {
    component: (id) => (id ? names.get(id) ?? id : "unmapped code"),
    file: (path) => path,
  };
}

/** A dependency to test against edge rules: an internal file or an external package. */
export type DependencyTarget =
  | { kind: "internal"; path: string; component: string | null }
  | { kind: "external"; pkg: string };

export interface EdgeRuleHit {
  rule: BlueprintRule;
  kind: FindingKind;
  severity: Severity;
  title: string;
  explanation: string;
}

function layerIndex(layers: ResolvedSelector[], target: DependencyTarget): number {
  return layers.findIndex((layer) => (
    target.kind === "internal" ? matchesFile(layer, target.path, target.component) : matchesPackage(layer, target.pkg)
  ));
}

/**
 * Evaluate forbid / allow-only / layers rules for a single dependency. Shared
 * by the gate (every observed edge) and by MCP `check_dependency` (a planned edge).
 */
export function edgeRuleHits(
  compiled: readonly CompiledRule[],
  from: { path: string; component: string | null },
  target: DependencyTarget,
  typeOnly: boolean,
  labels: Labeler,
): EdgeRuleHit[] {
  const hits: EdgeRuleHit[] = [];
  const targetLabel = target.kind === "internal" ? labels.component(target.component) : `package ${target.pkg}`;
  const fromLabel = labels.component(from.component);

  for (const entry of compiled) {
    const rule = entry.rule;
    if (rule.kind === "forbid" && "to" in entry) {
      if (typeOnly && !entry.includeTypeOnly) continue;
      if (!matchesFile(entry.from, from.path, from.component)) continue;
      const hit = target.kind === "internal"
        ? matchesFile(entry.to, target.path, target.component)
        : matchesPackage(entry.to, target.pkg);
      if (!hit) continue;
      hits.push({
        rule,
        kind: "forbidden-dependency",
        severity: ruleSeverity(rule),
        title: `${fromLabel} must not depend on ${targetLabel}`,
        explanation: `Rule "${rule.id}" forbids ${describeSelector(rule.from)} → ${describeSelector(rule.to)}.`,
      });
    } else if (rule.kind === "allow-only" && "to" in entry) {
      if (typeOnly && !entry.includeTypeOnly) continue;
      if (!matchesFile(entry.from, from.path, from.component)) continue;
      if (target.kind === "internal") {
        if (target.component !== null && target.component === from.component) continue;
        if (matchesFile(entry.to, target.path, target.component)) continue;
      } else {
        if (!entry.to.hasPackages) continue;
        if (matchesPackage(entry.to, target.pkg)) continue;
      }
      hits.push({
        rule,
        kind: "allow-only-violation",
        severity: ruleSeverity(rule),
        title: `${fromLabel} may only depend on ${describeSelector(rule.to)}`,
        explanation: `Rule "${rule.id}" allows ${describeSelector(rule.from)} to depend only on ${describeSelector(rule.to)}; ${targetLabel} is outside that set.`,
      });
    } else if (rule.kind === "layers" && "layers" in entry) {
      if (typeOnly && !entry.includeTypeOnly) continue;
      const fromLayer = layerIndex(entry.layers, { kind: "internal", path: from.path, component: from.component });
      const toLayer = layerIndex(entry.layers, target);
      if (fromLayer < 0 || toLayer < 0 || toLayer >= fromLayer) continue;
      hits.push({
        rule,
        kind: "layer-violation",
        severity: ruleSeverity(rule),
        title: `Layer violation: ${describeSelector(rule.layers[fromLayer])} depends on ${describeSelector(rule.layers[toLayer])}`,
        explanation: `Rule "${rule.id}" orders layers top → bottom (${rule.layers.map((layer) => describeSelector(layer)).join(" → ")}); a lower layer must not depend on a higher one.`,
      });
    }
  }
  return hits;
}

const MAX_FINDINGS_PER_RULE = 400;

export interface SnapshotModel {
  blueprint: Blueprint;
  fileGraph: FileGraph;
  membership: ComponentMembership;
  componentGraph: ComponentGraph;
}

/** Evaluate every rule against an observed snapshot. */
export function evaluateRules(model: SnapshotModel, compiled = compileRules(model.blueprint)): Violation[] {
  const { blueprint, fileGraph, membership, componentGraph } = model;
  const labels = createLabeler(blueprint);
  const violations: Violation[] = [];
  const perRule = new Map<string, number>();
  const push = (ruleId: string, violation: Violation): void => {
    const count = perRule.get(ruleId) ?? 0;
    if (count >= MAX_FINDINGS_PER_RULE) return;
    perRule.set(ruleId, count + 1);
    violations.push(violation);
  };

  const edgeRules = compiled.filter((entry) => entry.rule.kind === "forbid" || entry.rule.kind === "allow-only" || entry.rule.kind === "layers");
  if (edgeRules.length) {
    // Internal edges: one finding per (rule, source file, target file).
    const seen = new Set<string>();
    for (const edge of fileGraph.edges) {
      const fromComponent = membership.fileToComponent.get(edge.from) ?? null;
      const toComponent = membership.fileToComponent.get(edge.to) ?? null;
      for (const hit of edgeRuleHits(edgeRules, { path: edge.from, component: fromComponent }, { kind: "internal", path: edge.to, component: toComponent }, edge.typeOnly, labels)) {
        const id = fingerprint(hit.kind, hit.rule.id, edge.from, edge.to);
        if (seen.has(id)) continue;
        seen.add(id);
        push(hit.rule.id, {
          id,
          kind: hit.kind,
          severity: hit.severity,
          ruleId: hit.rule.id,
          title: hit.title,
          message: `${edge.from} imports ${edge.to}${edge.typeOnly ? " (type-only)" : ""}. ${hit.explanation}`,
          reason: hit.rule.reason,
          components: [fromComponent, toComponent].filter((value): value is string => Boolean(value)),
          locations: [{ path: edge.from, line: edge.line }],
        });
      }
    }
    // External packages.
    for (const ref of fileGraph.externals) {
      const fromComponent = membership.fileToComponent.get(ref.from) ?? null;
      for (const hit of edgeRuleHits(edgeRules, { path: ref.from, component: fromComponent }, { kind: "external", pkg: ref.pkg }, ref.typeOnly, labels)) {
        const id = fingerprint(hit.kind, hit.rule.id, ref.from, `pkg:${ref.pkg}`);
        if (seen.has(id)) continue;
        seen.add(id);
        push(hit.rule.id, {
          id,
          kind: hit.kind,
          severity: hit.severity,
          ruleId: hit.rule.id,
          title: hit.title,
          message: `${ref.from} imports package "${ref.pkg}". ${hit.explanation}`,
          reason: hit.rule.reason,
          components: fromComponent ? [fromComponent] : [],
          locations: [{ path: ref.from, line: ref.line }],
        });
      }
    }
  }

  for (const entry of compiled) {
    const rule = entry.rule;
    if (rule.kind === "no-cycles" && "scope" in entry) {
      const nodes = blueprint.components
        .filter((component) => !entry.scope || matchesComponent(entry.scope, component.id))
        .map((component) => component.id);
      const edges = componentGraph.edges.filter((edge) => entry.includeTypeOnly || !edge.typeOnly);
      for (const members of findCycles(nodes, edges)) {
        const path = cyclePath(members, edges);
        const locations: FindingLocation[] = [];
        for (let index = 0; index + 1 < path.length && locations.length < 10; index += 1) {
          const edge = edges.find((candidate) => candidate.from === path[index] && candidate.to === path[index + 1]);
          const evidence = edge?.evidence.find((item) => entry.includeTypeOnly || !item.typeOnly) ?? edge?.evidence[0];
          if (evidence) locations.push({ path: evidence.from, line: evidence.line });
        }
        push(rule.id, {
          id: fingerprint("dependency-cycle", rule.id, members.join(",")),
          kind: "dependency-cycle",
          severity: ruleSeverity(rule),
          ruleId: rule.id,
          title: `Dependency cycle: ${path.map((id) => labels.component(id)).join(" → ")}`,
          message: `${plural(members.length, "component")} depend on each other in a cycle. Break one edge to restore a clear direction of dependency.`,
          reason: rule.reason,
          components: members,
          locations,
        });
      }
    } else if (rule.kind === "secret-access" && "secrets" in entry) {
      for (const [path, facts] of fileGraph.facts) {
        const component = membership.fileToComponent.get(path) ?? null;
        if (matchesFile(entry.allow, path, component)) continue;
        for (const ref of facts.envRefs) {
          if (!entry.secrets.some((matcher) => matcher.test(ref.name))) continue;
          push(rule.id, {
            id: fingerprint("secret-access", rule.id, path, ref.name),
            kind: "secret-access",
            severity: ruleSeverity(rule),
            ruleId: rule.id,
            title: `${ref.name} may only be read by ${describeSelector(rule.allow)}`,
            message: `${path} reads ${ref.name} at line ${ref.line}, outside the components allowed to hold this secret.`,
            reason: rule.reason,
            components: component ? [component] : [],
            locations: [{ path, line: ref.line }],
          });
        }
      }
    }
  }
  return violations;
}

/** Findings that come from policy rather than explicit rules. */
export function evaluatePolicy(model: SnapshotModel): Violation[] {
  const { blueprint, fileGraph, membership, componentGraph } = model;
  const labels = createLabeler(blueprint);
  const violations: Violation[] = [];
  const policy = blueprint.policy;
  const componentById = new Map(blueprint.components.map((component) => [component.id, component]));

  if (policy.undeclaredDependencies !== "off") {
    const declared = new Set(blueprint.dependencies.map((dependency) => `${dependency.from}\u0000${dependency.to}`));
    for (const edge of componentGraph.edges) {
      if (!policy.includeTypeOnly && edge.typeOnly) continue;
      if (declared.has(`${edge.from}\u0000${edge.to}`)) continue;
      // Tests may depend on anything; they are leaves by convention.
      if (componentById.get(edge.from)?.kind === "test") continue;
      // Public components (contracts, types, utilities) are open to every component.
      if (componentById.get(edge.to)?.public) continue;
      violations.push({
        id: fingerprint("undeclared-dependency", edge.from, edge.to),
        kind: "undeclared-dependency",
        severity: policy.undeclaredDependencies,
        title: `Undeclared dependency: ${labels.component(edge.from)} → ${labels.component(edge.to)}`,
        message: `${plural(edge.count, "import")} from ${labels.component(edge.from)} into ${labels.component(edge.to)} ${edge.count === 1 ? "is" : "are"} not declared in the blueprint. Declare the dependency if it is intended, or remove it.`,
        components: [edge.from, edge.to],
        locations: edge.evidence.slice(0, 5).map((evidence) => ({ path: evidence.from, line: evidence.line })),
      });
    }
  }

  if (policy.unmappedFiles !== "off") {
    const unmappedSource = membership.unmapped.filter((path) => fileGraph.facts.has(path));
    if (unmappedSource.length) {
      violations.push({
        id: fingerprint("unmapped-file", "aggregate"),
        kind: "unmapped-file",
        severity: policy.unmappedFiles,
        title: `${plural(unmappedSource.length, "source file")} not claimed by any component`,
        message: `Add these paths to a component (or to policy.ignore) so rules can see them: ${unmappedSource.slice(0, 5).join(", ")}${unmappedSource.length > 5 ? ", …" : ""}`,
        components: [],
        locations: unmappedSource.slice(0, 50).map((path) => ({ path })),
      });
    }
  }

  for (const component of blueprint.components) {
    if (component.external || !component.paths.length) continue;
    const files = membership.componentFiles.get(component.id) ?? [];
    if (!files.length) {
      violations.push({
        id: fingerprint("empty-component", component.id),
        kind: "empty-component",
        severity: "warning",
        title: `Component "${component.name}" matches no files`,
        message: `None of its paths (${component.paths.join(", ")}) match a file. The globs may be stale after a move or rename.`,
        components: [component.id],
        locations: [],
      });
      continue;
    }
    const declared = component.assurance;
    if (declared === "tested" || declared === "property-tested" || declared === "formally-verified") {
      const hasTests = (componentGraph.tests.get(component.id)?.length ?? 0) > 0
        || files.some((path) => fileGraph.facts.get(path)?.isTest);
      if (!hasTests) {
        violations.push({
          id: fingerprint("assurance-drift", component.id),
          kind: "assurance-drift",
          severity: "warning",
          title: `"${component.name}" is declared ${declared} but no tests import it`,
          message: `The blueprint claims assurance level "${declared}", but no test file imports any of its ${plural(files.length, "file")}.`,
          components: [component.id],
          locations: [{ path: files[0] }],
        });
      }
    }
  }
  return violations;
}
