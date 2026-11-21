'use client';

import { useState } from 'react';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';

import type { ProjectPersistenceConflict } from '@/hooks/useProjects';

interface PersistenceConflictNoticeProps {
  conflict: ProjectPersistenceConflict | null;
  onReload: () => Promise<boolean>;
  onDuplicateLocalWork: () => Promise<string | null>;
}

export default function PersistenceConflictNotice({
  conflict,
  onReload,
  onDuplicateLocalWork,
}: PersistenceConflictNoticeProps) {
  const [busy, setBusy] = useState<'reload' | 'duplicate' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!conflict) return null;
  const reason = conflict.reason === 'deleted'
    ? 'This project was deleted in another tab.'
    : conflict.reason === 'newer-revision'
      ? 'A newer graph revision was saved in another tab.'
      : 'Another tab saved different content at this graph revision.';

  const run = async (action: 'reload' | 'duplicate') => {
    setBusy(action);
    setActionError(null);
    const succeeded = action === 'reload'
      ? await onReload()
      : Boolean(await onDuplicateLocalWork());
    if (!succeeded) setActionError('The recovery action could not be completed. Your local canvas remains unchanged.');
    setBusy(null);
  };

  return (
    <section
      role="alert"
      aria-labelledby="persistence-conflict-title"
      className="flex flex-wrap items-center gap-3 border-b border-amber-700/60 bg-amber-950/75 px-3 py-2 text-xs text-amber-100"
    >
      <AlertTriangle size={16} className="shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-48 flex-1">
        <p id="persistence-conflict-title" className="font-semibold">Saving paused to protect this project</p>
        <p className="mt-0.5 text-amber-200/90">
          {reason} Reload that saved version, or preserve this tab as a new recovery copy. Rassam will not merge or overwrite either version.
        </p>
        {actionError && <p className="mt-1 font-medium text-red-200">{actionError}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('reload')}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-500/60 px-3 font-medium hover:bg-amber-900 disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy === 'reload' ? 'animate-spin' : undefined} aria-hidden="true" />
          Reload saved version
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('duplicate')}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-amber-300 px-3 font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50"
        >
          <Copy size={14} aria-hidden="true" />
          Keep local recovery copy
        </button>
      </div>
    </section>
  );
}
