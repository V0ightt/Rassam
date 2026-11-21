// Pure renderers over CheckReport. Human attention is modelled as a small
// audit budget: every renderer leads with a short, ranked "needs your
// attention" list backed by file:line evidence and collapses the rest.

import { BLUEPRINT_PATH } from "./schema";
import type { Severity } from "./schema";
import type { BlueprintChange, CheckReport, Finding, FindingKind, FindingLocation, ImpactReport, ReachReport } from "./types";

export type FailOn = "error" | "warning" | "never";
export type Verdict = "pass" | "warn" | "fail";

export interface GraphView {
  components: Array<{ id: string; name: string; kind?: string; external?: boolean; findings?: number }>;
  edges: Array<{ from: string; to: string; status: "declared" | "undeclared" | "forbidden" | "missing"; count?: number }>;
}

export const COMMENT_MARKER = "<!-- rassam:blueprint-check -->";

const DEFAULT_BUDGET = 5;
const MAX_LOCATIONS = 3;
const DEFAULT_MAX_CHARS = 60_000;
const DEFAULT_MAX_ANNOTATIONS = 50;
const TRUNCATION_NOTE = "_Details were truncated to fit the comment size limit. Run `rassam check` locally for the full report._";

const SEVERITY_RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };

const KIND_INFO: Record<FindingKind, { label: string; help: string }> = {
  "invalid-blueprint": {
    label: "Invalid blueprint",
    help: "The blueprint file is missing, unparsable or fails validation. Fix .rassam/blueprint.json so changes can be checked against it.",
  },
  "forbidden-dependency": {
    label: "Forbidden dependency",
    help: "A dependency crosses a boundary that a forbid rule prohibits. Remove the import or change the rule with human approval.",
  },
  "allow-only-violation": {
    label: "Allow-only violation",
    help: "A component depends on something outside the set its allow-only rule permits.",
  },
  "layer-violation": {
    label: "Layer violation",
    help: "A lower layer depends on a higher layer. Layers may only depend on layers below them.",
  },
  "dependency-cycle": {
    label: "Dependency cycle",
    help: "Components depend on each other in a cycle that a no-cycles rule prohibits.",
  },
  "undeclared-dependency": {
    label: "Undeclared dependency",
    help: "The code has a cross-component dependency that the blueprint does not declare. Declare it or remove it.",
  },
  "unmapped-file": {
    label: "Unmapped file",
    help: "A source file is not owned by any component. Add it to a component's paths or ignore it in the policy.",
  },
  "empty-component": {
    label: "Empty component",
    help: "A component's globs match no files. Its paths are stale or the code was moved.",
  },
  "protected-path": {
    label: "Protected path changed",
    help: "A tripwire path (tests, CI, lockfiles, agent permissions, the blueprint itself) changed and needs human review.",
  },
  "verification-weakened": {
    label: "Verification weakened",
    help: "The change weakens checks: skipped or deleted tests, removed assertions, loosened CI.",
  },
  "contract-weakened": {
    label: "Contract weakened",
    help: "The blueprint was changed in a way that loosens the contract agents are judged by. Requires human approval.",
  },
  "contract-changed": {
    label: "Contract changed",
    help: "The blueprint changed. Review that the new contract reflects human intent.",
  },
  "secret-access": {
    label: "Secret access",
    help: "A secret or environment variable is read by code that a secret-access rule does not allow.",
  },
  "inline-secret": {
    label: "Inline secret",
    help: "A credential appears inline in an agent or tool configuration file. Move it to a secret store and rotate it.",
  },
  "agent-permission-change": {
    label: "Agent permission change",
    help: "Agent permissions, MCP servers or agent instructions changed, altering what coding agents can reach.",
  },
  "assurance-drift": {
    label: "Assurance drift",
    help: "A component's declared assurance level no longer matches the evidence in the repository.",
  },
  "stale-verification": {
    label: "Stale verification",
    help: "A human sign-off predates changes to the code it covers and should be renewed.",
  },
  "invariant-at-risk": {
    label: "Invariant at risk",
    help: "The change touches code or tests that an invariant depends on.",
  },
  "invariant-failed": {
    label: "Invariant failed",
    help: "An invariant's check failed.",
  },
};

// ── Verdict ───────────────────────────────────────────────────

function isFailing(finding: Finding, failOn: FailOn): boolean {
  if (failOn === "never" || !finding.isNew) return false;
  return SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[failOn];
}

export function verdict(report: CheckReport, failOn: FailOn = "error"): Verdict {
  if (report.findings.some((finding) => isFailing(finding, failOn))) return "fail";
  if (report.findings.some((finding) => finding.isNew && finding.severity !== "info")) return "warn";
  return "pass";
}

