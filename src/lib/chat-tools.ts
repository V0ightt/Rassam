import dagre from 'dagre';
import type { FileResolutionStrategy } from '@/lib/chat-file-resolution';
import type {
  ChatCanvasWriteOperation,
  EdgeData,
  SyncedCanvasEdge,
  SyncedCanvasNode,
} from '@/types';
import type { ToolTranscriptEntry, WorkingCanvasState } from '@/lib/chat-canvas';
import {
  buildDefaultNodePosition,
  findEdgeByReference,
  findNodeByReference,
  normalizeCategory,
  normalizeEdgeDirection,
  normalizeEdgeStrength,
  normalizeEdgeType,
  normalizeNodeData,
  omitKeys,
  resolveEdgeEndpoint,
} from '@/lib/chat-canvas';
import { summarizeFileContent } from '@/lib/chat-file-summary';

// ── Types ──

export interface ReadToolResult {
  content: string | null;
  source: 'cache' | 'github' | 'missing';
  path: string;
  resolvedPath?: string | null;
  resolutionStrategy?: FileResolutionStrategy;
  candidates?: string[];
}

export interface ReadToolContext {
  readFile: (path: string) => Promise<ReadToolResult>;
}

// ── Read tool ──

export async function executeReadTool(
  input: Record<string, unknown> | undefined,
  context: ReadToolContext,
): Promise<unknown> {
  const path = typeof input?.path === 'string' ? input.path.trim() : '';
  if (!path) {
    return { ok: false, error: 'Missing path for read tool.' };
  }

  const result = await context.readFile(path);
  if (result.content === null) {
    const isAmbiguous = result.resolutionStrategy === 'ambiguous' && Array.isArray(result.candidates) && result.candidates.length > 0;
    return {
      ok: false,
      path: result.path,
      resolvedPath: result.resolvedPath || null,
      resolutionStrategy: result.resolutionStrategy || 'missing',
      candidates: result.candidates,
      source: result.source,
      error: isAmbiguous
        ? `Ambiguous file reference. Choose one of: ${result.candidates?.join(', ')}`
        : 'File content not available.',
    };
  }

  return {
    ok: true,
    path: result.path,
    resolvedPath: result.resolvedPath || result.path,
    resolutionStrategy: result.resolutionStrategy || 'exact',
    candidates: result.candidates,
    source: result.source,
    content: summarizeFileContent(result.resolvedPath || result.path, result.content, { maxChars: 12000 }),
  };
}

// ── Session tool ──

export function executeSessionTool(
  state: WorkingCanvasState,
  input: Record<string, unknown> | undefined,
): unknown {
  const action = typeof input?.action === 'string' ? input.action : 'get';

  if (action === 'search') {
    const query = typeof input?.query === 'string' ? input.query.trim().toLowerCase() : '';
    const entity = input?.entity === 'edges' || input?.entity === 'all' ? input.entity : 'nodes';
    const limit = typeof input?.limit === 'number' && input.limit > 0 ? Math.min(30, Math.floor(input.limit)) : 10;

    const nodes = entity !== 'edges'
      ? state.nodes
          .filter((node) => {
            if (!query) return true;
            return [node.id, node.label, node.description || '', node.category || '', ...(node.files || [])]
              .some((value) => value.toLowerCase().includes(query));
          })
          .slice(0, limit)
          .map((node) => ({
            id: node.id,
            label: node.label,
            category: node.category,
            description: node.description,
            position: node.position,
            files: node.files?.slice(0, 8) || [],
          }))
      : [];

    const edges = entity !== 'nodes'
      ? state.edges
          .filter((edge) => {
            if (!query) return true;
            // Also match by resolved node labels
            const srcNode = state.nodes.find((n) => n.id === edge.source);
            const tgtNode = state.nodes.find((n) => n.id === edge.target);
            return [edge.id, edge.source, edge.target, edge.label || '', edge.type || '', srcNode?.label || '', tgtNode?.label || '']
              .some((value) => value.toLowerCase().includes(query));
          })
          .slice(0, limit)
          .map((edge) => {
            const srcNode = state.nodes.find((n) => n.id === edge.source);
            const tgtNode = state.nodes.find((n) => n.id === edge.target);
            return {
              id: edge.id,
              source: edge.source,
              sourceLabel: srcNode?.label || edge.source,
              target: edge.target,
              targetLabel: tgtNode?.label || edge.target,
              label: edge.label,
              type: edge.type,
            };
          })
      : [];

    return { ok: true, action: 'search', query, entity, nodes, edges, totalNodes: state.nodes.length, totalEdges: state.edges.length };
  }

  const scope = typeof input?.scope === 'string' ? input.scope : 'summary';

  if (scope === 'selected') {
    const node = state.selectedNodeId
      ? state.nodes.find((item) => item.id === state.selectedNodeId) || null
      : null;

    return {
      ok: true,
      action: 'get',
      scope: 'selected',
      selectedNodeId: state.selectedNodeId || null,
      selectedNodeLabel: state.selectedNodeLabel || null,
      node,
    };
  }

  if (scope === 'node') {
    const node = findNodeByReference(state, input);
    return node
      ? { ok: true, action: 'get', scope: 'node', node }
      : { ok: false, action: 'get', scope: 'node', error: 'Node not found.' };
  }

  if (scope === 'edge') {
    const edge = findEdgeByReference(state, input);
    return edge
      ? { ok: true, action: 'get', scope: 'edge', edge }
      : { ok: false, action: 'get', scope: 'edge', error: 'Edge not found.' };
  }

  return {
    ok: true,
    action: 'get',
    scope: 'summary',
    project: state.project,
    layoutDirection: state.layoutDirection,
    selectedNodeId: state.selectedNodeId || null,
    selectedNodeLabel: state.selectedNodeLabel || null,
    nodeCount: state.nodes.length,
    edgeCount: state.edges.length,
  };
}

