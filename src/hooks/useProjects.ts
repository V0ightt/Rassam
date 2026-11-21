import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Node, Edge } from 'reactflow';
import { CanvasSyncSnapshot, EdgeData, Project, ProjectSource, ChatSession, RepoDetails, RepoFileEntry } from '@/types';
import { parseAndValidateImportJson } from '@/lib/import';
import { clearProjectFiles } from '@/lib/file-store';
import { consumeAnalysisResponse, type AnalysisProgressUpdate } from '@/lib/analysis-stream';
import type { AnalysisCoverage, RepositorySnapshot } from '@/lib/contracts';
import { loadModelSettings } from '@/lib/model-settings';
import {
    deleteProjectFromStore,
    createProjectPersistenceToken,
    initializeProjectStorage,
    listRefreshBackups,
    loadProjectFromStore,
    loadRefreshBackup,
    parseLegacyProjectPayload,
    ProjectWriteConflictError,
    saveProjectToStore,
    saveProjectWithRefreshBackup,
    type ProjectPersistenceToken,
    type ProjectMigrationRecord,
    type QuarantinedProjectRecord,
    type RefreshBackupSummary,
} from '@/lib/project-store';
import {
    createProjectRevisionChannel,
    type ProjectRevisionChannel,
    type ProjectRevisionNotice,
} from '@/lib/project-revision-channel';
import {
    assertRefreshCandidateApplies,
    buildRefreshedProject,
    buildRestoredRefreshProject,
    createRefreshAnalysisCandidate,
    type RefreshAnalysisCandidate,
    type RefreshAnalysisState,
} from '@/lib/refresh-analysis';

// ── Storage keys ──────────────────────────────────────────────
const STORAGE_KEY_PROJECTS = 'repoAgent_projects';
const STORAGE_KEY_ACTIVE_ID = 'repoAgent_activeProjectId';

// ── Helpers ───────────────────────────────────────────────────
const generateId = () => crypto.randomUUID();

function selectedAnalysisModelSettings() {
    const settings = loadModelSettings();
    const providerId = settings.selectedProvider;
    const model = settings.selectedModel?.trim();
    if (!providerId || !model) {
        throw new Error('AI enrichment needs a default provider and model. Select one in Settings, or analyze without AI.');
    }
    if (!(settings.enabledModels[providerId] || []).includes(model)) {
        throw new Error('The selected AI enrichment model is not enabled. Enable it in Settings, or analyze without AI.');
    }
    return {
        providerId,
        model,
        maxTokens: settings.maxOutputTokens,
        temperature: settings.temperature,
    };
}

export type ProjectSaveStatus = 'loading' | 'saving' | 'saved' | 'error';

export interface ProjectPersistenceConflict {
    projectId: string;
    reason: 'newer-revision' | 'different-content' | 'deleted';
    localGraphRevision: number;
    externalGraphRevision: number;
    externalChecksum: string;
    detectedAt: string;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalNodes(nodes: Node[]): Node[] {
    return nodes.map((node) => {
        const { selected, dragging, style, ...persistent } = node;
        void selected;
        void dragging;
        void style;
        return {
            ...persistent,
            position: { ...node.position },
            data: { ...node.data },
        };
    });
}

function canonicalEdges(edges: Edge[]): Edge[] {
    return edges.map((edge) => {
        const { selected, ...persistent } = edge;
        void selected;
        return {
            ...persistent,
            data: edge.data ? { ...edge.data } : edge.data,
        };
    });
}

function validateGraph(nodes: Node[], edges: Edge[]): void {
    if (nodes.length > 2_000 || edges.length > 5_000) throw new Error('The canvas exceeds the supported graph size.');
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (nodeIds.size !== nodes.length) throw new Error('The canvas contains duplicate node IDs.');
    if (nodes.some((node) => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) {
        throw new Error('The canvas contains invalid node coordinates.');
    }
    const edgeIds = new Set(edges.map((edge) => edge.id));
    if (edgeIds.size !== edges.length) throw new Error('The canvas contains duplicate edge IDs.');
    if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
        throw new Error('The canvas contains a dangling edge.');
    }
}

function buildCanvasSyncSnapshot(
    project: Pick<Project, 'id' | 'name' | 'source' | 'repoDetails'>,
    nodes: Node[],
    edges: Edge[],
    layoutDirection: 'TB' | 'LR',
    syncedAt: string,
    graphRevision: number,
): CanvasSyncSnapshot {
    return {
        syncedAt,
        graphRevision,
        project: {
            id: project.id,
            name: project.name,
            source: project.source,
            repo: project.repoDetails
                ? `${project.repoDetails.owner}/${project.repoDetails.repo}`
                : undefined,
        },
        layoutDirection,
        selectedNodeId: null,
        selectedNodeLabel: null,
        nodes: nodes.map((n) => ({
            id: n.id,
            label: n.data?.label,
            description: n.data?.description,
            category: n.data?.category,
            files: n.data?.files,
            complexity: n.data?.complexity,
            dependencies: n.data?.dependencies,
            exports: n.data?.exports,
            evidence: n.data?.evidence,
            confidence: n.data?.confidence,
            analysisLevel: n.data?.analysisLevel,
            position: n.position,
        })),
        edges: edges.map((e) => {
            const edgeData = e.data as Partial<EdgeData> | undefined;

            return {
                id: e.id,
                source: e.source,
                target: e.target,
                label: edgeData?.label || (typeof e.label === 'string' ? e.label : undefined),
                type: edgeData?.type || e.type,
                strength: edgeData?.strength,
                direction: edgeData?.direction,
                evidence: edgeData?.evidence,
                confidence: edgeData?.confidence,
            };
        }),
    };
}

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
        repositorySnapshot?: RepositorySnapshot;
        analysisCoverage?: AnalysisCoverage;
        analysisWarnings?: string[];
        analyzer?: Record<string, unknown>;
        graphRevision?: number;
        chatSessions?: ChatSession[];
        activeChatSessionId?: string | null;
        createdAt?: Date;
        updatedAt?: Date;
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
                id: generateId(),
                role: 'assistant',
                content: 'Welcome to **Rassam**. Select a component or relationship to inspect its source evidence, then ask a grounded question about the pinned repository revision.',
                timestamp: now,
            },
        ],
        createdAt: now,
        updatedAt: now,
    };

    const restoredChats = options?.chatSessions?.length ? options.chatSessions : [initialChat];
    const restoredActiveChat = options?.activeChatSessionId
        && restoredChats.some((session) => session.id === options.activeChatSessionId)
        ? options.activeChatSessionId
        : restoredChats[0]?.id || null;

    return {
        schemaVersion: 2,
        graphRevision: options?.graphRevision || 0,
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
        chatSessions: restoredChats,
        activeChatSessionId: restoredActiveChat,
        fileTree: options?.fileTree || [],
        repositorySnapshot: options?.repositorySnapshot,
        analysisCoverage: options?.analysisCoverage,
        analysisWarnings: options?.analysisWarnings,
        analyzer: options?.analyzer,
        createdAt: options?.createdAt || now,
        updatedAt: options?.updatedAt || now,
    };
}

