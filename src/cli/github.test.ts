import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasApprovalLabel, readGithubContext, upsertStickyComment, writeStepSummary } from "./github";
import type { GithubContext } from "./github";
import { makeTempDir, removeDir, write } from "./test-helpers";

const MARKER = "<!-- rassam:blueprint-check -->";

const EVENT = {
  action: "synchronize",
  number: 42,
  pull_request: {
    number: 42,
    base: { ref: "main", sha: "b".repeat(40), repo: { full_name: "acme/shop" } },
    head: { ref: "feature/cart", sha: "a".repeat(40), repo: { full_name: "acme/shop" } },
    labels: [{ name: "bug" }, { name: "Rassam:Approved" }],
  },
  repository: { full_name: "acme/shop", html_url: "https://github.com/acme/shop" },
};

interface Call {
  method: string;
  url: string;
  body?: { body: string };
  headers: Record<string, string>;
}

type Responder = (call: Call) => { status?: number; json?: unknown; link?: string };

function fakeFetch(responder: Responder): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as { body: string }) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const reply = responder(call);
    return new Response(JSON.stringify(reply.json ?? {}), {
      status: reply.status ?? 200,
      headers: reply.link ? { link: reply.link, "content-type": "application/json" } : { "content-type": "application/json" },
    });
  };
  return { fetch: impl as typeof fetch, calls };
}

