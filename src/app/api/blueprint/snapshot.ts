// Server-side reading of a public repository for the blueprint data layer:
// which files are fetched, the observed graph, the contract and the live
// status. Shared by POST /api/blueprint and the /api/live SVG endpoints so
// both judge a repository from the same inputs.

import { MAX_ANALYZED_FILE_BYTES } from "@/blueprint/constants";
import { buildFileGraph, isIgnoredPath } from "@/blueprint/imports";
import { analyzeReach } from "@/blueprint/reach";
import {
  BLUEPRINT_LAYOUT_PATH,
  BLUEPRINT_PATH,
  parseBlueprintText,
  type Blueprint,
  type BlueprintIssue,
} from "@/blueprint/schema";
import { parseSystemStatus, STATUS_PATH, type SystemStatus } from "@/blueprint/status";
import type { FileGraph, ReachReport, SourceFile } from "@/blueprint/types";
import { ApiError } from "@/lib/api-error";
import { isBlueprintFilePath, shouldReadContent } from "@/lib/blueprint-client/select";
import { MAX_ANALYSIS_FILES, MAX_ANALYSIS_SOURCE_BYTES } from "@/lib/contracts";
import { fetchCompleteTree, getBlobText, octokit, type RepoNode } from "@/lib/github";

import { readArchiveFiles } from "./tarball";

const FETCH_CONCURRENCY = 8;
const SYMLINK_MODE = "120000";
/** Branch a repository's own CI pushes `.rassam/status.json` to. */
export const LIVE_STATUS_BRANCH = "rassam-live";
const MAX_STATUS_BYTES = 256 * 1024;

export function cancelled(): ApiError {
  return new ApiError("REQUEST_CANCELLED", 499, "Blueprint request was cancelled");
}

/**
 * A grant proves the repository was public when it was issued. Recheck at
 * read time (as /api/files does) so a repository made private during the
 * grant TTL is never read with the server credential.
 */
export async function assertStillPublic(owner: string, repo: string, signal: AbortSignal): Promise<void> {
  let repository;
  try {
    repository = await octokit.rest.repos.get({ owner, repo, request: { signal } });
  } catch (error) {
    if (signal.aborted) throw cancelled();
    const shaped = error as { status?: number; response?: { headers?: Record<string, string | undefined> } } | null;
    const status = shaped && typeof shaped === "object" ? shaped.status : undefined;
    if (status === 429 || (status === 403 && shaped?.response?.headers?.["x-ratelimit-remaining"] === "0")) {
      throw new ApiError("GITHUB_RATE_LIMITED", 429, "GitHub API rate limit reached", true);
    }
    if (status === 404) throw new ApiError("REPOSITORY_NOT_FOUND", 404, "Public repository was not found");
    throw new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub is temporarily unavailable", true);
  }
  if (repository.data.private || repository.data.visibility !== "public") {
    throw new ApiError("REPOSITORY_PRIVATE", 403, "Private repositories are not supported");
  }
}

function selectCandidates(blobs: RepoNode[]): RepoNode[] {
  const candidates = blobs.filter((node) => node.mode !== SYMLINK_MODE && shouldReadContent(node.path, node.size));
  if (candidates.length > MAX_ANALYSIS_FILES) {
    throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the blueprint analysis file limit", false, {
      eligibleFiles: candidates.length,
      maximumFiles: MAX_ANALYSIS_FILES,
    });
  }
  const estimatedBytes = candidates.reduce((sum, node) => sum + (node.size ?? 0), 0);
  if (estimatedBytes > MAX_ANALYSIS_SOURCE_BYTES) {
    throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the blueprint analysis source budget", false, {
      estimatedBytes,
      maximumBytes: MAX_ANALYSIS_SOURCE_BYTES,
    });
  }
  return candidates;
}

/** Below this many files, per-file requests are cheaper than an archive. */
const ARCHIVE_THRESHOLD = 12;
const MAX_ARCHIVE_DOWNLOAD_BYTES = 80 * 1024 * 1024;

/**
 * Read every candidate from one repository archive. Returns null when the
 * archive is unavailable or too large, so the caller can fall back to
 * per-file requests.
 */
async function fetchContentsFromArchive(
  owner: string,
  repo: string,
  treeSha: string,
  candidates: RepoNode[],
  signal: AbortSignal,
): Promise<Map<string, string> | null> {
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/tarball/{ref}", {
      owner,
      repo,
      ref: treeSha,
      request: { signal },
    });
    const data = response.data as unknown;
    if (!(data instanceof ArrayBuffer) || data.byteLength > MAX_ARCHIVE_DOWNLOAD_BYTES) return null;
    const wanted = new Set(candidates.map((node) => node.path));
    return readArchiveFiles(new Uint8Array(data), wanted, MAX_ANALYZED_FILE_BYTES);
  } catch {
    if (signal.aborted) throw cancelled();
    return null;
  }
}

