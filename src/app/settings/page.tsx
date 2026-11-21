'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Settings,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';

import ActivityBar, { type ActivityPanel } from '@/components/navigation/ActivityBar';
import {
  getDefaultModelSettings,
  loadModelSettings,
  loadModelValidationStatus,
  loadProviderStatus,
  type ModelSettings,
  type ModelValidationStatus,
  type ProviderStatusResponse,
  saveModelSettings,
  saveModelValidationStatus,
  saveProviderStatus,
  sanitizeModelSettings,
} from '@/lib/model-settings';
import type { LLMProviderId } from '@/lib/llm';
import { cn } from '@/lib/utils';

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validationDescription(status: ModelValidationStatus): string {
  if (status.validated) {
    return `${status.cached ? 'Cached result' : 'Live test passed'} at ${new Date(status.checkedAt).toLocaleTimeString()}.`;
  }
  return status.reason || 'The selected model did not pass validation.';
}

export default function SettingsPage() {
  const router = useRouter();
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);
  const [settings, setSettings] = useState<ModelSettings>(getDefaultModelSettings());
  const [validationStatus, setValidationStatus] = useState<ModelValidationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProviderMetadata = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/models', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Failed to load provider configuration');

      const status = payload as ProviderStatusResponse;
      const sanitized = sanitizeModelSettings(loadModelSettings(), status);
      setProviderStatus(status);
      setSettings(sanitized);
      setValidationStatus(loadModelValidationStatus(sanitized.selectedProvider, sanitized.selectedModel));
      saveProviderStatus(status);
      saveModelSettings(sanitized);
    } catch (caught) {
      const cachedStatus = loadProviderStatus();
      const sanitized = sanitizeModelSettings(loadModelSettings(), cachedStatus);
      setProviderStatus(cachedStatus);
      setSettings(sanitized);
      setValidationStatus(loadModelValidationStatus(sanitized.selectedProvider, sanitized.selectedModel));
      setError(caught instanceof Error ? caught.message : 'Failed to load provider configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviderMetadata();
  }, [fetchProviderMetadata]);

  const applySettings = useCallback((nextSettings: ModelSettings) => {
    const sanitized = sanitizeModelSettings(nextSettings, providerStatus);
    setSettings(sanitized);
    setValidationStatus(loadModelValidationStatus(sanitized.selectedProvider, sanitized.selectedModel));
    saveModelSettings(sanitized);
  }, [providerStatus]);

  const selectedProvider = useMemo(() => (
    providerStatus?.providers.find((provider) => provider.id === settings.selectedProvider) ?? null
  ), [providerStatus, settings.selectedProvider]);

  const updateDefaultProvider = useCallback((value: string) => {
    const providerId = value ? value as LLMProviderId : null;
    applySettings({ ...settings, selectedProvider: providerId, selectedModel: null });
  }, [applySettings, settings]);

  const updateDefaultModel = useCallback((model: string) => {
    if (!settings.selectedProvider || !model) {
      applySettings({ ...settings, selectedModel: null });
      return;
    }
    const enabled = settings.enabledModels[settings.selectedProvider] || [];
    applySettings({
      ...settings,
      selectedModel: model,
      enabledModels: {
        ...settings.enabledModels,
        [settings.selectedProvider]: Array.from(new Set([...enabled, model])),
      },
    });
  }, [applySettings, settings]);

  const updateProviderEnabled = useCallback((providerId: LLMProviderId, enabled: boolean) => {
    if (!providerStatus) return;
    const provider = providerStatus.providers.find((item) => item.id === providerId);
    if (!provider || !provider.available) return;
    const nextEnabled = {
      ...settings.enabledModels,
      [providerId]: enabled
        ? (settings.enabledModels[providerId]?.length ? settings.enabledModels[providerId] : provider.models.slice(0, 1))
        : [],
    };
    applySettings({
      ...settings,
      enabledModels: nextEnabled,
      ...(enabled || settings.selectedProvider !== providerId
        ? {}
        : { selectedProvider: null, selectedModel: null }),
    });
  }, [applySettings, providerStatus, settings]);

  const updateModelEnabled = useCallback((providerId: LLMProviderId, model: string, enabled: boolean) => {
    const current = settings.enabledModels[providerId] || [];
    const nextList = enabled
      ? Array.from(new Set([...current, model]))
      : current.filter((entry) => entry !== model);
    applySettings({
      ...settings,
      enabledModels: { ...settings.enabledModels, [providerId]: nextList },
      ...(!enabled && settings.selectedProvider === providerId && settings.selectedModel === model
        ? { selectedModel: null }
        : {}),
    });
  }, [applySettings, settings]);

  const testSelectedModel = useCallback(async () => {
    if (!settings.selectedProvider || !settings.selectedModel) return;
    setTestingModel(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: settings.selectedProvider,
          model: settings.selectedModel,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Model validation failed');
      const status: ModelValidationStatus = {
        providerId: settings.selectedProvider,
        model: settings.selectedModel,
        validated: payload?.validated === true,
        available: payload?.available === true,
        ...(typeof payload?.reason === 'string' ? { reason: payload.reason } : {}),
        cached: payload?.cached === true,
        checkedAt: typeof payload?.checkedAt === 'string' ? payload.checkedAt : new Date().toISOString(),
      };
      setValidationStatus(status);
      saveModelValidationStatus(status);
    } catch (caught) {
      setValidationStatus(null);
      setError(caught instanceof Error ? caught.message : 'Model validation failed');
    } finally {
      setTestingModel(false);
    }
  }, [settings.selectedModel, settings.selectedProvider]);

  const handlePanelChange = useCallback((panel: ActivityPanel) => {
    if (panel !== 'settings') router.push('/');
  }, [router]);

  const canTestModel = Boolean(selectedProvider?.available && settings.selectedProvider && settings.selectedModel);

  return (
    <div className="flex min-h-[100dvh] w-full bg-slate-950 text-slate-100 overflow-hidden">
      <ActivityBar activePanel="settings" onPanelChange={handlePanelChange} />

      <main className="min-w-0 flex-1 overflow-y-auto" aria-busy={loading}>
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
          <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold">
                <Settings size={18} aria-hidden="true" className="text-cyan-400" />
                AI settings
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Choose one explicit default model. Configuration refreshes never call a model provider.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={fetchProviderMetadata}
                disabled={loading}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={14} aria-hidden="true" className={cn(loading && 'animate-spin motion-reduce:animate-none')} />
                Refresh configuration
              </button>
              <Link
                href="/"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back to workspace
              </Link>
            </div>
          </header>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <section aria-labelledby="default-model-heading" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 id="default-model-heading" className="text-sm font-medium">Default model</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Rassam never changes this provider or model automatically. Test Model contacts only the exact selection.
              </p>
            </div>

            <div className="grid gap-4 py-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-300">Provider</span>
                <select
                  aria-label="Default provider"
                  value={settings.selectedProvider || ''}
                  onChange={(event) => updateDefaultProvider(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <option value="">Select a provider</option>
                  {providerStatus?.providers.map((provider) => (
                    <option key={provider.id} value={provider.id} disabled={!provider.available}>
                      {provider.label}{provider.available ? '' : ' (not configured)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-300">Model</span>
                <select
                  aria-label="Default model"
                  value={settings.selectedModel || ''}
                  disabled={!selectedProvider}
                  onChange={(event) => updateDefaultModel(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select a model</option>
                  {selectedProvider?.models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={testSelectedModel}
                disabled={!canTestModel || testingModel}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <TestTube2 size={16} aria-hidden="true" />
                {testingModel ? 'Testing model' : 'Test model'}
              </button>
              <div aria-live="polite" className="min-h-10 text-xs leading-5 text-slate-400">
                {validationStatus ? (
                  <div className={cn('flex items-start gap-2', validationStatus.validated ? 'text-cyan-200' : 'text-amber-200')}>
                    {validationStatus.validated
                      ? <ShieldCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                      : <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />}
                    <span>{validationDescription(validationStatus)}</span>
                  </div>
                ) : (
                  <span>No live test has been run for this exact selection in the last five minutes.</span>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="generation-heading" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 id="generation-heading" className="text-sm font-medium">Generation controls</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs text-slate-400">Maximum output tokens</span>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={settings.maxOutputTokens}
                  onChange={(event) => applySettings({ ...settings, maxOutputTokens: parseNumberInput(event.target.value, 2000) })}
                  className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-slate-400">Temperature (0-1)</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={settings.temperature}
                  onChange={(event) => applySettings({ ...settings, temperature: parseNumberInput(event.target.value, 0.7) })}
                  className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 size={14} aria-hidden="true" />
              Saved locally as values change
            </div>
          </section>

          <section aria-labelledby="providers-heading" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 id="providers-heading" className="text-sm font-medium">Provider configuration</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                This list checks environment configuration only. It does not send a prompt or incur model usage.
              </p>
            </div>

            {loading && !providerStatus ? (
              <div role="status" className="py-6 text-sm text-slate-400">Loading provider metadata</div>
            ) : !providerStatus ? (
              <div className="py-6 text-sm text-slate-400">Provider metadata is unavailable.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {providerStatus.providers.map((provider) => {
                  const isEnabled = (settings.enabledModels[provider.id] || []).length > 0;
                  const enabledModels = settings.enabledModels[provider.id] || [];
                  const capabilityLabels = [
                    provider.capabilities?.streaming ? 'Streaming' : null,
                    provider.capabilities?.structuredOutput ? 'Structured output' : null,
                    provider.capabilities?.apiKeyRequired === false ? 'API key optional' : null,
                  ].filter((label): label is string => Boolean(label));

                  return (
                    <div key={provider.id} className="py-4 first:pt-4 last:pb-0">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-medium text-slate-100">{provider.label}</h3>
                            <span className={cn(
                              'rounded-md border px-2 py-0.5 text-[11px]',
                              provider.available
                                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                            )}>
                              {provider.available ? 'Configured' : 'Needs configuration'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {provider.id === 'ollama'
                              ? 'Uses OLLAMA_BASE_URL. OLLAMA_API_KEY is optional.'
                              : `Requires ${provider.envKey}.`}
                          </p>
                          {capabilityLabels.length > 0 && (
                            <p className="mt-1 text-[11px] text-slate-500">{capabilityLabels.join(' / ')}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateProviderEnabled(provider.id, !isEnabled)}
                          disabled={!provider.available}
                          aria-pressed={isEnabled}
                          className={cn(
                            'inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400',
                            isEnabled
                              ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100'
                              : 'border-slate-700 text-slate-300 hover:bg-slate-800',
                            !provider.available && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          {isEnabled ? 'Shown in chat' : 'Add to chat selector'}
                        </button>
                      </div>

                      {!provider.available && provider.reason && (
                        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          {provider.reason}
                        </p>
                      )}

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {provider.models.map((model) => {
                          const checked = enabledModels.includes(model);
                          return (
                            <label
                              key={model}
                              className={cn(
                                'flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs text-slate-300',
                                checked ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/50',
                                (!provider.available || !isEnabled) && 'opacity-60',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!provider.available || !isEnabled}
                                onChange={(event) => updateModelEnabled(provider.id, model, event.target.checked)}
                                className="size-4 rounded border-slate-600 bg-slate-900 accent-cyan-500"
                              />
                              <span className="truncate">{model}</span>
                              {settings.selectedProvider === provider.id && settings.selectedModel === model && (
                                <span className="ml-auto text-[11px] text-cyan-300">Default</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
