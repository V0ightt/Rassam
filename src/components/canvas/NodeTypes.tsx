'use client';

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  FileCode, 
  Folder, 
  Server, 
  Database, 
  Shield, 
  Wrench,
  TestTube,
  Palette,
  Image,
  FileText,
  Box,
  Cloud,
  Anchor,
  Layers,
  GitBranch,
  Cpu,
  Route,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  HardDrive,
  ListOrdered,
  Scale,
  DoorOpen,
  Archive,
  Globe,
  ArrowLeftRight,
  ShieldAlert,
  Plug,
  Radio,
  Container,
  Zap,
  Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeCategory, NodeData } from '@/types';
import { useNodeEdit } from './NodeEditContext';

// Icon mapping for different node categories
const categoryIcons: Record<NodeCategory, React.ElementType> = {
  // Code-based
  api: Server,
  component: Box,
  config: Wrench,
  database: Database,
  auth: Shield,
  utility: Wrench,
  test: TestTube,
  style: Palette,
  asset: Image,
  documentation: FileText,
  core: Cpu,
  service: Cloud,
  hook: Anchor,
  context: Layers,
  middleware: GitBranch,
  model: Database,
  route: Route,
  // System design
  cache: HardDrive,
  queue: ListOrdered,
  'load-balancer': Scale,
  gateway: DoorOpen,
  storage: Archive,
  cdn: Globe,
  proxy: ArrowLeftRight,
  firewall: ShieldAlert,
  'external-api': Plug,
  'message-broker': Radio,
  container: Container,
  serverless: Zap,
  client: Monitor,
  default: Folder,
};

// Color mapping for different node categories
const categoryColors: Record<NodeCategory, { bg: string; border: string; icon: string; glow: string }> = {
  // Code-based
  api: { bg: 'bg-emerald-900/30', border: 'border-emerald-500', icon: 'text-emerald-400', glow: 'shadow-emerald-500/30' },
  component: { bg: 'bg-blue-900/30', border: 'border-blue-500', icon: 'text-blue-400', glow: 'shadow-blue-500/30' },
  config: { bg: 'bg-amber-900/30', border: 'border-amber-500', icon: 'text-amber-400', glow: 'shadow-amber-500/30' },
  database: { bg: 'bg-purple-900/30', border: 'border-purple-500', icon: 'text-purple-400', glow: 'shadow-purple-500/30' },
  auth: { bg: 'bg-red-900/30', border: 'border-red-500', icon: 'text-red-400', glow: 'shadow-red-500/30' },
  utility: { bg: 'bg-slate-900/30', border: 'border-slate-500', icon: 'text-slate-400', glow: 'shadow-slate-500/30' },
  test: { bg: 'bg-cyan-900/30', border: 'border-cyan-500', icon: 'text-cyan-400', glow: 'shadow-cyan-500/30' },
  style: { bg: 'bg-pink-900/30', border: 'border-pink-500', icon: 'text-pink-400', glow: 'shadow-pink-500/30' },
  asset: { bg: 'bg-orange-900/30', border: 'border-orange-500', icon: 'text-orange-400', glow: 'shadow-orange-500/30' },
  documentation: { bg: 'bg-teal-900/30', border: 'border-teal-500', icon: 'text-teal-400', glow: 'shadow-teal-500/30' },
  core: { bg: 'bg-indigo-900/30', border: 'border-indigo-500', icon: 'text-indigo-400', glow: 'shadow-indigo-500/30' },
  service: { bg: 'bg-violet-900/30', border: 'border-violet-500', icon: 'text-violet-400', glow: 'shadow-violet-500/30' },
  hook: { bg: 'bg-sky-900/30', border: 'border-sky-500', icon: 'text-sky-400', glow: 'shadow-sky-500/30' },
  context: { bg: 'bg-rose-900/30', border: 'border-rose-500', icon: 'text-rose-400', glow: 'shadow-rose-500/30' },
  middleware: { bg: 'bg-lime-900/30', border: 'border-lime-500', icon: 'text-lime-400', glow: 'shadow-lime-500/30' },
  model: { bg: 'bg-fuchsia-900/30', border: 'border-fuchsia-500', icon: 'text-fuchsia-400', glow: 'shadow-fuchsia-500/30' },
  route: { bg: 'bg-yellow-900/30', border: 'border-yellow-500', icon: 'text-yellow-400', glow: 'shadow-yellow-500/30' },
  // System design
  cache: { bg: 'bg-orange-900/30', border: 'border-orange-400', icon: 'text-orange-300', glow: 'shadow-orange-400/30' },
  queue: { bg: 'bg-amber-900/30', border: 'border-amber-400', icon: 'text-amber-300', glow: 'shadow-amber-400/30' },
  'load-balancer': { bg: 'bg-cyan-900/30', border: 'border-cyan-400', icon: 'text-cyan-300', glow: 'shadow-cyan-400/30' },
  gateway: { bg: 'bg-emerald-900/30', border: 'border-emerald-400', icon: 'text-emerald-300', glow: 'shadow-emerald-400/30' },
  storage: { bg: 'bg-violet-900/30', border: 'border-violet-400', icon: 'text-violet-300', glow: 'shadow-violet-400/30' },
  cdn: { bg: 'bg-sky-900/30', border: 'border-sky-400', icon: 'text-sky-300', glow: 'shadow-sky-400/30' },
  proxy: { bg: 'bg-teal-900/30', border: 'border-teal-400', icon: 'text-teal-300', glow: 'shadow-teal-400/30' },
  firewall: { bg: 'bg-red-900/30', border: 'border-red-400', icon: 'text-red-300', glow: 'shadow-red-400/30' },
  'external-api': { bg: 'bg-blue-900/30', border: 'border-blue-400', icon: 'text-blue-300', glow: 'shadow-blue-400/30' },
  'message-broker': { bg: 'bg-pink-900/30', border: 'border-pink-400', icon: 'text-pink-300', glow: 'shadow-pink-400/30' },
  container: { bg: 'bg-indigo-900/30', border: 'border-indigo-400', icon: 'text-indigo-300', glow: 'shadow-indigo-400/30' },
  serverless: { bg: 'bg-yellow-900/30', border: 'border-yellow-400', icon: 'text-yellow-300', glow: 'shadow-yellow-400/30' },
  client: { bg: 'bg-slate-900/30', border: 'border-slate-400', icon: 'text-slate-300', glow: 'shadow-slate-400/30' },
  default: { bg: 'bg-slate-900/30', border: 'border-slate-600', icon: 'text-slate-400', glow: 'shadow-slate-500/30' },
};