export function exitCodeFor(report: CheckReport, failOn: FailOn): number {
  return verdict(report, failOn) === "fail" ? 1 : 0;
}

// ── Shared helpers ────────────────────────────────────────────

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function percent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/** Collapse whitespace and drop control characters (blocks ANSI and layout injection). */
function oneLine(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) out += " ";
    else if (code >= 32 && code !== 127) out += char;
  }
  return out.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function budgetOf(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? DEFAULT_BUDGET : Math.max(0, Math.floor(value));
}

function locationLabel(location: FindingLocation): string {
  return location.line === undefined ? location.path : `${location.path}:${location.line}`;
}

function groupByKind(findings: Finding[]): Array<[FindingKind, Finding[]]> {
  const groups = new Map<FindingKind, Finding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.kind);
    if (group) group.push(finding);
    else groups.set(finding.kind, [finding]);
  }
  return [...groups.entries()];
}

function rangeLabel(report: CheckReport): string | null {
  if (!report.base && !report.head) return null;
  if (!report.base) return `at ${report.head?.ref}`;
  return `${report.base.ref}…${report.head?.ref ?? "working tree"}`;
}

const MAX_LISTED_CONTRACT_CHANGES = 12;

/** Every weakening change is listed; other changes are capped and summarized. */
function capContractChanges(changes: BlueprintChange[]): { shown: BlueprintChange[]; hidden: BlueprintChange[] } {
  const sorted = sortedContractChanges(changes);
  const weakening = sorted.filter((change) => change.weakens);
  const other = sorted.filter((change) => !change.weakens);
  const room = Math.max(0, MAX_LISTED_CONTRACT_CHANGES - weakening.length);
  return { shown: [...weakening, ...other.slice(0, room)], hidden: other.slice(room) };
}

