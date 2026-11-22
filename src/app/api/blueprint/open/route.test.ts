import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { verifySourceGrant } from "@/lib/source-grant";

const guard = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  guardApiRequest: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({
  guardApiRequest: guard.guardApiRequest,
  rateLimitHeaders: () => ({ "x-ratelimit-limit": "120" }),
}));

import { POST } from "./route";

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const OTHER_COMMIT = "c".repeat(40);

let visibility: "public" | "private" = "public";
let requestedRefs: string[] = [];

const server = setupServer(
  http.get("https://api.github.com/repos/:owner/:repo", ({ params }) => {
    if (params.repo === "missing") return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    return HttpResponse.json({ private: visibility === "private", visibility, default_branch: "main", description: null, stargazers_count: 1, language: "TypeScript" });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/commits/:ref", ({ params }) => {
    const ref = String(params.ref);
    requestedRefs.push(ref);
    if (ref === "nope") return HttpResponse.json({ message: "No commit found" }, { status: 404 });
    return HttpResponse.json({ sha: ref === OTHER_COMMIT ? OTHER_COMMIT : COMMIT, commit: { tree: { sha: TREE } } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  visibility = "public";
  requestedRefs = [];
  guard.release.mockClear();
  guard.guardApiRequest.mockReset();
});
afterAll(() => server.close());

function allowRequests() {
  guard.guardApiRequest.mockImplementation(async () => ({
    sessionId: "test-session",
    rateLimit: { limit: 120, remaining: 119, resetAt: Date.now() + 60_000 },
    release: guard.release,
  }));
}

function post(body: unknown): Promise<Response> {
  return POST(new NextRequest("http://localhost/api/blueprint/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /api/blueprint/open", () => {
  it("resolves a public repository and issues a grant pinned to its commit", async () => {
    allowRequests();
    const response = await post({ url: "https://github.com/acme/shop" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ owner: "acme", repo: "shop", commitSha: COMMIT, defaultBranch: "main" });
    expect(requestedRefs).toEqual(["main"]);

    const grant = verifySourceGrant(payload.sourceGrant);
    expect(grant).toMatchObject({ owner: "acme", repo: "shop", commitSha: COMMIT, treeSha: TREE });
    expect(guard.guardApiRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scope: "blueprint-open" }));
    expect(guard.release).toHaveBeenCalledTimes(1);
  });

  it("pins the requested ref, so the Studio can follow a repository to a newer commit", async () => {
    allowRequests();
    const response = await post({ url: "https://github.com/acme/shop", ref: OTHER_COMMIT });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.commitSha).toBe(OTHER_COMMIT);
    expect(requestedRefs).toEqual([OTHER_COMMIT]);
    expect(verifySourceGrant(payload.sourceGrant).commitSha).toBe(OTHER_COMMIT);
  });

  it("rejects anything that is not an exact public github.com repository URL", async () => {
    allowRequests();
    for (const url of ["not a url", "http://github.com/acme/shop", "https://gitlab.com/acme/shop", "https://github.com/acme", "https://user:pass@github.com/acme/shop"]) {
      const response = await post({ url });
      const payload = await response.json();
      expect(response.status).toBe(400);
      expect(payload.code).toBe("INVALID_GITHUB_URL");
      expect(payload.sourceGrant).toBeUndefined();
    }
    expect(requestedRefs).toEqual([]);
  });

  it("rejects unknown fields and a missing URL before contacting GitHub", async () => {
    allowRequests();
    expect((await post({})).status).toBe(400);
    expect((await post({ url: "https://github.com/acme/shop", commitSha: COMMIT })).status).toBe(400);
    expect(requestedRefs).toEqual([]);
  });

  it("refuses private repositories, unknown repositories and unknown refs without issuing a grant", async () => {
    allowRequests();
    visibility = "private";
    const privateResponse = await post({ url: "https://github.com/acme/shop" });
    expect(privateResponse.status).toBe(403);
    expect((await privateResponse.json()).code).toBe("REPOSITORY_PRIVATE");

    visibility = "public";
    const missing = await post({ url: "https://github.com/acme/missing" });
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("REPOSITORY_NOT_FOUND");

    const badRef = await post({ url: "https://github.com/acme/shop", ref: "nope" });
    const badRefPayload = await badRef.json();
    expect(badRef.status).toBe(404);
    expect(badRefPayload.code).toBe("REF_NOT_FOUND");
    expect(badRefPayload.sourceGrant).toBeUndefined();
  });

  it("answers with the guard's error when the request is not allowed", async () => {
    const { ApiError } = await import("@/lib/api-error");
    guard.guardApiRequest.mockRejectedValue(new ApiError("RATE_LIMITED", 429, "Too many requests", true));
    const response = await post({ url: "https://github.com/acme/shop" });
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("RATE_LIMITED");
    expect(requestedRefs).toEqual([]);
  });
});
