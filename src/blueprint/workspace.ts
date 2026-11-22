import { runCheck, buildSnapshotModel, type CheckInput } from "./check";
import { DEFAULT_TRIPWIRES } from "./constants";
import { compileGlob } from "./glob";
import { assignComponents, buildComponentGraph } from "./graph";
import { computeImpact } from "./impact";
import { buildFileGraph, languageOf, normalizePackageName } from "./imports";
import * as paths from "./paths";
import { compileRules, createLabeler, edgeRuleHits, evaluateRules, ruleSeverity, type CompiledRule, type DependencyTarget } from "./rules";
import { describeSelector, matchesComponent, resolveSelector } from "./selectors";
import {
  selectorComponentRefs,
  type Blueprint,
  type BlueprintComponent,
  type BlueprintRule,
  type Selector,
  type Severity,
  type Verification,
} from "./schema";
import { authorshipStats, type AuthorshipStats } from "./stats";
import type { CheckReport, ComponentGraph, FileGraph, ImpactReport, ReachReport, SourceFile } from "./types";
import { uniqueSorted } from "./util";

// The query layer used by the MCP server, the CLI and the canvas: "who owns
// this file, what may it depend on, what breaks if it changes".

export interface RuleSummary {
  id: string;
  kind: BlueprintRule["kind"];
  severity: Severity;
  summary: string;
  reason?: string;
  human: boolean;
}

export interface PathExplanation {
  path: string;
  exists: boolean;
  component: {
    id: string;
    name: string;
    kind: string;
    description?: string;
    intent?: string;
    owners?: string[];
    assurance?: string;
    verified?: Verification;
    external?: boolean;
  } | null;
  protected: boolean;
  protectedReasons: string[];
  constraints: RuleSummary[];
  /** Components this path may depend on; null means "anything not forbidden". */
  allowedComponents: string[] | null;
  forbiddenComponents: string[];
  forbiddenPackages: string[];
  invariants: Array<{ id: string; statement: string; check?: string }>;
  decisions: Array<{ id: string; title: string; status: string }>;
  dependsOn: string[];
  dependents: string[];
  guidance: string;
}

export interface DependencyVerdict {
  allowed: boolean;
  from: { path: string; component: string | null };
  target: { kind: "internal"; path: string; component: string | null; exists: boolean } | { kind: "external"; pkg: string };
  violations: Array<{ ruleId: string; kind: string; severity: Severity; title: string; explanation: string; reason?: string }>;
  undeclared: boolean;
  undeclaredSeverity: Blueprint["policy"]["undeclaredDependencies"];
  note: string;
}

export interface ComponentSummary {
  component: BlueprintComponent;
  files: string[];
  fileCount: number;
  dependsOn: Array<{ id: string; declared: boolean; observed: boolean; imports: number }>;
  dependents: Array<{ id: string; declared: boolean; observed: boolean; imports: number }>;
  externals: string[];
  env: Array<{ name: string; secretLike: boolean; files: string[] }>;
  tests: string[];
  rules: RuleSummary[];
  invariants: Array<{ id: string; statement: string; check?: string }>;
  decisions: Array<{ id: string; title: string; status: string }>;
}

export interface BlueprintOverview {
  system: Blueprint["system"] | null;
  components: Array<{
    id: string;
    name: string;
    kind: string;
    external: boolean;
    fileCount: number;
    intent: string | null;
    verified: boolean;
    assurance: string;
  }>;
  rules: RuleSummary[];
  invariants: number;
  decisions: number;
  dependencies: number;
  policy: Blueprint["policy"] | null;
  filesAnalyzed: number;
  unmappedSourceFiles: number;
  authorship: AuthorshipStats;
}

export type GraphEdgeStatus = "declared" | "undeclared" | "forbidden" | "missing";

export interface WorkspaceGraphView {
  /** `files` is the number of files the component owns in the analyzed snapshot. */
  components: Array<{ id: string; name: string; kind?: string; external?: boolean; findings?: number; files?: number }>;
  edges: Array<{ from: string; to: string; status: GraphEdgeStatus; count?: number }>;
}

export interface Workspace {
  blueprint: Blueprint | null;
  files: SourceFile[];
  fileGraph: FileGraph;
  componentGraph: ComponentGraph;
  componentOf(path: string): string | null;
  explainPath(path: string): PathExplanation;
  checkDependency(fromPath: string, target: string): DependencyVerdict;
  impact(paths: string[]): ImpactReport;
  componentSummary(id: string): ComponentSummary | null;
  overview(): BlueprintOverview;
  graphView(): WorkspaceGraphView;
  check(extra?: Partial<CheckInput>): CheckReport;
}

