'use client';

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { MiniMap as ReactFlowMiniMap } from 'reactflow';
import { 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Map, 
  Keyboard,
  LayoutGrid,
  X,
  ArrowDown,
  ArrowRight,
  Grid,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface FlowControlsProps {
  onSearch: (query: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onLayoutChange: (direction: 'TB' | 'LR') => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  snapToGrid?: boolean;
  onToggleSnapToGrid?: () => void;
  onSelectAll?: () => void;
  onDuplicateSelected?: () => void;
  onSyncCanvas?: () => void;
  isSyncing?: boolean;
  lastSyncedAt?: string | null;
}

// Keyboard shortcuts helper
const shortcuts = [
  { keys: ['⌘/Ctrl', 'F'], action: 'Search nodes' },
  { keys: ['⌘/Ctrl', '+'], action: 'Zoom in' },
  { keys: ['⌘/Ctrl', '-'], action: 'Zoom out' },
  { keys: ['⌘/Ctrl', '0'], action: 'Fit view' },
  { keys: ['⌘/Ctrl', 'Z'], action: 'Undo' },
  { keys: ['⌘/Ctrl', 'A'], action: 'Select all' },
  { keys: ['⌘/Ctrl', 'C'], action: 'Copy node(s)' },
  { keys: ['⌘/Ctrl', 'V'], action: 'Paste node(s)' },
  { keys: ['⌘/Ctrl', 'D'], action: 'Duplicate' },
  { keys: ['Delete'], action: 'Delete selected' },
  { keys: ['Escape'], action: 'Clear selection' },
  { keys: ['Space'], action: 'Pan canvas (hold)' },
  { keys: ['G'], action: 'Toggle grid snap' },
];

export default memo(function FlowControls({
  onSearch,
  onZoomIn,
  onZoomOut,
  onFitView,
  onLayoutChange,
  showMinimap,
  onToggleMinimap,
  snapToGrid = true,
  onToggleSnapToGrid,
  onSelectAll,
  onDuplicateSelected,
  onSyncCanvas,
  isSyncing = false,
  lastSyncedAt = null,
}: FlowControlsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLayoutOptions, setShowLayoutOptions] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);

  // Click away listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false);
      }
      if (layoutRef.current && !layoutRef.current.contains(event.target as Node)) {
        setShowLayoutOptions(false);
      }
      if (shortcutsRef.current && !shortcutsRef.current.contains(event.target as Node)) {
        setShowShortcuts(false);
      }
    };

    if (showSearch || showLayoutOptions || showShortcuts) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSearch, showLayoutOptions, showShortcuts]);

  // Handle search change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch(value);
  }, [onSearch]);

  const handleClearSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    onSearch('');
  }, [onSearch]);

  return (
    <div className="flex flex-col gap-2">
      {/* Control Buttons */}
      <div className="flex flex-col items-center gap-2 p-2 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl">
        {/* Search Toggle + Dropdown */}
        <div ref={searchRef} className="relative w-full flex flex-col items-center">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showSearch ? "bg-cyan-500/20 text-cyan-400" : "text-slate-300 hover:text-white hover:bg-slate-700"
            )}
            title="Search (Ctrl+F)"
          >
            <Search size={16} />
          </button>
          
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-0 left-full ml-2 w-64 z-50"
              >
                <div className="relative bg-slate-900 backdrop-blur border border-slate-700 rounded-xl p-2 shadow-xl">
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg py-2 pl-9 pr-8 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="Search nodes..."
                  />
                  <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-px w-5 bg-slate-700" />

        {/* Zoom Controls */}
        <button
          onClick={onZoomIn}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Zoom In (Ctrl++)"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Zoom Out (Ctrl+-)"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={onFitView}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Fit View (Ctrl+0)"
        >
          <Maximize2 size={16} />
        </button>

        <div className="h-px w-5 bg-slate-700" />

        {/* Layout Options */}
        <div className="relative" ref={layoutRef}>
          <button
            onClick={() => setShowLayoutOptions(!showLayoutOptions)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showLayoutOptions ? "bg-cyan-500/20 text-cyan-400" : "text-slate-300 hover:text-white hover:bg-slate-700"
            )}
            title="Layout Direction"
          >
            <LayoutGrid size={16} />
          </button>
          
          <AnimatePresence>
            {showLayoutOptions && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-0 left-full ml-2 p-2 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50"
              >
                <button
                  onClick={() => {
                    onLayoutChange('TB');
                    setShowLayoutOptions(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg whitespace-nowrap"
                >
                  <ArrowDown size={14} />
                  Top to Bottom
                </button>
                <button
                  onClick={() => {
                    onLayoutChange('LR');
                    setShowLayoutOptions(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg whitespace-nowrap"
                >
                  <ArrowRight size={14} />
                  Left to Right
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Snap to Grid Toggle */}
        {onToggleSnapToGrid && (
          <button
            onClick={onToggleSnapToGrid}
            className={cn(
              "p-2 rounded-lg transition-colors",
              snapToGrid ? "bg-cyan-500/20 text-cyan-400" : "text-slate-300 hover:text-white hover:bg-slate-700"
            )}
            title={`Snap to Grid: ${snapToGrid ? 'On' : 'Off'} (G)`}
          >
            <Grid size={16} />
          </button>
        )}

        {/* Minimap Toggle */}
        <button
          onClick={onToggleMinimap}
          className={cn(
            "p-2 rounded-lg transition-colors",
            showMinimap ? "bg-cyan-500/20 text-cyan-400" : "text-slate-300 hover:text-white hover:bg-slate-700"
          )}
          title="Toggle Minimap"
        >
          <Map size={16} />
        </button>

        {/* Sync Canvas Context */}
        {onSyncCanvas && (
          <button
            onClick={onSyncCanvas}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isSyncing
                ? "bg-cyan-500/20 text-cyan-400"
                : "text-slate-300 hover:text-white hover:bg-slate-700"
            )}
            title={lastSyncedAt ? `Sync canvas context (Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()})` : 'Sync canvas context with AI'}
          >
            <RefreshCw size={16} className={cn(isSyncing && 'animate-spin')} />
          </button>
        )}

        <div className="h-px w-5 bg-slate-700" />

        {/* Keyboard Shortcuts */}
        <div className="relative" ref={shortcutsRef}>
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showShortcuts ? "bg-cyan-500/20 text-cyan-400" : "text-slate-300 hover:text-white hover:bg-slate-700"
            )}
            title="Keyboard Shortcuts"
          >
            <Keyboard size={16} />
          </button>

          <AnimatePresence>
            {showShortcuts && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-0 left-full ml-2 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-64 z-50"
              >
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Keyboard Shortcuts
                </h4>
                <div className="space-y-2">
                  {shortcuts.map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{shortcut.action}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, j) => (
                          <React.Fragment key={j}>
                            {j > 0 && <span className="text-slate-600">+</span>}
                            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

// Custom styled minimap component
export const StyledMiniMap = memo(function StyledMiniMap() {
  const minimapCategoryStroke: Record<string, string> = {
    api: '#10b981', component: '#3b82f6', database: '#8b5cf6',
    auth: '#ef4444', config: '#f59e0b', service: '#8b5cf6',
    utility: '#64748b', test: '#06b6d4', style: '#ec4899',
    asset: '#f97316', documentation: '#14b8a6', core: '#6366f1',
    hook: '#0ea5e9', context: '#f43f5e', middleware: '#84cc16',
    model: '#d946ef', route: '#eab308',
    // System design
    cache: '#fb923c', queue: '#fbbf24', 'load-balancer': '#22d3ee',
    gateway: '#34d399', storage: '#a78bfa', cdn: '#38bdf8',
    proxy: '#2dd4bf', firewall: '#f87171', 'external-api': '#60a5fa',
    'message-broker': '#f472b6', container: '#818cf8', serverless: '#facc15',
    client: '#94a3b8',
  };

  return (
    <ReactFlowMiniMap
      nodeStrokeColor={(n) => {
        return minimapCategoryStroke[n.data?.category] || '#64748b';
      }}
      nodeColor={(n) => {
        const stroke = minimapCategoryStroke[n.data?.category] || '#64748b';
        return stroke + '33';
      }}
      maskColor="#020617dd"
      className="!bg-slate-900 !border-slate-700 rounded-xl"
      style={{
        width: 150,
        height: 100,
      }}
    />
  );
});
