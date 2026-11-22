import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limiterState = vi.hoisted(() => ({
  durable: true,
  ping: true,
  publicProfile: false,
}));

vi.mock("@/lib/request-security", () => ({
  getRateLimitStore: () => ({
    durable: limiterState.durable,
    ping: async () => limiterState.ping,
  }),
  isPublicProductionProfile: () => limiterState.publicProfile,
}));

import { GET } from "./route";

describe("readiness route", () => {
  beforeEach(() => {
    limiterState.durable = true;
    limiterState.ping = true;
    limiterState.publicProfile = false;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports schema, static provider metadata, and limiter readiness without provider calls", async () => {
    const requestId = "00000000-0000-4000-8000-000000000011";
    const response = await GET(new NextRequest("http://localhost/api/readiness", {
      headers: { "x-request-id": requestId },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.status).toBe("ready");
    expect(payload.projectSchemaVersion).toBe(2);
    expect(payload.streamProtocolVersion).toBe(2);
    expect(payload.checks.schemaVersions.ready).toBe(true);
    expect(payload.checks.providerCatalog.ready).toBe(true);
    expect(payload.providers.length).toBeGreaterThan(0);
    expect(payload.providers[0]).not.toHaveProperty("envKey");
  });

  it("fails closed when the public profile has no durable limiter", async () => {
    limiterState.publicProfile = true;
    limiterState.durable = false;

    const response = await GET(new NextRequest("https://rassam.example/api/readiness"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe("not-ready");
    expect(payload.checks.rateLimitStore).toEqual({
      ready: false,
      reason: "development-only memory store",
    });
  });
});
