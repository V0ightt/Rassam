import { ApiError } from "./api-error";
import type { ChatRequest, SourceGrantPayload } from "./contracts";
import { verifySourceGrant } from "./source-grant";

function normalizeCanvasRepository(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com") {
      return parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").toLowerCase();
    }
  } catch {
    // Existing snapshots commonly store owner/repository rather than a URL.
  }
  return trimmed.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").toLowerCase();
}

export function validateChatSource(
  repoDetails: ChatRequest["repoDetails"],
  canvasContext?: ChatRequest["canvasContext"],
): SourceGrantPayload | null {
  if (!repoDetails) {
    if (canvasContext?.project.source === "github") {
      throw new ApiError("INVALID_SOURCE_GRANT", 401, "Pinned repository access is required");
    }
    return null;
  }
  if (!repoDetails.sourceGrant || !repoDetails.commitSha) {
    throw new ApiError("INVALID_SOURCE_GRANT", 401, "Pinned repository access is required");
  }

  const grant = verifySourceGrant(repoDetails.sourceGrant);
  const expectedRepository = `${repoDetails.owner}/${repoDetails.repo}`.toLowerCase();
  if (
    grant.owner.toLowerCase() !== repoDetails.owner.toLowerCase()
    || grant.repo.toLowerCase() !== repoDetails.repo.toLowerCase()
    || grant.commitSha.toLowerCase() !== repoDetails.commitSha.toLowerCase()
    || (repoDetails.treeSha && grant.treeSha.toLowerCase() !== repoDetails.treeSha.toLowerCase())
    || (
      canvasContext?.project.source === "github"
      && canvasContext.project.repo
      && normalizeCanvasRepository(canvasContext.project.repo) !== expectedRepository
    )
  ) {
    throw new ApiError("INVALID_SOURCE_GRANT", 401, "Source grant does not match the pinned repository revision");
  }
  return grant;
}
