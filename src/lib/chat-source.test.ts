import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

import { ApiError } from "./api-error";
import type { ChatRequest, RepositorySnapshot } from "./contracts";
import { validateChatSource } from "./chat-source";
import { issueSourceGrant } from "./source-grant";

const snapshot: RepositorySnapshot = {
  host: "github.com",
  owner: "openai",
  repo: "rassam",
  requestedRef: "main",
  defaultBranch: "main",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  visibility: "public",
  retrievedAt: "2026-01-01T00:00:00.000Z",
};

const previousSecret = process.env.SOURCE_GRANT_SECRET;

beforeEach(() => {
  process.env.SOURCE_GRANT_SECRET = "test-source-grant-secret-at-least-32-bytes";
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SOURCE_GRANT_SECRET;
  else process.env.SOURCE_GRANT_SECRET = previousSecret;
});

function details(overrides: Record<string, unknown> = {}): NonNullable<ChatRequest["repoDetails"]> {
  return {
    owner: snapshot.owner,
    repo: snapshot.repo,
    commitSha: snapshot.commitSha,
    treeSha: snapshot.treeSha,
    sourceGrant: issueSourceGrant(snapshot),
    ...overrides,
  };
}

test("accepts only a grant bound to the repository and immutable commit", () => {
  const grant = validateChatSource(details(), undefined);
  assert.equal(grant?.commitSha, snapshot.commitSha);

  assert.throws(
    () => validateChatSource(details({ commitSha: "c".repeat(40) }), undefined),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_SOURCE_GRANT",
  );
});

test("rejects a graph whose repository identity differs from its grant", () => {
  assert.throws(
    () => validateChatSource(details(), {
      syncedAt: "2026-01-01T00:00:00.000Z",
      graphRevision: 1,
      project: { id: "p", name: "Other", source: "github", repo: "someone/else" },
      layoutDirection: "TB",
      nodes: [],
      edges: [],
    }),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_SOURCE_GRANT",
  );
});

test("requires a grant whenever the canvas claims GitHub source", () => {
  assert.throws(
    () => validateChatSource(null, {
      syncedAt: "2026-01-01T00:00:00.000Z",
      graphRevision: 0,
      project: { id: "p", name: "Repo", source: "github", repo: "openai/rassam" },
      layoutDirection: "TB",
      nodes: [],
      edges: [],
    }),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_SOURCE_GRANT",
  );
});