describe("github integration", () => {
  let dir: string;
  let context: GithubContext;

  beforeAll(async () => {
    dir = await makeTempDir();
    await write(dir, "event.json", JSON.stringify(EVENT));
    context = await readGithubContext({
      GITHUB_EVENT_PATH: join(dir, "event.json"),
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_BASE_REF: "main",
      GITHUB_REPOSITORY: "acme/shop",
      GITHUB_TOKEN: "test-token",
      GITHUB_API_URL: "https://api.github.test/",
      GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
    });
  });

  afterAll(async () => {
    await removeDir(dir);
  });

  it("reads the pull request context from the event file", () => {
    expect(context).toMatchObject({
      eventName: "pull_request",
      isPullRequest: true,
      prNumber: 42,
      baseRef: "main",
      baseSha: "b".repeat(40),
      headRef: "feature/cart",
      headSha: "a".repeat(40),
      labels: ["bug", "Rassam:Approved"],
      repository: "acme/shop",
      repoHtmlUrl: "https://github.com/acme/shop",
      isFork: false,
      apiUrl: "https://api.github.test",
    });
  });

  it("degrades to an empty context outside pull requests", async () => {
    const push = await readGithubContext({ GITHUB_EVENT_PATH: join(dir, "missing.json"), GITHUB_REPOSITORY: "acme/shop", GITHUB_SHA: "c".repeat(40) });
    expect(push).toMatchObject({ isPullRequest: false, labels: [], repository: "acme/shop", repoHtmlUrl: "https://github.com/acme/shop", headSha: "c".repeat(40), apiUrl: "https://api.github.com" });
    expect(push.prNumber).toBeUndefined();
    expect(push.token).toBeUndefined();
  });

  it("detects fork pull requests", async () => {
    const fork = structuredClone(EVENT);
    fork.pull_request.head.repo.full_name = "mallory/shop";
    await write(dir, "fork.json", JSON.stringify(fork));
    expect((await readGithubContext({ GITHUB_EVENT_PATH: join(dir, "fork.json") })).isFork).toBe(true);
  });

  it("treats the approval label case-insensitively and exactly", () => {
    expect(hasApprovalLabel(context, "rassam:approved")).toBe(true);
    expect(hasApprovalLabel(context, "rassam")).toBe(false);
    expect(hasApprovalLabel(context, "")).toBe(false);
    expect(hasApprovalLabel({ ...context, labels: [] }, "rassam:approved")).toBe(false);
  });

  it("appends the report to the step summary", async () => {
    expect(await writeStepSummary(context, "## Report")).toBe(true);
    expect(await writeStepSummary(context, "more\n")).toBe(true);
    expect(await readFile(join(dir, "summary.md"), "utf8")).toBe("## Report\nmore\n");
    expect(await writeStepSummary({ ...context, stepSummaryPath: undefined }, "x")).toBe(false);
  });

  it("creates the sticky comment when none exists", async () => {
    const { fetch, calls } = fakeFetch((call) => (call.method === "GET" ? { json: [{ id: 1, body: "unrelated" }] } : { status: 201, json: { html_url: "https://github.com/acme/shop/pull/42#issuecomment-9" } }));
    const warnings: string[] = [];
    const result = await upsertStickyComment(context, "## Report", MARKER, { fetch, warn: (message) => warnings.push(message) });
    expect(result).toEqual({ action: "created", url: "https://github.com/acme/shop/pull/42#issuecomment-9" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.github.test/repos/acme/shop/issues/42/comments?per_page=100&page=1",
      "POST https://api.github.test/repos/acme/shop/issues/42/comments",
    ]);
    expect(calls[1].body?.body).toBe(`${MARKER}\n## Report`);
    expect(calls[0].headers.Authorization).toBe("Bearer test-token");
    expect(warnings).toEqual([]);
  });

  it("updates the existing sticky comment, following pagination", async () => {
    const { fetch, calls } = fakeFetch((call) => {
      if (call.method !== "GET") return { json: { html_url: "https://example.test/c/77" } };
      if (call.url.endsWith("page=1")) return { json: [{ id: 5, body: "first page" }], link: '<https://api.github.test/next>; rel="next"' };
      return { json: [{ id: 77, body: `${MARKER}\nold report` }] };
    });
    const body = `${MARKER}\nnew report`;
    const result = await upsertStickyComment(context, body, MARKER, { fetch, warn: () => undefined });
    expect(result.action).toBe("updated");
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "PATCH"]);
    expect(calls[2].url).toBe("https://api.github.test/repos/acme/shop/issues/comments/77");
    // The marker is not duplicated when the body already carries it.
    expect(calls[2].body?.body).toBe(body);
  });

  it("tolerates 403 on fork pull requests with a warning", async () => {
    const { fetch } = fakeFetch((call) => (call.method === "GET" ? { json: [] } : { status: 403, json: { message: "Resource not accessible by integration" } }));
    const warnings: string[] = [];
    const result = await upsertStickyComment({ ...context, isFork: true }, "report", MARKER, { fetch, warn: (message) => warnings.push(message) });
    expect(result.action).toBe("skipped");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/403.*forks get a read-only token/);
  });

  it("never throws on network failures or 404", async () => {
    const warnings: string[] = [];
    const failing = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    expect((await upsertStickyComment(context, "report", MARKER, { fetch: failing, warn: (message) => warnings.push(message) })).action).toBe("skipped");
    const { fetch } = fakeFetch(() => ({ status: 404, json: { message: "Not Found" } }));
    expect((await upsertStickyComment(context, "report", MARKER, { fetch, warn: (message) => warnings.push(message) })).action).toBe("skipped");
    expect(warnings[0]).toContain("ENOTFOUND");
    expect(warnings[1]).toContain("pull-requests: write");
  });

  it("skips without calling the API when there is no token or pull request", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: [] }));
    const deps = { fetch, warn: () => undefined };
    expect(await upsertStickyComment({ ...context, token: undefined }, "r", MARKER, deps)).toMatchObject({ action: "skipped", reason: "GITHUB_TOKEN is not set" });
    expect(await upsertStickyComment({ ...context, prNumber: undefined }, "r", MARKER, deps)).toMatchObject({ action: "skipped" });
    expect(calls).toEqual([]);
  });

  it("truncates oversized comments", async () => {
    const { fetch, calls } = fakeFetch((call) => (call.method === "GET" ? { json: [] } : { status: 201, json: {} }));
    await upsertStickyComment(context, "x".repeat(80_000), MARKER, { fetch, warn: () => undefined });
    const sent = calls[1].body?.body ?? "";
    expect(sent.length).toBeLessThanOrEqual(65_000);
    expect(sent.startsWith(MARKER)).toBe(true);
    expect(sent).toContain("Report truncated");
  });
});
