'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
    Search,
    Github,
    Loader2,
    AlertCircle,
    FileCode,
    GitBranch,
    ExternalLink,
    FolderOpen,
    GripVertical,
    Settings,
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
import ProjectSidebar from '@/components/projects/ProjectSidebar';
import CreateProjectModal from '@/components/projects/CreateProjectModal';
import { cn } from '@/lib/utils';

import { useCanvasHistory } from '@/hooks/useCanvasHistory';
import { useClipboard } from '@/hooks/useClipboard';
import { useCanvasShortcuts } from '@/hooks/useCanvasShortcuts';
import { useResizablePane } from '@/hooks/useResizablePane';
import { useProjects } from '@/hooks/useProjects';

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
        useResizablePane('repoAgent_chatWidth');

    // ── Stable type maps (prevent ReactFlow re-registration) ──
    const memoNodeTypes = useMemo(() => nodeTypes, []);
    const memoEdgeTypes = useMemo(() => edgeTypes, []);

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

    const handleAddNode = useCallback((nodeData: any) => {
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
        setNodes((nds) => nds.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, category } } : n)));
    }, [setNodes, saveToHistory]);

    const handleUpdateNode = useCallback((nodeId: string, data: any) => {
        saveToHistory();
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)));
    }, [setNodes, saveToHistory]);

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
            {/* Project list sidebar */}
            <AnimatePresence>
                {proj.showProjectList && (
                    <ProjectSidebar
                        projects={proj.projects}
                        activeProjectId={proj.activeProjectId}
                        onSwitchProject={proj.switchToProject}
                        onDeleteProject={proj.deleteProject}
                        onCreateNew={() => proj.setShowCreateProjectModal(true)}
                        onClose={() => proj.setShowProjectList(false)}
                    />
                )}
            </AnimatePresence>

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
            <div className="flex-1 relative h-full">
                {/* Projects toggle */}
                <button
                    onClick={() => proj.setShowProjectList(!proj.showProjectList)}
                    className={cn(
                        'absolute top-4 left-4 z-20 p-2.5 rounded-xl transition-all',
                        'bg-slate-900/90 backdrop-blur border border-slate-700 hover:bg-slate-800',
                        proj.showProjectList && 'bg-blue-500/20 border-blue-500/30',
                    )}
                    title="Projects"
                >
                    <FolderOpen size={18} className={proj.showProjectList ? 'text-blue-400' : 'text-slate-400'} />
                    {proj.projects.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center">
                            {proj.projects.length}
                        </span>
                    )}
                </button>

                {/* Floating header / repo input */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[550px]">
                    <div className="flex gap-2">
                        <div className="relative flex-1 group">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                                <Github size={20} />
                            </div>
                            <input
                                value={proj.repoUrl}
                                onChange={(e) => proj.setRepoUrl(e.target.value)}
                                className="w-full bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 shadow-xl transition-all"
                                placeholder="https://github.com/owner/repo"
                                onKeyDown={(e) => e.key === 'Enter' && proj.handleVisualize()}
                            />
                        </div>
                        <button
                            onClick={proj.handleVisualize}
                            disabled={proj.loading || !proj.repoUrl}
                            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl px-5 py-2 font-medium shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {proj.loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Search size={18} />
                            )}
                            <span className="hidden sm:inline">{proj.loading ? 'Analyzing...' : 'Visualize'}</span>
                        </button>
                        <ExportPanel repoDetails={proj.repoDetails} onImportProject={proj.handleImportProject} />
                        <Link
                            href="/settings"
                            className="bg-slate-900/90 backdrop-blur-md border border-slate-700 hover:bg-slate-800 rounded-xl px-3 py-2 text-slate-300 transition-all flex items-center"
                            title="AI Settings"
                        >
                            <Settings size={18} />
                        </Link>
                    </div>

                    {/* Error message */}
                    <AnimatePresence>
                        {proj.error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="mt-2 p-3 bg-red-900/50 border border-red-700 rounded-xl flex items-center gap-2 text-red-200 text-sm"
                            >
                                <AlertCircle size={16} />
                                {proj.error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Repo info badge */}
                    <AnimatePresence>
                        {proj.repoDetails && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 flex items-center justify-center gap-3 text-xs"
                            >
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full">
                                    <GitBranch size={12} className="text-blue-400" />
                                    <span className="text-slate-300">{proj.repoDetails.owner}/{proj.repoDetails.repo}</span>
                                </div>
                                {proj.repoDetails.fileCount && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full">
                                        <FileCode size={12} className="text-green-400" />
                                        <span className="text-slate-300">{proj.repoDetails.fileCount} files</span>
                                    </div>
                                )}
                                <a
                                    href={proj.repoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full text-slate-400 hover:text-slate-200 transition-colors"
                                >
                                    <ExternalLink size={12} />
                                    Open
                                </a>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Left-side toolbars */}
                <div className="absolute top-20 left-4 z-10 flex flex-col gap-2">
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
            </div>

            {/* Resize handle */}
            <div
                ref={resizeRef}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-30 flex items-center justify-center group"
                onMouseDown={handleMouseDown}
                style={{ left: `calc(100% - ${chatWidth}px)` }}
            >
                <div className="w-4 h-12 bg-slate-700/50 rounded-full group-hover:bg-blue-500/50 flex items-center justify-center">
                    <GripVertical size={12} className="text-slate-500 group-hover:text-blue-300" />
                </div>
            </div>

            {/* Right-side chat pane */}
            <div
                className="h-full shadow-2xl z-20 transition-all duration-75"
                style={{ width: `${chatWidth}px`, minWidth: '300px', maxWidth: '800px' }}
            >
                <EnhancedChatbot
                    selectedNode={selectedNode}
                    repoDetails={proj.repoDetails}
                    allNodes={nodes}
                    allEdges={edges}
                    projectName={proj.activeProject?.name}
                    layoutDirection={layoutDirection}
                    syncedCanvasContext={proj.activeProject?.aiContextSnapshot || null}
                    chatSessions={proj.activeProject?.chatSessions || []}
                    activeChatSessionId={proj.activeProject?.activeChatSessionId || null}
                    onUpdateMessages={proj.updateChatMessages}
                    onCreateNewChat={proj.createNewChatSession}
                    onSwitchChat={proj.switchChatSession}
                    onDeleteChat={proj.deleteChatSession}
                />
            </div>
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
