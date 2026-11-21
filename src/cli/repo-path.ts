import { isAbsolute, relative, resolve } from "node:path";

/**
 * Convert a user-supplied path (absolute, or relative to `cwd`, with either
 * slash style) to a repository-relative POSIX path. Returns null when the
 * path points outside the repository.
 */
export function toRepoPath(root: string, cwd: string, value: string): string | null {
  const cleaned = value.trim().split("\\").join("/");
  const absolute = isAbsolute(cleaned) ? resolve(cleaned) : resolve(cwd, cleaned);
  const rel = relative(root, absolute);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) return null;
  return rel.split("\\").join("/");
}
