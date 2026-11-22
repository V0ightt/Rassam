// Browser client for POST /api/blueprint.

import type { Blueprint, BlueprintIssue } from "@/blueprint/schema";
import type { SerializedFileGraph } from "@/blueprint/snapshot";
import type { ReachReport } from "@/blueprint/types";

import { sanitizeLayout, type BlueprintLayout } from "./layout";

export interface GitHubBlueprintRequest {
  owner: string;
  repo: string;
  commitSha: string;
  sourceGrant: string;
}

export interface GitHubBlueprintResponse {
  commitSha: string;
  /** Raw text of `.rassam/blueprint.json`, or null when the repository has none. */
  blueprintText: string | null;
  /** Parsed blueprint when the file exists and is valid. */
  blueprint: Blueprint | null;
  /** Parse issues of the repository file. */
  issues: BlueprintIssue[];
  /** Derived draft when the repository has no valid blueprint. */
  draft: Blueprint | null;
  layout: BlueprintLayout | null;
  graph: SerializedFileGraph;
  reach: ReachReport;
  stats: { filesFetched: number; bytes: number; treeEntries: number };
}

export class BlueprintApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "BlueprintApiError";
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  INVALID_SOURCE_GRANT: "Access to this repository snapshot is no longer valid. Refresh the project and try again.",
  SOURCE_GRANT_EXPIRED: "Access to this repository snapshot has expired. Refresh the project and try again.",
  SOURCE_GRANT_CONFIGURATION: "This deployment is not configured for pinned source access.",
  REPOSITORY_TOO_LARGE: "This repository is too large to analyze in the browser session. Use the Rassam CLI on a local clone instead.",
  REPOSITORY_PRIVATE: "Private repositories are not supported.",
  REPOSITORY_NOT_FOUND: "The repository was not found on GitHub. It may have been removed or made private.",
  REF_NOT_FOUND: "The pinned commit was not found on GitHub.",
  TREE_INCOMPLETE: "GitHub could not return the complete file list for this repository.",
  GITHUB_RATE_LIMITED: "GitHub's rate limit was reached. Wait a few minutes and try again.",
  GITHUB_UNAVAILABLE: "GitHub is temporarily unavailable. Try again shortly.",
  RATE_LIMITED: "Too many blueprint requests. Wait a little and try again.",
  REQUEST_IN_PROGRESS: "Another blueprint request is still running. Wait for it to finish.",
  CAPACITY_EXCEEDED: "The server is busy. Try again in a moment.",
  SESSION_REQUIRED: "Your browser session has expired. Reload the page and try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(requestId?: string): BlueprintApiError {
  return new BlueprintApiError("The server returned an unexpected blueprint response.", "INVALID_RESPONSE", 502, true, requestId);
}

/** Human-readable message for any error thrown by this module. */
export function describeBlueprintApiError(error: unknown): string {
  if (error instanceof BlueprintApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "The blueprint could not be loaded.";
}

export async function fetchGitHubBlueprint(
  input: GitHubBlueprintRequest,
  signal?: AbortSignal,
): Promise<GitHubBlueprintResponse> {
  let response: Response;
  try {
    response = await fetch("/api/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: input.owner,
        repo: input.repo,
        commitSha: input.commitSha,
        sourceGrant: input.sourceGrant,
      }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new BlueprintApiError("Could not reach the server. Check your connection and try again.", "NETWORK_ERROR", 0, true);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
  }

  const requestId = isRecord(body) && typeof body.requestId === "string" ? body.requestId : response.headers.get("x-request-id") ?? undefined;

  if (!response.ok) {
    const code = isRecord(body) && typeof body.code === "string" ? body.code : "HTTP_ERROR";
    const serverMessage = isRecord(body) && typeof body.message === "string" ? body.message : "";
    const message = FRIENDLY_MESSAGES[code] ?? (serverMessage || `The blueprint request failed (HTTP ${response.status}).`);
    const retryable = isRecord(body) && typeof body.retryable === "boolean" ? body.retryable : response.status >= 500;
    throw new BlueprintApiError(message, code, response.status, retryable, requestId);
  }

  if (
    !isRecord(body)
    || typeof body.commitSha !== "string"
    || !(typeof body.blueprintText === "string" || body.blueprintText === null)
    || !isRecord(body.graph)
    || body.graph.version !== 1
    || !Array.isArray(body.graph.files)
    || !Array.isArray(body.graph.facts)
    || !Array.isArray(body.graph.edges)
    || !Array.isArray(body.graph.externals)
    || !isRecord(body.reach)
    || !Array.isArray(body.issues)
  ) {
    throw invalidResponse(requestId);
  }

  const stats = isRecord(body.stats) ? body.stats : {};
  const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    commitSha: body.commitSha,
    blueprintText: body.blueprintText as string | null,
    blueprint: isRecord(body.blueprint) ? (body.blueprint as Blueprint) : null,
    issues: (body.issues as unknown[]).filter((issue): issue is BlueprintIssue => (
      isRecord(issue) && typeof issue.path === "string" && typeof issue.message === "string"
    )),
    draft: isRecord(body.draft) ? (body.draft as Blueprint) : null,
    layout: isRecord(body.layout) ? sanitizeLayout(body.layout) : null,
    graph: body.graph as unknown as SerializedFileGraph,
    reach: body.reach as unknown as ReachReport,
    stats: { filesFetched: count(stats.filesFetched), bytes: count(stats.bytes), treeEntries: count(stats.treeEntries) },
  };
}
