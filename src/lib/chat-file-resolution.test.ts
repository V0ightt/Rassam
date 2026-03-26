import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAvailableFilePath } from "./chat-file-resolution";

const files = [
  "src/app/page.tsx",
  "pages/iraq-ascii.html",
  "examples/iraq-ascii.html",
];

test("resolveAvailableFilePath resolves exact path matches", () => {
  const result = resolveAvailableFilePath("src/app/page.tsx", files);

  assert.equal(result.status, "resolved");
  assert.equal(result.resolutionStrategy, "exact");
  assert.equal(result.resolvedPath, "src/app/page.tsx");
});

test("resolveAvailableFilePath resolves unique basenames", () => {
  const result = resolveAvailableFilePath("page.tsx", files);

  assert.equal(result.status, "resolved");
  assert.equal(result.resolutionStrategy, "basename");
  assert.equal(result.resolvedPath, "src/app/page.tsx");
});

test("resolveAvailableFilePath reports ambiguous basename matches", () => {
  const result = resolveAvailableFilePath("iraq-ascii.html", files);

  assert.equal(result.status, "ambiguous");
  assert.equal(result.resolutionStrategy, "ambiguous");
  assert.deepEqual(result.candidates, [
    "pages/iraq-ascii.html",
    "examples/iraq-ascii.html",
  ]);
});

test("resolveAvailableFilePath reports missing files without guessing", () => {
  const result = resolveAvailableFilePath("missing-file.ts", files);

  assert.equal(result.status, "missing");
  assert.equal(result.resolutionStrategy, "missing");
});
