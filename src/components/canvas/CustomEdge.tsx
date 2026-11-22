'use client';

import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from 'reactflow';
import { X, MessageSquare, GripVertical, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEdgeEdit } from '@/components/canvas/EdgeEditContext';

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
const defaultLabelOffset = { x: 0, y: -30 };

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
  data,
  selected,
}: EdgeProps) {
  const { onUpdateEdge, onDeleteEdge } = useEdgeEdit();
  const [isDraggingLabel, setIsDraggingLabel] = useState(false);
  const [dragLabelOffset, setDragLabelOffset] = useState(defaultLabelOffset);
  const [isEditing, setIsEditing] = useState(false);
  const [labelText, setLabelText] = useState('');
  const dragStartRef = useRef({ x: 0, y: 0 });
  const labelOffsetRef = useRef(defaultLabelOffset);
  const inputRef = useRef<HTMLInputElement>(null);
  const persistedLabelOffset = data?.labelOffset ?? defaultLabelOffset;
  const labelOffset = isDraggingLabel ? dragLabelOffset : persistedLabelOffset;
  
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
    onDeleteEdge(id);
  }, [id, onDeleteEdge]);

  const edgeColor = edgeColors[data?.type || 'default'] || edgeColors.default;
  const strokeWidth = data?.strength === 'strong' ? 3 : data?.strength === 'weak' ? 1 : 2;
  const isTwoWay = data?.direction === 'two-way';

  // Toggle direction between one-way and two-way
  const onToggleDirection = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    const newDirection = isTwoWay ? 'one-way' : 'two-way';
    onUpdateEdge(id, { direction: newDirection });
  }, [id, isTwoWay, onUpdateEdge]);
  
  // Handle label dragging
  const handleLabelMouseDown = useCallback((e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    setDragLabelOffset(persistedLabelOffset);
    labelOffsetRef.current = persistedLabelOffset;
    setIsDraggingLabel(true);
    dragStartRef.current = {
      x: e.clientX - persistedLabelOffset.x,
      y: e.clientY - persistedLabelOffset.y,
    };
  }, [persistedLabelOffset, isEditing]);
  
  useEffect(() => {
    if (!isDraggingLabel) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newOffset = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      labelOffsetRef.current = newOffset;
      setDragLabelOffset(newOffset);
    };
    
    const handleMouseUp = () => {
      setIsDraggingLabel(false);
      // Save the latest offset via ref to avoid stale closure
      onUpdateEdge(id, { labelOffset: labelOffsetRef.current });
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLabel, id, onUpdateEdge]);
  
  // Handle adding/editing comment
  const handleAddComment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLabelText(data?.label || '');
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [data?.label]);
  
  const handleSaveComment = useCallback(() => {
    setIsEditing(false);
    onUpdateEdge(id, { label: labelText });
  }, [id, labelText, onUpdateEdge]);
  
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
                  className="flex size-8 items-center justify-center rounded-full bg-slate-800/90 text-slate-300 shadow-lg transition-colors hover:bg-slate-700"
                  onClick={handleAddComment}
                  title="Add comment"
                  aria-label="Add connection label"
                >
                  <MessageSquare size={12} />
                </button>
              )}
              <button
                className={cn(
                  "flex size-8 items-center justify-center rounded-full shadow-lg transition-colors",
                  isTwoWay
                    ? "bg-cyan-500/80 hover:bg-cyan-500 text-white"
                    : "bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                )}
                onClick={onToggleDirection}
                title={isTwoWay ? 'Switch to one-way' : 'Switch to two-way'}
                aria-label={isTwoWay ? 'Change connection to one-way' : 'Change connection to two-way'}
              >
                {isTwoWay ? <ArrowLeftRight size={12} /> : <ArrowRight size={12} />}
              </button>
              <button
                className="flex size-8 items-center justify-center rounded-full bg-red-600/90 text-white shadow-lg transition-colors hover:bg-red-500"
                onClick={onEdgeDelete}
                title="Delete connection"
                aria-label="Delete connection"
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
