// Node Types
export type NodeCategory = 
  | 'api'
  | 'component' 
  | 'config'
  | 'database'
  | 'auth'
  | 'utility'
  | 'test'
  | 'style'
  | 'asset'
  | 'documentation'
  | 'core'
  | 'service'
  | 'hook'
  | 'context'
  | 'middleware'
  | 'model'
  | 'route'
  | 'default';

export interface NodeData {
  label: string;
  description: string;
  files: string[];
  category: NodeCategory;
  complexity?: 'low' | 'medium' | 'high';
  linesOfCode?: number;
  dependencies?: string[];
  exports?: string[];
  isExpanded?: boolean;
}

export interface EdgeData {
  label?: string;
  type?: 'dependency' | 'import' | 'calls' | 'extends' | 'implements';
  strength?: 'weak' | 'normal' | 'strong';
  direction?: 'one-way' | 'two-way';
  labelOffset?: { x: number; y: number };
}

export type ProjectSource = 'github' | 'empty';

export interface SyncedCanvasNode {
  id: string;
  label: string;
  description?: string;
  category?: NodeCategory;
  files?: string[];
  complexity?: 'low' | 'medium' | 'high';
  dependencies?: string[];
  exports?: string[];
  position: { x: number; y: number };
}

export interface SyncedCanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  strength?: 'weak' | 'normal' | 'strong';
  direction?: 'one-way' | 'two-way';
}

export interface CanvasSyncSnapshot {
  syncedAt: string;
  project: {
    id: string;
    name: string;
    source: ProjectSource;
    repo?: string;
  };
  layoutDirection: 'TB' | 'LR';
  selectedNodeId?: string | null;
  selectedNodeLabel?: string | null;
  nodes: SyncedCanvasNode[];
  edges: SyncedCanvasEdge[];
}

export interface RepoDetails {
  owner: string;
  repo: string;
  defaultBranch?: string;
  description?: string;
  stars?: number;
  language?: string;
  fileCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    nodeLabel?: string;
    files?: string[];
  };
}

// Chat session for history
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// Project with all its data
export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  source: ProjectSource;
  repoDetails: RepoDetails | null;
  nodes: any[];
  edges: any[];
  layoutDirection: 'TB' | 'LR';
  aiContextSnapshot: CanvasSyncSnapshot | null;
  lastSyncedAt: string | null;
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowchartState {
  nodes: any[];
  edges: any[];
  repoDetails: RepoDetails | null;
}
