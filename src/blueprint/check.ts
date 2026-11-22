import { detectAgentActivity } from "./agents";
import { diffBlueprints } from "./blueprint-diff";
import { BLUEPRINT_PATH, type Blueprint, type BlueprintComponent, type BlueprintIssue, type Selector, type Severity } from "./schema";
import { ENGINE_NAME, ENGINE_VERSION } from "./constants";
import { detectVerificationWeakening, matchTripwires } from "./diff";
import { compileGlob } from "./glob";
import { assignComponents, buildComponentGraph, componentForPath } from "./graph";
import { computeImpact, dependentCounts } from "./impact";
import { buildFileGraph } from "./imports";
import { analyzeReach, isAgentConfigPath } from "./reach";
import { compileRules, evaluatePolicy, evaluateRules, type SnapshotModel, type Violation } from "./rules";
import { resolveSelector } from "./selectors";
import { filterFileGraph } from "./snapshot";
import { humanAuthoredRatio } from "./stats";
import type {
  AgentActivity,
  ChangedFile,
  CheckReport,
  CommitInfo,
  FileGraph,
  Finding,
  FindingKind,
  ReachReport,
  SourceFile,
} from "./types";
import { fingerprint, plural } from "./util";

export interface CheckInput {
  /** Head snapshot (working tree or PR head). */
  files: SourceFile[];
  /** Blueprint at head (null when absent or unparseable). */
  blueprint: Blueprint | null;
  /** Parse issues of the head blueprint file, if it failed to parse. */
  blueprintIssues?: BlueprintIssue[];
  /** Diff mode: the contract the change is judged by (blueprint at the merge-base). */
  baseBlueprint?: Blueprint | null;
  /** Diff mode: changed files relative to the merge-base. */
  changes?: ChangedFile[];
  /** Diff mode: merge-base contents of modified, deleted and renamed files. */
  baseFiles?: SourceFile[];
  commits?: CommitInfo[];
  /** A human approved contract changes (e.g. a PR label). */
  approved?: boolean;
  refs?: { base?: { ref: string; sha?: string }; head?: { ref: string; sha?: string } };
  invariantResults?: Array<{ id: string; ok: boolean; output: string }>;
  now?: string;
  /** Full mode only: a prebuilt head graph (e.g. deserialized in the browser); `files` may then be empty. */
  fileGraph?: FileGraph;
  /** Precomputed reach report (when file contents are not available to the caller). */
  reach?: ReachReport;
}

export function buildSnapshotModel(files: readonly SourceFile[], blueprint: Blueprint, prebuilt?: FileGraph): SnapshotModel {
  const fileGraph = prebuilt ? filterFileGraph(prebuilt, blueprint.policy.ignore) : buildFileGraph(files, { ignore: blueprint.policy.ignore });
  const membership = assignComponents(fileGraph.files, blueprint);
  return { blueprint, fileGraph, membership, componentGraph: buildComponentGraph(fileGraph, membership) };
}

/**
 * Reconstruct the merge-base snapshot from the head snapshot and the diff.
 * Renamed files are placed under their NEW path so that fingerprints of
 * pre-existing violations line up with head fingerprints.
 */
