import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { runCheck } from "../../blueprint/check";
import { deriveBlueprint, detectSystemName } from "../../blueprint/derive";
import { BLUEPRINT_PATH, serializeBlueprint } from "../../blueprint/schema";
import type { Blueprint } from "../../blueprint/schema";
import type { SourceFile } from "../../blueprint/types";
import { plural } from "../../blueprint/util";
import {
  agentsState,
  cliName,
  defaultBranch,
  hasRassamMcp,
  PINNED_COMMAND,
  writeAgentsFile,
  writeClaudePointer,
  writeMcpConfig,
  writeWorkflow,
} from "../agent-files";
import type { WriteResult } from "../agent-files";
import { booleanFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { assertBlueprintValid, loadContextFor, requireBlueprint } from "../context";
import type { RepoContext } from "../context";
import { headSha, originUrl, userName } from "../git";
import { CliError, EXIT_OK } from "../io";
import type { Io } from "../io";

/** What .mcp.json gets: the published package, pinned to this version. */
export const MCP_CONFIG_SNIPPET = JSON.stringify({ mcpServers: { rassam: { command: "npx", args: PINNED_COMMAND.split(" ").slice(1).concat("mcp") } } });

type Wiring = "mcp" | "agents" | "workflow";

const QUESTIONS: Record<Wiring, string> = {
  mcp: "Add the rassam MCP server to .mcp.json, so agents can ask the contract?",
  agents: "Write the contract's rules into AGENTS.md (and point CLAUDE.md at it), so every agent reads them?",
  workflow: "Add .github/workflows/rassam.yml, so every pull request is checked against the contract?",
};

async function draft(context: RepoContext, args: ParsedArgs): Promise<Blueprint> {
  return deriveBlueprint(context.files, {
    name: stringFlag(args, "name") ?? detectSystemName(context.files) ?? basename(context.root),
    repository: context.isGit ? (await originUrl(context.root)) ?? undefined : undefined,
    commit: context.isGit ? (await headSha(context.root)) ?? undefined : undefined,
    author: context.isGit ? (await userName(context.root)) ?? undefined : undefined,
    now: new Date().toISOString(),
  });
}

/**
 * Drafted rules the code already breaks. The draft was made from this very
 * code, so every one of these existed before the contract did.
 */
export function preExistingBreaks(files: SourceFile[], blueprint: Blueprint): Array<{ ruleId: string; count: number }> {
  const ruleIds = new Set(blueprint.rules.map((rule) => rule.id));
  const counts = new Map<string, number>();
  for (const finding of runCheck({ files, blueprint }).findings) {
    if (!finding.ruleId || !ruleIds.has(finding.ruleId) || finding.severity === "info") continue;
    counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([ruleId, count]) => ({ ruleId, count }));
}

function preExistingNote(breaks: Array<{ ruleId: string; count: number }>, cli: string): string[] {
  if (!breaks.length) return [];
  const places = breaks.reduce((sum, item) => sum + item.count, 0);
  return [
    "",
    `The code already breaks ${plural(breaks.length, "drafted rule")} in ${plural(places, "place")} (${breaks.map((item) => `${item.ruleId}: ${item.count}`).join(", ")}).`,
    "These existed before the contract did. Pull requests are judged only on what they add, so nobody's",
    `change fails for them. \`${cli} check\` lists them: fix them, or edit the rule if it does not fit.`,
  ];
}

async function decide(args: ParsedArgs, io: Io): Promise<{ chosen: Set<Wiring>; offered: Wiring[] }> {
  const chosen = new Set<Wiring>();
  const offered: Wiring[] = [];
  const all = booleanFlag(args, "yes");
  for (const key of ["mcp", "agents", "workflow"] as const) {
    const flag = args.flags[key];
    if (flag === false) continue;
    if (flag === true || all) chosen.add(key);
    else if (io.ask) {
      if (await io.ask(QUESTIONS[key], true)) chosen.add(key);
    } else offered.push(key);
  }
  return { chosen, offered };
}

function table(results: readonly WriteResult[]): string[] {
  const width = Math.max(...results.map((result) => result.path.length));
  return results.map((result) => `  ${result.path.padEnd(width)}  ${result.state}: ${result.note}`);
}

function nextSteps(cli: string, drafted: boolean, wroteAgents: boolean): string[] {
  const steps: string[][] = drafted
    ? [
        [`Open ${BLUEPRINT_PATH} and merge, split or rename components until they match how you`, "think about the system. Write each one's intent: what it is for and what it must never do."],
        ["Add rules, each with a reason, by hand or in words:", `${cli} do "forbid web from importing db because pages go through the API"`],
        [`Run ${cli} check, then commit the blueprint and the files above.`],
      ]
    : [[`Run ${cli} check, then commit the files above.`]];
  if (wroteAgents) steps.push([`When the contract changes, refresh AGENTS.md: ${cli} instructions --write`]);
  return ["", "Next:", ...steps.flatMap((step, index) => step.map((line, n) => (n === 0 ? `  ${index + 1}. ${line}` : `     ${line}`)))];
}

export async function initCommand(args: ParsedArgs, io: Io): Promise<number> {
  const dryRun = booleanFlag(args, "dryRun");
  const force = booleanFlag(args, "force");
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const cli = cliName(io.env);
  const wantsWiring = booleanFlag(args, "yes") || (["mcp", "agents", "workflow"] as const).some((key) => args.flags[key] === true);
  const exists = context.blueprintState !== "missing";

  if (dryRun) {
    io.stdout(serializeBlueprint(await draft(context, args)));
    return EXIT_OK;
  }
  if (exists && !force && !wantsWiring) {
    throw new CliError(`${BLUEPRINT_PATH} already exists`, {
      hint: "Use --yes (or --mcp, --agents, --workflow) to wire up the existing blueprint, --force to replace it with a fresh draft, or --dry-run to preview one.",
    });
  }

  const lines: string[] = [];
  let blueprint: Blueprint;
  const drafted = !exists || force;
  if (drafted) {
    blueprint = await draft(context, args);
    const target = join(context.root, BLUEPRINT_PATH);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, serializeBlueprint(blueprint), "utf8");
    lines.push(
      `Wrote ${BLUEPRINT_PATH}: ${plural(blueprint.components.length, "component")}, ${plural(blueprint.dependencies.length, "observed dependency", "observed dependencies")}, ${plural(blueprint.rules.length, "drafted rule")}.`,
      "It describes the code as it is today. It becomes a contract when you make it yours.",
      ...preExistingNote(preExistingBreaks(context.files, blueprint), cli),
    );
  } else {
    assertBlueprintValid(context);
    blueprint = requireBlueprint(context);
    lines.push(`Using the existing ${BLUEPRINT_PATH} (${plural(blueprint.components.length, "component")}, ${plural(blueprint.rules.length, "rule")}).`);
  }
  // Say what was drafted before asking anything, so the questions have context.
  io.stdout(`${lines.join("\n")}\n`);

  const { chosen, offered } = await decide(args, io);
  const results: WriteResult[] = [];
  if (chosen.has("mcp")) results.push(await writeMcpConfig(context.root));
  if (chosen.has("agents")) {
    const state = await agentsState(context.root, blueprint, {
      baseBranch: context.isGit ? await defaultBranch(context.root) : undefined,
      mcp: await hasRassamMcp(context.root),
    });
    results.push(await writeAgentsFile(context.root, state.block, state.file));
    results.push(await writeClaudePointer(context.root, state.file));
  }
  if (chosen.has("workflow")) results.push(await writeWorkflow(context.root));

  const out: string[] = [];
  if (results.length) out.push("", "Wired up:", ...table(results));
  if (offered.length) {
    out.push(
      "",
      `Not wired up yet (${offered.map((key) => `--${key}`).join(", ")}): agents do not see the contract and pull requests are not checked.`,
      `To write .mcp.json, the rules in AGENTS.md and .github/workflows/rassam.yml: ${cli} init --yes`,
    );
  }
  out.push(...nextSteps(cli, drafted, chosen.has("agents")), "");
  io.stdout(out.join("\n"));
  return EXIT_OK;
}
