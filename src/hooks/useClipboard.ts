import { useCallback, useRef } from 'react';
import type { Edge, Node } from 'reactflow';

interface ClipboardState {
    nodes: Node[];
    edges: Edge[];
}

/** Project-scoped in-memory canvas clipboard. */
export function useClipboard(
    projectId: string | null,
    nodes: Node[],
    selectedNodes: Node[],
    selectedNode: Node | null,
    edges: Edge[],
    saveToHistory: () => void,
    commit: (nodes: Node[], edges: Edge[]) => void,
) {
    const clipboardsRef = useRef(new Map<string, ClipboardState>());

    const handleCopy = useCallback(() => {
        if (!projectId) return;
        const nodesToCopy = selectedNodes.length > 0
            ? selectedNodes
            : (selectedNode ? [selectedNode] : []);
        if (nodesToCopy.length === 0) return;
        const nodeIds = new Set(nodesToCopy.map((node) => node.id));
        clipboardsRef.current.set(projectId, {
            nodes: nodesToCopy.map((node) => ({ ...node, data: { ...node.data } })),
            edges: edges
                .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
                .map((edge) => ({ ...edge, data: edge.data ? { ...edge.data } : edge.data })),
        });
    }, [edges, projectId, selectedNode, selectedNodes]);

    const handlePaste = useCallback(() => {
        if (!projectId) return;
        const clipboard = clipboardsRef.current.get(projectId);
        if (!clipboard?.nodes.length) return;
        saveToHistory();

        const idMap = new Map(clipboard.nodes.map((node) => [node.id, crypto.randomUUID()]));
        const newNodes = clipboard.nodes.map((node) => ({
            ...node,
            id: idMap.get(node.id)!,
            position: { x: node.position.x + 60, y: node.position.y + 60 },
            selected: false,
            data: { ...node.data },
        }));
        const newEdges = clipboard.edges.map((edge) => ({
            ...edge,
            id: crypto.randomUUID(),
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
            selected: false,
            data: edge.data ? { ...edge.data } : undefined,
        }));
        commit([...nodes, ...newNodes], [...edges, ...newEdges]);
    }, [commit, edges, nodes, projectId, saveToHistory]);

    return {
        handleCopy,
        handlePaste,
    };
}
