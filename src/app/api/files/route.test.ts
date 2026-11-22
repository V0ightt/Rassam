import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  sentinel: "SENSITIVE_SOURCE_SENTINEL_7345",
}));

vi.mock("@/lib/request-security", () => ({
  guardApiRequest: vi.fn(async () => ({
    sessionId: "test-session",
    rateLimit: { limit: 300, remaining: 299, resetAt: Date.now() + 60_000 },
    release: vi.fn(async () => undefined),
  })),
  rateLimitHeaders: () => ({}),
}));

vi.mock("@/lib/source-grant", () => ({
  verifySourceGrant: () => ({
    owner: "fixture-owner",
    repo: "fixture-repository",
    commitSha: "a".repeat(40),
  }),
}));

vi.mock("@/lib/github", () => ({
  getPinnedFile: vi.fn(async () => ({
    path: `src/${fixtures.sentinel}.ts`,
    content: `export const secret = '${fixtures.sentinel}';`,
    blobSha: "b".repeat(40),
    commitSha: "a".repeat(40),
    size: 64,
    binary: false,
    encoding: "utf-8",
  })),
}));

import { POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pinned file route telemetry", () => {
  it("never copies returned paths or source text into operational events", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "info").mockImplementation((value) => logged.push(String(value)));

    const response = await POST(new NextRequest("http://localhost/api/files", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "00000000-0000-4000-8000-000000000012",
      },
      body: JSON.stringify({
        sourceGrant: "g".repeat(32),
        path: `src/${fixtures.sentinel}.ts`,
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.content).toContain(fixtures.sentinel);
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("\n")).not.toContain(fixtures.sentinel);
    expect(logged.join("\n")).not.toContain("fixture-owner");
    expect(logged.join("\n")).not.toContain("fixture-repository");
  });
});
