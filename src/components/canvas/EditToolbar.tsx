'use client';

import { memo, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Node as ReactFlowNode } from 'reactflow';
import {
  Check,
  Edit3,
  FileCode,
  Layers,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import type { NodeCategory, NodeData } from '@/types';

interface EditToolbarProps {
  selectedNode: ReactFlowNode<NodeData> | null;
  selectedNodes?: ReactFlowNode<NodeData>[];
  onAddNode: (nodeData: NodeData) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, data: Partial<NodeData>) => void;
  onBatchDelete?: (nodeIds: string[]) => void;
  onBatchUpdateCategory?: (nodeIds: string[], category: NodeCategory) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
}

const categories: { value: NodeCategory; label: string; group: 'Code' | 'System' | 'Other' }[] = [
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
  { value: 'default', label: 'Other', group: 'Other' },
];

const iconButtonClass = 'grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-slate-700 hover:text-white';
const inputClass = 'min-h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';

function CategoryOptions() {
  return <>{(['Code', 'System', 'Other'] as const).map((group) => (
    <optgroup key={group} label={group}>
      {categories.filter((category) => category.group === group).map((category) => (
        <option key={category.value} value={category.value}>{category.label}</option>
      ))}
    </optgroup>
  ))}</>;
}

function DialogSurface({ title, description, closeLabel, children }: {
  title: string;
  description: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[calc(100vh-2rem)] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <header className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-sm font-semibold text-slate-100">{title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-slate-400">{description}</Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button type="button" aria-label={closeLabel} className="grid min-h-10 min-w-10 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100">
              <X size={16} aria-hidden="true" />
            </button>
          </Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function AddNodeControl({ onAddNode }: Pick<EditToolbarProps, 'onAddNode'>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ label: '', description: '', category: 'component' as NodeCategory, files: [] as string[] });
  const [newFile, setNewFile] = useState('');

  const addFile = () => {
    const path = newFile.trim();
    if (!path || draft.files.includes(path)) return;
    setDraft((current) => ({ ...current, files: [...current.files, path] }));
    setNewFile('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.label.trim()) return;
    onAddNode({
      label: draft.label.trim(),
      description: draft.description.trim() || 'Manually added node',
      category: draft.category,
      files: draft.files,
    });
    setDraft({ label: '', description: '', category: 'component', files: [] });
    setNewFile('');
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Add node" title="Add Node" className={iconButtonClass}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <DialogSurface title="Add node" description="Add a component to the current project. This action is undoable." closeLabel="Close add node dialog">
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <label htmlFor="add-node-label" className="mb-1 block text-xs text-slate-400">Label</label>
            <input id="add-node-label" maxLength={120} required value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className={inputClass} placeholder="Node name" />
          </div>
          <div>
            <label htmlFor="add-node-description" className="mb-1 block text-xs text-slate-400">Description</label>
            <textarea id="add-node-description" maxLength={4_000} rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} py-2`} placeholder="Brief description" />
          </div>
          <div>
            <label htmlFor="add-node-category" className="mb-1 block text-xs text-slate-400">Category</label>
            <select id="add-node-category" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as NodeCategory }))} className={inputClass}>
              <CategoryOptions />
            </select>
          </div>
          <div>
            <label htmlFor="add-node-file" className="mb-1 block text-xs text-slate-400">Files (optional)</label>
            <div className="flex gap-2">
              <input id="add-node-file" value={newFile} onChange={(event) => setNewFile(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addFile(); } }} className={`${inputClass} min-w-0 flex-1 text-xs`} placeholder="path/to/file.ts" />
              <button type="button" onClick={addFile} className="min-h-10 rounded-lg bg-slate-700 px-3 text-xs text-slate-200 hover:bg-slate-600">Add</button>
            </div>
            {draft.files.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label="Files assigned to new node">
                {draft.files.map((file) => (
                  <li key={file} className="flex min-h-10 items-center gap-2 rounded-md bg-slate-950 px-2 text-xs text-slate-400">
                    <FileCode size={12} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{file}</span>
                    <button type="button" aria-label={`Remove ${file}`} onClick={() => setDraft((current) => ({ ...current, files: current.files.filter((candidate) => candidate !== file) }))} className="grid min-h-10 min-w-10 place-items-center rounded text-red-300 hover:bg-red-950">
                      <X size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" disabled={!draft.label.trim()} className="min-h-10 w-full rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">Add node</button>
        </form>
      </DialogSurface>
    </Dialog.Root>
  );
}

function EditNodeControl({ selectedNode, onUpdateNode }: Pick<EditToolbarProps, 'selectedNode' | 'onUpdateNode'>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ label: '', description: '', category: 'default' as NodeCategory });
  const changeOpen = (next: boolean) => {
    if (next && selectedNode) setDraft({
      label: selectedNode.data.label,
      description: selectedNode.data.description || '',
      category: selectedNode.data.category || 'default',
    });
    setOpen(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedNode || !draft.label.trim()) return;
    onUpdateNode(selectedNode.id, { label: draft.label.trim(), description: draft.description.trim(), category: draft.category });
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Edit selected node" title="Edit Node" className={iconButtonClass}>
          <Edit3 size={18} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <DialogSurface title="Edit node" description="Update the selected component. This action is undoable." closeLabel="Close edit node dialog">
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <label htmlFor="edit-node-label" className="mb-1 block text-xs text-slate-400">Label</label>
            <input id="edit-node-label" required maxLength={120} value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className={inputClass} />
          </div>
          <div>
            <label htmlFor="edit-node-description" className="mb-1 block text-xs text-slate-400">Description</label>
            <textarea id="edit-node-description" rows={3} maxLength={4_000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} py-2`} />
          </div>
          <div>
            <label htmlFor="edit-node-category" className="mb-1 block text-xs text-slate-400">Category</label>
            <select id="edit-node-category" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as NodeCategory }))} className={inputClass}><CategoryOptions /></select>
          </div>
          <div className="flex gap-2 pt-1">
            <Dialog.Close asChild><button type="button" className="min-h-10 flex-1 rounded-lg bg-slate-700 text-sm text-slate-200 hover:bg-slate-600">Cancel</button></Dialog.Close>
            <button type="submit" disabled={!draft.label.trim()} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"><Check size={14} aria-hidden="true" />Save</button>
          </div>
        </form>
      </DialogSurface>
    </Dialog.Root>
  );
}

