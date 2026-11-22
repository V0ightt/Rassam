'use client';

import { useSyncExternalStore } from 'react';
import { FileJson, FolderOpen, Github, Network, Plus } from 'lucide-react';

interface EmptyWorkspaceProps {
  onAnalyzeRepository: () => void;
  onImportProject: () => void;
  onCreateBlank: () => void;
  onExploreSample: () => void;
  /** Open a folder on this machine as a Rassam Blueprint (File System Access API, Chromium only). */
  onOpenLocalFolder?: () => void;
}

const subscribeNever = () => () => undefined;
const canPickDirectory = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export default function EmptyWorkspace({
  onAnalyzeRepository,
  onImportProject,
  onCreateBlank,
  onExploreSample,
  onOpenLocalFolder,
}: EmptyWorkspaceProps) {
  const folderPickerSupported = useSyncExternalStore(subscribeNever, canPickDirectory, () => false);
  return (
    <section
      aria-labelledby="empty-workspace-title"
      className="absolute inset-0 z-[5] grid place-items-center overflow-y-auto bg-slate-950/92 px-5 py-12"
    >
      <div className="w-full max-w-3xl">
        <div className="max-w-xl">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
            <Network size={24} aria-hidden="true" />
          </div>
          <h1 id="empty-workspace-title" className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            The architecture contract your coding agents must obey
          </h1>
          <p className="mt-3 max-w-[62ch] text-sm leading-6 text-slate-300">
            Write down what your system is supposed to be, let agents check it before they act, and see every change judged against it. Open a local folder to edit the blueprint in your repository, or start from a public GitHub repository.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {onOpenLocalFolder && (
            <button
              type="button"
              onClick={onOpenLocalFolder}
              disabled={!folderPickerSupported}
              className="group flex min-h-24 items-start gap-4 rounded-xl border border-cyan-300/60 bg-cyan-400/15 p-4 text-left transition-colors hover:border-cyan-200 hover:bg-cyan-400/20 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/60 disabled:opacity-70 sm:col-span-2"
            >
              <FolderOpen className="mt-0.5 shrink-0 text-cyan-200" size={20} aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-slate-50">Open local folder</span>
                <span className="mt-1 block text-xs leading-5 text-slate-300">
                  {folderPickerSupported
                    ? 'Author the blueprint your coding agents must obey. Files stay on this machine. Chromium browsers only.'
                    : 'Needs Chrome, Edge or another Chromium browser.'}
                </span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onAnalyzeRepository}
            className="group flex min-h-28 items-start gap-4 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-4 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-400/15 active:translate-y-px"
          >
            <Github className="mt-0.5 shrink-0 text-cyan-300" size={20} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-slate-50">Analyze GitHub repository</span>
              <span className="mt-1 block text-xs leading-5 text-slate-300">Create a map from a public GitHub.com repository.</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onImportProject}
            className="flex min-h-28 items-start gap-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-900 active:translate-y-px"
          >
            <FileJson className="mt-0.5 shrink-0 text-slate-300" size={20} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-slate-100">Import project</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">Open a graph exported from an earlier Rassam session.</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onCreateBlank}
            className="flex min-h-28 items-start gap-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-900 active:translate-y-px"
          >
            <Plus className="mt-0.5 shrink-0 text-slate-300" size={20} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-slate-100">Blank diagram</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">Start a custom architecture map without a repository.</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onExploreSample}
            className="flex min-h-28 items-start gap-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-900 active:translate-y-px"
          >
            <Network className="mt-0.5 shrink-0 text-slate-300" size={20} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-slate-100">Explore sample</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">Open a local example without GitHub or an AI provider.</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