// ── Write tool ──

export function executeWriteTool(
  state: WorkingCanvasState,
  input: Record<string, unknown> | undefined,
  transcript?: ToolTranscriptEntry[],
): { result: unknown; operation?: ChatCanvasWriteOperation } {
  const action = typeof input?.action === 'string' ? input.action : '';

  if (action === 'add_node') {
    const nodeInput = (input?.node && typeof input.node === 'object'
      ? input.node
      : omitKeys(input, ['action'])
    ) as Record<string, unknown> | undefined;
    const nodeId = `agent-node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const position = nodeInput?.position && typeof nodeInput.position === 'object'
      ? {
          x: Number((nodeInput.position as Record<string, unknown>).x) || buildDefaultNodePosition(state).x,
          y: Number((nodeInput.position as Record<string, unknown>).y) || buildDefaultNodePosition(state).y,
        }
      : buildDefaultNodePosition(state);
    const data = normalizeNodeData(nodeInput || {}, 'New Node');

    const node: SyncedCanvasNode = {
      id: nodeId,
      label: data.label,
      description: data.description,
      category: data.category,
      files: data.files,
      complexity: data.complexity,
      dependencies: data.dependencies,
      exports: data.exports,
      position,
    };

    state.nodes.push(node);

    const operation: ChatCanvasWriteOperation = {
      action: 'add_node',
      node: {
        id: nodeId,
        type: 'enhanced',
        position,
        data,
      },
      summary: `Added node ${data.label}`,
    };

    return {
      result: { ok: true, action, nodeId, label: data.label },
      operation,
    };
  }

  if (action === 'edit_node') {
    const nodeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const target = findNodeByReference(state, nodeRef);
    if (!target) {
      return { result: { ok: false, action, error: 'Node not found.' } };
    }

    // Prefer input.changes, but fall back to input itself (excluding meta keys) when LLM puts changes at top level
    const rawChanges = (input?.changes && typeof input.changes === 'object')
      ? input.changes as Record<string, unknown>
      : omitKeys(input, ['action', 'target', 'id', 'label']);
    const changes = rawChanges;
    const nextNode: SyncedCanvasNode = {
      ...target,
      label: typeof changes.label === 'string' && changes.label.trim() ? changes.label.trim() : target.label,
      description: typeof changes.description === 'string' ? changes.description.trim() : target.description,
      category: changes.category !== undefined ? normalizeCategory(changes.category) : target.category,
      files: Array.isArray(changes.files)
        ? changes.files.filter((value): value is string => typeof value === 'string')
        : target.files,
      complexity: changes.complexity === 'low' || changes.complexity === 'medium' || changes.complexity === 'high'
        ? changes.complexity
        : target.complexity,
      dependencies: Array.isArray(changes.dependencies)
        ? changes.dependencies.filter((value): value is string => typeof value === 'string')
        : target.dependencies,
      exports: Array.isArray(changes.exports)
        ? changes.exports.filter((value): value is string => typeof value === 'string')
        : target.exports,
      position: changes.position && typeof changes.position === 'object'
        ? {
            x: Number((changes.position as Record<string, unknown>).x) || target.position.x,
            y: Number((changes.position as Record<string, unknown>).y) || target.position.y,
          }
        : target.position,
    };

    state.nodes = state.nodes.map((node) => node.id === target.id ? nextNode : node);
    if (state.selectedNodeId === target.id) {
      state.selectedNodeLabel = nextNode.label;
    }

    const operation: ChatCanvasWriteOperation = {
      action: 'edit_node',
      nodeId: target.id,
      changes: {
        label: nextNode.label,
        description: nextNode.description,
        category: nextNode.category,
        files: nextNode.files,
        complexity: nextNode.complexity,
        dependencies: nextNode.dependencies,
        exports: nextNode.exports,
        position: nextNode.position,
      },
      summary: `Updated node ${nextNode.label}`,
    };

    return {
      result: { ok: true, action, nodeId: target.id, label: nextNode.label },
      operation,
    };
  }

  if (action === 'delete_node') {
    const nodeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const target = findNodeByReference(state, nodeRef);
    if (!target) {
      return { result: { ok: false, action, error: 'Node not found.' } };
    }

    state.nodes = state.nodes.filter((node) => node.id !== target.id);
    state.edges = state.edges.filter((edge) => edge.source !== target.id && edge.target !== target.id);
    if (state.selectedNodeId === target.id) {
      state.selectedNodeId = null;
      state.selectedNodeLabel = null;
    }

    const operation: ChatCanvasWriteOperation = {
      action: 'delete_node',
      nodeId: target.id,
      summary: `Deleted node ${target.label}`,
    };

    return {
      result: { ok: true, action, nodeId: target.id, label: target.label },
      operation,
    };
  }

  if (action === 'add_edge') {
    const edgeInput = (input?.edge && typeof input.edge === 'object'
      ? input.edge
      : omitKeys(input, ['action'])
    ) as Record<string, unknown> | undefined;
    const source = resolveEdgeEndpoint(state, edgeInput?.sourceId, edgeInput?.sourceLabel, transcript);
    const target = resolveEdgeEndpoint(state, edgeInput?.targetId, edgeInput?.targetLabel, transcript);

    if (!source || !target) {
      const missingParts: string[] = [];
      if (!source) missingParts.push(`source "${edgeInput?.sourceLabel || edgeInput?.sourceId || '?'}"`);
      if (!target) missingParts.push(`target "${edgeInput?.targetLabel || edgeInput?.targetId || '?'}"`);
      return { result: { ok: false, action, error: `Node not found: ${missingParts.join(', ')}. Available nodes: ${state.nodes.map(n => n.label).join(', ')}` } };
    }

    const edgeId = `agent-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const edge: SyncedCanvasEdge = {
      id: edgeId,
      source: source.id,
      target: target.id,
      label: typeof edgeInput?.label === 'string' ? edgeInput.label.trim() : undefined,
      type: normalizeEdgeType(edgeInput?.type),
      strength: normalizeEdgeStrength(edgeInput?.strength),
      direction: normalizeEdgeDirection(edgeInput?.direction),
    };

    state.edges.push(edge);

    const operation: ChatCanvasWriteOperation = {
      action: 'add_edge',
      edge: {
        id: edgeId,
        source: source.id,
        target: target.id,
        type: 'custom',
        data: {
          label: edge.label,
          type: edge.type as EdgeData['type'],
          strength: edge.strength,
          direction: edge.direction,
        },
      },
      summary: `Added edge ${source.label} → ${target.label}`,
    };

    return {
      result: { ok: true, action, edgeId, sourceId: source.id, targetId: target.id },
      operation,
    };
  }

  if (action === 'edit_edge') {
    const edgeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const targetEdge = findEdgeByReference(state, edgeRef);
    if (!targetEdge) {
      return { result: { ok: false, action, error: 'Edge not found.' } };
    }

    // Prefer input.changes, but fall back to input itself (excluding meta keys) when LLM puts changes at top level
    const rawEdgeChanges = (input?.changes && typeof input.changes === 'object')
      ? input.changes as Record<string, unknown>
      : omitKeys(input, ['action', 'target', 'id']);
    const changes = rawEdgeChanges;
    const sourceNode = changes.sourceId || changes.sourceLabel
      ? resolveEdgeEndpoint(state, changes.sourceId, changes.sourceLabel)
      : state.nodes.find((node) => node.id === targetEdge.source) || null;
    const targetNode = changes.targetId || changes.targetLabel
      ? resolveEdgeEndpoint(state, changes.targetId, changes.targetLabel)
      : state.nodes.find((node) => node.id === targetEdge.target) || null;

    if (!sourceNode || !targetNode) {
      return { result: { ok: false, action, error: 'Updated source or target node not found.' } };
    }

    const nextEdge: SyncedCanvasEdge = {
      ...targetEdge,
      source: sourceNode.id,
      target: targetNode.id,
      label: typeof changes.label === 'string' ? changes.label.trim() : targetEdge.label,
      type: changes.type !== undefined ? normalizeEdgeType(changes.type) : targetEdge.type,
      strength: changes.strength !== undefined ? normalizeEdgeStrength(changes.strength) : targetEdge.strength,
      direction: changes.direction !== undefined ? normalizeEdgeDirection(changes.direction) : targetEdge.direction,
    };

    state.edges = state.edges.map((edge) => edge.id === targetEdge.id ? nextEdge : edge);

    const operation: ChatCanvasWriteOperation = {
      action: 'edit_edge',
      edgeId: targetEdge.id,
      changes: {
        source: nextEdge.source,
        target: nextEdge.target,
        data: {
          label: nextEdge.label,
          type: nextEdge.type as EdgeData['type'],
          strength: nextEdge.strength,
          direction: nextEdge.direction,
        },
      },
      summary: `Updated edge ${targetEdge.id}`,
    };

    return {
      result: { ok: true, action, edgeId: targetEdge.id },
      operation,
    };
  }

  if (action === 'delete_edge') {
    const edgeRef = (input?.target && typeof input.target === 'object') ? input.target as Record<string, unknown> : input;
    const targetEdge = findEdgeByReference(state, edgeRef);
    if (!targetEdge) {
      return { result: { ok: false, action, error: 'Edge not found.' } };
    }

    state.edges = state.edges.filter((edge) => edge.id !== targetEdge.id);

    const operation: ChatCanvasWriteOperation = {
      action: 'delete_edge',
      edgeId: targetEdge.id,
      summary: `Deleted edge ${targetEdge.id}`,
    };

    return {
      result: { ok: true, action, edgeId: targetEdge.id }, operation };
  }

  return {
    result: { ok: false, action, error: 'Unsupported write action.' },
  };
}

