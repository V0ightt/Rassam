// Live, embeddable SVGs of a public repository's system design:
//   /api/live/<owner>/<repo>/system.svg   the diagram
//   /api/live/<owner>/<repo>/badge.svg    a small status badge
//
// They are fetched by image proxies (GitHub's camo) with no cookie and no
// origin, so they cannot use the session guard; they are limited per client
// address and deployment-wide instead, and everything is cached so a popular
// README costs the GitHub quota at most one read per minute.
//
// Status comes only from `.rassam/status.json`, written by the repository's
// own CI. This server never fetches a health URL named by a repository.

import { createHash } from "node:crypto";

import { DIAGRAM_PALETTES, renderStatusBadge, renderSystemDiagram, type BadgeTone, type DiagramTheme } from "@/blueprint/diagram";
import { verdict } from "@/blueprint/report";
import { PACKAGE_NAME } from "@/blueprint/constants";
import type { Blueprint } from "@/blueprint/schema";
import { isStale, summarizeStatus, type SystemStatus } from "@/blueprint/status";
import { createWorkspace, type WorkspaceGraphView } from "@/blueprint/workspace";
import { ApiError } from "@/lib/api-error";
import { githubCoordinatesSchema } from "@/lib/contracts";
import { resolvePublicRepositoryRevision } from "@/lib/github";
import { getRateLimitStore } from "@/lib/request-security";

import { analyzeRepositoryTree, readLiveStatus } from "../blueprint/snapshot";
import { TtlLruCache } from "./ttl-cache";

export type LiveKind = "system" | "badge";
type Detail = "calm" | "full";
type BadgeKind = "blueprint" | "system";

const TTL_MS = 60_000;
const MAX_ENTRIES = 100;
/** A status older than this no longer says anything about what is running. */
const STALE_STATUS_MINUTES = 24 * 60;

interface HeadEntry {
  owner: string;
  repo: string;
  commitSha: string;
  treeSha: string;
}

interface AnalysisEntry {
  /** null: the repository has no valid blueprint. */
  blueprint: Blueprint | null;
  /** `.rassam/blueprint.json` exists but does not parse. */
  invalid: boolean;
  view: WorkspaceGraphView;
  findings: { errors: number; warnings: number };
  verdict: "pass" | "warn" | "fail";
  fileCounts: Record<string, number>;
  statusText: string | null;
}

const headCache = new TtlLruCache<HeadEntry>(MAX_ENTRIES, TTL_MS);
const statusCache = new TtlLruCache<{ status: SystemStatus | null }>(MAX_ENTRIES, TTL_MS);
/** A commit never changes, so its analysis is kept longer than the rendered images. */
const analysisCache = new TtlLruCache<AnalysisEntry>(30, 10 * TTL_MS);
/** Keyed by owner/repo/sha/status time/kind/theme/detail. */
const svgCache = new TtlLruCache<string>(MAX_ENTRIES, TTL_MS);

/** Test hook: forget everything cached. */
export function resetLiveCaches(): void {
  headCache.clear();
  statusCache.clear();
  analysisCache.clear();
  svgCache.clear();
}

// ── Cards (no blueprint, errors) ──────────────────────────────

function escapeXml(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    out += char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : char === "'" ? "&apos;" : char;
  }
  return out;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

/** A self-contained message card: no scripts, no external resources. */
export function renderMessageCard(input: { title: string; lines: string[]; code?: string }, theme: DiagramTheme): string {
  const palette = DIAGRAM_PALETTES[theme];
  const width = 560;
  const lines = input.lines.slice(0, 3).map((line) => clip(line, 78));
  const height = 76 + lines.length * 20 + (input.code ? 44 : 0);
  const title = clip(input.title, 60);
  let y = 44;
  let body = `<text x="28" y="${y}" font-size="17" font-weight="600" fill="${palette.text}">${escapeXml(title)}</text>`;
  for (const line of lines) {
    y += 24;
    body += `<text x="28" y="${y}" font-size="13" fill="${palette.muted}">${escapeXml(line)}</text>`;
  }
  if (input.code) {
    y += 18;
    const code = clip(input.code, 60);
    body += `<rect x="28" y="${y}" width="${width - 56}" height="30" rx="6" fill="${palette.card}" stroke="${palette.border}"/>`
      + `<text x="40" y="${y + 20}" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="${palette.text}">${escapeXml(code)}</text>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml([title, ...lines].join(". "))}" font-family="${FONT}">`
    + `<title>${escapeXml(title)}</title>`
    + `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${palette.surface}" stroke="${palette.border}"/>`
    + body
    + `</svg>\n`
  );
}

// ── Limits ────────────────────────────────────────────────────

