// Read-only queries over the workspace: explain, impact, graph, reach.

import { renderDot, renderMermaid } from "../../blueprint/report";
import { BLUEPRINT_PATH } from "../../blueprint/schema";
import type { ImpactReport, ReachReport } from "../../blueprint/types";
import { createWorkspace } from "../../blueprint/workspace";
import type { PathExplanation, RuleSummary, Workspace } from "../../blueprint/workspace";
import { stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { assertBlueprintValid, loadContextFor, requireBlueprint } from "../context";
import type { RepoContext } from "../context";
import { renderJsonText } from "../format";
import { CliError, EXIT_OK, ensureTrailingNewline } from "../io";
import type { Io } from "../io";
import { toRepoPath } from "../repo-path";

function workspaceOf(context: RepoContext): Workspace {
  return createWorkspace(context.files, context.blueprint);
}

function noteMissingBlueprint(context: RepoContext, io: Io): void {
  if (context.blueprintState === "missing") io.stderr(`rassam: no blueprint at ${BLUEPRINT_PATH}; showing observed structure only. Create a draft with: rassam init\n`);
}

function repoPathArg(context: RepoContext, io: Io, value: string): string {
  const path = toRepoPath(context.root, io.cwd, value);
  if (path === null) throw new CliError(`"${value}" is outside the repository at ${context.root}`);
  return path;
}

function bullets(heading: string, items: readonly string[]): string[] {
  return items.length ? [`${heading}:`, ...items.map((item) => `  - ${item}`), ""] : [];
}

function ruleLine(rule: RuleSummary): string {
  const reason = rule.reason ? `\n      why: ${rule.reason.replace(/\s+/g, " ").trim()}` : "";
  return `[${rule.severity}] ${rule.id} (${rule.kind}${rule.human ? ", human-authored" : ""}): ${rule.summary}${reason}`;
}

function indentBlock(text: string, pad: string): string[] {
  return text.trim().split("\n").map((line) => `${pad}${line.trimEnd()}`);
}

export function renderExplanation(explanation: PathExplanation): string {
  const { component } = explanation;
  const lines: string[] = [`${explanation.path}${explanation.exists ? "" : "  (not in the working tree)"}`, ""];
  if (component) {
    const signed = component.verified ? `verified by ${component.verified.by} on ${component.verified.at}` : "not verified by a human";
    lines.push(`Component: ${component.name} (${component.id}, ${component.kind})`, `  ${signed}${component.assurance ? ` · assurance: ${component.assurance}` : ""}`);
    if (component.owners?.length) lines.push(`  owners: ${component.owners.join(", ")}`);
    if (component.intent) lines.push("  intent:", ...indentBlock(component.intent, "    "));
    else if (component.description) lines.push(...indentBlock(component.description, "  "));
    else lines.push("  intent: not written yet");
    lines.push("");
  } else {
    lines.push("Component: none (no component claims this path)", "");
  }
  if (explanation.protected) lines.push(...bullets("Protected: changes here need human review", explanation.protectedReasons));
  lines.push(...bullets("Rules that constrain changes here", explanation.constraints.map(ruleLine)));
  if (explanation.allowedComponents) lines.push(...bullets("May depend only on", explanation.allowedComponents.length ? explanation.allowedComponents : ["(nothing outside its own component)"]));
  lines.push(...bullets("Must not depend on components", explanation.forbiddenComponents));
  lines.push(...bullets("Must not depend on packages", explanation.forbiddenPackages));
  lines.push(...bullets("Invariants to preserve", explanation.invariants.map((item) => `${item.id}: ${item.statement}${item.check ? ` (check: ${item.check})` : ""}`)));
  lines.push(...bullets("Decisions", explanation.decisions.map((item) => `${item.id} [${item.status}]: ${item.title}`)));
  lines.push(...bullets("Depends on", explanation.dependsOn));
  lines.push(...bullets("Depended on by", explanation.dependents));
  if (explanation.guidance) lines.push(explanation.guidance);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

export async function explainCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  requireBlueprint(context);
  const explanation = workspaceOf(context).explainPath(repoPathArg(context, io, args.positionals[0]));
  io.stdout(stringFlag(args, "format") === "json" ? renderJsonText(explanation) : renderExplanation(explanation));
  return EXIT_OK;
}

export function renderImpact(impact: ImpactReport): string {
  const lines: string[] = [];
  if (impact.touchedComponents.length === 0) lines.push("No component owns these paths.", "");
  for (const touched of impact.touchedComponents) {
    lines.push(`Touches ${touched.id}:`, ...touched.files.map((file) => `  - ${file}`), "");
  }
  if (impact.dependents.length) {
    lines.push("Components that depend on them (nearest first):");
    for (const dependent of impact.dependents) lines.push(`  - ${dependent.id}  (${dependent.depth === 1 ? "direct" : `${dependent.depth} steps away`})`);
  } else if (impact.touchedComponents.length) {
    lines.push("No other component depends on them.");
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

export async function impactCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  requireBlueprint(context);
  const impact = workspaceOf(context).impact(args.positionals.map((value) => repoPathArg(context, io, value)));
  io.stdout(stringFlag(args, "format") === "json" ? renderJsonText(impact) : renderImpact(impact));
  return EXIT_OK;
}

export async function graphCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  requireBlueprint(context);
  const view = workspaceOf(context).graphView();
  const format = stringFlag(args, "format");
  if (format === "json") io.stdout(renderJsonText(view));
  else io.stdout(ensureTrailingNewline(format === "dot" ? renderDot(view) : renderMermaid(view)));
  return EXIT_OK;
}

export function renderReach(reach: ReachReport): string {
  const lines: string[] = [];
  lines.push(...bullets("Agent configuration files", reach.configs.map((config) => `${config.path}  (${config.agent}, ${config.type})`)));
  lines.push(...bullets("MCP servers agents can call", reach.mcpServers.map((server) => {
    const where = server.transport === "http" ? server.url ?? "http" : server.command ?? server.transport;
    const env = server.env.length ? ` · receives env: ${server.env.join(", ")}` : "";
    return `${server.name}  (${server.agent}, ${where})${env} · ${server.configPath}`;
  })));
  lines.push(...bullets("Secrets written inline in agent configuration (move them to the environment)", reach.inlineSecrets.map((secret) => `${secret.path}:${secret.line}  ${secret.location}  ${secret.kind}  ${secret.preview}`)));
  const broad = reach.permissions.filter((grant) => grant.broad && grant.effect === "allow");
  lines.push(...bullets("Broad permission grants", broad.map((grant) => `${grant.rule}  (${grant.agent}, ${grant.path})`)));
  const other = reach.permissions.length - broad.length;
  if (other > 0) lines.push(`Other permission rules: ${other} (use --format json to list them)`, "");
  const secrets = reach.envAccess.filter((access) => access.secretLike);
  lines.push(...bullets("Secret-like environment variables and who reads them", secrets.map((access) => `${access.name}  ← ${access.readers.join(", ") || "(unmapped files)"}  (${access.files.length} file${access.files.length === 1 ? "" : "s"})`)));
  const plain = reach.envAccess.length - secrets.length;
  if (plain > 0) lines.push(`Other environment variables read: ${plain}`, "");
  if (lines.length === 0) lines.push("No agent configuration, MCP servers or environment access found.");
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}

export async function reachCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  assertBlueprintValid(context);
  noteMissingBlueprint(context, io);
  const reach = workspaceOf(context).check().reach ?? { configs: [], mcpServers: [], inlineSecrets: [], permissions: [], envAccess: [] };
  io.stdout(stringFlag(args, "format") === "json" ? renderJsonText(reach) : renderReach(reach));
  return EXIT_OK;
}
