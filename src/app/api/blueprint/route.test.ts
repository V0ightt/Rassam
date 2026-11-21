import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MAX_ANALYZED_FILE_BYTES } from "@/blueprint/constants";
import { emptyBlueprint, serializeBlueprint, type Blueprint } from "@/blueprint/schema";
import { MAX_ANALYSIS_FILES } from "@/lib/contracts";
import { issueSourceGrant } from "@/lib/source-grant";

vi.mock("@/lib/request-security", () => ({
  guardApiRequest: vi.fn(async () => ({
    sessionId: "test-session",
    rateLimit: { limit: 30, remaining: 29, resetAt: Date.now() + 60_000 },
    release: vi.fn(async () => undefined),
  })),
  rateLimitHeaders: () => ({ "x-ratelimit-limit": "30" }),
}));

import { POST } from "./route";

const OWNER = "fixture-owner";
const REPO = "fixture-repo";
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const ENV_SECRET = "ENV_FILE_SECRET_VALUE_91823";

interface FixtureFile {
  content: string;
  /** Override the size GitHub reports in the tree. */
  size?: number;
}

let repositoryFiles: Record<string, FixtureFile> = {};
let visibility: "public" | "private" = "public";
let blobRequests: string[] = [];
let pathBySha = new Map<string, string>();

function shaFor(index: number): string {
  return index.toString(16).padStart(40, "0");
}

