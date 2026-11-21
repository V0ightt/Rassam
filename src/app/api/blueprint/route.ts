import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MAX_ANALYZED_FILE_BYTES } from "@/blueprint/constants";
import { deriveBlueprint } from "@/blueprint/derive";
import { buildFileGraph, isIgnoredPath } from "@/blueprint/imports";
import { analyzeReach } from "@/blueprint/reach";
import {
  BLUEPRINT_LAYOUT_PATH,
  BLUEPRINT_PATH,
  parseBlueprintText,
  type Blueprint,
  type BlueprintIssue,
} from "@/blueprint/schema";
import { serializeFileGraph } from "@/blueprint/snapshot";
import type { SourceFile } from "@/blueprint/types";
import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { parseLayout } from "@/lib/blueprint-client/layout";
import { isBlueprintFilePath, shouldReadContent } from "@/lib/blueprint-client/select";
import { MAX_ANALYSIS_FILES, MAX_ANALYSIS_SOURCE_BYTES, githubCoordinatesSchema } from "@/lib/contracts";
import { fetchCompleteTree, getBlobText, octokit, type RepoNode } from "@/lib/github";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";
import { verifySourceGrant } from "@/lib/source-grant";

const FETCH_CONCURRENCY = 8;
const SYMLINK_MODE = "120000";

const blueprintRequestSchema = z
  .object({
    owner: githubCoordinatesSchema.shape.owner,
    repo: githubCoordinatesSchema.shape.repo,
    commitSha: z.string().regex(/^[a-f0-9]{40}$/i, "Invalid commit SHA"),
    sourceGrant: z.string().min(32).max(4_096),
  })
  .strict();

function cancelled(): ApiError {
  return new ApiError("REQUEST_CANCELLED", 499, "Blueprint request was cancelled");
}

/**
 * A grant proves the repository was public when it was issued. Recheck at
 * read time (as /api/files does) so a repository made private during the
 * grant TTL is never read with the server credential.
 */
async function assertStillPublic(owner: string, repo: string, signal: AbortSignal): Promise<void> {
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

async function fetchContents(
  owner: string,
  repo: string,
  candidates: RepoNode[],
  signal: AbortSignal,
): Promise<{ contents: Map<string, string>; bytes: number }> {
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "blueprint",
      session: { limit: 30, windowSeconds: 60 * 60 },
      ip: { limit: 200, windowSeconds: 24 * 60 * 60 },
      concurrencyTtlSeconds: 2 * 60,
    });
    const input = await readJsonBody(request, blueprintRequestSchema);
    const grant = verifySourceGrant(input.sourceGrant);
    // The signed grant, not the request body, decides what is read. The body
    // must name the same snapshot so a client cannot be confused about which
    // revision a response describes.
    if (
      grant.owner.toLowerCase() !== input.owner.toLowerCase()
      || grant.repo.toLowerCase() !== input.repo.toLowerCase()
      || grant.commitSha.toLowerCase() !== input.commitSha.toLowerCase()
    ) {
      throw new ApiError("INVALID_SOURCE_GRANT", 403, "Source grant does not match the requested repository revision");
    }
    const signal = request.signal;
    const { owner, repo, commitSha, treeSha } = grant;

    await assertStillPublic(owner, repo, signal);
    const tree = await fetchCompleteTree(owner, repo, treeSha, signal);
    const blobs = tree.filter((node) => node.type === "blob");
    const candidates = selectCandidates(blobs);
    const { contents, bytes } = await fetchContents(owner, repo, candidates, signal);
    if (signal.aborted) throw cancelled();

    // Repository content is untrusted: it is parsed below, never executed.
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
    const draft = blueprint
      ? null
      : deriveBlueprint(files, { repository: `github.com/${owner}/${repo}`, commit: commitSha });
    const layout = parseLayout(contents.get(BLUEPRINT_LAYOUT_PATH));

    return NextResponse.json({
      requestId,
      commitSha,
      blueprintText,
      blueprint,
      issues,
      draft,
      layout,
      graph: serializeFileGraph(graph),
      reach,
      stats: { filesFetched: contents.size, bytes, treeEntries: tree.length },
    }, {
      status: 200,
      headers: { "x-request-id": requestId, ...rateLimitHeaders(guarded.rateLimit) },
    });
  } catch (error) {
    const safe = toSafeApiError(request.signal.aborted && !(error instanceof ApiError) ? cancelled() : error, requestId);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: {
        "x-request-id": requestId,
        ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
      },
    });
  } finally {
    await guarded?.release().catch(() => undefined);
  }
}
