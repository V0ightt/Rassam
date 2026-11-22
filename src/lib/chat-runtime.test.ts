import assert from "node:assert/strict";
import { test } from "vitest";

import { ApiError } from "./api-error";
import { resolveChatRuntime } from "./chat-runtime";

test("resolves only an explicitly configured provider and exact catalog model", () => {
  const result = resolveChatRuntime(
    { providerId: "openai", model: "approved-model", maxTokens: 512 },
    { NODE_ENV: "test", OPENAI_API_KEY: "sk-real-test-key", OPENAI_MODELS: "approved-model" },
  );
  assert.deepEqual(result, {
    providerId: "openai",
    model: "approved-model",
    maxTokens: 512,
  });
});

test("does not silently fall back for an unknown provider or model", () => {
  assert.throws(
    () => resolveChatRuntime({ providerId: "unknown", model: "anything" }, { NODE_ENV: "test" }),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_REQUEST",
  );
  assert.throws(
    () => resolveChatRuntime(
      { providerId: "openai", model: "not-configured" },
      { NODE_ENV: "test", OPENAI_API_KEY: "sk-real-test-key", OPENAI_MODELS: "approved-model" },
    ),
    (error: unknown) => error instanceof ApiError && error.code === "MODEL_NOT_AVAILABLE",
  );
});

test("does not make Ollama require an API key and validates its base URL", () => {
  const result = resolveChatRuntime(
    { providerId: "ollama", model: "llama3.1" },
    { NODE_ENV: "test", OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" },
  );
  assert.equal(result.providerId, "ollama");

  assert.throws(
    () => resolveChatRuntime(
      { providerId: "ollama", model: "llama3.1" },
      { NODE_ENV: "test", OLLAMA_BASE_URL: "file:///tmp/ollama" },
    ),
    (error: unknown) => error instanceof ApiError && error.code === "PROVIDER_NOT_CONFIGURED",
  );
});
