import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { githubCoordinatesSchema } from "@/lib/contracts";
import { octokit } from "@/lib/github";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";

import { commitsCache, visibilityCache, MAX_RECENT, type CommitInfo, type CommitsPayload } from "./cache";

// Newest commits of a public repository branch, for the "follow the
// repository" poll. Answers are memoized briefly and revalidated with ETags,
// so a tab polling every 45 s costs GitHub quota only when something changed.

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    owner: githubCoordinatesSchema.shape.owner,
    repo: githubCoordinatesSchema.shape.repo,
    ref: z.string().trim().min(1).max(200).regex(/^[\w.\-/]+$/, "Invalid ref").optional(),
  })
  .strict();

interface GitHubErrorShape {
  status?: number;
  response?: { headers?: Record<string, string | undefined> };
}

function statusOf(error: unknown): number | undefined {
  return error && typeof error === "object" ? (error as GitHubErrorShape).status : undefined;
}

function mapGitHubError(error: unknown, notFound: "REPOSITORY_NOT_FOUND" | "REF_NOT_FOUND"): ApiError {
  if (error instanceof ApiError) return error;
  const status = statusOf(error);
  const shaped = error as GitHubErrorShape | null;
  if (status === 429 || (status === 403 && shaped?.response?.headers?.["x-ratelimit-remaining"] === "0")) {
    return new ApiError("GITHUB_RATE_LIMITED", 429, "GitHub API rate limit reached", true);
  }
  // 409: the repository is empty; 422: the ref does not name a commit.
  if (status === 404 || status === 409 || status === 422) {
    return notFound === "REPOSITORY_NOT_FOUND"
      ? new ApiError("REPOSITORY_NOT_FOUND", 404, "Public repository was not found")
      : new ApiError("REF_NOT_FOUND", 404, "Repository ref was not found");
  }
  return new ApiError("GITHUB_UNAVAILABLE", 502, "GitHub is temporarily unavailable", true);
}

function cancelled(): ApiError {
  return new ApiError("REQUEST_CANCELLED", 499, "Commits request was cancelled");
}

function firstLine(message: unknown): string {
  const line = typeof message === "string" ? (message.split(/\r?\n/, 1)[0] ?? "").trim() : "";
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

function shortText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function assertPublic(owner: string, repo: string, key: string, signal: AbortSignal): Promise<void> {
  const fresh = visibilityCache.get(key);
  let isPublic: boolean;
  if (fresh) {
    isPublic = fresh.value.isPublic;
  } else {
    const stale = visibilityCache.peekStale(key);
    try {
      const response = await octokit.rest.repos.get({
        owner,
        repo,
        headers: stale?.etag ? { "if-none-match": stale.etag } : {},
        request: { signal },
      });
      isPublic = !response.data.private && response.data.visibility === "public";
      visibilityCache.set(key, { etag: response.headers.etag, value: { isPublic } });
    } catch (error) {
      if (signal.aborted) throw cancelled();
      if (statusOf(error) === 304 && stale) {
        visibilityCache.set(key, stale);
        isPublic = stale.value.isPublic;
      } else {
        throw mapGitHubError(error, "REPOSITORY_NOT_FOUND");
      }
    }
  }
  if (!isPublic) throw new ApiError("REPOSITORY_PRIVATE", 403, "Private repositories are not supported");
}

async function listCommits(owner: string, repo: string, ref: string | undefined, key: string, signal: AbortSignal): Promise<CommitsPayload> {
  const fresh = commitsCache.get(key);
  if (fresh) return fresh.value;
  const stale = commitsCache.peekStale(key);
  try {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      ...(ref ? { sha: ref } : {}),
      per_page: MAX_RECENT,
      headers: stale?.etag ? { "if-none-match": stale.etag } : {},
      request: { signal },
    });
    const recent: CommitInfo[] = response.data
      .filter((item) => /^[a-f0-9]{40}$/i.test(item.sha))
      .slice(0, MAX_RECENT)
      .map((item) => ({
        sha: item.sha,
        message: firstLine(item.commit?.message),
        author: shortText(item.commit?.author?.name ?? item.author?.login, 100),
        date: shortText(item.commit?.author?.date ?? item.commit?.committer?.date, 40),
      }));
    if (!recent.length) throw new ApiError("REF_NOT_FOUND", 404, "Repository ref was not found");
    const value: CommitsPayload = { head: recent[0], recent };
    commitsCache.set(key, { etag: response.headers.etag, value });
    return value;
  } catch (error) {
    if (signal.aborted) throw cancelled();
    if (statusOf(error) === 304 && stale) {
      commitsCache.set(key, stale);
      return stale.value;
    }
    throw mapGitHubError(error, "REF_NOT_FOUND");
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  let guarded: GuardedRequest | undefined;
  try {
    // One watching tab polls 80 times an hour; leave room for a few tabs.
    guarded = await guardApiRequest(request, {
      scope: "blueprint-commits",
      session: { limit: 400, windowSeconds: 60 * 60 },
      ip: { limit: 4_000, windowSeconds: 24 * 60 * 60 },
    });
    const params = request.nextUrl.searchParams;
    const unknown = [...params.keys()].filter((name) => !["owner", "repo", "ref"].includes(name));
    const parsed = querySchema.safeParse({
      owner: params.get("owner") ?? undefined,
      repo: params.get("repo") ?? undefined,
      ...(params.get("ref") ? { ref: params.get("ref") } : {}),
    });
    if (!parsed.success || unknown.length) {
      throw new ApiError("INVALID_REQUEST", 400, "Query needs a valid owner and repo, and optionally a ref");
    }
    const { owner, repo, ref } = parsed.data;
    const repoKey = `${owner}/${repo}`.toLowerCase();

    await assertPublic(owner, repo, repoKey, request.signal);
    const payload = await listCommits(owner, repo, ref, `${repoKey}@${ref ?? ""}`, request.signal);

    return NextResponse.json({ requestId, head: payload.head, recent: payload.recent }, {
      status: 200,
      headers: {
        "x-request-id": requestId,
        "Cache-Control": "private, max-age=20",
        ...rateLimitHeaders(guarded.rateLimit),
      },
    });
  } catch (error) {
    const safe = toSafeApiError(request.signal.aborted && !(error instanceof ApiError) ? cancelled() : error, requestId);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: {
        "x-request-id": requestId,
        "Cache-Control": "no-store",
        ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
      },
    });
  } finally {
    await guarded?.release().catch(() => undefined);
  }
}
