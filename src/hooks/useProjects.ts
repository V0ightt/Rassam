import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Node, Edge } from 'reactflow';
import { CanvasSyncSnapshot, Project, ProjectSource, ChatSession, RepoDetails, RepoFileEntry } from '@/types';
import { parseAndValidateImportJson } from '@/lib/import';

// ── Storage keys ──────────────────────────────────────────────
const STORAGE_KEY_PROJECTS = 'repoAgent_projects';
const STORAGE_KEY_ACTIVE_ID = 'repoAgent_activeProjectId';

// ── Helpers ───────────────────────────────────────────────────
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function createNewProject(
    repoUrl: string,
    repoDetails: RepoDetails | null,
    nodes: Node[],
    edges: Edge[],
    options?: {
        name?: string;
        source?: ProjectSource;
        layoutDirection?: 'TB' | 'LR';
        snapshot?: CanvasSyncSnapshot | null;
        fileTree?: RepoFileEntry[];
    },
): Project {
    const now = new Date();
    const source = options?.source || (repoDetails ? 'github' : 'empty');
    const projectName =
        options?.name ||
        (repoDetails
            ? `${repoDetails.owner}/${repoDetails.repo}`
            : repoUrl || 'New Project');

    const initialChat: ChatSession = {
        id: generateId(),
        title: 'Chat 1',
        messages: [
            {
                id: '1',
                role: 'assistant',
                content:
                    "👋 Hi! I'm **Rassam** (رسّام), your AI assistant for understanding code and flowcharts.\n\n**Quick tips:**\n- Add or edit nodes/edges on the canvas\n- Use the **Sync** button to update my project context\n- Ask questions about selected nodes or the whole architecture\n\nLet's explore this project together!",
                timestamp: now,
            },
        ],
        createdAt: now,
        updatedAt: now,
    };

    return {
        id: generateId(),
        name: projectName,
        repoUrl,
        source,
        repoDetails,
        nodes,
        edges,
        layoutDirection: options?.layoutDirection || 'TB',
        aiContextSnapshot: options?.snapshot || null,
        lastSyncedAt: options?.snapshot?.syncedAt || null,
        chatSessions: [initialChat],
        activeChatSessionId: initialChat.id,
        fileTree: options?.fileTree || [],
        createdAt: now,
        updatedAt: now,
    };
}

// ── Hook interface ────────────────────────────────────────────
export interface UseProjectsParams {
    nodes: Node[];
    edges: Edge[];
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
    selectedNode: Node | null;
    layoutDirection: 'TB' | 'LR';
    setLayoutDirection: (dir: 'TB' | 'LR') => void;
    setSelectedNode: (node: Node | null) => void;
    fitView: (options?: { padding?: number }) => void;
    saveToHistory: () => void;
}

/**
 * Owns all project CRUD, chat-session management, canvas-sync,
 * localStorage persistence, and the "create project" modal UI state.
 */
