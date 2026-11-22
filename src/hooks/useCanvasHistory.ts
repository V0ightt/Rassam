import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';

export interface CanvasHistoryState {
    nodes: Node[];
    edges: Edge[];
}

interface ProjectHistory {
    past: CanvasHistoryState[];
    future: CanvasHistoryState[];
    estimatedBytes: number;
}

function estimateBytes(snapshot: CanvasHistoryState): number {
    try {
        return JSON.stringify(snapshot).length * 2;
    } catch {
        return 0;
    }
}

/** Project-scoped committed-command history with bounded memory usage. */
export function useCanvasHistory(
    projectId: string | null,
    nodes: Node[],
    edges: Edge[],
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void,
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void,
    maxHistory = 100,
    maxBytes = 20 * 1024 * 1024,
) {
    const [, refresh] = useState(0);
    const statesRef = useRef(new Map<string, ProjectHistory>());
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    const getState = useCallback((): ProjectHistory | null => {
        if (!projectId) return null;
        let state = statesRef.current.get(projectId);
        if (!state) {
            state = { past: [], future: [], estimatedBytes: 0 };
            statesRef.current.set(projectId, state);
        }
        return state;
    }, [projectId]);

    const saveToHistory = useCallback(() => {
        const state = getState();
        if (!state) return;
        const snapshot = { nodes: [...nodesRef.current], edges: [...edgesRef.current] };
        state.past.push(snapshot);
        state.estimatedBytes += estimateBytes(snapshot);
        state.future = [];
        while (state.past.length > maxHistory || state.estimatedBytes > maxBytes) {
            const removed = state.past.shift();
            if (!removed) break;
            state.estimatedBytes = Math.max(0, state.estimatedBytes - estimateBytes(removed));
        }
        refresh((value) => value + 1);
    }, [getState, maxBytes, maxHistory]);

    const handleUndo = useCallback((): CanvasHistoryState | null => {
        const state = getState();
        const previous = state?.past.pop();
        if (!state || !previous) return null;
        const current = { nodes: [...nodesRef.current], edges: [...edgesRef.current] };
        state.future.push(current);
        state.estimatedBytes = Math.max(0, state.estimatedBytes - estimateBytes(previous));
        nodesRef.current = previous.nodes;
        edgesRef.current = previous.edges;
        setNodes(previous.nodes);
        setEdges(previous.edges);
        refresh((value) => value + 1);
        return previous;
    }, [getState, setEdges, setNodes]);

    const handleRedo = useCallback((): CanvasHistoryState | null => {
        const state = getState();
        const next = state?.future.pop();
        if (!state || !next) return null;
        const current = { nodes: [...nodesRef.current], edges: [...edgesRef.current] };
        state.past.push(current);
        state.estimatedBytes += estimateBytes(current);
        nodesRef.current = next.nodes;
        edgesRef.current = next.edges;
        setNodes(next.nodes);
        setEdges(next.edges);
        refresh((value) => value + 1);
        return next;
    }, [getState, setEdges, setNodes]);

    const state = projectId ? statesRef.current.get(projectId) : undefined;
    return {
        history: state?.past ?? [],
        future: state?.future ?? [],
        saveToHistory,
        handleUndo,
        handleRedo,
        canUndo: Boolean(state?.past.length),
        canRedo: Boolean(state?.future.length),
    };
}
