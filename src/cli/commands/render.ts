// `rassam render`: the system design as files a README can show. Light and
// dark SVG, two badges and a machine-readable system.json, plus the README
// block that embeds them. Deterministic: nothing is rewritten when nothing
// changed, and the time is only drawn into the pictures with --stamp.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ArchitectureDiff } from "../../blueprint/arch-diff";
import { renderStatusBadge, renderSystemDiagram } from "../../blueprint/diagram";
import type { BadgeTone, DiagramDetail, DiagramTheme, SystemDiagramInput } from "../../blueprint/diagram";
import { renderMermaid, verdict } from "../../blueprint/report";
import type { Blueprint } from "../../blueprint/schema";
import { STATUS_PATH, isStale, summarizeStatus } from "../../blueprint/status";
import type { StatusSummary, SystemStatus } from "../../blueprint/status";
import type { CheckReport } from "../../blueprint/types";
import { plural } from "../../blueprint/util";
import { createWorkspace } from "../../blueprint/workspace";
import type { WorkspaceGraphView } from "../../blueprint/workspace";
import { booleanFlag, numberFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { loadContextFor, requireBlueprint } from "../context";
import type { RepoContext } from "../context";
import { runGate } from "../gate";
import { headSha } from "../git";
import { CliError, EXIT_OK, ensureTrailingNewline } from "../io";
import type { Io } from "../io";
import { compareArchitecture, readStatusFile, repoLocation } from "../live";
import type { RepoLocation } from "../live";
import { README_END, README_START, renderReadmeBlock, updateReadme } from "../readme";

export const LIVE_BRANCH = "rassam-live";
const DEFAULT_SUBTITLE = "System design, checked against the blueprint on every commit";

export interface SystemDocument {
  schemaVersion: 1;
  system: string;
  commit: string | null;
  generatedAt: string;
  verdict: "pass" | "warn" | "fail";
  summary: CheckReport["summary"];
  graph: WorkspaceGraphView;
  status: { checkedAt: string; stale: boolean; summary: StatusSummary; components: SystemStatus["components"] } | null;
  /** What changed since `base`; null without --base or without a blueprint at the base commit. */
  base: { ref: string; sha: string } | null;
  diff: ArchitectureDiff | null;
}

function blueprintBadge(outcome: SystemDocument["verdict"], summary: CheckReport["summary"]): { message: string; tone: BadgeTone } {
  if (outcome === "fail") return { message: "failing", tone: "error" };
  if (summary.warnings > 0) return { message: plural(summary.warnings, "warning"), tone: "warn" };
  return { message: "passing", tone: "ok" };
}

function systemBadge(summary: StatusSummary): { message: string; tone: BadgeTone } {
  if (!summary.monitored) return { message: "not monitored", tone: "neutral" };
  switch (summary.overall) {
    case "operational":
      return { message: summary.unknown ? `operational · ${summary.up}/${summary.monitored} up` : "operational", tone: "ok" };
    case "degraded":
      return { message: "degraded", tone: "warn" };
    case "outage":
      return { message: `outage · ${summary.down} down`, tone: "error" };
    default:
      return { message: "no data", tone: "neutral" };
  }
}

/** system.json differs on every run only by its time; that alone is not a change worth writing. */
function withoutGeneratedAt(text: string): string {
  return text.replace(/"generatedAt": "[^"]*"/, '"generatedAt": ""');
}

async function writeIfChanged(path: string, content: string, same: (a: string, b: string) => boolean = (a, b) => a === b): Promise<boolean> {
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing !== null && same(existing, content)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

function posix(path: string): string {
  return path.split("\\").join("/");
}

/** Where the README loads the images from: the flag, else the live branch on GitHub, else the output directory. */
function imageBaseFor(flag: string | undefined, location: RepoLocation | null, readmeFile: string, outDir: string): string {
  if (flag?.trim()) return flag.trim().replace(/\/+$/, "") || ".";
  if (location?.host === "github.com") return `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${LIVE_BRANCH}`;
  const rel = posix(relative(dirname(readmeFile), outDir));
  return rel && !isAbsolute(rel) ? rel : ".";
}

/** Alt text that stays true between runs, so the README block is not rewritten when a count moves. */
function altText(blueprint: Blueprint): string {
  return `System design of ${blueprint.system.name}: its components, their dependencies and the state of the blueprint check`;
}

async function loadStatus(context: RepoContext, args: ParsedArgs, io: Io, now: Date): Promise<{ status: SystemStatus | null; stale: boolean }> {
  const flag = stringFlag(args, "status");
  const maxAge = numberFlag(args, "statusMaxAge") ?? 60;
  if (!(maxAge > 0)) throw new CliError("--status-max-age expects a positive number of minutes");
  const file = await readStatusFile(context.root, flag ? resolve(io.cwd, flag) : undefined);
  if (file.state === "missing") {
    if (flag) throw new CliError(`Status file ${flag} does not exist`, { hint: "Create it with: rassam status --write" });
    return { status: null, stale: false };
  }
  if (file.state === "invalid") {
    if (flag) throw new CliError(`Status file ${flag} is invalid: ${file.message}`);
    io.stderr(`rassam: ignoring ${STATUS_PATH}: ${file.message}\n`);
    return { status: null, stale: false };
  }
  const stale = isStale(file.status, now, maxAge);
  if (stale) io.stderr(`rassam: the status from ${file.status.checkedAt} is older than ${maxAge} minutes; components are drawn as "No data". Refresh it with: rassam status --write\n`);
  return { status: file.status, stale };
}

export async function renderCommand(args: ParsedArgs, io: Io): Promise<number> {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const now = io.now?.() ?? new Date();
  const generatedAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const format = stringFlag(args, "format") ?? "svg";
  const theme = stringFlag(args, "theme") ?? "both";
  const detail = (stringFlag(args, "detail") ?? "calm") as DiagramDetail;

  const { report } = await runGate({ context });
  const view = createWorkspace(context.files, blueprint).graphView();
  const commit = context.isGit ? await headSha(context.root) : null;

  const baseRef = stringFlag(args, "base");
  let base: SystemDocument["base"] = null;
  let diff: ArchitectureDiff | null = null;
  if (baseRef) {
    const comparison = await compareArchitecture(context, baseRef, view);
    base = { ref: baseRef, sha: comparison.sha };
    diff = comparison.diff;
    if (!diff) io.stderr(`rassam: the blueprint at ${comparison.sha.slice(0, 12)} is ${comparison.baseBlueprint}; nothing to compare the architecture with.\n`);
  }

  const loaded = await loadStatus(context, args, io, now);
  // A stale green mark is worse than a grey one: stale data is kept in system.json but not drawn.
  const shownStatus: SystemStatus | null = loaded.status && loaded.stale ? { ...loaded.status, components: {} } : loaded.status;
  const statusSummary = summarizeStatus(shownStatus, blueprint);
  const outcome = verdict(report, "error");

  const document: SystemDocument = {
    schemaVersion: 1,
    system: blueprint.system.name,
    commit,
    generatedAt,
    verdict: outcome,
    summary: report.summary,
    graph: view,
    status: loaded.status ? { checkedAt: loaded.status.checkedAt, stale: loaded.stale, summary: statusSummary, components: loaded.status.components } : null,
    base,
    diff,
  };
  const documentText = `${JSON.stringify(document, null, 2)}\n`;

  const readmeFlag = args.flags.readme;
  const outDir = resolve(io.cwd, stringFlag(args, "out") ?? ".rassam/live");

  if (format === "mermaid") io.stdout(ensureTrailingNewline(renderMermaid(view)));
  else if (format === "json") io.stdout(documentText);
  else {
    const input: SystemDiagramInput = {
      title: blueprint.system.name,
      subtitle: blueprint.system.description?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? DEFAULT_SUBTITLE,
      view,
      blueprint,
      status: shownStatus,
      diff,
      findings: { errors: report.summary.errors, warnings: report.summary.warnings },
      commit: commit ?? undefined,
      generatedAt: booleanFlag(args, "stamp") ? loaded.status?.checkedAt ?? generatedAt : undefined,
    };
    const files: Array<[string, string, ((a: string, b: string) => boolean)?]> = [];
    for (const name of ["light", "dark"] as DiagramTheme[]) {
      if (theme === "both" || theme === name) files.push([`system-${name}.svg`, renderSystemDiagram(input, { theme: name, detail })]);
    }
    files.push(["badge-blueprint.svg", renderStatusBadge({ label: "blueprint", ...blueprintBadge(outcome, report.summary) })]);
    files.push(["badge-system.svg", renderStatusBadge({ label: "system", ...systemBadge(statusSummary) })]);
    files.push(["system.json", documentText, (a, b) => withoutGeneratedAt(a) === withoutGeneratedAt(b)]);

    const shownDir = posix(relative(io.cwd, outDir)) || ".";
    const lines: string[] = [];
    for (const [name, content, same] of files) {
      const written = await writeIfChanged(join(outDir, name), content, same);
      lines.push(`  ${written ? "wrote    " : "unchanged"}  ${shownDir}/${name}`);
    }
    const blueprintState = blueprintBadge(outcome, report.summary).message;
    io.stdout(
      [
        `${blueprint.system.name}: ${plural(view.components.length, "component")}, ${plural(view.edges.length, "dependency", "dependencies")} · blueprint ${blueprintState} · system ${systemBadge(statusSummary).message}`,
        ...(diff ? [`Since ${baseRef}: ${diff.summary}`] : []),
        ...lines,
        "",
      ].join("\n"),
    );
  }

  if (readmeFlag !== undefined && readmeFlag !== false) {
    const readmeFile = resolve(context.root, typeof readmeFlag === "string" ? resolve(io.cwd, readmeFlag) : "README.md");
    const shown = posix(relative(io.cwd, readmeFile)) || "README.md";
    const text = await readFile(readmeFile, "utf8").catch(() => null);
    if (text === null) throw new CliError(`${shown} does not exist`, { hint: "Pass the file to update: rassam render --readme <file>" });
    const location = await repoLocation(context.root, context.isGit, io.env);
    const block = renderReadmeBlock({
      blueprint,
      status: shownStatus,
      imageBase: imageBaseFor(stringFlag(args, "imageBase"), location, readmeFile, outDir),
      link: stringFlag(args, "link")?.trim() || (location ? `https://${location.host}/${location.owner}/${location.repo}` : undefined),
      generatedAt: loaded.status?.checkedAt ?? generatedAt,
      alt: altText(blueprint),
    });
    const update = updateReadme(text, block);
    const say = format === "svg" ? io.stdout : io.stderr;
    if (update.state === "no-markers") {
      say(
        [
          `${shown} has no Rassam block yet. Put these two lines where the system design should appear, then run this command again:`,
          "",
          `  ${README_START}`,
          `  ${README_END}`,
          "",
        ].join("\n"),
      );
    } else if (update.state === "unchanged") say(`  unchanged  ${shown}\n`);
    else {
      await writeFile(readmeFile, update.text, "utf8");
      say(`  updated    ${shown}\n`);
    }
  }
  return EXIT_OK;
}