// ── Auto-layout ──

/**
 * Auto-layout all nodes in the working canvas state using dagre.
 * Returns edit_node operations for every repositioned node.
 */
export function autoLayoutWorkingState(state: WorkingCanvasState): ChatCanvasWriteOperation[] {
  if (state.nodes.length === 0) return [];

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 100;

  dagreGraph.setGraph({
    rankdir: state.layoutDirection || 'TB',
    nodesep: 80,
    ranksep: 100,
    edgesep: 30,
    marginx: 50,
    marginy: 50,
  });

  for (const node of state.nodes) {
    const filesCount = node.files?.length || 0;
    const extraHeight = filesCount > 5 ? 30 : 0;
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT + extraHeight });
  }

  for (const edge of state.edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const operations: ChatCanvasWriteOperation[] = [];

  for (const node of state.nodes) {
    const laidOut = dagreGraph.node(node.id);
    if (!laidOut) continue;

    const filesCount = node.files?.length || 0;
    const extraHeight = filesCount > 5 ? 30 : 0;
    const newPosition = {
      x: laidOut.x - NODE_WIDTH / 2,
      y: laidOut.y - (NODE_HEIGHT + extraHeight) / 2,
    };

    // Update working state position
    node.position = newPosition;

    // Create edit_node operation to send to client
    operations.push({
      action: 'edit_node',
      nodeId: node.id,
      changes: { position: newPosition },
      summary: `Repositioned ${node.label}`,
    });
  }

  return operations;
}

