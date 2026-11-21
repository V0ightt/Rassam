import dagre from 'dagre';
import type { FlowEdge, FlowNode } from '@/types';

interface LayoutWorkerRequest {
  id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction: 'TB' | 'LR';
}

function layout(request: LayoutWorkerRequest): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (request.nodes.length > 2_000 || request.edges.length > 5_000) {
    throw new Error('The graph exceeds the supported layout size.');
  }
  const nodeIds = new Set(request.nodes.map((node) => node.id));
  if (nodeIds.size !== request.nodes.length) throw new Error('The graph contains duplicate node IDs.');
  if (request.edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
    throw new Error('The graph contains a dangling edge.');
  }

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: request.direction,
    nodesep: 80,
    ranksep: 100,
    edgesep: 30,
    marginx: 50,
    marginy: 50,
  });
  for (const node of request.nodes) {
    const fileCount = Array.isArray(node.data?.files) ? node.data.files.length : 0;
    graph.setNode(node.id, { width: 280, height: 100 + (fileCount > 5 ? 30 : 0) });
  }
  for (const edge of request.edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  const nodes = request.nodes.map((node) => {
    const position = graph.node(node.id) as { x?: number; y?: number } | undefined;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
      throw new Error('The layout engine returned invalid coordinates.');
    }
    const fileCount = Array.isArray(node.data?.files) ? node.data.files.length : 0;
    const height = 100 + (fileCount > 5 ? 30 : 0);
    return {
      ...node,
      position: { x: position!.x! - 140, y: position!.y! - height / 2 },
    };
  });
  return { nodes, edges: request.edges };
}

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  try {
    self.postMessage({ id: event.data.id, ...layout(event.data) });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'Layout failed.',
    });
  }
};