function kindCounts(changes: BlueprintChange[]): string {
  const counts = new Map<string, number>();
  for (const change of changes) counts.set(change.kind, (counts.get(change.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(", ");
}

function sortedContractChanges(changes: BlueprintChange[]): BlueprintChange[] {
  return [...changes.filter((change) => change.weakens), ...changes.filter((change) => !change.weakens)];
}

function hasImpact(impact: ImpactReport | undefined): impact is ImpactReport {
  return !!impact && (impact.touchedComponents.length > 0 || impact.dependents.length > 0);
}

function reachHighlights(reach: ReachReport | undefined) {
  const broad = reach?.permissions.filter((grant) => grant.broad && grant.effect === "allow") ?? [];
  const secrets = reach?.inlineSecrets ?? [];
  const servers = reach?.mcpServers ?? [];
  return { broad, secrets, servers, any: broad.length + secrets.length + servers.length > 0 };
}

function summaryParts(report: CheckReport): string[] {
  const s = report.summary;
  return [
    `${plural(s.errors, "error")}, ${plural(s.warnings, "warning")}, ${plural(s.infos, "info")}`,
    `${s.newFindings} new`,
    plural(s.components, "component"),
    `${s.filesMapped}/${s.filesAnalyzed} files mapped (${s.filesUnmapped} unmapped)`,
    `${plural(s.componentEdges, "component edge")} (${s.undeclaredEdges} undeclared)`,
    `${percent(s.humanAuthoredRatio)}% human-authored`,
  ];
}

// ── Terminal text ─────────────────────────────────────────────

type Paint = (code: string, text: string) => string;

const ANSI = { red: "31", yellow: "33", cyan: "36", green: "32", dim: "2", bold: "1" } as const;
const TEXT_SEVERITY: Record<Severity, { mark: string; color: string }> = {
  error: { mark: "✖", color: ANSI.red },
  warning: { mark: "▲", color: ANSI.yellow },
  info: { mark: "●", color: ANSI.cyan },
};
const TEXT_VERDICT: Record<Verdict, { mark: string; color: string }> = {
  pass: { mark: "✔", color: ANSI.green },
  warn: { mark: "▲", color: ANSI.yellow },
  fail: { mark: "✖", color: ANSI.red },
};

function painter(color: boolean): Paint {
  return color ? (code, text) => `\u001b[${code}m${text}\u001b[0m` : (_code, text) => text;
}

function textLocations(locations: FindingLocation[]): string | null {
  if (locations.length === 0) return null;
  const shown = locations.slice(0, MAX_LOCATIONS).map((location) => oneLine(locationLabel(location)));
  const extra = locations.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` +${extra} more` : "");
}

function textFinding(finding: Finding, paint: Paint): string[] {
  const severity = TEXT_SEVERITY[finding.severity];
  const lines = [
    `  ${paint(severity.color, `${severity.mark} ${finding.severity}`)} ${paint(ANSI.bold, oneLine(finding.title))} ${paint(ANSI.dim, `[${finding.kind}]`)}`,
  ];
  const message = oneLine(finding.message);
  if (message) lines.push(`      ${clip(message, 300)}`);
  const locations = textLocations(finding.locations);
  if (locations) lines.push(`      ${paint(ANSI.dim, `at ${locations}`)}`);
  if (finding.reason) lines.push(`      reason: "${clip(oneLine(finding.reason), 300)}"`);
  return lines;
}

function textHeader(report: CheckReport, paint: Paint, failOn: FailOn = "error"): string {
  const result = verdict(report, failOn);
  const style = TEXT_VERDICT[result];
  const parts = [paint(style.color, `${style.mark} ${result}`)];
  if (!report.blueprint.present) {
    parts.push(`no blueprint found at ${report.blueprint.path || BLUEPRINT_PATH}; run \`rassam init\` to create one`);
  } else {
    parts.push(oneLine(report.blueprint.system ?? "(unnamed system)"));
    if (!report.blueprint.valid) parts.push("blueprint is invalid");
  }
  parts.push(`${report.mode} mode`);
  const range = rangeLabel(report);
  if (range) parts.push(oneLine(range));
  return parts.join(" · ");
}

function textRemaining(rest: Finding[], verbose: boolean, paint: Paint): string[] {
  if (rest.length === 0) return [];
  const existing = rest.filter((finding) => !finding.isNew).length;
  const lines = ["", `Other findings (${rest.length}${existing > 0 ? `, ${existing} pre-existing` : ""})`];
  for (const [kind, group] of groupByKind(rest)) {
    lines.push(`  ${group.length} × ${kind}`);
    if (verbose) for (const finding of group) lines.push(...textFinding(finding, paint).map((line) => `  ${line}`));
  }
  if (!verbose) lines.push(paint(ANSI.dim, "  (use --verbose for details)"));
  return lines;
}

function textContractChanges(report: CheckReport, paint: Paint): string[] {
  const changes = report.contractChanges ?? [];
  if (changes.length === 0) return [];
  const weakening = changes.filter((change) => change.weakens).length;
  const approval = report.approved ? "approved by a human" : weakening > 0 ? "NOT approved" : "not approved";
  const lines = ["", `Contract changes (${changes.length}, ${weakening} weakening, ${approval})`];
  const { shown, hidden } = capContractChanges(changes);
  for (const change of shown) {
    const mark = change.weakens ? paint(ANSI.yellow, "⚠") : " ";
    lines.push(`  ${mark} ${change.kind} ${oneLine(change.target)}: ${clip(oneLine(change.summary), 200)}`);
  }
  if (hidden.length) lines.push(`    …and ${hidden.length} more (${kindCounts(hidden)})`);
  return lines;
}

function textImpact(report: CheckReport): string[] {
  if (!hasImpact(report.impact)) return [];
  const impact = report.impact;
  const lines = ["", `Blast radius (${plural(impact.changedFiles.length, "changed file")})`];
  const touched = impact.touchedComponents.map((component) => `${oneLine(component.id)} (${plural(component.files.length, "file")})`);
  lines.push(`  touched: ${touched.length ? touched.join(", ") : "none"}`);
  const dependents = impact.dependents.map((dependent) => `${oneLine(dependent.id)} (depth ${dependent.depth})`);
  lines.push(`  dependents: ${dependents.length ? dependents.join(", ") : "none"}`);
  return lines;
}

function agentActivityLine(report: CheckReport): string | null {
  const activity = report.agentActivity;
  if (!activity) return null;
  const names = activity.agents.length ? ` (${activity.agents.map(oneLine).join(", ")})` : "";
  return `${activity.agentCommits}/${plural(activity.commits, "commit")} by agents${names}`;
}

function textReach(report: CheckReport, paint: Paint): string[] {
  const { broad, secrets, servers, any } = reachHighlights(report.reach);
  if (!any) return [];
  const lines = ["", "Reach highlights"];
  if (secrets.length > 0) {
    lines.push(`  ${paint(ANSI.red, `inline secrets: ${secrets.length}`)}`);
    for (const secret of secrets.slice(0, DEFAULT_BUDGET)) {
      lines.push(`    ${paint(ANSI.dim, `${oneLine(secret.path)}:${secret.line}`)} ${oneLine(secret.location)} ${oneLine(secret.preview)}`);
    }
    if (secrets.length > DEFAULT_BUDGET) lines.push(`    +${secrets.length - DEFAULT_BUDGET} more`);
  }
  if (broad.length > 0) {
    lines.push(`  ${paint(ANSI.yellow, `broad permissions: ${broad.length}`)}`);
    for (const grant of broad.slice(0, DEFAULT_BUDGET)) {
      lines.push(`    ${paint(ANSI.dim, oneLine(grant.path))} ${oneLine(grant.agent)} allows ${oneLine(grant.rule)}`);
    }
    if (broad.length > DEFAULT_BUDGET) lines.push(`    +${broad.length - DEFAULT_BUDGET} more`);
  }
  if (servers.length > 0) {
    const names = servers.map((server) => `${oneLine(server.name)} (${server.transport}, ${oneLine(server.agent)})`);
    lines.push(`  MCP servers: ${servers.length}: ${names.join(", ")}`);
  }
  return lines;
}

export function renderText(report: CheckReport, options: { color?: boolean; budget?: number; verbose?: boolean; failOn?: FailOn } = {}): string {
  const paint = painter(options.color === true);
  const budget = budgetOf(options.budget);
  const fresh = report.findings.filter((finding) => finding.isNew);
  const top = fresh.slice(0, budget);
  const shown = new Set(top);
  const rest = report.findings.filter((finding) => !shown.has(finding));

  const lines = [textHeader(report, paint, options.failOn ?? "error"), summaryParts(report).join(" · "), ""];
  if (top.length === 0) {
    lines.push(fresh.length === 0 ? "Nothing new needs your attention." : `Needs your attention: ${plural(fresh.length, "new finding")} (budget 0)`);
  } else {
    lines.push(paint(ANSI.bold, `Needs your attention (${top.length} of ${fresh.length} new)`));
    for (const finding of top) lines.push(...textFinding(finding, paint));
  }
  lines.push(...textRemaining(rest, options.verbose === true, paint));
  lines.push(...textContractChanges(report, paint));
  lines.push(...textImpact(report));
  const activity = agentActivityLine(report);
  if (activity) lines.push("", `Agent activity: ${activity}`);
  lines.push(...textReach(report, paint));
  return `${lines.join("\n")}\n`;
}

// ── Markdown (sticky PR comment) ──────────────────────────────

const MD_SEVERITY: Record<Severity, string> = { error: "🔴 error", warning: "🟡 warning", info: "🔵 info" };
const MD_VERDICT: Record<Verdict, { emoji: string; text: string }> = {
  pass: { emoji: "✅", text: "Blueprint check passed" },
  warn: { emoji: "⚠️", text: "Blueprint check passed with warnings" },
  fail: { emoji: "❌", text: "Blueprint check failed" },
};

/** Escape user-provided text for inline markdown. Also defuses @mentions. */
function escapeMd(text: string): string {
  return oneLine(text)
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_|[\]~])/g, "\\$1")
    .replace(/^([#+-])/, "\\$1")
    .replace(/@(?=[A-Za-z0-9])/g, "@&#8203;");
}

function codeSpan(text: string, inTable = false): string {
  const clean = oneLine(text) || " ";
  const longestRun = Math.max(0, ...(clean.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const pad = clean.startsWith("`") || clean.endsWith("`") ? " " : "";
  const span = `${fence}${pad}${clean}${pad}${fence}`;
  return inTable ? span.replace(/\|/g, "\\|") : span;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
}

interface LinkContext {
  repoUrl?: string;
  headSha?: string;
}

function mdLocation(location: FindingLocation, link: LinkContext): string {
  const label = codeSpan(locationLabel(location));
  if (!link.repoUrl || !link.headSha) return label;
  const base = `${link.repoUrl.replace(/\/+$/, "")}/blob/${encodeURIComponent(link.headSha)}/${encodePath(location.path)}`;
  if (location.line === undefined) return `[${label}](${base})`;
  const range = location.endLine !== undefined && location.endLine > location.line ? `-L${location.endLine}` : "";
  return `[${label}](${base}#L${location.line}${range})`;
}

function mdLocations(locations: FindingLocation[], link: LinkContext): string | null {
  if (locations.length === 0) return null;
  const shown = locations.slice(0, MAX_LOCATIONS).map((location) => mdLocation(location, link));
  const extra = locations.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` +${extra} more` : "");
}

function mdAttentionItem(finding: Finding, index: number, link: LinkContext): string[] {
  const lines = [`${index + 1}. ${MD_SEVERITY[finding.severity]} · **${escapeMd(finding.title)}** (${codeSpan(finding.kind)})`];
  const message = escapeMd(clip(oneLine(finding.message), 600));
  if (message) lines.push(`   ${message}`);
  const locations = mdLocations(finding.locations, link);
  if (locations) lines.push(`   📍 ${locations}`);
  if (finding.reason) lines.push("", `   > ${escapeMd(clip(oneLine(finding.reason), 600))}`, "");
  return lines;
}

function mdDetailItem(finding: Finding, link: LinkContext, withKind: boolean): string {
  const kind = withKind ? `${codeSpan(finding.kind)} ` : "";
  const message = escapeMd(clip(oneLine(finding.message), 300));
  const locations = mdLocations(finding.locations, link);
  return `- ${MD_SEVERITY[finding.severity]} ${kind}**${escapeMd(finding.title)}**${message ? `: ${message}` : ""}${locations ? ` · ${locations}` : ""}`;
}

function mdHeading(report: CheckReport, result: Verdict): string {
  const style = MD_VERDICT[result];
  if (!report.blueprint.present) return `## ${style.emoji} Rassam: no blueprint found`;
  const fresh = report.findings.filter((finding) => finding.isNew);
  const errors = fresh.filter((finding) => finding.severity === "error").length;
  const warnings = fresh.filter((finding) => finding.severity === "warning").length;
  const counts = [errors ? plural(errors, "new error") : "", warnings ? plural(warnings, "new warning") : ""].filter(Boolean).join(", ");
  return `## ${style.emoji} Rassam: ${style.text}${counts ? ` (${counts})` : ""}`;
}

function mdContext(report: CheckReport): string {
  const parts: string[] = [];
  if (report.blueprint.present) {
    parts.push(`**${escapeMd(report.blueprint.system ?? "(unnamed system)")}**`);
    if (!report.blueprint.valid) parts.push("blueprint is **invalid**");
  } else {
    parts.push(`No blueprint at ${codeSpan(report.blueprint.path || BLUEPRINT_PATH)}. Run \`rassam init\` to create one.`);
  }
  parts.push(`${report.mode} mode`);
  if (report.base) parts.push(`${codeSpan(report.base.ref)}…${codeSpan(report.head?.ref ?? "working tree")}`);
  else if (report.head) parts.push(`at ${codeSpan(report.head.ref)}`);
  return parts.join(" · ");
}

function mdContractChanges(report: CheckReport): string[] {
  const changes = report.contractChanges ?? [];
  if (changes.length === 0) return [];
  const weakening = changes.filter((change) => change.weakens).length;
  const lines = ["### Contract changes", "", "| | Change | Target | Summary |", "|---|---|---|---|"];
  const { shown, hidden } = capContractChanges(changes);
  for (const change of shown) {
    lines.push(`| ${change.weakens ? "⚠" : ""} | ${change.kind} | ${codeSpan(change.target, true)} | ${escapeMd(clip(oneLine(change.summary), 300))} |`);
  }
  if (hidden.length) lines.push(`| | … | | ${escapeMd(`and ${hidden.length} more: ${kindCounts(hidden)}`)} |`);
  lines.push("");
  if (weakening === 0) {
    lines.push("No change weakens the contract. Weakening changes require a human-approved label.");
  } else if (report.approved) {
    lines.push(`✅ **Approved:** ${plural(weakening, "weakening change")} carried a human-approved label.`);
  } else {
    lines.push(`⚠ **Not approved:** ${plural(weakening, "change")} weaken${weakening === 1 ? "s" : ""} the contract. Weakening changes require a human-approved label.`);
  }
  return lines;
}

function mdImpact(report: CheckReport): string[] {
  if (!hasImpact(report.impact)) return [];
  const impact = report.impact;
  const touched = impact.touchedComponents.map((component) => `${codeSpan(component.id)} (${plural(component.files.length, "file")})`);
  const dependents = impact.dependents.map((dependent) => `${codeSpan(dependent.id)} (depth ${dependent.depth})`);
  return [
    "### Blast radius",
    "",
    `- **Changed:** ${plural(impact.changedFiles.length, "file")} in ${plural(impact.touchedComponents.length, "component")}${touched.length ? `: ${touched.join(", ")}` : ""}`,
    `- **Dependents:** ${dependents.length ? dependents.join(", ") : "none"}`,
  ];
}

interface DetailsBlock {
  summary: string;
  items: string[];
}

function renderBlock(block: DetailsBlock, itemCount = block.items.length): string {
  const items = block.items.slice(0, itemCount);
  const omitted = block.items.length - items.length;
  if (omitted > 0) items.push(`- …and ${omitted} more`);
  return `<details>\n<summary>${block.summary}</summary>\n\n${items.join("\n")}\n\n</details>`;
}

function mdDetailBlocks(report: CheckReport, link: LinkContext): DetailsBlock[] {
  const blocks: DetailsBlock[] = [];
  const fresh = report.findings.filter((finding) => finding.isNew);
  const existing = report.findings.filter((finding) => !finding.isNew);
  for (const [kind, group] of groupByKind(fresh)) {
    blocks.push({
      summary: `${KIND_INFO[kind].label} (${group.length}) · <code>${kind}</code>`,
      items: group.map((finding) => mdDetailItem(finding, link, false)),
    });
  }
  const { broad, secrets, servers, any } = reachHighlights(report.reach);
  if (any) {
    blocks.push({
      summary: `Agent reach: ${plural(secrets.length, "inline secret")}, ${plural(broad.length, "broad permission")}, ${plural(servers.length, "MCP server")}`,
      items: [
        ...secrets.map((secret) => `- 🔴 inline secret ${mdLocation({ path: secret.path, line: secret.line }, link)} ${codeSpan(secret.location)} ${codeSpan(secret.preview)}`),
        ...broad.map((grant) => `- 🟡 broad permission ${codeSpan(grant.path)}: ${escapeMd(grant.agent)} allows ${codeSpan(grant.rule)}`),
        ...servers.map((server) => `- MCP server ${codeSpan(server.name)} (${server.transport}, ${escapeMd(server.agent)}) in ${codeSpan(server.configPath)}`),
      ],
    });
  }
  if (existing.length > 0) {
    blocks.push({
      summary: `Pre-existing findings (${existing.length}), not introduced by this change`,
      items: groupByKind(existing).flatMap(([, group]) => group.map((finding) => mdDetailItem(finding, link, true))),
    });
  }
  return blocks;
}

function mdFooter(report: CheckReport): string {
  const s = report.summary;
  const stats = [
    plural(s.components, "component"),
    `${s.filesMapped}/${s.filesAnalyzed} files mapped`,
    `${plural(s.componentEdges, "edge")} (${s.undeclaredEdges} undeclared)`,
    `${percent(s.humanAuthoredRatio)}% human-authored`,
  ];
  return `---\n<sub>Blueprint: ${stats.join(" · ")} · Generated by Rassam ${escapeMd(report.tool.version)}</sub>`;
}

/** Fit blocks into `room` characters, trimming the first block that overflows and dropping the rest. */
function fitBlocks(blocks: DetailsBlock[], room: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const block of blocks) {
    const full = renderBlock(block);
    if (used + full.length + 2 <= room) {
      kept.push(full);
      used += full.length + 2;
      continue;
    }
    for (let count = block.items.length - 1; count >= 1; count -= 1) {
      const partial = renderBlock(block, count);
      if (used + partial.length + 2 <= room) {
        kept.push(partial);
        break;
      }
    }
    break;
  }
  return kept;
}

function cutAtLine(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max));
  const lastBreak = cut.lastIndexOf("\n");
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd();
}

