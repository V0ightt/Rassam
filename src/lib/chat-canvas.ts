import type {
  CanvasSyncSnapshot,
  EdgeData,
  NodeCategory,
  NodeData,
  SyncedCanvasEdge,
  SyncedCanvasNode,
} from '@/types';

// ── Validation constants ──

export const VALID_NODE_CATEGORIES: NodeCategory[] = [
  'api', 'component', 'config', 'database', 'auth',
  'utility', 'test', 'style', 'asset', 'documentation',
  'core', 'service', 'hook', 'context', 'middleware',
  'model', 'route',
  'cache', 'queue', 'load-balancer', 'gateway', 'storage',
  'cdn', 'proxy', 'firewall', 'external-api', 'message-broker',
  'container', 'serverless', 'client',
  'default',
];

export const VALID_EDGE_TYPES: NonNullable<EdgeData['type']>[] = [
  'dependency',
  'import',
  'calls',
  'extends',
  'implements',
  'sends',
  'receives',
  'reads',
  'writes',
];

export const VALID_EDGE_STRENGTHS: NonNullable<EdgeData['strength']>[] = ['weak', 'normal', 'strong'];
export const VALID_EDGE_DIRECTIONS: NonNullable<EdgeData['direction']>[] = ['one-way', 'two-way'];

// ── Normalize helpers ──

export function normalizeCategory(rawCategory: unknown): NodeCategory {
  if (typeof rawCategory === 'string' && VALID_NODE_CATEGORIES.includes(rawCategory as NodeCategory)) {
    return rawCategory as NodeCategory;
  }
  return 'default';
}

export function normalizeEdgeType(rawType: unknown): EdgeData['type'] {
  if (typeof rawType === 'string' && VALID_EDGE_TYPES.includes(rawType as NonNullable<EdgeData['type']>)) {
    return rawType as EdgeData['type'];
  }
  return 'dependency';
}

export function normalizeEdgeStrength(rawStrength: unknown): EdgeData['strength'] {
  if (typeof rawStrength === 'string' && VALID_EDGE_STRENGTHS.includes(rawStrength as NonNullable<EdgeData['strength']>)) {
    return rawStrength as EdgeData['strength'];
  }
  return 'normal';
}

export function normalizeEdgeDirection(rawDirection: unknown): EdgeData['direction'] {
  if (typeof rawDirection === 'string' && VALID_EDGE_DIRECTIONS.includes(rawDirection as NonNullable<EdgeData['direction']>)) {
    return rawDirection as EdgeData['direction'];
  }
  return 'one-way';
}

// ── Types ──

export type WorkingCanvasState = {
  project: CanvasSyncSnapshot['project'];
  layoutDirection: 'TB' | 'LR';
  selectedNodeId?: string | null;
  selectedNodeLabel?: string | null;
  nodes: SyncedCanvasNode[];
  edges: SyncedCanvasEdge[];
};

export type ToolTranscriptEntry = {
  tool: 'read' | 'session' | 'write' | 'write_batch';
  input: Record<string, unknown> | undefined;
  result: unknown;
};

// ── Canvas state constructors / queries ──

export function createWorkingCanvasState(
  canvasContext: CanvasSyncSnapshot | null | undefined,
  allNodesContext: SyncedCanvasNode[] | null | undefined,
  repoDetails?: { owner: string; repo: string } | null,
): WorkingCanvasState {
  return {
    project: canvasContext?.project || {
      id: 'live-canvas',
      name: repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : 'Untitled Project',
      source: repoDetails ? 'github' : 'empty',
      repo: repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : undefined,
    },
    layoutDirection: canvasContext?.layoutDirection || 'TB',
    selectedNodeId: canvasContext?.selectedNodeId || null,
    selectedNodeLabel: canvasContext?.selectedNodeLabel || null,
    nodes: (canvasContext?.nodes || allNodesContext || []).map((node) => ({ ...node })),
    edges: (canvasContext?.edges || []).map((edge) => ({ ...edge })),
  };
}

