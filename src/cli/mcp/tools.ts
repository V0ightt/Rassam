// The MCP tools coding agents call before and after they change code.
// Read tools answer from the working tree (and .rassam/status.json); the two
// write tools only ever create files under .rassam/proposals and .rassam/escalations.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verdict } from "../../blueprint/report";
import { BLUEPRINT_ESCALATIONS_DIR, BLUEPRINT_PATH, BLUEPRINT_PROPOSALS_DIR } from "../../blueprint/schema";
import type { Blueprint } from "../../blueprint/schema";
import { STATUS_PATH, isStale, summarizeStatus } from "../../blueprint/status";
import type { CheckReport, Finding } from "../../blueprint/types";
import { createWorkspace } from "../../blueprint/workspace";
import type { Workspace } from "../../blueprint/workspace";
import { formatIssues, loadContext } from "../context";
import type { RepoContext } from "../context";
import { runGate } from "../gate";
import { defaultBaseRef, headSha, repoRoot } from "../git";
import { CliError } from "../io";
import { compareArchitecture, readStatusFile } from "../live";
import { toRepoPath } from "../repo-path";
import { errorMessage, fileTimestamp, slugify } from "../util";
import { ToolError } from "./protocol";
import type { JsonObject, McpTool, ToolAnnotations, ToolOutcome } from "./protocol";

export const SERVER_INSTRUCTIONS = [
  "This repository has a human-owned architecture contract (.rassam/blueprint.json). Changes are checked against it in CI, judged by the base branch's copy, so editing the contract does not relax the rules for your change.",
  "Call explain_path before editing a file, check_dependency before adding an import, and check_changes before you finish.",
  "If the task cannot be done without breaking a rule, weakening a test or check, or editing the blueprint, stop and call report_conflict instead, then tell the user. Use propose_change to suggest a contract change for a human to review.",
  "architecture_diff shows what your change did to the system design (components and dependencies added or removed); system_status shows what is running, when the repository records it.",
].join(" ");

const USAGE_HINT =
  "Before editing a file call explain_path. Before adding an import call check_dependency. Before finishing call check_changes. " +
  "If the task conflicts with a rule, call report_conflict and stop instead of weakening tests, checks or the blueprint. " +
  "Never edit .rassam/blueprint.json yourself: call propose_change.";

const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES_NOTE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const NO_ARGUMENTS: JsonObject = { type: "object", additionalProperties: false };

const CACHE_TTL_MS = 2_000;
const MAX_FINDINGS = 20;
const MAX_LOCATIONS = 5;
const MAX_DIFF_ENTRIES = 100;
const STATUS_MAX_AGE_MINUTES = 30;

export interface ToolDeps {
  root: string;
  log?(message: string): void;
  now?(): Date;
}

interface Snapshot {
  key: string;
  loadedAt: number;
  context: RepoContext;
  workspace: Workspace;
}

function objectSchema(properties: JsonObject, required: string[] = []): JsonObject {
  return { type: "object", properties, required, additionalProperties: false };
}

function text(description: string, maxLength = 2_000): JsonObject {
  return { type: "string", minLength: 1, maxLength, description };
}

function asJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function compactFinding(finding: Finding): JsonObject {
  return asJson({
    id: finding.id,
    kind: finding.kind,
    severity: finding.severity,
    ruleId: finding.ruleId,
    title: finding.title,
    message: finding.message,
    reason: finding.reason,
    components: finding.components,
    locations: finding.locations.slice(0, MAX_LOCATIONS),
    moreLocations: Math.max(0, finding.locations.length - MAX_LOCATIONS) || undefined,
    isNew: finding.isNew,
  });
}

