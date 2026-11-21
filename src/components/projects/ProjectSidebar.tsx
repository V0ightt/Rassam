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
        <nav aria-label="Projects" className="w-full h-full bg-slate-900 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-slate-100 flex items-center gap-2">
                    <FolderOpen size={18} className="text-cyan-400" />
                    Projects
                </h2>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onCreateNew}
                        aria-label="Create project"
                        className="min-h-10 min-w-10 grid place-items-center text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Add new project"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        onClick={onClose}
                        aria-label="Close projects panel"
                        className="min-h-10 min-w-10 grid place-items-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {projects.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm py-8">
                        No projects yet.
                        <br />
                        Create from GitHub or start empty.
                    </div>
                ) : (
                    <ul className="space-y-1">
                    {projects.map((project) => (
                        <li
                            key={project.id}
                            className={cn(
                                'group flex items-stretch rounded-lg border transition-colors',
                                project.id === activeProjectId
                                    ? 'bg-blue-500/20 border border-blue-500/30'
                                    : 'hover:bg-slate-800 border border-transparent',
                            )}
                        >
                            <button
                              type="button"
                              aria-current={project.id === activeProjectId ? 'page' : undefined}
                              onClick={() => onSwitchProject(project.id)}
                              className="min-w-0 flex-1 p-3 text-left rounded-lg"
                            >
                                <span className="block min-w-0">
                                    <div className="text-sm font-medium text-slate-200 truncate">
                                        {project.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        {project.nodes.length} nodes, {project.chatSessions.length} chats
                                    </div>
                                    <div className="text-[10px] text-slate-600 mt-0.5">
                                        {new Date(project.updatedAt).toLocaleDateString()}
                                    </div>
                                </span>
                            </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Delete this project?')) {
                                            onDeleteProject(project.id);
                                        }
                                    }}
                                    aria-label={`Delete ${project.name}`}
                                    className="m-1 min-h-10 min-w-10 grid place-items-center self-center rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 opacity-70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                        </li>
                    ))
                    }</ul>
                )}
            </div>
        </nav>
    );
}

export default memo(ProjectSidebar);
