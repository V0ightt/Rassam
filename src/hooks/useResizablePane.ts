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

    const [width, setWidth] = useState(() => {
        if (typeof window === 'undefined') return defaultWidth;
        const saved = window.localStorage.getItem(storageKey);
        const parsed = saved ? Number.parseInt(saved, 10) : defaultWidth;
        return Number.isFinite(parsed) ? Math.max(minWidth, Math.min(maxWidth, parsed)) : defaultWidth;
    });
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(defaultWidth);

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

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        const delta = event.shiftKey ? 40 : 10;
        const inward = side === 'left' ? 1 : -1;
        let next = width;

        if (event.key === 'ArrowRight') next += delta * inward;
        else if (event.key === 'ArrowLeft') next -= delta * inward;
        else if (event.key === 'Home') next = minWidth;
        else if (event.key === 'End') next = maxWidth;
        else return;

        event.preventDefault();
        setWidth(Math.max(minWidth, Math.min(maxWidth, next)));
    }, [maxWidth, minWidth, side, width]);

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

    return { width, isResizing, handleMouseDown, handleKeyDown, resizeRef };
}
