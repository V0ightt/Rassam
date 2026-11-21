import type { Edge, Node } from 'reactflow';
import { canvasPatchSchema, type CanvasPatchContract } from '@/lib/contracts';
import type { EdgeData, NodeData } from '@/types';

export interface AppliedCanvasPatch {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
  revision: number;
}

function assertGraph(nodes: Node<NodeData>[], edges: Edge<EdgeData>[]): void {
  if (nodes.length > 2_000 || edges.length > 5_000) throw new Error('Patch exceeds the supported graph size.');
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) throw new Error('Patch creates duplicate node IDs.');
  if (nodes.some((node) => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) {
    throw new Error('Patch creates invalid node coordinates.');
  }
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) throw new Error('Patch creates duplicate edge IDs.');
  if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
    throw new Error('Patch creates a dangling edge.');
  }
}

/** Applies a server-validated proposal to a clone and returns only a valid final graph. */
export function applyCanvasPatch(
  sourceNodes: Node<NodeData>[],
  sourceEdges: Edge<EdgeData>[],
  rawPatch: unknown,
  currentRevision: number,
): AppliedCanvasPatch {
  const patch: CanvasPatchContract = canvasPatchSchema.parse(rawPatch);
  if (patch.baseGraphRevision !== currentRevision) {
    throw new Error('The canvas changed after this proposal was generated. Regenerate the proposal.');
  }

  let nodes = sourceNodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
  let edges = sourceEdges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data } : edge.data,
  }));
  assertGraph(nodes, edges);

  for (const operation of patch.operations) {
    if (operation.action === 'add_node') {
      if (nodes.some((node) => node.id === operation.node.id)) throw new Error('Patch adds a duplicate node.');
      nodes.push({
        id: operation.node.id,
        type: operation.node.type || 'enhanced',
        position: { ...operation.node.position },
        data: { ...operation.node.data },
      });
      continue;
    }
    if (operation.action === 'edit_node') {
      const index = nodes.findIndex((node) => node.id === operation.nodeId);
      if (index < 0) throw new Error('Patch edits a node that no longer exists.');
      const { position, ...data } = operation.changes;
      nodes[index] = {
        ...nodes[index],
        position: position ? { ...position } : nodes[index].position,
        data: { ...nodes[index].data, ...data },
      };
      continue;
    }
    if (operation.action === 'delete_node') {
      if (!nodes.some((node) => node.id === operation.nodeId)) throw new Error('Patch deletes a node that no longer exists.');
      nodes = nodes.filter((node) => node.id !== operation.nodeId);
      edges = edges.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId);
      continue;
    }
    if (operation.action === 'add_edge') {
      if (edges.some((edge) => edge.id === operation.edge.id)) throw new Error('Patch adds a duplicate edge.');
      edges.push({
        id: operation.edge.id,
        source: operation.edge.source,
        target: operation.edge.target,
        type: operation.edge.type || 'custom',
        data: operation.edge.data ? { ...operation.edge.data } : undefined,
      });
      continue;
    }
    if (operation.action === 'edit_edge') {
      const index = edges.findIndex((edge) => edge.id === operation.edgeId);
      if (index < 0) throw new Error('Patch edits an edge that no longer exists.');
      edges[index] = {
        ...edges[index],
        source: operation.changes.source || edges[index].source,
        target: operation.changes.target || edges[index].target,
        type: operation.changes.type || edges[index].type,
        data: operation.changes.data
          ? { ...edges[index].data, ...operation.changes.data }
          : edges[index].data,
      };
      continue;
    }
    const exists = edges.some((edge) => edge.id === operation.edgeId);
    if (!exists) throw new Error('Patch deletes an edge that no longer exists.');
    edges = edges.filter((edge) => edge.id !== operation.edgeId);
  }

  assertGraph(nodes, edges);
  return { nodes, edges, revision: patch.resultingRevision };
}
