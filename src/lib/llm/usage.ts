import type { ChatInput, LLMUsageMetadata } from "./types";

function boundedTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function boundedFinishReason(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value)
    ? value
    : undefined;
}

/** Reports provider aggregates without ever forwarding message content. */
export function reportLlmUsage(
  input: Pick<ChatInput, "onUsage">,
  metadata: LLMUsageMetadata,
): void {
  if (!input.onUsage) return;
  const safe: LLMUsageMetadata = {
    ...(boundedTokenCount(metadata.inputTokens) !== undefined ? { inputTokens: boundedTokenCount(metadata.inputTokens) } : {}),
    ...(boundedTokenCount(metadata.outputTokens) !== undefined ? { outputTokens: boundedTokenCount(metadata.outputTokens) } : {}),
    ...(boundedTokenCount(metadata.totalTokens) !== undefined ? { totalTokens: boundedTokenCount(metadata.totalTokens) } : {}),
    ...(boundedFinishReason(metadata.finishReason) ? { finishReason: boundedFinishReason(metadata.finishReason) } : {}),
  };
  if (Object.keys(safe).length === 0) return;
  try {
    input.onUsage(safe);
  } catch {
    // Observability callbacks never alter provider behavior.
  }
}
