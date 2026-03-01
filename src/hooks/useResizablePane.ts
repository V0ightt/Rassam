import { useState, useCallback, useEffect, useRef } from 'react';

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 800;

/**
 * Manages a resizable sidebar pane width with mouse-drag support
 * and localStorage persistence.
 */
export function useResizablePane(storageKey: string) {
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null);

    // Load persisted width on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) setWidth(parseInt(saved));
        } catch { /* ignore */ }
    }, [storageKey]);

    // Persist width changes
    useEffect(() => {
        localStorage.setItem(storageKey, width.toString());
    }, [width, storageKey]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth)));
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    return { width, isResizing, handleMouseDown, resizeRef };
}
