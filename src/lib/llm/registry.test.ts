import assert from "node:assert/strict";
import { test } from "node:test";
import { getProvider, getProviderIdFromEnv, normalizeProviderId } from "./registry";

test("normalizeProviderId handles known values", () => {
  assert.equal(normalizeProviderId("OpenAI"), "openai");
  assert.equal(normalizeProviderId("DeepSeek"), "deepseek");
  assert.equal(normalizeProviderId("Anthropic"), "anthropic");
  assert.equal(normalizeProviderId("Google"), "google");
  assert.equal(normalizeProviderId("Ollama"), "ollama");
  assert.equal(normalizeProviderId(""), null);
});

test("getProviderIdFromEnv falls back to deepseek", () => {
  assert.equal(getProviderIdFromEnv({}), "deepseek");
  assert.equal(getProviderIdFromEnv({ LLM_PROVIDER: "openai" }), "openai");
  assert.equal(getProviderIdFromEnv({ LLM_PROVIDER: "unknown" }), "deepseek");
});

test("getProvider returns matching adapter", () => {
  const provider = getProvider("openai");
  assert.equal(provider.id, "openai");
});
