import { useEffect, useRef } from 'react';
import { Node } from 'reactflow';

export interface CanvasShortcutHandlers {
    selectedNode: Node | null;
    selectedNodes: Node[];
    setSelectedNode: (node: Node | null) => void;
    handleDeleteNode: (nodeId: string) => void;
    handleBatchDelete: (nodeIds: string[]) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleCopy: () => void;
    handlePaste: () => void;
    handleSelectAll: () => void;
    handleDuplicateSelected: () => void;
    handleToggleSnapToGrid: () => void;
}

/**
 * Registers global keyboard shortcuts for canvas operations.
 * Uses a ref to always read the latest handler values without
 * re-attaching the event listener on every render.
 */
export function useCanvasShortcuts(handlers: CanvasShortcutHandlers) {
    const ref = useRef(handlers);
    ref.current = handlers;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if user is typing in an input / textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const h = ref.current;

            if (e.key === 'Delete') {
                if (h.selectedNodes.length > 1) {
                    h.handleBatchDelete(h.selectedNodes.map(n => n.id));
                } else if (h.selectedNode) {
                    h.handleDeleteNode(h.selectedNode.id);
                }
            }
            if (e.key === 'Escape') {
                h.setSelectedNode(null);
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                h.handleUndo();
            }
            if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
                e.preventDefault();
                h.handleRedo();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                e.preventDefault();
                h.handleCopy();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                e.preventDefault();
                h.handlePaste();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                h.handleSelectAll();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
                e.preventDefault();
                h.handleDuplicateSelected();
            }
            if (e.key === 'g' || e.key === 'G') {
                h.handleToggleSnapToGrid();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}
