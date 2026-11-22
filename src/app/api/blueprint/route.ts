import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deriveBlueprint } from "@/blueprint/derive";
import { serializeFileGraph } from "@/blueprint/snapshot";
import { ApiError, createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { parseLayout } from "@/lib/blueprint-client/layout";
import { githubCoordinatesSchema } from "@/lib/contracts";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";
import { verifySourceGrant } from "@/lib/source-grant";

import { analyzeRepositoryTree, assertStillPublic, cancelled, readLiveStatus } from "./snapshot";

const blueprintRequestSchema = z
  .object({
    owner: githubCoordinatesSchema.shape.owner,
    repo: githubCoordinatesSchema.shape.repo,
    commitSha: z.string().regex(/^[a-f0-9]{40}$/i, "Invalid commit SHA"),
    sourceGrant: z.string().min(32).max(4_096),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "blueprint",
      session: { limit: 30, windowSeconds: 60 * 60 },
      ip: { limit: 200, windowSeconds: 24 * 60 * 60 },
      concurrencyTtlSeconds: 2 * 60,
    });
    const input = await readJsonBody(request, blueprintRequestSchema);
    const grant = verifySourceGrant(input.sourceGrant);
    // The signed grant, not the request body, decides what is read. The body
    // must name the same snapshot so a client cannot be confused about which
    // revision a response describes.
    if (
      grant.owner.toLowerCase() !== input.owner.toLowerCase()
      || grant.repo.toLowerCase() !== input.repo.toLowerCase()
      || grant.commitSha.toLowerCase() !== input.commitSha.toLowerCase()
    ) {
      throw new ApiError("INVALID_SOURCE_GRANT", 403, "Source grant does not match the requested repository revision");
    }
    const signal = request.signal;
    const { owner, repo, commitSha, treeSha } = grant;

    await assertStillPublic(owner, repo, signal);
    // Repository content is untrusted: it is parsed, never executed.
    const analysis = await analyzeRepositoryTree(owner, repo, treeSha, signal);
    const { blueprint, blueprintText, issues, graph, reach } = analysis;
    const draft = blueprint
      ? null
      : deriveBlueprint(analysis.files, { repository: `github.com/${owner}/${repo}`, commit: commitSha });
    const layout = parseLayout(analysis.layoutText ?? undefined);
    // What is running, as reported by the repository's own CI (never probed from here).
    const status = await readLiveStatus(owner, repo, signal, analysis.statusText);

    return NextResponse.json({
      requestId,
      commitSha,
      blueprintText,
      blueprint,
      issues,
      draft,
      layout,
      graph: serializeFileGraph(graph),
      reach,
      status,
      stats: analysis.stats,
    }, {
      status: 200,
      headers: { "x-request-id": requestId, ...rateLimitHeaders(guarded.rateLimit) },
    });
  } catch (error) {
    const safe = toSafeApiError(request.signal.aborted && !(error instanceof ApiError) ? cancelled() : error, requestId);
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
