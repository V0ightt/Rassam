'use client';

// The full workbench is route-split from the lightweight home shell.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ReactFlow, {
    Background,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Connection,
    addEdge,
    EdgeChange,
    applyEdgeChanges,
    applyNodeChanges,
    Node,
    Edge,
    NodeChange,
    useReactFlow,
    ReactFlowProvider,
    ConnectionLineType,
    OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
    AlertCircle,
    Bot,
    FileCheck2,
    GripVertical,
    X,
} from 'lucide-react';

import nodeTypes from '@/components/canvas/NodeTypes';
import { edgeTypes } from '@/components/canvas/CustomEdge';
import { NodeEditProvider } from '@/components/canvas/NodeEditContext';
import { EdgeEditProvider } from '@/components/canvas/EdgeEditContext';
import EditToolbar from '@/components/canvas/EditToolbar';
import FlowControls, { StyledMiniMap } from '@/components/canvas/FlowControls';
import GraphOutline from '@/components/canvas/GraphOutline';
import ErrorBoundary from '@/components/ErrorBoundary';
import ActivityBar, { ActivityPanel } from '@/components/navigation/ActivityBar';
import ProjectSidebar from '@/components/projects/ProjectSidebar';
import FileExplorer from '@/components/explorer/FileExplorer';
import CreateProjectModal from '@/components/projects/CreateProjectModal';
import EmptyWorkspace from '@/components/projects/EmptyWorkspace';
import RefreshAnalysisDialog from '@/components/projects/RefreshAnalysisDialog';
import WorkspaceStatus from '@/components/navigation/WorkspaceStatus';
import StorageRecoveryNotice from '@/components/navigation/StorageRecoveryNotice';
import PersistenceConflictNotice from '@/components/navigation/PersistenceConflictNotice';
import EvidenceInspector, { type GraphElementTarget } from '@/components/evidence/EvidenceInspector';
import WorkspaceCommandPalette from '@/components/navigation/WorkspaceCommandPalette';

import { useCanvasHistory } from '@/hooks/useCanvasHistory';
import { useClipboard } from '@/hooks/useClipboard';
import { useCanvasShortcuts } from '@/hooks/useCanvasShortcuts';
import { useResizablePane } from '@/hooks/useResizablePane';
import { useProjects } from '@/hooks/useProjects';
import { useFileExplorer } from '@/hooks/useFileExplorer';
import { useEditorTabs } from '@/hooks/useEditorTabs';
import { getCachedFiles as getFilesFromStore } from '@/lib/file-store';
import { buildAvailableFiles } from '@/lib/chat-request';
import { layoutGraphInWorker } from '@/lib/layout-client';
import { applyCanvasPatch } from '@/lib/apply-canvas-patch';
import { cn } from '@/lib/utils';
import type { CanvasPatchContract } from '@/lib/contracts';
import type { SourceLocation } from '@/lib/source-location';
import {
    getNeighborNodeIds,
    type WorkspaceSearchResult,
    type WorkspaceTransientMatches,
} from '@/lib/workspace-search';
import TabBar from '@/components/editor/TabBar';
import { EdgeData, NodeCategory, NodeData } from '@/types';

const EnhancedChatbot = dynamic(() => import('@/components/sidebar/EnhancedChatbot'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-slate-900" aria-label="Loading Rassam" />,
});
const ExportPanel = dynamic(() => import('@/components/canvas/ExportPanel'), { ssr: false });
const FileViewer = dynamic(() => import('@/components/editor/FileViewer'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-slate-950" aria-label="Loading file viewer" />,
});

type EditableNodeInput = Partial<NodeData> & Pick<NodeData, 'label' | 'description' | 'files'>;

// ─────────────────────────────────────────────────────────────
// FlowCanvas – thin orchestration shell that wires together
// extracted hooks (projects, history, clipboard, shortcuts,
// resizable pane) and the ReactFlow canvas.
// ─────────────────────────────────────────────────────────────

