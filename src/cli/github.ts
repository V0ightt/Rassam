// GitHub Actions integration for `rassam check --github`: pull request
// context, approval label, step summary, annotations and one sticky comment.

import { appendFile, readFile } from "node:fs/promises";
import { errorMessage } from "./util";

export interface GithubContext {
  eventName: string;
  isPullRequest: boolean;
  prNumber?: number;
  baseRef?: string;
  baseSha?: string;
  headRef?: string;
  headSha?: string;
  labels: string[];
  /** owner/name */
  repository?: string;
  repoHtmlUrl?: string;
  /** True when the PR head lives in another repository (tokens are read-only). */
  isFork: boolean;
  apiUrl: string;
  token?: string;
  stepSummaryPath?: string;
}

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

function asObject(value: unknown): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readEvent(path: string | undefined): Promise<Json> {
  if (!path) return {};
  try {
    return asObject(JSON.parse(await readFile(path, "utf8"))) ?? {};
  } catch {
    return {};
  }
}

function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((label) => asString(asObject(label)?.name)).filter((name): name is string => Boolean(name));
}

/** Read the Actions environment. Works (with empty fields) outside of Actions too. */
export async function readGithubContext(env: Env): Promise<GithubContext> {
  const event = await readEvent(env.GITHUB_EVENT_PATH);
  const pr = asObject(event.pull_request);
  const base = asObject(pr?.base);
  const head = asObject(pr?.head);
  const repo = asObject(event.repository);
  const repository = asString(repo?.full_name) ?? asString(env.GITHUB_REPOSITORY);
  const headRepo = asString(asObject(head?.repo)?.full_name);
  const server = (env.GITHUB_SERVER_URL ?? "https://github.com").replace(/\/+$/, "");
  const number = typeof pr?.number === "number" ? pr.number : typeof event.number === "number" && pr ? event.number : undefined;
  return {
    eventName: env.GITHUB_EVENT_NAME ?? "",
    isPullRequest: Boolean(pr),
    prNumber: number,
    baseRef: asString(base?.ref) ?? asString(env.GITHUB_BASE_REF),
    baseSha: asString(base?.sha),
    headRef: asString(head?.ref) ?? asString(env.GITHUB_HEAD_REF),
    headSha: asString(head?.sha) ?? asString(env.GITHUB_SHA),
    labels: labelNames(pr?.labels),
    repository,
    repoHtmlUrl: asString(repo?.html_url) ?? (repository ? `${server}/${repository}` : undefined),
    isFork: Boolean(headRepo && repository && headRepo !== repository),
    apiUrl: (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, ""),
    token: asString(env.GITHUB_TOKEN),
    stepSummaryPath: asString(env.GITHUB_STEP_SUMMARY),
  };
}

/** A human approved the contract changes by labelling the pull request. */
export function hasApprovalLabel(context: GithubContext, label: string): boolean {
  const wanted = label.trim().toLowerCase();
  return wanted.length > 0 && context.labels.some((name) => name.trim().toLowerCase() === wanted);
}

const STEP_SUMMARY_LIMIT = 1_000_000;
const COMMENT_LIMIT = 65_000;

function truncate(text: string, limit: number, notice: string): string {
  return text.length <= limit ? text : `${text.slice(0, limit - notice.length - 2)}\n\n${notice}`;
}

export async function writeStepSummary(context: GithubContext, markdown: string): Promise<boolean> {
  if (!context.stepSummaryPath) return false;
  const body = truncate(markdown, STEP_SUMMARY_LIMIT, "_Report truncated._");
  await appendFile(context.stepSummaryPath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return true;
}

export interface CommentResult {
  action: "created" | "updated" | "skipped";
  reason?: string;
  url?: string;
}

interface CommentDeps {
  fetch: typeof fetch;
  warn(message: string): void;
}

class GithubApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function api(context: GithubContext, deps: CommentDeps, method: string, path: string, body?: unknown): Promise<{ data: unknown; link: string | null }> {
  const response = await deps.fetch(`${context.apiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${context.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rassam-blueprint",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GithubApiError(response.status, `GitHub API ${method} ${path} → ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return { data: await response.json().catch(() => null), link: response.headers.get("link") };
}

const PER_PAGE = 100;
const MAX_PAGES = 30;

async function findStickyComment(context: GithubContext, deps: CommentDeps, marker: string): Promise<number | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = `/repos/${context.repository}/issues/${context.prNumber}/comments?per_page=${PER_PAGE}&page=${page}`;
    const { data, link } = await api(context, deps, "GET", path);
    const comments = Array.isArray(data) ? data : [];
    for (const comment of comments) {
      const entry = asObject(comment);
      if (typeof entry?.id === "number" && typeof entry.body === "string" && entry.body.includes(marker)) return entry.id;
    }
    const hasNext = link ? /rel="next"/.test(link) : comments.length === PER_PAGE;
    if (!hasNext) break;
  }
  return null;
}

function skipReason(context: GithubContext, error: unknown): string {
  if (error instanceof GithubApiError && (error.status === 403 || error.status === 404 || error.status === 401)) {
    const why = context.isFork
      ? "pull requests from forks get a read-only token"
      : 'the job needs "permissions: pull-requests: write"';
    return `GitHub refused the comment (${error.status}): ${why}. The report is still in the job summary.`;
  }
  return `Could not post the PR comment: ${errorMessage(error)}`;
}

/**
 * Create or update the single PR comment carrying `marker`. Never throws:
 * a missing permission must not fail the gate.
 */
export async function upsertStickyComment(context: GithubContext, markdown: string, marker: string, deps: CommentDeps): Promise<CommentResult> {
  if (!context.token) return { action: "skipped", reason: "GITHUB_TOKEN is not set" };
  if (!context.repository || !context.prNumber) return { action: "skipped", reason: "not a pull request event" };
  const withMarker = markdown.includes(marker) ? markdown : `${marker}\n${markdown}`;
  const body = truncate(withMarker, COMMENT_LIMIT, "_Report truncated; see the job summary for the full report._");
  try {
    const existing = await findStickyComment(context, deps, marker);
    const result = existing === null
      ? await api(context, deps, "POST", `/repos/${context.repository}/issues/${context.prNumber}/comments`, { body })
      : await api(context, deps, "PATCH", `/repos/${context.repository}/issues/comments/${existing}`, { body });
    return { action: existing === null ? "created" : "updated", url: asString(asObject(result.data)?.html_url) };
  } catch (error) {
    const reason = skipReason(context, error);
    deps.warn(reason);
    return { action: "skipped", reason };
  }
}
