import { useState, useCallback, useEffect, useRef } from 'react';

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 800;

interface ResizablePaneOptions {
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    side?: 'left' | 'right';
}

/**
 * Manages a resizable sidebar pane width with mouse-drag support
 * and localStorage persistence.
 */
export function useResizablePane(storageKey: string, options: ResizablePaneOptions = {}) {
    const {
        defaultWidth = DEFAULT_WIDTH,
        minWidth = MIN_WIDTH,
        maxWidth = MAX_WIDTH,
        side = 'right',
    } = options;

    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(defaultWidth);

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
        startXRef.current = e.clientX;
        startWidthRef.current = width;
        setIsResizing(true);
    }, [width]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const delta = e.clientX - startXRef.current;
            const newWidth = side === 'left'
                ? startWidthRef.current + delta
                : startWidthRef.current - delta;
            setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
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
    }, [isResizing, minWidth, maxWidth, side]);

    return { width, isResizing, handleMouseDown, resizeRef };
}
