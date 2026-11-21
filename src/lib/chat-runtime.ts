import { ApiError } from "./api-error";
import { getProviderModels, hasConfiguredApiKey } from "./llm/catalog";
import { normalizeProviderId } from "./llm/registry";
import type { LLMProviderId } from "./llm/types";

export interface ResolvedChatRuntime {
  providerId: LLMProviderId;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

interface RequestedChatRuntime {
  providerId: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

function validateOllamaBaseUrl(env: NodeJS.ProcessEnv): void {
  const raw = env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434/v1";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ApiError("PROVIDER_NOT_CONFIGURED", 503, "Ollama base URL is invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ApiError("PROVIDER_NOT_CONFIGURED", 503, "Ollama base URL must use HTTP or HTTPS without embedded credentials");
  }
}

/**
 * Resolves exactly the provider and model selected by the client. This helper is
 * deliberately static: ordinary chat turns never make a billable health-check
 * completion and never fall back to another provider or model.
 */
export function resolveChatRuntime(
  requested: RequestedChatRuntime,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedChatRuntime {
  const providerId = normalizeProviderId(requested.providerId);
  if (!providerId) {
    throw new ApiError("INVALID_REQUEST", 400, "Selected provider is not supported");
  }

  const model = requested.model.trim();
  const models = getProviderModels(providerId, env);
  if (!models.includes(model)) {
    throw new ApiError("MODEL_NOT_AVAILABLE", 400, "Selected model is not available for this provider");
  }

  if (providerId === "ollama") {
    validateOllamaBaseUrl(env);
  } else if (!hasConfiguredApiKey(providerId, env)) {
    throw new ApiError("PROVIDER_NOT_CONFIGURED", 503, "Selected provider is not configured");
  }

  return {
    providerId,
    model,
    ...(requested.maxTokens !== undefined ? { maxTokens: requested.maxTokens } : {}),
    ...(requested.temperature !== undefined ? { temperature: requested.temperature } : {}),
  };
}
