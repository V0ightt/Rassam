// Shared request plumbing for the blueprint browser clients: one error type,
// the server's JSON error envelope, friendly messages by code.

import { BlueprintApiError } from "./api";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === "AbortError");
}

export interface JsonRequestOptions {
  method: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  /** Friendly messages by server error code. */
  messages: Record<string, string>;
  /** Used when the server gives no message, e.g. "The change request failed". */
  fallback: string;
}

export function invalidResponse(requestId?: string): BlueprintApiError {
  return new BlueprintApiError("The server returned an unexpected response.", "INVALID_RESPONSE", 502, true, requestId);
}

/** Fetch JSON; throws `BlueprintApiError` for network, HTTP and shape errors, rethrows aborts. */
export async function requestJson(url: string, options: JsonRequestOptions): Promise<{ body: Record<string, unknown>; requestId?: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      ...(options.body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }
        : {}),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
    throw new BlueprintApiError("Could not reach the server. Check your connection and try again.", "NETWORK_ERROR", 0, true);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbort(error, options.signal)) throw error;
  }
  const requestId = isRecord(body) && typeof body.requestId === "string" ? body.requestId : response.headers.get("x-request-id") ?? undefined;

  if (!response.ok) {
    const code = isRecord(body) && typeof body.code === "string" ? body.code : "HTTP_ERROR";
    const serverMessage = isRecord(body) && typeof body.message === "string" ? body.message : "";
    const message = options.messages[code] ?? (serverMessage || `${options.fallback} (HTTP ${response.status}).`);
    const retryable = isRecord(body) && typeof body.retryable === "boolean" ? body.retryable : response.status >= 500;
    throw new BlueprintApiError(message, code, response.status, retryable, requestId);
  }
  if (!isRecord(body)) throw invalidResponse(requestId);
  return { body, requestId };
}