// Complexity indicator component - memoized
const ComplexityBadge = memo(({ complexity }: { complexity?: 'low' | 'medium' | 'high' }) => {
  if (!complexity) return null;
  
  const colors = {
    low: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', colors[complexity])}>
      {complexity}
    </span>
  );
});

ComplexityBadge.displayName = 'ComplexityBadge';

// File icon helper - memoized function
const getFileIcon = (file: string) => {
  const ext = file.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return <Box size={10} className="text-blue-400" />;
    case 'ts':
    case 'js':
      return <FileCode size={10} className="text-yellow-400" />;
    case 'css':
    case 'scss':
      return <Palette size={10} className="text-pink-400" />;
    case 'json':
      return <Wrench size={10} className="text-amber-400" />;
    case 'md':
      return <FileText size={10} className="text-teal-400" />;
    default:
      return <FileCode size={10} className="text-slate-400" />;
  }
};

// File item component - memoized
const FileItem = memo(({ file, index }: { file: string; index: number }) => {
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(file);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [file]);

  return (
    <div className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-slate-700/30 group text-[10px] text-slate-400">
      {getFileIcon(file)}
      <span className="truncate flex-1" title={file}>
        {file.split('/').pop()}
      </span>
      <button
        onClick={copyToClipboard}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
      >
        {copied ? (
          <Check size={10} className="text-green-400" />
        ) : (
          <Copy size={10} className="text-slate-500 hover:text-slate-300" />
        )}
      </button>
    </div>
  );
});

FileItem.displayName = 'FileItem';

// File list component - memoized
const FileList = memo(({ files, isExpanded }: { files: string[]; isExpanded: boolean }) => {
  if (!isExpanded) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/50 max-h-[150px] overflow-y-auto custom-scrollbar">
      {files.slice(0, 10).map((file, i) => (
        <FileItem key={i} file={file} index={i} />
      ))}
      {files.length > 10 && (
        <div className="text-[10px] text-slate-500 mt-1 text-center">
          +{files.length - 10} more files
        </div>
      )}
    </div>
  );
});

FileList.displayName = 'FileList';

