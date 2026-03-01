'use client';

import { memo, RefObject } from 'react';
import { motion } from 'framer-motion';
import { X, FileCode, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CreateProjectMode = 'github' | 'empty' | 'json';

interface CreateProjectModalProps {
    mode: CreateProjectMode;
    onModeChange: (mode: CreateProjectMode) => void;
    newProjectUrl: string;
    onUrlChange: (url: string) => void;
    newProjectName: string;
    onNameChange: (name: string) => void;
    loading: boolean;
    importError: string | null;
    importFileRef: RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onCreateFromGitHub: (url: string) => void;
    onCreateEmpty: () => void;
    onImportFile: (file: File) => void;
    onClearImportError: () => void;
}

const MODE_LABELS: Record<CreateProjectMode, string> = {
    github: 'From GitHub',
    empty: 'Empty Project',
    json: 'From JSON',
};

function CreateProjectModal({
    mode,
    onModeChange,
    newProjectUrl,
    onUrlChange,
    newProjectName,
    onNameChange,
    loading,
    importError,
    importFileRef,
    onClose,
    onCreateFromGitHub,
    onCreateEmpty,
    onImportFile,
    onClearImportError,
}: CreateProjectModalProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-100">Create Project</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {/* Mode tabs */}
                    <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-800/60 border border-slate-700">
                        {(['github', 'empty', 'json'] as const).map((m) => (
                            <button
                                key={m}
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
                            <label className="text-xs text-slate-400 block">
                                GitHub repository URL
                            </label>
                            <input
                                value={newProjectUrl}
                                onChange={(e) => onUrlChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newProjectUrl.trim() && !loading) {
                                        onCreateFromGitHub(newProjectUrl.trim());
                                    }
                                }}
                                placeholder="https://github.com/owner/repo"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                        </div>
                    ) : mode === 'empty' ? (
                        <div className="space-y-3">
                            <label className="text-xs text-slate-400 block">
                                Project name (optional)
                            </label>
                            <input
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
                            <label className="text-xs text-slate-400 block">
                                Select a JSON file exported from Rassam
                            </label>
                            <input
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
                                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
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
                        onClick={onClose}
                        className="px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    {mode === 'github' ? (
                        <button
                            onClick={() => {
                                if (!newProjectUrl.trim() || loading) return;
                                onCreateFromGitHub(newProjectUrl.trim());
                            }}
                            disabled={!newProjectUrl.trim() || loading}
                            className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Analyzing...' : 'Create from GitHub'}
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
            </motion.div>
        </motion.div>
    );
}

export default memo(CreateProjectModal);
