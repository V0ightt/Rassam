'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CheckCircle2, RefreshCw, Settings } from 'lucide-react';
import {
  getDefaultModelSettings,
  loadProviderStatus,
  loadModelSettings,
  ModelSettings,
  ProviderStatusResponse,
  saveModelSettings,
  saveProviderStatus,
  sanitizeModelSettings,
} from '@/lib/model-settings';
import { cn } from '@/lib/utils';

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SettingsPage() {
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);
  const [settings, setSettings] = useState<ModelSettings>(getDefaultModelSettings());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProviderStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/models', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load providers');
      }

      const status = payload as ProviderStatusResponse;
      const loadedSettings = loadModelSettings();
      const sanitized = sanitizeModelSettings(loadedSettings, status);

      setProviderStatus(status);
      setSettings(sanitized);
      saveProviderStatus(status);
      saveModelSettings(sanitized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model settings');
      const fallbackSettings = loadModelSettings();
      setSettings(fallbackSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cachedProviderStatus = loadProviderStatus();
    const loadedSettings = loadModelSettings();
    const sanitized = sanitizeModelSettings(loadedSettings, cachedProviderStatus);
    setProviderStatus(cachedProviderStatus);
    setSettings(sanitized);
    saveModelSettings(sanitized);
  }, []);

  const applySettings = useCallback((nextSettings: ModelSettings) => {
    const sanitized = sanitizeModelSettings(nextSettings, providerStatus);
    setSettings(sanitized);
    saveModelSettings(sanitized);
  }, [providerStatus]);

  const updateProviderEnabled = useCallback((providerId: keyof ModelSettings['enabledModels'], enabled: boolean) => {
    if (!providerStatus) return;

    const provider = providerStatus.providers.find((item) => item.id === providerId);
    if (!provider || !provider.available) return;

    const nextEnabled = { ...settings.enabledModels };

    if (!enabled) {
      nextEnabled[providerId] = [];
    } else {
      nextEnabled[providerId] = nextEnabled[providerId]?.length
        ? nextEnabled[providerId]
        : provider.models.slice(0, 1);
    }

    applySettings({
      ...settings,
      enabledModels: nextEnabled,
    });
  }, [applySettings, providerStatus, settings]);

  const updateModelEnabled = useCallback((providerId: keyof ModelSettings['enabledModels'], model: string, enabled: boolean) => {
    const current = settings.enabledModels[providerId] || [];
    const nextList = enabled
      ? Array.from(new Set([...current, model]))
      : current.filter((entry) => entry !== model);

    applySettings({
      ...settings,
      enabledModels: {
        ...settings.enabledModels,
        [providerId]: nextList,
      },
    });
  }, [applySettings, settings]);

  const selectedLabel = useMemo(() => {
    if (!providerStatus || !settings.selectedProvider || !settings.selectedModel) return null;

    const provider = providerStatus.providers.find((item) => item.id === settings.selectedProvider);
    if (!provider) return null;

    return `${provider.label} • ${settings.selectedModel}`;
  }, [providerStatus, settings.selectedModel, settings.selectedProvider]);

  const persistNumbers = useCallback(() => {
    setSaving(true);
    applySettings({
      ...settings,
      maxOutputTokens: Math.min(8192, Math.max(64, Math.floor(settings.maxOutputTokens))),
      temperature: Math.min(1, Math.max(0, settings.temperature)),
    });
    setTimeout(() => setSaving(false), 350);
  }, [applySettings, settings]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Settings size={18} className="text-cyan-400" />
              AI Settings
            </h1>
            <p className="text-sm text-slate-400 mt-1">Enable models, set output limits, and choose your default chat model.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchProviderStatus}
              className="px-3 py-2 text-xs rounded-lg border border-slate-700 hover:bg-slate-800 flex items-center gap-1"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
              Revalidate
            </button>
            <Link
              href="/"
              className="px-3 py-2 text-xs rounded-lg border border-slate-700 hover:bg-slate-800 flex items-center gap-1"
            >
              <ArrowLeft size={12} />
              Back
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-medium">Generation Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Max output tokens</span>
              <input
                type="number"
                min={64}
                max={8192}
                value={settings.maxOutputTokens}
                onChange={(e) => applySettings({ ...settings, maxOutputTokens: parseNumberInput(e.target.value, 2000) })}
                onBlur={persistNumbers}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-400">Temperature (0 - 1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={settings.temperature}
                onChange={(e) => applySettings({ ...settings, temperature: parseNumberInput(e.target.value, 0.7) })}
                onBlur={persistNumbers}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <CheckCircle2 size={12} className={cn(saving ? 'text-cyan-400' : 'text-slate-600')} />
            {saving ? 'Saving…' : 'Saved automatically to local settings'}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <h2 className="text-sm font-medium">Models</h2>
          <p className="text-xs text-slate-500">A provider can only be enabled when it passes live API validation and has a valid key in .env.local.</p>

          {loading ? (
            <div className="text-sm text-slate-400">Checking providers…</div>
          ) : !providerStatus ? (
            <div className="text-sm text-slate-400">
              No validation data yet. Click <span className="text-slate-200">Revalidate</span> to check provider availability.
            </div>
          ) : (
            <div className="space-y-3">
              {providerStatus?.providers.map((provider) => {
                const isEnabled = (settings.enabledModels[provider.id] || []).length > 0;
                const enabledModels = settings.enabledModels[provider.id] || [];

                return (
                  <div key={provider.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-200">{provider.label}</div>
                        <div className="text-[11px] text-slate-500">{provider.envKey}</div>
                      </div>
                      <button
                        onClick={() => updateProviderEnabled(provider.id, !isEnabled)}
                        disabled={!provider.available}
                        className={cn(
                          'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
                          isEnabled
                            ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                            : 'border-slate-700 text-slate-400',
                          !provider.available && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    {!provider.available && (
                      <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5">
                        {provider.reason || 'Provider is unavailable'}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {provider.models.map((model) => {
                        const checked = enabledModels.includes(model);
                        return (
                          <label
                            key={model}
                            className={cn(
                              'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
                              checked ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100' : 'border-slate-700 text-slate-300',
                              (!provider.available || !isEnabled) && 'opacity-60'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!provider.available || !isEnabled}
                              onChange={(e) => updateModelEnabled(provider.id, model, e.target.checked)}
                              className="rounded border-slate-600 bg-slate-800"
                            />
                            {model}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-xs text-slate-400">
            Active chat model: <span className="text-slate-200">{selectedLabel || 'None selected'}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