export function summarizeRule(rule: BlueprintRule): string {
  switch (rule.kind) {
    case "forbid":
      return `${describeSelector(rule.from)} must not depend on ${describeSelector(rule.to)}`;
    case "allow-only":
      return `${describeSelector(rule.from)} may only depend on ${describeSelector(rule.to)}`;
    case "layers":
      return `layers (top → bottom): ${rule.layers.map((layer) => describeSelector(layer)).join(" → ")}`;
    case "no-cycles":
      return `no dependency cycles${rule.scope ? ` within ${describeSelector(rule.scope)}` : ""}`;
    case "protect":
      return `changes to ${rule.paths.join(", ")} need human review`;
    case "secret-access":
      return `${rule.secrets.join(", ")} may only be read by ${describeSelector(rule.allow)}`;
  }
}

function toRuleSummary(rule: BlueprintRule): RuleSummary {
  return {
    id: rule.id,
    kind: rule.kind,
    severity: ruleSeverity(rule),
    summary: summarizeRule(rule),
    reason: rule.reason,
    human: Boolean(rule.verified) || !rule.provenance || rule.provenance.source === "human",
  };
}

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

function ruleTouchesComponent(rule: BlueprintRule, blueprint: Blueprint, componentId: string): boolean {
  return ruleSelectors(rule).some((selector) => (
    selectorComponentRefs(selector).includes(componentId)
    || matchesComponent(resolveSelector(selector, blueprint), componentId)
  ));
}

function firstLine(value: string | undefined): string | null {
  const line = value?.split(/\r?\n/).map((part) => part.trim()).find(Boolean);
  return line ? (line.length > 200 ? `${line.slice(0, 197)}…` : line) : null;
}

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".go", ".rs", ".java", ".kt"];

export interface WorkspaceOptions {
  /** Prebuilt observed graph (e.g. from deserializeFileGraph); `files` may then be empty. */
  fileGraph?: FileGraph;
  /** Precomputed reach report, passed through to check(). */
  reach?: ReachReport;
}

