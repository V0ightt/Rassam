import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  COMMENT_MARKER,
  exitCodeFor,
  renderGithubAnnotations,
  renderJson,
  renderMarkdown,
  renderSarif,
  renderText,
} from "../../blueprint/report";
import type { FailOn } from "../../blueprint/report";
import { BLUEPRINT_PATH } from "../../blueprint/schema";
import type { CheckReport } from "../../blueprint/types";
import { booleanFlag, numberFlag, stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { agentsState, cliName, defaultBranch, hasRassamMcp } from "../agent-files";
import { formatIssues, loadContext, resolveRoot } from "../context";
import type { RepoContext } from "../context";
import { runGate } from "../gate";
import { resolveRef, runGit } from "../git";
import { hasApprovalLabel, readGithubContext, upsertStickyComment, writeStepSummary } from "../github";
import type { GithubContext } from "../github";
import { CliError, EXIT_USAGE, ensureTrailingNewline } from "../io";
import type { Io } from "../io";
import { errorMessage } from "../util";

type Format = "text" | "markdown" | "json" | "sarif";

function asText(value: unknown): string {
  return ensureTrailingNewline(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function colorEnabled(args: ParsedArgs, io: Io): boolean {
  if (args.flags.color === false || stringFlag(args, "output")) return false;
  if (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "") return false;
  return io.isTTY;
}

async function writeOutput(io: Io, file: string, text: string): Promise<void> {
  const target = resolve(io.cwd, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}

/**
 * The ref a pull request merges into. `actions/checkout` fetches only the
 * merge commit by default, so the base branch may need fetching first.
 */
async function githubBaseRef(context: RepoContext, github: GithubContext, io: Io): Promise<string | undefined> {
  if (!github.isPullRequest || !github.baseRef) return undefined;
  const remoteRef = `origin/${github.baseRef}`;
  if (!context.isGit) return remoteRef;
  if (await resolveRef(context.root, remoteRef)) return remoteRef;
  const refspec = `+refs/heads/${github.baseRef}:refs/remotes/origin/${github.baseRef}`;
  const fetched = await runGit(context.root, ["fetch", "--no-tags", "origin", refspec], { allowFailure: true });
  if (fetched.code !== 0) io.stderr(`rassam: could not fetch ${remoteRef}: ${fetched.stderr.split("\n")[0]}\n`);
  if (await resolveRef(context.root, remoteRef)) return remoteRef;
  if (github.baseSha && (await resolveRef(context.root, github.baseSha))) return github.baseSha;
  return remoteRef;
}

interface RenderOptions {
  color: boolean;
  /** The label that counts as human approval, named in the advice. */
  approveLabel: string;
  budget?: number;
  verbose: boolean;
  failOn: FailOn;
  github?: GithubContext;
}

function markdown(report: CheckReport, options: Pick<RenderOptions, "budget" | "failOn" | "github" | "approveLabel">): string {
  const { budget, failOn, github, approveLabel } = options;
  return renderMarkdown(report, { budget, failOn, approveLabel, marker: COMMENT_MARKER, repoUrl: github?.repoHtmlUrl, headSha: report.head?.sha ?? github?.headSha });
}

function render(report: CheckReport, format: Format, options: RenderOptions): string {
  switch (format) {
    case "json":
      return asText(renderJson(report));
    case "sarif":
      return asText(renderSarif(report));
    case "markdown":
      return asText(markdown(report, options));
    default:
      return asText(renderText(report, { color: options.color, budget: options.budget, verbose: options.verbose, failOn: options.failOn, approveLabel: options.approveLabel }));
  }
}

async function publishToGithub(report: CheckReport, github: GithubContext, args: ParsedArgs, io: Io, options: RenderOptions, annotationsToStderr: boolean): Promise<void> {
  const body = markdown(report, options);
  try {
    await writeStepSummary(github, body);
  } catch (error) {
    io.stderr(`rassam: could not write the job summary: ${errorMessage(error)}\n`);
  }
  const annotations = renderGithubAnnotations(report, { onlyNew: true });
  if (annotations) (annotationsToStderr ? io.stderr : io.stdout)(ensureTrailingNewline(annotations));
  if (!booleanFlag(args, "comment")) return;
  if (!io.fetch) {
    io.stderr("rassam: fetch is unavailable; skipping the PR comment\n");
    return;
  }
  const result = await upsertStickyComment(github, body, COMMENT_MARKER, {
    fetch: io.fetch,
    warn: (message) => io.stderr(`::warning title=Rassam::${message.replace(/\r?\n/g, " ")}\n`),
  });
  if (result.action !== "skipped") io.stderr(`rassam: PR comment ${result.action}${result.url ? `: ${result.url}` : ""}\n`);
  else if (!github.token || !github.prNumber) io.stderr(`rassam: PR comment skipped: ${result.reason}\n`);
}

function validatedNumbers(args: ParsedArgs): { budget?: number; timeoutSeconds: number } {
  const budget = numberFlag(args, "budget");
  if (budget !== undefined && (!Number.isInteger(budget) || budget < 0)) throw new CliError("--budget expects a non-negative whole number");
  const timeoutSeconds = numberFlag(args, "invariantTimeout") ?? 300;
  if (timeoutSeconds <= 0) throw new CliError("--invariant-timeout expects a positive number of seconds");
  return { budget, timeoutSeconds };
}

export async function checkCommand(args: ParsedArgs, io: Io): Promise<number> {
  const format = (stringFlag(args, "format") ?? "text") as Format;
  const failOn = (stringFlag(args, "failOn") ?? "error") as FailOn;
  const output = stringFlag(args, "output");
  const { budget, timeoutSeconds } = validatedNumbers(args);

  const { root, isGit } = await resolveRoot(io, stringFlag(args, "root"));
  const context = await loadContext(root, isGit);
  const github = booleanFlag(args, "github") ? await readGithubContext(io.env) : undefined;
  const base = stringFlag(args, "base") ?? (github ? await githubBaseRef(context, github, io) : undefined);
  const label = stringFlag(args, "approveLabel") ?? "rassam:approved";
  const approved = booleanFlag(args, "approved") || Boolean(github && hasApprovalLabel(github, label));

  const gate = await runGate({
    context,
    base,
    approved,
    runInvariants: booleanFlag(args, "runInvariants"),
    invariantTimeoutMs: timeoutSeconds * 1000,
    head: github?.isPullRequest ? { ref: github.headRef, sha: github.headSha } : undefined,
    note: (message) => io.stderr(`rassam: ${message}\n`),
  });
  const { report } = gate;

  const options: RenderOptions = { color: colorEnabled(args, io), approveLabel: label, budget, verbose: booleanFlag(args, "verbose"), failOn, github };
  const rendered = render(report, format, options);
  if (output) await writeOutput(io, output, rendered);
  else io.stdout(rendered);
  const sarifOutput = stringFlag(args, "sarifOutput");
  if (sarifOutput) await writeOutput(io, sarifOutput, asText(renderSarif(report)));
  if (github) await publishToGithub(report, github, args, io, options, !output && (format === "json" || format === "sarif"));

  if (context.blueprint) {
    // The rules agents read in AGENTS.md are generated from the contract; say when they fell behind it.
    const agents = await agentsState(context.root, context.blueprint, {
      baseBranch: context.isGit ? await defaultBranch(context.root) : undefined,
      mcp: await hasRassamMcp(context.root),
    }).catch(() => null);
    if (agents?.status === "stale") {
      const message = `${agents.file} states an older version of the contract. Refresh it with: ${cliName(io.env)} instructions --write`;
      io.stderr(github ? `::notice title=Rassam::${message}\n` : `rassam: ${message}\n`);
    }
  }
  if (context.blueprintState === "missing" && gate.mode === "full") {
    io.stderr(`rassam: no blueprint at ${BLUEPRINT_PATH}; nothing constrains this repository yet. Create a draft with: rassam init\n`);
  }
  // In full mode an unparseable contract is a configuration error; in diff
  // mode it is a finding of the change, judged like any other.
  if (context.blueprintState === "invalid" && gate.mode === "full") {
    io.stderr(`rassam: ${BLUEPRINT_PATH} is invalid:\n${formatIssues(context.blueprintIssues)}\n`);
    return EXIT_USAGE;
  }
  return exitCodeFor(report, failOn);
}