const server = setupServer(
  http.get("https://api.github.com/repos/:owner/:repo", () => HttpResponse.json({
    private: visibility === "private",
    visibility,
    default_branch: "main",
  })),
  http.get("https://api.github.com/repos/:owner/:repo/git/trees/:sha", () => {
    pathBySha = new Map();
    const tree = Object.entries(repositoryFiles).map(([path, file], index) => {
      const sha = shaFor(index);
      pathBySha.set(sha, path);
      return {
        path,
        type: "blob",
        mode: "100644",
        sha,
        size: file.size ?? Buffer.byteLength(file.content, "utf8"),
        url: `https://api.github.com/repos/${OWNER}/${REPO}/git/blobs/${sha}`,
      };
    });
    return HttpResponse.json({ sha: TREE, truncated: false, tree });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/git/blobs/:sha", ({ params }) => {
    const path = pathBySha.get(String(params.sha));
    if (!path) return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    blobRequests.push(path);
    const content = repositoryFiles[path].content;
    return HttpResponse.json({
      sha: params.sha,
      size: Buffer.byteLength(content, "utf8"),
      encoding: "base64",
      content: Buffer.from(content, "utf8").toString("base64"),
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  repositoryFiles = {};
  visibility = "public";
  blobRequests = [];
});
afterAll(() => server.close());

function grant(overrides: Partial<{ owner: string; repo: string; commitSha: string }> = {}): string {
  return issueSourceGrant({
    host: "github.com",
    owner: overrides.owner ?? OWNER,
    repo: overrides.repo ?? REPO,
    requestedRef: "main",
    defaultBranch: "main",
    commitSha: overrides.commitSha ?? COMMIT,
    treeSha: TREE,
    visibility: "public",
    retrievedAt: new Date().toISOString(),
  });
}

function post(body: unknown): Promise<Response> {
  return POST(new NextRequest("http://localhost/api/blueprint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function validBlueprint(): Blueprint {
  const blueprint = emptyBlueprint("Fixture System");
  blueprint.components.push(
    { id: "app", name: "App", kind: "module", paths: ["src/app/**"] },
    { id: "lib", name: "Lib", kind: "module", paths: ["src/lib/**"] },
  );
  blueprint.dependencies.push({ from: "app", to: "lib" });
  return blueprint;
}

const SOURCES: Record<string, FixtureFile> = {
  "src/app/page.ts": { content: "import { helper } from '../lib/helper';\nexport const page = helper(process.env.API_TOKEN);\n" },
  "src/lib/helper.ts": { content: "export function helper(value?: string) { return value ?? ''; }\n" },
  "package.json": { content: JSON.stringify({ name: "fixture-system" }) },
  "README.md": { content: "# Fixture\n" },
  ".env": { content: `SECRET=${ENV_SECRET}\n` },
  ".env.local": { content: `SECRET=${ENV_SECRET}\n` },
  "node_modules/dep/index.js": { content: "module.exports = 1;\n" },
  ".mcp.json": { content: JSON.stringify({ mcpServers: { files: { command: "npx", args: ["files-server"] } } }) },
};

describe("POST /api/blueprint", () => {
  it("returns the repository blueprint, layout, graph and reach for a pinned commit", async () => {
    const blueprintText = serializeBlueprint(validBlueprint());
    repositoryFiles = {
      ...SOURCES,
      ".rassam/blueprint.json": { content: blueprintText },
      ".rassam/layout.json": { content: JSON.stringify({ version: 1, positions: { app: { x: 10, y: 20 }, bad: { x: "1" } } }) },
    };

    const response = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("30");
    expect(payload.commitSha).toBe(COMMIT);
    expect(payload.blueprintText).toBe(blueprintText);
    expect(payload.blueprint.system.name).toBe("Fixture System");
    expect(payload.issues).toEqual([]);
    expect(payload.draft).toBeNull();
    expect(payload.layout).toEqual({ app: { x: 10, y: 20 } });
    expect(payload.graph.version).toBe(1);
    expect(payload.graph.files).toContain("src/app/page.ts");
    expect(payload.graph.files).toContain("README.md");
    expect(payload.graph.files).not.toContain("node_modules/dep/index.js");
    expect(payload.graph.edges).toEqual([
      expect.objectContaining({ from: "src/app/page.ts", to: "src/lib/helper.ts" }),
    ]);
    expect(payload.reach.configs.map((config: { path: string }) => config.path)).toContain(".mcp.json");
    expect(payload.reach.envAccess.map((entry: { name: string }) => entry.name)).toContain("API_TOKEN");
    expect(payload.stats.treeEntries).toBe(Object.keys(repositoryFiles).length);
    expect(payload.stats.filesFetched).toBe(blobRequests.length);

    // Only analysis inputs are fetched; .env contents never leave GitHub.
    expect(blobRequests.sort()).toEqual([
      ".mcp.json",
      ".rassam/blueprint.json",
      ".rassam/layout.json",
      "package.json",
      "src/app/page.ts",
      "src/lib/helper.ts",
    ]);
    expect(JSON.stringify(payload)).not.toContain(ENV_SECRET);
  });

  it("derives a draft when the repository has no blueprint", async () => {
    repositoryFiles = { ...SOURCES };

    const response = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.blueprintText).toBeNull();
    expect(payload.blueprint).toBeNull();
    expect(payload.issues).toEqual([]);
    expect(payload.layout).toBeNull();
    expect(payload.draft.components.length).toBeGreaterThan(0);
    expect(payload.draft.components[0].provenance.source).toBe("derived");
    expect(payload.draft.components[0].provenance.commit).toBe(COMMIT);
  });

  it("reports issues and still derives a draft when the blueprint is invalid", async () => {
    repositoryFiles = { ...SOURCES, ".rassam/blueprint.json": { content: "{ not json" } };

    const response = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.blueprintText).toBe("{ not json");
    expect(payload.blueprint).toBeNull();
    expect(payload.issues[0].message).toMatch(/Invalid JSON/);
    expect(payload.draft).not.toBeNull();
  });

  it("rejects forged grants and grants for a different snapshot before contacting GitHub", async () => {
    repositoryFiles = { ...SOURCES };
    const real = grant();
    const forged = `${real.slice(0, -4)}AAAA`;

    const invalid = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: forged });
    expect(invalid.status).toBe(401);
    expect((await invalid.json()).code).toBe("INVALID_SOURCE_GRANT");

    const otherRepo = await post({ owner: OWNER, repo: "another-repo", commitSha: COMMIT, sourceGrant: real });
    expect(otherRepo.status).toBe(403);
    expect((await otherRepo.json()).code).toBe("INVALID_SOURCE_GRANT");

    const otherCommit = await post({ owner: OWNER, repo: REPO, commitSha: "d".repeat(40), sourceGrant: real });
    expect(otherCommit.status).toBe(403);

    expect(blobRequests).toEqual([]);
  });

  it("rejects malformed requests", async () => {
    const response = await post({ owner: "bad owner!", repo: REPO, commitSha: "short", sourceGrant: grant(), extra: true });
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_REQUEST");
  });

  it("refuses repositories that became private after the grant was issued", async () => {
    repositoryFiles = { ...SOURCES };
    visibility = "private";

    const response = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("REPOSITORY_PRIVATE");
    expect(blobRequests).toEqual([]);
  });

  it("lists oversized source files without fetching them", async () => {
    repositoryFiles = {
      ...SOURCES,
      "src/lib/generated.ts": { content: "export const big = 1;\n", size: MAX_ANALYZED_FILE_BYTES + 1 },
    };

    const response = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blobRequests).not.toContain("src/lib/generated.ts");
    expect(payload.graph.files).toContain("src/lib/generated.ts");
    expect(payload.graph.facts.map((facts: { path: string }) => facts.path)).not.toContain("src/lib/generated.ts");
  });

  it("fails with REPOSITORY_TOO_LARGE when the file or byte budget is exceeded", async () => {
    const tooMany: Record<string, FixtureFile> = {};
    for (let index = 0; index <= MAX_ANALYSIS_FILES; index += 1) tooMany[`src/f${index}.ts`] = { content: "" };
    repositoryFiles = tooMany;
    const byCount = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    const countPayload = await byCount.json();
    expect(byCount.status).toBe(413);
    expect(countPayload.code).toBe("REPOSITORY_TOO_LARGE");
    expect(countPayload.details.maximumFiles).toBe(MAX_ANALYSIS_FILES);

    const tooBig: Record<string, FixtureFile> = {};
    for (let index = 0; index < 60; index += 1) tooBig[`src/g${index}.ts`] = { content: "", size: MAX_ANALYZED_FILE_BYTES };
    repositoryFiles = tooBig;
    const byBytes = await post({ owner: OWNER, repo: REPO, commitSha: COMMIT, sourceGrant: grant() });
    expect(byBytes.status).toBe(413);
    expect((await byBytes.json()).code).toBe("REPOSITORY_TOO_LARGE");
    expect(blobRequests).toEqual([]);
  });
});
