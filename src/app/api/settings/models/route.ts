import { NextRequest, NextResponse } from "next/server";

import { createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { modelValidationRequestSchema } from "@/lib/contracts";
import { resolveChatRuntime } from "@/lib/chat-runtime";
import {
  getAllProviderMetadata,
  getProviderLabel,
  validateProviderConnection,
} from "@/lib/llm/catalog";
import {
  emitOperationalEvent,
  normalizeTelemetryFinishReason,
  outcomeForErrorCode,
  telemetryDuration,
  telemetryNow,
} from "@/lib/operational-telemetry";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";
import type { LLMUsageMetadata } from "@/lib/llm/types";

const VALIDATION_CACHE_MS = 5 * 60 * 1_000;
const validationCache = new Map<string, {
  expiresAt: number;
  result: { ok: boolean; reason?: string };
}>();

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const startedAt = telemetryNow();
  // Configuration/catalog metadata only. This endpoint is safe to load on
  // every Settings or chat mount because it never calls a model provider.
  const response = NextResponse.json({
    providers: getAllProviderMetadata(),
    checkedAt: new Date().toISOString(),
    validationMode: "explicit",
    validationCacheTtlSeconds: VALIDATION_CACHE_MS / 1_000,
  }, {
    headers: { "Cache-Control": "private, max-age=60", "X-Request-Id": requestId },
  });
  emitOperationalEvent({
    event: "request.completed",
    requestId,
    route: "/api/settings/models",
    method: "GET",
    status: 200,
    outcome: "success",
    durationMs: telemetryDuration(startedAt),
  });
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const requestStartedAt = telemetryNow();
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "model-validation",
      session: { limit: 10, windowSeconds: 60 * 60 },
      ip: { limit: 30, windowSeconds: 24 * 60 * 60 },
      concurrencyTtlSeconds: 15,
      telemetry: { requestId, route: "/api/settings/models", scope: "model-validation" },
    });
    const input = await readJsonBody(request, modelValidationRequestSchema);
    const runtime = resolveChatRuntime({ providerId: input.providerId, model: input.model });
    const cacheKey = `${runtime.providerId}:${runtime.model}`;
    const cached = validationCache.get(cacheKey);
    let result: { ok: boolean; reason?: string };
    let cachedResult = false;
    if (cached && cached.expiresAt > Date.now()) {
      result = cached.result;
      cachedResult = true;
    } else {
      const upstreamStartedAt = telemetryNow();
      const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; finishReason?: string } = {};
      const collectUsage = (metadata: LLMUsageMetadata) => {
        if (metadata.inputTokens !== undefined) usage.inputTokens = metadata.inputTokens;
        if (metadata.outputTokens !== undefined) usage.outputTokens = metadata.outputTokens;
        if (metadata.totalTokens !== undefined) usage.totalTokens = metadata.totalTokens;
        if (metadata.finishReason) usage.finishReason = metadata.finishReason;
      };
      try {
        result = await validateProviderConnection(runtime.providerId, runtime.model, request.signal, collectUsage);
        const usageReported = usage.inputTokens !== undefined
          || usage.outputTokens !== undefined
          || usage.totalTokens !== undefined;
        emitOperationalEvent({
          event: "upstream.completed",
          requestId,
          route: "/api/settings/models",
          upstream: runtime.providerId,
          operation: "model-validation",
          outcome: result.ok ? "success" : "unavailable",
          durationMs: telemetryDuration(upstreamStartedAt),
          providerId: runtime.providerId,
          modelId: runtime.model,
          usageReported,
          ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
          ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
          ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
          finishReason: result.ok ? normalizeTelemetryFinishReason(usage.finishReason) : "error",
        });
      } catch (error) {
        const safe = toSafeApiError(error, requestId);
        emitOperationalEvent({
          event: "upstream.completed",
          requestId,
          route: "/api/settings/models",
          upstream: runtime.providerId,
          operation: "model-validation",
          outcome: request.signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
          durationMs: telemetryDuration(upstreamStartedAt),
          providerId: runtime.providerId,
          modelId: runtime.model,
          errorCode: safe.body.code,
          usageReported: false,
          finishReason: request.signal.aborted ? "cancelled" : "error",
        });
        throw error;
      }
      validationCache.set(cacheKey, { expiresAt: Date.now() + VALIDATION_CACHE_MS, result });
    }

    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/settings/models",
      method: "POST",
      status: 200,
      outcome: "success",
      durationMs: telemetryDuration(requestStartedAt),
      quotaLimit: guarded.rateLimit.limit,
      quotaRemaining: guarded.rateLimit.remaining,
      quotaResetAt: guarded.rateLimit.resetAt,
    });

    return NextResponse.json({
      requestId,
      providerId: runtime.providerId,
      providerLabel: getProviderLabel(runtime.providerId),
      model: runtime.model,
      validated: result.ok,
      available: result.ok,
      reason: result.reason,
      cached: cachedResult,
      checkedAt: new Date().toISOString(),
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...rateLimitHeaders(guarded.rateLimit),
      },
    });
  } catch (error) {
    const safe = toSafeApiError(error, requestId);
    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/settings/models",
      method: "POST",
      status: safe.status,
      outcome: request.signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
      durationMs: telemetryDuration(requestStartedAt),
      errorCode: safe.body.code,
      retryable: safe.body.retryable,
      ...(guarded ? {
        quotaLimit: guarded.rateLimit.limit,
        quotaRemaining: guarded.rateLimit.remaining,
        quotaResetAt: guarded.rateLimit.resetAt,
      } : {}),
    });
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: {
        "X-Request-Id": requestId,
        ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
      },
    });
  } finally {
    await guarded?.release().catch(() => undefined);
  }
}