// ── Batch execution ──

/**
 * Execute a batch of write operations in order, then auto-layout the result.
 * Returns all individual results and the layout operations.
 */
export function executeWriteBatch(
  state: WorkingCanvasState,
  input: Record<string, unknown> | undefined,
  transcript: ToolTranscriptEntry[],
): { results: Array<{ result: unknown; operation?: ChatCanvasWriteOperation }>; layoutOps: ChatCanvasWriteOperation[] } {
  const operations = Array.isArray(input?.operations) ? input.operations : [];

  if (operations.length === 0) {
    transcript.push({
      tool: 'write_batch',
      input,
      result: { ok: false, error: 'No operations provided for write_batch.' },
    });
    return {
      results: [{ result: { ok: false, error: 'No operations provided for write_batch.' } }],
      layoutOps: [],
    };
  }

  const results: Array<{ result: unknown; operation?: ChatCanvasWriteOperation }> = [];

  // Sort: add_node first, then other operations, then add_edge last
  const sorted = [...operations].sort((a, b) => {
    const order = (op: unknown): number => {
      const action = (op as Record<string, unknown>)?.action;
      if (action === 'add_node') return 0;
      if (action === 'edit_node') return 1;
      if (action === 'delete_node') return 2;
      if (action === 'delete_edge') return 3;
      if (action === 'edit_edge') return 4;
      if (action === 'add_edge') return 5;
      return 3;
    };
    return order(a) - order(b);
  });

  for (const op of sorted) {
    if (!op || typeof op !== 'object') continue;
    const writeResult = executeWriteTool(state, op as Record<string, unknown>, transcript);
    results.push(writeResult);

    // Record every batch item so later planner steps can see both successes and failures.
    transcript.push({
      tool: 'write',
      input: op as Record<string, unknown>,
      result: writeResult.result,
    });
  }

  // Auto-layout after all operations
  const layoutOps = autoLayoutWorkingState(state);

  return { results, layoutOps };
}
