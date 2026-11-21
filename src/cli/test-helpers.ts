// Shared helpers for CLI tests: throwaway git repositories under the OS temp dir.

import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runGit } from "./git";

export async function makeTempDir(prefix = "rassam-test-"): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

export async function removeDir(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export async function write(root: string, path: string, content: string | Buffer): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

export async function git(root: string, ...args: string[]): Promise<string> {
  return (await runGit(root, args)).stdout.toString("utf8").trim();
}

/** `git init` with a local identity and settings that keep tests deterministic. */
export async function initRepo(root: string): Promise<void> {
  await git(root, "init", "--quiet", "--initial-branch=main");
  await git(root, "config", "user.name", "Test Human");
  await git(root, "config", "user.email", "human@example.test");
  await git(root, "config", "commit.gpgsign", "false");
  await git(root, "config", "core.autocrlf", "false");
}

export async function commitAll(root: string, message: string): Promise<string> {
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "--no-verify", "-m", message);
  return git(root, "rev-parse", "HEAD");
}
