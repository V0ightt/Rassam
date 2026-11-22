import type { NextRequest } from "next/server";
import type { ZodType } from "zod";

import { ApiError } from "./api-error";
import { MAX_API_BODY_BYTES } from "./contracts";

function summarizeIssues(issues: Array<{ path: PropertyKey[]; message: string }>): Array<{ path: string; message: string }> {
  return issues.slice(0, 10).map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function parseJsonText<T>(text: string, schema: ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_REQUEST", 400, "Request body must be valid JSON");
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError("INVALID_REQUEST", 400, "Request body failed validation", false, {
      issues: summarizeIssues(parsed.error.issues),
    });
  }
  return parsed.data;
}

export async function readJsonBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_API_BODY_BYTES) {
    throw new ApiError("REQUEST_TOO_LARGE", 413, "Request body exceeds the 2 MiB limit");
  }

  if (!request.body) return parseJsonText("", schema);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_API_BODY_BYTES) {
        await reader.cancel("request body limit exceeded");
        throw new ApiError("REQUEST_TOO_LARGE", 413, "Request body exceeds the 2 MiB limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return parseJsonText(Buffer.concat(chunks, bytes).toString("utf8"), schema);
}
