// Loads everything a command needs to know about the repository on disk.

import { resolve } from "node:path";
import { BLUEPRINT_PATH, parseBlueprintText } from "../blueprint/schema";
import type { Blueprint, BlueprintIssue } from "../blueprint/schema";
import type { SourceFile } from "../blueprint/types";
import { loadWorkingTree } from "./fs-source";
import { repoRoot } from "./git";
import { CliError } from "./io";
import type { Io } from "./io";

export interface RepoContext {
  /** Absolute repository root (git top level, or the given directory outside git). */
  root: string;
  isGit: boolean;
  files: SourceFile[];
  blueprintText: string | null;
  /** Parsed working-tree blueprint; null when missing or invalid. */
  blueprint: Blueprint | null;
  blueprintState: "ok" | "missing" | "invalid";
  blueprintIssues: BlueprintIssue[];
}

export async function resolveRoot(io: Io, rootFlag: string | undefined): Promise<{ root: string; isGit: boolean }> {
  const start = resolve(io.cwd, rootFlag ?? ".");
  const top = await repoRoot(start).catch(() => null);
  // An explicit --root is taken literally; otherwise use the enclosing git root.
  if (rootFlag) return { root: start, isGit: top !== null };
  return { root: top ?? start, isGit: top !== null };
}

export async function loadContext(root: string, isGit: boolean): Promise<RepoContext> {
  const tree = await loadWorkingTree(root);
  const base = { root, isGit, files: tree.files, blueprintText: tree.blueprintText };
  if (tree.blueprintText === null) return { ...base, blueprint: null, blueprintState: "missing", blueprintIssues: [] };
  const parsed = parseBlueprintText(tree.blueprintText);
  if (!parsed.ok) return { ...base, blueprint: null, blueprintState: "invalid", blueprintIssues: parsed.issues };
  return { ...base, blueprint: parsed.blueprint, blueprintState: "ok", blueprintIssues: [] };
}

export async function loadContextFor(io: Io, rootFlag: string | undefined): Promise<RepoContext> {
  const { root, isGit } = await resolveRoot(io, rootFlag);
  return loadContext(root, isGit);
}

export function formatIssues(issues: readonly BlueprintIssue[], limit = 20): string {
  const lines = issues.slice(0, limit).map((issue) => `  ${issue.path}: ${issue.message}`);
  if (issues.length > limit) lines.push(`  … and ${issues.length - limit} more`);
  return lines.join("\n");
}

/** Throws a configuration error (exit 2) when the blueprint file exists but does not parse. */
export function assertBlueprintValid(context: RepoContext): void {
  if (context.blueprintState !== "invalid") return;
  throw new CliError(`${BLUEPRINT_PATH} is invalid:\n${formatIssues(context.blueprintIssues)}`, {
    hint: "Fix the file (rassam schema prints the JSON Schema), then run the command again.",
  });
}

export function requireBlueprint(context: RepoContext): Blueprint {
  assertBlueprintValid(context);
  if (!context.blueprint) {
    throw new CliError(`No blueprint found at ${BLUEPRINT_PATH}`, { hint: "Create a draft with: rassam init" });
  }
  return context.blueprint;
}
