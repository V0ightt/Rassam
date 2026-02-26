'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Plus,
  Trash2,
  Edit3,
  RotateCcw,
  Save,
  X,
  Check,
  FileCode,
  Layers,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeCategory } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface EditToolbarProps {
  selectedNode: any | null;
  selectedNodes?: any[];
  onAddNode: (nodeData: any) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, data: any) => void;
  onBatchDelete?: (nodeIds: string[]) => void;
  onBatchUpdateCategory?: (nodeIds: string[], category: string) => void;
  onUndo?: () => void;
  onSave?: () => void;
}

const categories: { value: NodeCategory; label: string; group?: string }[] = [
  // Code-based
  { value: 'component', label: 'Component', group: 'Code' },
  { value: 'api', label: 'API', group: 'Code' },
  { value: 'service', label: 'Service', group: 'Code' },
  { value: 'database', label: 'Database', group: 'Code' },
  { value: 'auth', label: 'Auth', group: 'Code' },
  { value: 'config', label: 'Config', group: 'Code' },
  { value: 'utility', label: 'Utility', group: 'Code' },
  { value: 'hook', label: 'Hook', group: 'Code' },
  { value: 'context', label: 'Context', group: 'Code' },
  { value: 'model', label: 'Model', group: 'Code' },
  { value: 'route', label: 'Route', group: 'Code' },
  { value: 'middleware', label: 'Middleware', group: 'Code' },
  { value: 'core', label: 'Core', group: 'Code' },
  { value: 'test', label: 'Test', group: 'Code' },
  { value: 'style', label: 'Style', group: 'Code' },
  { value: 'documentation', label: 'Documentation', group: 'Code' },
  { value: 'asset', label: 'Asset', group: 'Code' },
  // System design
  { value: 'cache', label: 'Cache', group: 'System' },
  { value: 'queue', label: 'Queue', group: 'System' },
  { value: 'load-balancer', label: 'Load Balancer', group: 'System' },
  { value: 'gateway', label: 'Gateway', group: 'System' },
  { value: 'storage', label: 'Storage', group: 'System' },
  { value: 'cdn', label: 'CDN', group: 'System' },
  { value: 'proxy', label: 'Proxy', group: 'System' },
  { value: 'firewall', label: 'Firewall', group: 'System' },
  { value: 'external-api', label: 'External API', group: 'System' },
  { value: 'message-broker', label: 'Message Broker', group: 'System' },
  { value: 'container', label: 'Container', group: 'System' },
  { value: 'serverless', label: 'Serverless', group: 'System' },
  { value: 'client', label: 'Client', group: 'System' },
  { value: 'default', label: 'Other' },
];

