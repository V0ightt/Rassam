import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

import { ApiError } from "./api-error";
import type { RepositorySnapshot } from "./contracts";
import { issueSourceGrant, verifySourceGrant } from "./source-grant";

const snapshot: RepositorySnapshot = {
  host: "github.com",
  owner: "openai",
  repo: "rassam-fixture",
  requestedRef: "main",
  defaultBranch: "main",
  commitSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  visibility: "public",
  retrievedAt: "2026-08-04T00:00:00.000Z",
};

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.SOURCE_GRANT_SECRET;
  process.env.SOURCE_GRANT_SECRET = "unit-test-source-grant-secret-that-is-long-enough";
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SOURCE_GRANT_SECRET;
  else process.env.SOURCE_GRANT_SECRET = previousSecret;
});

test("source grants bind repository identity and immutable revision", () => {
  const token = issueSourceGrant(snapshot, { now: 1_000, ttlSeconds: 120 });
  const payload = verifySourceGrant(token, { now: 1_030 });

  assert.equal(payload.owner, snapshot.owner);
  assert.equal(payload.repo, snapshot.repo);
  assert.equal(payload.commitSha, snapshot.commitSha);
  assert.equal(payload.treeSha, snapshot.treeSha);
  assert.equal(payload.expiresAt, 1_120);
});

test("source grants reject tampering without exposing payload details", () => {
  const token = issueSourceGrant(snapshot, { now: 1_000 });
  const [payload, signature] = token.split(".");
  assert.throws(
    () => verifySourceGrant(`${payload}x.${signature}`, { now: 1_001 }),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_SOURCE_GRANT",
  );
});

test("source grants expire at their explicit boundary", () => {
  const token = issueSourceGrant(snapshot, { now: 1_000, ttlSeconds: 60 });
  assert.throws(
    () => verifySourceGrant(token, { now: 1_060 }),
    (error: unknown) => error instanceof ApiError && error.code === "SOURCE_GRANT_EXPIRED",
  );
});

