// `rassam status`: probe the runtime each component declares and report (or
// save) what is actually running.

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { STATUS_PATH, STATUS_VERSION, serializeSystemStatus, summarizeStatus } from "../../blueprint/status";
import type { StatusSummary, SystemStatus } from "../../blueprint/status";
import type { Blueprint } from "../../blueprint/schema";
import { booleanFlag, numberFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { loadContextFor, requireBlueprint } from "../context";
import { headSha } from "../git";
import { CliError, EXIT_FAILED, EXIT_OK } from "../io";
import type { Io } from "../io";
import { repoLocation } from "../live";
import { probeSystem } from "../probe";
import type { GithubTarget } from "../probe";
import { errorMessage } from "../util";

const STATE_LABEL = { up: "up", degraded: "degraded", down: "DOWN", unknown: "unknown" } as const;
const SOURCE_LABEL = { "health-check": "health check", deployment: "deployment", workflow: "workflow", manual: "manual" } as const;

export function overallLine(summary: StatusSummary): string {
  if (!summary.monitored) return "Overall: not monitored (no component declares runtime)";
  const label = summary.overall === "unknown" ? "no data" : summary.overall;
  return `Overall: ${label} (${summary.up} up, ${summary.degraded} degraded, ${summary.down} down, ${summary.unknown} unknown of ${summary.monitored} monitored)`;
}

export function renderStatusText(status: SystemStatus, blueprint: Blueprint): string {
  const names = new Map(blueprint.components.map((component) => [component.id, component.name]));
  const rows = Object.keys(status.components)
    .sort()
    .map((id) => {
      const entry = status.components[id];
      const latency = entry.latencyMs !== undefined && !entry.detail?.includes(" ms") ? ` (${entry.latencyMs} ms)` : "";
      return [names.get(id) ?? id, STATE_LABEL[entry.state], SOURCE_LABEL[entry.source], `${entry.detail ?? ""}${latency}`];
    });
  const header = ["Component", "State", "Signal", "Detail"];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (cells: string[]): string => cells.map((cell, column) => (column === cells.length - 1 ? cell : cell.padEnd(widths[column]))).join("  ").trimEnd();
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line), "", overallLine(summarizeStatus(status, blueprint)), ""].join("\n");
}

async function githubTarget(io: Io, root: string, isGit: boolean, enabled: boolean): Promise<{ github: GithubTarget | null; off?: string }> {
  if (!enabled) return { github: null };
  const location = await repoLocation(root, isGit, io.env);
  if (!location) return { github: null, off: "this repository has no GitHub origin" };
  const fromEnv = io.env.GITHUB_API_URL?.replace(/\/+$/, "");
  if (!fromEnv && location.host !== "github.com") return { github: null, off: `the origin is ${location.host}, not GitHub (set GITHUB_API_URL for GitHub Enterprise)` };
  return { github: { apiUrl: fromEnv || "https://api.github.com", repository: `${location.owner}/${location.repo}`, token: io.env.GITHUB_TOKEN || undefined } };
}

/** Step outputs for workflows: lets a scheduled job skip rendering when nothing is monitored. */
async function writeStepOutputs(io: Io, summary: StatusSummary): Promise<void> {
  if (!io.env.GITHUB_OUTPUT) return;
  try {
    await appendFile(io.env.GITHUB_OUTPUT, `monitored=${summary.monitored}\noverall=${summary.overall}\n`, "utf8");
  } catch (error) {
    io.stderr(`rassam: could not write step outputs: ${errorMessage(error)}\n`);
  }
}

export async function statusCommand(args: ParsedArgs, io: Io): Promise<number> {
  const timeoutMs = numberFlag(args, "timeout") ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new CliError("--timeout expects milliseconds between 100 and 60000");
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const json = stringFlag(args, "format") === "json";
  const now = io.now ?? (() => new Date());
  const monitored = blueprint.components.filter((component) => component.runtime);

  const status: SystemStatus = { version: STATUS_VERSION, checkedAt: now().toISOString().replace(/\.\d{3}Z$/, "Z"), components: {} };
  const commit = context.isGit ? await headSha(context.root) : null;
  if (commit) status.commit = commit;

  if (!monitored.length) {
    await writeStepOutputs(io, summarizeStatus(status, blueprint));
    if (json) io.stdout(serializeSystemStatus(status));
    else {
      io.stdout(
        [
          "No component declares runtime, so there is nothing to probe.",
          'Add "runtime" to a component in .rassam/blueprint.json: a health URL, a deployment environment or a workflow file.',
          ...(booleanFlag(args, "write") ? [`${STATUS_PATH} was not written.`] : []),
          "",
        ].join("\n"),
      );
    }
    return EXIT_OK;
  }

  if (!io.fetch) throw new CliError("fetch is unavailable in this Node.js; rassam status needs Node 18 or newer");
  const target = await githubTarget(io, context.root, context.isGit, booleanFlag(args, "github") || Boolean(io.env.GITHUB_TOKEN));
  status.components = await probeSystem(blueprint, { fetch: io.fetch, timeoutMs, now, github: target.github, githubOff: target.off });

  const summary = summarizeStatus(status, blueprint);
  if (json) io.stdout(serializeSystemStatus(status));
  else io.stdout(renderStatusText(status, blueprint));
  if (booleanFlag(args, "write")) {
    const file = join(context.root, STATUS_PATH);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, serializeSystemStatus(status), "utf8");
    (json ? io.stderr : io.stdout)(`Wrote ${STATUS_PATH}\n`);
  }
  await writeStepOutputs(io, summary);
  return booleanFlag(args, "failOnDown") && summary.down > 0 ? EXIT_FAILED : EXIT_OK;
}