export function renderMarkdown(
  report: CheckReport,
  options: { budget?: number; marker?: string; repoUrl?: string; headSha?: string; maxChars?: number; failOn?: FailOn } = {},
): string {
  const link: LinkContext = { repoUrl: options.repoUrl, headSha: options.headSha };
  const budget = budgetOf(options.budget);
  const maxChars = Math.max(0, options.maxChars ?? DEFAULT_MAX_CHARS);
  const marker = options.marker ?? COMMENT_MARKER;
  const fresh = report.findings.filter((finding) => finding.isNew);
  const top = fresh.slice(0, budget);

  const sections: string[][] = [
    [marker, mdHeading(report, verdict(report, options.failOn ?? "error")), "", mdContext(report), "", summaryParts(report).slice(0, 2).join(" · ")],
    ["### Needs your attention", ""],
  ];
  if (top.length === 0) {
    sections[1].push(fresh.length === 0 ? "Nothing new needs your attention." : `${plural(fresh.length, "new finding")}; see the details below.`);
  } else {
    top.forEach((finding, index) => sections[1].push(...mdAttentionItem(finding, index, link)));
    if (fresh.length > top.length) sections[1].push("", `…and ${plural(fresh.length - top.length, "more new finding")} in the details below.`);
  }
  const contract = mdContractChanges(report);
  if (contract.length) sections.push(contract);
  const impact = mdImpact(report);
  if (impact.length) sections.push(impact);
  const activity = agentActivityLine(report);
  if (activity) sections.push([`**Agent activity:** ${escapeMd(activity)}`]);

  const head = sections.map((section) => section.join("\n").trimEnd()).join("\n\n");
  const blocks = mdDetailBlocks(report, link);
  const footer = mdFooter(report);
  const assemble = (parts: string[]) => `${parts.join("\n\n")}\n`;

  const full = assemble([head, ...blocks.map((block) => renderBlock(block)), footer]);
  if (full.length <= maxChars) return full;

  // Over the cap: details go first, then the tail of the head section.
  const fixed = TRUNCATION_NOTE.length + footer.length + 5;
  const kept = fitBlocks(blocks, maxChars - head.length - 2 - fixed);
  const fittedHead = cutAtLine(head, maxChars - fixed);
  const truncated = assemble([fittedHead, ...kept, TRUNCATION_NOTE, footer]);
  return truncated.length <= maxChars ? truncated : truncated.slice(0, maxChars);
}

