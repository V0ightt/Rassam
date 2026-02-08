import { AnthropicAdapter } from "./providers/AnthropicAdapter";
import { DeepSeekAdapter } from "./providers/DeepSeekAdapter";
import { GoogleAdapter } from "./providers/GoogleAdapter";
import { OllamaAdapter } from "./providers/OllamaAdapter";
import { OpenAIAdapter } from "./providers/OpenAIAdapter";
import { LLMProvider, LLMProviderId } from "./types";

const providerRegistry: Record<LLMProviderId, LLMProvider> = {
  deepseek: new DeepSeekAdapter(),
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  ollama: new OllamaAdapter(),
};

export function normalizeProviderId(value?: string | null): LLMProviderId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "deepseek") return "deepseek";
  if (normalized === "openai") return "openai";
  if (normalized === "anthropic") return "anthropic";
  if (normalized === "google") return "google";
  if (normalized === "ollama") return "ollama";
  return null;
}

export function getProviderIdFromEnv(env: NodeJS.ProcessEnv = process.env): LLMProviderId {
  const normalized = normalizeProviderId(env.LLM_PROVIDER);
  return normalized ?? "deepseek";
}

export function getProvider(id?: string | null): LLMProvider {
  const normalized = normalizeProviderId(id) ?? getProviderIdFromEnv();
  return providerRegistry[normalized] ?? providerRegistry.deepseek;
}

export function listProviders(): LLMProviderId[] {
  return Object.keys(providerRegistry) as LLMProviderId[];
}
