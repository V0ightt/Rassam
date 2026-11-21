'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArchiveRestore, Copy, GitCompare, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';

import type { RefreshAnalysisState } from '@/lib/refresh-analysis';
import type { RefreshBackupSummary } from '@/lib/project-store';

interface RefreshAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRef?: string;
  state: RefreshAnalysisState;
  backups: RefreshBackupSummary[];
  onStart: (options: { requestedRef?: string; enrichWithAi?: boolean }) => Promise<unknown>;
  onCancel: () => void;
  onDiscard: () => void;
  onReplace: () => Promise<boolean>;
  onDuplicate: () => Promise<string | null>;
  onRestoreBackup: (backupId: string) => Promise<boolean>;
}

function delta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default function RefreshAnalysisDialog({
  open,
  onOpenChange,
  defaultRef,
  state,
  backups,
  onStart,
  onCancel,
  onDiscard,
  onReplace,
  onDuplicate,
  onRestoreBackup,
}: RefreshAnalysisDialogProps) {
  const [requestedRef, setRequestedRef] = useState(defaultRef ?? '');
  const [enrichWithAi, setEnrichWithAi] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const busy = state.status === 'running' || state.status === 'applying';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-950/75" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] max-h-[min(760px,90vh)] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300"><GitCompare size={17} /></span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-slate-100">Refresh repository analysis</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-slate-400">
                Build a candidate from the latest pinned ref. Your current graph is unchanged until you explicitly replace it.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close refresh analysis"><X size={16} /></Dialog.Close>
          </div>

          {(state.status === 'idle' || state.status === 'error') && (
            <div className="mt-5 space-y-3">
              <label className="block text-xs text-slate-300">
                Branch, tag, or commit
                <input value={requestedRef} onChange={(event) => setRequestedRef(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" placeholder="Default branch" />
              </label>
              <label className="flex min-h-10 items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={enrichWithAi} onChange={(event) => setEnrichWithAi(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
                Enrich verified groups with the selected AI model (optional)
              </label>
              {state.status === 'error' && <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">{state.error}</p>}
              <button type="button" onClick={() => { setActionMessage(null); void onStart({ requestedRef: requestedRef.trim() || undefined, enrichWithAi }); }} className="min-h-10 w-full rounded-md bg-cyan-500 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
                Analyze candidate
              </button>
            </div>
          )}

          {state.status === 'running' && (
            <div className="mt-5" aria-live="polite" aria-busy="true">
              <div className="flex items-center gap-2 text-sm text-slate-200"><LoaderCircle className="animate-spin text-cyan-300" size={16} />{state.progress.message}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${Math.round(state.progress.progress * 100)}%` }} /></div>
              <p className="mt-1 text-right text-[10px] text-slate-500">{Math.round(state.progress.progress * 100)}%</p>
              <button type="button" onClick={onCancel} className="mt-3 min-h-10 w-full rounded-md border border-red-500/40 text-sm text-red-200 hover:bg-red-500/10">Cancel refresh</button>
            </div>
          )}

          {(state.status === 'ready' || state.status === 'applying') && (
            <section className="mt-5" aria-label="Refresh candidate summary">
              <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
                <p className="font-mono text-[11px] text-slate-400">{state.candidate.summary.sourceCommitSha.slice(0, 8)} → {state.candidate.summary.targetCommitSha.slice(0, 8)}</p>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div><dt className="text-slate-500">Nodes</dt><dd className="mt-1 text-slate-100">{state.candidate.summary.nodes.after} ({delta(state.candidate.summary.nodes.delta)})</dd></div>
                  <div><dt className="text-slate-500">Edges</dt><dd className="mt-1 text-slate-100">{state.candidate.summary.edges.after} ({delta(state.candidate.summary.edges.delta)})</dd></div>
                  <div><dt className="text-slate-500">Files</dt><dd className="mt-1 text-slate-100">{state.candidate.summary.files.after}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-slate-400">{state.candidate.summary.files.analyzed} analyzed · {state.candidate.summary.files.excluded} excluded · {state.candidate.summary.warningCount} warnings</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-amber-200">Replace creates a recoverable local backup, then replaces the whole graph. Manual edits are not merged.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => void onReplace().then((ok) => { setActionMessage(ok ? 'Project replaced. A recovery backup was saved.' : 'The project could not be replaced.'); if (ok) onOpenChange(false); })} className="min-h-10 rounded-md bg-cyan-500 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"><RefreshCw className="mr-1 inline" size={13} />Replace project</button>
                <button type="button" disabled={busy} onClick={() => void onDuplicate().then((id) => { setActionMessage(id ? 'Created and opened a refreshed copy.' : 'The copy could not be created.'); if (id) onOpenChange(false); })} className="min-h-10 rounded-md border border-slate-600 px-3 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Copy className="mr-1 inline" size={13} />Duplicate</button>
                <button type="button" disabled={busy} onClick={onDiscard} className="col-span-2 min-h-10 rounded-md px-3 text-xs text-slate-400 hover:bg-slate-800">Discard candidate</button>
              </div>
            </section>
          )}

          {actionMessage && <p className="mt-3 text-xs text-slate-300" role="status">{actionMessage}</p>}

          {backups.length > 0 && (
            <section className="mt-6 border-t border-slate-700 pt-4">
              <h3 className="text-xs font-semibold text-slate-200">Pre-refresh recovery backups</h3>
              <ul className="mt-2 space-y-1">
                {backups.map((backup) => (
                  <li key={backup.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs hover:bg-slate-800">
                    <ArchiveRestore size={14} className="text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-slate-300">{new Date(backup.createdAt).toLocaleString()} · {backup.sourceCommitSha?.slice(0, 8) ?? 'local'}</span>
                    <button type="button" disabled={busy} onClick={() => void onRestoreBackup(backup.id).then((ok) => setActionMessage(ok ? 'Backup restored.' : 'Backup restore failed.'))} className="min-h-10 rounded px-2 text-cyan-300 hover:bg-slate-700">Restore</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
