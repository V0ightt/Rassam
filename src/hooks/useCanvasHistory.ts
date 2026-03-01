import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface CanvasHistoryState {
    nodes: Node[];
    edges: Edge[];
}

/**
 * Manages undo/redo history for the React Flow canvas.
 * Keeps up to `maxHistory` snapshots; any new edit clears the redo stack.
 */
export function useCanvasHistory(
    nodes: Node[],
    edges: Edge[],
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void,
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void,
    maxHistory = 10,
) {
    const [history, setHistory] = useState<CanvasHistoryState[]>([]);
    const [future, setFuture] = useState<CanvasHistoryState[]>([]);

    const saveToHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-maxHistory), { nodes: [...nodes], edges: [...edges] }]);
        setFuture([]);
    }, [nodes, edges, maxHistory]);

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const lastState = history[history.length - 1];
        setFuture(prev => [...prev, { nodes: [...nodes], edges: [...edges] }]);
        setNodes(lastState.nodes);
        setEdges(lastState.edges);
        setHistory(prev => prev.slice(0, -1));
    }, [history, nodes, edges, setNodes, setEdges]);

    const handleRedo = useCallback(() => {
        if (future.length === 0) return;
        const nextState = future[future.length - 1];
        setHistory(prev => [...prev, { nodes: [...nodes], edges: [...edges] }]);
        setNodes(nextState.nodes);
        setEdges(nextState.edges);
        setFuture(prev => prev.slice(0, -1));
    }, [future, nodes, edges, setNodes, setEdges]);

    return {
        history,
        future,
        saveToHistory,
        handleUndo,
        handleRedo,
        canUndo: history.length > 0,
        canRedo: future.length > 0,
    };
}
