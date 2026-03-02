'use client';

import { memo, type ReactNode } from 'react';
import { FolderOpen, Files, Settings, Menu, FileCode, ExternalLink, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActivityPanel = 'projects' | 'explorer' | 'settings' | null;

interface ActivityBarProps {
  activePanel: ActivityPanel;
  onPanelChange: (panel: ActivityPanel) => void;
  projectCount?: number;
  cachedFileCount?: number;
  /** Repo info shown at the bottom of the bar */
  repoDetails?: { owner: string; repo: string; fileCount?: number } | null;
  repoUrl?: string;
  /** Slot for ExportPanel (rendered at the bottom, inside ReactFlowProvider tree) */
  exportSlot?: ReactNode;
}

const items: { id: ActivityPanel; icon: typeof FolderOpen; label: string }[] = [
  { id: 'projects', icon: FolderOpen, label: 'Projects' },
  { id: 'explorer', icon: Files, label: 'Explorer' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

function ActivityBar({
  activePanel, onPanelChange, projectCount, cachedFileCount,
  repoDetails, repoUrl, exportSlot,
}: ActivityBarProps) {
  return (
    <div className="w-12 h-full bg-slate-950 border-r border-slate-800 flex flex-col items-center py-2 z-50 shrink-0">
      {/* Burger / Menu toggle */}
      <button
        className="p-2 mb-2 text-slate-500 hover:text-slate-200 rounded-lg transition-colors"
        title="Navigation"
        onClick={() => onPanelChange(activePanel ? null : 'projects')}
      >
        <Menu size={20} />
      </button>

      <div className="w-8 border-t border-slate-800 mb-2" />

      {/* Panel icons */}
      {items.map(({ id, icon: Icon, label }) => {
        const isActive = activePanel === id;
        return (
          <button
            key={id}
            onClick={() => onPanelChange(isActive ? null : id)}
            className={cn(
              'relative w-full flex items-center justify-center py-2.5 transition-colors group',
              isActive
                ? 'text-slate-100'
                : 'text-slate-500 hover:text-slate-300',
            )}
            title={label}
          >
            {/* Active indicator bar */}
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-cyan-400 rounded-r" />
            )}
            <Icon size={20} />
            {/* Badge for projects */}
            {id === 'projects' && projectCount != null && projectCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[14px] h-[14px] bg-blue-500 text-white text-[8px] rounded-full flex items-center justify-center px-0.5 leading-none">
                {projectCount}
              </span>
            )}
            {/* Badge for cached files */}
            {id === 'explorer' && cachedFileCount != null && cachedFileCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[14px] h-[14px] bg-green-500 text-white text-[8px] rounded-full flex items-center justify-center px-0.5 leading-none">
                {cachedFileCount}
              </span>
            )}
          </button>
        );
      })}

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Bottom section: Export + Repo stats ── */}
      <div className="flex flex-col items-center gap-1 w-full">
        <div className="w-8 border-t border-slate-800 mb-1" />

        {/* Export slot */}
        {exportSlot}

        {/* Repo stats */}
        {repoDetails && (
          <>
            {/* Project name */}
            <div
              className="flex flex-col items-center py-1 w-full px-1"
              title={`${repoDetails.owner}/${repoDetails.repo}`}
            >
              <GitBranch size={14} className="text-blue-400" />
              <span className="text-[8px] text-slate-400 mt-0.5 truncate w-10 text-center leading-tight">
                {repoDetails.repo}
              </span>
            </div>

            {/* File count */}
            {repoDetails.fileCount != null && repoDetails.fileCount > 0 && (
              <div
                className="flex flex-col items-center py-1"
                title={`${repoDetails.fileCount} files`}
              >
                <FileCode size={14} className="text-green-400" />
                <span className="text-[9px] text-slate-400 mt-0.5">{repoDetails.fileCount}</span>
              </div>
            )}

            {/* Open in GitHub */}
            {repoUrl && (
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-500 hover:text-slate-200 rounded-lg transition-colors"
                title="Open in GitHub"
              >
                <ExternalLink size={16} />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(ActivityBar);
