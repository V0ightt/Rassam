import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";

const mocks = vi.hoisted(() => ({ guard: vi.fn() }));

vi.mock("@/lib/request-security", () => ({
  guardApiRequest: mocks.guard,
  rateLimitHeaders: () => ({ "x-ratelimit-limit": "400" }),
}));

import { cacheClock, MEMO_TTL_MS, resetCommitsCache } from "./cache";
import { GET } from "./route";

const OWNER = "fixture-owner";
const REPO = "fixture-repo";
const sha = (char: string) => char.repeat(40);

let visibility: "public" | "private" = "public";
let commits: Array<{ sha: string; message: string; author: string; date: string }> = [];
let commitsEtag = '"commits-v1"';
let requests: Array<{ url: string; ifNoneMatch: string | null; shaParam: string | null }> = [];

const server = setupServer(
  http.get("https://api.github.com/repos/:owner/:repo", ({ request }) => {
    requests.push({ url: "repo", ifNoneMatch: request.headers.get("if-none-match"), shaParam: null });
    if (request.headers.get("if-none-match") === '"repo-v1"') return new HttpResponse(null, { status: 304 });
    return HttpResponse.json({ private: visibility === "private", visibility, default_branch: "main" }, { headers: { etag: '"repo-v1"' } });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/commits", ({ request }) => {
    const url = new URL(request.url);
    requests.push({ url: "commits", ifNoneMatch: request.headers.get("if-none-match"), shaParam: url.searchParams.get("sha") });
    if (url.searchParams.get("sha") === "missing-branch") return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    if (request.headers.get("if-none-match") === commitsEtag) return new HttpResponse(null, { status: 304 });
    return HttpResponse.json(commits.map((commit) => ({
      sha: commit.sha,
      commit: { message: commit.message, author: { name: commit.author, date: commit.date } },
    })), { headers: { etag: commitsEtag } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetCommitsCache();
  visibility = "public";
  commitsEtag = '"commits-v1"';
  requests = [];
  commits = [
    { sha: sha("c"), message: `Add payments\n\nLong body ${"x".repeat(50)}`, author: "Dana", date: "2026-11-20T10:00:00Z" },
    { sha: sha("b"), message: "y".repeat(400), author: "Sam", date: "2026-11-19T10:00:00Z" },
  ];
  mocks.guard.mockReset();
  mocks.guard.mockImplementation(async () => ({
    sessionId: "test-session",
    rateLimit: { allowed: true, limit: 400, remaining: 399, resetAt: Date.now() + 60_000 },
    release: vi.fn(async () => undefined),
  }));
});
afterEach(() => {
  server.resetHandlers();
  cacheClock.now = () => Date.now();
});
afterAll(() => server.close());

function get(query: string): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/blueprint/commits?${query}`));
}

describe("GET /api/blueprint/commits", () => {
  it("returns the head and recent commits of a public repository", async () => {
    const response = await get(`owner=${OWNER}&repo=${REPO}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=20");
    expect(response.headers.get("x-ratelimit-limit")).toBe("400");
    expect(payload.head).toEqual({ sha: sha("c"), message: "Add payments", author: "Dana", date: "2026-11-20T10:00:00Z" });
    expect(payload.recent).toHaveLength(2);
    expect(payload.recent[1].message).toHaveLength(200);
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scope: "blueprint-commits" }));
    expect(requests.find((request) => request.url === "commits")?.shaParam).toBeNull();
  });

  it("passes the ref through and reports an unknown ref", async () => {
    await get(`owner=${OWNER}&repo=${REPO}&ref=release/1.x`);
    expect(requests.find((request) => request.url === "commits")?.shaParam).toBe("release/1.x");

    const missing = await get(`owner=${OWNER}&repo=${REPO}&ref=missing-branch`);
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("REF_NOT_FOUND");
  });

  it("memoizes briefly, then revalidates with ETags", async () => {
    const base = Date.now();
    let offset = 0;
    cacheClock.now = () => base + offset;
    await get(`owner=${OWNER}&repo=${REPO}`);
    expect(requests).toHaveLength(2);

    // Within the memo window GitHub is not asked at all.
    offset = MEMO_TTL_MS - 1;
    const memoized = await get(`owner=${OWNER}&repo=${REPO}`);
    expect((await memoized.json()).head.sha).toBe(sha("c"));
    expect(requests).toHaveLength(2);

    // After it, both requests are conditional and 304 keeps the known answer.
    offset = MEMO_TTL_MS + 1;
    const revalidated = await get(`owner=${OWNER}&repo=${REPO}`);
    expect((await revalidated.json()).head.sha).toBe(sha("c"));
    expect(requests).toHaveLength(4);
    expect(requests[2]).toMatchObject({ url: "repo", ifNoneMatch: '"repo-v1"' });
    expect(requests[3]).toMatchObject({ url: "commits", ifNoneMatch: '"commits-v1"' });

    // A new commit changes the ETag and the answer.
    commits = [{ sha: sha("d"), message: "Newer", author: "Dana", date: "2026-11-21T10:00:00Z" }, ...commits];
    commitsEtag = '"commits-v2"';
    offset = 3 * MEMO_TTL_MS;
    const fresh = await get(`owner=${OWNER}&repo=${REPO}`);
    expect((await fresh.json()).head).toMatchObject({ sha: sha("d"), message: "Newer" });
  });

  it("refuses private repositories", async () => {
    visibility = "private";
    const response = await get(`owner=${OWNER}&repo=${REPO}`);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("REPOSITORY_PRIVATE");
    expect(requests.some((request) => request.url === "commits")).toBe(false);
  });

  it("rejects invalid queries before calling GitHub", async () => {
    for (const query of ["owner=&repo=x", `owner=${OWNER}`, `owner=${OWNER}&repo=${REPO}&ref=a b`, `owner=${OWNER}&repo=${REPO}&extra=1`, "owner=..%2F..&repo=x"]) {
      const response = await get(query);
      expect(response.status, query).toBe(400);
    }
    expect(requests).toHaveLength(0);
  });

  it("is rate limited through the request guard", async () => {
    mocks.guard.mockRejectedValueOnce(new ApiError("RATE_LIMITED", 429, "Request quota exceeded. Try again after the reset time.", true));
    const response = await get(`owner=${OWNER}&repo=${REPO}`);
    expect(response.status).toBe(429);
    expect(requests).toHaveLength(0);
  });
});
