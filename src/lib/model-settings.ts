import { LLMProviderId } from "@/lib/llm";

export const MODEL_SETTINGS_STORAGE_KEY = "repoAgent_modelSettings";
export const PROVIDER_STATUS_STORAGE_KEY = "repoAgent_providerStatus";

export interface ModelSettings {
  enabledModels: Partial<Record<LLMProviderId, string[]>>;
  selectedProvider: LLMProviderId | null;
  selectedModel: string | null;
  maxOutputTokens: number;
  temperature: number;
}

export interface ProviderStatus {
  id: LLMProviderId;
  label: string;
  envKey: string;
  models: string[];
  hasApiKey: boolean;
  validated: boolean;
  available: boolean;
  reason?: string;
}

export interface ProviderStatusResponse {
  providers: ProviderStatus[];
  checkedAt: string;
}

const DEFAULT_SETTINGS: ModelSettings = {
  enabledModels: {},
  selectedProvider: null,
  selectedModel: null,
  maxOutputTokens: 2000,
  temperature: 0.7,
};

export function getDefaultModelSettings(): ModelSettings {
  return { ...DEFAULT_SETTINGS, enabledModels: {} };
}

export function loadModelSettings(): ModelSettings {
  if (typeof window === "undefined") {
    return getDefaultModelSettings();
  }

  try {
    const raw = localStorage.getItem(MODEL_SETTINGS_STORAGE_KEY);
    if (!raw) return getDefaultModelSettings();
    const parsed = JSON.parse(raw) as Partial<ModelSettings>;

    return {
      enabledModels: parsed.enabledModels || {},
      selectedProvider: parsed.selectedProvider || null,
      selectedModel: parsed.selectedModel || null,
      maxOutputTokens: typeof parsed.maxOutputTokens === "number" ? parsed.maxOutputTokens : 2000,
      temperature: typeof parsed.temperature === "number" ? parsed.temperature : 0.7,
    };
  } catch {
    return getDefaultModelSettings();
  }
}

export function saveModelSettings(settings: ModelSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function loadProviderStatus(): ProviderStatusResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(PROVIDER_STATUS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProviderStatusResponse>;

    if (!Array.isArray(parsed.providers)) {
      return null;
    }

    return {
      providers: parsed.providers,
      checkedAt: typeof parsed.checkedAt === "string" ? parsed.checkedAt : "",
    };
  } catch {
    return null;
  }
}

export function saveProviderStatus(status: ProviderStatusResponse) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROVIDER_STATUS_STORAGE_KEY, JSON.stringify(status));
}

function clampMaxTokens(value: number): number {
  if (!Number.isFinite(value)) return 2000;
  return Math.min(8192, Math.max(64, Math.floor(value)));
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}

export function sanitizeModelSettings(
  settings: ModelSettings,
  providerResponse: ProviderStatusResponse | null,
): ModelSettings {
  const base = {
    ...settings,
    maxOutputTokens: clampMaxTokens(settings.maxOutputTokens),
    temperature: clampTemperature(settings.temperature),
  };

  if (!providerResponse?.providers?.length) {
    return base;
  }

  const availableProviders = providerResponse.providers.filter((provider) => provider.available);
  const enabledModels: Partial<Record<LLMProviderId, string[]>> = {};

  for (const provider of providerResponse.providers) {
    const existingEnabled = base.enabledModels[provider.id] || [];
    const allowed = existingEnabled.filter((model) => provider.models.includes(model));

    if (provider.available && allowed.length > 0) {
      enabledModels[provider.id] = allowed;
      continue;
    }

    // Only auto-enable if the user had no previous selection for this provider
    if (provider.available && provider.models[0] && !base.enabledModels[provider.id]) {
      enabledModels[provider.id] = [provider.models[0]];
    }
  }

  const selectedProvider = base.selectedProvider;
  const providerForSelection = selectedProvider
    ? availableProviders.find((provider) => provider.id === selectedProvider)
    : null;

  const enabledForSelected = providerForSelection
    ? enabledModels[providerForSelection.id] || []
    : [];

  if (providerForSelection && enabledForSelected.length > 0) {
    const selectedModel = enabledForSelected.includes(base.selectedModel || "")
      ? base.selectedModel
      : enabledForSelected[0];

    return {
      ...base,
      enabledModels,
      selectedProvider: providerForSelection.id,
      selectedModel,
    };
  }

  const fallbackProvider = availableProviders.find((provider) => (enabledModels[provider.id] || []).length > 0) || null;

  return {
    ...base,
    enabledModels,
    selectedProvider: fallbackProvider?.id || null,
    selectedModel: fallbackProvider ? (enabledModels[fallbackProvider.id] || [])[0] || null : null,
  };
}
