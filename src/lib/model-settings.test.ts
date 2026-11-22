import assert from "node:assert/strict";
import { test } from "vitest";

import type { ModelSettings, ProviderStatusResponse } from "./model-settings";
import { sanitizeModelSettings } from "./model-settings";

const providers: ProviderStatusResponse = {
  checkedAt: "2026-01-01T00:00:00.000Z",
  providers: [
    {
      id: "openai",
      label: "OpenAI",
      envKey: "OPENAI_API_KEY",
      models: ["selected-model", "other-model"],
      hasApiKey: true,
      validated: false,
      available: true,
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      envKey: "DEEPSEEK_API_KEY",
      models: ["fallback-model"],
      hasApiKey: true,
      validated: false,
      available: true,
    },
  ],
};

function settings(overrides: Partial<ModelSettings>): ModelSettings {
  return {
    enabledModels: { openai: ["selected-model"], deepseek: ["fallback-model"] },
    selectedProvider: "openai",
    selectedModel: "selected-model",
    maxOutputTokens: 2_000,
    temperature: 0.7,
    ...overrides,
  };
}

test("model settings retain an exact valid selection", () => {
  const result = sanitizeModelSettings(settings({ enabledModels: {} }), providers);
  assert.equal(result.selectedProvider, "openai");
  assert.equal(result.selectedModel, "selected-model");
  assert.deepEqual(result.enabledModels.openai, ["selected-model"]);
});

test("model settings never silently switch provider or model", () => {
  const result = sanitizeModelSettings(settings({ selectedModel: "removed-model" }), providers);
  assert.equal(result.selectedProvider, "openai");
  assert.equal(result.selectedModel, null);
  assert.equal(result.enabledModels.deepseek?.includes("fallback-model"), true);
});

test("an explicit provider selection survives until the user chooses its model", () => {
  const result = sanitizeModelSettings(settings({ selectedModel: null }), providers);
  assert.equal(result.selectedProvider, "openai");
  assert.equal(result.selectedModel, null);
});