export function useProjects(params: UseProjectsParams) {
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        selectedNode,
        layoutDirection,
        setLayoutDirection,
        setSelectedNode,
        fitView,
        saveToHistory,
    } = params;

    // ── Core state ────────────────────────────────────────────
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSyncingCanvas, setIsSyncingCanvas] = useState(false);
    const [repoUrl, setRepoUrl] = useState('');
    const [repoDetails, setRepoDetails] = useState<RepoDetails | null>(null);

    // ── Modal / sidebar UI state ──────────────────────────────
    const [showProjectList, setShowProjectList] = useState(false);
    const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
    const [createProjectMode, setCreateProjectMode] = useState<'github' | 'empty' | 'json'>('github');
    const [newProjectUrl, setNewProjectUrl] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const importFileRef = useRef<HTMLInputElement>(null);

    // ── Derived ───────────────────────────────────────────────
    const activeProject = useMemo(
        () => projects.find((p) => p.id === activeProjectId) || null,
        [projects, activeProjectId],
    );

    const activeChatSession = useMemo(() => {
        if (!activeProject) return null;
        return (
            activeProject.chatSessions.find((s) => s.id === activeProject.activeChatSessionId) ||
            null
        );
    }, [activeProject]);

    // ── Persistence: load on mount ────────────────────────────
    useEffect(() => {
        try {
            const savedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS);
            const savedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);

            if (savedProjects) {
                const parsed = JSON.parse(savedProjects);
                const restored: Project[] = parsed.map((p: any) => ({
                    ...p,
                    source: p.source || (p.repoDetails ? 'github' : 'empty'),
                    layoutDirection: p.layoutDirection || 'TB',
                    aiContextSnapshot: p.aiContextSnapshot || null,
                    lastSyncedAt: p.lastSyncedAt || null,
                    fileTree: p.fileTree || [],
                    createdAt: new Date(p.createdAt),
                    updatedAt: new Date(p.updatedAt),
                    chatSessions: p.chatSessions.map((s: any) => ({
                        ...s,
                        createdAt: new Date(s.createdAt),
                        updatedAt: new Date(s.updatedAt),
                        messages: s.messages.map((m: any) => ({
                            ...m,
                            timestamp: new Date(m.timestamp),
                        })),
                    })),
                }));
                setProjects(restored);

                if (savedActiveId && restored.find((p) => p.id === savedActiveId)) {
                    setActiveProjectId(savedActiveId);
                    const project = restored.find((p) => p.id === savedActiveId);
                    if (project) {
                        setNodes(project.nodes);
                        setEdges(project.edges);
                        setRepoDetails(project.repoDetails);
                        setRepoUrl(project.repoUrl);
                        setLayoutDirection(project.layoutDirection || 'TB');
                        setTimeout(() => fitView({ padding: 0.2 }), 200);
                    }
                }
            }
        } catch (e) {
            console.error('Error loading saved state:', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Persistence: save projects array ──────────────────────
    useEffect(() => {
        if (projects.length > 0) {
            localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
            return;
        }
        localStorage.removeItem(STORAGE_KEY_PROJECTS);
    }, [projects]);

    // ── Persistence: save active project ID ───────────────────
    useEffect(() => {
        if (activeProjectId) {
            localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProjectId);
        }
    }, [activeProjectId]);

    // ── Sync canvas state back into the active project ────────
    useEffect(() => {
        if (activeProjectId) {
            setProjects((prev) =>
                prev.map((p) =>
                    p.id === activeProjectId
                        ? { ...p, nodes, edges, layoutDirection, updatedAt: new Date() }
                        : p,
                ),
            );
        }
    }, [nodes, edges, activeProjectId, layoutDirection]);

    // ── Project CRUD ──────────────────────────────────────────

    const createProjectFromGitHub = useCallback(
        async (url: string) => {
            if (!url) return;
            setLoading(true);
            setError(null);
            saveToHistory();

            try {
                const res = await fetch('/api/repo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to fetch');
                }

                const data = await res.json();
                setNodes(data.nodes);
                setEdges(data.edges);
                setRepoDetails(data.repoDetails);
                setRepoUrl(url);
                setLayoutDirection('TB');

                const newProject = createNewProject(url, data.repoDetails, data.nodes, data.edges, {
                    source: 'github',
                    layoutDirection: 'TB',
                    fileTree: data.fileTree || [],
                });
                setProjects((prev) => [...prev, newProject]);
                setActiveProjectId(newProject.id);
                setNewProjectUrl('');

                setTimeout(() => fitView({ padding: 0.2 }), 100);
            } catch (err: any) {
                setError(err.message || 'Error analyzing repository');
            } finally {
                setLoading(false);
            }
        },
        [fitView, saveToHistory, setEdges, setNodes, setLayoutDirection],
    );

    /** Triggered by the header search bar. */
    const handleVisualize = useCallback(async () => {
        if (!repoUrl.trim()) return;
        await createProjectFromGitHub(repoUrl.trim());
    }, [createProjectFromGitHub, repoUrl]);

    /** Wrapper used by CreateProjectModal – closes modals then starts fetch. */
    const startGitHubProjectCreation = useCallback(
        (url: string) => {
            setShowCreateProjectModal(false);
            setShowProjectList(false);
            setRepoUrl(url);
            createProjectFromGitHub(url);
        },
        [createProjectFromGitHub],
    );

    const handleImportProject = useCallback(
        (file: File) => {
            setImportError(null);
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const raw = e.target?.result as string;
                    const imported = parseAndValidateImportJson(raw, file.name);
                    const newProject = createNewProject(
                        imported.repoDetails
                            ? `https://github.com/${imported.repoDetails.owner}/${imported.repoDetails.repo}`
                            : '',
                        imported.repoDetails,
                        imported.nodes,
                        imported.edges,
                        { name: imported.name, source: 'imported', layoutDirection: 'TB' },
                    );
                    setProjects((prev) => [...prev, newProject]);
                    setActiveProjectId(newProject.id);
                    setNodes(imported.nodes);
                    setEdges(imported.edges);
                    setRepoDetails(imported.repoDetails);
                    setRepoUrl(newProject.repoUrl);
                    setLayoutDirection('TB');
                    setSelectedNode(null);
                    setShowCreateProjectModal(false);
                    setShowProjectList(false);
                    setError(null);
                    setImportError(null);
                    setTimeout(() => fitView({ padding: 0.2 }), 100);
                } catch (err: any) {
                    setImportError(err.message || 'Failed to import JSON file.');
                }
            };
            reader.onerror = () => setImportError('Failed to read the file.');
            reader.readAsText(file);
        },
        [fitView, setEdges, setNodes, setSelectedNode, setLayoutDirection],
    );

    const handleCreateEmptyProject = useCallback(() => {
        const trimmed = newProjectName.trim();
        const projectName = trimmed || `Project ${projects.length + 1}`;
        const newProject = createNewProject('', null, [], [], {
            name: projectName,
            source: 'empty',
            layoutDirection,
        });

        setProjects((prev) => [...prev, newProject]);
        setActiveProjectId(newProject.id);
        setNodes([]);
        setEdges([]);
        setRepoDetails(null);
        setRepoUrl('');
        setSelectedNode(null);
        setShowCreateProjectModal(false);
        setShowProjectList(false);
        setNewProjectName('');
        setNewProjectUrl('');
        setError(null);
    }, [layoutDirection, newProjectName, projects.length, setEdges, setNodes, setSelectedNode]);

    const switchToProject = useCallback(
        (projectId: string) => {
            const project = projects.find((p) => p.id === projectId);
            if (!project) return;
            setActiveProjectId(projectId);
            setNodes(project.nodes);
            setEdges(project.edges);
            setRepoDetails(project.repoDetails);
            setRepoUrl(project.repoUrl);
            setLayoutDirection(project.layoutDirection || 'TB');
            setSelectedNode(null);
            setShowProjectList(false);
            setTimeout(() => fitView({ padding: 0.2 }), 100);
        },
        [projects, setNodes, setEdges, fitView, setSelectedNode, setLayoutDirection],
    );

    const deleteProject = useCallback(
        (projectId: string) => {
            setProjects((prev) => {
                const filtered = prev.filter((p) => p.id !== projectId);
                if (projectId === activeProjectId) {
                    if (filtered.length > 0) {
                        const next = filtered[0];
                        setActiveProjectId(next.id);
                        setNodes(next.nodes);
                        setEdges(next.edges);
                        setRepoDetails(next.repoDetails);
                        setRepoUrl(next.repoUrl);
                        setLayoutDirection(next.layoutDirection || 'TB');
                    } else {
                        setActiveProjectId(null);
                        setNodes([]);
                        setEdges([]);
                        setRepoDetails(null);
                        setRepoUrl('');
                        setLayoutDirection('TB');
                        localStorage.removeItem(STORAGE_KEY_PROJECTS);
                        localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
                    }
                }
                return filtered;
            });
        },
        [activeProjectId, setNodes, setEdges, setLayoutDirection],
    );

    // ── Canvas sync ───────────────────────────────────────────

    const handleSyncCanvas = useCallback(() => {
        if (!activeProjectId) {
            setError('Create or select a project before syncing the canvas.');
            return;
        }

        setIsSyncingCanvas(true);
        const syncedAt = new Date().toISOString();

        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== activeProjectId) return p;

                const snapshot: CanvasSyncSnapshot = {
                    syncedAt,
                    project: {
                        id: p.id,
                        name: p.name,
                        source: p.source,
                        repo: p.repoDetails
                            ? `${p.repoDetails.owner}/${p.repoDetails.repo}`
                            : undefined,
                    },
                    layoutDirection,
                    selectedNodeId: selectedNode?.id || null,
                    selectedNodeLabel: selectedNode?.data?.label || null,
                    nodes: nodes.map((n) => ({
                        id: n.id,
                        label: n.data?.label,
                        description: n.data?.description,
                        category: n.data?.category,
                        files: n.data?.files,
                        complexity: n.data?.complexity,
                        dependencies: n.data?.dependencies,
                        exports: n.data?.exports,
                        position: n.position,
                    })),
                    edges: edges.map((e) => ({
                        id: e.id,
                        source: e.source,
                        target: e.target,
                        label: (e.data as any)?.label || e.label,
                        type: (e.data as any)?.type || e.type,
                        strength: (e.data as any)?.strength,
                        direction: (e.data as any)?.direction,
                    })),
                };

                return {
                    ...p,
                    aiContextSnapshot: snapshot,
                    lastSyncedAt: syncedAt,
                    updatedAt: new Date(),
                };
            }),
        );

        setError(null);
        setTimeout(() => setIsSyncingCanvas(false), 250);
    }, [activeProjectId, edges, layoutDirection, nodes, selectedNode]);

    // ── Chat sessions ─────────────────────────────────────────

    const updateChatMessages = useCallback(
        (projectId: string, sessionId: string, messages: ChatSession['messages']) => {
            if (!projectId || !sessionId) return;

            setProjects((prev) =>
                prev.map((p) => {
                    if (p.id !== projectId) return p;

                    const hasSession = p.chatSessions.some((s) => s.id === sessionId);
                    if (!hasSession) return p;

                    return {
                        ...p,
                        chatSessions: p.chatSessions.map((s) =>
                            s.id === sessionId
                                ? { ...s, messages, updatedAt: new Date() }
                                : s,
                        ),
                        updatedAt: new Date(),
                    };
                }),
            );
        },
        [],
    );

    const createNewChatSession = useCallback(() => {
        if (!activeProjectId) return;

        const newSession: ChatSession = {
            id: generateId(),
            title: `Chat ${(activeProject?.chatSessions.length || 0) + 1}`,
            messages: [
                {
                    id: '1',
                    role: 'assistant',
                    content:
                        '🆕 **New conversation started!**\n\nI still have context about the repository. Ask me anything!',
                    timestamp: new Date(),
                },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== activeProjectId) return p;
                return {
                    ...p,
                    chatSessions: [...p.chatSessions, newSession],
                    activeChatSessionId: newSession.id,
                    updatedAt: new Date(),
                };
            }),
        );
    }, [activeProjectId, activeProject?.chatSessions.length]);

    const switchChatSession = useCallback(
        (sessionId: string) => {
            if (!activeProjectId) return;
            setProjects((prev) =>
                prev.map((p) => {
                    if (p.id !== activeProjectId) return p;
                    return { ...p, activeChatSessionId: sessionId, updatedAt: new Date() };
                }),
            );
        },
        [activeProjectId],
    );

    const deleteChatSession = useCallback(
        (sessionId: string) => {
            if (!activeProjectId) return;

            setProjects((prev) =>
                prev.map((p) => {
                    if (p.id !== activeProjectId) return p;
                    const filtered = p.chatSessions.filter((s) => s.id !== sessionId);

                    let nextActiveId = p.activeChatSessionId;
                    if (sessionId === p.activeChatSessionId && filtered.length > 0) {
                        nextActiveId = filtered[0].id;
                    }

                    if (filtered.length === 0) {
                        const fresh: ChatSession = {
                            id: generateId(),
                            title: 'Chat 1',
                            messages: [
                                {
                                    id: '1',
                                    role: 'assistant',
                                    content: '👋 Chat cleared! Ready for new questions.',
                                    timestamp: new Date(),
                                },
                            ],
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        };
                        return {
                            ...p,
                            chatSessions: [fresh],
                            activeChatSessionId: fresh.id,
                            updatedAt: new Date(),
                        };
                    }

                    return {
                        ...p,
                        chatSessions: filtered,
                        activeChatSessionId: nextActiveId,
                        updatedAt: new Date(),
                    };
                }),
            );
        },
        [activeProjectId],
    );

    // ── Return ────────────────────────────────────────────────
    return {
        // Core state
        projects,
        activeProjectId,
        activeProject,
        activeChatSession,
        loading,
        error,
        setError,
        repoUrl,
        setRepoUrl,
        repoDetails,
        isSyncingCanvas,

        // Modal / sidebar UI
        showProjectList,
        setShowProjectList,
        showCreateProjectModal,
        setShowCreateProjectModal,
        createProjectMode,
        setCreateProjectMode,
        newProjectUrl,
        setNewProjectUrl,
        newProjectName,
        setNewProjectName,
        importError,
        setImportError,
        importFileRef,

        // Project operations
        createProjectFromGitHub,
        handleVisualize,
        startGitHubProjectCreation,
        handleImportProject,
        handleCreateEmptyProject,
        switchToProject,
        deleteProject,
        handleSyncCanvas,

        // Chat operations
        updateChatMessages,
        createNewChatSession,
        switchChatSession,
        deleteChatSession,
    };
}