function BatchCategoryControl({ nodeIds, onApply }: { nodeIds: string[]; onApply: (ids: string[], category: NodeCategory) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-xs text-slate-200 hover:bg-cyan-800/40">
          <Tag size={14} className="text-cyan-400" aria-hidden="true" />Change category
        </button>
      </Dialog.Trigger>
      <DialogSurface title={`Set category for ${nodeIds.length} nodes`} description="Choose one category for every selected component." closeLabel="Close category dialog">
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {(['Code', 'System', 'Other'] as const).map((group) => (
            <section key={group} aria-labelledby={`batch-category-${group}`}>
              <h3 id={`batch-category-${group}`} className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group}</h3>
              {categories.filter((category) => category.group === group).map((category) => (
                <button key={category.value} type="button" onClick={() => { onApply(nodeIds, category.value); setOpen(false); }} className="min-h-10 w-full rounded-lg px-3 text-left text-sm text-slate-300 hover:bg-cyan-800/30 hover:text-cyan-200">{category.label}</button>
              ))}
            </section>
          ))}
        </div>
      </DialogSurface>
    </Dialog.Root>
  );
}

export default memo(function EditToolbar({
  selectedNode,
  selectedNodes = [],
  onAddNode,
  onDeleteNode,
  onUpdateNode,
  onBatchDelete,
  onBatchUpdateCategory,
  onUndo,
  onRedo,
  onSave,
}: EditToolbarProps) {
  const isMultiSelect = selectedNodes.length > 1;
  const selectedIds = selectedNodes.map((node) => node.id);

  return (
    <div className="flex flex-col gap-2">
      <div role="toolbar" aria-label="Canvas editing" className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 p-2 backdrop-blur">
        <AddNodeControl onAddNode={onAddNode} />
        {selectedNode && !isMultiSelect && <EditNodeControl selectedNode={selectedNode} onUpdateNode={onUpdateNode} />}
        {selectedNode && !isMultiSelect && (
          <button type="button" aria-label="Delete selected node" title="Delete Node" onClick={() => onDeleteNode(selectedNode.id)} className={`${iconButtonClass} text-red-400 hover:bg-red-900/30 hover:text-red-300`}><Trash2 size={18} aria-hidden="true" /></button>
        )}
        <span aria-hidden="true" className="h-px w-6 bg-slate-700" />
        {onUndo && <button type="button" aria-label="Undo last canvas change" title="Undo" onClick={onUndo} className={iconButtonClass}><RotateCcw size={18} aria-hidden="true" /></button>}
        {onRedo && <button type="button" aria-label="Redo last canvas change" title="Redo" onClick={onRedo} className={iconButtonClass}><RotateCw size={18} aria-hidden="true" /></button>}
        {onSave && <button type="button" aria-label="Save canvas" title="Save" onClick={onSave} className={`${iconButtonClass} text-cyan-300`}><Save size={18} aria-hidden="true" /></button>}
      </div>

      {isMultiSelect && (
        <section aria-label={`${selectedNodes.length} selected nodes`} className="rounded-xl border border-cyan-600/40 bg-cyan-950/80 p-2.5 shadow-xl backdrop-blur">
          <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-cyan-200"><Layers size={14} aria-hidden="true" />{selectedNodes.length} nodes selected</p>
          <div className="space-y-1">
            {onBatchUpdateCategory && <BatchCategoryControl nodeIds={selectedIds} onApply={onBatchUpdateCategory} />}
            {onBatchDelete && (
              <button type="button" onClick={() => onBatchDelete(selectedIds)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-xs text-red-300 hover:bg-red-900/30"><Trash2 size={14} aria-hidden="true" />Delete {selectedNodes.length} nodes</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
});