export function createWorkspace(files: SourceFile[], blueprint: Blueprint | null, options: WorkspaceOptions = {}): Workspace {
  const model = blueprint ? buildSnapshotModel(files, blueprint, options.fileGraph) : null;
  const fileGraph = model?.fileGraph ?? options.fileGraph ?? buildFileGraph(files, {});
  const membership = model?.membership ?? assignComponents(fileGraph.files, null);
  const componentGraph = model?.componentGraph ?? buildComponentGraph(fileGraph, membership);
  const compiled: CompiledRule[] = blueprint ? compileRules(blueprint) : [];
  const labels = createLabeler(blueprint);
  const fileSet = new Set(fileGraph.files);
  const componentById = new Map((blueprint?.components ?? []).map((component) => [component.id, component]));
  const declared = new Set((blueprint?.dependencies ?? []).map((dependency) => `${dependency.from}\u0000${dependency.to}`));

  const componentOf = (path: string): string | null => {
    const normalized = paths.repoPath(path);
    return membership.fileToComponent.get(normalized) ?? (blueprint ? assignComponents([normalized], blueprint).fileToComponent.get(normalized) ?? null : null);
  };

  const representative = (componentId: string): string | null => membership.componentFiles.get(componentId)?.[0] ?? null;

  const observedNeighbors = (componentId: string) => ({
    dependsOn: componentGraph.edges.filter((edge) => edge.from === componentId),
    dependents: componentGraph.edges.filter((edge) => edge.to === componentId),
  });

  const invariantsFor = (componentId: string | null) => (blueprint?.invariants ?? [])
    .filter((invariant) => componentId !== null && (invariant.components ?? []).includes(componentId))
    .map((invariant) => ({ id: invariant.id, statement: invariant.statement, check: invariant.check?.run }));

  const decisionsFor = (componentId: string | null) => (blueprint?.decisions ?? [])
    .filter((decision) => componentId !== null && (decision.components ?? []).includes(componentId))
    .map((decision) => ({ id: decision.id, title: decision.title, status: decision.status }));

  const protectionFor = (path: string): string[] => {
    const reasons: string[] = [];
    if (blueprint?.policy.tripwires.defaults ?? true) {
      const hit = DEFAULT_TRIPWIRES.find((tripwire) => compileGlob(tripwire.glob).test(path));
      if (hit) reasons.push(hit.reason);
    }
    for (const pattern of blueprint?.policy.tripwires.paths ?? []) {
      if (compileGlob(pattern).test(path)) reasons.push(`Protected by blueprint policy (${pattern}).`);
    }
    for (const rule of blueprint?.rules ?? []) {
      if (rule.kind === "protect" && rule.paths.some((pattern) => compileGlob(pattern).test(path))) {
        reasons.push(rule.reason ? `${rule.reason} (rule "${rule.id}")` : `Protected by rule "${rule.id}".`);
      }
    }
    return reasons;
  };

  const resolveTarget = (fromPath: string, target: string): DependencyTarget & { exists?: boolean } => {
    const trimmed = target.trim();
    const asComponent = trimmed.startsWith("component:") ? trimmed.slice("component:".length) : trimmed;
    if (componentById.has(asComponent) && !fileSet.has(trimmed)) {
      const file = representative(asComponent);
      return { kind: "internal", path: file ?? asComponent, component: asComponent, exists: Boolean(file) };
    }
    let candidate: string | null = null;
    if (trimmed.startsWith("./") || trimmed.startsWith("../")) candidate = paths.join(paths.dirname(fromPath), trimmed);
    else if (fileSet.has(paths.repoPath(trimmed)) || (/\//.test(trimmed) && /\.[A-Za-z0-9]+$/.test(trimmed) && !trimmed.startsWith("@"))) candidate = paths.repoPath(trimmed);
    else if (trimmed.startsWith("@/")) candidate = `src/${trimmed.slice(2)}`;
    if (candidate !== null) {
      const resolved = [candidate, ...RESOLVE_EXTENSIONS.map((ext) => `${candidate}${ext}`), ...RESOLVE_EXTENSIONS.map((ext) => `${candidate}/index${ext}`)]
        .find((option) => fileSet.has(option));
      const finalPath = resolved ?? candidate;
      return { kind: "internal", path: finalPath, component: componentOf(finalPath), exists: Boolean(resolved) };
    }
    const language = languageOf(fromPath) ?? "typescript";
    return { kind: "external", pkg: normalizePackageName(trimmed, language) };
  };

  const checkDependency = (rawFrom: string, target: string): DependencyVerdict => {
    const fromPath = paths.repoPath(rawFrom);
    const from = { path: fromPath, component: componentOf(fromPath) };
    const resolved = resolveTarget(fromPath, target);
    const hits = edgeRuleHits(compiled, from, resolved, false, labels);
    const undeclaredSeverity = blueprint?.policy.undeclaredDependencies ?? "off";
    const undeclared = resolved.kind === "internal"
      && from.component !== null
      && resolved.component !== null
      && from.component !== resolved.component
      && componentById.get(from.component)?.kind !== "test"
      && !componentById.get(resolved.component)?.public
      && !declared.has(`${from.component}\u0000${resolved.component}`)
      && undeclaredSeverity !== "off";
    const violations = hits.map((hit) => ({
      ruleId: hit.rule.id,
      kind: hit.kind,
      severity: hit.severity,
      title: hit.title,
      explanation: hit.explanation,
      reason: hit.rule.reason,
    }));
    const targetDescription = resolved.kind === "internal" ? `${resolved.path} (${labels.component(resolved.component)})` : `package ${resolved.pkg}`;
    let note: string;
    if (!blueprint) note = "No blueprint found; nothing constrains this dependency. Run `rassam init` to create one.";
    else if (violations.length) note = `Not allowed: ${violations.map((violation) => violation.title).join("; ")}. Do not add this dependency. If the task truly requires it, call report_conflict or propose_change instead of working around the rule.`;
    else if (undeclared) note = `Allowed by the rules, but ${labels.component(from.component)} → ${labels.component(resolved.kind === "internal" ? resolved.component : null)} is not a declared dependency (policy: ${undeclaredSeverity}). Prefer existing declared paths; if this edge is intended, call propose_change to declare it.`;
    else note = `Allowed: ${fromPath} may depend on ${targetDescription}.`;
    return {
      allowed: violations.length === 0,
      from,
      target: resolved.kind === "internal"
        ? { kind: "internal", path: resolved.path, component: resolved.component, exists: Boolean(resolved.exists) }
        : { kind: "external", pkg: resolved.pkg },
      violations,
      undeclared,
      undeclaredSeverity,
      note,
    };
  };

  const explainPath = (rawPath: string): PathExplanation => {
    const path = paths.repoPath(rawPath);
    const componentId = componentOf(path);
    const component = componentId ? componentById.get(componentId) ?? null : null;
    const protectedReasons = protectionFor(path);
    const from = { path, component: componentId };

    const constraints = (blueprint?.rules ?? [])
      .filter((rule) => {
        if (rule.kind === "protect") return rule.paths.some((pattern) => compileGlob(pattern).test(path));
        if (rule.kind === "secret-access") return true;
        if (rule.kind === "no-cycles") return !rule.scope || (componentId !== null && ruleTouchesComponent(rule, blueprint!, componentId));
        if (rule.kind === "layers") return rule.layers.some((layer) => {
          const selector = resolveSelector(layer, blueprint!);
          return selector.paths.some((matcher) => matcher.test(path)) || (componentId !== null && matchesComponent(selector, componentId));
        });
        const selector = resolveSelector(rule.from, blueprint!);
        return selector.paths.some((matcher) => matcher.test(path)) || (componentId !== null && matchesComponent(selector, componentId));
      })
      .map(toRuleSummary);

    const forbiddenComponents: string[] = [];
    const allowedComponents: string[] = [];
    let restricted = false;
    for (const other of blueprint?.components ?? []) {
      if (other.id === componentId) continue;
      const file = representative(other.id);
      if (!file && !other.external) continue;
      const hits = edgeRuleHits(compiled, from, { kind: "internal", path: file ?? other.id, component: other.id }, false, labels);
      if (hits.some((hit) => hit.kind === "allow-only-violation")) restricted = true;
      if (hits.length) forbiddenComponents.push(other.id);
      else allowedComponents.push(other.id);
    }
    const forbiddenPackages = uniqueSorted(compiled.flatMap((entry) => {
      if ((entry.rule.kind !== "forbid") || !("to" in entry)) return [];
      if (!edgeRuleHits([entry], from, { kind: "external", pkg: "\u0000probe" }, false, labels).length && !entry.to.hasPackages) return [];
      const appliesHere = resolveSelector(entry.rule.from, blueprint!);
      const applies = appliesHere.all || appliesHere.paths.some((matcher) => matcher.test(path)) || (componentId !== null && matchesComponent(appliesHere, componentId));
      if (!applies) return [];
      return (Array.isArray(entry.rule.to) ? entry.rule.to : [entry.rule.to]).filter((value) => value.startsWith("package:")).map((value) => value.slice("package:".length));
    }));

    const neighbors = componentId ? observedNeighbors(componentId) : { dependsOn: [], dependents: [] };
    const guidanceParts: string[] = [];
    if (!blueprint) guidanceParts.push("No blueprint exists yet; run `rassam init`.");
    else if (!component) guidanceParts.push("No component owns this path. New code here is not covered by any rule; ask a human which component it belongs to, or propose a path mapping.");
    else {
      guidanceParts.push(`Owned by "${component.name}" (${component.kind}).`);
      if (component.intent) guidanceParts.push(`Intent: ${firstLine(component.intent)}`);
      if (forbiddenComponents.length) guidanceParts.push(`Must not depend on: ${forbiddenComponents.map((id) => labels.component(id)).join(", ")}.`);
      if (restricted) guidanceParts.push(`May only depend on: ${allowedComponents.map((id) => labels.component(id)).join(", ") || "nothing outside itself"}.`);
      if (forbiddenPackages.length) guidanceParts.push(`Forbidden packages: ${forbiddenPackages.join(", ")}.`);
    }
    if (protectedReasons.length) guidanceParts.push(`Protected: changes here need human review (${protectedReasons[0]}). Do not weaken tests or checks to make a task pass.`);

    return {
      path,
      exists: fileSet.has(path),
      component: component ? {
        id: component.id,
        name: component.name,
        kind: component.kind,
        description: component.description,
        intent: component.intent,
        owners: component.owners,
        assurance: component.assurance,
        verified: component.verified,
        external: component.external,
      } : null,
      protected: protectedReasons.length > 0,
      protectedReasons,
      constraints,
      allowedComponents: restricted ? allowedComponents : null,
      forbiddenComponents,
      forbiddenPackages,
      invariants: invariantsFor(componentId),
      decisions: decisionsFor(componentId),
      dependsOn: neighbors.dependsOn.map((edge) => edge.to),
      dependents: neighbors.dependents.map((edge) => edge.from),
      guidance: guidanceParts.join(" "),
    };
  };

  const componentSummary = (id: string): ComponentSummary | null => {
    const component = componentById.get(id);
    if (!component || !blueprint) return null;
    const files = membership.componentFiles.get(id) ?? [];
    const neighbors = observedNeighbors(id);
    const merge = (observed: typeof neighbors.dependsOn, declaredIds: string[], side: "to" | "from") => {
      const ids = uniqueSorted([...observed.map((edge) => edge[side]), ...declaredIds]);
      return ids.map((other) => {
        const edge = observed.find((candidate) => candidate[side] === other);
        return { id: other, declared: declaredIds.includes(other), observed: Boolean(edge), imports: edge?.count ?? 0 };
      });
    };
    const envByName = new Map<string, { name: string; secretLike: boolean; files: Set<string> }>();
    for (const ref of componentGraph.env.get(id) ?? []) {
      const entry = envByName.get(ref.name) ?? { name: ref.name, secretLike: ref.secretLike, files: new Set<string>() };
      entry.files.add(ref.file);
      envByName.set(ref.name, entry);
    }
    return {
      component,
      files,
      fileCount: files.length,
      dependsOn: merge(neighbors.dependsOn, blueprint.dependencies.filter((dependency) => dependency.from === id).map((dependency) => dependency.to), "to"),
      dependents: merge(neighbors.dependents, blueprint.dependencies.filter((dependency) => dependency.to === id).map((dependency) => dependency.from), "from"),
      externals: componentGraph.externals.get(id) ?? [],
      env: [...envByName.values()].map((entry) => ({ name: entry.name, secretLike: entry.secretLike, files: [...entry.files].sort() })).sort((left, right) => left.name.localeCompare(right.name)),
      tests: componentGraph.tests.get(id) ?? [],
      rules: blueprint.rules.filter((rule) => ruleTouchesComponent(rule, blueprint, id)).map(toRuleSummary),
      invariants: invariantsFor(id),
      decisions: decisionsFor(id),
    };
  };

  const overview = (): BlueprintOverview => ({
    system: blueprint?.system ?? null,
    components: (blueprint?.components ?? []).map((component) => ({
      id: component.id,
      name: component.name,
      kind: component.kind,
      external: Boolean(component.external),
      fileCount: membership.componentFiles.get(component.id)?.length ?? 0,
      intent: firstLine(component.intent),
      verified: Boolean(component.verified),
      assurance: component.assurance ?? "unknown",
    })),
    rules: (blueprint?.rules ?? []).map(toRuleSummary),
    invariants: blueprint?.invariants.length ?? 0,
    decisions: blueprint?.decisions.length ?? 0,
    dependencies: blueprint?.dependencies.length ?? 0,
    policy: blueprint?.policy ?? null,
    filesAnalyzed: fileGraph.facts.size,
    unmappedSourceFiles: membership.unmapped.filter((path) => fileGraph.facts.has(path)).length,
    authorship: authorshipStats(blueprint),
  });

  const graphView = (): WorkspaceGraphView => {
    if (!blueprint || !model) return { components: [], edges: [] };
    const violations = evaluateRules(model, compiled);
    const forbiddenPairs = new Set<string>();
    const findingCounts = new Map<string, number>();
    for (const violation of violations) {
      if (violation.components.length >= 2) forbiddenPairs.add(`${violation.components[0]}\u0000${violation.components[1]}`);
      for (const id of violation.components) findingCounts.set(id, (findingCounts.get(id) ?? 0) + 1);
    }
    const edges: WorkspaceGraphView["edges"] = componentGraph.edges.map((edge) => {
      const key = `${edge.from}\u0000${edge.to}`;
      const open = declared.has(key) || Boolean(componentById.get(edge.to)?.public) || componentById.get(edge.from)?.kind === "test";
      const status: GraphEdgeStatus = forbiddenPairs.has(key) ? "forbidden" : open ? "declared" : "undeclared";
      return { from: edge.from, to: edge.to, status, count: edge.count };
    });
    const observed = new Set(componentGraph.edges.map((edge) => `${edge.from}\u0000${edge.to}`));
    for (const dependency of blueprint.dependencies) {
      if (!observed.has(`${dependency.from}\u0000${dependency.to}`)) edges.push({ from: dependency.from, to: dependency.to, status: "missing" });
    }
    return {
      components: blueprint.components.map((component) => ({
        id: component.id,
        name: component.name,
        kind: component.kind,
        external: Boolean(component.external),
        findings: findingCounts.get(component.id) ?? 0,
        files: membership.componentFiles.get(component.id)?.length ?? 0,
      })),
      edges,
    };
  };

  return {
    blueprint,
    files,
    fileGraph,
    componentGraph,
    componentOf,
    explainPath,
    checkDependency,
    impact: (changed) => computeImpact(changed.map((path) => paths.repoPath(path)), blueprint, componentGraph),
    componentSummary,
    overview,
    graphView,
    check: (extra = {}) => runCheck({ files, blueprint, fileGraph: options.fileGraph, reach: options.reach, ...extra }),
  };
}
