import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface ClipboardState {
    nodes: Node[];
    edges: Edge[];
}

/**
 * Manages copy/paste of nodes (and their internal edges) on the canvas.
 * Generates fresh IDs on paste to avoid collisions, with a positional offset.
 */
export function useClipboard(
    selectedNodes: Node[],
    selectedNode: Node | null,
    edges: Edge[],
    saveToHistory: () => void,
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void,
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void,
) {
    const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

    const handleCopy = useCallback(() => {
        const nodesToCopy = selectedNodes.length > 0
            ? selectedNodes
            : (selectedNode ? [selectedNode] : []);
        if (nodesToCopy.length === 0) return;

        const nodeIds = new Set(nodesToCopy.map(n => n.id));
        // Only copy edges fully within the selection
        const edgesToCopy = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
        setClipboard({ nodes: nodesToCopy, edges: edgesToCopy });
    }, [selectedNodes, selectedNode, edges]);

    const handlePaste = useCallback(() => {
        if (!clipboard || clipboard.nodes.length === 0) return;
        saveToHistory();

        const OFFSET = 60;
        const idMap = new Map<string, string>();
        clipboard.nodes.forEach(n => {
            idMap.set(n.id, `node-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);
        });

        const newNodes: Node[] = clipboard.nodes.map(n => ({
            ...n,
            id: idMap.get(n.id)!,
            position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
            selected: false,
            data: { ...n.data },
        }));

        const newEdges: Edge[] = clipboard.edges.map(e => ({
            ...e,
            id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            source: idMap.get(e.source) || e.source,
            target: idMap.get(e.target) || e.target,
            selected: false,
            data: e.data ? { ...e.data } : undefined,
        }));

        setNodes(nds => [...(nds as Node[]), ...newNodes]);
        setEdges(eds => [...(eds as Edge[]), ...newEdges]);
    }, [clipboard, saveToHistory, setNodes, setEdges]);

    return { clipboard, handleCopy, handlePaste };
}
