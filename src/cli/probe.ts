// Runtime probes behind `rassam status`: a health URL, the latest GitHub
// deployment of an environment, the latest run of a workflow. Response bodies
// of health checks are never read, and nothing here prints.

import type { Blueprint, ComponentRuntime } from "../blueprint/schema";
import type { ComponentState, ComponentStatus, SystemStatus } from "../blueprint/status";
import { mapLimit } from "./util";

export interface GithubTarget {
  /** REST root, e.g. https://api.github.com */
  apiUrl: string;
  /** owner/name */
  repository: string;
  token?: string;
}

export interface ProbeOptions {
  fetch: typeof fetch;
  /** Default timeout of each request in milliseconds. */
  timeoutMs: number;
  /** Wall clock, for timestamps. */
  now(): Date;
  /** Monotonic milliseconds, for latency (default: performance.now). */
  clock?(): number;
  /** Null when GitHub lookups are off; `githubOff` then says why. */
  github: GithubTarget | null;
  githubOff?: string;
}

export interface Signal {
  state: ComponentState;
  source: ComponentStatus["source"];
  detail: string;
  latencyMs?: number;
  url?: string;
}

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Only http(s) URLs without embedded credentials are fetched. The stored form drops query and fragment. */
export function safeHealthUrl(raw: string): { ok: true; url: URL; shown: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "the health URL is not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "only http and https health URLs are fetched" };
  if (url.username || url.password) return { ok: false, reason: "the health URL contains credentials; remove them (never put secrets in the blueprint)" };
  return { ok: true, url, shown: `${url.origin}${url.pathname}` };
}

async function timedFetch(options: ProbeOptions, url: string, init: RequestInit, timeoutMs: number): Promise<{ response?: Response; timedOut: boolean; error?: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { response: await options.fetch(url, { ...init, signal: controller.signal }), timedOut: false };
  } catch (error) {
    return { timedOut: controller.signal.aborted, error };
  } finally {
    clearTimeout(timer);
  }
}

/** A short, safe reason for a failed request: an error code such as ECONNREFUSED, never the message (it can carry the URL). */
function failureCode(error: unknown): string {
  const cause = asObject(asObject(error)?.cause);
  const code = asString(cause?.code) || asString(asObject(error)?.code);
  return /^[A-Z][A-Z0-9_]{2,40}$/.test(code) ? code : "";
}

export async function probeHealth(health: NonNullable<ComponentRuntime["health"]>, options: ProbeOptions): Promise<Signal> {
  const safe = safeHealthUrl(health.url);
  if (!safe.ok) return { state: "unknown", source: "health-check", detail: `not checked: ${safe.reason}` };
  const timeoutMs = health.timeoutMs ?? options.timeoutMs;
  const clock = options.clock ?? (() => performance.now());
  const started = clock();
  const result = await timedFetch(options, safe.url.href, { method: health.method ?? "GET", redirect: "follow", headers: { "User-Agent": "rassam-status", Accept: "*/*" } }, timeoutMs);
  const latencyMs = Math.max(0, Math.round(clock() - started));
  if (!result.response) {
    const code = failureCode(result.error);
    const detail = result.timedOut ? `no answer within ${timeoutMs} ms` : `request failed${code ? ` (${code})` : ""}`;
    return { state: "down", source: "health-check", detail, latencyMs, url: safe.shown };
  }
  const { status } = result.response;
  // The body is not needed and never read.
  void result.response.body?.cancel().catch(() => undefined);
  const healthy = health.expectStatus !== undefined ? status === health.expectStatus : status >= 200 && status < 300;
  const state: ComponentState = healthy ? "up" : status >= 500 ? "down" : "degraded";
  const expectation = !healthy && health.expectStatus !== undefined ? `, expected ${health.expectStatus}` : "";
  return { state, source: "health-check", detail: `HTTP ${status}${expectation} in ${latencyMs} ms`, latencyMs, url: safe.shown };
}

async function githubGet(options: ProbeOptions, github: GithubTarget, path: string): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  const result = await timedFetch(
    options,
    `${github.apiUrl}${path}`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "rassam-status",
        ...(github.token ? { Authorization: `Bearer ${github.token}` } : {}),
      },
    },
    Math.max(options.timeoutMs, 10_000),
  );
  if (!result.response) return { ok: false, reason: result.timedOut ? "the GitHub API did not answer in time" : "the GitHub API could not be reached" };
  if (!result.response.ok) {
    void result.response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: `the GitHub API answered ${result.response.status}` };
  }
  try {
    return { ok: true, data: await result.response.json() };
  } catch {
    return { ok: false, reason: "the GitHub API sent an unreadable answer" };
  }
}

function withoutGithub(source: Signal["source"], options: ProbeOptions): Signal {
  return { state: "unknown", source, detail: `not checked: ${options.githubOff ?? "GitHub lookups are off (pass --github or set GITHUB_TOKEN)"}` };
}

const DEPLOYMENT_STATE: Record<string, ComponentState> = {
  success: "up",
  failure: "down",
  error: "down",
  in_progress: "degraded",
  queued: "degraded",
  pending: "degraded",
  waiting: "degraded",
};

