'use client';

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, FileText, ListTree, Search, X } from 'lucide-react';
import type { Edge, Node } from 'reactflow';

import type { GraphElementTarget } from '@/components/evidence/EvidenceInspector';
import type { EdgeData, NodeData } from '@/types';

interface GraphOutlineProps {
  nodes: Node<NodeData>[];
  edges: Edge<EdgeData>[];
  onReveal: (target: GraphElementTarget) => void;
}

function edgeLabel(edge: Edge<EdgeData>, nodeLabels: Map<string, string>): string {
  const source = nodeLabels.get(edge.source) ?? edge.source;
  const target = nodeLabels.get(edge.target) ?? edge.target;
  const relation = edge.data?.label || edge.data?.type || 'relationship';
  return `${source} to ${target}: ${relation}`;
}

/** Keyboard and screen-reader alternative to direct React Flow navigation. */
export default function GraphOutline({ nodes, edges, onReveal }: GraphOutlineProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'nodes' | 'relationships'>('nodes');

  const nodeLabels = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.data.label])),
    [nodes],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleNodes = useMemo(() => nodes.filter((node) => {
    if (!normalizedQuery) return true;
    return [node.data.label, node.data.description, node.data.category, ...node.data.files]
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  }), [nodes, normalizedQuery]);
  const visibleEdges = useMemo(() => edges.filter((edge) => (
    !normalizedQuery || edgeLabel(edge, nodeLabels).toLowerCase().includes(normalizedQuery)
  )), [edges, nodeLabels, normalizedQuery]);

  const reveal = (target: GraphElementTarget) => {
    onReveal(target);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex min-h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 shadow-lg hover:border-cyan-500/60 hover:text-cyan-200"
          aria-label="Open accessible graph outline"
        >
          <ListTree size={15} aria-hidden="true" />
          Graph outline
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex max-h-[min(760px,calc(100vh-2rem))] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <header className="flex items-start gap-3 border-b border-slate-800 p-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold text-slate-100">Graph outline</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-slate-400">
                Browse every component and relationship without using the visual canvas.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close graph outline" className="grid min-h-10 min-w-10 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="space-y-3 border-b border-slate-800 p-4">
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 focus-within:border-cyan-500">
              <Search size={15} className="text-slate-500" aria-hidden="true" />
              <span className="sr-only">Filter graph outline</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by component, category, file, or relationship"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>
            <div role="tablist" aria-label="Graph outline view" className="flex gap-1 rounded-lg bg-slate-950 p-1">
              {(['nodes', 'relationships'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  aria-selected={view === candidate}
                  onClick={() => setView(candidate)}
                  className={`min-h-10 flex-1 rounded-md px-3 text-xs font-medium ${view === candidate ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  {candidate === 'nodes' ? `Components (${visibleNodes.length})` : `Relationships (${visibleEdges.length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3" role="tabpanel">
            {view === 'nodes' ? (
              <ul className="space-y-1" aria-label="Graph components">
                {visibleNodes.map((node) => {
                  const relationCount = edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => reveal({ kind: 'node', id: node.id })}
                        className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-cyan-500/30 hover:bg-slate-800 focus-visible:border-cyan-400"
                      >
                        <FileText size={16} className="shrink-0 text-cyan-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-100">{node.data.label}</span>
                          <span className="block truncate text-xs text-slate-400">
                            {node.data.category} · {node.data.files.length} files · {relationCount} relationships
                          </span>
                        </span>
                        <ArrowRight size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-1" aria-label="Graph relationships">
                {visibleEdges.map((edge) => (
                  <li key={edge.id}>
                    <button
                      type="button"
                      onClick={() => reveal({ kind: 'edge', id: edge.id })}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-cyan-500/30 hover:bg-slate-800 focus-visible:border-cyan-400"
                    >
                      <ArrowRight size={16} className="shrink-0 text-cyan-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-100">{edgeLabel(edge, nodeLabels)}</span>
                        <span className="block text-xs text-slate-400">
                          {edge.data?.confidence ? `${edge.data.confidence} confidence` : 'Confidence not recorded'}
                          {' · '}{edge.data?.evidence?.length ?? 0} evidence references
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {((view === 'nodes' && visibleNodes.length === 0) || (view === 'relationships' && visibleEdges.length === 0)) && (
              <p className="p-8 text-center text-sm text-slate-400">No matching graph items.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