async function consumeLiveQuota(request: Request): Promise<void> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = forwarded || request.headers.get("x-real-ip") || "unknown";
  // Only a digest of the address is used as a key.
  const address = createHash("sha256").update(`rassam-live:${raw}`).digest("hex").slice(0, 32);
  const store = getRateLimitStore();
  let results;
  try {
    results = await Promise.all([
      // Image proxies share addresses, so the per-address budget is generous.
      store.consume(`rassam:quota:live:ip:${address}`, 600, 60 * 60),
      store.consume("rassam:quota:live:global", 20_000, 60 * 60),
    ]);
  } catch {
    throw new ApiError("RATE_LIMIT_STORE_UNAVAILABLE", 503, "Request limits are temporarily unavailable.", true);
  }
  if (results.some((result) => !result.allowed)) {
    throw new ApiError("RATE_LIMITED", 429, "Too many requests. Try again later.", true);
  }
}

// ── Data ──────────────────────────────────────────────────────

async function resolveHead(owner: string, repo: string, repoKey: string, signal: AbortSignal): Promise<HeadEntry> {
  const cached = headCache.get(repoKey);
  if (cached) return cached;
  // Public repositories only: this throws REPOSITORY_PRIVATE / REPOSITORY_NOT_FOUND.
  const { snapshot } = await resolvePublicRepositoryRevision(owner, repo, undefined, signal);
  const head: HeadEntry = { owner: snapshot.owner, repo: snapshot.repo, commitSha: snapshot.commitSha, treeSha: snapshot.treeSha };
  headCache.set(repoKey, head);
  return head;
}

async function analyze(head: HeadEntry, repoKey: string, signal: AbortSignal): Promise<AnalysisEntry> {
  const key = `${repoKey}@${head.commitSha}`;
  const cached = analysisCache.get(key);
  if (cached) return cached;
  const analysis = await analyzeRepositoryTree(head.owner, head.repo, head.treeSha, signal);
  let entry: AnalysisEntry;
  if (analysis.blueprint) {
    const workspace = createWorkspace(analysis.files, analysis.blueprint, { fileGraph: analysis.graph, reach: analysis.reach });
    const report = workspace.check();
    const fileCounts: Record<string, number> = {};
    for (const path of analysis.graph.files) {
      const id = workspace.componentOf(path);
      if (id) fileCounts[id] = (fileCounts[id] ?? 0) + 1;
    }
    entry = {
      blueprint: analysis.blueprint,
      invalid: false,
      view: workspace.graphView(),
      findings: { errors: report.summary.errors, warnings: report.summary.warnings },
      verdict: verdict(report),
      fileCounts,
      statusText: analysis.statusText,
    };
  } else {
    entry = {
      blueprint: null,
      invalid: analysis.blueprintText !== null || analysis.issues.length > 0,
      view: { components: [], edges: [] },
      findings: { errors: 0, warnings: 0 },
      verdict: "pass",
      fileCounts: {},
      statusText: analysis.statusText,
    };
  }
  analysisCache.set(key, entry);
  return entry;
}

async function liveStatus(head: HeadEntry, repoKey: string, fallbackText: string | null, signal: AbortSignal): Promise<SystemStatus | null> {
  const cached = statusCache.get(repoKey);
  if (cached) return cached.status;
  const status = await readLiveStatus(head.owner, head.repo, signal, fallbackText);
  statusCache.set(repoKey, { status });
  return status;
}

// ── Rendering ─────────────────────────────────────────────────

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function renderBadge(kind: BadgeKind, analysis: AnalysisEntry, status: SystemStatus | null, theme: DiagramTheme, now: number): string {
  let message: string;
  let tone: BadgeTone;
  if (kind === "system") {
    if (!status || !analysis.blueprint) {
      [message, tone] = ["not monitored", "neutral"];
    } else if (isStale(status, now, STALE_STATUS_MINUTES)) {
      [message, tone] = ["status is stale", "neutral"];
    } else {
      const overall = summarizeStatus(status, analysis.blueprint).overall;
      [message, tone] = overall === "operational" ? ["operational", "ok"]
        : overall === "degraded" ? ["degraded", "warn"]
          : overall === "outage" ? ["outage", "error"]
            : ["not monitored", "neutral"];
    }
  } else if (!analysis.blueprint) {
    [message, tone] = analysis.invalid ? ["invalid", "error"] : ["not set up", "neutral"];
  } else if (analysis.verdict === "fail") {
    [message, tone] = [plural(analysis.findings.errors, "error"), "error"];
  } else if (analysis.findings.warnings > 0) {
    [message, tone] = [`passing, ${plural(analysis.findings.warnings, "warning")}`, "warn"];
  } else {
    [message, tone] = ["passing", "ok"];
  }
  return renderStatusBadge({ label: kind, message, tone }, { theme });
}

