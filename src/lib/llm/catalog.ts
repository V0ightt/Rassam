import { getProvider, listProviders, normalizeProviderId } from "./registry";
import { LLMProviderId } from "./types";

export interface ProviderAvailability {
  id: LLMProviderId;
  label: string;
  envKey: string;
  models: string[];
  hasApiKey: boolean;
  validated: boolean;
  available: boolean;
  reason?: string;
}

interface ProviderCatalogConfig {
  label: string;
  envKey: string;
  modelEnv: string;
  modelsEnv: string;
  defaultModels: string[];
}

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
    defaultModels: ["gpt-5-nano", "gpt-5-mini"],
  },
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    modelsEnv: "ANTHROPIC_MODELS",
    defaultModels: ["claude-3-5-sonnet-20241022", "claude-3-7-sonnet-latest"],
  },
  google: {
    label: "Google",
    envKey: "GOOGLE_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    modelsEnv: "GOOGLE_MODELS",
    defaultModels: ["gemini-1.5-flash", "gemini-1.5-pro"],
  },
  ollama: {
    label: "Ollama",
    envKey: "OLLAMA_API_KEY",
    modelEnv: "OLLAMA_MODEL",
    modelsEnv: "OLLAMA_MODELS",
    defaultModels: ["llama3.1", "qwen2.5", "mistral"],
  },
};

function compactMessage(message: string): string {
  return message.split("\n").map((line) => line.trim()).filter(Boolean)[0] || "Validation failed";
}

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error("Validation timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
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

export function getProviderModels(id: LLMProviderId, env: NodeJS.ProcessEnv = process.env): string[] {
  const config = providerCatalog[id];
  const modelFromEnv = (env[config.modelEnv] || "").trim();
  const envModels = parseModels(env[config.modelsEnv]);

  return unique([
    ...envModels,
    modelFromEnv,
    ...config.defaultModels,
  ].filter(Boolean));
}

export function hasConfiguredApiKey(id: LLMProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
  const envKey = providerCatalog[id].envKey;
  const keyValue = env[envKey];
  if (!keyValue) return false;
  return !isPlaceholderApiKey(keyValue);
}

export async function validateProviderConnection(
  id: LLMProviderId,
  model?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!hasConfiguredApiKey(id)) {
    return {
      ok: false,
      reason: `Missing or invalid ${getProviderEnvKey(id)} in .env.local`,
    };
  }

  const provider = getProvider(id);
  const models = getProviderModels(id);
  const selectedModel = (model || "").trim();
  const candidateModels = unique([
    selectedModel,
    ...models,
  ].filter(Boolean));
  const modelsToCheck = candidateModels.length > 0 ? candidateModels : [undefined];

  let lastReason: string | undefined;

  for (const modelToCheck of modelsToCheck) {
    try {
      await withTimeout(
        provider.chat({
          system: "You are a health check assistant. Reply with OK.",
          message: "OK",
          temperature: 1,
          maxTokens: 64,
          model: modelToCheck,
        }),
        10000,
      );

      return { ok: true };
    } catch (error) {
      if (isEmptyResponseValidationError(error)) {
        return { ok: true };
      }
      lastReason = compactMessage(error instanceof Error ? error.message : "Validation failed");
    }
  }

  return {
    ok: false,
    reason: lastReason || "Validation failed",
  };
}

export async function getProviderAvailability(
  id: LLMProviderId,
  model?: string,
): Promise<ProviderAvailability> {
  const hasApiKey = hasConfiguredApiKey(id);
  const models = getProviderModels(id);

  if (!hasApiKey) {
    return {
      id,
      label: getProviderLabel(id),
      envKey: getProviderEnvKey(id),
      models,
      hasApiKey: false,
      validated: false,
      available: false,
      reason: `Missing or invalid ${getProviderEnvKey(id)} in .env.local`,
    };
  }

  const validation = await validateProviderConnection(id, model);

  return {
    id,
    label: getProviderLabel(id),
    envKey: getProviderEnvKey(id),
    models,
    hasApiKey,
    validated: validation.ok,
    available: validation.ok,
    reason: validation.reason,
  };
}

export async function getAllProviderAvailability(): Promise<ProviderAvailability[]> {
  const providerIds = listProviders();
  const results = await Promise.all(providerIds.map((providerId) => getProviderAvailability(providerId)));
  return results;
}

export function isValidProviderId(id?: string | null): id is LLMProviderId {
  return normalizeProviderId(id) !== null;
}