function FlowCanvas() {
    const router = useRouter();
    // ── React Flow core state ─────────────────────────────────
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView, zoomIn, zoomOut, setCenter } = useReactFlow();

    // ── Local canvas UI state ─────────────────────────────────
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
    const [selectedEdge, setSelectedEdge] = useState<Edge<EdgeData> | null>(null);
    const [showMinimap, setShowMinimap] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [transientMatches, setTransientMatches] = useState<WorkspaceTransientMatches | null>(null);
    const [isolatedNodeIds, setIsolatedNodeIds] = useState<Set<string> | null>(null);
    const [activeGraphFilterLabel, setActiveGraphFilterLabel] = useState<string | null>(null);
    const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
    const [canvasDirtyState, setCanvasDirtyState] = useState<{
        projectId: string | null;
        timestamp: string;
    } | null>(null);

    // ── Extracted hooks ───────────────────────────────────────
    const proj = useProjects({
        nodes, edges, setNodes, setEdges,
        layoutDirection, setLayoutDirection,
        setSelectedNode, fitView,
    });

    const { saveToHistory, handleUndo, handleRedo, canUndo, canRedo } =
        useCanvasHistory(proj.activeProjectId, nodes, edges, setNodes, setEdges);

    const { width: chatWidth, handleMouseDown, handleKeyDown: handleChatResizeKeyDown, resizeRef } =
        useResizablePane('repoAgent_chatWidth', { side: 'right' });

    const {
        width: leftPanelWidth,
        handleMouseDown: handleLeftPanelResize,
        handleKeyDown: handleLeftPanelResizeKeyDown,
        resizeRef: leftPanelResizeRef,
    } = useResizablePane('repoAgent_leftPanelWidth', {
        defaultWidth: 288,
        minWidth: 140,
        maxWidth: 560,
        side: 'left',
    });

    // ── Activity Bar / Navigation state ───────────────────────
    const [activePanel, setActivePanel] = useState<ActivityPanel>(null);

    // ── Chat pane visibility ─────────────────────────────────
    const [openChatProjectId, setOpenChatProjectId] = useState<string | null>(null);
    const [rightPanelTab, setRightPanelTab] = useState<'inspector' | 'rassam'>('inspector');
    const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
    const isChatOpen = Boolean(
        proj.activeProjectId && openChatProjectId === proj.activeProjectId,
    );

    // ── File Explorer ─────────────────────────────────────────
    const fileExplorer = useFileExplorer({
        projectId: proj.activeProjectId,
        fileEntries: proj.activeProject?.fileTree || [],
        repoDetails: proj.repoDetails,
        refreshSourceGrant: () => proj.refreshProjectSourceGrant(),
    });

    // ── Editor tabs (file viewer) ─────────────────────────────
    const editorTabs = useEditorTabs({
        projectId: proj.activeProjectId,
        repoDetails: proj.repoDetails,
        fileEntries: proj.activeProject?.fileTree || [],
        refreshSourceGrant: () => proj.refreshProjectSourceGrant(),
    });

    /** Clicking a file in the explorer: fetch + open in a tab */
    const handleFileClick = useCallback(async (filePath: string) => {
        const prefetchedContent = await fileExplorer.fetchFile(filePath);
        await editorTabs.openFile(filePath, prefetchedContent ?? undefined);
    }, [fileExplorer, editorTabs]);

    const handlePanelChange = useCallback(async (panel: ActivityPanel) => {
        if (panel === 'settings') {
            await proj.flushActiveProject();
            router.push('/settings');
            return;
        }
        setActivePanel(panel);
        // Keep project list visibility in sync
        if (panel === 'projects') {
            proj.setShowProjectList(true);
        } else {
            proj.setShowProjectList(false);
        }
    }, [proj, router]);

    /** Retrieve cached file contents from IndexedDB for chat context. */
    const handleGetCachedFiles = useCallback(
        async (paths: string[]) => {
            if (!proj.activeProjectId) return {};
            return getFilesFromStore(proj.activeProjectId, paths, proj.repoDetails?.commitSha);
        },
        [proj.activeProjectId, proj.repoDetails?.commitSha],
    );

    // ── Stable type maps (prevent ReactFlow re-registration) ──
    const memoNodeTypes = useMemo(() => nodeTypes, []);
    const memoEdgeTypes = useMemo(() => edgeTypes, []);
    const availableFiles = useMemo(
        () => buildAvailableFiles(proj.activeProject?.fileTree || [], 2000),
        [proj.activeProject?.fileTree],
    );

    // ── Refs for stable chatbot getter (avoids re-render on every drag) ──
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const layoutDirectionRef = useRef(layoutDirection);
    const activeProjectIdRef = useRef(proj.activeProjectId);
    const layoutAbortRef = useRef<AbortController | null>(null);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    useEffect(() => { layoutDirectionRef.current = layoutDirection; }, [layoutDirection]);
    useEffect(() => { activeProjectIdRef.current = proj.activeProjectId; }, [proj.activeProjectId]);
    useEffect(() => {
        setSelectedEdge(null);
        setTransientMatches(null);
        setIsolatedNodeIds(null);
        setActiveGraphFilterLabel(null);
        setCommandPaletteOpen(false);
        setRefreshDialogOpen(false);
    }, [proj.activeProjectId]);
    useEffect(() => () => layoutAbortRef.current?.abort(), []);
    const getCanvasState = useCallback(() => ({
        nodes: nodesRef.current,
        edges: edgesRef.current,
    }), []);
    const canvasLastModifiedAt = useMemo(() => {
        if (!canvasDirtyState) return null;
        if (canvasDirtyState.projectId !== proj.activeProjectId) return null;

        const syncedAt = proj.activeProject?.lastSyncedAt;
        if (!syncedAt) return canvasDirtyState.timestamp;

        const dirtyTimestamp = Date.parse(canvasDirtyState.timestamp);
        const syncedTimestamp = Date.parse(syncedAt);
        if (Number.isNaN(dirtyTimestamp) || Number.isNaN(syncedTimestamp)) {
            return canvasDirtyState.timestamp;
        }

        return dirtyTimestamp > syncedTimestamp ? canvasDirtyState.timestamp : null;
    }, [canvasDirtyState, proj.activeProject?.lastSyncedAt, proj.activeProjectId]);
    const markCanvasModified = useCallback(() => {
        setCanvasDirtyState({
            projectId: proj.activeProjectId,
            timestamp: new Date().toISOString(),
        });
    }, [proj.activeProjectId]);

    const commitCanvasState = useCallback((
        nextNodes: Node[],
        nextEdges: Edge[],
        nextLayout = layoutDirectionRef.current,
    ) => {
        nodesRef.current = nextNodes;
        edgesRef.current = nextEdges;
        layoutDirectionRef.current = nextLayout;
        setNodes(nextNodes);
        setEdges(nextEdges);
        setLayoutDirection(nextLayout);
        const revision = proj.commitActiveGraph(nextNodes, nextEdges, nextLayout);
        markCanvasModified();
        return revision;
    }, [markCanvasModified, proj, setEdges, setNodes]);

    const { handleCopy, handlePaste } = useClipboard(
        proj.activeProjectId,
        nodes,
        selectedNodes,
        selectedNode,
        edges,
        saveToHistory,
        commitCanvasState,
    );

    // ── Canvas interaction ────────────────────────────────────

    const handleNodesChange = useCallback((changes: NodeChange[]) => {
        if (changes.some((change) => change.type === 'remove')) {
            saveToHistory();
            const nextNodes = applyNodeChanges(changes, nodesRef.current);
            const nextIds = new Set(nextNodes.map((node) => node.id));
            const nextEdges = edgesRef.current.filter((edge) => nextIds.has(edge.source) && nextIds.has(edge.target));
            commitCanvasState(nextNodes, nextEdges);
            return;
        }
        if (changes.some((change) => change.type !== 'select')) markCanvasModified();
        onNodesChange(changes);
    }, [commitCanvasState, markCanvasModified, onNodesChange, saveToHistory]);

    const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
        if (changes.some((change) => change.type === 'remove')) {
            saveToHistory();
            commitCanvasState(nodesRef.current, applyEdgeChanges(changes, edgesRef.current));
            return;
        }
        if (changes.some((change) => change.type !== 'select')) markCanvasModified();
        onEdgesChange(changes);
    }, [commitCanvasState, markCanvasModified, onEdgesChange, saveToHistory]);

    const onConnect = useCallback((params: Connection) => {
        saveToHistory();
        const nextEdges = addEdge(
            { id: crypto.randomUUID(), ...params, type: 'custom', animated: false, data: { type: 'dependency', strength: 'normal' } },
            edgesRef.current,
        );
        commitCanvasState(nodesRef.current, nextEdges);
    }, [commitCanvasState, saveToHistory]);

    const onNodeDragStart = useCallback(() => saveToHistory(), [saveToHistory]);

    const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
        const nextNodes = nodesRef.current.map((node) => (
            node.id === draggedNode.id ? { ...node, position: { ...draggedNode.position } } : node
        ));
        commitCanvasState(nextNodes, edgesRef.current);
    }, [commitCanvasState]);

    const onSelectionChange = useCallback(({ nodes: sel, edges: selectedEdges }: OnSelectionChangeParams) => {
        setSelectedNodes(sel);
        setSelectedNode(sel.length === 1 ? sel[0] : null);
        setSelectedEdge(selectedEdges.length === 1 ? selectedEdges[0] as Edge<EdgeData> : null);
    }, []);

    const openInspector = useCallback(() => {
        if (!proj.activeProjectId) return;
        setRightPanelTab('inspector');
        setOpenChatProjectId(proj.activeProjectId);
    }, [proj.activeProjectId]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
        setSelectedEdge(null);
        openInspector();
    }, [openInspector]);

    const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
        setSelectedNode(null);
        setSelectedNodes([]);
        setSelectedEdge(edge as Edge<EdgeData>);
        openInspector();
    }, [openInspector]);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setSelectedNodes([]);
        setSelectedEdge(null);
    }, []);

    const handleNavigateToSource = useCallback((location: SourceLocation) => {
        void editorTabs.openFile(location);
    }, [editorTabs]);

    const isLeftPanelOpen = activePanel === 'projects' || activePanel === 'explorer';

    const handleRevealGraphElement = useCallback((target: GraphElementTarget) => {
        editorTabs.selectTab('__canvas__');
        if (target.kind === 'node') {
            const node = nodesRef.current.find((candidate) => candidate.id === target.id);
            if (!node) return;
            setSelectedNode(node);
            setSelectedNodes([node]);
            setSelectedEdge(null);
            void setCenter(
                node.position.x + (node.width ?? 0) / 2,
                node.position.y + (node.height ?? 0) / 2,
                { duration: 250 },
            );
        } else {
            const edge = edgesRef.current.find((candidate) => candidate.id === target.id);
            if (!edge) return;
            setSelectedNode(null);
            setSelectedNodes([]);
            setSelectedEdge(edge as Edge<EdgeData>);
            const source = nodesRef.current.find((candidate) => candidate.id === edge.source);
            const targetNode = nodesRef.current.find((candidate) => candidate.id === edge.target);
            if (source && targetNode) {
                void setCenter(
                    (source.position.x + targetNode.position.x) / 2,
                    (source.position.y + targetNode.position.y) / 2,
                    { duration: 250 },
                );
            }
        }
        openInspector();
    }, [editorTabs, openInspector, setCenter]);

    const handleWorkspaceReveal = useCallback((result: WorkspaceSearchResult) => {
        if (result.kind === 'node') {
            handleRevealGraphElement({ kind: 'node', id: result.nodeId });
            return;
        }
        if (result.kind === 'relationship') {
            handleRevealGraphElement({ kind: 'edge', id: result.edgeId });
            return;
        }
        if (result.kind === 'file') {
            handleNavigateToSource({ path: result.path, blobSha: result.blobSha });
            return;
        }
        setIsolatedNodeIds(new Set(result.nodeIds));
        setActiveGraphFilterLabel(`${result.title} category`);
        editorTabs.selectTab('__canvas__');
    }, [editorTabs, handleNavigateToSource, handleRevealGraphElement]);

    const clearGraphFilters = useCallback(() => {
        setIsolatedNodeIds(null);
        setActiveGraphFilterLabel(null);
        setTransientMatches(null);
        setSearchQuery('');
    }, []);

    // ── Node CRUD ─────────────────────────────────────────────

    const handleAddNode = useCallback((nodeData: EditableNodeInput) => {
        saveToHistory();
        commitCanvasState([
            ...nodesRef.current,
            {
                id: crypto.randomUUID(),
                type: 'enhanced',
                position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
                data: { ...nodeData, category: nodeData.category || 'default', complexity: 'low' },
            },
        ], edgesRef.current);
    }, [commitCanvasState, saveToHistory]);

    const handleDeleteNode = useCallback((nodeId: string) => {
        saveToHistory();
        commitCanvasState(
            nodesRef.current.filter((node) => node.id !== nodeId),
            edgesRef.current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        );
        setSelectedNode(null);
    }, [commitCanvasState, saveToHistory]);

    const handleBatchDelete = useCallback((nodeIds: string[]) => {
        if (!nodeIds.length) return;
        saveToHistory();
        const ids = new Set(nodeIds);
        commitCanvasState(
            nodesRef.current.filter((node) => !ids.has(node.id)),
            edgesRef.current.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
        );
        setSelectedNode(null);
        setSelectedNodes([]);
    }, [commitCanvasState, saveToHistory]);

    const handleBatchUpdateCategory = useCallback((nodeIds: string[], category: string) => {
        if (!nodeIds.length) return;
        saveToHistory();
        const ids = new Set(nodeIds);
        const nextCategory = category as NodeCategory;
        commitCanvasState(
            nodesRef.current.map((node) => ids.has(node.id)
                ? { ...node, data: { ...node.data, category: nextCategory } }
                : node),
            edgesRef.current,
        );
    }, [commitCanvasState, saveToHistory]);

    const handleUpdateNode = useCallback((nodeId: string, data: Partial<NodeData>) => {
        saveToHistory();
        commitCanvasState(
            nodesRef.current.map((node) => node.id === nodeId
                ? { ...node, data: { ...node.data, ...data } }
                : node),
            edgesRef.current,
        );
    }, [commitCanvasState, saveToHistory]);

    const handleUpdateEdge = useCallback((edgeId: string, data: Partial<EdgeData>) => {
        saveToHistory();
        commitCanvasState(
            nodesRef.current,
            edgesRef.current.map((edge) => edge.id === edgeId
                ? { ...edge, data: { ...(edge.data as EdgeData | undefined), ...data } }
                : edge),
        );
    }, [commitCanvasState, saveToHistory]);

    const handleDeleteEdge = useCallback((edgeId: string) => {
        saveToHistory();
        commitCanvasState(
            nodesRef.current,
            edgesRef.current.filter((edge) => edge.id !== edgeId),
        );
    }, [commitCanvasState, saveToHistory]);

    const handleApplyCanvasPatch = useCallback((patch: CanvasPatchContract) => {
        const currentRevision = proj.activeProject?.graphRevision ?? 0;
        try {
            const result = applyCanvasPatch(
                nodesRef.current as Node<NodeData>[],
                edgesRef.current as Edge<EdgeData>[],
                patch,
                currentRevision,
            );
            saveToHistory();
            const committedRevision = commitCanvasState(result.nodes, result.edges);
            if (committedRevision !== result.revision) {
                throw new Error('The proposal revision could not be committed.');
            }
            setSelectedNode((current) => current && result.nodes.some((node) => node.id === current.id)
                ? result.nodes.find((node) => node.id === current.id) || null
                : null);
            setSelectedNodes((current) => current
                .map((node) => result.nodes.find((candidate) => candidate.id === node.id))
                .filter((node): node is Node<NodeData> => Boolean(node)));
            return { ok: true as const, message: `Applied proposal at graph revision ${result.revision}.` };
        } catch (error) {
            return {
                ok: false as const,
                message: error instanceof Error ? error.message : 'The proposal could not be applied.',
            };
        }
    }, [commitCanvasState, proj.activeProject?.graphRevision, saveToHistory]);

    const nodeEditCtx = useMemo(() => ({ onUpdateNode: handleUpdateNode }), [handleUpdateNode]);
    const edgeEditCtx = useMemo(() => ({
        onUpdateEdge: handleUpdateEdge,
        onDeleteEdge: handleDeleteEdge,
    }), [handleDeleteEdge, handleUpdateEdge]);

    const renderedNodes = useMemo(() => {
        const normalized = searchQuery.trim().toLowerCase();
        return nodes.map((node) => {
            const legacySearchMatch = !normalized || node.data.label?.toLowerCase().includes(normalized)
                || node.data.description?.toLowerCase().includes(normalized)
                || node.data.files?.some((file: string) => file.toLowerCase().includes(normalized));
            const paletteMatch = !transientMatches
                || transientMatches.nodeIds.has(node.id)
                || transientMatches.categories.has(node.data.category);
            const isolateMatch = !isolatedNodeIds || isolatedNodeIds.has(node.id);
            const selected = node.id === selectedNode?.id;
            const visible = selected || (legacySearchMatch && paletteMatch && isolateMatch);
            return { ...node, style: { ...node.style, opacity: visible ? 1 : 0.16 } };
        });
    }, [isolatedNodeIds, nodes, searchQuery, selectedNode?.id, transientMatches]);

    const renderedEdges = useMemo(() => edges.map((edge) => {
        const paletteMatch = !transientMatches
            || transientMatches.edgeIds.has(edge.id)
            || (transientMatches.nodeIds.has(edge.source) && transientMatches.nodeIds.has(edge.target));
        const isolateMatch = !isolatedNodeIds
            || (isolatedNodeIds.has(edge.source) && isolatedNodeIds.has(edge.target));
        const selected = edge.id === selectedEdge?.id;
        return { ...edge, style: { ...edge.style, opacity: selected || (paletteMatch && isolateMatch) ? 1 : 0.1 } };
    }), [edges, isolatedNodeIds, selectedEdge?.id, transientMatches]);

    // ── Search & helpers ──────────────────────────────────────

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
    }, []);

    const handleSelectAll = useCallback(
        () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))),
        [setNodes],
    );

    const handleDuplicateSelected = useCallback(() => {
        if (!selectedNode) return;
        saveToHistory();
        commitCanvasState([
            ...nodesRef.current,
            {
                ...selectedNode,
                id: crypto.randomUUID(),
                position: { x: selectedNode.position.x + 50, y: selectedNode.position.y + 50 },
                selected: false,
            },
        ], edgesRef.current);
    }, [commitCanvasState, saveToHistory, selectedNode]);

    const handleUndoWithMetadata = useCallback(() => {
        const restored = handleUndo();
        if (restored) commitCanvasState(restored.nodes, restored.edges);
    }, [commitCanvasState, handleUndo]);

    const handleRedoWithMetadata = useCallback(() => {
        const restored = handleRedo();
        if (restored) commitCanvasState(restored.nodes, restored.edges);
    }, [commitCanvasState, handleRedo]);

    const handlePasteWithMetadata = useCallback(() => {
        handlePaste();
    }, [handlePaste]);

    const handleToggleSnapToGrid = useCallback(() => setSnapToGrid((s) => !s), []);

    const handleLayoutChange = useCallback(
        async (direction: 'TB' | 'LR') => {
            if (!nodes.length) return;
            layoutAbortRef.current?.abort();
            const controller = new AbortController();
            layoutAbortRef.current = controller;
            const projectId = proj.activeProjectId;
            const sourceNodes = nodes;
            const sourceEdges = edges;
            try {
                const data = await layoutGraphInWorker(sourceNodes, sourceEdges, direction, controller.signal);
                if (
                    activeProjectIdRef.current !== projectId
                    || nodesRef.current !== sourceNodes
                    || edgesRef.current !== sourceEdges
                ) return;
                saveToHistory();
                commitCanvasState(data.nodes, data.edges, direction);
                setTimeout(() => fitView({ padding: 0.2 }), 100);
            } catch (err) {
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    proj.setError(err instanceof Error ? err.message : 'Layout failed.');
                }
            } finally {
                if (layoutAbortRef.current === controller) layoutAbortRef.current = null;
            }
        },
        [commitCanvasState, edges, fitView, nodes, proj, saveToHistory],
    );

    // ── Keyboard shortcuts (single stable effect) ─────────────

    useCanvasShortcuts({
        selectedNode,
        selectedNodes,
        setSelectedNode,
        handleDeleteNode,
        handleBatchDelete,
        handleUndo: handleUndoWithMetadata,
        handleRedo: handleRedoWithMetadata,
        handleCopy,
        handlePaste: handlePasteWithMetadata,
        handleSelectAll,
        handleDuplicateSelected,
        handleToggleSnapToGrid,
    });

    // ── Render ────────────────────────────────────────────────

    const openCreateProject = (mode: 'github' | 'empty' | 'json') => {
        proj.setCreateProjectMode(mode);
        proj.setImportError(null);
        proj.setShowCreateProjectModal(true);
    };

    const handleExploreSample = () => {
        const sample = {
            metadata: { version: '1.0', exportedAt: new Date().toISOString() },
            nodes: [
                {
                    id: '7b860af0-8479-4fc3-86ec-9b31d0ab82fe',
                    type: 'enhanced',
                    position: { x: 40, y: 140 },
                    data: {
                        label: 'Web client',
                        description: 'The user-facing application and navigation shell.',
                        files: ['src/app/page.tsx'],
                        category: 'client',
                        complexity: 'medium',
                    },
                },
                {
                    id: '1a304cca-ac17-4d31-a9a2-13c73a04a52d',
                    type: 'enhanced',
                    position: { x: 380, y: 40 },
                    data: {
                        label: 'Repository API',
                        description: 'Retrieves a pinned repository revision and builds the map.',
                        files: ['src/app/api/repo/route.ts'],
                        category: 'api',
                        complexity: 'high',
                    },
                },
                {
                    id: '58d93083-6dfc-4d76-8898-ffbd6c403530',
                    type: 'enhanced',
                    position: { x: 380, y: 260 },
                    data: {
                        label: 'Local project store',
                        description: 'Keeps project graphs and source cache in the browser.',
                        files: ['src/lib/project-store.ts'],
                        category: 'storage',
                        complexity: 'medium',
                    },
                },
            ],
            edges: [
                { id: '0d394843-cb65-4284-a0a7-a7e6e2d7f2fb', source: '7b860af0-8479-4fc3-86ec-9b31d0ab82fe', target: '1a304cca-ac17-4d31-a9a2-13c73a04a52d', type: 'custom', data: { label: 'requests', type: 'calls' } },
                { id: '578636bc-b415-44dc-ad15-22d19d596ab3', source: '7b860af0-8479-4fc3-86ec-9b31d0ab82fe', target: '58d93083-6dfc-4d76-8898-ffbd6c403530', type: 'custom', data: { label: 'persists', type: 'writes' } },
            ],
        };
        const file = new File([JSON.stringify(sample)], 'Rassam sample.json', { type: 'application/json' });
        proj.handleImportProject(file);
    };

    return (
        <div className="workspace-shell flex w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
            {/* ── Activity Bar (VS Code-style) ────────────────── */}
            <ActivityBar
                activePanel={activePanel}
                onPanelChange={handlePanelChange}
                projectCount={proj.projects.length || undefined}
                cachedFileCount={fileExplorer.cachedPaths.size || undefined}
                repoDetails={proj.repoDetails}
                repoUrl={proj.repoUrl}
                exportSlot={
                    <ExportPanel
                        repoDetails={proj.repoDetails}
                        project={proj.activeProject}
                        onImportProject={proj.handleImportProject}
                        compact
                    />
                }
            />

            {/* ── Left panel (Projects / Explorer / Blueprint) ── */}
            {isLeftPanelOpen && (
                    <div
                        key={`${activePanel}-panel`}
                        style={{ width: leftPanelWidth }}
                        className="workspace-side-panel h-full shrink-0 overflow-hidden border-r border-slate-800 bg-slate-900 transition-[width] duration-150 z-40"
                    >
                        {activePanel === 'projects' ? (
                            <ProjectSidebar
                                projects={proj.projects}
                                activeProjectId={proj.activeProjectId}
                                onSwitchProject={proj.switchToProject}
                                onDeleteProject={proj.deleteProject}
                                onCreateNew={() => proj.setShowCreateProjectModal(true)}
                                onClose={() => setActivePanel(null)}
                            />
                        ) : (
                            <FileExplorer
                                key={proj.activeProjectId ?? 'no-project'}
                                fileEntries={proj.activeProject?.fileTree || []}
                                cachedPaths={fileExplorer.cachedPaths}
                                fetchingPaths={fileExplorer.fetchingPaths}
                                onFetchFile={handleFileClick}
                                onFetchAll={fileExplorer.fetchAll}
                                onCancelFetchAll={fileExplorer.cancelFetchAll}
                                activeFilePath={editorTabs.activeFilePath}
                                projectName={proj.activeProject?.name}
                                totalFiles={(proj.activeProject?.fileTree || []).filter(e => e.type === 'blob').length}
                                isFetchingAll={fileExplorer.isFetchingAll}
                                cacheProgress={fileExplorer.cacheProgress}
                                error={fileExplorer.lastError}
                            />
                        )}
                    </div>
            )}

            {isLeftPanelOpen && (
                <div
                    ref={leftPanelResizeRef}
                    role="separator"
                    aria-label="Resize activity panel"
                    aria-orientation="vertical"
                    aria-valuemin={140}
                    aria-valuemax={560}
                    aria-valuenow={Math.round(leftPanelWidth)}
                    tabIndex={0}
                    className="w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-30 flex items-center justify-center group shrink-0"
                    onMouseDown={handleLeftPanelResize}
                    onKeyDown={handleLeftPanelResizeKeyDown}
                >
                    <div className="w-4 h-12 bg-slate-700/50 rounded-full group-hover:bg-blue-500/50 flex items-center justify-center">
                        <GripVertical size={12} className="text-slate-500 group-hover:text-blue-300" />
                    </div>
                </div>
            )}

            {/* Create-project modal */}
            {proj.showCreateProjectModal && (
                    <CreateProjectModal
                        mode={proj.createProjectMode}
                        onModeChange={proj.setCreateProjectMode}
                        newProjectUrl={proj.newProjectUrl}
                        onUrlChange={proj.setNewProjectUrl}
                        newProjectRef={proj.newProjectRef}
                        onRefChange={proj.setNewProjectRef}
                        enrichWithAi={proj.enrichWithAi}
                        onEnrichWithAiChange={proj.setEnrichWithAi}
                        newProjectName={proj.newProjectName}
                        onNameChange={proj.setNewProjectName}
                        loading={proj.loading}
                        analysisProgress={proj.analysisProgress}
                        analysisError={proj.error}
                        importError={proj.importError}
                        importFileRef={proj.importFileRef}
                        onClose={() => proj.setShowCreateProjectModal(false)}
                        onCancelAnalysis={proj.cancelRepositoryAnalysis}
                        onCreateFromGitHub={proj.startGitHubProjectCreation}
                        onCreateEmpty={proj.handleCreateEmptyProject}
                        onImportFile={proj.handleImportProject}
                        onClearImportError={() => proj.setImportError(null)}
                    />
            )}

            {proj.activeProjectId && (
                <WorkspaceCommandPalette
                    key={`palette-${proj.activeProjectId}`}
                    nodes={nodes}
                    edges={edges}
                    files={proj.activeProject?.fileTree ?? []}
                    open={commandPaletteOpen}
                    onOpenChange={setCommandPaletteOpen}
                    showTrigger={false}
                    onTransientMatchesChange={setTransientMatches}
                    activeGraphFilterLabel={activeGraphFilterLabel}
                    onClearFilters={clearGraphFilters}
                    onIsolateNeighbors={(nodeId) => {
                        setIsolatedNodeIds(getNeighborNodeIds(nodeId, edgesRef.current));
                        setActiveGraphFilterLabel(`Neighbors of ${nodesRef.current.find((node) => node.id === nodeId)?.data.label ?? nodeId}`);
                    }}
                    onRevealResult={handleWorkspaceReveal}
                />
            )}

            {proj.activeProject?.source === 'github' && (
                <RefreshAnalysisDialog
                    key={`refresh-${proj.activeProject.id}`}
                    open={refreshDialogOpen}
                    onOpenChange={setRefreshDialogOpen}
                    defaultRef={proj.repoDetails?.requestedRef ?? proj.repoDetails?.defaultBranch}
                    state={proj.refreshAnalysis}
                    backups={proj.refreshBackups}
                    onStart={proj.startRefreshAnalysis}
                    onCancel={proj.cancelRefreshAnalysis}
                    onDiscard={proj.discardRefreshCandidate}
                    onReplace={proj.replaceWithRefreshCandidate}
                    onDuplicate={proj.duplicateRefreshCandidate}
                    onRestoreBackup={proj.restoreRefreshBackup}
                />
            )}

            {/* Main canvas area */}
            <div className="flex-1 relative h-full flex flex-col">
                {/* ── Tab Bar ──────────────────────────────────── */}
                <TabBar
                    tabs={editorTabs.tabs}
                    activeTabId={editorTabs.activeTabId}
                    onSelectTab={editorTabs.selectTab}
                    onCloseTab={editorTabs.closeTab}
                    onCloseAll={editorTabs.closeAllTabs}
                    isChatOpen={isChatOpen && rightPanelTab === 'rassam'}
                    onToggleChat={proj.activeProjectId ? () => {
                        if (isChatOpen && rightPanelTab === 'rassam') {
                            setOpenChatProjectId(null);
                            return;
                        }
                        setRightPanelTab('rassam');
                        setOpenChatProjectId(proj.activeProjectId);
                    } : undefined}
                />

                {proj.activeProject && (
                    <WorkspaceStatus
                        projectName={proj.activeProject.name}
                        repoDetails={proj.repoDetails}
                        saveStatus={proj.saveStatus}
                        saveError={proj.saveError}
                        onRetrySave={proj.retrySave}
                        coverage={proj.activeProject.analysisCoverage}
                        warnings={proj.activeProject.analysisWarnings}
                        onRefreshAnalysis={proj.activeProject.source === 'github' ? () => setRefreshDialogOpen(true) : undefined}
                        refreshBusy={proj.refreshAnalysis.status === 'running' || proj.refreshAnalysis.status === 'applying'}
                    />
                )}

                <StorageRecoveryNotice
                    storageReady={proj.storageReady}
                    migration={proj.migration}
                    quarantinedProjects={proj.quarantinedProjects}
                />
                <PersistenceConflictNotice
                    conflict={proj.activeProjectConflict}
                    onReload={() => proj.reloadProjectAfterConflict()}
                    onDuplicateLocalWork={() => proj.duplicateLocalWorkAfterConflict()}
                />

                {/* ── Active content area ──────────────────────── */}
                <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
                {/* Error message */}
                {proj.error && (
                        <div
                            role="alert"
                            aria-live="assertive"
                            className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[min(450px,calc(100%-2rem))] p-3 bg-red-900/70 border border-red-700 rounded-xl flex items-center gap-2 text-red-100 text-sm"
                        >
                            <AlertCircle size={16} />
                            {proj.error}
                        </div>
                )}

                {/* ── Canvas view (default) ────────────────────── */}
                {editorTabs.isCanvasActive && (
                    <div id="editor-panel-__canvas__" role="tabpanel" aria-labelledby="editor-tab-0" className="h-full">
                {/* Left-side toolbars */}
                {proj.activeProjectId && <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    <EditToolbar
                        selectedNode={selectedNode}
                        selectedNodes={selectedNodes}
                        onAddNode={handleAddNode}
                        onDeleteNode={handleDeleteNode}
                        onUpdateNode={handleUpdateNode}
                        onBatchDelete={handleBatchDelete}
                        onBatchUpdateCategory={handleBatchUpdateCategory}
                        onUndo={canUndo ? handleUndoWithMetadata : undefined}
                        onRedo={canRedo ? handleRedoWithMetadata : undefined}
                    />
                    <FlowControls
                        onSearch={handleSearch}
                        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                        onZoomIn={() => zoomIn()}
                        onZoomOut={() => zoomOut()}
                        onFitView={() => fitView({ padding: 0.2 })}
                        onLayoutChange={handleLayoutChange}
                        showMinimap={showMinimap}
                        onToggleMinimap={() => setShowMinimap(!showMinimap)}
                        snapToGrid={snapToGrid}
                        onToggleSnapToGrid={handleToggleSnapToGrid}
                    />
                    <GraphOutline
                        nodes={nodes as Node<NodeData>[]}
                        edges={edges as Edge<EdgeData>[]}
                        onReveal={handleRevealGraphElement}
                    />
                    {activeGraphFilterLabel && (
                        <button
                            type="button"
                            onClick={clearGraphFilters}
                            className="max-w-56 rounded-md border border-cyan-500/40 bg-slate-900 px-3 py-2 text-left text-xs text-cyan-200 shadow-lg"
                            aria-label={`Clear graph filter: ${activeGraphFilterLabel}`}
                        >
                            {activeGraphFilterLabel} · Clear
                        </button>
                    )}
                </div>}

                {/* Empty state */}
                {!proj.activeProjectId && !proj.loading && (
                    <EmptyWorkspace
                        onAnalyzeRepository={() => openCreateProject('github')}
                        onImportProject={() => openCreateProject('json')}
                        onCreateBlank={() => openCreateProject('empty')}
                        onExploreSample={handleExploreSample}
                    />
                )}

                <NodeEditProvider value={nodeEditCtx}>
                  <EdgeEditProvider value={edgeEditCtx}>
                    <ReactFlow
                        aria-label="Architecture canvas"
                        data-canvas-shortcuts="on"
                        tabIndex={0}
                        nodes={renderedNodes}
                        edges={renderedEdges}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={handleEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onEdgeClick={onEdgeClick}
                        onNodeDragStart={onNodeDragStart}
                        onNodeDragStop={onNodeDragStop}
                        onPaneClick={onPaneClick}
                        onSelectionChange={onSelectionChange}
                        nodeTypes={memoNodeTypes}
                        edgeTypes={memoEdgeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                        className="bg-slate-950"
                        onlyRenderVisibleElements
                        defaultEdgeOptions={{ type: 'custom', animated: false }}
                        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
                        connectionLineType={ConnectionLineType.SmoothStep}
                        snapToGrid={snapToGrid}
                        snapGrid={[15, 15]}
                        minZoom={0.1}
                        maxZoom={2}
                        nodesDraggable
                        nodesConnectable
                        elementsSelectable
                        multiSelectionKeyCode="Shift"
                        selectionOnDrag
                        selectionKeyCode="Shift"
                        nodeExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
                        translateExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
                        preventScrolling
                        zoomOnScroll
                        zoomOnPinch
                        panOnScroll={false}
                        panOnDrag
                        selectNodesOnDrag={false}
                        nodeDragThreshold={2}
                        autoPanOnConnect
                        autoPanOnNodeDrag
                    >
                        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
                        {showMinimap && <StyledMiniMap />}
                    </ReactFlow>
                  </EdgeEditProvider>
                </NodeEditProvider>
                    </div>
                )}

                {/* ── File viewer (when a file tab is active) ──── */}
                {!editorTabs.isCanvasActive && editorTabs.activeFilePath && (
                    <div id={`editor-panel-${editorTabs.activeTabId}`} role="tabpanel" className="h-full" data-canvas-shortcuts="off">
                        <FileViewer
                            key={editorTabs.activeFilePath}
                            filePath={editorTabs.activeFilePath}
                            content={editorTabs.activeFileContent}
                            isLoading={editorTabs.isActiveFileLoading}
                            error={editorTabs.activeFileError}
                            sourceLocation={editorTabs.activeFileViewState?.location}
                            navigationKey={editorTabs.activeFileViewState?.navigationKey}
                            initialScrollTop={editorTabs.activeFileViewState?.scrollTop}
                            revision={editorTabs.activeFileRevision}
                            repoDetails={proj.repoDetails}
                            onScrollPositionChange={(scrollTop) => {
                                if (editorTabs.activeFilePath) editorTabs.setFileScrollTop(editorTabs.activeFilePath, scrollTop);
                            }}
                            onRetry={() => {
                                if (editorTabs.activeFilePath) return editorTabs.retryFile(editorTabs.activeFilePath);
                            }}
                            onRefresh={() => {
                                if (editorTabs.activeFilePath) return editorTabs.refreshFile(editorTabs.activeFilePath);
                            }}
                            className="h-full"
                        />
                    </div>
                )}
                </div>
            </div>

            {/* Resize handle */}
            {isChatOpen && (
                <div
                    ref={resizeRef}
                    role="separator"
                    aria-label="Resize Rassam panel"
                    aria-orientation="vertical"
                    aria-valuemin={300}
                    aria-valuemax={800}
                    aria-valuenow={Math.round(chatWidth)}
                    tabIndex={0}
                    className="w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-30 flex items-center justify-center group shrink-0"
                    onMouseDown={handleMouseDown}
                    onKeyDown={handleChatResizeKeyDown}
                >
                    <div className="w-4 h-12 bg-slate-700/50 rounded-full group-hover:bg-blue-500/50 flex items-center justify-center">
                        <GripVertical size={12} className="text-slate-500 group-hover:text-blue-300" />
                    </div>
                </div>
            )}

            {/* Contextual inspector / Rassam pane */}
            {isChatOpen && (
                <div
                    className="workspace-chat-panel h-full shadow-2xl z-20 shrink-0 flex flex-col border-l border-slate-800 bg-slate-900 relative"
                    style={{ width: `${chatWidth}px`, minWidth: '300px', maxWidth: '800px' }}
                >
                    <div className="flex h-11 shrink-0 items-center border-b border-slate-800 bg-slate-950 px-2" role="tablist" aria-label="Context panel">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={rightPanelTab === 'inspector'}
                            onClick={() => setRightPanelTab('inspector')}
                            className={cn(
                                'flex min-h-10 items-center gap-2 border-b-2 px-3 text-xs',
                                rightPanelTab === 'inspector' ? 'border-cyan-400 text-cyan-200' : 'border-transparent text-slate-400 hover:text-slate-200',
                            )}
                        >
                            <FileCheck2 size={14} aria-hidden="true" /> Inspector
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={rightPanelTab === 'rassam'}
                            onClick={() => setRightPanelTab('rassam')}
                            className={cn(
                                'flex min-h-10 items-center gap-2 border-b-2 px-3 text-xs',
                                rightPanelTab === 'rassam' ? 'border-cyan-400 text-cyan-200' : 'border-transparent text-slate-400 hover:text-slate-200',
                            )}
                        >
                            <Bot size={14} aria-hidden="true" /> Rassam
                        </button>
                        <button
                            type="button"
                            aria-label="Close context panel"
                            onClick={() => setOpenChatProjectId(null)}
                            className="ml-auto grid min-h-10 min-w-10 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0" role="tabpanel">
                        {rightPanelTab === 'inspector' ? (
                            <EvidenceInspector
                                selection={selectedNode
                                    ? { kind: 'node', id: selectedNode.id }
                                    : selectedEdge ? { kind: 'edge', id: selectedEdge.id } : null}
                                nodes={nodes}
                                edges={edges}
                                onNavigateToSource={handleNavigateToSource}
                                onRevealGraphElement={handleRevealGraphElement}
                                className="border-l-0"
                            />
                        ) : (
                            <EnhancedChatbot
                                projectId={proj.activeProjectId}
                                graphRevision={proj.activeProject?.graphRevision ?? 0}
                                selectedNode={selectedNode}
                                repoDetails={proj.repoDetails}
                                getCanvasState={getCanvasState}
                                projectName={proj.activeProject?.name}
                                layoutDirection={layoutDirection}
                                syncedCanvasContext={proj.activeProject?.aiContextSnapshot || null}
                                liveCanvasLastModifiedAt={canvasLastModifiedAt}
                                chatSessions={proj.activeProject?.chatSessions || []}
                                activeChatSessionId={proj.activeProject?.activeChatSessionId || null}
                                onUpdateMessages={proj.updateChatMessages}
                                onCreateNewChat={proj.createNewChatSession}
                                onSwitchChat={proj.switchChatSession}
                                onDeleteChat={proj.deleteChatSession}
                                getCachedFiles={handleGetCachedFiles}
                                cachedFilePaths={fileExplorer.cachedPaths}
                                availableFiles={availableFiles}
                                onApplyCanvasPatch={handleApplyCanvasPatch}
                                onNavigateToSource={handleNavigateToSource}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Wrap with ReactFlowProvider
export default function Home() {
    return (
        <ReactFlowProvider>
            <ErrorBoundary>
                <FlowCanvas />
            </ErrorBoundary>
        </ReactFlowProvider>
    );
}
