// Browser client for GET /api/blueprint/commits (polling a branch for new commits).

import { invalidResponse, isRecord, requestJson } from "./http";

export interface CommitSummary {
  sha: string;
  message?: string;
  author?: string;
  date?: string;
}

export interface CommitsResponse {
  head: CommitSummary;
  /** Newest first, at most 20. */
  recent: CommitSummary[];
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  REPOSITORY_PRIVATE: "Private repositories are not supported.",
  REPOSITORY_NOT_FOUND: "The repository was not found on GitHub. It may have been removed or made private.",
  REF_NOT_FOUND: "The branch was not found on GitHub.",
  GITHUB_RATE_LIMITED: "GitHub's rate limit was reached. Wait a few minutes and try again.",
  GITHUB_UNAVAILABLE: "GitHub is temporarily unavailable. Try again shortly.",
  RATE_LIMITED: "Too many requests for new commits. Wait a little and try again.",
  SESSION_REQUIRED: "Your browser session has expired. Reload the page and try again.",
};

function parseCommit(value: unknown): CommitSummary | null {
  if (!isRecord(value) || typeof value.sha !== "string" || !/^[a-f0-9]{40}$/i.test(value.sha)) return null;
  const text = (field: unknown, max: number): string | undefined => (typeof field === "string" && field ? field.slice(0, max) : undefined);
  const message = text(value.message, 200);
  const author = text(value.author, 100);
  const date = text(value.date, 40);
  return { sha: value.sha, ...(message ? { message } : {}), ...(author ? { author } : {}), ...(date ? { date } : {}) };
}

export async function fetchCommits(
  input: { owner: string; repo: string; ref?: string },
  signal?: AbortSignal,
): Promise<CommitsResponse> {
  const query = new URLSearchParams({ owner: input.owner, repo: input.repo });
  if (input.ref) query.set("ref", input.ref);
  const { body, requestId } = await requestJson(`/api/blueprint/commits?${query.toString()}`, {
    method: "GET",
    signal,
    messages: FRIENDLY_MESSAGES,
    fallback: "Checking for new commits failed",
  });
  const head = parseCommit(body.head);
  if (!head) throw invalidResponse(requestId);
  const recent = (Array.isArray(body.recent) ? body.recent : [])
    .map(parseCommit)
    .filter((commit): commit is CommitSummary => commit !== null)
    .slice(0, 20);
  return { head, recent: recent.length ? recent : [head] };
}
