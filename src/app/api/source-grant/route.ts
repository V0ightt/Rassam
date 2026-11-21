import { NextRequest, NextResponse } from "next/server";

import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { sourceGrantRefreshRequestSchema } from "@/lib/contracts";
import { parseGitHubRepositoryUrl, resolvePublicRepositoryRevision } from "@/lib/github";
import {
  emitOperationalEvent,
  outcomeForErrorCode,
  telemetryDuration,
  telemetryNow,
} from "@/lib/operational-telemetry";
import { issueSourceGrant } from "@/lib/source-grant";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const requestStartedAt = telemetryNow();
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "grant-refresh",
      session: { limit: 60, windowSeconds: 60 * 60 },
      ip: { limit: 200, windowSeconds: 24 * 60 * 60 },
      telemetry: { requestId, route: "/api/source-grant", scope: "grant-refresh" },
    });
    const input = await readJsonBody(request, sourceGrantRefreshRequestSchema);
    const coordinates = parseGitHubRepositoryUrl(input.url);
    const upstreamStartedAt = telemetryNow();
    let repository: Awaited<ReturnType<typeof resolvePublicRepositoryRevision>>;
    try {
      repository = await resolvePublicRepositoryRevision(
        coordinates.owner,
        coordinates.repo,
        input.ref,
        request.signal,
      );
      emitOperationalEvent({
        event: "upstream.completed",
        requestId,
        route: "/api/source-grant",
        upstream: "github",
        operation: "resolve-revision",
        outcome: "success",
        durationMs: telemetryDuration(upstreamStartedAt),
      });
    } catch (error) {
      const safe = toSafeApiError(error, requestId);
      emitOperationalEvent({
        event: "upstream.completed",
        requestId,
        route: "/api/source-grant",
        upstream: "github",
        operation: "resolve-revision",
        outcome: request.signal.aborted ? "cancelled" : outcomeForErrorCode(safe.body.code),
        durationMs: telemetryDuration(upstreamStartedAt),
        errorCode: safe.body.code,
      });
      throw error;
    }
    if (repository.snapshot.commitSha.toLowerCase() !== input.expectedCommitSha.toLowerCase()) {
      throw new ApiError(
        "SOURCE_REVISION_CHANGED",
        409,
        "The repository ref now points to a different commit; refresh the analysis before reading source",
      );
    }
    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/source-grant",
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
      sourceGrant: issueSourceGrant(repository.snapshot),
      snapshot: repository.snapshot,
    }, {
      status: 200,
      headers: { "x-request-id": requestId, ...rateLimitHeaders(guarded.rateLimit) },
    });
  } catch (error) {
    const safe = toSafeApiError(error, requestId);
    emitOperationalEvent({
      event: "request.completed",
      requestId,
      route: "/api/source-grant",
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
