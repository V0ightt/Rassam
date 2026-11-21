// Assembles a CheckInput from the working tree and git, then runs the engine.
// Shared by `rassam check` and the MCP `check_changes` tool.

import { runCheck } from "../blueprint/check";
import type { CheckInput } from "../blueprint/check";
import { BLUEPRINT_PATH, parseBlueprintText } from "../blueprint/schema";
import type { Blueprint } from "../blueprint/schema";
import type { ChangedFile, CheckReport, SourceFile } from "../blueprint/types";
import type { RepoContext } from "./context";
import { wantsContent } from "./fs-source";
import { commitsBetween, currentBranch, diffAgainst, headSha, mergeBase, readFileAtRef, readFilesAtRef, resolveRef } from "./git";
import { CliError } from "./io";
import { runInvariants } from "./invariants";

export interface GateOptions {
  context: RepoContext;
  /** Diff mode when set: the ref the change will merge into. */
  base?: string;
  approved?: boolean;
  runInvariants?: boolean;
  invariantTimeoutMs?: number;
  /** Overrides the head identity reported (e.g. the PR head sha in CI). */
  head?: { ref?: string; sha?: string };
  note?(message: string): void;
}

export interface GateResult {
  report: CheckReport;
  mode: "full" | "diff";
  mergeBase?: string;
  /** State of the contract the change was judged by (diff mode). */
  baseBlueprint?: "ok" | "missing" | "invalid";
  invariantsRun: number;
}

const DEFAULT_INVARIANT_TIMEOUT_MS = 300_000;

/** Paths whose merge-base content the engine needs to tell new from pre-existing violations. */
export function basePathsFor(changes: readonly ChangedFile[]): string[] {
  const paths = new Set<string>();
  for (const change of changes) {
    if (change.status === "added") continue;
    const path = change.status === "renamed" ? change.previousPath ?? change.path : change.path;
    if (wantsContent(path)) paths.add(path);
  }
  return [...paths];
}

async function loadBaseBlueprint(root: string, sha: string): Promise<{ blueprint: Blueprint | null; state: "ok" | "missing" | "invalid" }> {
  const text = await readFileAtRef(root, sha, BLUEPRINT_PATH);
  if (text === null) return { blueprint: null, state: "missing" };
  const parsed = parseBlueprintText(text);
  return parsed.ok ? { blueprint: parsed.blueprint, state: "ok" } : { blueprint: null, state: "invalid" };
}

async function headIdentity(root: string, override: GateOptions["head"]): Promise<{ ref: string; sha?: string }> {
  const sha = override?.sha ?? (await headSha(root)) ?? undefined;
  const ref = override?.ref ?? (await currentBranch(root)) ?? "HEAD";
  return { ref, sha };
}

async function diffInput(options: GateOptions, base: string): Promise<{ input: Partial<CheckInput>; sha: string; state: "ok" | "missing" | "invalid" }> {
  const { context } = options;
  if (!context.isGit) {
    throw new CliError("Diff mode (--base) needs a git repository", { hint: "Run rassam check without --base to check the whole working tree." });
  }
  const sha = await mergeBase(context.root, base);
  const changes = await diffAgainst(context.root, sha);
  const baseContents = await readFilesAtRef(context.root, sha, basePathsFor(changes));
  const baseFiles: SourceFile[] = [...baseContents].map(([path, content]) => ({ path, content, size: Buffer.byteLength(content) }));
  const baseBlueprint = await loadBaseBlueprint(context.root, sha);
  const commits = (await resolveRef(context.root, "HEAD")) ? await commitsBetween(context.root, sha, "HEAD") : [];
  if (baseBlueprint.state === "invalid") options.note?.(`The blueprint at the merge-base (${sha.slice(0, 12)}) is invalid; this change is judged without a base contract.`);
  return {
    sha,
    state: baseBlueprint.state,
    input: {
      baseBlueprint: baseBlueprint.blueprint,
      changes,
      baseFiles,
      commits,
      refs: { base: { ref: base, sha }, head: await headIdentity(context.root, options.head) },
    },
  };
}

export async function runGate(options: GateOptions): Promise<GateResult> {
  const { context } = options;
  const input: CheckInput = {
    files: context.files,
    blueprint: context.blueprint,
    blueprintIssues: context.blueprintState === "invalid" ? context.blueprintIssues : undefined,
    approved: options.approved,
  };
  let result: Omit<GateResult, "report" | "invariantsRun"> = { mode: "full" };
  if (options.base) {
    const diff = await diffInput(options, options.base);
    Object.assign(input, diff.input);
    result = { mode: "diff", mergeBase: diff.sha, baseBlueprint: diff.state };
  } else if (context.isGit) {
    input.refs = { head: await headIdentity(context.root, options.head) };
  }

  let invariantsRun = 0;
  if (options.runInvariants) {
    // Never the head blueprint in diff mode: a change must not choose its own checks.
    const contract = options.base ? input.baseBlueprint ?? null : context.blueprint;
    input.invariantResults = await runInvariants(contract, {
      cwd: context.root,
      timeoutMs: options.invariantTimeoutMs ?? DEFAULT_INVARIANT_TIMEOUT_MS,
      onStart: (id, command) => options.note?.(`Running invariant ${id}: ${command}`),
    });
    invariantsRun = input.invariantResults.length;
  }
  return { ...result, report: runCheck(input), invariantsRun };
}
