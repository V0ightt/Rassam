'use client';

import { memo } from 'react';
import { FolderOpen, Plus, X, Trash2 } from 'lucide-react';
import { Project } from '@/types';
import { cn } from '@/lib/utils';

interface ProjectSidebarProps {
    projects: Project[];
    activeProjectId: string | null;
    onSwitchProject: (id: string) => void;
    onDeleteProject: (id: string) => void;
    onCreateNew: () => void;
    onClose: () => void;
}

function ProjectSidebar({
    projects,
    activeProjectId,
    onSwitchProject,
    onDeleteProject,
    onCreateNew,
    onClose,
}: ProjectSidebarProps) {
    return (
        <div className="w-72 h-full bg-slate-900 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-slate-100 flex items-center gap-2">
                    <FolderOpen size={18} className="text-cyan-400" />
                    Projects
                </h2>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onCreateNew}
                        className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                        title="Add new project"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {projects.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm py-8">
                        No projects yet.
                        <br />
                        Create from GitHub or start empty.
                    </div>
                ) : (
                    projects.map((project) => (
                        <div
                            key={project.id}
                            className={cn(
                                'p-3 rounded-lg cursor-pointer transition-all group',
                                project.id === activeProjectId
                                    ? 'bg-blue-500/20 border border-blue-500/30'
                                    : 'hover:bg-slate-800 border border-transparent',
                            )}
                            onClick={() => onSwitchProject(project.id)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-200 truncate">
                                        {project.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        {project.nodes.length} nodes &bull;{' '}
                                        {project.chatSessions.length} chats
                                    </div>
                                    <div className="text-[10px] text-slate-600 mt-0.5">
                                        {new Date(project.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Delete this project?')) {
                                            onDeleteProject(project.id);
                                        }
                                    }}
                                    className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default memo(ProjectSidebar);
