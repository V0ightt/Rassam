// @vitest-environment jsdom

import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import {
  loadModelValidationStatus,
  MODEL_VALIDATION_TTL_MS,
  saveModelValidationStatus,
} from "./model-settings";

afterEach(() => localStorage.clear());

test("exact-model validation state is reusable for five minutes only", () => {
  const checkedAtMs = Date.parse("2026-08-04T10:00:00.000Z");
  saveModelValidationStatus({
    providerId: "openai",
    model: "model-a",
    validated: true,
    available: true,
    cached: false,
    checkedAt: new Date(checkedAtMs).toISOString(),
  });

  assert.equal(
    loadModelValidationStatus("openai", "model-a", checkedAtMs + MODEL_VALIDATION_TTL_MS - 1)?.validated,
    true,
  );
  assert.equal(loadModelValidationStatus("openai", "other-model", checkedAtMs), null);
  assert.equal(loadModelValidationStatus("openai", "model-a", checkedAtMs + MODEL_VALIDATION_TTL_MS + 1), null);
});
