'use client';

import { memo, RefObject, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FileCode, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalysisProgressUpdate } from '@/lib/analysis-stream';
import {
    loadModelSettings,
    loadModelValidationStatus,
    loadProviderStatus,
} from '@/lib/model-settings';

export type CreateProjectMode = 'github' | 'empty' | 'json';

interface CreateProjectModalProps {
    mode: CreateProjectMode;
    onModeChange: (mode: CreateProjectMode) => void;
    newProjectUrl: string;
    onUrlChange: (url: string) => void;
    newProjectRef: string;
    onRefChange: (ref: string) => void;
    enrichWithAi: boolean;
    onEnrichWithAiChange: (enabled: boolean) => void;
    newProjectName: string;
    onNameChange: (name: string) => void;
    loading: boolean;
    analysisProgress: AnalysisProgressUpdate | null;
    analysisError: string | null;
    importError: string | null;
    importFileRef: RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onCancelAnalysis: () => void;
    onCreateFromGitHub: (url: string, enrichWithAi?: boolean) => void;
    onCreateEmpty: () => void;
    onImportFile: (file: File) => void;
    onClearImportError: () => void;
}

const MODE_LABELS: Record<CreateProjectMode, string> = {
    github: 'From GitHub',
    empty: 'Empty Project',
    json: 'From JSON',
};

interface EnrichmentChoice {
    available: boolean;
    label?: string;
    reason?: string;
}

function readEnrichmentChoice(): EnrichmentChoice {
    const settings = loadModelSettings();
    const providerId = settings.selectedProvider;
    const model = settings.selectedModel?.trim();
    if (!providerId || !model) {
        return { available: false, reason: 'No default model is selected. Choose one in Settings.' };
    }
    if (!(settings.enabledModels[providerId] || []).includes(model)) {
        return { available: false, label: `${providerId} / ${model}`, reason: 'The selected model is not enabled.' };
    }

    const provider = loadProviderStatus()?.providers.find((candidate) => candidate.id === providerId);
    if (provider && (!provider.available || !provider.models.includes(model))) {
        return {
            available: false,
            label: `${provider.label} / ${model}`,
            reason: provider.reason || 'The selected model is not available in this deployment.',
        };
    }
    const validation = loadModelValidationStatus(providerId, model);
    if (validation && !validation.available) {
        return {
            available: false,
            label: `${provider?.label || providerId} / ${model}`,
            reason: validation.reason || 'The selected model did not pass its latest Test Model check.',
        };
    }
    return { available: true, label: `${provider?.label || providerId} / ${model}` };
}

