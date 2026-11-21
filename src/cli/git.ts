// Git integration. Every call spawns `git` directly (no shell), so refs and
// paths with spaces, quotes or unicode are safe on Windows and POSIX alike.

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parseUnifiedDiff, fileAdded } from "../blueprint/diff";
import type { ChangedFile, CommitInfo } from "../blueprint/types";
import { CliError } from "./io";
import { decodeText, isEnvFile, mapLimit, readTextFile } from "./util";

export class GitError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { hint });
    this.name = "GitError";
  }
}

export interface GitResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export interface GitOptions {
  input?: string | Buffer;
  /** Return non-zero exits instead of throwing. */
  allowFailure?: boolean;
}

const GIT_ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };

export function runGit(cwd: string, args: readonly string[], options: GitOptions = {}): Promise<GitResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...GIT_ENV },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.stdin.on("error", () => undefined);
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") reject(new GitError("git was not found on PATH", "Install git, or run rassam where git is available."));
      else reject(new GitError(`Could not run git: ${error.message}`));
    });
    child.on("close", (code) => {
      const result: GitResult = { code: code ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8").trim() };
      if (result.code !== 0 && !options.allowFailure) {
        reject(new GitError(`git ${args[0]} failed (exit ${result.code})${result.stderr ? `: ${result.stderr}` : ""}`));
        return;
      }
      resolvePromise(result);
    });
    child.stdin.end(options.input ?? "");
  });
}

async function gitText(cwd: string, args: readonly string[]): Promise<string | null> {
  const result = await runGit(cwd, args, { allowFailure: true });
  return result.code === 0 ? result.stdout.toString("utf8").trim() : null;
}

function assertSafeRef(ref: string): void {
  if (!ref || ref.startsWith("-") || /[\0\n\r]/.test(ref)) throw new GitError(`Invalid git ref "${ref}"`);
}

function splitNul(buffer: Buffer): string[] {
  return buffer.toString("utf8").split("\0").filter((entry) => entry.length > 0);
}

/** Absolute path of the repository root, or null when `cwd` is not inside a git work tree. */
export async function repoRoot(cwd: string): Promise<string | null> {
  const top = await gitText(cwd, ["rev-parse", "--show-toplevel"]);
  return top ? resolve(top) : null;
}

export async function requireRepoRoot(cwd: string): Promise<string> {
  const root = await repoRoot(cwd);
  if (!root) throw new GitError(`${cwd} is not inside a git repository`, "Run this inside a git work tree (git init), or drop the flags that need git history.");
  return root;
}

