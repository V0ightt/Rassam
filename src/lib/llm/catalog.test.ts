import assert from "node:assert/strict";
import { test } from "vitest";

import { getAllProviderAvailability, getAllProviderMetadata, getProviderMetadata } from "./catalog";

test("bulk provider metadata does not claim live validation", async () => {
  const direct = getAllProviderMetadata();
  const compatibility = await getAllProviderAvailability();
  assert.equal(direct.length, 5);
  assert.equal(direct.every((provider) => provider.validated === false), true);
  assert.equal(direct.every((provider) => provider.capabilities.streaming), true);
  assert.deepEqual(compatibility, direct);
});

test("Ollama metadata treats its API key as optional and validates its base URL", () => {
  const metadata = getProviderMetadata("ollama", {
    OLLAMA_BASE_URL: "http://localhost:11434/v1",
  });
  assert.equal(metadata.available, true);
  assert.equal(metadata.hasApiKey, false);
  assert.equal(metadata.capabilities.apiKeyRequired, false);

  const invalid = getProviderMetadata("ollama", {
    OLLAMA_BASE_URL: "file:///tmp/ollama",
  });
  assert.equal(invalid.available, false);
  assert.match(invalid.reason || "", /HTTP or HTTPS/);
});
