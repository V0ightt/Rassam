// Shared by `rassam render`, `rassam status` and the MCP server: the
// architecture at a base commit, the runtime status file, and where the
// repository lives on GitHub.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { diffArchitecture } from "../blueprint/arch-diff";
import type { ArchitectureDiff } from "../blueprint/arch-diff";
import { STATUS_PATH, parseSystemStatus } from "../blueprint/status";
import type { SystemStatus } from "../blueprint/status";
import { createWorkspace } from "../blueprint/workspace";
import type { WorkspaceGraphView } from "../blueprint/workspace";
import type { RepoContext } from "./context";
import { loadBaseSnapshot } from "./gate";
import { originUrl } from "./git";
import { errorMessage } from "./util";

export interface ArchitectureComparison {
  /** The merge-base commit the working tree was compared with. */
  sha: string;
  baseBlueprint: "ok" | "missing" | "invalid";
  /** Null when the base commit has no readable blueprint: there is no architecture to compare with. */
  diff: ArchitectureDiff | null;
}

/** What the working tree changed structurally since the merge-base with `base`. */
export async function compareArchitecture(context: RepoContext, base: string, head: WorkspaceGraphView): Promise<ArchitectureComparison> {
  const snapshot = await loadBaseSnapshot(context, base);
  if (!snapshot.blueprint) return { sha: snapshot.sha, baseBlueprint: snapshot.blueprintState, diff: null };
  const before = createWorkspace(snapshot.files, snapshot.blueprint).graphView();
  return { sha: snapshot.sha, baseBlueprint: "ok", diff: diffArchitecture(before, head) };
}

export type StatusFile =
  | { state: "ok"; status: SystemStatus }
  | { state: "missing" }
  | { state: "invalid"; message: string };

/** Read and validate a status file (default: `.rassam/status.json` under `root`). Never throws. */
export async function readStatusFile(root: string, absolutePath?: string): Promise<StatusFile> {
  let text: string;
  try {
    text = await readFile(absolutePath ?? join(root, STATUS_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    return { state: "invalid", message: errorMessage(error) };
  }
  const parsed = parseSystemStatus(text);
  if (!parsed.ok || !parsed.status) {
    return { state: "invalid", message: parsed.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`).join("; ") };
  }
  return { state: "ok", status: parsed.status };
}

export interface RepoLocation {
  /** Host name, e.g. github.com. */
  host: string;
  owner: string;
  repo: string;
}

const NAME = /^[A-Za-z0-9._-]+$/;

/** Parse `https://host/owner/repo(.git)`, `git@host:owner/repo.git` or `ssh://git@host/owner/repo`. */
export function parseRepoUrl(url: string | null | undefined): RepoLocation | null {
  if (!url) return null;
  const trimmed = url.trim();
  const scp = /^[\w.-]+@([\w.-]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(trimmed);
  const web = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(trimmed);
  const match = scp ?? web;
  if (!match || !NAME.test(match[2]) || !NAME.test(match[3])) return null;
  return { host: match[1].toLowerCase(), owner: match[2], repo: match[3] };
}

/** Where the repository lives: the Actions environment first, then `remote.origin.url`. */
export async function repoLocation(root: string, isGit: boolean, env: Record<string, string | undefined>): Promise<RepoLocation | null> {
  const [owner, repo, ...rest] = (env.GITHUB_REPOSITORY ?? "").split("/");
  if (owner && repo && rest.length === 0 && NAME.test(owner) && NAME.test(repo)) {
    let host = "github.com";
    try {
      if (env.GITHUB_SERVER_URL) host = new URL(env.GITHUB_SERVER_URL).host.toLowerCase();
    } catch {
      // Keep the default host.
    }
    return { host, owner, repo };
  }
  return isGit ? parseRepoUrl(await originUrl(root).catch(() => null)) : null;
}
