'use client';

import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import type {
  ProjectMigrationRecord,
  QuarantinedProjectRecord,
} from '@/lib/project-store';

interface StorageRecoveryNoticeProps {
  storageReady: boolean;
  migration: ProjectMigrationRecord | null;
  quarantinedProjects: QuarantinedProjectRecord[];
}

export default function StorageRecoveryNotice({
  storageReady,
  migration,
  quarantinedProjects,
}: StorageRecoveryNoticeProps) {
  if (!storageReady) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300"
      >
        <Loader2 size={14} className="animate-spin text-cyan-300" aria-hidden="true" />
        Opening the local workspace…
      </div>
    );
  }

  if (!migration || (migration.status === 'completed' && quarantinedProjects.length === 0)) {
    return null;
  }

  const downloadRecovery = () => {
    const payload = JSON.stringify({
      format: 'rassam.migration-recovery',
      exportedAt: new Date().toISOString(),
      migration,
      quarantinedProjects,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rassam-migration-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/50 bg-amber-950/60 px-3 py-2 text-xs text-amber-100"
    >
      <span className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={14} className="shrink-0 text-amber-300" aria-hidden="true" />
        {migration.status === 'failed'
          ? 'The legacy workspace could not be migrated. Its original browser data was preserved.'
          : `${quarantinedProjects.length} legacy project record${quarantinedProjects.length === 1 ? '' : 's'} need recovery. The original browser data was preserved.`}
      </span>
      {quarantinedProjects.length > 0 && (
        <button
          type="button"
          onClick={downloadRecovery}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-600/60 px-3 font-medium text-amber-50 hover:bg-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        >
          <Download size={14} aria-hidden="true" />
          Export recovery records
        </button>
      )}
    </div>
  );
}
