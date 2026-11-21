'use client';

import { AlertTriangle, Check, GitCommit, LoaderCircle, RefreshCw } from 'lucide-react';
import type { RepoDetails } from '@/types';
import type { AnalysisCoverage } from '@/lib/contracts';
import { cn } from '@/lib/utils';

interface WorkspaceStatusProps {
  projectName: string;
  repoDetails: RepoDetails | null;
  saveStatus: 'loading' | 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string | null;
  onRetrySave?: () => void;
  coverage?: AnalysisCoverage;
  warnings?: string[];
  onRefreshAnalysis?: () => void;
  refreshBusy?: boolean;
}

export default function WorkspaceStatus({
  projectName,
  repoDetails,
  saveStatus,
  saveError,
  onRetrySave,
  coverage,
  warnings = [],
  onRefreshAnalysis,
  refreshBusy = false,
}: WorkspaceStatusProps) {
  const commit = repoDetails?.commitSha?.slice(0, 8);
  const ref = repoDetails?.requestedRef || repoDetails?.defaultBranch;

  return (
    <div className="flex min-h-8 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-400">
      <span className="min-w-0 truncate font-medium text-slate-200">{projectName}</span>

      {repoDetails && (
        <span className="hidden min-w-0 items-center gap-1.5 md:flex">
          <GitCommit size={12} aria-hidden="true" />
          <span className="truncate">{ref || 'default branch'}{commit ? ` at ${commit}` : ''}</span>
        </span>
      )}

      {typeof repoDetails?.fileCount === 'number' && (
        <span className="hidden lg:inline">{repoDetails.fileCount.toLocaleString()} files</span>
      )}

      {coverage && (
        <span className="hidden lg:inline">
          {coverage.counts.analyzed.toLocaleString()} analyzed,{' '}
          {(coverage.counts.ignored + coverage.counts.unsupported + coverage.counts.oversized + coverage.counts.failed + coverage.counts.unclassified).toLocaleString()} disclosed outside analysis
        </span>
      )}

      {warnings.length > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-300" title={warnings.join('\n')}>
          <AlertTriangle size={12} aria-hidden="true" />
          {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </span>
      )}

      {repoDetails && onRefreshAnalysis && (
        <button
          type="button"
          onClick={onRefreshAnalysis}
          className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-cyan-300 hover:bg-slate-800"
        >
          <RefreshCw size={12} className={refreshBusy ? 'animate-spin' : undefined} aria-hidden="true" />
          Refresh analysis
        </button>
      )}

      <span className={cn('flex items-center gap-1.5', !repoDetails || !onRefreshAnalysis ? 'ml-auto' : '')} aria-live="polite">
        {saveStatus === 'saving' || saveStatus === 'loading' ? (
          <><LoaderCircle className="animate-spin" size={12} aria-hidden="true" /> Saving</>
        ) : saveStatus === 'error' ? (
          <>
            <AlertTriangle size={12} className="text-amber-300" aria-hidden="true" />
            <span className="text-amber-200">Save failed{saveError ? `: ${saveError}` : ''}</span>
            {onRetrySave && <button type="button" onClick={onRetrySave} className="rounded px-1.5 py-1 text-cyan-300 hover:bg-slate-800">Retry</button>}
          </>
        ) : (
          <><Check size={12} className="text-cyan-300" aria-hidden="true" /> Saved locally</>
        )}
      </span>
    </div>
  );
}