// Inline editable text component for double-click editing
const InlineEdit = memo(({ value, nodeId, field, className, multiline }: {
  value: string;
  nodeId: string;
  field: 'label' | 'description';
  className?: string;
  multiline?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const { onUpdateNode } = useNodeEdit();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Sync draft when value changes externally while not editing
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onUpdateNode(nodeId, { [field]: trimmed });
    } else {
      setDraft(value); // revert
    }
    setEditing(false);
  }, [draft, value, field, nodeId, onUpdateNode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
    // Prevent event from reaching ReactFlow
    e.stopPropagation();
  }, [commit, value]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  }, []);

  if (editing) {
    const sharedClass = cn(
      'bg-slate-800/80 border border-cyan-500/50 rounded px-1 py-0.5 outline-none text-slate-100 w-full',
      className
    );

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(sharedClass, 'resize-none')}
          rows={2}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={sharedClass}
      />
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className={cn(className, 'cursor-default select-none')}
      title="Double-click to edit"
    >
      {value || (field === 'description' ? 'No description provided.' : 'Untitled')}
    </span>
  );
});

InlineEdit.displayName = 'InlineEdit';

// Main Enhanced Node Component - optimized with memo and no framer-motion during drag
export const EnhancedNode = memo(({ data, selected, id }: NodeProps<NodeData>) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const category = data.category || 'default';
  const colors = categoryColors[category] ?? categoryColors.default;
  const Icon = categoryIcons[category] ?? categoryIcons.default;

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <div
      className={cn(
        "px-4 py-3 shadow-lg rounded-xl border-2 w-[280px]",
        colors.bg,
        selected ? `${colors.border} shadow-lg ${colors.glow}` : "border-slate-700/50 hover:border-slate-600"
      )}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className={cn("!w-3 !h-3 !border-2 !border-slate-900", colors.border, colors.bg)} 
      />
      
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", colors.bg, "border", colors.border)}>
          <Icon size={18} className={colors.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <InlineEdit
              value={data.label}
              nodeId={id}
              field="label"
              className="text-sm font-bold text-slate-100 truncate"
            />
            <ComplexityBadge complexity={data.complexity} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{category}</span>
            <span className="text-[10px] text-slate-600">•</span>
            <span className="text-[10px] text-slate-400">{data.files?.length || 0} files</span>
            {data.linesOfCode && (
              <>
                <span className="text-[10px] text-slate-600">•</span>
                <span className="text-[10px] text-slate-400">{data.linesOfCode} LOC</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="text-xs mt-2 line-clamp-2">
        <InlineEdit
          value={data.description || ''}
          nodeId={id}
          field="description"
          className="text-xs text-slate-400"
          multiline
        />
      </div>

      {/* Dependencies Preview */}
      {data.dependencies && data.dependencies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.dependencies.slice(0, 3).map((dep, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">
              {dep}
            </span>
          ))}
          {data.dependencies.length > 3 && (
            <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-500">
              +{data.dependencies.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Expand/Collapse Files */}
      {data.files && data.files.length > 0 && (
        <>
          <button
            onClick={toggleExpand}
            className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors w-full justify-center py-1 rounded hover:bg-slate-700/30"
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {isExpanded ? 'Hide files' : 'Show files'}
          </button>
          <FileList files={data.files} isExpanded={isExpanded} />
        </>
      )}

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className={cn("!w-3 !h-3 !border-2 !border-slate-900", colors.border, colors.bg)} 
      />
    </div>
  );
});

EnhancedNode.displayName = 'EnhancedNode';

// Compact Node for dense layouts - optimized
export const CompactNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const category = data.category || 'default';
  const colors = categoryColors[category] ?? categoryColors.default;
  const Icon = categoryIcons[category] ?? categoryIcons.default;

  return (
    <div
      className={cn(
        "px-3 py-2 shadow-md rounded-lg border w-[180px]",
        colors.bg,
        selected ? `${colors.border} shadow-lg ${colors.glow}` : "border-slate-700/50"
      )}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-slate-500" />
      
      <div className="flex items-center gap-2">
        <Icon size={14} className={colors.icon} />
        <span className="text-xs font-medium text-slate-200 truncate">{data.label}</span>
        <span className="text-[10px] text-slate-500 ml-auto">{data.files?.length || 0}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-500" />
    </div>
  );
});

CompactNode.displayName = 'CompactNode';

// Group Node for containing related nodes - optimized
export const GroupNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const category = data.category || 'default';
  const colors = categoryColors[category] ?? categoryColors.default;

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-2xl border-2 border-dashed min-w-[300px] min-h-[200px]",
        colors.bg,
        selected ? colors.border : "border-slate-700/30"
      )}
    >
      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
        {data.label}
      </div>
      <div className="text-[10px] text-slate-500">
        {data.description}
      </div>
    </div>
  );
});

GroupNode.displayName = 'GroupNode';

// Export all node types
export const nodeTypes = {
  enhanced: EnhancedNode,
  compact: CompactNode,
  group: GroupNode,
  // Keep backward compatibility
  customNode: EnhancedNode,
};

export default nodeTypes;
