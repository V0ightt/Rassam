'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import ReactFlow, { 
    Background, 
    useNodesState, 
    useEdgesState, 
    BackgroundVariant,
    Connection,
    addEdge,
    Edge,
    Node,
    useReactFlow,
    ReactFlowProvider,
    Panel,
    ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
    Search, 
    Github, 
    Loader2, 
    AlertCircle,
    FileCode,
    GitBranch,
    Star,
    ExternalLink,
    RefreshCw,
    GripVertical,
    FolderOpen,
    Trash2,
    ChevronLeft,
    Plus,
    X,
    Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import nodeTypes from '@/components/canvas/NodeTypes';
import { edgeTypes } from '@/components/canvas/CustomEdge';
import EnhancedChatbot from '@/components/sidebar/EnhancedChatbot';
import ExportPanel from '@/components/canvas/ExportPanel';
import EditToolbar from '@/components/canvas/EditToolbar';
import FlowControls, { StyledMiniMap } from '@/components/canvas/FlowControls';
import { CanvasSyncSnapshot, Project, ProjectSource, ChatSession, RepoDetails } from '@/types';
import { cn } from '@/lib/utils';

// Storage keys
const STORAGE_KEYS = {
    PROJECTS: 'repoAgent_projects',
    ACTIVE_PROJECT_ID: 'repoAgent_activeProjectId',
    CHAT_WIDTH: 'repoAgent_chatWidth',
};

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Create a new project
const createNewProject = (
    repoUrl: string,
    repoDetails: RepoDetails | null,
    nodes: any[],
    edges: any[],
    options?: {
        name?: string;
        source?: ProjectSource;
        layoutDirection?: 'TB' | 'LR';
        snapshot?: CanvasSyncSnapshot | null;
    }
): Project => {
    const now = new Date();
    const source = options?.source || (repoDetails ? 'github' : 'empty');
    const projectName = options?.name || (repoDetails 
        ? `${repoDetails.owner}/${repoDetails.repo}`
        : repoUrl || 'New Project');
    
    const initialChatSession: ChatSession = {
        id: generateId(),
        title: 'Chat 1',
        messages: [{
            id: '1',
            role: 'assistant',
            content: "👋 Hi! I'm **Rassam** (رسّام), your AI assistant for understanding code and flowcharts.\n\n**Quick tips:**\n- Add or edit nodes/edges on the canvas\n- Use the **Sync** button to update my project context\n- Ask questions about selected nodes or the whole architecture\n\nLet's explore this project together!",
            timestamp: now
        }],
        createdAt: now,
        updatedAt: now
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
        chatSessions: [initialChatSession],
        activeChatSessionId: initialChatSession.id,
        createdAt: now,
        updatedAt: now
    };
};