export function summarizeCanvasState(state: WorkingCanvasState): string {
  const nodeLines = state.nodes.slice(0, 50).map((node) => (
    `- node id="${node.id}" label="${node.label}" category=${node.category || 'default'} pos=(${Math.round(node.position.x)},${Math.round(node.position.y)})${node.files?.length ? ` files=${node.files.length}` : ''}${node.description ? ` desc="${node.description.slice(0, 60)}"` : ''}`
  ));
  const edgeLines = state.edges.slice(0, 50).map((edge) => {
    const srcNode = state.nodes.find((n) => n.id === edge.source);
    const tgtNode = state.nodes.find((n) => n.id === edge.target);
    return `- edge id="${edge.id}": "${srcNode?.label || edge.source}" -> "${tgtNode?.label || edge.target}"${edge.label ? ` label="${edge.label}"` : ''}${edge.type ? ` type=${edge.type}` : ''}`;
  });

  return [
    `Project: ${state.project.name}`,
    `Layout: ${state.layoutDirection}`,
    `Selected Node: ${state.selectedNodeLabel || 'None'}`,
    `Node Count: ${state.nodes.length}`,
    `Edge Count: ${state.edges.length}`,
    'Nodes:',
    ...(nodeLines.length > 0 ? nodeLines : ['- none']),
    'Edges:',
    ...(edgeLines.length > 0 ? edgeLines : ['- none']),
  ].join('\n');
}

export function summarizeToolTranscript(transcript: ToolTranscriptEntry[]): string {
  if (transcript.length === 0) return 'No tool calls yet.';

  return transcript.map((entry, index) => {
    let resultText: string;
    if (typeof entry.result === 'string') {
      resultText = entry.result;
    } else {
      // For read results with file content, keep more content
      // so the planner has enough context to build architecture diagrams
      const result = entry.result as Record<string, unknown> | null;
      if (entry.tool === 'read' && result?.content && typeof result.content === 'string') {
        const content = result.content as string;
        // Keep up to 10000 chars of file content for architecture analysis
        const truncatedContent = content.length > 10000
          ? `${content.slice(0, 10000)}\n... (truncated ${content.length - 10000} chars)`
          : content;
        resultText = JSON.stringify({ ...result, content: truncatedContent }, null, 2);
      } else {
        resultText = JSON.stringify(entry.result, null, 2);
      }
    }
    return [
      `Step ${index + 1}`,
      `Tool: ${entry.tool}`,
      `Input: ${JSON.stringify(entry.input, null, 2)}`,
      `Result: ${resultText}`,
    ].join('\n');
  }).join('\n\n');
}

// ── Node / edge lookup ──

export function findNodeByReference(
  state: WorkingCanvasState,
  target: Record<string, unknown> | undefined,
): SyncedCanvasNode | null {
  if (!target) return null;

  const id = typeof target.id === 'string' ? target.id.trim() : '';
  if (id) {
    return state.nodes.find((node) => node.id === id) || null;
  }

  const label = typeof target.label === 'string' ? target.label.trim().toLowerCase() : '';
  if (label) {
    return state.nodes.find((node) => node.label.trim().toLowerCase() === label)
      || state.nodes.find((node) => node.label.toLowerCase().includes(label))
      || null;
  }

  return null;
}

export function findEdgeByReference(
  state: WorkingCanvasState,
  target: Record<string, unknown> | undefined,
): SyncedCanvasEdge | null {
  if (!target) return null;

  const id = typeof target.id === 'string' ? target.id.trim() : '';
  if (id) {
    return state.edges.find((edge) => edge.id === id) || null;
  }

  const sourceId = typeof target.sourceId === 'string' ? target.sourceId.trim() : '';
  const targetId = typeof target.targetId === 'string' ? target.targetId.trim() : '';
  const label = typeof target.label === 'string' ? target.label.trim().toLowerCase() : '';

  // At least one criterion is required to avoid matching the first edge arbitrarily
  if (!sourceId && !targetId && !label) return null;

  return state.edges.find((edge) => {
    const sourceMatches = sourceId ? edge.source === sourceId : true;
    const targetMatches = targetId ? edge.target === targetId : true;
    const labelMatches = label ? (edge.label || '').toLowerCase().includes(label) : true;
    return sourceMatches && targetMatches && labelMatches;
  }) || null;
}

