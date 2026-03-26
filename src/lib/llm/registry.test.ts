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
  assert.equal(getProviderIdFromEnv({} as NodeJS.ProcessEnv), "deepseek");
  assert.equal(getProviderIdFromEnv({ LLM_PROVIDER: "openai" } as unknown as NodeJS.ProcessEnv), "openai");
  assert.equal(getProviderIdFromEnv({ LLM_PROVIDER: "unknown" } as unknown as NodeJS.ProcessEnv), "deepseek");
});

test("getProvider returns matching adapter", () => {
  const provider = getProvider("openai");
  assert.equal(provider.id, "openai");
});
