'use client';

import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
  useReactFlow,
} from 'reactflow';
import { X, MessageSquare, GripVertical, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Edge color mapping - memoized outside component
const edgeColors: Record<string, string> = {
  dependency: '#8b5cf6', // violet
  import: '#3b82f6', // blue
  calls: '#10b981', // emerald
  extends: '#f59e0b', // amber
  implements: '#ec4899', // pink
  sends: '#06b6d4', // cyan
  receives: '#14b8a6', // teal
  reads: '#a78bfa', // violet-light
  writes: '#f97316', // orange
  default: '#64748b', // slate
};

// Custom edge with label and delete button - optimized with memo
const CustomEdge = memo(function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [isDraggingLabel, setIsDraggingLabel] = useState(false);
  const [labelOffset, setLabelOffset] = useState({ x: 0, y: -30 }); // Default: above the line
  const [isEditing, setIsEditing] = useState(false);
  const [labelText, setLabelText] = useState(data?.label || '');
  const dragStartRef = useRef({ x: 0, y: 0 });
  const labelOffsetRef = useRef(labelOffset); // Track latest offset for mouseup closure
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep ref in sync with state
  useEffect(() => {
    labelOffsetRef.current = labelOffset;
  }, [labelOffset]);
  
  // Use stored offset from data if available
  useEffect(() => {
    if (data?.labelOffset) {
      setLabelOffset(data.labelOffset);
    }
  }, [data?.labelOffset]);
  
  useEffect(() => {
    setLabelText(data?.label || '');
  }, [data?.label]);
  
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const onEdgeDelete = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  }, [id, setEdges]);

  const edgeColor = edgeColors[data?.type || 'default'] || edgeColors.default;
  const strokeWidth = data?.strength === 'strong' ? 3 : data?.strength === 'weak' ? 1 : 2;
  const isTwoWay = data?.direction === 'two-way';

  // Toggle direction between one-way and two-way
  const onToggleDirection = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    const newDirection = isTwoWay ? 'one-way' : 'two-way';
    setEdges((edges) => edges.map((edge) =>
      edge.id === id
        ? { ...edge, data: { ...edge.data, direction: newDirection } }
        : edge
    ));
  }, [id, isTwoWay, setEdges]);
  
  // Handle label dragging
  const handleLabelMouseDown = useCallback((e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingLabel(true);
    dragStartRef.current = { x: e.clientX - labelOffset.x, y: e.clientY - labelOffset.y };
  }, [labelOffset, isEditing]);
  
  useEffect(() => {
    if (!isDraggingLabel) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newOffset = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      setLabelOffset(newOffset);
    };
    
    const handleMouseUp = () => {
      setIsDraggingLabel(false);
      // Save the latest offset via ref to avoid stale closure
      setEdges((edges) => edges.map((edge) => 
        edge.id === id 
          ? { ...edge, data: { ...edge.data, labelOffset: labelOffsetRef.current } }
          : edge
      ));
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLabel, id, setEdges, labelOffset]);
  
  // Handle adding/editing comment
  const handleAddComment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);
  
  const handleSaveComment = useCallback(() => {
    setIsEditing(false);
    setEdges((edges) => edges.map((edge) => 
      edge.id === id 
        ? { ...edge, data: { ...edge.data, label: labelText } }
        : edge
    ));
  }, [id, labelText, setEdges]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveComment();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setLabelText(data?.label || '');
    }
  }, [handleSaveComment, data?.label]);

  // Build marker IDs unique to this edge for correct per-edge coloring
  const markerEndId = `marker-end-${id}`;
  const markerStartId = `marker-start-${id}`;

  return (
    <>
      {/* SVG marker definitions for this edge */}
      <defs>
        <marker
          id={markerEndId}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M2,2 L10,6 L2,10 L4,6 Z" fill={edgeColor} />
        </marker>
        {isTwoWay && (
          <marker
            id={markerStartId}
            markerWidth="12"
            markerHeight="12"
            refX="2"
            refY="6"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M10,2 L2,6 L10,10 L8,6 Z" fill={edgeColor} />
          </marker>
        )}
      </defs>
      <BaseEdge 
        path={edgePath} 
        markerEnd={`url(#${markerEndId})`}
        markerStart={isTwoWay ? `url(#${markerStartId})` : undefined}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: selected ? strokeWidth + 1 : strokeWidth,
        }} 
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX + labelOffset.x}px,${labelY + labelOffset.y}px)`,
            fontSize: 10,
            pointerEvents: 'all',
            cursor: isDraggingLabel ? 'grabbing' : 'grab',
          }}
          className="nodrag nopan"
        >
          {/* Edge label - now draggable and editable */}
          {(data?.label || isEditing) && (
            <div 
              className={cn(
                "bg-slate-900/95 px-2 py-1 rounded-lg text-slate-300 border border-slate-700/50 mb-1 flex items-center gap-1.5 group",
                selected && "border-blue-500/50 shadow-lg shadow-blue-500/10",
                isDraggingLabel && "cursor-grabbing"
              )}
              onMouseDown={handleLabelMouseDown}
              onDoubleClick={handleAddComment}
            >
              <GripVertical size={10} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  onBlur={handleSaveComment}
                  onKeyDown={handleKeyDown}
                  className="bg-transparent border-none outline-none text-slate-200 text-xs w-24"
                  placeholder="Add comment..."
                />
              ) : (
                <span className="text-xs">{data?.label}</span>
              )}
            </div>
          )}
          
          {/* Controls (shown on select) */}
          {selected && (
            <div className="flex items-center gap-1 justify-center">
              {!data?.label && !isEditing && (
                <button
                  className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-slate-200 shadow-lg transition-all"
                  onClick={handleAddComment}
                  title="Add comment"
                >
                  <MessageSquare size={12} />
                </button>
              )}
              <button
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full shadow-lg transition-all",
                  isTwoWay
                    ? "bg-cyan-500/80 hover:bg-cyan-500 text-white"
                    : "bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                )}
                onClick={onToggleDirection}
                title={isTwoWay ? 'Switch to one-way' : 'Switch to two-way'}
              >
                {isTwoWay ? <ArrowLeftRight size={12} /> : <ArrowRight size={12} />}
              </button>
              <button
                className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white shadow-lg transition-all"
                onClick={onEdgeDelete}
                title="Delete connection"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export default CustomEdge;

export const edgeTypes = {
  custom: CustomEdge,
};