/** The latest deployment of a GitHub environment and its latest status. */
export async function probeDeployment(environment: string, options: ProbeOptions): Promise<Signal> {
  const { github } = options;
  if (!github) return withoutGithub("deployment", options);
  const list = await githubGet(options, github, `/repos/${github.repository}/deployments?environment=${encodeURIComponent(environment)}&per_page=1`);
  if (!list.ok) return { state: "unknown", source: "deployment", detail: `${environment}: ${list.reason}` };
  const deployment = asObject(Array.isArray(list.data) ? list.data[0] : null);
  if (!deployment || typeof deployment.id !== "number") return { state: "unknown", source: "deployment", detail: `${environment}: no deployments yet` };
  const sha = asString(deployment.sha).slice(0, 7);
  const statuses = await githubGet(options, github, `/repos/${github.repository}/deployments/${deployment.id}/statuses?per_page=1`);
  if (!statuses.ok) return { state: "unknown", source: "deployment", detail: `${environment}: ${statuses.reason}` };
  const latest = asString(asObject(Array.isArray(statuses.data) ? statuses.data[0] : null)?.state) || "pending";
  const state = DEPLOYMENT_STATE[latest] ?? "unknown";
  return { state, source: "deployment", detail: `${environment}: ${latest.replace(/_/g, " ")}${sha ? ` at ${sha}` : ""}` };
}

const RUN_CONCLUSION: Record<string, ComponentState> = { success: "up", failure: "down", timed_out: "down", startup_failure: "down" };

function createDefaultBranch(options: ProbeOptions): () => Promise<string> {
  let cached: Promise<string> | undefined;
  return () => {
    cached ??= (async () => {
      if (!options.github) return "";
      const repo = await githubGet(options, options.github, `/repos/${options.github.repository}`);
      return repo.ok ? asString(asObject(repo.data)?.default_branch) : "";
    })();
    return cached;
  };
}

/** The latest run of a workflow file on the default branch. */
export async function probeWorkflow(file: string, options: ProbeOptions, defaultBranch: () => Promise<string>): Promise<Signal> {
  const { github } = options;
  if (!github) return withoutGithub("workflow", options);
  const name = file.trim().split(/[\\/]/).pop() ?? "";
  if (!/^[\w.-]+\.ya?ml$/i.test(name)) return { state: "unknown", source: "workflow", detail: "not checked: workflow.file must be a .yml or .yaml file name" };
  const branch = await defaultBranch();
  const query = `per_page=1&exclude_pull_requests=true${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`;
  const runs = await githubGet(options, github, `/repos/${github.repository}/actions/workflows/${encodeURIComponent(name)}/runs?${query}`);
  if (!runs.ok) return { state: "unknown", source: "workflow", detail: `${name}: ${runs.reason}` };
  const list = asObject(runs.data)?.workflow_runs;
  const run = asObject(Array.isArray(list) ? list[0] : null);
  if (!run) return { state: "unknown", source: "workflow", detail: `${name}: no runs${branch ? ` on ${branch}` : ""} yet` };
  if (asString(run.status) !== "completed") return { state: "degraded", source: "workflow", detail: `${name}: ${(asString(run.status) || "in progress").replace(/_/g, " ")}` };
  const conclusion = asString(run.conclusion) || "unknown";
  return { state: RUN_CONCLUSION[conclusion] ?? "unknown", source: "workflow", detail: `${name}: ${conclusion.replace(/_/g, " ")}` };
}

const RANK: Record<ComponentState, number> = { unknown: 0, up: 1, degraded: 2, down: 3 };
const DETAIL_LIMIT = 300;

/** The worst signal decides the state; a signal without data never hides one that has it. */
export function combineSignals(signals: readonly Signal[], checkedAt: string): ComponentStatus {
  let worst = signals[0];
  for (const signal of signals) if (RANK[signal.state] > RANK[worst.state]) worst = signal;
  const detail = signals.map((signal) => signal.detail).filter(Boolean).join("; ");
  const health = signals.find((signal) => signal.source === "health-check");
  return {
    state: worst.state,
    source: worst.source,
    ...(detail ? { detail: detail.length > DETAIL_LIMIT ? `${detail.slice(0, DETAIL_LIMIT - 1)}…` : detail } : {}),
    ...(health?.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
    ...(health?.url ? { url: health.url.slice(0, 500) } : {}),
    checkedAt,
  };
}

const PROBE_CONCURRENCY = 8;

/** Probe every component that declares `runtime`. Never throws: a failed probe is a state, not an error. */
export async function probeSystem(blueprint: Blueprint, options: ProbeOptions): Promise<SystemStatus["components"]> {
  const monitored = blueprint.components.filter((component) => component.runtime);
  const defaultBranch = createDefaultBranch(options);
  const results = await mapLimit(monitored, PROBE_CONCURRENCY, async (component): Promise<[string, ComponentStatus]> => {
    const runtime = component.runtime as ComponentRuntime;
    const signals: Signal[] = [];
    if (runtime.health) signals.push(await probeHealth(runtime.health, options));
    if (runtime.deployment) signals.push(await probeDeployment(runtime.deployment.environment, options));
    if (runtime.workflow) signals.push(await probeWorkflow(runtime.workflow.file, options, defaultBranch));
    const checkedAt = options.now().toISOString().replace(/\.\d{3}Z$/, "Z");
    if (!signals.length) return [component.id, { state: "unknown", source: "manual", detail: "runtime declares no health URL, deployment or workflow", checkedAt }];
    return [component.id, combineSignals(signals, checkedAt)];
  });
  return Object.fromEntries(results);
}
