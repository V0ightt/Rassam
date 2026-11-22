import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyBlueprint, serializeBlueprint, type Blueprint } from "@/blueprint/schema";

const limiter = vi.hoisted(() => ({ allowed: true, keys: [] as string[] }));

vi.mock("@/lib/request-security", () => ({
  getRateLimitStore: () => ({
    durable: false,
    consume: async (key: string, limit: number) => {
      limiter.keys.push(key);
      return { allowed: limiter.allowed, limit, remaining: limiter.allowed ? limit - 1 : 0, resetAt: Date.now() + 60_000 };
    },
    acquireLease: async () => ({ acquired: true, release: async () => undefined }),
    ping: async () => true,
  }),
}));

import { GET as badge } from "./[owner]/[repo]/badge.svg/route";
import { GET as system } from "./[owner]/[repo]/system.svg/route";
import { resetLiveCaches } from "./live";

const OWNER = "fixture-owner";
const REPO = "fixture-repo";
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const HEALTH_HOST = "health.internal.example";

let files: Record<string, string> = {};
let visibility: "public" | "private" = "public";
let liveStatus: string | null = null;
let githubCalls: string[] = [];
let otherCalls: string[] = [];
let pathBySha = new Map<string, string>();

const server = setupServer(
  http.get("https://api.github.com/repos/:owner/:repo", () => {
    githubCalls.push("repo");
    return HttpResponse.json({ private: visibility === "private", visibility, default_branch: "main", description: null, stargazers_count: 0, language: null });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/commits/:ref", () => {
    githubCalls.push("commit");
    return HttpResponse.json({ sha: COMMIT, commit: { tree: { sha: TREE } } });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/git/trees/:sha", () => {
    githubCalls.push("tree");
    pathBySha = new Map();
    const tree = Object.entries(files).map(([path, content], index) => {
      const sha = index.toString(16).padStart(40, "0");
      pathBySha.set(sha, path);
      return { path, type: "blob", mode: "100644", sha, size: Buffer.byteLength(content, "utf8"), url: `https://api.github.com/x/${sha}` };
    });
    return HttpResponse.json({ sha: TREE, truncated: false, tree });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/git/blobs/:sha", ({ params }) => {
    githubCalls.push("blob");
    const path = pathBySha.get(String(params.sha));
    if (!path) return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    const content = files[path];
    return HttpResponse.json({ sha: params.sha, size: Buffer.byteLength(content, "utf8"), encoding: "base64", content: Buffer.from(content, "utf8").toString("base64") });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/contents/*", ({ request }) => {
    githubCalls.push("status");
    const url = new URL(request.url);
    if (liveStatus === null || url.searchParams.get("ref") !== "rassam-live") return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    return HttpResponse.json({
      type: "file",
      name: "status.json",
      path: ".rassam/status.json",
      sha: "c".repeat(40),
      size: Buffer.byteLength(liveStatus, "utf8"),
      encoding: "base64",
      content: Buffer.from(liveStatus, "utf8").toString("base64"),
    });
  }),
  http.all(`https://${HEALTH_HOST}/*`, ({ request }) => {
    otherCalls.push(request.url);
    return HttpResponse.json({ ok: true });
  }),
);

function contract(): Blueprint {
  const blueprint = emptyBlueprint("Fixture System");
  blueprint.components.push(
    { id: "app", name: "Storefront", kind: "module", paths: ["src/app/**"], runtime: { health: { url: `https://${HEALTH_HOST}/healthz` } } },
    { id: "lib", name: "Shared Library", kind: "module", paths: ["src/lib/**"] },
  );
  blueprint.dependencies.push({ from: "app", to: "lib" });
  return blueprint;
}

const SOURCES: Record<string, string> = {
  "src/app/page.ts": "import { helper } from '../lib/helper';\nexport const page = helper();\n",
  "src/lib/helper.ts": "export const helper = () => 1;\n",
  "package.json": "{\"name\":\"fixture\"}",
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetLiveCaches();
  files = { ...SOURCES, ".rassam/blueprint.json": serializeBlueprint(contract()) };
  visibility = "public";
  liveStatus = null;
  githubCalls = [];
  otherCalls = [];
  limiter.allowed = true;
  limiter.keys = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function request(kind: "system" | "badge", query = "", headers: Record<string, string> = {}, owner = OWNER, repo = REPO): Promise<Response> {
  const handler = kind === "system" ? system : badge;
  return handler(
    new NextRequest(`http://localhost/api/live/${owner}/${repo}/${kind}.svg${query ? `?${query}` : ""}`, { headers: { "x-forwarded-for": "203.0.113.9", ...headers } }),
    { params: Promise.resolve({ owner, repo }) },
  );
}

describe("GET /api/live/[owner]/[repo]/system.svg", () => {
  it("renders the system design of the default branch head as a safe, cacheable SVG", async () => {
    const response = await request("system");
    const svg = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60, stale-while-revalidate=30");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(response.headers.get("etag")).toMatch(/^W\/"a{16}\.none\.system\.light\.calm"$/);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Fixture System");
    expect(svg).toContain("Storefront");
    expect(svg).toContain("Shared Library");
    expect(svg).not.toMatch(/<script|<foreignObject|href="http/i);

    // Limited by a digest of the client address and deployment-wide; the address itself is never a key.
    expect(limiter.keys).toHaveLength(2);
    expect(limiter.keys[0]).toMatch(/^rassam:quota:live:ip:[0-9a-f]{32}$/);
    expect(limiter.keys.join(" ")).not.toContain("203.0.113.9");
    // Status comes from the repository's status.json only: the declared health URL is never fetched.
    expect(otherCalls).toEqual([]);
  });

  it("answers 304 when the ETag still matches", async () => {
    const first = await request("system");
    const etag = first.headers.get("etag") ?? "";
    const second = await request("system", "", { "if-none-match": etag });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("cache-control")).toContain("max-age=60");

    const other = await request("system", "theme=dark", { "if-none-match": etag });
    expect(other.status).toBe(200);
    expect(other.headers.get("etag")).toContain("system.dark.calm");
  });

  it("serves repeat requests from memory without calling GitHub again", async () => {
    const first = await request("system");
    const callsAfterFirst = githubCalls.length;
    expect(githubCalls).toEqual(expect.arrayContaining(["repo", "commit", "tree", "blob", "status"]));

    const second = await request("system");
    expect(await second.text()).toBe(await first.text());
    expect(githubCalls).toHaveLength(callsAfterFirst);

    // Other variants reuse the analysis of the same commit: still no GitHub call.
    const dark = await request("system", "theme=dark&detail=full");
    expect(dark.status).toBe(200);
    expect(dark.headers.get("etag")).toContain("system.dark.full");
    const badgeResponse = await request("badge");
    expect(badgeResponse.status).toBe(200);
    expect(githubCalls).toHaveLength(callsAfterFirst);
  });

  it("shows a friendly card, not an error, when the repository has no blueprint", async () => {
    delete files[".rassam/blueprint.json"];
    const response = await request("system");
    const svg = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(svg).toContain("No blueprint yet — run rassam init");
    expect(svg).toContain(`${OWNER}/${REPO}`);

    const badgeSvg = await (await request("badge")).text();
    expect(badgeSvg).toContain("not set up");
  });

  it("says so when the blueprint file does not parse", async () => {
    files[".rassam/blueprint.json"] = "{ not json";
    const svg = await (await request("system")).text();
    expect(svg).toContain("The blueprint has errors");
    expect(await (await request("badge")).text()).toContain("invalid");
  });

  it("overlays live status from the rassam-live branch and keys the ETag on it", async () => {
    const checkedAt = new Date().toISOString();
    liveStatus = JSON.stringify({ version: 1, checkedAt, components: { app: { state: "down", source: "health-check", detail: "HTTP 503" } } });
    const response = await request("system");

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toContain(checkedAt.replace(/[^\w:.+-]/g, ""));
    const systemBadge = await (await request("badge", "kind=system")).text();
    expect(systemBadge).toContain("outage");
    expect(otherCalls).toEqual([]);
  });

  it("falls back to status.json at the head commit when there is no rassam-live branch", async () => {
    files[".rassam/status.json"] = JSON.stringify({ version: 1, checkedAt: new Date().toISOString(), components: { app: { state: "up", source: "health-check" } } });
    const svg = await (await request("badge", "kind=system")).text();
    expect(svg).toContain("operational");
  });

  it("refuses private and unknown repositories with an SVG card", async () => {
    visibility = "private";
    const response = await request("system");
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toContain("Private repositories are not supported");
    expect(githubCalls).toEqual(["repo"]);

    const invalid = await request("system", "", {}, "bad owner!", REPO);
    expect(invalid.status).toBe(404);
    expect(await invalid.text()).toContain("Repository not found");
  });

  it("is rate limited before any GitHub call", async () => {
    limiter.allowed = false;
    const response = await request("system");
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(githubCalls).toEqual([]);
  });
});

describe("GET /api/live/[owner]/[repo]/badge.svg", () => {
  it("reports the blueprint check", async () => {
    const response = await request("badge");
    const svg = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toContain("badge.blueprint.light");
    expect(svg).toContain("blueprint");
    expect(svg).toContain("passing");
  });

  it("counts errors when a rule is broken", async () => {
    const blueprint = contract();
    blueprint.rules.push({ id: "app-not-lib", kind: "forbid", from: "app", to: "lib" });
    files[".rassam/blueprint.json"] = serializeBlueprint(blueprint);
    const svg = await (await request("badge", "theme=dark")).text();
    expect(svg).toMatch(/\d+ errors?/);
  });

  it("says not monitored without a status file", async () => {
    const svg = await (await request("badge", "kind=system")).text();
    expect(svg).toContain("not monitored");
  });
});