export default function EditToolbar({ 
  selectedNode, 
  selectedNodes = [],
  onAddNode, 
  onDeleteNode, 
  onUpdateNode,
  onBatchDelete,
  onBatchUpdateCategory,
  onUndo,
  onSave
}: EditToolbarProps) {
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isBatchCategoryOpen, setIsBatchCategoryOpen] = useState(false);
  const [newNodeData, setNewNodeData] = useState({
    label: '',
    description: '',
    category: 'component' as NodeCategory,
    files: [] as string[],
  });
  const [editData, setEditData] = useState({
    label: '',
    description: '',
    category: 'default' as NodeCategory,
  });
  const [newFile, setNewFile] = useState('');
  
  const addNodeRef = useRef<HTMLDivElement>(null);
  const editNodeRef = useRef<HTMLDivElement>(null);
  const batchCategoryRef = useRef<HTMLDivElement>(null);

  const isMultiSelect = selectedNodes.length > 1;
  const multiSelectIds = selectedNodes.map((n: any) => n.id);

  // Click away listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addNodeRef.current && !addNodeRef.current.contains(event.target as Node)) {
        setIsAddingNode(false);
      }
      if (editNodeRef.current && !editNodeRef.current.contains(event.target as Node)) {
        setIsEditing(false);
      }
      if (batchCategoryRef.current && !batchCategoryRef.current.contains(event.target as Node)) {
        setIsBatchCategoryOpen(false);
      }
    };

    if (isAddingNode || isEditing || isBatchCategoryOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAddingNode, isEditing, isBatchCategoryOpen]);

  const handleAddNode = () => {
    if (!newNodeData.label.trim()) return;
    
    onAddNode({
      label: newNodeData.label,
      description: newNodeData.description || 'Manually added node',
      category: newNodeData.category,
      files: newNodeData.files,
    });
    
    setNewNodeData({ label: '', description: '', category: 'component', files: [] });
    setIsAddingNode(false);
  };

  const handleEditStart = () => {
    if (selectedNode) {
      setEditData({
        label: selectedNode.data.label,
        description: selectedNode.data.description || '',
        category: selectedNode.data.category || 'default',
      });
      setIsEditing(true);
    }
  };

  const handleEditSave = () => {
    if (selectedNode) {
      onUpdateNode(selectedNode.id, {
        ...selectedNode.data,
        ...editData,
      });
      setIsEditing(false);
    }
  };

  const addFileToNewNode = () => {
    if (newFile.trim()) {
      setNewNodeData(prev => ({
        ...prev,
        files: [...prev.files, newFile.trim()]
      }));
      setNewFile('');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Main toolbar buttons */}
      <div className="flex flex-col items-center gap-2 p-2 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl">
        {/* Add Node Button */}
        <button
          onClick={() => setIsAddingNode(true)}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Add Node"
        >
          <Plus size={18} />
        </button>

        {/* Edit Node Button (only when single selected) */}
        {selectedNode && !isMultiSelect && (
          <button
            onClick={handleEditStart}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit Node"
          >
            <Edit3 size={18} />
          </button>
        )}

        {/* Delete Node Button (single selection) */}
        {selectedNode && !isMultiSelect && (
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors"
            title="Delete Node"
          >
            <Trash2 size={18} />
          </button>
        )}

        <div className="h-px w-6 bg-slate-700" />

        {/* Undo Button */}
        {onUndo && (
          <button
            onClick={onUndo}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Undo"
          >
            <RotateCcw size={18} />
          </button>
        )}

        {/* Save Button */}
        {onSave && (
          <button
            onClick={onSave}
            className="p-2 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded-lg transition-colors"
            title="Save"
          >
            <Save size={18} />
          </button>
        )}
      </div>

      {/* Multi-select batch operations bar */}
      <AnimatePresence>
        {isMultiSelect && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-2.5 bg-cyan-900/60 backdrop-blur border border-cyan-600/40 rounded-xl shadow-xl"
          >
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Layers size={14} className="text-cyan-300" />
              <span className="text-xs font-medium text-cyan-200">
                {selectedNodes.length} nodes selected
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {/* Batch Change Category */}
              {onBatchUpdateCategory && (
                <button
                  onClick={() => setIsBatchCategoryOpen(true)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-slate-200 hover:bg-cyan-800/40 rounded-lg transition-colors"
                  title="Change category for all selected nodes"
                >
                  <Tag size={14} className="text-cyan-400" />
                  Change Category
                </button>
              )}
              {/* Batch Delete */}
              {onBatchDelete && (
                <button
                  onClick={() => onBatchDelete(multiSelectIds)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Delete all selected nodes"
                >
                  <Trash2 size={14} />
                  Delete {selectedNodes.length} Nodes
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Category Picker Modal */}
      <AnimatePresence>
        {isBatchCategoryOpen && isMultiSelect && onBatchUpdateCategory && (
          <motion.div
            ref={batchCategoryRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-72 max-h-[420px] flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-slate-200">
                Set Category ({selectedNodes.length} nodes)
              </h4>
              <button
                onClick={() => setIsBatchCategoryOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar space-y-1 pr-1">
              {(['Code', 'System', undefined] as const).map(group => {
                const groupCats = categories.filter(c => c.group === group);
                if (groupCats.length === 0) return null;
                return (
                  <div key={group || 'other'}>
                    {group && (
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 pt-2 pb-1">{group}</div>
                    )}
                    {groupCats.map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => {
                          onBatchUpdateCategory(multiSelectIds, cat.value);
                          setIsBatchCategoryOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-cyan-800/30 hover:text-cyan-200 rounded-lg transition-colors"
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Node Modal */}
      <AnimatePresence>
        {isAddingNode && (
          <motion.div
            ref={addNodeRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-72"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-slate-200">Add New Node</h4>
              <button
                onClick={() => setIsAddingNode(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Label</label>
                <input
                  value={newNodeData.label}
                  onChange={(e) => setNewNodeData(prev => ({ ...prev, label: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="Node name"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <input
                  value={newNodeData.description}
                  onChange={(e) => setNewNodeData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="Brief description"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Category</label>
                <select
                  value={newNodeData.category}
                  onChange={(e) => setNewNodeData(prev => ({ ...prev, category: e.target.value as NodeCategory }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Files (optional)</label>
                <div className="flex gap-2">
                  <input
                    value={newFile}
                    onChange={(e) => setNewFile(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addFileToNewNode()}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="path/to/file.ts"
                  />
                  <button
                    onClick={addFileToNewNode}
                    className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs"
                  >
                    Add
                  </button>
                </div>
                {newNodeData.files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {newNodeData.files.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                        <FileCode size={10} />
                        <span className="truncate flex-1">{file}</span>
                        <button
                          onClick={() => setNewNodeData(prev => ({
                            ...prev,
                            files: prev.files.filter((_, idx) => idx !== i)
                          }))}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddNode}
                disabled={!newNodeData.label.trim()}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add Node
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Node Modal */}
      <AnimatePresence>
        {isEditing && selectedNode && (
          <motion.div
            ref={editNodeRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-72"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-slate-200">Edit Node</h4>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Label</label>
                <input
                  value={editData.label}
                  onChange={(e) => setEditData(prev => ({ ...prev, label: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <input
                  value={editData.description}
                  onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Category</label>
                <select
                  value={editData.category}
                  onChange={(e) => setEditData(prev => ({ ...prev, category: e.target.value as NodeCategory }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Check size={14} />
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