function FlowCanvas() {
    // State for Flow
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    
    // State for Projects
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [showProjectList, setShowProjectList] = useState(false);
    const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
    const [createProjectMode, setCreateProjectMode] = useState<ProjectSource>('github');
    const [newProjectUrl, setNewProjectUrl] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    
    // State for UI
    const [repoUrl, setRepoUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [repoDetails, setRepoDetails] = useState<RepoDetails | null>(null);
    const [showMinimap, setShowMinimap] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
    const [isSyncingCanvas, setIsSyncingCanvas] = useState(false);
    
    // Resizable chat state
    const [chatWidth, setChatWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null);

    const { fitView, zoomIn, zoomOut } = useReactFlow();
    
    // Get active project
    const activeProject = useMemo(() => 
        projects.find(p => p.id === activeProjectId) || null
    , [projects, activeProjectId]);
    
    // Get active chat session
    const activeChatSession = useMemo(() => {
        if (!activeProject) return null;
        return activeProject.chatSessions.find(s => s.id === activeProject.activeChatSessionId) || null;
    }, [activeProject]);
    
    // Load saved state from localStorage on mount
    useEffect(() => {
        try {
            const savedProjects = localStorage.getItem(STORAGE_KEYS.PROJECTS);
            const savedActiveProjectId = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
            const savedChatWidth = localStorage.getItem(STORAGE_KEYS.CHAT_WIDTH);
            
            if (savedProjects) {
                const parsed = JSON.parse(savedProjects);
                // Restore dates
                const restored = parsed.map((p: any) => ({
                    ...p,
                    source: p.source || (p.repoDetails ? 'github' : 'empty'),
                    layoutDirection: p.layoutDirection || 'TB',
                    aiContextSnapshot: p.aiContextSnapshot || null,
                    lastSyncedAt: p.lastSyncedAt || null,
                    createdAt: new Date(p.createdAt),
                    updatedAt: new Date(p.updatedAt),
                    chatSessions: p.chatSessions.map((s: any) => ({
                        ...s,
                        createdAt: new Date(s.createdAt),
                        updatedAt: new Date(s.updatedAt),
                        messages: s.messages.map((m: any) => ({
                            ...m,
                            timestamp: new Date(m.timestamp)
                        }))
                    }))
                }));
                setProjects(restored);
                
                if (savedActiveProjectId && restored.find((p: Project) => p.id === savedActiveProjectId)) {
                    setActiveProjectId(savedActiveProjectId);
                    const project = restored.find((p: Project) => p.id === savedActiveProjectId);
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
            
            if (savedChatWidth) setChatWidth(parseInt(savedChatWidth));
        } catch (e) {
            console.error('Error loading saved state:', e);
        }
    }, []);
    
    // Save projects to localStorage when they change
    useEffect(() => {
        if (projects.length > 0) {
            localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
            return;
        }
        localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    }, [projects]);
    
    // Save active project ID
    useEffect(() => {
        if (activeProjectId) {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, activeProjectId);
        }
    }, [activeProjectId]);
    
    // Update project when nodes/edges change
    useEffect(() => {
        if (activeProjectId) {
            setProjects(prev => prev.map(p => 
                p.id === activeProjectId 
                    ? { ...p, nodes, edges, layoutDirection, updatedAt: new Date() }
                    : p
            ));
        }
    }, [nodes, edges, activeProjectId, layoutDirection]);
    
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.CHAT_WIDTH, chatWidth.toString());
    }, [chatWidth]);
    
    // Resize handler
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);
    
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            setChatWidth(Math.max(300, Math.min(800, newWidth)));
        };
        
        const handleMouseUp = () => {
            setIsResizing(false);
        };
        
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }
        
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);
    
    // Memoize node types and edge types to prevent re-renders
    const memoizedNodeTypes = useMemo(() => nodeTypes, []);
    const memoizedEdgeTypes = useMemo(() => edgeTypes, []);

    // Save to history for undo
    const saveToHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-10), { nodes: [...nodes], edges: [...edges] }]);
    }, [nodes, edges]);

    // Undo
    const handleUndo = useCallback(() => {
        if (history.length > 0) {
            const lastState = history[history.length - 1];
            setNodes(lastState.nodes);
            setEdges(lastState.edges);
            setHistory(prev => prev.slice(0, -1));
        }
    }, [history, setNodes, setEdges]);

    // Repo Fetch Handler
    const createProjectFromGitHub = useCallback(async (url: string) => {
        if (!url) return;
        setLoading(true);
        setError(null);
        saveToHistory();
        
        try {
            const res = await fetch('/api/repo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to fetch");
            }

            const data = await res.json();
            setNodes(data.nodes);
            setEdges(data.edges);
            setRepoDetails(data.repoDetails);
            setRepoUrl(url);
            setLayoutDirection('TB');
            
            // Create new project
            const newProject = createNewProject(url, data.repoDetails, data.nodes, data.edges, {
                source: 'github',
                layoutDirection: 'TB',
            });
            setProjects(prev => [...prev, newProject]);
            setActiveProjectId(newProject.id);
            setNewProjectUrl('');
            
            // Fit view after a short delay to ensure nodes are rendered
            setTimeout(() => fitView({ padding: 0.2 }), 100);
        } catch (error: any) {
            setError(error.message || "Error analyzing repository");
        } finally {
            setLoading(false);
        }
    }, [fitView, saveToHistory, setEdges, setNodes]);

    const handleVisualize = useCallback(async () => {
        if (!repoUrl.trim()) return;
        await createProjectFromGitHub(repoUrl.trim());
    }, [createProjectFromGitHub, repoUrl]);

    const handleCreateEmptyProject = useCallback(() => {
        const nowName = newProjectName.trim();
        const projectName = nowName || `Project ${projects.length + 1}`;
        const newProject = createNewProject('', null, [], [], {
            name: projectName,
            source: 'empty',
            layoutDirection,
        });

        setProjects(prev => [...prev, newProject]);
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
    }, [layoutDirection, newProjectName, projects.length, setEdges, setNodes]);
    
    // Switch to a project
    const switchToProject = useCallback((projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (project) {
            setActiveProjectId(projectId);
            setNodes(project.nodes);
            setEdges(project.edges);
            setRepoDetails(project.repoDetails);
            setRepoUrl(project.repoUrl);
            setLayoutDirection(project.layoutDirection || 'TB');
            setSelectedNode(null);
            setShowProjectList(false);
            setTimeout(() => fitView({ padding: 0.2 }), 100);
        }
    }, [projects, setNodes, setEdges, fitView]);
    
    // Delete a project
    const deleteProject = useCallback((projectId: string) => {
        setProjects(prev => {
            const filtered = prev.filter(p => p.id !== projectId);
            if (projectId === activeProjectId) {
                if (filtered.length > 0) {
                    const nextProject = filtered[0];
                    setActiveProjectId(nextProject.id);
                    setNodes(nextProject.nodes);
                    setEdges(nextProject.edges);
                    setRepoDetails(nextProject.repoDetails);
                    setRepoUrl(nextProject.repoUrl);
                    setLayoutDirection(nextProject.layoutDirection || 'TB');
                } else {
                    setActiveProjectId(null);
                    setNodes([]);
                    setEdges([]);
                    setRepoDetails(null);
                    setRepoUrl('');
                    setLayoutDirection('TB');
                    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
                    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
                }
            }
            return filtered;
        });
    }, [activeProjectId, setNodes, setEdges]);

    const handleSyncCanvas = useCallback(() => {
        if (!activeProjectId) {
            setError('Create or select a project before syncing the canvas.');
            return;
        }

        setIsSyncingCanvas(true);
        const syncedAt = new Date().toISOString();

        setProjects(prev => prev.map(p => {
            if (p.id !== activeProjectId) return p;

            const snapshot: CanvasSyncSnapshot = {
                syncedAt,
                project: {
                    id: p.id,
                    name: p.name,
                    source: p.source,
                    repo: p.repoDetails ? `${p.repoDetails.owner}/${p.repoDetails.repo}` : undefined,
                },
                layoutDirection,
                selectedNodeId: selectedNode?.id || null,
                selectedNodeLabel: selectedNode?.data?.label || null,
                nodes: nodes.map(n => ({
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
                edges: edges.map(e => ({
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
        }));

        setError(null);
        setTimeout(() => setIsSyncingCanvas(false), 250);
    }, [activeProjectId, edges, layoutDirection, nodes, selectedNode]);
    
    // Update chat session messages
    const updateChatMessages = useCallback((messages: any[]) => {
        if (!activeProjectId || !activeProject?.activeChatSessionId) return;
        
        setProjects(prev => prev.map(p => {
            if (p.id !== activeProjectId) return p;
            return {
                ...p,
                chatSessions: p.chatSessions.map(s => 
                    s.id === p.activeChatSessionId 
                        ? { ...s, messages, updatedAt: new Date() }
                        : s
                ),
                updatedAt: new Date()
            };
        }));
    }, [activeProjectId, activeProject?.activeChatSessionId]);
    
    // Create new chat session
    const createNewChatSession = useCallback(() => {
        if (!activeProjectId) return;
        
        const newSession: ChatSession = {
            id: generateId(),
            title: `Chat ${(activeProject?.chatSessions.length || 0) + 1}`,
            messages: [{
                id: '1',
                role: 'assistant',
                content: "🆕 **New conversation started!**\n\nI still have context about the repository. Ask me anything!",
                timestamp: new Date()
            }],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        setProjects(prev => prev.map(p => {
            if (p.id !== activeProjectId) return p;
            return {
                ...p,
                chatSessions: [...p.chatSessions, newSession],
                activeChatSessionId: newSession.id,
                updatedAt: new Date()
            };
        }));
    }, [activeProjectId, activeProject?.chatSessions.length]);
    
    // Switch chat session
    const switchChatSession = useCallback((sessionId: string) => {
        if (!activeProjectId) return;
        
        setProjects(prev => prev.map(p => {
            if (p.id !== activeProjectId) return p;
            return {
                ...p,
                activeChatSessionId: sessionId,
                updatedAt: new Date()
            };
        }));
    }, [activeProjectId]);
    
    // Delete chat session
    const deleteChatSession = useCallback((sessionId: string) => {
        if (!activeProjectId) return;
        
        setProjects(prev => prev.map(p => {
            if (p.id !== activeProjectId) return p;
            const filteredSessions = p.chatSessions.filter(s => s.id !== sessionId);
            
            // If we deleted the active session, switch to the first available
            let newActiveSessionId = p.activeChatSessionId;
            if (sessionId === p.activeChatSessionId && filteredSessions.length > 0) {
                newActiveSessionId = filteredSessions[0].id;
            }
            
            // If no sessions left, create a new one
            if (filteredSessions.length === 0) {
                const newSession: ChatSession = {
                    id: generateId(),
                    title: 'Chat 1',
                    messages: [{
                        id: '1',
                        role: 'assistant',
                        content: "👋 Chat cleared! Ready for new questions.",
                        timestamp: new Date()
                    }],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                return {
                    ...p,
                    chatSessions: [newSession],
                    activeChatSessionId: newSession.id,
                    updatedAt: new Date()
                };
            }
            
            return {
                ...p,
                chatSessions: filteredSessions,
                activeChatSessionId: newActiveSessionId,
                updatedAt: new Date()
            };
        }));
    }, [activeProjectId]);

    // Re-layout handler
    const handleLayoutChange = async (direction: 'TB' | 'LR') => {
        if (nodes.length === 0) return;
        setLayoutDirection(direction);
        
        try {
            const res = await fetch('/api/repo', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, edges, layout: direction })
            });

            if (res.ok) {
                const data = await res.json();
                setNodes(data.nodes);
                setEdges(data.edges);
                setTimeout(() => fitView({ padding: 0.2 }), 100);
            }
        } catch (error) {
            console.error('Layout change failed:', error);
        }
    };

    // React Flow Handlers
    const onConnect = useCallback((params: Connection) => {
        saveToHistory();
        setEdges((eds) => addEdge({
            ...params,
            type: 'custom',
            // No animation for performance
            animated: false,
            data: { type: 'dependency', strength: 'normal' }
        }, eds));
    }, [setEdges, saveToHistory]);
    
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    // Add node handler
    const handleAddNode = useCallback((nodeData: any) => {
        saveToHistory();
        const id = `node-${Date.now()}`;
        const newNode: Node = {
            id,
            type: 'enhanced',
            position: { 
                x: Math.random() * 400 + 100, 
                y: Math.random() * 400 + 100 
            },
            data: {
                ...nodeData,
                category: nodeData.category || 'default',
                complexity: 'low',
            },
        };
        setNodes((nds) => [...nds, newNode]);
    }, [setNodes, saveToHistory]);

    // Delete node handler
    const handleDeleteNode = useCallback((nodeId: string) => {
        saveToHistory();
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNode(null);
    }, [setNodes, setEdges, saveToHistory]);

    // Update node handler
    const handleUpdateNode = useCallback((nodeId: string, data: any) => {
        saveToHistory();
        setNodes((nds) => nds.map((n) => 
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        ));
    }, [setNodes, saveToHistory]);

    // Search handler - optimized with useCallback
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (!query) {
            // Reset all nodes to normal
            setNodes((nds) => nds.map((n) => ({ ...n, style: undefined })));
            return;
        }
        
        // Highlight matching nodes
        const lowerQuery = query.toLowerCase();
        setNodes((nds) => nds.map((n) => {
            const matches = 
                n.data.label.toLowerCase().includes(lowerQuery) ||
                n.data.description?.toLowerCase().includes(lowerQuery) ||
                n.data.files?.some((f: string) => f.toLowerCase().includes(lowerQuery));
            
            return {
                ...n,
                style: matches ? { opacity: 1 } : { opacity: 0.3 },
            };
        }));
    }, [setNodes]);

    // Select all nodes
    const handleSelectAll = useCallback(() => {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    }, [setNodes]);

    // Duplicate selected nodes
    const handleDuplicateSelected = useCallback(() => {
        if (!selectedNode) return;
        saveToHistory();
        
        const newNode: Node = {
            ...selectedNode,
            id: `node-${Date.now()}`,
            position: { 
                x: selectedNode.position.x + 50, 
                y: selectedNode.position.y + 50 
            },
            selected: false,
        };
        setNodes((nds) => [...nds, newNode]);
    }, [selectedNode, setNodes, saveToHistory]);

    // Toggle snap to grid
    const handleToggleSnapToGrid = useCallback(() => {
        setSnapToGrid((prev) => !prev);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            
            if (e.key === 'Delete' && selectedNode) {
                handleDeleteNode(selectedNode.id);
            }
            if (e.key === 'Escape') {
                setSelectedNode(null);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                handleSelectAll();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
                e.preventDefault();
                handleDuplicateSelected();
            }
            if (e.key === 'g' || e.key === 'G') {
                handleToggleSnapToGrid();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                // Focus search would be handled by FlowControls
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNode, handleDeleteNode, handleUndo, handleSelectAll, handleDuplicateSelected, handleToggleSnapToGrid]);

    return (
        <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            {/* Project List Sidebar */}
            <AnimatePresence>
                {showProjectList && (
                    <motion.div
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        className="w-72 h-full bg-slate-900 border-r border-slate-800 z-50 flex flex-col"
                    >
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <h2 className="font-semibold text-slate-100 flex items-center gap-2">
                                <FolderOpen size={18} className="text-cyan-400" />
                                Projects
                            </h2>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setShowCreateProjectModal(true)}
                                    className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                    title="Add new project"
                                >
                                    <Plus size={16} />
                                </button>
                                <button
                                    onClick={() => setShowProjectList(false)}
                                    className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {projects.length === 0 ? (
                                <div className="text-center text-slate-500 text-sm py-8">
                                    No projects yet.<br />
                                    Create from GitHub or start empty.
                                </div>
                            ) : (
                                projects.map(project => (
                                    <div
                                        key={project.id}
                                        className={cn(
                                            "p-3 rounded-lg cursor-pointer transition-all group",
                                            project.id === activeProjectId
                                                ? "bg-blue-500/20 border border-blue-500/30"
                                                : "hover:bg-slate-800 border border-transparent"
                                        )}
                                        onClick={() => switchToProject(project.id)}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-slate-200 truncate">
                                                    {project.name}
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-1">
                                                    {project.nodes.length} nodes • {project.chatSessions.length} chats
                                                </div>
                                                <div className="text-[10px] text-slate-600 mt-0.5">
                                                    {new Date(project.updatedAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Delete this project?')) {
                                                        deleteProject(project.id);
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
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Project Modal */}
            <AnimatePresence>
                {showCreateProjectModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 8 }}
                            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-slate-800">
                                <h3 className="text-sm font-semibold text-slate-100">Create Project</h3>
                                <button
                                    onClick={() => setShowCreateProjectModal(false)}
                                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-800/60 border border-slate-700">
                                    <button
                                        onClick={() => setCreateProjectMode('github')}
                                        className={cn(
                                            'px-3 py-2 text-xs rounded-lg transition-colors',
                                            createProjectMode === 'github'
                                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                                : 'text-slate-300 hover:bg-slate-700'
                                        )}
                                    >
                                        From GitHub URL
                                    </button>
                                    <button
                                        onClick={() => setCreateProjectMode('empty')}
                                        className={cn(
                                            'px-3 py-2 text-xs rounded-lg transition-colors',
                                            createProjectMode === 'empty'
                                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                                : 'text-slate-300 hover:bg-slate-700'
                                        )}
                                    >
                                        Empty Project
                                    </button>
                                </div>

                                {createProjectMode === 'github' ? (
                                    <div className="space-y-3">
                                        <label className="text-xs text-slate-400 block">GitHub repository URL</label>
                                        <input
                                            value={newProjectUrl}
                                            onChange={(e) => setNewProjectUrl(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newProjectUrl.trim() && !loading) {
                                                    setShowCreateProjectModal(false);
                                                    setShowProjectList(false);
                                                    setRepoUrl(newProjectUrl.trim());
                                                    createProjectFromGitHub(newProjectUrl.trim());
                                                }
                                            }}
                                            placeholder="https://github.com/owner/repo"
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <label className="text-xs text-slate-400 block">Project name (optional)</label>
                                        <input
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleCreateEmptyProject();
                                                }
                                            }}
                                            placeholder="My Custom Flowchart"
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
                                        />
                                        <p className="text-xs text-slate-500">
                                            Start from a blank canvas, then add custom nodes and connections.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
                                <button
                                    onClick={() => setShowCreateProjectModal(false)}
                                    className="px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                                {createProjectMode === 'github' ? (
                                    <button
                                        onClick={() => {
                                            if (!newProjectUrl.trim() || loading) return;
                                            setShowCreateProjectModal(false);
                                            setShowProjectList(false);
                                            setRepoUrl(newProjectUrl.trim());
                                            createProjectFromGitHub(newProjectUrl.trim());
                                        }}
                                        disabled={!newProjectUrl.trim() || loading}
                                        className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Analyzing...' : 'Create from GitHub'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCreateEmptyProject}
                                        className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white"
                                    >
                                        Create Empty Project
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Main Canvas Area */}
            <div className="flex-1 relative h-full">
                
                {/* Project List Toggle */}
                <button
                    onClick={() => setShowProjectList(!showProjectList)}
                    className={cn(
                        "absolute top-4 left-4 z-20 p-2.5 rounded-xl transition-all",
                        "bg-slate-900/90 backdrop-blur border border-slate-700 hover:bg-slate-800",
                        showProjectList && "bg-blue-500/20 border-blue-500/30"
                    )}
                    title="Projects"
                >
                    <FolderOpen size={18} className={showProjectList ? "text-blue-400" : "text-slate-400"} />
                    {projects.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center">
                            {projects.length}
                        </span>
                    )}
                </button>
                
                {/* Floating Header / Input */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[550px]">
                    <div className="flex gap-2">
                        <div className="relative flex-1 group">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                               <Github size={20} />
                            </div>
                            <input 
                               value={repoUrl}
                               onChange={(e) => setRepoUrl(e.target.value)}
                               className="w-full bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 shadow-xl transition-all"
                               placeholder="https://github.com/owner/repo"
                               onKeyDown={(e) => e.key === 'Enter' && handleVisualize()}
                            />
                        </div>
                        <button 
                            onClick={handleVisualize}
                            disabled={loading || !repoUrl}
                            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl px-5 py-2 font-medium shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Search size={18} />
                            )}
                            <span className="hidden sm:inline">{loading ? 'Analyzing...' : 'Visualize'}</span>
                        </button>
                        <ExportPanel repoDetails={repoDetails} />
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
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="mt-2 p-3 bg-red-900/50 border border-red-700 rounded-xl flex items-center gap-2 text-red-200 text-sm"
                            >
                                <AlertCircle size={16} />
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Repo info badge */}
                    <AnimatePresence>
                        {repoDetails && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 flex items-center justify-center gap-3 text-xs"
                            >
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full">
                                    <GitBranch size={12} className="text-blue-400" />
                                    <span className="text-slate-300">{repoDetails.owner}/{repoDetails.repo}</span>
                                </div>
                                {repoDetails.fileCount && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full">
                                        <FileCode size={12} className="text-green-400" />
                                        <span className="text-slate-300">{repoDetails.fileCount} files</span>
                                    </div>
                                )}
                                <a
                                    href={repoUrl}
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

                {/* Left-side Toolbars */}
                <div className="absolute top-20 left-4 z-10 flex flex-col gap-2">
                    <EditToolbar
                        selectedNode={selectedNode}
                        onAddNode={handleAddNode}
                        onDeleteNode={handleDeleteNode}
                        onUpdateNode={handleUpdateNode}
                        onUndo={history.length > 0 ? handleUndo : undefined}
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
                        onSyncCanvas={handleSyncCanvas}
                        isSyncing={isSyncingCanvas}
                        lastSyncedAt={activeProject?.lastSyncedAt || null}
                    />
                </div>

                {/* Empty State */}
                <AnimatePresence>
                    {nodes.length === 0 && !loading && (
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

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    nodeTypes={memoizedNodeTypes}
                    edgeTypes={memoizedEdgeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    className="bg-slate-950"
                    defaultEdgeOptions={{
                        type: 'custom',
                        animated: false,
                    }}
                    connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
                    connectionLineType={ConnectionLineType.SmoothStep}
                    snapToGrid={snapToGrid}
                    snapGrid={[15, 15]}
                    minZoom={0.1}
                    maxZoom={2}
                    nodesDraggable
                    nodesConnectable
                    elementsSelectable
                    // Performance optimizations
                    nodeExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
                    translateExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
                    preventScrolling
                    zoomOnScroll
                    zoomOnPinch
                    panOnScroll={false}
                    panOnDrag
                    selectionOnDrag={false}
                    selectNodesOnDrag={false}
                    nodeDragThreshold={2}
                    autoPanOnConnect
                    autoPanOnNodeDrag
                >
                    <Background 
                        variant={BackgroundVariant.Dots} 
                        gap={20} 
                        size={1} 
                        color="#1e293b" 
                    />
                    {showMinimap && <StyledMiniMap />}
                </ReactFlow>
            </div>

            {/* Sidebar (Right Pane) - Resizable */}
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
            <div 
                className="h-full shadow-2xl z-20 transition-all duration-75"
                style={{ width: `${chatWidth}px`, minWidth: '300px', maxWidth: '800px' }}
            >
                <EnhancedChatbot 
                    selectedNode={selectedNode} 
                    repoDetails={repoDetails}
                    allNodes={nodes}
                    allEdges={edges}
                    projectName={activeProject?.name}
                    syncedCanvasContext={activeProject?.aiContextSnapshot || null}
                    chatSessions={activeProject?.chatSessions || []}
                    activeChatSessionId={activeProject?.activeChatSessionId || null}
                    onUpdateMessages={updateChatMessages}
                    onCreateNewChat={createNewChatSession}
                    onSwitchChat={switchChatSession}
                    onDeleteChat={deleteChatSession}
                />
            </div>
        </div>
    );
}

// Wrap with ReactFlowProvider
export default function Home() {
    return (
        <ReactFlowProvider>
            <FlowCanvas />
        </ReactFlowProvider>
    );
}