// ── SARIF 2.1.0 ───────────────────────────────────────────────

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = { error: "error", warning: "warning", info: "note" };

function sarifLocation(location: FindingLocation): Record<string, unknown> {
  const physicalLocation: Record<string, unknown> = {
    artifactLocation: { uri: location.path.split("/").map(encodeURIComponent).join("/"), uriBaseId: "%SRCROOT%" },
  };
  if (location.line !== undefined && location.line >= 1) {
    const region: Record<string, number> = { startLine: location.line };
    if (location.endLine !== undefined && location.endLine >= location.line) region.endLine = location.endLine;
    physicalLocation.region = region;
  }
  return { physicalLocation };
}

function sarifMessage(finding: Finding): string {
  const reason = finding.reason ? ` Reason: ${finding.reason}` : "";
  return `${finding.title} — ${finding.message}${reason}`;
}

export function renderSarif(report: CheckReport): Record<string, unknown> {
  const kinds = [...new Set(report.findings.map((finding) => finding.kind))];
  const ruleIndex = new Map(kinds.map((kind, index) => [kind, index]));
  const fallback: FindingLocation = { path: report.blueprint.path || BLUEPRINT_PATH };

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Rassam",
            informationUri: "https://rassam.dev",
            version: report.tool.version,
            rules: kinds.map((kind) => ({
              id: kind,
              name: KIND_INFO[kind].label,
              shortDescription: { text: KIND_INFO[kind].label },
              fullDescription: { text: KIND_INFO[kind].help },
              help: { text: KIND_INFO[kind].help },
            })),
          },
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.kind,
          ruleIndex: ruleIndex.get(finding.kind),
          level: SARIF_LEVEL[finding.severity],
          message: { text: sarifMessage(finding) },
          locations: (finding.locations.length ? finding.locations : [fallback]).map(sarifLocation),
          partialFingerprints: { rassamFindingId: finding.id },
          baselineState: finding.isNew ? "new" : "unchanged",
          properties: { score: finding.score, isNew: finding.isNew, components: finding.components, blueprintRule: finding.ruleId },
        })),
      },
    ],
  };
}

