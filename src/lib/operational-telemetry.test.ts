import { describe, expect, it } from "vitest";

import { createRequestId } from "@/lib/api-error";
import {
  emitOperationalEvent,
  normalizeTelemetryFinishReason,
  operationalEventInputSchema,
  outcomeForErrorCode,
  type OperationalEventInput,
  type OperationalEventRecord,
} from "@/lib/operational-telemetry";

function compileTimePrivacyBoundary() {
  // The event union has no escape hatch for arbitrary or content-bearing data.
  const forbidden: OperationalEventInput = {
    event: "request.completed",
    requestId: "00000000-0000-4000-8000-000000000001",
    route: "/api/chat",
    method: "POST",
    status: 200,
    outcome: "success",
    durationMs: 12,
    // @ts-expect-error chat text is forbidden by the telemetry contract
    chatText: "do not record me",
  };
  return forbidden;
}

void compileTimePrivacyBoundary;

describe("operational telemetry privacy boundary", () => {
  it("emits only allow-listed aggregate fields", () => {
    const records: OperationalEventRecord[] = [];
    const emitted = emitOperationalEvent({
      event: "upstream.completed",
      requestId: "00000000-0000-4000-8000-000000000001",
      route: "/api/chat",
      upstream: "openai",
      operation: "chat",
      outcome: "success",
      durationMs: 240.5,
      providerId: "openai",
      modelId: "gpt-5.4-mini",
      usageReported: true,
      inputTokens: 120,
      outputTokens: 45,
      finishReason: "stop",
      eventCount: 8,
    }, (record) => records.push(record), () => new Date("2026-08-04T00:00:00.000Z"));

    expect(emitted).toBe(true);
    expect(records).toEqual([{
      telemetrySchemaVersion: 1,
      service: "rassam",
      emittedAt: "2026-08-04T00:00:00.000Z",
      data: expect.objectContaining({
        event: "upstream.completed",
        providerId: "openai",
        inputTokens: 120,
        outputTokens: 45,
      }),
    }]);
  });

  it("rejects unknown content fields without invoking the sink", () => {
    const sentinel = "SENSITIVE_CHAT_AND_SOURCE_SENTINEL";
    const serialized: string[] = [];
    const unsafe = {
      event: "request.completed",
      requestId: "00000000-0000-4000-8000-000000000001",
      route: "/api/chat",
      method: "POST",
      status: 200,
      outcome: "success",
      durationMs: 12,
      chatText: sentinel,
      sourceContent: sentinel,
      repositoryUrl: `https://github.com/${sentinel}`,
      filePath: `${sentinel}.ts`,
    } as unknown as OperationalEventInput;

    expect(operationalEventInputSchema.safeParse(unsafe).success).toBe(false);
    expect(emitOperationalEvent(unsafe, (record) => serialized.push(JSON.stringify(record)))).toBe(false);
    expect(serialized.join("\n")).not.toContain(sentinel);
    expect(serialized).toHaveLength(0);
  });

  it("rejects URL-shaped model identifiers and never propagates sink failures", () => {
    const invalidModel = {
      event: "upstream.completed",
      requestId: "00000000-0000-4000-8000-000000000001",
      route: "/api/chat",
      upstream: "openai",
      operation: "chat",
      outcome: "success",
      durationMs: 1,
      providerId: "openai",
      modelId: "https://github.com/owner/repository",
    } as unknown as OperationalEventInput;
    expect(emitOperationalEvent(invalidModel, () => undefined)).toBe(false);

    expect(emitOperationalEvent({
      event: "request.completed",
      requestId: "00000000-0000-4000-8000-000000000001",
      route: "/api/health",
      method: "GET",
      status: 200,
      outcome: "success",
      durationMs: 1,
    }, () => {
      throw new Error("telemetry backend unavailable");
    })).toBe(false);
  });

  it("maps safe error codes to bounded outcomes", () => {
    expect(outcomeForErrorCode("RATE_LIMITED")).toBe("quota-rejected");
    expect(outcomeForErrorCode("CAPACITY_EXCEEDED")).toBe("capacity-rejected");
    expect(outcomeForErrorCode("GITHUB_UNAVAILABLE")).toBe("unavailable");
    expect(outcomeForErrorCode("SOURCE_REVISION_CHANGED")).toBe("conflict");
    expect(outcomeForErrorCode("INTERNAL_ERROR")).toBe("error");
    expect(normalizeTelemetryFinishReason("end_turn")).toBe("stop");
    expect(normalizeTelemetryFinishReason("max_tokens")).toBe("length");
    expect(normalizeTelemetryFinishReason("provider-specific-value")).toBe("unknown");
  });

  it("does not accept user content as a correlation identifier", () => {
    const contentBearingId = "SENSITIVE_SOURCE_SENTINEL_7345.ts";
    const generated = createRequestId(contentBearingId);
    expect(generated).not.toBe(contentBearingId);
    expect(generated).toMatch(/^[0-9a-f-]{36}$/i);

    const traceId = "0123456789abcdef0123456789abcdef";
    expect(createRequestId(traceId)).toBe(traceId);
  });
});