async function fetchContents(
  owner: string,
  repo: string,
  treeSha: string,
  candidates: RepoNode[],
  signal: AbortSignal,
): Promise<{ contents: Map<string, string>; bytes: number }> {
  if (candidates.length >= ARCHIVE_THRESHOLD) {
    const archived = await fetchContentsFromArchive(owner, repo, treeSha, candidates, signal);
    if (archived) {
      let archiveBytes = 0;
      for (const content of archived.values()) archiveBytes += Buffer.byteLength(content, "utf8");
      if (archiveBytes > MAX_ANALYSIS_SOURCE_BYTES) {
        throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the blueprint analysis source budget", false, {
          fetchedBytes: archiveBytes,
          maximumBytes: MAX_ANALYSIS_SOURCE_BYTES,
        });
      }
      return { contents: archived, bytes: archiveBytes };
    }
  }
  const contents = new Map<string, string>();
  let bytes = 0;
  for (let start = 0; start < candidates.length; start += FETCH_CONCURRENCY) {
    if (signal.aborted) throw cancelled();
    const batch = candidates.slice(start, start + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map(async (node): Promise<string | null> => {
      try {
        return await getBlobText(owner, repo, node.sha, MAX_ANALYZED_FILE_BYTES, signal);
      } catch (error) {
        if (signal.aborted) throw cancelled();
        // Quota exhaustion would silently hollow out the graph; fail loudly.
        if (error instanceof ApiError && error.code === "GITHUB_RATE_LIMITED") throw error;
        // Reporting "no blueprint" because the read failed would invite the
        // user to replace a contract that exists.
        if (node.path === BLUEPRINT_PATH) {
          throw error instanceof ApiError
            ? error
            : new ApiError("GITHUB_UNAVAILABLE", 502, "The repository blueprint could not be read", true);
        }
        return null;
      }
    }));
    results.forEach((content, index) => {
      if (content === null) return;
      contents.set(batch[index].path, content);
      bytes += Buffer.byteLength(content, "utf8");
    });
    if (bytes > MAX_ANALYSIS_SOURCE_BYTES) {
      throw new ApiError("REPOSITORY_TOO_LARGE", 413, "Repository exceeds the blueprint analysis source budget", false, {
        fetchedBytes: bytes,
        maximumBytes: MAX_ANALYSIS_SOURCE_BYTES,
      });
    }
  }
  return { contents, bytes };
}

export interface RepositoryAnalysis {
  files: SourceFile[];
  graph: FileGraph;
  reach: ReachReport;
  /** Raw text of `.rassam/blueprint.json`, or null when the repository has none (or it is unreadable). */
  blueprintText: string | null;
  blueprint: Blueprint | null;
  issues: BlueprintIssue[];
  layoutText: string | null;
  /** `.rassam/status.json` at the analyzed commit, if present. */
  statusText: string | null;
  stats: { filesFetched: number; bytes: number; treeEntries: number };
}

/** Fetch what the engine needs from one tree and build the observed graph. Repository content is parsed, never executed. */
export async function analyzeRepositoryTree(owner: string, repo: string, treeSha: string, signal: AbortSignal): Promise<RepositoryAnalysis> {
  const tree = await fetchCompleteTree(owner, repo, treeSha, signal);
  const blobs = tree.filter((node) => node.type === "blob");
  const candidates = selectCandidates(blobs);
  const { contents, bytes } = await fetchContents(owner, repo, treeSha, candidates, signal);
  if (signal.aborted) throw cancelled();

  const files: SourceFile[] = blobs
    .filter((node) => isBlueprintFilePath(node.path) || !isIgnoredPath(node.path))
    .map((node) => ({
      path: node.path,
      content: contents.get(node.path) ?? null,
      ...(typeof node.size === "number" ? { size: node.size } : {}),
    }));

  const graph = buildFileGraph(files);
  const reach = analyzeReach(files, graph);

  const blueprintNode = blobs.find((node) => node.path === BLUEPRINT_PATH);
  const blueprintText = contents.get(BLUEPRINT_PATH) ?? null;
  let blueprint: Blueprint | null = null;
  let issues: BlueprintIssue[] = [];
  if (blueprintText !== null) {
    const parsed = parseBlueprintText(blueprintText);
    if (parsed.ok) blueprint = parsed.blueprint;
    issues = parsed.issues;
  } else if (blueprintNode) {
    issues = [{ path: "(root)", message: `${BLUEPRINT_PATH} is too large or is not UTF-8 text` }];
  }

  return {
    files,
    graph,
    reach,
    blueprintText,
    blueprint,
    issues,
    layoutText: contents.get(BLUEPRINT_LAYOUT_PATH) ?? null,
    statusText: contents.get(STATUS_PATH) ?? null,
    stats: { filesFetched: contents.size, bytes, treeEntries: tree.length },
  };
}

function parseStatus(text: string | null): SystemStatus | null {
  if (text === null) return null;
  const parsed = parseSystemStatus(text);
  return parsed.ok && parsed.status ? parsed.status : null;
}

/**
 * Live status written by the repository's own CI: `.rassam/status.json` on the
 * `rassam-live` branch, else the copy at the analyzed commit, else none.
 * Status is optional decoration, so every failure here degrades to "none".
 * Health URLs are never fetched from this server.
 */
export async function readLiveStatus(owner: string, repo: string, signal: AbortSignal, fallbackText: string | null): Promise<SystemStatus | null> {
  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path: STATUS_PATH, ref: LIVE_STATUS_BRANCH, request: { signal } });
    const data = response.data;
    if (!Array.isArray(data) && data.type === "file" && typeof data.content === "string" && data.size <= MAX_STATUS_BYTES) {
      const status = parseStatus(Buffer.from(data.content, "base64").toString("utf8"));
      if (status) return status;
    }
  } catch {
    if (signal.aborted) throw cancelled();
  }
  return parseStatus(fallbackText);
}
