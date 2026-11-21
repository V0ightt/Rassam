import { NextRequest, NextResponse } from "next/server";

import { createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { pinnedFileRequestSchema } from "@/lib/contracts";
import { getPinnedFile } from "@/lib/github";
import {
  emitOperationalEvent,
  outcomeForErrorCode,
  telemetryDuration,
  telemetryNow,
} from "@/lib/operational-telemetry";
import { verifySourceGrant } from "@/lib/source-grant";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const requestStartedAt = telemetryNow();
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "source-read",
      session: { limit: 300, windowSeconds: 60 * 60 },
      ip: { limit: 1_000, windowSeconds: 24 * 60 * 60 },
      telemetry: { requestId, route: "/api/files", scope: "source-read" },
    });
    const input = await readJsonBody(request, pinnedFileRequestSchema);
    const grant = verifySourceGrant(input.sourceGrant);
    const upstreamStartedAt = telemetryNow();
    let file: Awaited<ReturnType<typeof getPinnedFile>>;
    try {
      file = await getPinnedFile(grant, input.path, {
        expectedBlobSha: input.blobSha,
        maxBytes: input.maxBytes,
        signal: request.signal,
      });
      emitOperationalEvent({
        event: "upstream.completed",
        requestId,
        route: "/api/files",
        upstream: "github",
        operation: "read-blob",
        outcome: "success",
        durationMs: telemetryDuration(upstreamStartedAt),
      });
    } catch (error) {
      const safe = toSafeApiError(error, requestId);
      emitOperationalEvent({
        event: "upstream.completed",
        requestId,
        route: "/api/files",
        upstream: "github",
        operation: "read-blob",
        outcome: request.signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
        durationMs: telemetryDuration(upstreamStartedAt),
        errorCode: safe.body.code,
      });
      throw error;
    }

    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/files",
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
      path: file.path,
      content: file.content,
      blobSha: file.blobSha,
      commitSha: file.commitSha,
      size: file.size,
      binary: file.binary,
      encoding: file.encoding,
    }, {
      status: 200,
      headers: { "x-request-id": requestId, ...rateLimitHeaders(guarded.rateLimit) },
    });
  } catch (error) {
    const safe = toSafeApiError(error, requestId);
    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/files",
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
        "x-request-id": requestId,
        ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
      },
    });
  } finally {
    await guarded?.release().catch(() => undefined);
  }
}