// ── GitHub workflow commands ──────────────────────────────────

const ANNOTATION_COMMAND: Record<Severity, string> = { error: "error", warning: "warning", info: "notice" };

function escapeCommandData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeCommandProperty(text: string): string {
  return escapeCommandData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function annotation(finding: Finding): string {
  const properties: string[] = [];
  const location = finding.locations[0];
  if (location) {
    properties.push(`file=${escapeCommandProperty(location.path)}`);
    if (location.line !== undefined) {
      properties.push(`line=${location.line}`);
      if (location.endLine !== undefined && location.endLine >= location.line) properties.push(`endLine=${location.endLine}`);
    }
  }
  properties.push(`title=${escapeCommandProperty(finding.title)}`);
  const reason = finding.reason ? `\nReason: ${finding.reason}` : "";
  return `::${ANNOTATION_COMMAND[finding.severity]} ${properties.join(",")}::${escapeCommandData(`${finding.message}${reason}`)}`;
}

export function renderGithubAnnotations(report: CheckReport, options: { onlyNew?: boolean; max?: number } = {}): string {
  const onlyNew = options.onlyNew ?? true;
  const max = Math.max(0, Math.floor(options.max ?? DEFAULT_MAX_ANNOTATIONS));
  return report.findings
    .filter((finding) => !onlyNew || finding.isNew)
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(annotation)
    .join("\n");
}

// ── JSON ──────────────────────────────────────────────────────

export function renderJson(report: CheckReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

// ── Graph exports ─────────────────────────────────────────────

type EdgeStatus = GraphView["edges"][number]["status"];

const GRAY = "#9ca3af";
const AMBER = "#d97706";
const RED = "#dc2626";

interface GraphNode {
  key: string;
  label: string;
  external: boolean;
  flagged: boolean;
}

/** Assign collision-free, syntax-safe node ids; edges to unknown components get implicit nodes. */
function graphNodes(view: GraphView): { nodes: GraphNode[]; keyOf: (id: string) => string } {
  const keys = new Map<string, string>();
  const used = new Set<string>();
  const nodes: GraphNode[] = [];
  const add = (id: string, name: string, external: boolean, flagged: boolean) => {
    if (keys.has(id)) return;
    const base = `c_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
    let key = base;
    for (let suffix = 2; used.has(key); suffix += 1) key = `${base}_${suffix}`;
    used.add(key);
    keys.set(id, key);
    nodes.push({ key, label: oneLine(name) || id, external, flagged });
  };
  for (const component of view.components) add(component.id, component.name, component.external === true, (component.findings ?? 0) > 0);
  for (const edge of view.edges) {
    add(edge.from, edge.from, false, false);
    add(edge.to, edge.to, false, false);
  }
  return { nodes, keyOf: (id) => keys.get(id) ?? "" };
}

function edgeLabel(status: EdgeStatus, count: number | undefined): string | null {
  const times = count !== undefined && count > 1 ? ` ×${count}` : "";
  if (status === "missing") return "declared, unused";
  if (status === "undeclared") return `undeclared${times}`;
  if (status === "forbidden") return `forbidden${times}`;
  return null;
}

function mermaidText(text: string): string {
  return text.replace(/#/g, "#35;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
}

const MERMAID_ARROW: Record<EdgeStatus, string> = { declared: "-->", undeclared: "-.->", forbidden: "==>", missing: "-.->" };
const MERMAID_LINK_STYLE: Record<EdgeStatus, string> = {
  declared: `stroke:${GRAY},stroke-width:1.5px`,
  undeclared: `stroke:${AMBER},stroke-width:2px,stroke-dasharray:6 4`,
  forbidden: `stroke:${RED},stroke-width:4px`,
  missing: `stroke:${GRAY},stroke-width:1.5px,stroke-dasharray:2 4`,
};

export function renderMermaid(view: GraphView): string {
  const { nodes, keyOf } = graphNodes(view);
  const lines = ["flowchart LR"];
  for (const node of nodes) {
    const label = `"${mermaidText(node.label)}"`;
    lines.push(`  ${node.key}${node.external ? `[(${label})]` : `[${label}]`}`);
  }
  view.edges.forEach((edge) => {
    const label = edgeLabel(edge.status, edge.count);
    lines.push(`  ${keyOf(edge.from)} ${MERMAID_ARROW[edge.status]}${label ? `|"${mermaidText(label)}"|` : ""} ${keyOf(edge.to)}`);
  });
  view.edges.forEach((edge, index) => lines.push(`  linkStyle ${index} ${MERMAID_LINK_STYLE[edge.status]}`));
  const flagged = nodes.filter((node) => node.flagged);
  if (flagged.length > 0) {
    lines.push(`  classDef hasFindings stroke:${RED},stroke-width:3px`);
    lines.push(`  class ${flagged.map((node) => node.key).join(",")} hasFindings`);
  }
  return `${lines.join("\n")}\n`;
}

function dotString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}

const DOT_EDGE_STYLE: Record<EdgeStatus, string> = {
  declared: `color="${GRAY}"`,
  undeclared: `color="${AMBER}", fontcolor="${AMBER}", style=dashed`,
  forbidden: `color="${RED}", fontcolor="${RED}", penwidth=3`,
  missing: `color="${GRAY}", fontcolor="${GRAY}", style=dotted`,
};

export function renderDot(view: GraphView): string {
  const { nodes, keyOf } = graphNodes(view);
  const lines = ["digraph blueprint {", "  rankdir=LR;", '  node [shape=box, style=rounded, fontname="Helvetica"];', '  edge [fontname="Helvetica", fontsize=10];'];
  for (const node of nodes) {
    const attributes = [`label=${dotString(node.label)}`];
    if (node.external) attributes.push("shape=cylinder", "style=solid");
    if (node.flagged) attributes.push(`color="${RED}"`, "penwidth=2");
    lines.push(`  ${node.key} [${attributes.join(", ")}];`);
  }
  for (const edge of view.edges) {
    const label = edgeLabel(edge.status, edge.count);
    const attributes = DOT_EDGE_STYLE[edge.status] + (label ? `, label=${dotString(label)}` : "");
    lines.push(`  ${keyOf(edge.from)} -> ${keyOf(edge.to)} [${attributes}];`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}
