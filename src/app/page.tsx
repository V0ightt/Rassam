'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactFlow, {
    Background,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Connection,
    addEdge,
    Node,
    useReactFlow,
    ReactFlowProvider,
    ConnectionLineType,
    OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
    Github,
    AlertCircle,
    GripVertical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import nodeTypes from '@/components/canvas/NodeTypes';
import { edgeTypes } from '@/components/canvas/CustomEdge';
import { NodeEditProvider } from '@/components/canvas/NodeEditContext';
import EnhancedChatbot from '@/components/sidebar/EnhancedChatbot';
import ExportPanel from '@/components/canvas/ExportPanel';
import EditToolbar from '@/components/canvas/EditToolbar';
import FlowControls, { StyledMiniMap } from '@/components/canvas/FlowControls';
import ErrorBoundary from '@/components/ErrorBoundary';
import ActivityBar, { ActivityPanel } from '@/components/navigation/ActivityBar';
import ProjectSidebar from '@/components/projects/ProjectSidebar';
import FileExplorer from '@/components/explorer/FileExplorer';
import CreateProjectModal from '@/components/projects/CreateProjectModal';

import { useCanvasHistory } from '@/hooks/useCanvasHistory';
import { useClipboard } from '@/hooks/useClipboard';
import { useCanvasShortcuts } from '@/hooks/useCanvasShortcuts';
import { useResizablePane } from '@/hooks/useResizablePane';
import { useProjects } from '@/hooks/useProjects';
import { useFileExplorer } from '@/hooks/useFileExplorer';
import { useEditorTabs } from '@/hooks/useEditorTabs';
import { getCachedFiles as getFilesFromStore } from '@/lib/file-store';
import TabBar from '@/components/editor/TabBar';
import FileViewer from '@/components/editor/FileViewer';
import { ChatCanvasWriteOperation, EdgeData, NodeCategory, NodeData } from '@/types';

type EditableNodeInput = Partial<NodeData> & Pick<NodeData, 'label' | 'description' | 'files'>;

// ─────────────────────────────────────────────────────────────
// FlowCanvas – thin orchestration shell that wires together
// extracted hooks (projects, history, clipboard, shortcuts,
// resizable pane) and the ReactFlow canvas.
// ─────────────────────────────────────────────────────────────

