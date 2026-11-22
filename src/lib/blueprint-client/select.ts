// Which repository files the blueprint data layer reads. Shared by the
// server route (GitHub) and the browser folder walker (File System Access API)
// so both sources produce the same observed graph.

import { MAX_ANALYZED_FILE_BYTES } from "@/blueprint/constants";
import { isIgnoredPath, languageOf } from "@/blueprint/imports";
import { isAgentConfigPath } from "@/blueprint/reach";
import { BLUEPRINT_LAYOUT_PATH, BLUEPRINT_PATH } from "@/blueprint/schema";
import { STATUS_PATH } from "@/blueprint/status";

const MANIFEST_NAMES = new Set([
  "package.json",
  "jsconfig.json",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
]);

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `.env`, `.env.local`, `.envrc`, ... Their contents are never read. */
export function isEnvFilePath(path: string): boolean {
  return baseName(path).toLowerCase().startsWith(".env");
}

/** Files import resolution needs (path aliases, module names, workspaces). */
export function isResolutionManifestPath(path: string): boolean {
  const name = baseName(path);
  return MANIFEST_NAMES.has(name) || /^tsconfig(\..+)?\.json$/.test(name);
}

export function isBlueprintFilePath(path: string): boolean {
  return path === BLUEPRINT_PATH || path === BLUEPRINT_LAYOUT_PATH || path === STATUS_PATH;
}

export type ContentCategory = "blueprint" | "source" | "agent-config" | "manifest";

/** Why a file's content is read, or null when only its path is recorded. */
export function contentCategory(path: string): ContentCategory | null {
  if (isEnvFilePath(path)) return null;
  if (isBlueprintFilePath(path)) return "blueprint";
  if (isIgnoredPath(path)) return null;
  if (languageOf(path) !== null) return "source";
  if (isAgentConfigPath(path)) return "agent-config";
  if (isResolutionManifestPath(path)) return "manifest";
  return null;
}

export function shouldReadContent(path: string, size: number | undefined): boolean {
  if (contentCategory(path) === null) return false;
  return size === undefined || size <= MAX_ANALYZED_FILE_BYTES;
}