export function resolveEdgeEndpoint(
  state: WorkingCanvasState,
  value: unknown,
  labelValue: unknown,
  transcript?: ToolTranscriptEntry[],
): SyncedCanvasNode | null {
  // 1) Direct ID match
  if (typeof value === 'string' && value.trim()) {
    const found = state.nodes.find((node) => node.id === value.trim());
    if (found) return found;
  }

  // 2) Label match (exact → includes → transcript fallback)
  if (typeof labelValue === 'string' && labelValue.trim()) {
    const normalized = labelValue.trim().toLowerCase();
    // Exact match
    const exact = state.nodes.find((node) => node.label.trim().toLowerCase() === normalized);
    if (exact) return exact;
    // Partial match
    const partial = state.nodes.find((node) => node.label.toLowerCase().includes(normalized));
    if (partial) return partial;
    // Reverse partial: label is a substring of the search term
    const reversePartial = state.nodes.find((node) => normalized.includes(node.label.toLowerCase()));
    if (reversePartial) return reversePartial;
  }

  // 3) Search transcript for recently added nodes matching the label
  if (transcript && typeof labelValue === 'string' && labelValue.trim()) {
    const normalized = labelValue.trim().toLowerCase();
    for (const entry of transcript) {
      if (entry.tool !== 'write') continue;
      const result = entry.result as Record<string, unknown> | null;
      if (!result || result.ok !== true) continue;
      const resultLabel = typeof result.label === 'string' ? result.label.toLowerCase() : '';
      const resultId = typeof result.nodeId === 'string' ? result.nodeId : '';
      if (resultId && (resultLabel === normalized || resultLabel.includes(normalized) || normalized.includes(resultLabel))) {
        const node = state.nodes.find((n) => n.id === resultId);
        if (node) return node;
      }
    }
  }

  // 4) If value looks like a label instead of an ID, try label matching
  if (typeof value === 'string' && value.trim() && !value.startsWith('agent-')) {
    const normalized = value.trim().toLowerCase();
    return state.nodes.find((node) => node.label.trim().toLowerCase() === normalized)
      || state.nodes.find((node) => node.label.toLowerCase().includes(normalized))
      || null;
  }

  return null;
}

export function buildDefaultNodePosition(state: WorkingCanvasState): { x: number; y: number } {
  // Find a position that doesn't overlap with existing nodes
  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 120;
  const PADDING = 40;

  const occupiedRects = state.nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: NODE_WIDTH,
    h: NODE_HEIGHT,
  }));

  const overlaps = (x: number, y: number): boolean => {
    return occupiedRects.some((rect) => (
      x < rect.x + rect.w + PADDING &&
      x + NODE_WIDTH + PADDING > rect.x &&
      y < rect.y + rect.h + PADDING &&
      y + NODE_HEIGHT + PADDING > rect.y
    ));
  };

  // Try grid positions with generous spacing
  const columns = state.layoutDirection === 'LR' ? 4 : 5;
  const spacingX = NODE_WIDTH + 60;
  const spacingY = NODE_HEIGHT + 80;

  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < columns; col++) {
      const x = 80 + col * spacingX;
      const y = 80 + row * spacingY;
      if (!overlaps(x, y)) {
        return { x, y };
      }
    }
  }

  // Fallback: place below all existing nodes
  const maxY = occupiedRects.reduce((max, r) => Math.max(max, r.y + r.h), 0);
  return { x: 80, y: maxY + PADDING + 40 };
}

export function normalizeNodeData(raw: Record<string, unknown>, fallbackLabel = 'New Node'): NodeData {
  return {
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : fallbackLabel,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    files: Array.isArray(raw.files) ? raw.files.filter((value): value is string => typeof value === 'string') : [],
    category: normalizeCategory(raw.category),
    complexity: raw.complexity === 'low' || raw.complexity === 'medium' || raw.complexity === 'high'
      ? raw.complexity
      : 'low',
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies.filter((value): value is string => typeof value === 'string')
      : undefined,
    exports: Array.isArray(raw.exports)
      ? raw.exports.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
}

// ── Misc helpers used across modules ──

export function stripLargeContent(content: string, limit = 4000): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n... (truncated)`;
}

export function omitKeys(
  input: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> {
  if (!input) return {};

  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !keys.includes(key)),
  );
}
