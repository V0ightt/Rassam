import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/request-security")>();
  return {
    ...actual,
    guardApiRequest: vi.fn(async () => ({
      sessionId: "test-session",
      rateLimit: { limit: 10, remaining: 9, resetAt: Date.now() + 60_000 },
      release: vi.fn(async () => undefined),
    })),
    rateLimitHeaders: vi.fn(() => ({})),
  };
});

vi.mock("@/lib/llm/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/catalog")>();
  return {
    ...actual,
    validateProviderConnection: vi.fn(async () => ({ ok: true })),
  };
});

import { validateProviderConnection } from "@/lib/llm/catalog";
import { GET, POST } from "./route";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-live-route-validation-123456789";
  vi.mocked(validateProviderConnection).mockClear();
});

afterEach(() => {
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
});

test("GET returns static capability metadata without validating a model", async () => {
  const response = await GET(new NextRequest("http://localhost/api/settings/models"));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.validationMode, "explicit");
  assert.equal(payload.validationCacheTtlSeconds, 300);
  assert.equal(payload.providers.every((provider: { validated: boolean }) => provider.validated === false), true);
  assert.equal(vi.mocked(validateProviderConnection).mock.calls.length, 0);
});

test("POST validates only the exact selected provider and model", async () => {
  const request = new NextRequest("http://localhost/api/settings/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId: "openai", model: "gpt-5.4-mini" }),
  });

  const response = await POST(request);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.providerId, "openai");
  assert.equal(payload.model, "gpt-5.4-mini");
  assert.equal(payload.validated, true);
  assert.equal(vi.mocked(validateProviderConnection).mock.calls.length, 1);
  assert.equal(vi.mocked(validateProviderConnection).mock.calls[0][0], "openai");
  assert.equal(vi.mocked(validateProviderConnection).mock.calls[0][1], "gpt-5.4-mini");
});