function FlowCanvas() {
    // ── React Flow core state ─────────────────────────────────
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView, zoomIn, zoomOut } = useReactFlow();

    // ── Local canvas UI state ─────────────────────────────────
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
    const [showMinimap, setShowMinimap] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');

    // ── Extracted hooks ───────────────────────────────────────
    const { saveToHistory, handleUndo, handleRedo, canUndo, canRedo } =
        useCanvasHistory(nodes, edges, setNodes, setEdges);

    const { handleCopy, handlePaste } = useClipboard(
        selectedNodes, selectedNode, edges, saveToHistory, setNodes, setEdges,
    );

    const proj = useProjects({
        nodes, edges, setNodes, setEdges,
        selectedNode, layoutDirection, setLayoutDirection,
        setSelectedNode, fitView, saveToHistory,
    });

    const { width: chatWidth, handleMouseDown, resizeRef } =
        useResizablePane('repoAgent_chatWidth', { side: 'right' });

    const {
        width: leftPanelWidth,
        handleMouseDown: handleLeftPanelResize,
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
    const [isChatOpen, setIsChatOpen] = useState(true);

    // ── File Explorer ─────────────────────────────────────────
    const fileExplorer = useFileExplorer({
        projectId: proj.activeProjectId,
        fileEntries: proj.activeProject?.fileTree || [],
        repoDetails: proj.repoDetails,
    });

    // ── Editor tabs (file viewer) ─────────────────────────────
    const editorTabs = useEditorTabs({
        projectId: proj.activeProjectId,
        repoDetails: proj.repoDetails,
    });

    /** Clicking a file in the explorer: fetch + open in a tab */
    const handleFileClick = useCallback(async (filePath: string) => {
        const prefetchedContent = await fileExplorer.fetchFile(filePath);
        await editorTabs.openFile(filePath, prefetchedContent ?? undefined);
    }, [fileExplorer, editorTabs]);

    const handlePanelChange = useCallback((panel: ActivityPanel) => {
        if (panel === 'settings') {
            window.location.href = '/settings';
            return;
        }
        setActivePanel(panel);
        // Keep project list visibility in sync
        if (panel === 'projects') {
            proj.setShowProjectList(true);
        } else {
            proj.setShowProjectList(false);
        }
    }, [proj]);

    /** Retrieve cached file contents from IndexedDB for chat context. */
    const handleGetCachedFiles = useCallback(
        async (paths: string[]) => {
            if (!proj.activeProjectId) return {};
            return getFilesFromStore(proj.activeProjectId, paths);
        },
        [proj.activeProjectId],
    );

    // ── Stable type maps (prevent ReactFlow re-registration) ──
    const memoNodeTypes = useMemo(() => nodeTypes, []);
    const memoEdgeTypes = useMemo(() => edgeTypes, []);

    // ── Refs for stable chatbot getter (avoids re-render on every drag) ──
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    const getCanvasState = useCallback(() => ({
        nodes: nodesRef.current,
        edges: edgesRef.current,
    }), []);

    // ── Canvas interaction ────────────────────────────────────

    const onConnect = useCallback((params: Connection) => {
        saveToHistory();
        setEdges((eds) =>
            addEdge(
                { ...params, type: 'custom', animated: false, data: { type: 'dependency', strength: 'normal' } },
                eds,
            ),
        );
    }, [setEdges, saveToHistory]);

    const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
        setSelectedNodes(sel);
        setSelectedNode(sel.length === 1 ? sel[0] : null);
    }, []);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setSelectedNodes([]);
    }, []);

    // ── Node CRUD ─────────────────────────────────────────────

    const handleAddNode = useCallback((nodeData: EditableNodeInput) => {
        saveToHistory();
        setNodes((nds) => [
            ...nds,
            {
                id: `node-${Date.now()}`,
                type: 'enhanced',
                position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
                data: { ...nodeData, category: nodeData.category || 'default', complexity: 'low' },
            },
        ]);
    }, [setNodes, saveToHistory]);

    const handleDeleteNode = useCallback((nodeId: string) => {
        saveToHistory();
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNode(null);
    }, [setNodes, setEdges, saveToHistory]);

    const handleBatchDelete = useCallback((nodeIds: string[]) => {
        if (!nodeIds.length) return;
        saveToHistory();
        const ids = new Set(nodeIds);
        setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
        setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
        setSelectedNode(null);
        setSelectedNodes([]);
    }, [setNodes, setEdges, saveToHistory]);

    const handleBatchUpdateCategory = useCallback((nodeIds: string[], category: string) => {
        if (!nodeIds.length) return;
        saveToHistory();
        const ids = new Set(nodeIds);
        const nextCategory = category as NodeCategory;
        setNodes((nds) => nds.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, category: nextCategory } } : n)));
    }, [setNodes, saveToHistory]);

    const handleUpdateNode = useCallback((nodeId: string, data: Partial<NodeData>) => {
        saveToHistory();
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)));
    }, [setNodes, saveToHistory]);

    const handleApplyChatWrite = useCallback((operation: ChatCanvasWriteOperation) => {
        saveToHistory();

        switch (operation.action) {
            case 'add_node': {
                setNodes((nds) => [
                    ...nds,
                    {
                        id: operation.node.id,
                        type: operation.node.type || 'enhanced',
                        position: operation.node.position,
                        data: operation.node.data,
                    },
                ]);
                break;
            }

            case 'edit_node': {
                setNodes((nds) => nds.map((node) => {
                    if (node.id !== operation.nodeId) return node;

                    const { position, ...dataChanges } = operation.changes;
                    return {
                        ...node,
                        position: position || node.position,
                        data: {
                            ...node.data,
                            ...(dataChanges as Partial<NodeData>),
                            category: (dataChanges.category as NodeCategory | undefined) || node.data.category,
                        },
                    };
                }));
                if (selectedNode?.id === operation.nodeId) {
                    setSelectedNode((prev) => prev ? {
                        ...prev,
                        position: operation.changes.position || prev.position,
                        data: { ...prev.data, ...(operation.changes as Partial<NodeData>) },
                    } : prev);
                }
                break;
            }

            case 'delete_node': {
                setNodes((nds) => nds.filter((node) => node.id !== operation.nodeId));
                setEdges((eds) => eds.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId));
                if (selectedNode?.id === operation.nodeId) {
                    setSelectedNode(null);
                }
                setSelectedNodes((prev) => prev.filter((node) => node.id !== operation.nodeId));
                break;
            }

            case 'add_edge': {
                setEdges((eds) => [
                    ...eds,
                    {
                        id: operation.edge.id,
                        source: operation.edge.source,
                        target: operation.edge.target,
                        type: operation.edge.type || 'custom',
                        data: operation.edge.data,
                    },
                ]);
                break;
            }

            case 'edit_edge': {
                setEdges((eds) => eds.map((edge) => {
                    if (edge.id !== operation.edgeId) return edge;
                    const nextData = operation.changes.data
                        ? { ...(edge.data as EdgeData | undefined), ...operation.changes.data }
                        : edge.data;

                    return {
                        ...edge,
                        source: operation.changes.source || edge.source,
                        target: operation.changes.target || edge.target,
                        type: operation.changes.type || edge.type,
                        data: nextData,
                    };
                }));
                break;
            }

            case 'delete_edge': {
                setEdges((eds) => eds.filter((edge) => edge.id !== operation.edgeId));
                break;
            }
        }
    }, [saveToHistory, selectedNode, setEdges, setNodes]);

    const nodeEditCtx = useMemo(() => ({ onUpdateNode: handleUpdateNode }), [handleUpdateNode]);

    // ── Search & helpers ──────────────────────────────────────

    const handleSearch = useCallback((query: string) => {
        if (!query) {
            setNodes((nds) => nds.map((n) => ({ ...n, style: undefined })));
            return;
        }
        const lq = query.toLowerCase();
        setNodes((nds) =>
            nds.map((n) => {
                const hit =
                    n.data.label?.toLowerCase().includes(lq) ||
                    n.data.description?.toLowerCase().includes(lq) ||
                    n.data.files?.some((f: string) => f.toLowerCase().includes(lq));
                return { ...n, style: hit ? { opacity: 1 } : { opacity: 0.3 } };
            }),
        );
    }, [setNodes]);

    const handleSelectAll = useCallback(
        () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))),
        [setNodes],
    );

    const handleDuplicateSelected = useCallback(() => {
        if (!selectedNode) return;
        saveToHistory();
        setNodes((nds) => [
            ...nds,
            {
                ...selectedNode,
                id: `node-${Date.now()}`,
                position: { x: selectedNode.position.x + 50, y: selectedNode.position.y + 50 },
                selected: false,
            },
        ]);
    }, [selectedNode, setNodes, saveToHistory]);

    const handleToggleSnapToGrid = useCallback(() => setSnapToGrid((s) => !s), []);

    const handleLayoutChange = useCallback(
        async (direction: 'TB' | 'LR') => {
            if (!nodes.length) return;
            setLayoutDirection(direction);
            try {
                const res = await fetch('/api/repo', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nodes, edges, layout: direction }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setNodes(data.nodes);
                    setEdges(data.edges);
                    setTimeout(() => fitView({ padding: 0.2 }), 100);
                }
            } catch (err) {
                console.error('Layout change failed:', err);
            }
        },
        [nodes, edges, setNodes, setEdges, fitView],
    );

    // ── Keyboard shortcuts (single stable effect) ─────────────

    useCanvasShortcuts({
        selectedNode,
        selectedNodes,
        setSelectedNode,
        handleDeleteNode,
        handleBatchDelete,
        handleUndo,
        handleRedo,
        handleCopy,
        handlePaste,
        handleSelectAll,
        handleDuplicateSelected,
        handleToggleSnapToGrid,
    });

    // ── Render ────────────────────────────────────────────────

    return (
        <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
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
                        onImportProject={proj.handleImportProject}
                        compact
                    />
                }
            />

            {/* ── Left panel (Projects / Explorer) ────────────── */}
            <AnimatePresence initial={false}>
                {(activePanel === 'projects' || activePanel === 'explorer') && (
                    <motion.div
                        key={`${activePanel}-panel`}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: leftPanelWidth, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ width: leftPanelWidth }}
                        className="h-full overflow-hidden border-r border-slate-800 bg-slate-900 z-40 shrink-0"
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
                                fileEntries={proj.activeProject?.fileTree || []}
                                cachedPaths={fileExplorer.cachedPaths}
                                fetchingPaths={fileExplorer.fetchingPaths}
                                onFetchFile={handleFileClick}
                                onFetchAll={fileExplorer.fetchAll}
                                projectName={proj.activeProject?.name}
                                totalFiles={(proj.activeProject?.fileTree || []).filter(e => e.type === 'blob').length}
                                isFetchingAll={fileExplorer.isFetchingAll}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {(activePanel === 'projects' || activePanel === 'explorer') && (
                <div
                    ref={leftPanelResizeRef}
                    className="w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-30 flex items-center justify-center group shrink-0"
                    onMouseDown={handleLeftPanelResize}
                >
                    <div className="w-4 h-12 bg-slate-700/50 rounded-full group-hover:bg-blue-500/50 flex items-center justify-center">
                        <GripVertical size={12} className="text-slate-500 group-hover:text-blue-300" />
                    </div>
                </div>
            )}

            {/* Create-project modal */}
            <AnimatePresence>
                {proj.showCreateProjectModal && (
                    <CreateProjectModal
                        mode={proj.createProjectMode}
                        onModeChange={proj.setCreateProjectMode}
                        newProjectUrl={proj.newProjectUrl}
                        onUrlChange={proj.setNewProjectUrl}
                        newProjectName={proj.newProjectName}
                        onNameChange={proj.setNewProjectName}
                        loading={proj.loading}
                        importError={proj.importError}
                        importFileRef={proj.importFileRef}
                        onClose={() => proj.setShowCreateProjectModal(false)}
                        onCreateFromGitHub={proj.startGitHubProjectCreation}
                        onCreateEmpty={proj.handleCreateEmptyProject}
                        onImportFile={proj.handleImportProject}
                        onClearImportError={() => proj.setImportError(null)}
                    />
                )}
            </AnimatePresence>

            {/* Main canvas area */}
            <div className="flex-1 relative h-full flex flex-col">
                {/* ── Tab Bar ──────────────────────────────────── */}
                <TabBar
                    tabs={editorTabs.tabs}
                    activeTabId={editorTabs.activeTabId}
                    onSelectTab={editorTabs.selectTab}
                    onCloseTab={editorTabs.closeTab}
                    onCloseAll={editorTabs.closeAllTabs}
                    isChatOpen={isChatOpen}
                    onToggleChat={() => setIsChatOpen((prev) => !prev)}
                />

                {/* ── Active content area ──────────────────────── */}
                <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
                {/* Error message */}
                <AnimatePresence>
                    {proj.error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[450px] p-3 bg-red-900/50 border border-red-700 rounded-xl flex items-center gap-2 text-red-200 text-sm"
                        >
                            <AlertCircle size={16} />
                            {proj.error}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Canvas view (default) ────────────────────── */}
                {editorTabs.isCanvasActive && (
                    <>
                {/* Left-side toolbars */}
                <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    <EditToolbar
                        selectedNode={selectedNode}
                        selectedNodes={selectedNodes}
                        onAddNode={handleAddNode}
                        onDeleteNode={handleDeleteNode}
                        onUpdateNode={handleUpdateNode}
                        onBatchDelete={handleBatchDelete}
                        onBatchUpdateCategory={handleBatchUpdateCategory}
                        onUndo={canUndo ? handleUndo : undefined}
                        onRedo={canRedo ? handleRedo : undefined}
                    />
                    <FlowControls
                        onSearch={handleSearch}
                        onZoomIn={() => zoomIn()}
                        onZoomOut={() => zoomOut()}
                        onFitView={() => fitView({ padding: 0.2 })}
                        onLayoutChange={handleLayoutChange}
                        showMinimap={showMinimap}
                        onToggleMinimap={() => setShowMinimap(!showMinimap)}
                        snapToGrid={snapToGrid}
                        onToggleSnapToGrid={handleToggleSnapToGrid}
                        onSelectAll={handleSelectAll}
                        onDuplicateSelected={handleDuplicateSelected}
                        onSyncCanvas={proj.handleSyncCanvas}
                        isSyncing={proj.isSyncingCanvas}
                        lastSyncedAt={proj.activeProject?.lastSyncedAt || null}
                    />
                </div>

                {/* Empty state */}
                <AnimatePresence>
                    {nodes.length === 0 && !proj.loading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        >
                            <div className="text-center">
                                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 flex items-center justify-center">
                                    <Github size={40} className="text-blue-400/50" />
                                </div>
                                <h2 className="text-xl font-semibold text-slate-400 mb-2">
                                    Create from GitHub or start empty
                                </h2>
                                <p className="text-sm text-slate-500 max-w-md">
                                    Use the Projects panel (+) to create a GitHub project or an empty canvas, then edit nodes and sync context with AI
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <NodeEditProvider value={nodeEditCtx}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        onSelectionChange={onSelectionChange}
                        nodeTypes={memoNodeTypes}
                        edgeTypes={memoEdgeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                        className="bg-slate-950"
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
                </NodeEditProvider>
                    </>
                )}

                {/* ── File viewer (when a file tab is active) ──── */}
                {!editorTabs.isCanvasActive && editorTabs.activeFilePath && (
                    <FileViewer
                        key={editorTabs.activeFilePath}
                        filePath={editorTabs.activeFilePath}
                        content={editorTabs.activeFileContent}
                        isLoading={editorTabs.isActiveFileLoading}
                        className="h-full"
                    />
                )}
                </div>
            </div>

            {/* Resize handle */}
            {isChatOpen && (
                <div
                    ref={resizeRef}
                    className="w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-30 flex items-center justify-center group shrink-0"
                    onMouseDown={handleMouseDown}
                >
                    <div className="w-4 h-12 bg-slate-700/50 rounded-full group-hover:bg-blue-500/50 flex items-center justify-center">
                        <GripVertical size={12} className="text-slate-500 group-hover:text-blue-300" />
                    </div>
                </div>
            )}

            {/* Right-side chat pane */}
            {isChatOpen && (
                <div
                    className="h-full shadow-2xl z-20 shrink-0 flex flex-col border-l border-slate-800 bg-slate-900 relative"
                    style={{ width: `${chatWidth}px`, minWidth: '300px', maxWidth: '800px' }}
                >
                    <div className="flex-1 min-h-0">
                        <EnhancedChatbot
                            projectId={proj.activeProjectId}
                            selectedNode={selectedNode}
                            repoDetails={proj.repoDetails}
                            getCanvasState={getCanvasState}
                            projectName={proj.activeProject?.name}
                            layoutDirection={layoutDirection}
                            syncedCanvasContext={proj.activeProject?.aiContextSnapshot || null}
                            chatSessions={proj.activeProject?.chatSessions || []}
                            activeChatSessionId={proj.activeProject?.activeChatSessionId || null}
                            onUpdateMessages={proj.updateChatMessages}
                            onCreateNewChat={proj.createNewChatSession}
                            onSwitchChat={proj.switchChatSession}
                            onDeleteChat={proj.deleteChatSession}
                            getCachedFiles={handleGetCachedFiles}
                            cachedFilePaths={fileExplorer.cachedPaths}
                            onApplyCanvasWrite={handleApplyChatWrite}
                            onClose={() => setIsChatOpen(false)}
                        />
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