function renderSystem(head: HeadEntry, analysis: AnalysisEntry, status: SystemStatus | null, theme: DiagramTheme, detail: Detail): string {
  if (!analysis.blueprint) {
    return analysis.invalid
      ? renderMessageCard({
        title: "The blueprint has errors",
        lines: [`${head.owner}/${head.repo}: .rassam/blueprint.json could not be read as a blueprint.`, "Run the check locally to see what to fix:"],
        code: `npx ${PACKAGE_NAME} check`,
      }, theme)
      : renderMessageCard({
        title: "No blueprint yet — run rassam init",
        lines: [`${head.owner}/${head.repo} has no .rassam/blueprint.json.`, "Create one to see the system design here:"],
        code: `npx ${PACKAGE_NAME} init`,
      }, theme);
  }
  return renderSystemDiagram({
    title: analysis.blueprint.system.name,
    subtitle: `${head.owner}/${head.repo}`,
    view: analysis.view,
    blueprint: analysis.blueprint,
    status,
    findings: analysis.findings,
    commit: head.commitSha,
    ...(status ? { generatedAt: status.checkedAt } : {}),
    fileCounts: analysis.fileCounts,
  }, { theme, detail });
}

// ── HTTP ──────────────────────────────────────────────────────

const SECURITY_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
} as const;
const CACHE_OK = "public, max-age=60, s-maxage=60, stale-while-revalidate=30";

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const bare = (value: string): string => value.trim().replace(/^W\//, "");
  return header.split(",").some((candidate) => candidate.trim() === "*" || bare(candidate) === bare(etag));
}

function errorCard(error: unknown, theme: DiagramTheme, kind: LiveKind): Response {
  const known = error instanceof ApiError ? error : new ApiError("INTERNAL_ERROR", 500, "An unexpected server error occurred", true);
  const title = known.code === "REPOSITORY_NOT_FOUND" || known.code === "INVALID_GITHUB_URL" ? "Repository not found"
    : known.code === "REPOSITORY_PRIVATE" ? "Private repositories are not supported"
      : known.code === "RATE_LIMITED" || known.code === "GITHUB_RATE_LIMITED" ? "Too many requests"
        : known.code === "REPOSITORY_TOO_LARGE" ? "Repository is too large to draw here"
          : "The system design is temporarily unavailable";
  const short = known.status === 404 ? "not found" : known.status === 403 ? "private" : known.status === 429 ? "rate limited" : "unavailable";
  const body = kind === "badge"
    ? renderStatusBadge({ label: "rassam", message: short, tone: "neutral" }, { theme })
    : renderMessageCard({
      title,
      lines: [known.code === "REPOSITORY_TOO_LARGE" ? "Use the Rassam CLI or GitHub Action to render it in CI." : "Rassam draws the system design of public GitHub repositories."],
    }, theme);
  const cacheable = known.status === 404 || known.status === 403 || known.status === 413;
  return new Response(body, {
    status: known.status === 499 ? 503 : known.status,
    headers: { ...SECURITY_HEADERS, "Cache-Control": cacheable ? "public, max-age=60" : "no-store" },
  });
}

export async function handleLiveRequest(
  request: Request,
  params: { owner: string; repo: string },
  kind: LiveKind,
): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const theme: DiagramTheme = query.get("theme") === "dark" ? "dark" : "light";
  const detail: Detail = query.get("detail") === "full" ? "full" : "calm";
  const badgeKind: BadgeKind = query.get("kind") === "system" ? "system" : "blueprint";
  try {
    await consumeLiveQuota(request);
    const coordinates = githubCoordinatesSchema.safeParse({ owner: params.owner, repo: params.repo });
    if (!coordinates.success) throw new ApiError("INVALID_GITHUB_URL", 404, "Invalid GitHub owner or repository name");
    const repoKey = `${coordinates.data.owner}/${coordinates.data.repo}`.toLowerCase();
    const signal = request.signal;

    const head = await resolveHead(coordinates.data.owner, coordinates.data.repo, repoKey, signal);
    const analysis = await analyze(head, repoKey, signal);
    const status = await liveStatus(head, repoKey, analysis.statusText, signal);

    const checkedAt = (status?.checkedAt ?? "none").replace(/[^\w:.+-]/g, "");
    const variant = kind === "system" ? `system.${theme}.${detail}` : `badge.${badgeKind}.${theme}`;
    const etag = `W/"${head.commitSha.slice(0, 16)}.${checkedAt}.${variant}"`;
    const headers = { ...SECURITY_HEADERS, "Cache-Control": CACHE_OK, ETag: etag };
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers: { "Cache-Control": CACHE_OK, ETag: etag } });
    }

    const cacheKey = `${repoKey}/${head.commitSha}/${checkedAt}/${variant}`;
    let svg = svgCache.get(cacheKey);
    if (svg === undefined) {
      svg = kind === "system"
        ? renderSystem(head, analysis, status, theme, detail)
        : renderBadge(badgeKind, analysis, status, theme, Date.now());
      svgCache.set(cacheKey, svg);
    }
    return new Response(svg, { status: 200, headers });
  } catch (error) {
    return errorCard(error, theme, kind);
  }
}