function CreateProjectModal({
    mode,
    onModeChange,
    newProjectUrl,
    onUrlChange,
    newProjectRef,
    onRefChange,
    enrichWithAi,
    onEnrichWithAiChange,
    newProjectName,
    onNameChange,
    loading,
    analysisProgress,
    analysisError,
    importError,
    importFileRef,
    onClose,
    onCancelAnalysis,
    onCreateFromGitHub,
    onCreateEmpty,
    onImportFile,
    onClearImportError,
}: CreateProjectModalProps) {
    const [enrichmentChoice] = useState<EnrichmentChoice>(() => readEnrichmentChoice());

    return (
        <Dialog.Root open onOpenChange={(open) => !open && !loading && onClose()}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm" />
              <Dialog.Content
                aria-describedby="create-project-description"
                onEscapeKeyDown={(event) => loading && event.preventDefault()}
                onInteractOutside={(event) => loading && event.preventDefault()}
                className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <div>
                      <Dialog.Title className="text-sm font-semibold text-slate-100">Create project</Dialog.Title>
                      <Dialog.Description id="create-project-description" className="mt-1 text-xs text-slate-400">
                        Analyze a public repository, import a graph, or start with a blank canvas.
                      </Dialog.Description>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Close create project dialog"
                        className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {/* Mode tabs */}
                    <div role="tablist" aria-label="Project source" className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-800/60 border border-slate-700">
                        {(['github', 'empty', 'json'] as const).map((m) => (
                            <button
                                key={m}
                                role="tab"
                                aria-selected={mode === m}
                                tabIndex={mode === m ? 0 : -1}
                                disabled={loading}
                                onClick={() => {
                                    onModeChange(m);
                                    onClearImportError();
                                }}
                                className={cn(
                                    'px-3 py-2 text-xs rounded-lg transition-colors',
                                    mode === m
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                        : 'text-slate-300 hover:bg-slate-700',
                                )}
                            >
                                {MODE_LABELS[m]}
                            </button>
                        ))}
                    </div>

                    {/* Mode-specific content */}
                    {mode === 'github' ? (
                        <div className="space-y-3">
                            <label htmlFor="github-repository-url" className="text-xs text-slate-300 block">
                                GitHub repository URL
                            </label>
                            <input
                                id="github-repository-url"
                                type="url"
                                autoComplete="url"
                                value={newProjectUrl}
                                disabled={loading}
                                onChange={(e) => onUrlChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newProjectUrl.trim() && !loading) {
                                        onCreateFromGitHub(
                                            newProjectUrl.trim(),
                                            enrichmentChoice.available ? enrichWithAi : false,
                                        );
                                    }
                                }}
                                placeholder="https://github.com/owner/repo"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <label htmlFor="github-repository-ref" className="text-xs text-slate-300 block">
                                Branch, tag, or commit (optional)
                            </label>
                            <input
                                id="github-repository-ref"
                                value={newProjectRef}
                                disabled={loading}
                                onChange={(event) => onRefChange(event.target.value)}
                                placeholder="main, v0.3.0, or commit SHA"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                            />
                            <label className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={enrichWithAi && enrichmentChoice.available}
                                    disabled={loading || !enrichmentChoice.available}
                                    onChange={(event) => onEnrichWithAiChange(event.target.checked)}
                                    aria-describedby="ai-enrichment-description"
                                    className="mt-0.5 size-4 accent-cyan-500"
                                />
                                <span id="ai-enrichment-description">
                                    <strong className="block font-medium text-slate-100">
                                        {enrichmentChoice.available
                                            ? `Enrich labels with ${enrichmentChoice.label}`
                                            : 'AI enrichment unavailable'}
                                    </strong>
                                    {enrichmentChoice.available ? (
                                        <span>Only verified group IDs, file membership, and evidence metadata are sent. Relationships remain deterministic.</span>
                                    ) : (
                                        <span className="text-amber-300">{enrichmentChoice.reason}</span>
                                    )}
                                    <span className="mt-1 block text-slate-400">Leave this off to analyze without AI.</span>
                                </span>
                            </label>
                            {loading && analysisProgress && (
                                <div className="rounded-lg border border-cyan-800/60 bg-cyan-950/30 p-3" aria-live="polite" aria-busy="true">
                                    <div className="flex items-center justify-between gap-3 text-xs">
                                        <span className="font-medium text-cyan-100">{analysisProgress.message}</span>
                                        <span className="tabular-nums text-cyan-300">{Math.round(analysisProgress.progress * 100)}%</span>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                                        <div
                                            className="h-full rounded-full bg-cyan-400 transition-[width] duration-200 motion-reduce:transition-none"
                                            style={{ width: `${Math.round(analysisProgress.progress * 100)}%` }}
                                        />
                                    </div>
                                    {typeof analysisProgress.completed === 'number' && typeof analysisProgress.total === 'number' && (
                                        <p className="mt-2 text-[11px] tabular-nums text-slate-400">
                                            {analysisProgress.completed.toLocaleString()} of {analysisProgress.total.toLocaleString()} items
                                        </p>
                                    )}
                                </div>
                            )}
                            {!loading && analysisError && (
                                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-700/50 bg-red-950/50 p-3 text-xs text-red-100">
                                    <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                                    {analysisError}
                                </div>
                            )}
                        </div>
                    ) : mode === 'empty' ? (
                        <div className="space-y-3">
                            <label htmlFor="empty-project-name" className="text-xs text-slate-300 block">
                                Project name (optional)
                            </label>
                            <input
                                id="empty-project-name"
                                value={newProjectName}
                                onChange={(e) => onNameChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onCreateEmpty();
                                }}
                                placeholder="My Custom Flowchart"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <p className="text-xs text-slate-500">
                                Start from a blank canvas, then add custom nodes and connections.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <label htmlFor="project-import-file" className="text-xs text-slate-300 block">
                                Select a JSON file exported from Rassam
                            </label>
                            <input
                                id="project-import-file"
                                ref={importFileRef}
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) onImportFile(file);
                                    e.target.value = '';
                                }}
                            />
                            <button
                                onClick={() => importFileRef.current?.click()}
                                className="w-full flex items-center justify-center gap-2 bg-slate-800 border-2 border-dashed border-slate-600 hover:border-cyan-500/50 rounded-lg px-3 py-6 text-sm text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
                            >
                                <FileCode size={18} />
                                Choose JSON file
                            </button>
                            {importError && (
                                <div role="alert" aria-live="assertive" className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                    {importError}
                                </div>
                            )}
                            <p className="text-xs text-slate-500">
                                Import a previously exported JSON file as a new project.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
                    <button
                        onClick={loading ? onCancelAnalysis : onClose}
                        className="min-h-10 px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
                    >
                        {loading ? 'Stop analysis' : 'Cancel'}
                    </button>
                    {mode === 'github' ? (
                        <button
                            onClick={() => {
                                if (!newProjectUrl.trim() || loading) return;
                                onCreateFromGitHub(
                                    newProjectUrl.trim(),
                                    enrichmentChoice.available ? enrichWithAi : false,
                                );
                            }}
                            disabled={!newProjectUrl.trim() || loading}
                            className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Analyzing repository...' : 'Analyze repository'}
                        </button>
                    ) : mode === 'empty' ? (
                        <button
                            onClick={onCreateEmpty}
                            className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white"
                        >
                            Create Empty Project
                        </button>
                    ) : (
                        <button
                            onClick={() => importFileRef.current?.click()}
                            className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white"
                        >
                            Choose File to Import
                        </button>
                    )}
                </div>
                <p className="sr-only" aria-live="polite">{loading ? analysisProgress?.message || 'Repository analysis is running. The dialog will remain open.' : ''}</p>
              </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

export default memo(CreateProjectModal);
