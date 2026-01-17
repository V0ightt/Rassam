import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FileCode, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

const CustomNode = ({ data, selected }: NodeProps) => {
  return (
    <div
      className={cn(
        "px-4 py-3 shadow-lg rounded-xl border-2 bg-slate-900 w-[250px] transition-all duration-300",
        selected ? "border-blue-500 shadow-blue-500/50" : "border-slate-700 hover:border-slate-600"
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400 !bg-blue-500" />
      
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
             <Folder size={18} />
        </div>
        <div>
            <div className="text-sm font-bold text-slate-100">{data.label}</div>
            <div className="text-xs text-slate-400">{data.files?.length || 0} files</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 line-clamp-2">
        {data.description || "No description provided."}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-blue-500" />
    </div>
  );
};

export default memo(CustomNode);