export function reconstructBaseSnapshot(
  headFiles: readonly SourceFile[],
  changes: readonly ChangedFile[],
  baseFiles: readonly SourceFile[] = [],
): SourceFile[] {
  const byPath = new Map(headFiles.map((file) => [file.path, file]));
  const baseContent = new Map(baseFiles.map((file) => [file.path, file]));
  for (const change of changes) {
    if (change.status === "added") {
      byPath.delete(change.path);
    } else if (change.status === "modified") {
      const base = baseContent.get(change.path);
      if (base) byPath.set(change.path, { path: change.path, content: base.content, size: base.size });
    } else if (change.status === "deleted") {
      const base = baseContent.get(change.path);
      byPath.set(change.path, { path: change.path, content: base?.content ?? null, size: base?.size });
    } else if (change.status === "renamed") {
      const base = (change.previousPath && baseContent.get(change.previousPath)) || baseContent.get(change.path);
      if (base) byPath.set(change.path, { path: change.path, content: base.content, size: base.size });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

const SEVERITY_WEIGHT: Record<Severity, number> = { error: 100, warning: 30, info: 5 };
const KIND_BOOST: Partial<Record<FindingKind, number>> = {
  "contract-weakened": 1.6,
  "verification-weakened": 1.5,
  "inline-secret": 1.5,
  "invariant-failed": 1.4,
  "secret-access": 1.3,
  "agent-permission-change": 1.3,
  "forbidden-dependency": 1.2,
  "layer-violation": 1.1,
  "allow-only-violation": 1.1,
  "dependency-cycle": 1.0,
  "invalid-blueprint": 1.5,
};
const AGENT_SENSITIVE: ReadonlySet<FindingKind> = new Set([
  "verification-weakened",
  "protected-path",
  "contract-weakened",
  "agent-permission-change",
]);

function scoreFinding(violation: Violation, isNew: boolean, dependents: Map<string, number>, agentAuthored: boolean): number {
  const blast = 1 + Math.log2(1 + Math.max(0, ...violation.components.map((id) => dependents.get(id) ?? 0)));
  const agentBoost = agentAuthored && AGENT_SENSITIVE.has(violation.kind) ? 1.25 : 1;
  const score = SEVERITY_WEIGHT[violation.severity] * (isNew ? 1 : 0.15) * blast * (KIND_BOOST[violation.kind] ?? 1) * agentBoost;
  return Math.round(score * 10) / 10;
}

function changedPathSet(changes: readonly ChangedFile[]): Set<string> {
  const set = new Set<string>();
  for (const change of changes) {
    set.add(change.path);
    if (change.previousPath) set.add(change.previousPath);
  }
  return set;
}

function contractFindings(base: Blueprint | null, head: Blueprint | null, approved: boolean): Violation[] {
  const changes = diffBlueprints(base, head);
  if (!changes.length) return [];
  const findings: Violation[] = [];
  for (const change of changes.filter((item) => item.weakens)) {
    findings.push({
      id: fingerprint("contract-weakened", change.kind, change.target, change.summary),
      kind: "contract-weakened",
      severity: approved ? "info" : "error",
      title: `Contract weakened: ${change.summary}`,
      message: approved
        ? "A human approved this contract change."
        : "This change loosens the rules agents are judged by. It needs explicit human approval (apply the approval label) before merge.",
      components: [],
      locations: [{ path: BLUEPRINT_PATH }],
    });
  }
  const other = changes.filter((item) => !item.weakens);
  if (other.length) {
    findings.push({
      id: fingerprint("contract-changed", other.map((item) => `${item.kind}:${item.target}`).join("|")),
      kind: "contract-changed",
      severity: "info",
      title: `Blueprint updated: ${plural(other.length, "change")}`,
      message: other.slice(0, 12).map((item) => item.summary).join("; ") + (other.length > 12 ? "; …" : ""),
      components: [],
      locations: [{ path: BLUEPRINT_PATH }],
    });
  }
  return findings;
}

/** Components that any base rule selects (by id, tag or "*"). */
function ruleReferencedComponents(blueprint: Blueprint): Set<string> {
  const referenced = new Set<string>();
  const selectorsOf = (rule: Blueprint["rules"][number]): Selector[] => {
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
  };
  for (const rule of blueprint.rules) {
    for (const selector of selectorsOf(rule)) {
      const resolved = resolveSelector(selector, blueprint);
      for (const component of blueprint.components) {
        if (resolved.components.has(component.id) || resolved.excludeComponents.has(component.id)) referenced.add(component.id);
      }
    }
  }
  return referenced;
}

/** Does a rule select this component directly (by id, tag or "*")? */
function ruleSelects(blueprint: Blueprint, rule: Blueprint["rules"][number] | undefined, id: string): boolean {
  if (!rule) return false;
  const selectors: Selector[] = rule.kind === "forbid" || rule.kind === "allow-only"
    ? [rule.from, rule.to]
    : rule.kind === "layers" ? rule.layers
      : rule.kind === "secret-access" ? [rule.allow]
        : rule.kind === "no-cycles" && rule.scope ? [rule.scope] : [];
  return selectors.some((selector) => {
    const resolved = resolveSelector(selector, blueprint);
    return resolved.all || resolved.components.has(id);
  });
}

/**
 * True when every base rule that selected `fromId` still exists at head and
 * selects `toId` there: files moving between the two stay under the same rules.
 */
function coveredBySameRules(base: Blueprint, head: Blueprint, fromId: string, toId: string): boolean {
  return base.rules.every((rule) => (
    !ruleSelects(base, rule, fromId) || ruleSelects(head, head.rules.find((candidate) => candidate.id === rule.id), toId)
  ));
}

/**
 * Files that leave a rule-constrained component because of a contract edit
 * (changed paths or excludes, a higher-priority component, a removed
 * component). Catches weakening that a field-by-field diff cannot see.
 */
function membershipMoves(base: Blueprint, head: Blueprint, files: readonly string[], approved: boolean): Violation[] {
  const constrained = ruleReferencedComponents(base);
  if (!constrained.size) return [];
  const before = assignComponents(files, base).fileToComponent;
  const after = assignComponents(files, head).fileToComponent;
  const moves = new Map<string, string[]>();
  for (const path of files) {
    const from = before.get(path);
    if (!from || !constrained.has(from)) continue;
    const to = after.get(path) ?? "(unmapped)";
    if (to === from) continue;
    // Still under the same rules in its new component: a restructure, not a loosening.
    if (to !== "(unmapped)" && coveredBySameRules(base, head, from, to)) continue;
    const key = `${from}\u0000${to}`;
    moves.set(key, [...(moves.get(key) ?? []), path]);
  }
  const names = new Map([...base.components, ...head.components].map((component) => [component.id, component.name]));
  return [...moves.entries()].map(([key, paths]) => {
    const [from, to] = key.split("\u0000");
    const summary = `${plural(paths.length, "file")} moved out of "${names.get(from) ?? from}" (constrained by rules) into ${to === "(unmapped)" ? "no component" : `"${names.get(to) ?? to}"`}`;
    return {
      id: fingerprint("contract-weakened", "membership", from, to, paths.join("|")),
      kind: "contract-weakened" as const,
      severity: approved ? "info" as const : "error" as const,
      title: `Contract weakened: ${summary}`,
      message: approved
        ? "A human approved this contract change."
        : "Moving files out of a component removes them from the rules that constrain it. This needs explicit human approval before merge.",
      components: to === "(unmapped)" ? [from] : [from, to],
      locations: [{ path: BLUEPRINT_PATH }, ...paths.slice(0, 20).map((path) => ({ path }))],
    };
  });
}

/** Literal directory prefix of a glob ("src/ui/admin/**" → "src/ui/admin/"). */
function literalPrefix(glob: string): string {
  const cut = glob.search(/[*?[{]/);
  const literal = (cut < 0 ? glob : glob.slice(0, cut)).replace(/^\.?\//, "");
  return literal.slice(0, literal.lastIndexOf("/") + 1);
}

/**
 * A representative file path a glob matches: wildcards become a placeholder
 * segment, brace and class alternatives take their first option, and
 * directory patterns get a file name ("src/ui/**" → "src/ui/x/rassam-probe.ts").
 */
export function probePathFor(glob: string): string {
  const raw = glob.trim().replace(/^\.?\//, "");
  let probe = raw
    .replace(/\{([^,}]*)[^}]*\}/g, "$1")
    .replace(/\[(!?)([^\]])[^\]]*\]/g, (_match, negated: string, first: string) => (negated ? "q" : first));
  if (probe.endsWith("/")) probe = `${probe}**`;
  const directoryLike = probe.endsWith("**") || (!/[*?]/.test(probe) && !(probe.split("/").pop() ?? "").includes("."));
  probe = probe.replace(/\*\*/g, "x").replace(/[*?]/g, "x");
  return directoryLike ? `${probe}/rassam-probe.ts` : probe;
}

function membershipChanged(base: BlueprintComponent | undefined, head: BlueprintComponent): boolean {
  if (!base) return true;
  return JSON.stringify(base.paths) !== JSON.stringify(head.paths)
    || JSON.stringify(base.exclude ?? []) !== JSON.stringify(head.exclude ?? [])
    || (base.priority ?? 0) !== (head.priority ?? 0)
    || Boolean(base.external) !== Boolean(head.external);
}

/**
 * Paths that would leave a rule-constrained component under the head
 * blueprint even though no file there exists yet: a new or re-scoped glob,
 * a raised priority, a more specific pattern or a lowered priority on the
 * constrained component itself. Each relevant glob is turned into a probe
 * path and its owner is compared under both blueprints, so files created
 * there later cannot silently escape the rules. Reported unless head rules
 * select the new owner wherever they selected the constrained component.
 */
function claimedPaths(base: Blueprint, head: Blueprint, alreadyReported: Set<string>, approved: boolean): Violation[] {
  const constrained = ruleReferencedComponents(base);
  if (!constrained.size) return [];
  const baseById = new Map(base.components.map((component) => [component.id, component]));
  const headById = new Map(head.components.map((component) => [component.id, component]));
  const changed = head.components.filter((component) => membershipChanged(baseById.get(component.id), component));
  if (!changed.length) return [];

  const constrainedPrefixes = [...constrained].flatMap((id) => (baseById.get(id)?.paths ?? []).map(literalPrefix));
  const probes = new Set<string>();
  const addProbes = (glob: string) => {
    const normalized = glob.trim().replace(/^\.?\//, "");
    probes.add(probePathFor(normalized));
    // A broader glob ("src/**/*.legacy.tsx", "*.admin.tsx") overlaps a constrained
    // area below its own prefix: probe its tail inside that area as well.
    const own = literalPrefix(normalized);
    for (const prefix of constrainedPrefixes) {
      if (prefix !== own && prefix.startsWith(own)) probes.add(`${prefix}${probePathFor(normalized.slice(own.length))}`);
    }
  };
  for (const component of changed) for (const glob of component.paths) addProbes(glob);
  for (const id of constrained) for (const glob of baseById.get(id)?.paths ?? []) addProbes(glob);

  const list = [...probes];
  const before = assignComponents(list, base).fileToComponent;
  const after = assignComponents(list, head).fileToComponent;
  const moves = new Map<string, string[]>();
  for (const probe of list) {
    const from = before.get(probe);
    const to = after.get(probe);
    // Losing coverage outright (no owner) is already a field-level weakening of the component's paths.
    if (!from || !to || to === from || !constrained.has(from)) continue;
    const key = `${from}\u0000${to}`;
    moves.set(key, [...(moves.get(key) ?? []), probe]);
  }

  const findings: Violation[] = [];
  for (const [key, probePaths] of moves) {
    const [targetId, ownerId] = key.split("\u0000");
    if (alreadyReported.has(key)) continue;
    if (coveredBySameRules(base, head, targetId, ownerId)) continue;
    const owner = headById.get(ownerId);
    const target = baseById.get(targetId);
    const globs = (owner?.paths ?? []).filter((glob) => probePaths.some((probe) => compileGlob(glob).test(probe)));
    const where = globs.length ? globs.join(", ") : probePaths.slice(0, 3).join(", ");
    findings.push({
      id: fingerprint("contract-weakened", "claim", ownerId, targetId, where),
      kind: "contract-weakened",
      severity: approved ? "info" : "error",
      title: `Contract weakened: "${owner?.name ?? ownerId}" claims ${where} inside rule-constrained "${target?.name ?? targetId}"`,
      message: approved
        ? "A human approved this contract change."
        : `Files under ${where} would belong to "${owner?.name ?? ownerId}" instead of "${target?.name ?? targetId}" and escape the rules that constrain it. Add that component to those rules, or get explicit human approval.`,
      components: [targetId, ownerId],
      locations: [{ path: BLUEPRINT_PATH }],
    });
  }
  return findings;
}

const COMMITTED_ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/i;

function tripwireFindings(changes: readonly ChangedFile[], judge: Blueprint | null): Violation[] {
  const protectRules = (judge?.rules ?? [])
    .filter((rule): rule is Extract<Blueprint["rules"][number], { kind: "protect" }> => rule.kind === "protect")
    .map((rule) => ({ id: rule.id, paths: rule.paths, severity: rule.severity, reason: rule.reason }));
  const hits = matchTripwires(changes, {
    defaults: judge?.policy.tripwires.defaults ?? true,
    extra: judge?.policy.tripwires.paths,
    protectRules,
  })
    .filter((hit) => !(hit.path === BLUEPRINT_PATH && !hit.ruleId))
    .map((hit) => {
      const change = changes.find((item) => item.path === hit.path);
      const committedEnv = hit.category === "secrets" && COMMITTED_ENV_FILE.test(hit.path) && !ENV_TEMPLATE.test(hit.path) && change?.status !== "deleted";
      return committedEnv
        ? { ...hit, severity: "error" as const, reason: "An environment file was committed. It may hold live credentials: remove it from the repository, add it to .gitignore and rotate any keys it contained." }
        : hit;
    });

  const groups = new Map<string, typeof hits>();
  for (const hit of hits) {
    const key = `${hit.category}\u0000${hit.ruleId ?? ""}\u0000${hit.severity}`;
    groups.set(key, [...(groups.get(key) ?? []), hit]);
  }
  const findings: Violation[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const kind: FindingKind = first.category === "agent-permissions" ? "agent-permission-change" : "protected-path";
    const paths = [...new Set(group.map((hit) => hit.path))].sort();
    const label = first.ruleId ? `rule "${first.ruleId}"` : `${first.category} tripwire`;
    findings.push({
      id: fingerprint(kind, first.category, first.ruleId, paths.join("|")),
      kind,
      severity: first.severity,
      ruleId: first.ruleId,
      title: paths.length === 1
        ? `Protected path changed: ${paths[0]}`
        : `${plural(paths.length, "protected file")} changed (${label})`,
      message: first.reason,
      reason: first.ruleId ? first.reason : undefined,
      components: [],
      locations: paths.slice(0, 50).map((path) => ({ path })),
    });
  }
  return findings;
}

function weakeningFindings(changes: readonly ChangedFile[]): Violation[] {
  return detectVerificationWeakening(changes).map((signal) => ({
    id: fingerprint("verification-weakened", signal.signal, signal.path, signal.line),
    kind: "verification-weakened" as const,
    severity: signal.severity,
    title: `Verification weakened (${signal.signal}): ${signal.path}`,
    message: signal.message,
    components: [],
    locations: [{ path: signal.path, line: signal.line }],
  }));
}

function reachFindings(reach: ReachReport, changed: Set<string> | null): Array<{ violation: Violation; isNew: boolean }> {
  const results: Array<{ violation: Violation; isNew: boolean }> = [];
  for (const secret of reach.inlineSecrets) {
    results.push({
      isNew: !changed || changed.has(secret.path),
      violation: {
        id: fingerprint("inline-secret", secret.path, secret.location, secret.kind),
        kind: "inline-secret",
        severity: "error",
        title: `Credential committed in ${isAgentConfigPath(secret.path) ? "agent configuration" : "the repository"}: ${secret.path}`,
        message: `${secret.kind} at ${secret.location} (${secret.preview}). Agents and anyone with read access can use it. Move it to an environment variable and rotate it.`,
        components: [],
        locations: [{ path: secret.path, line: secret.line }],
      },
    });
  }
  for (const grant of reach.permissions.filter((item) => item.broad && item.effect === "allow")) {
    const isNew = !changed || changed.has(grant.path);
    results.push({
      isNew,
      violation: {
        id: fingerprint("agent-permission-change", grant.path, grant.rule),
        kind: "agent-permission-change",
        severity: changed && isNew ? "warning" : "info",
        title: `Broad agent permission: ${grant.rule}`,
        message: `${grant.agent} is granted "${grant.rule}" in ${grant.path} without constraints. Broad grants are how agents reach production credentials and data.`,
        components: [],
        locations: [{ path: grant.path }],
      },
    });
  }
  return results;
}

function invariantFindings(
  judge: Blueprint,
  touched: Set<string>,
  changedPaths: Set<string> | null,
  results: CheckInput["invariantResults"],
): Violation[] {
  const findings: Violation[] = [];
  const resultById = new Map((results ?? []).map((result) => [result.id, result]));
  for (const invariant of judge.invariants) {
    const result = resultById.get(invariant.id);
    if (result && !result.ok) {
      findings.push({
        id: fingerprint("invariant-failed", invariant.id),
        kind: "invariant-failed",
        severity: invariant.severity ?? "error",
        title: `Invariant failed: ${invariant.statement}`,
        message: `Check \`${invariant.check?.run ?? "(none)"}\` failed. ${result.output.slice(-600)}`,
        components: invariant.components ?? [],
        locations: [{ path: BLUEPRINT_PATH }],
      });
      continue;
    }
    if (!changedPaths) continue;
    const touchesComponent = (invariant.components ?? []).some((id) => touched.has(id));
    const touchesTests = (invariant.check?.tests ?? []).length > 0
      && [...changedPaths].some((path) => (invariant.check?.tests ?? []).some((pattern) => compileGlob(pattern).test(path)));
    if (touchesComponent || touchesTests) {
      findings.push({
        id: fingerprint("invariant-at-risk", invariant.id),
        kind: "invariant-at-risk",
        severity: "info",
        title: `Invariant in scope: ${invariant.statement}`,
        message: invariant.check?.run
          ? `This change touches code the invariant covers. Verify with \`${invariant.check.run}\`.`
          : "This change touches code the invariant covers. Confirm it still holds.",
        components: invariant.components ?? [],
        locations: [{ path: BLUEPRINT_PATH }],
      });
    }
  }
  return findings;
}


export function runCheck(input: CheckInput): CheckReport {
  const head = input.blueprint;
  const diffMode = Array.isArray(input.changes);
  const changes = input.changes ?? [];
  const judge: Blueprint | null = diffMode ? (input.baseBlueprint ?? head) : head;
  const changed = diffMode ? changedPathSet(changes) : null;

  const entries: Array<{ violation: Violation; isNew: boolean }> = [];
  const add = (violations: Violation[], isNew: (violation: Violation) => boolean = () => true) => {
    for (const violation of violations) entries.push({ violation, isNew: isNew(violation) });
  };

  for (const issue of (input.blueprintIssues ?? []).slice(0, 20)) {
    add([{
      id: fingerprint("invalid-blueprint", issue.path, issue.message),
      kind: "invalid-blueprint",
      severity: "error",
      title: `Invalid blueprint at ${issue.path}`,
      message: issue.message,
      components: [],
      locations: [{ path: BLUEPRINT_PATH }],
    }]);
  }

  let model: SnapshotModel | null = null;
  if (judge) {
    model = buildSnapshotModel(input.files, judge, diffMode ? undefined : input.fileGraph);
    const compiled = compileRules(judge);
    const headViolations = [...evaluateRules(model, compiled), ...evaluatePolicy(model)];
    if (diffMode) {
      const baseModel = buildSnapshotModel(reconstructBaseSnapshot(input.files, changes, input.baseFiles), judge);
      const baseViolations = [...evaluateRules(baseModel, compiled), ...evaluatePolicy(baseModel)];
      const baseIds = new Set(baseViolations.map((violation) => violation.id));
      const baseUnmapped = new Set(baseModel.membership.unmapped);
      const newUnmapped = model.membership.unmapped.filter((path) => model!.fileGraph.facts.has(path) && !baseUnmapped.has(path));
      add(headViolations, (violation) => violation.kind !== "unmapped-file" && !baseIds.has(violation.id));
      if (newUnmapped.length && judge.policy.unmappedFiles !== "off") {
        add([{
          id: fingerprint("unmapped-file", "new", newUnmapped.join("|")),
          kind: "unmapped-file",
          severity: judge.policy.unmappedFiles,
          title: `${plural(newUnmapped.length, "new source file")} not claimed by any component`,
          message: "Add these paths to a component in the blueprint so its rules apply to them.",
          components: [],
          locations: newUnmapped.slice(0, 50).map((path) => ({ path })),
        }]);
      }
    } else {
      add(headViolations);
    }
  }

  const fileGraph = model?.fileGraph ?? input.fileGraph ?? buildFileGraph(input.files, {});
  const reach = input.reach ?? analyzeReach(input.files, fileGraph, model?.membership);
  for (const entry of reachFindings(reach, changed)) entries.push(entry);

  let agentActivity: AgentActivity | undefined;
  let impact: CheckReport["impact"];
  let contractChanges: CheckReport["contractChanges"];
  if (diffMode) {
    if (input.commits?.length) agentActivity = detectAgentActivity(input.commits);
    add(tripwireFindings(changes, judge));
    if (judge?.policy.verificationHeuristics ?? true) add(weakeningFindings(changes));
    if (!input.blueprintIssues?.length && (input.baseBlueprint !== undefined || head)) {
      const base = input.baseBlueprint ?? null;
      contractChanges = diffBlueprints(base, head);
      if (base || head) add(contractFindings(base, head, Boolean(input.approved)));
      if (base && head && model) {
        const moves = membershipMoves(base, head, model.fileGraph.files, Boolean(input.approved));
        add(moves);
        const reported = new Set(moves.map((move) => move.components.join("\u0000")));
        add(claimedPaths(base, head, reported, Boolean(input.approved)));
      }
    }
    if (model) {
      const changedPaths = [...changedPathSet(changes)];
      impact = computeImpact(changedPaths, judge, model.componentGraph);
      const touched = new Set(impact.touchedComponents.map((item) => item.id));
      for (const path of changedPaths) {
        const owner = componentForPath(path, judge);
        if (owner) touched.add(owner);
      }
      for (const component of judge!.components) {
        if (!component.verified || !touched.has(component.id)) continue;
        add([{
          id: fingerprint("stale-verification", component.id, component.verified.commit, component.verified.at),
          kind: "stale-verification",
          severity: "info",
          title: `Sign-off on "${component.name}" is now stale`,
          message: `${component.verified.by} verified this component${component.verified.commit ? ` at ${component.verified.commit.slice(0, 10)}` : ""} on ${component.verified.at}. This change touches it; re-verify with \`rassam verify ${component.id}\`.`,
          components: [component.id],
          locations: [{ path: BLUEPRINT_PATH }],
        }]);
      }
      add(invariantFindings(judge!, touched, changed, input.invariantResults));
    }
  } else if (judge && input.invariantResults?.length) {
    add(invariantFindings(judge, new Set(), null, input.invariantResults));
  }

  const dependents = model ? dependentCounts(model.componentGraph) : new Map<string, number>();
  const agentAuthored = (agentActivity?.agentCommits ?? 0) > 0;
  const unique = new Map<string, Finding>();
  for (const { violation, isNew } of entries) {
    if (unique.has(violation.id)) continue;
    unique.set(violation.id, { ...violation, isNew, score: scoreFinding(violation, isNew, dependents, agentAuthored) });
  }
  const severityRank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const findings = [...unique.values()].sort((left, right) => (
    right.score - left.score
    || severityRank[left.severity] - severityRank[right.severity]
    || left.id.localeCompare(right.id)
  ));

  const membership = model?.membership;
  const declared = new Set((judge?.dependencies ?? []).map((dependency) => `${dependency.from}\u0000${dependency.to}`));
  const componentById = new Map((judge?.components ?? []).map((component) => [component.id, component]));
  const componentEdges = model?.componentGraph.edges ?? [];
  const undeclaredEdges = componentEdges.filter((edge) => (
    !declared.has(`${edge.from}\u0000${edge.to}`)
    && !componentById.get(edge.to)?.public
    && componentById.get(edge.from)?.kind !== "test"
  ));
  return {
    tool: { name: ENGINE_NAME, version: ENGINE_VERSION },
    generatedAt: input.now ?? new Date().toISOString(),
    mode: diffMode ? "diff" : "full",
    blueprint: {
      path: BLUEPRINT_PATH,
      present: Boolean(head) || Boolean(input.blueprintIssues?.length),
      valid: Boolean(head) && !input.blueprintIssues?.length,
      system: (head ?? judge)?.system.name,
    },
    base: input.refs?.base,
    head: input.refs?.head,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      infos: findings.filter((finding) => finding.severity === "info").length,
      newFindings: findings.filter((finding) => finding.isNew).length,
      components: judge?.components.length ?? 0,
      filesAnalyzed: fileGraph.facts.size,
      filesMapped: membership ? [...membership.fileToComponent.keys()].filter((path) => fileGraph.facts.has(path)).length : 0,
      filesUnmapped: membership ? membership.unmapped.filter((path) => fileGraph.facts.has(path)).length : fileGraph.facts.size,
      componentEdges: componentEdges.length,
      undeclaredEdges: undeclaredEdges.length,
      humanAuthoredRatio: humanAuthoredRatio(head ?? judge),
    },
    findings,
    impact,
    contractChanges,
    agentActivity,
    reach,
    approved: diffMode ? Boolean(input.approved) : undefined,
  };
}
