import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { ApiError } from "./api-error";
import {
  getPinnedFile,
  getPublicRepository,
  normalizeRepositoryPath,
  octokit,
  parseGitHubRepositoryUrl,
} from "./github";
import type { SourceGrantPayload } from "./contracts";

afterEach(() => vi.restoreAllMocks());

const grant: SourceGrantPayload = {
  version: 1,
  owner: "openai",
  repo: "fixture",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

test("GitHub URL parsing accepts only exact public github.com repository URLs", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/openai/example.git/"), {
    owner: "openai",
    repo: "example",
  });

  for (const invalid of [
    "http://github.com/openai/example",
    "https://www.github.com/openai/example",
    "https://github.com.evil.test/openai/example",
    "https://github.com/openai/example/issues",
    "https://github.com/openai/example?tab=readme",
    "https://user@github.com/openai/example",
  ]) {
    assert.throws(
      () => parseGitHubRepositoryUrl(invalid),
      (error: unknown) => error instanceof ApiError && error.code === "INVALID_GITHUB_URL",
      invalid,
    );
  }
});

test("repository paths reject traversal, absolute, empty-segment, and backslash forms", () => {
  assert.equal(normalizeRepositoryPath("src/app/page.tsx"), "src/app/page.tsx");
  for (const invalid of ["../secret", "/etc/passwd", "src//file.ts", "src\\file.ts", "./README.md"]) {
    assert.throws(() => normalizeRepositoryPath(invalid));
  }
});

test("private repositories are rejected before commit or tree access", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({
    data: {
      private: true,
      visibility: "private",
      default_branch: "main",
      description: null,
      stargazers_count: 0,
      language: null,
    },
  } as never);
  const commitSpy = vi.spyOn(octokit.rest.repos, "getCommit");

  await assert.rejects(
    getPublicRepository("openai", "private-fixture"),
    (error: unknown) => error instanceof ApiError && error.code === "REPOSITORY_PRIVATE",
  );
  assert.equal(commitSpy.mock.calls.length, 0);
});

test("enterprise-internal repositories are not treated as public", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({
    data: {
      private: false,
      visibility: "internal",
      default_branch: "main",
      description: null,
      stargazers_count: 0,
      language: null,
    },
  } as never);

  await assert.rejects(
    getPublicRepository("enterprise-org", "internal-fixture"),
    (error: unknown) => error instanceof ApiError && error.code === "REPOSITORY_PRIVATE",
  );
});

test("public repositories resolve a ref to immutable commit and tree SHAs", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({
    data: {
      private: false,
      visibility: "public",
      default_branch: "main",
      description: "Fixture",
      stargazers_count: 7,
      language: "TypeScript",
    },
  } as never);
  vi.spyOn(octokit.rest.repos, "getCommit").mockResolvedValue({
    data: {
      sha: "a".repeat(40),
      commit: { tree: { sha: "b".repeat(40) } },
    },
  } as never);
  vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue({
    data: {
      truncated: false,
      tree: [{ path: "src/index.ts", type: "blob", sha: "c".repeat(40), url: "blob", mode: "100644", size: 20 }],
    },
  } as never);

  const result = await getPublicRepository("openai", "fixture", "release");
  assert.equal(result.snapshot.requestedRef, "release");
  assert.equal(result.snapshot.commitSha, "a".repeat(40));
  assert.equal(result.snapshot.treeSha, "b".repeat(40));
  assert.equal(result.snapshot.visibility, "public");
  assert.deepEqual(result.nodes.map((node) => node.path), ["src/index.ts"]);
});

test("truncated recursive trees are completed through bounded subtree traversal", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({
    data: { private: false, visibility: "public", default_branch: "main", description: null, stargazers_count: 0, language: null },
  } as never);
  vi.spyOn(octokit.rest.repos, "getCommit").mockResolvedValue({
    data: { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } },
  } as never);
  vi.spyOn(octokit.rest.git, "getTree").mockImplementation(async (input) => {
    if (input?.recursive) return { data: { truncated: true, tree: [] } } as never;
    if (input?.tree_sha === "b".repeat(40)) {
      return { data: { truncated: false, tree: [
        { path: "src", type: "tree", sha: "c".repeat(40), url: "tree", mode: "040000" },
        { path: "README.md", type: "blob", sha: "d".repeat(40), url: "blob", mode: "100644", size: 5 },
      ] } } as never;
    }
    return { data: { truncated: false, tree: [
      { path: "index.ts", type: "blob", sha: "e".repeat(40), url: "blob", mode: "100644", size: 20 },
    ] } } as never;
  });

  const result = await getPublicRepository("openai", "fixture");
  assert.deepEqual(result.nodes.map((node) => node.path), ["README.md", "src", "src/index.ts"]);
});

test("an individually truncated subtree fails instead of returning partial coverage", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({
    data: { private: false, visibility: "public", default_branch: "main", description: null, stargazers_count: 0, language: null },
  } as never);
  vi.spyOn(octokit.rest.repos, "getCommit").mockResolvedValue({
    data: { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } },
  } as never);
  vi.spyOn(octokit.rest.git, "getTree")
    .mockResolvedValueOnce({ data: { truncated: true, tree: [] } } as never)
    .mockResolvedValueOnce({ data: { truncated: true, tree: [] } } as never);

  await assert.rejects(
    getPublicRepository("openai", "fixture"),
    (error: unknown) => error instanceof ApiError && error.code === "TREE_INCOMPLETE",
  );
});

test("pinned file reads recheck public visibility and use the granted commit", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({ data: { private: false, visibility: "public" } } as never);
  const contentSpy = vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
    data: { type: "file", sha: "c".repeat(40) },
  } as never);
  vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue({
    data: { size: 5, encoding: "base64", content: Buffer.from("hello").toString("base64") },
  } as never);

  const result = await getPinnedFile(grant, "src/index.ts", { expectedBlobSha: "c".repeat(40) });
  assert.equal(result.content, "hello");
  assert.equal(result.commitSha, grant.commitSha);
  assert.equal(contentSpy.mock.calls[0]?.[0]?.ref, grant.commitSha);
});

test("a repository made private after grant issuance cannot be read", async () => {
  vi.spyOn(octokit.rest.repos, "get").mockResolvedValue({ data: { private: true, visibility: "private" } } as never);
  const contentSpy = vi.spyOn(octokit.rest.repos, "getContent");

  await assert.rejects(
    getPinnedFile(grant, "src/index.ts"),
    (error: unknown) => error instanceof ApiError && error.code === "REPOSITORY_PRIVATE",
  );
  assert.equal(contentSpy.mock.calls.length, 0);
});
