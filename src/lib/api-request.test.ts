import assert from "node:assert/strict";
import { test } from "vitest";
import { NextRequest } from "next/server";

import { ApiError } from "./api-error";
import { parseJsonText, readJsonBody } from "./api-request";
import { MAX_API_BODY_BYTES, pinnedFileRequestSchema, repositoryAnalysisRequestSchema } from "./contracts";

test("repository request validation applies stable defaults", () => {
  const parsed = parseJsonText('{"url":"https://github.com/openai/example"}', repositoryAnalysisRequestSchema);
  assert.equal(parsed.layout, "TB");
  assert.equal(parsed.enrichWithAi, false);
});

test("AI enrichment requires an exact provider/model/settings tuple", () => {
  assert.throws(
    () => parseJsonText(
      '{"url":"https://github.com/openai/example","enrichWithAi":true}',
      repositoryAnalysisRequestSchema,
    ),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_REQUEST",
  );

  const parsed = parseJsonText(JSON.stringify({
    url: "https://github.com/openai/example",
    enrichWithAi: true,
    modelSettings: {
      providerId: "openai",
      model: "approved-model",
      maxTokens: 2_000,
      temperature: 0.2,
    },
  }), repositoryAnalysisRequestSchema);
  assert.deepEqual(parsed.modelSettings, {
    providerId: "openai",
    model: "approved-model",
    maxTokens: 2_000,
    temperature: 0.2,
  });
});

test("deterministic-only requests reject stray provider settings", () => {
  assert.throws(
    () => parseJsonText(JSON.stringify({
      url: "https://github.com/openai/example",
      modelSettings: {
        providerId: "openai",
        model: "approved-model",
        maxTokens: 2_000,
        temperature: 0.2,
      },
    }), repositoryAnalysisRequestSchema),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_REQUEST",
  );
});

test("repository request validation rejects unknown fields", () => {
  assert.throws(
    () => parseJsonText('{"url":"https://github.com/openai/example","admin":true}', repositoryAnalysisRequestSchema),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_REQUEST",
  );
});

test("pinned file requests require a source grant rather than repository coordinates", () => {
  assert.throws(
    () => parseJsonText('{"owner":"openai","repo":"example","path":"README.md"}', pinnedFileRequestSchema),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_REQUEST",
  );
});

test("invalid JSON is returned as a safe request error", () => {
  assert.throws(
    () => parseJsonText("{", repositoryAnalysisRequestSchema),
    (error: unknown) => error instanceof ApiError
      && error.code === "INVALID_REQUEST"
      && !error.message.includes("position"),
  );
});

test("streamed bodies are stopped at the 2 MiB limit", async () => {
  const request = new NextRequest("http://localhost/api/repo", {
    method: "POST",
    body: "x".repeat(MAX_API_BODY_BYTES + 1),
  });
  await assert.rejects(
    readJsonBody(request, repositoryAnalysisRequestSchema),
    (error: unknown) => error instanceof ApiError && error.code === "REQUEST_TOO_LARGE",
  );
});
