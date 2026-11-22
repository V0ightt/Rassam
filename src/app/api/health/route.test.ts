import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("health route", () => {
  it("returns a no-store liveness response with a validated request id", async () => {
    const requestId = "00000000-0000-4000-8000-000000000010";
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await GET(new NextRequest("http://localhost/api/health", {
      headers: { "x-request-id": requestId },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(payload).toMatchObject({ status: "ok", requestId });
    expect(JSON.stringify(payload)).not.toMatch(/secret|token|repository/i);
    log.mockRestore();
  });
});
