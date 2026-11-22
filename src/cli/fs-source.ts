// Reads the working tree into the engine's SourceFile[] snapshot.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_IGNORE } from "../blueprint/constants";
import { matchesAny } from "../blueprint/glob";
import { isIgnoredPath, languageOf } from "../blueprint/imports";
import { isAgentConfigPath } from "../blueprint/reach";
import { BLUEPRINT_PATH } from "../blueprint/schema";
import type { SourceFile } from "../blueprint/types";
import { listFiles, repoRoot } from "./git";
import { isEnvFile, mapLimit, readTextFile } from "./util";

export interface WorkingTree {
  files: SourceFile[];
  blueprintText: string | null;
}

const READ_CONCURRENCY = 32;

/** Manifests the engine needs to resolve imports (aliases, module names, workspaces). */
const MANIFEST_NAMES = new Set(["package.json", "jsconfig.json", "go.mod", "Cargo.toml", "pyproject.toml", "setup.py", "setup.cfg"]);

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function isManifestPath(path: string): boolean {
  const base = baseName(path);
  return MANIFEST_NAMES.has(base) || /^tsconfig(\..+)?\.json$/.test(base);
}

/** Whether the engine needs this file's text (as opposed to only knowing it exists). */
export function wantsContent(path: string): boolean {
  if (isEnvFile(path)) return false;
  return languageOf(path) !== null || isAgentConfigPath(path) || isManifestPath(path);
}

async function walk(root: string, directory: string, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(join(root, directory), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".git" || matchesAny(`${path}/x`, DEFAULT_IGNORE)) continue;
      await walk(root, path, found);
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
}

/** Repository-relative POSIX paths: git's view when available, else a recursive walk. */
export async function listWorkingTree(root: string): Promise<string[]> {
  const top = await repoRoot(root);
  if (top) return listFiles(root);
  const found: string[] = [];
  await walk(root, "", found);
  return found;
}

async function readBlueprintText(root: string): Promise<string | null> {
  try {
    return await readFile(join(root, BLUEPRINT_PATH), "utf8");
  } catch {
    return null;
  }
}

export async function loadWorkingTree(root: string, options: { extraIgnore?: readonly string[] } = {}): Promise<WorkingTree> {
  const extra = options.extraIgnore?.length ? [...options.extraIgnore] : undefined;
  const paths = (await listWorkingTree(root)).filter((path) => !isIgnoredPath(path, extra)).sort();
  const loaded = await mapLimit(paths, READ_CONCURRENCY, async (path): Promise<SourceFile | null> => {
    const read = await readTextFile(join(root, path), wantsContent(path));
    // Tracked files deleted from the working tree are not part of the snapshot.
    if (read.missing) return null;
    return { path, content: read.content, size: read.size };
  });
  const files = loaded.filter((file): file is SourceFile => file !== null);
  return { files, blueprintText: await readBlueprintText(root) };
}
