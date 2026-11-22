import type { LLMProviderId } from "@/lib/llm";
import type { ProviderCapabilities } from "@/lib/llm/catalog";

export const MODEL_SETTINGS_STORAGE_KEY = "repoAgent_modelSettings";
export const PROVIDER_STATUS_STORAGE_KEY = "repoAgent_providerStatus";
export const MODEL_VALIDATION_STORAGE_KEY = "rassam.model-validation.v1";
export const MODEL_VALIDATION_TTL_MS = 5 * 60 * 1_000;

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
  capabilities?: ProviderCapabilities;
}

export interface ProviderStatusResponse {
  providers: ProviderStatus[];
  checkedAt: string;
  validationMode?: 'explicit';
  validationCacheTtlSeconds?: number;
}

export interface ModelValidationStatus {
  providerId: LLMProviderId;
  model: string;
  validated: boolean;
  available: boolean;
  reason?: string;
  cached: boolean;
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
      ...(parsed.validationMode === "explicit" ? { validationMode: "explicit" as const } : {}),
      ...(typeof parsed.validationCacheTtlSeconds === "number"
        ? { validationCacheTtlSeconds: parsed.validationCacheTtlSeconds }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveProviderStatus(status: ProviderStatusResponse) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROVIDER_STATUS_STORAGE_KEY, JSON.stringify(status));
}

export function loadModelValidationStatus(
  providerId?: LLMProviderId | null,
  model?: string | null,
  now = Date.now(),
): ModelValidationStatus | null {
  if (typeof window === "undefined" || !providerId || !model) return null;
  try {
    const raw = localStorage.getItem(MODEL_VALIDATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ModelValidationStatus>;
    const checkedAt = typeof parsed.checkedAt === "string" ? Date.parse(parsed.checkedAt) : Number.NaN;
    if (
      parsed.providerId !== providerId
      || parsed.model !== model
      || typeof parsed.validated !== "boolean"
      || typeof parsed.available !== "boolean"
      || !Number.isFinite(checkedAt)
      || checkedAt > now + 60_000
      || now - checkedAt > MODEL_VALIDATION_TTL_MS
    ) return null;
    return {
      providerId,
      model,
      validated: parsed.validated,
      available: parsed.available,
      ...(typeof parsed.reason === "string" ? { reason: parsed.reason } : {}),
      cached: Boolean(parsed.cached),
      checkedAt: parsed.checkedAt!,
    };
  } catch {
    return null;
  }
}

export function saveModelValidationStatus(status: ModelValidationStatus): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODEL_VALIDATION_STORAGE_KEY, JSON.stringify(status));
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

  const enabledModels: Partial<Record<LLMProviderId, string[]>> = {};

  for (const provider of providerResponse.providers) {
    const existingEnabled = base.enabledModels[provider.id] || [];
    const allowed = existingEnabled.filter((model) => provider.models.includes(model));
    if (allowed.length > 0) enabledModels[provider.id] = allowed;
  }

  const selectedProvider = base.selectedProvider;
  const providerForSelection = selectedProvider
    ? providerResponse.providers.find((provider) => provider.id === selectedProvider)
    : null;
  const selectedProviderIsKnown = Boolean(providerForSelection);
  const exactModelIsValid = Boolean(
    providerForSelection
    && base.selectedModel
    && providerForSelection.models.includes(base.selectedModel)
  );

  if (exactModelIsValid && providerForSelection && base.selectedModel) {
    enabledModels[providerForSelection.id] = Array.from(new Set([
      ...(enabledModels[providerForSelection.id] || []),
      base.selectedModel,
    ]));
  }

  return {
    ...base,
    enabledModels,
    selectedProvider: selectedProviderIsKnown ? providerForSelection!.id : null,
    selectedModel: exactModelIsValid ? base.selectedModel : null,
  };
}