// ── Hook interface ────────────────────────────────────────────
export interface UseProjectsParams {
    nodes: Node[];
    edges: Edge[];
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
    layoutDirection: 'TB' | 'LR';
    setLayoutDirection: (dir: 'TB' | 'LR') => void;
    setSelectedNode: (node: Node | null) => void;
    fitView: (options?: { padding?: number }) => void;
}

/**
 * Owns all project CRUD, chat-session management, canvas-sync,
 * versioned IndexedDB persistence, legacy recovery, and project modal state.
 */
export function useProjects(params: UseProjectsParams) {
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        layoutDirection,
        setLayoutDirection,
        setSelectedNode,
        fitView,
    } = params;

    // ── Core state ────────────────────────────────────────────
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressUpdate | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [repoUrl, setRepoUrl] = useState('');
    const [repoDetails, setRepoDetails] = useState<RepoDetails | null>(null);
    const [storageReady, setStorageReady] = useState(false);
    const [saveStatus, setSaveStatus] = useState<ProjectSaveStatus>('loading');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [migration, setMigration] = useState<ProjectMigrationRecord | null>(null);
    const [quarantinedProjects, setQuarantinedProjects] = useState<QuarantinedProjectRecord[]>([]);
    const [refreshAnalysis, setRefreshAnalysis] = useState<RefreshAnalysisState>({ status: 'idle' });
    const [refreshBackups, setRefreshBackups] = useState<RefreshBackupSummary[]>([]);
    const [projectConflicts, setProjectConflicts] = useState<Record<string, ProjectPersistenceConflict>>({});

    // ── Modal / sidebar UI state ──────────────────────────────
    const [showProjectList, setShowProjectList] = useState(false);
    const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
    const [createProjectMode, setCreateProjectMode] = useState<'github' | 'empty' | 'json'>('github');
    const [newProjectUrl, setNewProjectUrl] = useState('');
    const [newProjectRef, setNewProjectRef] = useState('');
    const [enrichWithAi, setEnrichWithAi] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const importFileRef = useRef<HTMLInputElement>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);
    const refreshAnalysisAbortRef = useRef<AbortController | null>(null);

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

    const activeProjectConflict = useMemo(
        () => activeProjectId ? projectConflicts[activeProjectId] ?? null : null,
        [activeProjectId, projectConflicts],
    );

    // ── Persistence: load on mount ────────────────────────────
    const initializationStartedRef = useRef(false);
    const hydrationMountedRef = useRef(false);
    const initializationPromiseRef = useRef<Promise<void> | null>(null);
    const projectsRef = useRef<Project[]>([]);
    const activeProjectIdRef = useRef<string | null>(null);
    const persistedProjectRefs = useRef<Map<string, Project>>(new Map());
    const persistedTokensRef = useRef<Map<string, ProjectPersistenceToken>>(new Map());
    const projectConflictsRef = useRef<Map<string, ProjectPersistenceConflict>>(new Map());
    const revisionChannelRef = useRef<ProjectRevisionChannel | null>(null);
    const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const saveChainsRef = useRef<Map<string, Promise<void>>>(new Map());
    const pendingStorageOperationsRef = useRef(0);
    const currentStorageErrorRef = useRef<string | null>(null);

    // ── Persistence: save projects array (debounced) ──────────
    // The legacy project array is deliberately never rewritten or removed.

    // ── Persistence: save active project ID ───────────────────
    // Only the small active-project preference remains in localStorage.

    // ── Sync canvas state back into the active project (debounced) ──
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const layoutDirectionRef = useRef(layoutDirection);
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    useEffect(() => { layoutDirectionRef.current = layoutDirection; }, [layoutDirection]);

    const activateProject = useCallback((project: Project | null, fitDelay = 100) => {
        activeProjectIdRef.current = project?.id ?? null;
        setActiveProjectId(project?.id ?? null);
        setNodes(project?.nodes ?? []);
        setEdges(project?.edges ?? []);
        setRepoDetails(project?.repoDetails ?? null);
        setRepoUrl(project?.repoUrl ?? '');
        setLayoutDirection(project?.layoutDirection ?? 'TB');
        setSelectedNode(null);
        if (project) setTimeout(() => fitView({ padding: 0.2 }), fitDelay);
    }, [fitView, setEdges, setLayoutDirection, setNodes, setSelectedNode]);

    useEffect(() => {
        // React StrictMode mounts, unmounts and re-mounts in development. The
        // hydration started by the first mount must still apply its result on
        // the second mount, so "disposed" tracks the live mount, not the run.
        hydrationMountedRef.current = true;
        if (initializationStartedRef.current) {
            return () => { hydrationMountedRef.current = false; };
        }
        initializationStartedRef.current = true;
        const isDisposed = () => !hydrationMountedRef.current;

        const hydrate = async () => {
            const legacyPayload = localStorage.getItem(STORAGE_KEY_PROJECTS);
            const savedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
            try {
                const initialized = await initializeProjectStorage(legacyPayload);
                if (isDisposed()) return;
                projectsRef.current = initialized.projects;
                persistedProjectRefs.current = new Map(
                    initialized.projects.map((project) => [project.id, project]),
                );
                persistedTokensRef.current = new Map(
                    initialized.projects.map((project) => [
                        project.id,
                        initialized.persistenceTokens?.[project.id]
                            ?? createProjectPersistenceToken(project),
                    ]),
                );
                setProjects(initialized.projects);
                setMigration(initialized.migration);
                setQuarantinedProjects(initialized.quarantined);
                const active = initialized.projects.find((project) => project.id === savedActiveId)
                    ?? initialized.projects[0]
                    ?? null;
                activateProject(active, 200);
                setSaveStatus('saved');
            } catch (storageFailure) {
                if (isDisposed()) return;
                // Restricted/private browser contexts may reject IndexedDB. In
                // that case the copy-first legacy backup is usable in memory,
                // but the UI is told that changes are not durable.
                const fallback = parseLegacyProjectPayload(legacyPayload);
                projectsRef.current = fallback.projects;
                persistedProjectRefs.current = new Map(
                    fallback.projects.map((project) => [project.id, project]),
                );
                persistedTokensRef.current = new Map(
                    fallback.projects.map((project) => [project.id, createProjectPersistenceToken(project)]),
                );
                setProjects(fallback.projects);
                const active = fallback.projects.find((project) => project.id === savedActiveId)
                    ?? fallback.projects[0]
                    ?? null;
                activateProject(active, 200);
                const message = errorMessage(storageFailure, 'Project storage is unavailable.');
                currentStorageErrorRef.current = message;
                setSaveError(message);
                setSaveStatus('error');
            } finally {
                if (!isDisposed()) setStorageReady(true);
            }
        };

        initializationPromiseRef.current = hydrate();
        void initializationPromiseRef.current;
        return () => { hydrationMountedRef.current = false; };
    }, [activateProject]);

    const waitForStorageInitialization = useCallback(async () => {
        await initializationPromiseRef.current;
    }, []);

    const recordPersistenceConflict = useCallback((
        projectId: string,
        external: ProjectPersistenceToken | null,
        deleted = false,
    ) => {
        const timer = saveTimersRef.current.get(projectId);
        if (timer) {
            clearTimeout(timer);
            saveTimersRef.current.delete(projectId);
        }
        const local = projectsRef.current.find((project) => project.id === projectId);
        if (!local) return;
        const conflict: ProjectPersistenceConflict = {
            projectId,
            reason: deleted || external === null
                ? 'deleted'
                : external.graphRevision > local.graphRevision
                    ? 'newer-revision'
                    : 'different-content',
            localGraphRevision: local.graphRevision,
            externalGraphRevision: external?.graphRevision ?? local.graphRevision,
            externalChecksum: external?.checksum ?? '',
            detectedAt: new Date().toISOString(),
        };
        projectConflictsRef.current.set(projectId, conflict);
        setProjectConflicts(Object.fromEntries(projectConflictsRef.current));
        const message = deleted || external === null
            ? 'This project was deleted in another browser tab. Autosave is paused.'
            : 'This project changed in another browser tab. Autosave is paused until you reload it or duplicate your local work.';
        currentStorageErrorRef.current = message;
        setSaveError(message);
        setSaveStatus('error');
    }, []);

    const clearPersistenceConflict = useCallback((projectId: string) => {
        projectConflictsRef.current.delete(projectId);
        setProjectConflicts(Object.fromEntries(projectConflictsRef.current));
        if (projectConflictsRef.current.size === 0) {
            currentStorageErrorRef.current = null;
            setSaveError(null);
            setSaveStatus(pendingStorageOperationsRef.current > 0 ? 'saving' : 'saved');
        }
    }, []);

    const persistProject = useCallback(async (project: Project) => {
        if (projectConflictsRef.current.has(project.id)) {
            throw new Error('Autosave is paused for this project until its cross-tab conflict is resolved.');
        }
        const expected = persistedTokensRef.current.get(project.id) ?? null;
        try {
            const receipt = await saveProjectToStore(project, expected);
            const token = receipt?.token ?? createProjectPersistenceToken(project);
            persistedTokensRef.current.set(project.id, token);
            revisionChannelRef.current?.publish({ kind: 'saved', projectId: project.id, token });
            return token;
        } catch (storageFailure) {
            if (storageFailure instanceof ProjectWriteConflictError) {
                recordPersistenceConflict(project.id, storageFailure.actual);
            }
            throw storageFailure;
        }
    }, [recordPersistenceConflict]);

    const queueStorageOperation = useCallback((projectId: string, operation: () => Promise<void>) => {
        pendingStorageOperationsRef.current += 1;
        currentStorageErrorRef.current = null;
        setSaveError(null);
        setSaveStatus('saving');
        const previous = saveChainsRef.current.get(projectId) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(operation)
            .then(() => {
                pendingStorageOperationsRef.current -= 1;
                if (pendingStorageOperationsRef.current === 0 && !currentStorageErrorRef.current) {
                    setSaveStatus('saved');
                }
            })
            .catch((storageFailure: unknown) => {
                pendingStorageOperationsRef.current -= 1;
                if (projectConflictsRef.current.has(projectId)) throw storageFailure;
                const message = errorMessage(storageFailure, 'Failed to save project changes.');
                currentStorageErrorRef.current = message;
                setSaveError(message);
                setSaveStatus('error');
                throw storageFailure;
            });
        saveChainsRef.current.set(projectId, next);
        void next.finally(() => {
            if (saveChainsRef.current.get(projectId) === next) {
                saveChainsRef.current.delete(projectId);
            }
        }).catch(() => undefined);
        return next;
    }, []);

    const scheduleProjectSave = useCallback((projectId: string) => {
        if (projectConflictsRef.current.has(projectId)) return;
        const existing = saveTimersRef.current.get(projectId);
        if (existing) clearTimeout(existing);
        setSaveStatus('saving');
        const timer = setTimeout(() => {
            saveTimersRef.current.delete(projectId);
            const latest = projectsRef.current.find((project) => project.id === projectId);
            if (!latest) return;
            void queueStorageOperation(projectId, async () => { await persistProject(latest); }).catch(() => undefined);
        }, 350);
        saveTimersRef.current.set(projectId, timer);
    }, [persistProject, queueStorageOperation]);

    useEffect(() => {
        if (!storageReady) return;
        const previous = persistedProjectRefs.current;
        const current = new Map<string, Project>();
        projects.forEach((project) => {
            current.set(project.id, project);
            if (previous.get(project.id) !== project) scheduleProjectSave(project.id);
        });
        persistedProjectRefs.current = current;
    }, [projects, scheduleProjectSave, storageReady]);

    useEffect(() => {
        if (!storageReady) return;
        if (activeProjectId) localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProjectId);
        else localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
    }, [activeProjectId, storageReady]);

    const projectWithLiveCanvas = useCallback((project: Project): Project => {
        const syncedAt = new Date().toISOString();
        const nextNodes = canonicalNodes(nodesRef.current);
        const nextEdges = canonicalEdges(edgesRef.current);
        validateGraph(nextNodes, nextEdges);
        const graphChanged = project.layoutDirection !== layoutDirectionRef.current
            || JSON.stringify(project.nodes) !== JSON.stringify(nextNodes)
            || JSON.stringify(project.edges) !== JSON.stringify(nextEdges);
        const graphRevision = project.graphRevision + (graphChanged ? 1 : 0);
        return {
            ...project,
            nodes: nextNodes,
            edges: nextEdges,
            graphRevision,
            layoutDirection: layoutDirectionRef.current,
            aiContextSnapshot: buildCanvasSyncSnapshot(
                project,
                nextNodes,
                nextEdges,
                layoutDirectionRef.current,
                syncedAt,
                graphRevision,
            ),
            lastSyncedAt: syncedAt,
            updatedAt: new Date(),
        };
    }, []);

    const commitActiveGraph = useCallback((
        nextNodesInput: Node[],
        nextEdgesInput: Edge[],
        nextLayoutDirection = layoutDirectionRef.current,
    ): number => {
        const projectId = activeProjectIdRef.current;
        if (!projectId) throw new Error('No active project is available.');
        const current = projectsRef.current.find((project) => project.id === projectId);
        if (!current) throw new Error('The active project no longer exists.');
        const nextNodes = canonicalNodes(nextNodesInput);
        const nextEdges = canonicalEdges(nextEdgesInput);
        validateGraph(nextNodes, nextEdges);
        const syncedAt = new Date().toISOString();
        const graphRevision = current.graphRevision + 1;
        const updated: Project = {
            ...current,
            nodes: nextNodes,
            edges: nextEdges,
            layoutDirection: nextLayoutDirection,
            graphRevision,
            aiContextSnapshot: buildCanvasSyncSnapshot(
                current,
                nextNodes,
                nextEdges,
                nextLayoutDirection,
                syncedAt,
                graphRevision,
            ),
            lastSyncedAt: syncedAt,
            updatedAt: new Date(),
        };
        const updatedProjects = projectsRef.current.map((project) => (
            project.id === projectId ? updated : project
        ));
        projectsRef.current = updatedProjects;
        persistedProjectRefs.current.set(projectId, updated);
        setProjects(updatedProjects);
        void queueStorageOperation(projectId, async () => { await persistProject(updated); }).catch(() => undefined);
        return graphRevision;
    }, [persistProject, queueStorageOperation]);

    const flushProject = useCallback(async (projectId: string, includeLiveCanvas = false) => {
        const timer = saveTimersRef.current.get(projectId);
        if (timer) {
            clearTimeout(timer);
            saveTimersRef.current.delete(projectId);
        }
        const current = projectsRef.current.find((project) => project.id === projectId);
        if (!current) return;
        const latest = includeLiveCanvas ? projectWithLiveCanvas(current) : current;
        if (latest !== current) {
            const updatedProjects = projectsRef.current.map((project) => (
                project.id === projectId ? latest : project
            ));
            projectsRef.current = updatedProjects;
            persistedProjectRefs.current.set(projectId, latest);
            setProjects(updatedProjects);
        }
        await queueStorageOperation(projectId, async () => { await persistProject(latest); });
    }, [persistProject, projectWithLiveCanvas, queueStorageOperation]);

    const flushActiveProject = useCallback(async () => {
        const projectId = activeProjectIdRef.current;
        if (!projectId || !storageReady) return;
        await flushProject(projectId, true);
    }, [flushProject, storageReady]);

    useEffect(() => {
        if (!storageReady) return;
        const handleRevisionNotice = (notice: ProjectRevisionNotice) => {
            const localProject = projectsRef.current.find((project) => project.id === notice.projectId);
            if (!localProject) return;
            const persisted = persistedTokensRef.current.get(notice.projectId) ?? null;
            if (notice.kind === 'deleted') {
                recordPersistenceConflict(notice.projectId, null, true);
                return;
            }
            if (
                persisted?.graphRevision === notice.token.graphRevision
                && persisted.checksum === notice.token.checksum
            ) {
                return;
            }
            const localToken = createProjectPersistenceToken(localProject);
            if (localToken.checksum === notice.token.checksum) {
                persistedTokensRef.current.set(notice.projectId, notice.token);
                clearPersistenceConflict(notice.projectId);
                return;
            }
            if (persisted && notice.token.graphRevision < persisted.graphRevision) return;
            recordPersistenceConflict(notice.projectId, notice.token);
        };

        const channel = createProjectRevisionChannel(handleRevisionNotice);
        revisionChannelRef.current = channel;
        return () => {
            if (revisionChannelRef.current === channel) revisionChannelRef.current = null;
            channel.close();
        };
    }, [clearPersistenceConflict, recordPersistenceConflict, storageReady]);

    useEffect(() => {
        if (!storageReady) return;
        const flushOnPageExit = () => {
            const activeId = activeProjectIdRef.current;
            projectsRef.current.forEach((project) => {
                void flushProject(project.id, project.id === activeId).catch(() => undefined);
            });
        };
        const flushWhenHidden = () => {
            if (document.visibilityState === 'hidden') flushOnPageExit();
        };
        window.addEventListener('pagehide', flushOnPageExit);
        document.addEventListener('visibilitychange', flushWhenHidden);
        return () => {
            window.removeEventListener('pagehide', flushOnPageExit);
            document.removeEventListener('visibilitychange', flushWhenHidden);
            flushOnPageExit();
        };
    }, [flushProject, storageReady]);

    // ── Project CRUD ──────────────────────────────────────────

    const createProjectFromGitHub = useCallback(
        async (url: string, requestedRef?: string, requestEnrichment = false) => {
            if (!url) return false;
            await waitForStorageInitialization();
            analysisAbortRef.current?.abort();
            const controller = new AbortController();
            analysisAbortRef.current = controller;
            setLoading(true);
            setError(null);
            setAnalysisProgress({ stage: 'validate', message: 'Validating repository request', progress: 0 });

            try {
                const modelSettings = requestEnrichment ? selectedAnalysisModelSettings() : undefined;
                const res = await fetch('/api/repo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url,
                        ...(requestedRef?.trim() ? { ref: requestedRef.trim() } : {}),
                        enrichWithAi: requestEnrichment,
                        ...(modelSettings ? { modelSettings } : {}),
                    }),
                    signal: controller.signal,
                });
                const data = await consumeAnalysisResponse(res, setAnalysisProgress);
                if (controller.signal.aborted) return false;
                await flushActiveProject().catch(() => undefined);

                const newProject = createNewProject(url, data.repoDetails, data.nodes, data.edges, {
                    source: 'github',
                    layoutDirection: 'TB',
                    fileTree: data.fileTree || [],
                    repositorySnapshot: data.snapshot,
                    analysisCoverage: data.coverage,
                    analysisWarnings: data.warnings,
                    analyzer: data.analyzer,
                });
                const nextProjects = [...projectsRef.current, newProject];
                projectsRef.current = nextProjects;
                activeProjectIdRef.current = newProject.id;
                setProjects(nextProjects);
                activateProject(newProject);
                setNewProjectUrl('');
                setNewProjectRef('');
                setAnalysisProgress({ stage: 'save', message: 'Project saved', progress: 1 });
                return true;
            } catch (err: unknown) {
                if (controller.signal.aborted) return false;
                setError(errorMessage(err, 'Error analyzing repository'));
                return false;
            } finally {
                if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
                setLoading(false);
            }
        },
        [activateProject, flushActiveProject, waitForStorageInitialization],
    );

    /** Triggered by the header search bar. */
    const handleVisualize = useCallback(async () => {
        if (!repoUrl.trim()) return;
        await createProjectFromGitHub(repoUrl.trim());
    }, [createProjectFromGitHub, repoUrl]);

    /** Keeps the creation dialog visible while repository analysis runs. */
    const startGitHubProjectCreation = useCallback(
        async (url: string, requestEnrichment = enrichWithAi) => {
            setRepoUrl(url);
            const created = await createProjectFromGitHub(url, newProjectRef, requestEnrichment);
            if (created) {
                setShowCreateProjectModal(false);
                setShowProjectList(false);
            }
        },
        [createProjectFromGitHub, enrichWithAi, newProjectRef],
    );

    const cancelRepositoryAnalysis = useCallback(() => {
        analysisAbortRef.current?.abort();
        setAnalysisProgress((current) => current
            ? { ...current, message: 'Cancelling repository analysis' }
            : current);
    }, []);

    useEffect(() => () => {
        analysisAbortRef.current?.abort();
        refreshAnalysisAbortRef.current?.abort();
    }, []);

    const handleImportProject = useCallback(
        (file: File) => {
            setImportError(null);
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    await waitForStorageInitialization();
                    const raw = e.target?.result as string;
                    const imported = parseAndValidateImportJson(raw, file.name);
                    const newProject = createNewProject(
                        imported.repoDetails
                            ? `https://github.com/${imported.repoDetails.owner}/${imported.repoDetails.repo}`
                            : '',
                        imported.repoDetails,
                        imported.nodes,
                        imported.edges,
                        {
                            name: imported.name,
                            source: imported.source,
                            layoutDirection: imported.layoutDirection,
                            repositorySnapshot: imported.repositorySnapshot,
                            analysisCoverage: imported.analysisCoverage,
                            analysisWarnings: imported.analysisWarnings,
                            analyzer: imported.analyzer,
                            graphRevision: imported.graphRevision,
                            chatSessions: imported.chatSessions,
                            activeChatSessionId: imported.activeChatSessionId,
                            fileTree: imported.fileTree,
                            createdAt: imported.createdAt,
                            updatedAt: imported.updatedAt,
                        },
                    );
                    await flushActiveProject().catch(() => undefined);
                    const nextProjects = [...projectsRef.current, newProject];
                    projectsRef.current = nextProjects;
                    activeProjectIdRef.current = newProject.id;
                    setProjects(nextProjects);
                    activateProject(newProject);
                    setShowCreateProjectModal(false);
                    setShowProjectList(false);
                    setError(null);
                    setImportError(null);
                } catch (err: unknown) {
                    setImportError(errorMessage(err, 'Failed to import JSON file.'));
                }
            };
            reader.onerror = () => setImportError('Failed to read the file.');
            reader.readAsText(file);
        },
        [activateProject, flushActiveProject, waitForStorageInitialization],
    );

    const handleCreateEmptyProject = useCallback(async () => {
        await waitForStorageInitialization();
        const trimmed = newProjectName.trim();
        const projectName = trimmed || `Project ${projectsRef.current.length + 1}`;
        const newProject = createNewProject('', null, [], [], {
            name: projectName,
            source: 'empty',
            layoutDirection,
        });

        await flushActiveProject().catch(() => undefined);
        const nextProjects = [...projectsRef.current, newProject];
        projectsRef.current = nextProjects;
        activeProjectIdRef.current = newProject.id;
        setProjects(nextProjects);
        activateProject(newProject);
        setShowCreateProjectModal(false);
        setShowProjectList(false);
        setNewProjectName('');
        setNewProjectUrl('');
        setError(null);
    }, [activateProject, flushActiveProject, layoutDirection, newProjectName, waitForStorageInitialization]);

    const switchToProject = useCallback(
        async (projectId: string) => {
            await waitForStorageInitialization();
            if (projectId === activeProjectIdRef.current) {
                setShowProjectList(false);
                return;
            }
            await flushActiveProject().catch(() => undefined);
            const project = projectsRef.current.find((candidate) => candidate.id === projectId);
            if (!project) return;
            activeProjectIdRef.current = projectId;
            activateProject(project);
            setShowProjectList(false);
        },
        [activateProject, flushActiveProject, waitForStorageInitialization],
    );

    const deleteProject = useCallback(
        async (projectId: string) => {
            await waitForStorageInitialization();
            if (projectConflictsRef.current.has(projectId)) {
                setSaveError('Resolve the cross-tab conflict before deleting this project.');
                setSaveStatus('error');
                return;
            }
            if (refreshAnalysis.projectId === projectId && refreshAnalysis.status === 'running') {
                refreshAnalysisAbortRef.current?.abort();
                refreshAnalysisAbortRef.current = null;
            }
            try {
                await flushProject(projectId, projectId === activeProjectIdRef.current);
                const expected = persistedTokensRef.current.get(projectId);
                if (!expected) throw new Error('The persisted project version is unavailable.');
                await queueStorageOperation(projectId, async () => {
                    try {
                        await deleteProjectFromStore(projectId, expected);
                    } catch (storageFailure) {
                        if (storageFailure instanceof ProjectWriteConflictError) {
                            recordPersistenceConflict(projectId, storageFailure.actual);
                        }
                        throw storageFailure;
                    }
                });
                revisionChannelRef.current?.publish({ kind: 'deleted', projectId, token: expected });
            } catch {
                return;
            }

            const filtered = projectsRef.current.filter((project) => project.id !== projectId);
            projectsRef.current = filtered;
            persistedProjectRefs.current.delete(projectId);
            persistedTokensRef.current.delete(projectId);
            clearPersistenceConflict(projectId);
            setProjects(filtered);

            if (projectId === activeProjectIdRef.current) {
                const next = filtered[0] ?? null;
                activeProjectIdRef.current = next?.id ?? null;
                activateProject(next);
            }

            await clearProjectFiles(projectId).catch(() => undefined);
            setRefreshAnalysis((current) => current.projectId === projectId ? { status: 'idle' } : current);
            setRefreshBackups((current) => current.filter((backup) => backup.projectId !== projectId));
        },
        [
            activateProject,
            clearPersistenceConflict,
            flushProject,
            queueStorageOperation,
            recordPersistenceConflict,
            refreshAnalysis,
            waitForStorageInitialization,
        ],
    );

    const startRefreshAnalysis = useCallback(async (options?: {
        projectId?: string;
        requestedRef?: string;
        enrichWithAi?: boolean;
    }): Promise<RefreshAnalysisCandidate | null> => {
        await waitForStorageInitialization();
        const projectId = options?.projectId ?? activeProjectIdRef.current;
        if (!projectId) {
            setRefreshAnalysis({ status: 'error', projectId: '', error: 'No project is available to refresh.' });
            return null;
        }

        try {
            await flushProject(projectId, projectId === activeProjectIdRef.current);
        } catch (storageFailure) {
            setRefreshAnalysis({
                status: 'error',
                projectId,
                error: errorMessage(storageFailure, 'Save the current project before refreshing it.'),
            });
            return null;
        }
        const sourceProject = projectsRef.current.find((project) => project.id === projectId);
        if (
            !sourceProject
            || sourceProject.source !== 'github'
            || !sourceProject.repoUrl
            || !sourceProject.repoDetails?.commitSha
        ) {
            setRefreshAnalysis({
                status: 'error',
                projectId,
                error: 'Only a pinned GitHub project can be refreshed.',
            });
            return null;
        }

        refreshAnalysisAbortRef.current?.abort();
        const controller = new AbortController();
        refreshAnalysisAbortRef.current = controller;
        const startedAt = new Date().toISOString();
        const requestedRef = options?.requestedRef?.trim()
            || sourceProject.repositorySnapshot?.requestedRef
            || sourceProject.repoDetails.requestedRef
            || sourceProject.repoDetails.defaultBranch
            || sourceProject.repoDetails.commitSha;
        let latestProgress: AnalysisProgressUpdate = {
            stage: 'validate',
            message: 'Validating refresh request',
            progress: 0,
        };
        setRefreshAnalysis({ status: 'running', projectId, progress: latestProgress });

        try {
            const requestEnrichment = options?.enrichWithAi === true;
            const modelSettings = requestEnrichment ? selectedAnalysisModelSettings() : undefined;
            const response = await fetch('/api/repo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: sourceProject.repoUrl,
                    ref: requestedRef,
                    enrichWithAi: requestEnrichment,
                    ...(modelSettings ? { modelSettings } : {}),
                }),
                signal: controller.signal,
            });
            const result = await consumeAnalysisResponse(response, (progress) => {
                latestProgress = progress;
                if (refreshAnalysisAbortRef.current === controller && !controller.signal.aborted) {
                    setRefreshAnalysis({ status: 'running', projectId, progress });
                }
            });
            if (controller.signal.aborted || refreshAnalysisAbortRef.current !== controller) return null;
            const stillExists = projectsRef.current.some((project) => project.id === projectId);
            if (!stillExists) throw new Error('The project was deleted while refresh analysis was running.');
            const candidate = createRefreshAnalysisCandidate(sourceProject, result, {
                startedAt,
                completedAt: new Date().toISOString(),
            });
            const readyProgress: AnalysisProgressUpdate = {
                stage: 'save',
                message: 'Candidate ready for review',
                progress: 1,
            };
            setRefreshAnalysis({
                status: 'ready',
                projectId,
                progress: readyProgress,
                candidate,
            });
            return candidate;
        } catch (refreshFailure) {
            if (controller.signal.aborted) {
                if (refreshAnalysisAbortRef.current === controller) {
                    setRefreshAnalysis({ status: 'error', projectId, error: 'Refresh analysis was cancelled.' });
                }
                return null;
            }
            if (refreshAnalysisAbortRef.current !== controller) return null;
            setRefreshAnalysis({
                status: 'error',
                projectId,
                progress: latestProgress,
                error: errorMessage(refreshFailure, 'Repository refresh analysis failed.'),
            });
            return null;
        } finally {
            if (refreshAnalysisAbortRef.current === controller) refreshAnalysisAbortRef.current = null;
        }
    }, [flushProject, waitForStorageInitialization]);

    const cancelRefreshAnalysis = useCallback(() => {
        refreshAnalysisAbortRef.current?.abort();
        setRefreshAnalysis((current) => current.status === 'running'
            ? { ...current, progress: { ...current.progress, message: 'Cancelling refresh analysis' } }
            : current);
    }, []);

    const discardRefreshCandidate = useCallback(() => {
        refreshAnalysisAbortRef.current?.abort();
        setRefreshAnalysis({ status: 'idle' });
    }, []);

    const refreshBackupList = useCallback(async (projectId?: string) => {
        await waitForStorageInitialization();
        const resolvedProjectId = projectId ?? activeProjectIdRef.current;
        if (!resolvedProjectId) {
            setRefreshBackups([]);
            return [];
        }
        const backups = await listRefreshBackups(resolvedProjectId);
        setRefreshBackups(backups);
        return backups;
    }, [waitForStorageInitialization]);

    useEffect(() => {
        let cancelled = false;
        if (!storageReady || !activeProjectId) {
            setRefreshBackups((current) => current.length > 0 ? [] : current);
            return () => { cancelled = true; };
        }
        void listRefreshBackups(activeProjectId)
            .then((backups) => {
                if (!cancelled && activeProjectIdRef.current === activeProjectId) {
                    setRefreshBackups(backups);
                }
            })
            .catch(() => {
                if (!cancelled && activeProjectIdRef.current === activeProjectId) {
                    setRefreshBackups([]);
                }
            });
        return () => { cancelled = true; };
    }, [activeProjectId, storageReady]);

    const replaceWithRefreshCandidate = useCallback(async (): Promise<boolean> => {
        const state = refreshAnalysis;
        if (state.status !== 'ready') return false;
        const { candidate, projectId } = state;
        setRefreshAnalysis({ ...state, status: 'applying' });
        try {
            await flushProject(projectId, projectId === activeProjectIdRef.current);
            const current = projectsRef.current.find((project) => project.id === projectId);
            if (!current) throw new Error('The project no longer exists.');
            assertRefreshCandidateApplies(current, candidate);
            const refreshed = buildRefreshedProject(current, candidate);
            setSaveStatus('saving');
            const expected = persistedTokensRef.current.get(projectId);
            if (!expected) throw new Error('The persisted project version is unavailable.');
            const backup = await saveProjectWithRefreshBackup(current, refreshed, expected);
            const token = backup.persistenceToken ?? createProjectPersistenceToken(refreshed);
            persistedTokensRef.current.set(projectId, token);
            revisionChannelRef.current?.publish({ kind: 'saved', projectId, token });

            const updatedProjects = projectsRef.current.map((project) => (
                project.id === projectId ? refreshed : project
            ));
            projectsRef.current = updatedProjects;
            persistedProjectRefs.current.set(projectId, refreshed);
            setProjects(updatedProjects);
            if (activeProjectIdRef.current === projectId) activateProject(refreshed);
            currentStorageErrorRef.current = null;
            setSaveError(null);
            setSaveStatus('saved');
            if (activeProjectIdRef.current === projectId) {
                setRefreshBackups((currentBackups) => [
                    backup,
                    ...currentBackups.filter((item) => item.id !== backup.id),
                ].slice(0, 5));
            }
            setRefreshAnalysis({ status: 'idle' });
            return true;
        } catch (applyFailure) {
            if (applyFailure instanceof ProjectWriteConflictError) {
                recordPersistenceConflict(projectId, applyFailure.actual);
            }
            const message = errorMessage(applyFailure, 'The refresh candidate could not replace the project.');
            currentStorageErrorRef.current = message;
            setSaveError(message);
            setSaveStatus('error');
            setRefreshAnalysis({
                status: 'error',
                projectId,
                candidate,
                progress: state.progress,
                error: message,
            });
            return false;
        }
    }, [activateProject, flushProject, recordPersistenceConflict, refreshAnalysis]);

    const duplicateRefreshCandidate = useCallback(async (name?: string): Promise<string | null> => {
        const state = refreshAnalysis;
        if (state.status !== 'ready') return null;
        const sourceProject = projectsRef.current.find((project) => project.id === state.projectId);
        if (!sourceProject) {
            setRefreshAnalysis({
                status: 'error',
                projectId: state.projectId,
                candidate: state.candidate,
                progress: state.progress,
                error: 'The source project no longer exists.',
            });
            return null;
        }
        const result = state.candidate.result;
        const shortCommit = result.snapshot.commitSha.slice(0, 7);
        const duplicate = createNewProject(sourceProject.repoUrl, result.repoDetails, result.nodes, result.edges, {
            name: name?.trim() || `${sourceProject.name} at ${shortCommit}`,
            source: 'github',
            layoutDirection: 'TB',
            fileTree: result.fileTree,
            repositorySnapshot: result.snapshot,
            analysisCoverage: result.coverage,
            analysisWarnings: result.warnings,
            analyzer: result.analyzer,
        });
        const syncedAt = new Date().toISOString();
        duplicate.aiContextSnapshot = buildCanvasSyncSnapshot(
            duplicate,
            duplicate.nodes,
            duplicate.edges,
            duplicate.layoutDirection,
            syncedAt,
            duplicate.graphRevision,
        );
        duplicate.lastSyncedAt = syncedAt;

        try {
            setSaveStatus('saving');
            await flushProject(state.projectId, state.projectId === activeProjectIdRef.current);
            const receipt = await saveProjectToStore(duplicate, null);
            const token = receipt?.token ?? createProjectPersistenceToken(duplicate);
            persistedTokensRef.current.set(duplicate.id, token);
            revisionChannelRef.current?.publish({ kind: 'saved', projectId: duplicate.id, token });
            const nextProjects = [...projectsRef.current, duplicate];
            projectsRef.current = nextProjects;
            persistedProjectRefs.current.set(duplicate.id, duplicate);
            setProjects(nextProjects);
            activateProject(duplicate);
            currentStorageErrorRef.current = null;
            setSaveError(null);
            setSaveStatus('saved');
            setRefreshBackups([]);
            setRefreshAnalysis({ status: 'idle' });
            return duplicate.id;
        } catch (duplicateFailure) {
            const message = errorMessage(duplicateFailure, 'The refreshed project copy could not be saved.');
            currentStorageErrorRef.current = message;
            setSaveError(message);
            setSaveStatus('error');
            setRefreshAnalysis({
                status: 'error',
                projectId: state.projectId,
                candidate: state.candidate,
                progress: state.progress,
                error: message,
            });
            return null;
        }
    }, [activateProject, flushProject, refreshAnalysis]);

    const restoreRefreshBackup = useCallback(async (backupId: string): Promise<boolean> => {
        await waitForStorageInitialization();
        try {
            const backupProject = await loadRefreshBackup(backupId);
            const projectId = backupProject.id;
            await flushProject(projectId, projectId === activeProjectIdRef.current);
            const current = projectsRef.current.find((project) => project.id === projectId);
            if (!current) throw new Error('The project for this backup no longer exists.');
            const restored = buildRestoredRefreshProject(current, backupProject);
            setSaveStatus('saving');
            const expected = persistedTokensRef.current.get(projectId);
            if (!expected) throw new Error('The persisted project version is unavailable.');
            const recoveryBackup = await saveProjectWithRefreshBackup(current, restored, expected);
            const token = recoveryBackup.persistenceToken ?? createProjectPersistenceToken(restored);
            persistedTokensRef.current.set(projectId, token);
            revisionChannelRef.current?.publish({ kind: 'saved', projectId, token });
            const updatedProjects = projectsRef.current.map((project) => (
                project.id === projectId ? restored : project
            ));
            projectsRef.current = updatedProjects;
            persistedProjectRefs.current.set(projectId, restored);
            setProjects(updatedProjects);
            if (projectId === activeProjectIdRef.current) activateProject(restored);
            currentStorageErrorRef.current = null;
            setSaveError(null);
            setSaveStatus('saved');
            const backups = await listRefreshBackups(projectId);
            if (projectId === activeProjectIdRef.current) {
                setRefreshBackups(backups.some((item) => item.id === recoveryBackup.id)
                    ? backups
                    : [recoveryBackup, ...backups]);
            }
            setRefreshAnalysis({ status: 'idle' });
            return true;
        } catch (restoreFailure) {
            if (restoreFailure instanceof ProjectWriteConflictError) {
                const projectId = restoreFailure.projectId;
                recordPersistenceConflict(projectId, restoreFailure.actual);
            }
            const projectId = activeProjectIdRef.current ?? '';
            const message = errorMessage(restoreFailure, 'The refresh backup could not be restored.');
            currentStorageErrorRef.current = message;
            setSaveError(message);
            setSaveStatus('error');
            setRefreshAnalysis({ status: 'error', projectId, error: message });
            return false;
        }
    }, [activateProject, flushProject, recordPersistenceConflict, waitForStorageInitialization]);

    const refreshProjectSourceGrant = useCallback(async (requestedProjectId?: string) => {
        await waitForStorageInitialization();
        const projectId = requestedProjectId ?? activeProjectIdRef.current;
        if (!projectId) throw new Error('No active project is available.');
        const project = projectsRef.current.find((candidate) => candidate.id === projectId);
        const commitSha = project?.repoDetails?.commitSha;
        if (!project || !project.repoDetails || !commitSha || !project.repoUrl) {
            throw new Error('This project does not have a pinned repository revision.');
        }

        const response = await fetch('/api/source-grant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: project.repoUrl,
                // Refresh grants against the immutable commit. A branch or tag
                // may have moved since this project was analyzed.
                ref: commitSha,
                expectedCommitSha: commitSha,
            }),
        });
        const body = await response.json() as unknown;
        if (!response.ok) {
            const message = isRecord(body) && typeof body.message === 'string'
                ? body.message
                : 'Failed to refresh source access.';
            throw new Error(message);
        }
        if (
            !isRecord(body) ||
            typeof body.sourceGrant !== 'string' ||
            !isRecord(body.snapshot) ||
            typeof body.snapshot.commitSha !== 'string' ||
            body.snapshot.commitSha.toLowerCase() !== commitSha.toLowerCase()
        ) {
            throw new Error('Source access refresh returned a different repository revision.');
        }

        // Re-read after the network request so a project switch or refresh cannot
        // apply this grant to stale state. Only the matching project/revision is
        // updated; a moved ref or failed response leaves it untouched.
        const latest = projectsRef.current.find((candidate) => candidate.id === projectId);
        if (!latest || latest.repoDetails?.commitSha?.toLowerCase() !== commitSha.toLowerCase()) {
            throw new Error('The project changed while source access was refreshing.');
        }
        const updated: Project = {
            ...latest,
            repoDetails: {
                ...latest.repoDetails,
                sourceGrant: body.sourceGrant,
                defaultBranch: typeof body.snapshot.defaultBranch === 'string'
                    ? body.snapshot.defaultBranch
                    : latest.repoDetails.defaultBranch,
                // Keep the user's branch/tag label even though the grant was
                // renewed against the immutable commit SHA.
                requestedRef: latest.repoDetails.requestedRef,
                treeSha: typeof body.snapshot.treeSha === 'string'
                    ? body.snapshot.treeSha
                    : latest.repoDetails.treeSha,
            },
            updatedAt: new Date(),
        };
        const updatedProjects = projectsRef.current.map((candidate) => (
            candidate.id === projectId ? updated : candidate
        ));
        projectsRef.current = updatedProjects;
        setProjects(updatedProjects);
        await flushProject(projectId);
        return body.sourceGrant;
    }, [flushProject, waitForStorageInitialization]);

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

    const flushProjects = useCallback(async () => {
        const currentActiveId = activeProjectIdRef.current;
        if (currentActiveId) {
            await flushProject(currentActiveId, true);
        }
        const remainingIds = projectsRef.current
            .map((project) => project.id)
            .filter((projectId) => projectId !== currentActiveId);
        await Promise.all(remainingIds.map((projectId) => flushProject(projectId)));
    }, [flushProject]);

    const retrySave = useCallback(async () => {
        if (projectConflictsRef.current.size > 0) {
            setSaveError('Resolve cross-tab project conflicts before retrying autosave.');
            setSaveStatus('error');
            return;
        }
        currentStorageErrorRef.current = null;
        setSaveError(null);
        await flushProjects();
    }, [flushProjects]);

    const reloadProjectAfterConflict = useCallback(async (requestedProjectId?: string): Promise<boolean> => {
        await waitForStorageInitialization();
        const projectId = requestedProjectId ?? activeProjectIdRef.current;
        if (!projectId || !projectConflictsRef.current.has(projectId)) return false;
        const timer = saveTimersRef.current.get(projectId);
        if (timer) {
            clearTimeout(timer);
            saveTimersRef.current.delete(projectId);
        }
        await saveChainsRef.current.get(projectId)?.catch(() => undefined);

        try {
            const stored = await loadProjectFromStore(projectId);
            let updatedProjects: Project[];
            if (stored) {
                updatedProjects = projectsRef.current.map((project) => (
                    project.id === projectId ? stored.project : project
                ));
                persistedProjectRefs.current.set(projectId, stored.project);
                persistedTokensRef.current.set(projectId, stored.token);
            } else {
                updatedProjects = projectsRef.current.filter((project) => project.id !== projectId);
                persistedProjectRefs.current.delete(projectId);
                persistedTokensRef.current.delete(projectId);
            }
            projectsRef.current = updatedProjects;
            setProjects(updatedProjects);
            if (projectId === activeProjectIdRef.current) {
                activateProject(stored?.project ?? updatedProjects[0] ?? null);
            }
            clearPersistenceConflict(projectId);
            setRefreshAnalysis((current) => current.projectId === projectId ? { status: 'idle' } : current);
            return true;
        } catch (reloadFailure) {
            const message = errorMessage(reloadFailure, 'The project could not be reloaded from browser storage.');
            currentStorageErrorRef.current = message;
            setSaveError(message);
            setSaveStatus('error');
            return false;
        }
    }, [activateProject, clearPersistenceConflict, waitForStorageInitialization]);

    const duplicateLocalWorkAfterConflict = useCallback(async (
        requestedProjectId?: string,
        name?: string,
    ): Promise<string | null> => {
        await waitForStorageInitialization();
        const projectId = requestedProjectId ?? activeProjectIdRef.current;
        if (!projectId || !projectConflictsRef.current.has(projectId)) return null;
        const local = projectsRef.current.find((project) => project.id === projectId);
        if (!local) return null;
        const now = new Date();
        const syncedAt = now.toISOString();
        const duplicate: Project = {
            ...local,
            id: generateId(),
            name: name?.trim() || `${local.name} (local recovery copy)`,
            graphRevision: 0,
            nodes: canonicalNodes(local.nodes),
            edges: canonicalEdges(local.edges),
            createdAt: now,
            updatedAt: now,
            lastSyncedAt: syncedAt,
        };
        duplicate.aiContextSnapshot = buildCanvasSyncSnapshot(
            duplicate,
            duplicate.nodes,
            duplicate.edges,
            duplicate.layoutDirection,
            syncedAt,
            duplicate.graphRevision,
        );

        try {
            const stored = await loadProjectFromStore(projectId);
            const receipt = await saveProjectToStore(duplicate, null);
            const duplicateToken = receipt?.token ?? createProjectPersistenceToken(duplicate);
            const withoutLocal = stored
                ? projectsRef.current.map((project) => project.id === projectId ? stored.project : project)
                : projectsRef.current.filter((project) => project.id !== projectId);
            const updatedProjects = [...withoutLocal, duplicate];
            projectsRef.current = updatedProjects;
            persistedProjectRefs.current.set(duplicate.id, duplicate);
            persistedTokensRef.current.set(duplicate.id, duplicateToken);
            if (stored) {
                persistedProjectRefs.current.set(projectId, stored.project);
                persistedTokensRef.current.set(projectId, stored.token);
            } else {
                persistedProjectRefs.current.delete(projectId);
                persistedTokensRef.current.delete(projectId);
            }
            clearPersistenceConflict(projectId);
            setProjects(updatedProjects);
            activateProject(duplicate);
            revisionChannelRef.current?.publish({
                kind: 'saved',
                projectId: duplicate.id,
                token: duplicateToken,
            });
            return duplicate.id;
        } catch (duplicateFailure) {
            const message = errorMessage(duplicateFailure, 'The local recovery copy could not be saved.');
            currentStorageErrorRef.current = message;
            setSaveError(message);
            setSaveStatus('error');
            return null;
        }
    }, [activateProject, clearPersistenceConflict, waitForStorageInitialization]);

    // ── Return ────────────────────────────────────────────────
    return {
        // Core state
        projects,
        activeProjectId,
        activeProject,
        activeChatSession,
        loading,
        analysisProgress,
        error,
        setError,
        storageReady,
        saveStatus,
        saveError,
        projectConflicts,
        activeProjectConflict,
        migration,
        quarantinedProjects,
        refreshAnalysis,
        refreshBackups,
        repoUrl,
        setRepoUrl,
        repoDetails,

        // Modal / sidebar UI
        showProjectList,
        setShowProjectList,
        showCreateProjectModal,
        setShowCreateProjectModal,
        createProjectMode,
        setCreateProjectMode,
        newProjectUrl,
        setNewProjectUrl,
        newProjectRef,
        setNewProjectRef,
        enrichWithAi,
        setEnrichWithAi,
        newProjectName,
        setNewProjectName,
        importError,
        setImportError,
        importFileRef,

        // Project operations
        createProjectFromGitHub,
        cancelRepositoryAnalysis,
        handleVisualize,
        startGitHubProjectCreation,
        handleImportProject,
        handleCreateEmptyProject,
        switchToProject,
        deleteProject,
        startRefreshAnalysis,
        cancelRefreshAnalysis,
        discardRefreshCandidate,
        replaceWithRefreshCandidate,
        duplicateRefreshCandidate,
        refreshBackupList,
        restoreRefreshBackup,
        refreshProjectSourceGrant,
        flushActiveProject,
        flushProjects,
        retrySave,
        reloadProjectAfterConflict,
        duplicateLocalWorkAfterConflict,
        commitActiveGraph,

        // Chat operations
        updateChatMessages,
        createNewChatSession,
        switchChatSession,
        deleteChatSession,
    };
}
