import { randomUUID } from "node:crypto";

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "REQUEST_TOO_LARGE"
  | "INVALID_GITHUB_URL"
  | "REPOSITORY_NOT_FOUND"
  | "REPOSITORY_PRIVATE"
  | "REPOSITORY_TOO_LARGE"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_UNAVAILABLE"
  | "REF_NOT_FOUND"
  | "TREE_INCOMPLETE"
  | "INVALID_SOURCE_GRANT"
  | "SOURCE_GRANT_EXPIRED"
  | "SOURCE_GRANT_CONFIGURATION"
  | "SOURCE_REVISION_CHANGED"
  | "SESSION_REQUIRED"
  | "SESSION_CONFIG_INVALID"
  | "ORIGIN_REQUIRED"
  | "ORIGIN_REJECTED"
  | "RATE_LIMITED"
  | "RATE_LIMIT_STORE_UNAVAILABLE"
  | "CAPACITY_EXCEEDED"
  | "REQUEST_IN_PROGRESS"
  | "REQUEST_CANCELLED"
  | "INVALID_FILE_PATH"
  | "FILE_NOT_FOUND"
  | "FILE_REVISION_MISMATCH"
  | "FILE_TOO_LARGE"
  | "FILE_BINARY"
  | "ANALYSIS_FAILED"
  | "CANVAS_PATCH_INVALID"
  | "CANVAS_PATCH_AMBIGUOUS"
  | "CANVAS_REVISION_CONFLICT"
  | "PROVIDER_NOT_CONFIGURED"
  | "MODEL_NOT_AVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface SafeApiError {
  error: string;
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  details?: Record<string, unknown>;
}

export function createRequestId(candidate?: string | null): string {
  // Only accept opaque UUID/trace identifiers from intermediaries. Allowing an
  // arbitrary client string here would create a covert path for user content
  // to enter otherwise content-free logs through the correlation field.
  const normalized = candidate?.trim();
  if (normalized && (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    || /^[0-9a-f]{32}$/i.test(normalized)
  )) return normalized.toLowerCase();
  return randomUUID();
}

export function toSafeApiError(error: unknown, requestId: string): { status: number; body: SafeApiError } {
  const safe = error instanceof ApiError
    ? error
    : new ApiError("INTERNAL_ERROR", 500, "An unexpected server error occurred", true);

  return {
    status: safe.status,
    body: {
      // `error` remains for compatibility with the current frontend.
      error: safe.message,
      code: safe.code,
      message: safe.message,
      retryable: safe.retryable,
      requestId,
      ...(safe.details ? { details: safe.details } : {}),
    },
  };
}
