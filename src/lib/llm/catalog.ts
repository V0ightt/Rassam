import { getProvider, listProviders, normalizeProviderId } from "./registry";
import { LLMProviderId, type ChatInput } from "./types";

export interface ProviderAvailability {
  id: LLMProviderId;
  label: string;
  envKey: string;
  models: string[];
  hasApiKey: boolean;
  validated: boolean;
  available: boolean;
  reason?: string;
  capabilities: ProviderCapabilities;
}

export interface ProviderCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  nativeToolCalling: boolean;
  modelListing: boolean;
  apiKeyRequired: boolean;
  usageMetadata: boolean;
  finishMetadata: boolean;
  maxOutputTokens: number;
}

interface ProviderCatalogConfig {
  label: string;
  envKey: string;
  modelEnv: string;
  modelsEnv: string;
  defaultModels: string[];
}

export type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

const providerCatalog: Record<LLMProviderId, ProviderCatalogConfig> = {
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    modelsEnv: "DEEPSEEK_MODELS",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    modelsEnv: "OPENAI_MODELS",
    defaultModels: ["gpt-5.4-mini", "gpt-5.4", "gpt-5.4-nano", "gpt-5-nano", "gpt-5-mini"],
  },
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    modelsEnv: "ANTHROPIC_MODELS",
    defaultModels: ["claude-haiku-4-5", "claude-opus-4-6", "claude-sonnet-4-6"],
  },
  google: {
    label: "Google",
    envKey: "GOOGLE_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    modelsEnv: "GOOGLE_MODELS",
    defaultModels: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"],
  },
  ollama: {
    label: "Ollama",
    envKey: "OLLAMA_API_KEY",
    modelEnv: "OLLAMA_MODEL",
    modelsEnv: "OLLAMA_MODELS",
    defaultModels: ["llama3.1", "qwen2.5", "mistral"],
  },
};

function isEmptyResponseValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("returned an empty response");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseModels(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPlaceholderApiKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "sk-placeholder" ||
    normalized === "placeholder" ||
    normalized === "ollama" ||
    normalized === "your_api_key" ||
    normalized === "your-key" ||
    normalized.includes("changeme") ||
    normalized.includes("replace") ||
    normalized.includes("example")
  );
}

export function getProviderConfig(id: LLMProviderId): ProviderCatalogConfig {
  return providerCatalog[id];
}

export function getProviderLabel(id: LLMProviderId): string {
  return providerCatalog[id].label;
}

export function getProviderEnvKey(id: LLMProviderId): string {
  return providerCatalog[id].envKey;
}

export function getProviderModels(id: LLMProviderId, env: ProviderEnvironment = process.env): string[] {
  const config = providerCatalog[id];
  const modelFromEnv = (env[config.modelEnv] || "").trim();
  const envModels = parseModels(env[config.modelsEnv]);

  return unique([
    ...envModels,
    modelFromEnv,
    ...config.defaultModels,
  ].filter(Boolean));
}

export function hasConfiguredApiKey(id: LLMProviderId, env: ProviderEnvironment = process.env): boolean {
  const envKey = providerCatalog[id].envKey;
  const keyValue = env[envKey];
  if (!keyValue) return false;
  return !isPlaceholderApiKey(keyValue);
}

function getOllamaBaseUrlStatus(env: ProviderEnvironment = process.env): { ok: boolean; reason?: string } {
  const raw = env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434/v1";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return { ok: false, reason: "OLLAMA_BASE_URL must use HTTP or HTTPS without embedded credentials" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "OLLAMA_BASE_URL must be a valid URL" };
  }
}

export async function validateProviderConnection(
  id: LLMProviderId,
  model: string,
  signal?: AbortSignal,
  onUsage?: ChatInput["onUsage"],
): Promise<{ ok: boolean; reason?: string }> {
  if (id === "ollama") {
    const baseUrlStatus = getOllamaBaseUrlStatus();
    if (!baseUrlStatus.ok) return baseUrlStatus;
  } else if (!hasConfiguredApiKey(id)) {
    return {
      ok: false,
      reason: `Missing or invalid ${getProviderEnvKey(id)} in .env.local`,
    };
  }

  const provider = getProvider(id);
  const models = getProviderModels(id);
  const selectedModel = model.trim();
  if (!selectedModel || !models.includes(selectedModel)) {
    return { ok: false, reason: "Selected model is not in the configured model catalog" };
  }

  const timeoutSignal = AbortSignal.timeout(10_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  try {
    await provider.chat({
      system: "You are a health check assistant. Reply with OK.",
      message: "OK",
      temperature: 0,
      maxTokens: 64,
      model: selectedModel,
      signal: combinedSignal,
      onUsage,
    });
    return { ok: true };
  } catch (error) {
    if (isEmptyResponseValidationError(error)) return { ok: true };
    return { ok: false, reason: "The selected model could not be validated" };
  }
}

export function getProviderMetadata(
  id: LLMProviderId,
  env: ProviderEnvironment = process.env,
): ProviderAvailability {
  const hasApiKey = hasConfiguredApiKey(id, env);
  const ollamaStatus = id === "ollama" ? getOllamaBaseUrlStatus(env) : null;
  const configured = id === "ollama" ? ollamaStatus!.ok : hasApiKey;
  const capabilities: ProviderCapabilities = {
    streaming: true,
    structuredOutput: id === "openai" || id === "deepseek",
    nativeToolCalling: false,
    modelListing: false,
    apiKeyRequired: id !== "ollama",
    usageMetadata: true,
    finishMetadata: true,
    maxOutputTokens: 8_192,
  };
  return {
    id,
    label: getProviderLabel(id),
    envKey: getProviderEnvKey(id),
    models: getProviderModels(id, env),
    hasApiKey,
    validated: false,
    available: configured,
    capabilities,
    ...(!configured
      ? { reason: ollamaStatus?.reason || `Missing or invalid ${getProviderEnvKey(id)} in .env.local` }
      : {}),
  };
}

export function getAllProviderMetadata(): ProviderAvailability[] {
  return listProviders().map((providerId) => getProviderMetadata(providerId));
}

export async function getProviderAvailability(
  id: LLMProviderId,
  model?: string,
): Promise<ProviderAvailability> {
  const metadata = getProviderMetadata(id);
  if (!metadata.available) return metadata;

  const selectedModel = model?.trim() || metadata.models[0];
  if (!selectedModel) return { ...metadata, available: false, reason: "No model is configured" };
  const validation = await validateProviderConnection(id, selectedModel);

  return {
    ...metadata,
    validated: validation.ok,
    available: validation.ok,
    reason: validation.reason,
  };
}

export async function getAllProviderAvailability(): Promise<ProviderAvailability[]> {
  // Kept as a compatibility name. Bulk metadata reads must never perform
  // provider completions; exact live validation is user-triggered per model.
  return getAllProviderMetadata();
}

export function isValidProviderId(id?: string | null): id is LLMProviderId {
  return normalizeProviderId(id) !== null;
}
