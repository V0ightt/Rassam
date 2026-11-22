import assert from "node:assert/strict";
import { test } from "vitest";
import { NextRequest } from "next/server";

import { ApiError } from "./api-error";
import { parseJsonText, readJsonBody } from "./api-request";
import { MAX_API_BODY_BYTES, modelValidationRequestSchema } from "./contracts";

test("request validation returns the parsed, trimmed payload", () => {
  const parsed = parseJsonText('{"providerId":" openai ","model":"approved-model"}', modelValidationRequestSchema);
  assert.deepEqual(parsed, { providerId: "openai", model: "approved-model" });
});

test("request validation rejects missing and unknown fields", () => {
  for (const body of ['{"providerId":"openai"}', '{"providerId":"openai","model":"approved-model","admin":true}']) {
    assert.throws(
      () => parseJsonText(body, modelValidationRequestSchema),
      (error: unknown) => error instanceof ApiError && error.code === "INVALID_REQUEST",
    );
  }
});

test("invalid JSON is returned as a safe request error", () => {
  assert.throws(
    () => parseJsonText("{", modelValidationRequestSchema),
    (error: unknown) => error instanceof ApiError
      && error.code === "INVALID_REQUEST"
      && !error.message.includes("position"),
  );
});

test("streamed bodies are stopped at the 2 MiB limit", async () => {
  const request = new NextRequest("http://localhost/api/settings/models", {
    method: "POST",
    body: "x".repeat(MAX_API_BODY_BYTES + 1),
  });
  await assert.rejects(
    readJsonBody(request, modelValidationRequestSchema),
    (error: unknown) => error instanceof ApiError && error.code === "REQUEST_TOO_LARGE",
  );
});