/** HEAD commit sha, or null in a repository without commits. */
export async function headSha(root: string): Promise<string | null> {
  return gitText(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
}

/** Short branch name, or null when HEAD is detached. */
export async function currentBranch(root: string): Promise<string | null> {
  return gitText(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
}

/** Resolve a ref to a commit sha, or null when it does not exist. */
export async function resolveRef(root: string, ref: string): Promise<string | null> {
  assertSafeRef(ref);
  return gitText(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
}

export async function isShallow(root: string): Promise<boolean> {
  return (await gitText(root, ["rev-parse", "--is-shallow-repository"])) === "true";
}

export async function userName(root: string): Promise<string | null> {
  return (await gitText(root, ["config", "user.name"])) || null;
}

/** The commit a change branched from: `git merge-base <base> <head>`. */
export async function mergeBase(root: string, base: string, head = "HEAD"): Promise<string> {
  assertSafeRef(base);
  assertSafeRef(head);
  if (!(await resolveRef(root, base))) {
    throw new GitError(`Base ref "${base}" does not exist in this repository`, `Fetch it first (git fetch origin ${base.replace(/^origin\//, "")}), or pass an existing ref with --base.`);
  }
  if (!(await resolveRef(root, head))) throw new GitError(`Ref "${head}" does not exist (does the repository have any commits?)`);
  const result = await runGit(root, ["merge-base", base, head], { allowFailure: true });
  const sha = result.stdout.toString("utf8").trim();
  if (result.code === 0 && sha) return sha;
  if (await isShallow(root)) {
    throw new GitError(
      `No merge-base between "${base}" and "${head}": this is a shallow clone`,
      "Fetch full history: git fetch --unshallow (in GitHub Actions: actions/checkout with fetch-depth: 0).",
    );
  }
  throw new GitError(`No merge-base between "${base}" and "${head}": the histories are unrelated`);
}

/** Untracked, non-ignored files of the working tree. */
export async function untrackedFiles(root: string): Promise<string[]> {
  const result = await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return splitNul(result.stdout);
}

/** Tracked plus untracked, non-ignored files. */
export async function listFiles(root: string): Promise<string[]> {
  const result = await runGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  return [...new Set(splitNul(result.stdout))];
}

async function untrackedChange(root: string, path: string): Promise<ChangedFile | null> {
  const read = await readTextFile(resolve(root, path), !isEnvFile(path));
  if (read.missing) return null;
  if (read.content === null) return { path, status: "added", added: [], removed: [], binary: !isEnvFile(path) };
  return fileAdded(path, read.content);
}

/**
 * The change under review: working tree versus `base` (normally the
 * merge-base), so uncommitted edits count, plus untracked files as additions.
 */
export async function diffAgainst(root: string, base: string): Promise<ChangedFile[]> {
  assertSafeRef(base);
  const diff = await runGit(root, ["diff", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", "-M", "-U0", base, "--"]);
  const changes = parseUnifiedDiff(diff.stdout.toString("utf8"));
  const seen = new Set(changes.map((change) => change.path));
  const untracked = (await untrackedFiles(root)).filter((path) => !seen.has(path));
  const added = await mapLimit(untracked, 32, (path) => untrackedChange(root, path));
  for (const change of added) if (change) changes.push(change);
  return changes;
}

interface BatchEntry {
  type: string;
  body: Buffer | null;
}

/** Parse `git cat-file --batch` output: `<sha> <type> <size>\n<content>\n` or `<object> missing\n`. */
export function parseCatFileBatch(output: Buffer, count: number): BatchEntry[] {
  const entries: BatchEntry[] = [];
  let offset = 0;
  while (entries.length < count && offset < output.length) {
    const lineEnd = output.indexOf(0x0a, offset);
    if (lineEnd < 0) break;
    const header = output.subarray(offset, lineEnd).toString("utf8");
    offset = lineEnd + 1;
    const match = /^[0-9a-f]{40,64} (\w+) (\d+)$/.exec(header);
    if (!match) {
      entries.push({ type: "missing", body: null });
      continue;
    }
    const size = Number(match[2]);
    entries.push({ type: match[1], body: output.subarray(offset, offset + size) });
    offset += size + 1;
  }
  while (entries.length < count) entries.push({ type: "missing", body: null });
  return entries;
}

/**
 * Read many files at a ref with a single `git cat-file --batch` process.
 * Missing paths, binaries, oversized files and env files are left out.
 */
export async function readFilesAtRef(root: string, ref: string, paths: readonly string[]): Promise<Map<string, string>> {
  assertSafeRef(ref);
  const wanted = [...new Set(paths)].filter((path) => path && !/[\n\r\0]/.test(path) && !isEnvFile(path));
  const contents = new Map<string, string>();
  if (wanted.length === 0) return contents;
  const input = wanted.map((path) => `${ref}:${path}\n`).join("");
  const result = await runGit(root, ["cat-file", "--batch"], { input });
  const entries = parseCatFileBatch(result.stdout, wanted.length);
  entries.forEach((entry, index) => {
    if (entry.type !== "blob" || !entry.body) return;
    const text = decodeText(entry.body);
    if (text !== null) contents.set(wanted[index], text);
  });
  return contents;
}

export async function readFileAtRef(root: string, ref: string, path: string): Promise<string | null> {
  return (await readFilesAtRef(root, ref, [path])).get(path) ?? null;
}

/** Commits in `base..head`, newest first, with full messages (trailers included). */
export async function commitsBetween(root: string, base: string, head = "HEAD"): Promise<CommitInfo[]> {
  assertSafeRef(base);
  assertSafeRef(head);
  const result = await runGit(root, ["log", "--format=%H%x00%an%x00%ae%x00%B%x1e", `${base}..${head}`]);
  const commits: CommitInfo[] = [];
  for (const record of result.stdout.toString("utf8").split("\x1e")) {
    const [sha, authorName, authorEmail, message] = record.replace(/^\s+/, "").split("\0");
    if (!sha || message === undefined) continue;
    commits.push({ sha, authorName: authorName ?? "", authorEmail: authorEmail ?? "", message: message.trimEnd() });
  }
  return commits;
}

/** The branch a change will most likely merge into: origin/HEAD, then common default names. */
export async function defaultBaseRef(root: string): Promise<string | null> {
  const upstreamHead = await gitText(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const candidates = [upstreamHead, "origin/main", "origin/master", "main", "master"];
  for (const candidate of candidates) {
    if (candidate && (await resolveRef(root, candidate))) return candidate;
  }
  return null;
}

/** `remote.origin.url` with any embedded credentials removed, or null. */
export async function originUrl(root: string): Promise<string | null> {
  const url = await gitText(root, ["config", "--get", "remote.origin.url"]);
  return url ? url.replace(/^(\w+:\/\/)[^@/]+@/, "$1") : null;
}
