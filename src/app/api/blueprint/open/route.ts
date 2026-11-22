import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createRequestId, toSafeApiError } from "@/lib/api-error";
import { readJsonBody } from "@/lib/api-request";
import { parseGitHubRepositoryUrl, resolvePublicRepositoryRevision } from "@/lib/github";
import { guardApiRequest, rateLimitHeaders, type GuardedRequest } from "@/lib/request-security";
import { issueSourceGrant } from "@/lib/source-grant";

// Opens a public GitHub repository for the Studio without creating a legacy
// project: resolves the repository and commit, then issues the short-lived
// source grant that POST /api/blueprint requires. No repository content is
// read here. The Studio calls it again with a commit sha when it follows the
// repository to a newer commit.

const openRequestSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    ref: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  let guarded: GuardedRequest | undefined;
  try {
    guarded = await guardApiRequest(request, {
      scope: "blueprint-open",
      session: { limit: 120, windowSeconds: 60 * 60 },
      ip: { limit: 600, windowSeconds: 24 * 60 * 60 },
    });
    const input = await readJsonBody(request, openRequestSchema);
    const coordinates = parseGitHubRepositoryUrl(input.url);
    const repository = await resolvePublicRepositoryRevision(coordinates.owner, coordinates.repo, input.ref, request.signal);
    const { snapshot } = repository;
    return NextResponse.json({
      requestId,
      owner: snapshot.owner,
      repo: snapshot.repo,
      commitSha: snapshot.commitSha,
      defaultBranch: snapshot.defaultBranch,
      sourceGrant: issueSourceGrant(snapshot),
    }, {
      status: 200,
      headers: { "x-request-id": requestId, "cache-control": "no-store", ...rateLimitHeaders(guarded.rateLimit) },
    });
  } catch (error) {
    const safe = toSafeApiError(error, requestId);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: {
        "x-request-id": requestId,
        "cache-control": "no-store",
        ...(guarded ? rateLimitHeaders(guarded.rateLimit) : {}),
      },
    });
  } finally {
    await guarded?.release().catch(() => undefined);
  }
}