function nextStep(report: CheckReport, outcome: string, shown: number): string {
  if (shown === 0) return "Nothing in this change conflicts with the blueprint.";
  if (outcome === "pass") return "The gate passes. Review the remaining findings and mention them to the user.";
  return (
    "Fix the findings by changing your code, not the checks: do not edit the blueprint, weaken tests or skip CI to make this pass. " +
    "If a finding cannot be fixed without breaking the task, call report_conflict and tell the user." +
    (report.contractChanges?.length ? " This change edits the contract itself; a human must approve that." : "")
  );
}

export function createTools(deps: ToolDeps): McpTool[] {
  const now = deps.now ?? (() => new Date());
  let cache: Snapshot | null = null;

  async function cacheKey(isGit: boolean): Promise<string> {
    const info = await stat(join(deps.root, BLUEPRINT_PATH)).catch(() => null);
    const head = isGit ? await headSha(deps.root).catch(() => null) : null;
    return `${info ? `${info.mtimeMs}:${info.size}` : "none"}|${head ?? "nohead"}`;
  }

  /** Working tree + blueprint, reloaded per call unless nothing relevant changed in the last 2 s. */
  async function snapshot(): Promise<Snapshot> {
    const isGit = cache ? cache.context.isGit : (await repoRoot(deps.root).catch(() => null)) !== null;
    const key = await cacheKey(isGit);
    if (cache && cache.key === key && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
    const context = await loadContext(deps.root, isGit);
    cache = { key, loadedAt: Date.now(), context, workspace: createWorkspace(context.files, context.blueprint) };
    return cache;
  }

  function invalidate(): void {
    cache = null;
  }

  function blueprintOf(snap: Snapshot): Blueprint {
    if (snap.context.blueprintState === "invalid") {
      throw new ToolError(`${BLUEPRINT_PATH} is invalid, so the contract cannot be read. Tell the user; do not try to repair it yourself.\n${formatIssues(snap.context.blueprintIssues, 10)}`);
    }
    if (!snap.context.blueprint) {
      throw new ToolError(`This repository has no blueprint at ${BLUEPRINT_PATH} yet. A human creates one with "rassam init"; until then there is no contract to check against.`);
    }
    return snap.context.blueprint;
  }

  function pathArg(value: unknown, name: string): string {
    const path = toRepoPath(deps.root, deps.root, String(value));
    if (path === null || path === "") throw new ToolError(`"${name}" must be a path inside the repository (repository-relative, like src/lib/ai.ts).`);
    return path;
  }

  /** Import targets may be package names; only obvious file paths are normalized. */
  function targetArg(value: unknown): string {
    const raw = String(value).trim();
    const looksLikePath = /^\.{0,2}[\\/]/.test(raw) || /^[A-Za-z]:[\\/]/.test(raw) || raw.includes("\\");
    return looksLikePath ? pathArg(raw, "target") : raw;
  }

  function componentArg(blueprint: Blueprint, value: unknown): string {
    const id = String(value).trim();
    if (blueprint.components.some((component) => component.id === id)) return id;
    const ids = blueprint.components.map((component) => component.id);
    throw new ToolError(`Unknown component "${id}". Components: ${ids.slice(0, 60).join(", ")}${ids.length > 60 ? ", …" : ""}`);
  }

  async function writeNote(directory: string, title: string, fallback: string, record: JsonObject): Promise<string> {
    const stamp = fileTimestamp(now());
    const slug = slugify(title, fallback);
    await mkdir(join(deps.root, directory), { recursive: true });
    for (let attempt = 1; attempt <= 50; attempt++) {
      const file = `${directory}/${stamp}-${slug}${attempt === 1 ? "" : `-${attempt}`}.json`;
      try {
        await writeFile(join(deps.root, file), `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        return file;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new ToolError(`Could not write ${file}: ${errorMessage(error)}`);
      }
    }
    throw new ToolError(`Could not find a free file name in ${directory}`);
  }

  async function overview(): Promise<ToolOutcome> {
    const snap = await snapshot();
    blueprintOf(snap);
    const summary = snap.workspace.overview();
    return {
      structured: asJson({
        ...summary,
        counts: {
          components: summary.components.length,
          rules: summary.rules.length,
          invariants: summary.invariants,
          decisions: summary.decisions,
          dependencies: summary.dependencies,
          filesAnalyzed: summary.filesAnalyzed,
          unmappedSourceFiles: summary.unmappedSourceFiles,
        },
        humanAuthoredRatio: summary.authorship.ratio,
        howToUse: USAGE_HINT,
      }),
    };
  }

  async function explainPath(args: JsonObject): Promise<ToolOutcome> {
    const snap = await snapshot();
    blueprintOf(snap);
    return { structured: asJson(snap.workspace.explainPath(pathArg(args.path, "path"))) };
  }

  async function getComponent(args: JsonObject): Promise<ToolOutcome> {
    const snap = await snapshot();
    const id = componentArg(blueprintOf(snap), args.id);
    const summary = snap.workspace.componentSummary(id);
    if (!summary) throw new ToolError(`Unknown component "${id}".`);
    return { structured: asJson(summary) };
  }

  async function checkDependency(args: JsonObject): Promise<ToolOutcome> {
    const snap = await snapshot();
    blueprintOf(snap);
    const result = snap.workspace.checkDependency(pathArg(args.from_path, "from_path"), targetArg(args.target));
    return { structured: asJson(result) };
  }

  async function impact(args: JsonObject): Promise<ToolOutcome> {
    const snap = await snapshot();
    blueprintOf(snap);
    const paths = (args.paths as unknown[]).map((value) => pathArg(value, "paths"));
    return { structured: asJson(snap.workspace.impact(paths)) };
  }

  async function checkChanges(args: JsonObject): Promise<ToolOutcome> {
    invalidate();
    const snap = await snapshot();
    const requested = typeof args.base === "string" && args.base.trim() ? args.base.trim() : undefined;
    if (requested && !snap.context.isGit) throw new ToolError("This directory is not a git repository, so there is no base to compare against. Call check_changes without a base.");
    const base = requested ?? (snap.context.isGit ? (await defaultBaseRef(deps.root)) ?? undefined : undefined);
    let gate;
    try {
      gate = await runGate({ context: snap.context, base, note: deps.log });
    } catch (error) {
      if (error instanceof CliError) throw new ToolError(`${error.message}${error.hint ? ` ${error.hint}` : ""}`);
      throw error;
    }
    const { report } = gate;
    const relevant = gate.mode === "diff" ? report.findings.filter((finding) => finding.isNew) : report.findings;
    const shown = relevant.slice(0, MAX_FINDINGS);
    const outcome = verdict(report, "error");
    return {
      structured: asJson({
        verdict: outcome,
        mode: gate.mode,
        base: report.base,
        judgedBy: gate.mode === "diff" ? `the blueprint at the merge-base (${gate.baseBlueprint})` : "the working tree blueprint",
        blueprint: report.blueprint,
        summary: report.summary,
        findings: shown.map(compactFinding),
        moreFindings: relevant.length - shown.length,
        preExistingFindings: report.findings.length - relevant.length,
        contractChanges: report.contractChanges,
        next: nextStep(report, outcome, shown.length),
      }),
    };
  }

  async function systemStatus(): Promise<ToolOutcome> {
    const snap = await snapshot();
    const blueprint = blueprintOf(snap);
    const monitored = blueprint.components.filter((component) => component.runtime);
    const file = await readStatusFile(deps.root);
    if (file.state !== "ok") {
      const note =
        file.state === "invalid"
          ? `${STATUS_PATH} is not a valid status file (${file.message}). Treat every component as unknown.`
          : monitored.length
            ? `No status has been recorded yet (${STATUS_PATH} is missing). A person or CI records it with "rassam status --write"; until then the state of every component is unknown.`
            : "No component declares runtime in the blueprint, so nothing is monitored. This says nothing about whether the system is running.";
      return {
        structured: asJson({ available: false, monitored: monitored.length, summary: summarizeStatus(null, blueprint), components: monitored.map((component) => ({ id: component.id, name: component.name, state: "unknown" })), note }),
      };
    }
    const { status } = file;
    const current = now();
    const stale = isStale(status, current, STATUS_MAX_AGE_MINUTES);
    const checked = Date.parse(status.checkedAt);
    const ageMinutes = Number.isFinite(checked) ? Math.max(0, Math.round((current.getTime() - checked) / 60_000)) : null;
    const ids = [...new Set([...monitored.map((component) => component.id), ...Object.keys(status.components)])].sort();
    const names = new Map(blueprint.components.map((component) => [component.id, component.name]));
    return {
      structured: asJson({
        available: true,
        checkedAt: status.checkedAt,
        commit: status.commit,
        ageMinutes,
        stale,
        monitored: monitored.length,
        summary: summarizeStatus(status, blueprint),
        components: ids.map((id) => {
          const entry = status.components[id];
          return { id, name: names.get(id) ?? id, state: entry?.state ?? "unknown", source: entry?.source, detail: entry?.detail, latencyMs: entry?.latencyMs, checkedAt: entry?.checkedAt };
        }),
        note: stale
          ? `This status is ${ageMinutes === null ? "of unknown age" : `${ageMinutes} minutes old`}: treat every state as unknown until it is refreshed with "rassam status --write".`
          : "Recorded by the last probe run. It can be minutes old; it is not a live reading.",
      }),
    };
  }

  async function architectureDiff(args: JsonObject): Promise<ToolOutcome> {
    invalidate();
    const snap = await snapshot();
    blueprintOf(snap);
    if (!snap.context.isGit) throw new ToolError("This directory is not a git repository, so there is no base to compare the architecture with.");
    const requested = typeof args.base === "string" && args.base.trim() ? args.base.trim() : undefined;
    const base = requested ?? (await defaultBaseRef(deps.root)) ?? undefined;
    if (!base) throw new ToolError("No base branch found (origin/main, main, ...). Pass base, e.g. HEAD~1 or origin/main.");
    let comparison;
    try {
      comparison = await compareArchitecture(snap.context, base, snap.workspace.graphView());
    } catch (error) {
      if (error instanceof CliError) throw new ToolError(`${error.message}${error.hint ? ` ${error.hint}` : ""}`);
      throw error;
    }
    const { diff } = comparison;
    if (!diff) {
      return {
        structured: asJson({
          base: { ref: base, sha: comparison.sha },
          comparable: false,
          changed: false,
          summary: `The blueprint at the base commit is ${comparison.baseBlueprint}, so there is no earlier architecture to compare with.`,
        }),
      };
    }
    const cut = <T>(items: T[]): T[] => items.slice(0, MAX_DIFF_ENTRIES);
    const more = [diff.components.added, diff.components.removed, diff.edges.added, diff.edges.removed, diff.edges.statusChanged].reduce((sum, items) => sum + Math.max(0, items.length - MAX_DIFF_ENTRIES), 0);
    return {
      structured: asJson({
        base: { ref: base, sha: comparison.sha },
        comparable: true,
        changed: diff.changed,
        summary: diff.changed ? `Since ${base}: ${diff.summary}.` : `No architecture changes since ${base}.`,
        components: { added: cut(diff.components.added), removed: cut(diff.components.removed) },
        edges: { added: cut(diff.edges.added), removed: cut(diff.edges.removed), statusChanged: cut(diff.edges.statusChanged) },
        moreEntries: more || undefined,
        note: "Uncommitted and untracked files are included. An edge that became undeclared or forbidden is a violation: run check_changes for the findings.",
      }),
    };
  }

  async function listDecisions(args: JsonObject): Promise<ToolOutcome> {
    const snap = await snapshot();
    const blueprint = blueprintOf(snap);
    const component = args.component === undefined || args.component === null ? undefined : componentArg(blueprint, args.component);
    const decisions = blueprint.decisions.filter((decision) => !component || !decision.components?.length || decision.components.includes(component));
    return { structured: asJson({ component: component ?? null, count: decisions.length, decisions }) };
  }

  async function proposeChange(args: JsonObject): Promise<ToolOutcome> {
    const createdAt = now().toISOString();
    const record = asJson({
      title: String(args.title).trim(),
      rationale: args.rationale,
      changes: args.changes,
      agent: args.agent ?? "unknown agent",
      createdAt,
      status: "pending",
    });
    const file = await writeNote(BLUEPRINT_PROPOSALS_DIR, String(args.title), "proposal", record);
    const note = `Proposal recorded for human review. ${BLUEPRINT_PATH} was not changed and you must not edit it: until a human accepts the proposal, the current contract still applies to your work.`;
    return { structured: { file, status: "pending", createdAt, note }, text: `Wrote ${file}. ${note}` };
  }

  async function reportConflict(args: JsonObject): Promise<ToolOutcome> {
    const createdAt = now().toISOString();
    const record = asJson({
      summary: String(args.summary).trim(),
      details: args.details,
      ruleId: args.rule_id,
      paths: args.paths,
      agent: args.agent ?? "unknown agent",
      createdAt,
      status: "open",
    });
    const file = await writeNote(BLUEPRINT_ESCALATIONS_DIR, String(args.summary), "conflict", record);
    const instruction =
      "Conflict recorded. Stop work on the conflicting part of the task now. Do not weaken or delete tests, checks, CI or the blueprint to get around it. " +
      "Tell the user what you found, which rule or invariant is involved, and what you would need from them to continue. You may finish parts of the task that do not conflict.";
    return { structured: { file, status: "open", createdAt, instruction }, text: `Wrote ${file}. ${instruction}` };
  }

  return [
    {
      name: "blueprint_overview",
      title: "Blueprint overview",
      description:
        "Start here. Returns the architecture contract of this repository: the system, its components (id, kind, file count, intent, human-verified?, assurance), every rule with severity and a one-line summary, counts, how much of the contract is human-authored, and how to use this server.",
      inputSchema: NO_ARGUMENTS,
      annotations: READ_ONLY,
      handler: overview,
    },
    {
      name: "explain_path",
      title: "Explain a path",
      description:
        "Call this BEFORE editing or creating a file. Returns which component owns the path, its intent and owners, the rules that constrain changes there, what it may and may not depend on, the invariants and decisions to respect, and whether the path is protected (changes need human review).",
      inputSchema: objectSchema({ path: text("Repository-relative path, e.g. src/lib/ai.ts") }, ["path"]),
      annotations: READ_ONLY,
      handler: explainPath,
    },
    {
      name: "get_component",
      title: "Get a component",
      description: "Full summary of one component: definition and intent, files, what it depends on and what depends on it (declared and observed), external packages, environment variables it reads, tests, rules, invariants and decisions.",
      inputSchema: objectSchema({ id: text("Component id from blueprint_overview", 80) }, ["id"]),
      annotations: READ_ONLY,
      handler: getComponent,
    },
    {
      name: "check_dependency",
      title: "Check a dependency",
      description:
        'Call this BEFORE adding an import. Answers "may code in from_path import target?" where target is a repository path or a package name. Returns allowed, the rules it would violate with their human-written reasons, and whether the dependency is undeclared.',
      inputSchema: objectSchema(
        {
          from_path: text("Repository-relative path of the file that would contain the import"),
          target: text('What it would import: a repository path (src/lib/db.ts) or a package name ("octokit", "node:fs")'),
        },
        ["from_path", "target"],
      ),
      annotations: READ_ONLY,
      handler: checkDependency,
    },
    {
      name: "impact",
      title: "Impact of a change",
      description: "Blast radius: which components the given paths belong to, and which components depend on them (transitively, nearest first). Use it to decide what to re-test and what to tell the user.",
      inputSchema: objectSchema(
        { paths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 500, description: "Repository-relative paths you changed or plan to change" } },
        ["paths"],
      ),
      annotations: READ_ONLY,
      handler: impact,
    },
    {
      name: "check_changes",
      title: "Check my changes",
      description:
        "Call this BEFORE you finish or open a pull request. Runs the same gate as CI on the current working tree (uncommitted and untracked files included) and returns the verdict with the top findings, so you can fix them first. Compares against base (default: the repository's default branch) and judges by the blueprint at the merge-base; without a resolvable base it checks the whole tree.",
      inputSchema: objectSchema({ base: text("Git ref the change will merge into, e.g. origin/main", 200) }),
      annotations: READ_ONLY,
      handler: checkChanges,
    },
    {
      name: "list_decisions",
      title: "List decisions",
      description: "Architecture decision records from the blueprint (context, decision, consequences, status), optionally only those that apply to one component. Read them before proposing to change how something works.",
      inputSchema: objectSchema({ component: text("Only decisions that apply to this component id", 80) }),
      annotations: READ_ONLY,
      handler: listDecisions,
    },
    {
      name: "architecture_diff",
      title: "What my change did to the architecture",
      description:
        "Structural diff of the system design: which components and dependencies the working tree added, removed or changed status (declared, undeclared, forbidden, no longer observed) compared with base (default: the repository's default branch), plus one sentence summarizing it. Use it to tell the user what your change did to the architecture. It reports structure only; check_changes reports violations.",
      inputSchema: objectSchema({ base: text("Git ref to compare with, e.g. origin/main or HEAD~1", 200) }),
      annotations: READ_ONLY,
      handler: architectureDiff,
    },
    {
      name: "system_status",
      title: "What is running",
      description:
        "Runtime status recorded in .rassam/status.json by \"rassam status --write\" (usually in CI): overall summary and, per component that declares runtime, its state (up, degraded, down, unknown), the signal it came from (health check, deployment, workflow) and when it was checked. Includes how old the data is and whether it is stale. Read-only: it never probes anything itself.",
      inputSchema: NO_ARGUMENTS,
      annotations: READ_ONLY,
      handler: systemStatus,
    },
    {
      name: "propose_change",
      title: "Propose a blueprint change",
      description:
        "Suggest a change to the contract for a human to review. Writes a file under .rassam/proposals/ and never edits .rassam/blueprint.json. The current contract keeps applying until a human accepts the proposal.",
      inputSchema: objectSchema(
        {
          title: text("Short title of the proposed change", 200),
          rationale: text("Why the contract should change", 8_000),
          changes: text("The change itself: a precise description or a JSON patch of the blueprint", 50_000),
          agent: text("Your name, e.g. Claude Code", 120),
        },
        ["title", "rationale", "changes"],
      ),
      annotations: WRITES_NOTE,
      handler: proposeChange,
    },
    {
      name: "report_conflict",
      title: "Report a conflict and stop",
      description:
        "Use this when the task cannot be completed without breaking a rule or invariant, weakening a test or check, or editing the blueprint. This is the sanctioned way to stop: it records the conflict under .rassam/escalations/ for a human and tells you how to proceed. Stopping here is a correct outcome, not a failure.",
      inputSchema: objectSchema(
        {
          summary: text("One sentence: what conflicts with what", 300),
          details: text("What you tried, what the rule requires, and what would resolve it", 8_000),
          rule_id: text("Id of the rule or invariant involved, if any", 80),
          paths: { type: "array", items: { type: "string" }, maxItems: 100, description: "Repository-relative paths involved" },
          agent: text("Your name, e.g. Claude Code", 120),
        },
        ["summary"],
      ),
      annotations: WRITES_NOTE,
      handler: reportConflict,
    },
  ];
}
