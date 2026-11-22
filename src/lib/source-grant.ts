import { createHmac, timingSafeEqual } from "node:crypto";

import { ApiError } from "./api-error";
import { sourceGrantPayloadSchema, type RepositorySnapshot, type SourceGrantPayload } from "./contracts";

const DEVELOPMENT_SECRET = "rassam-development-only-source-grant-secret";
const DEFAULT_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const configured = process.env.SOURCE_GRANT_SECRET?.trim();
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      "SOURCE_GRANT_CONFIGURATION",
      503,
      "Pinned source access is not configured",
      false,
    );
  }
  return DEVELOPMENT_SECRET;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

export function issueSourceGrant(
  snapshot: RepositorySnapshot,
  options: { now?: number; ttlSeconds?: number } = {},
): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.min(60 * 60, Math.max(60, options.ttlSeconds ?? DEFAULT_TTL_SECONDS));
  const payload: SourceGrantPayload = {
    version: 1,
    owner: snapshot.owner,
    repo: snapshot.repo,
    commitSha: snapshot.commitSha,
    treeSha: snapshot.treeSha,
    issuedAt: now,
    expiresAt: now + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySourceGrant(token: string, options: { now?: number } = {}): SourceGrantPayload {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) {
    throw new ApiError("INVALID_SOURCE_GRANT", 401, "Source grant is invalid");
  }

  const expectedSignature = sign(encodedPayload);
  const expected = Buffer.from(expectedSignature, "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ApiError("INVALID_SOURCE_GRANT", 401, "Source grant is invalid");
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new ApiError("INVALID_SOURCE_GRANT", 401, "Source grant is invalid");
  }
  const parsed = sourceGrantPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ApiError("INVALID_SOURCE_GRANT", 401, "Source grant is invalid");
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (parsed.data.issuedAt > now + 60 || parsed.data.expiresAt <= now) {
    throw new ApiError("SOURCE_GRANT_EXPIRED", 401, "Source grant has expired");
  }
  return parsed.data;
}

