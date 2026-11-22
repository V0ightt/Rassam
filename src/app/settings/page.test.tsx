// @vitest-environment jsdom

import assert from "node:assert/strict";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, test, vi } from "vitest";
import { axe } from "vitest-axe";

import SettingsPage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
}));

const providerResponse = {
  providers: [{
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    models: ["model-a", "model-b"],
    hasApiKey: true,
    validated: false,
    available: true,
    capabilities: {
      streaming: true,
      structuredOutput: true,
      nativeToolCalling: false,
      modelListing: false,
      apiKeyRequired: true,
      usageMetadata: false,
      finishMetadata: false,
      maxOutputTokens: 8192,
    },
  }],
  checkedAt: "2026-08-04T10:00:00.000Z",
  validationMode: "explicit",
  validationCacheTtlSeconds: 300,
};

beforeEach(() => {
  localStorage.clear();
  const checkedAt = new Date().toISOString();
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({
        providerId: "openai",
        model: "model-a",
        validated: true,
        available: true,
        cached: false,
        checkedAt,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(providerResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("loads static metadata without a model test, then validates only the explicit default", async () => {
  const user = userEvent.setup();
  const { container } = render(<SettingsPage />);

  await screen.findByRole("heading", { name: "OpenAI" });
  const fetchMock = vi.mocked(fetch);
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(fetchMock.mock.calls[0][1]?.method, undefined);

  await user.selectOptions(screen.getByRole("combobox", { name: "Default provider" }), "openai");
  await user.selectOptions(screen.getByRole("combobox", { name: "Default model" }), "model-a");
  await user.click(screen.getByRole("button", { name: "Test model" }));

  await screen.findByText(/Live test passed/);
  assert.equal(fetchMock.mock.calls.length, 2);
  const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  assert.deepEqual(request, { providerId: "openai", model: "model-a" });

  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem("repoAgent_modelSettings") || "{}");
    assert.equal(saved.selectedProvider, "openai");
    assert.equal(saved.selectedModel, "model-a");
  });

  const accessibility = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  assert.equal(accessibility.violations.length, 0, accessibility.violations.map((item) => item.id).join(", "));
});
