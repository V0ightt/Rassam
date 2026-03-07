import { useState, useCallback, useRef, useEffect } from 'react';
import { Node, Edge } from 'reactflow';

interface CanvasHistoryState {
    nodes: Node[];
    edges: Edge[];
}

/**
 * Manages undo/redo history for the React Flow canvas.
 * Keeps up to `maxHistory` snapshots; any new edit clears the redo stack.
 * Uses refs for nodes/edges to keep callbacks stable and avoid cascading re-renders.
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

    // Refs keep callbacks stable — no re-creation on every drag frame
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const historyRef = useRef(history);
    const futureRef = useRef(future);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    useEffect(() => { historyRef.current = history; }, [history]);
    useEffect(() => { futureRef.current = future; }, [future]);

    const saveToHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-maxHistory), { nodes: [...nodesRef.current], edges: [...edgesRef.current] }]);
        setFuture([]);
    }, [maxHistory]);

    const handleUndo = useCallback(() => {
        const hist = historyRef.current;
        if (hist.length === 0) return;
        const lastState = hist[hist.length - 1];
        setFuture(prev => [...prev, { nodes: [...nodesRef.current], edges: [...edgesRef.current] }]);
        setNodes(lastState.nodes);
        setEdges(lastState.edges);
        setHistory(prev => prev.slice(0, -1));
    }, [setNodes, setEdges]);

    const handleRedo = useCallback(() => {
        const fut = futureRef.current;
        if (fut.length === 0) return;
        const nextState = fut[fut.length - 1];
        setHistory(prev => [...prev, { nodes: [...nodesRef.current], edges: [...edgesRef.current] }]);
        setNodes(nextState.nodes);
        setEdges(nextState.edges);
        setFuture(prev => prev.slice(0, -1));
    }, [setNodes, setEdges]);

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
