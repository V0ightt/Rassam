'use client';

import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  FileCheck2,
  GitBranch,
  Pencil,
} from 'lucide-react';
import type { Edge, Node } from 'reactflow';

import { SourceLocationLink } from '@/components/evidence/SourceLocationLink';
import type { EvidenceRef } from '@/lib/contracts';
import {
  sourceLocationFromEvidence,
  type SourceLocation,
  type SourceLocationNavigationHandler,
} from '@/lib/source-location';
import { cn } from '@/lib/utils';
import type { EdgeData, NodeData } from '@/types';

export interface EvidenceNodeData extends NodeData {
  evidence?: EvidenceRef[];
  confidence?: 'low' | 'medium' | 'high';
  analysisLevel?: 'semantic' | 'structural' | 'manifest';
  provenance?: string;
}

export interface EvidenceEdgeData extends EdgeData {
  evidence?: EvidenceRef[];
  confidence?: 'low' | 'medium' | 'high';
}

export type EvidenceNode = Node<EvidenceNodeData>;
export type EvidenceEdge = Edge<EvidenceEdgeData>;
export type GraphElementTarget = { kind: 'node' | 'edge'; id: string };
export type EvidenceInspectorSelection = GraphElementTarget | null;

const INITIAL_LIST_ROWS = 50;

export interface EvidenceInspectorSharedProps {
  nodes: readonly EvidenceNode[];
  edges: readonly EvidenceEdge[];
  onNavigateToSource?: SourceLocationNavigationHandler;
  onRevealGraphElement?: (target: GraphElementTarget) => void;
}

export interface NodeEvidenceInspectorProps extends EvidenceInspectorSharedProps {
  node: EvidenceNode;
  onEditNode?: (nodeId: string) => void;
}

export interface EdgeEvidenceInspectorProps extends EvidenceInspectorSharedProps {
  edge: EvidenceEdge;
  onEditEdge?: (edgeId: string) => void;
}

export interface EvidenceInspectorProps extends EvidenceInspectorSharedProps {
  selection: EvidenceInspectorSelection;
  onEditNode?: (nodeId: string) => void;
  onEditEdge?: (edgeId: string) => void;
  className?: string;
}

function humanize(value: string | undefined): string {
  if (!value) return 'Not specified';
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nodeLabel(nodes: readonly EvidenceNode[], id: string): string {
  return nodes.find((node) => node.id === id)?.data.label ?? id;
}

function Metadata({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-800 py-3 text-xs">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-slate-400">{item.label}</dt>
          <dd className="mt-0.5 truncate text-slate-200">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InspectorHeading({
  headingId,
  icon,
  title,
  subtitle,
  editLabel,
  onEdit,
}: {
  headingId: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  editLabel?: string;
  onEdit?: () => void;
}) {
  return (
    <header className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-cyan-800/70 bg-cyan-950/40 text-cyan-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-400">{subtitle}</p>
        <h2 id={headingId} className="truncate text-sm font-semibold text-slate-100" title={title}>{title}</h2>
      </div>
      {onEdit && editLabel && (
        <button
          type="button"
          onClick={onEdit}
          className="grid min-h-10 min-w-10 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          aria-label={editLabel}
        >
          <Pencil size={15} aria-hidden="true" />
        </button>
      )}
    </header>
  );
}

function SectionHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3 className="flex items-center justify-between text-xs font-semibold text-slate-200">
      <span>{children}</span>
      {count !== undefined && <span className="font-mono font-normal text-slate-400">{count}</span>}
    </h3>
  );
}

function EvidenceList({
  evidence,
  onNavigate,
}: {
  evidence: readonly EvidenceRef[];
  onNavigate?: SourceLocationNavigationHandler;
}) {
  const [visibleRows, setVisibleRows] = useState(INITIAL_LIST_ROWS);
  if (evidence.length === 0) {
    return <p className="mt-2 text-xs leading-5 text-slate-400">No source evidence is attached.</p>;
  }

  const visibleEvidence = evidence.slice(0, visibleRows);
  const remaining = evidence.length - visibleEvidence.length;
  const nextCount = Math.min(INITIAL_LIST_ROWS, remaining);
  return (
    <>
      <ul className="mt-1 space-y-0.5" aria-label="Source evidence">
        {visibleEvidence.map((item, index) => (
          <li key={`${item.path}:${item.startLine ?? ''}:${item.endLine ?? ''}:${item.blobSha}:${index}`}>
            <SourceLocationLink
              location={sourceLocationFromEvidence(item)}
              onNavigate={onNavigate}
              variant="row"
            />
            <p className="px-2 pb-1 text-[11px] text-slate-400">
              {humanize(item.kind)} evidence, {item.confidence} confidence
            </p>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleRows((value) => Math.min(value + INITIAL_LIST_ROWS, evidence.length))}
          className="mt-1 min-h-10 w-full rounded-md px-2 text-left text-xs text-cyan-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Show {nextCount} more reference{nextCount === 1 ? '' : 's'}
        </button>
      )}
    </>
  );
}

function RelationshipList({
  edges,
  nodes,
  nodeId,
  direction,
  onReveal,
}: {
  edges: readonly EvidenceEdge[];
  nodes: readonly EvidenceNode[];
  nodeId: string;
  direction: 'incoming' | 'outgoing';
  onReveal?: (target: GraphElementTarget) => void;
}) {
  if (edges.length === 0) {
    return <p className="mt-2 text-xs leading-5 text-slate-400">No {direction} relationships.</p>;
  }

  return (
    <ul className="mt-1 space-y-1" aria-label={`${humanize(direction)} relationships`}>
      {edges.map((edge) => {
        const peerId = edge.source === nodeId ? edge.target : edge.source;
        const label = edge.data?.label || edge.label || edge.data?.type || 'relationship';
        const content = (
          <>
            {direction === 'incoming'
              ? <ArrowDownLeft size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
              : <ArrowUpRight size={14} className="shrink-0 text-slate-400" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-slate-200">{nodeLabel(nodes, peerId)}</span>
              <span className="block truncate text-[11px] text-slate-400">{String(label)}</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">{edge.data?.evidence?.length ?? 0} refs</span>
          </>
        );

        return (
          <li key={edge.id}>
            {onReveal ? (
              <button
                type="button"
                onClick={() => onReveal({ kind: 'edge', id: edge.id })}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                aria-label={`Reveal ${String(label)} relationship with ${nodeLabel(nodes, peerId)}`}
              >
                {content}
              </button>
            ) : (
              <div className="flex min-h-10 items-center gap-2 px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FileList({
  files,
  evidence,
  onNavigate,
}: {
  files: readonly string[];
  evidence: readonly EvidenceRef[];
  onNavigate?: SourceLocationNavigationHandler;
}) {
  const [visibleRows, setVisibleRows] = useState(INITIAL_LIST_ROWS);
  if (files.length === 0) {
    return <p className="mt-2 text-xs leading-5 text-slate-400">This element has no associated files.</p>;
  }

  const evidenceByPath = new Map(evidence.map((item) => [item.path, item]));
  const visibleFiles = files.slice(0, visibleRows);
  const remaining = files.length - visibleFiles.length;
  const nextCount = Math.min(INITIAL_LIST_ROWS, remaining);
  return (
    <>
      <ul className="mt-1 space-y-0.5" aria-label="Associated files">
        {visibleFiles.map((path) => {
          const item = evidenceByPath.get(path);
          const location: SourceLocation = item ? sourceLocationFromEvidence(item) : { path };
          return (
            <li key={path}>
              <SourceLocationLink location={location} onNavigate={onNavigate} variant="row" />
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleRows((value) => Math.min(value + INITIAL_LIST_ROWS, files.length))}
          className="mt-1 min-h-10 w-full rounded-md px-2 text-left text-xs text-cyan-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Show {nextCount} more file{nextCount === 1 ? '' : 's'}
        </button>
      )}
    </>
  );
}

export function NodeEvidenceInspector({
  node,
  nodes,
  edges,
  onNavigateToSource,
  onRevealGraphElement,
  onEditNode,
}: NodeEvidenceInspectorProps) {
  const evidence = node.data.evidence ?? [];
  const incoming = edges.filter((edge) => edge.target === node.id || (edge.data?.direction === 'two-way' && edge.source === node.id));
  const outgoing = edges.filter((edge) => edge.source === node.id || (edge.data?.direction === 'two-way' && edge.target === node.id));
  const provenance = node.data.provenance || (node.data.analysisLevel ? `${humanize(node.data.analysisLevel)} analysis` : 'Not recorded');

  return (
    <section aria-labelledby={`node-inspector-${node.id}`}>
      <InspectorHeading
        headingId={`node-inspector-${node.id}`}
        icon={<Box size={16} aria-hidden="true" />}
        title={node.data.label}
        subtitle="Component"
        editLabel={`Edit ${node.data.label}`}
        onEdit={onEditNode ? () => onEditNode(node.id) : undefined}
      />
      <div className="space-y-5 px-4 py-4">
        <p className="text-xs leading-5 text-slate-300">
          {node.data.description || 'No description is available for this component.'}
        </p>
        <Metadata items={[
          { label: 'Category', value: humanize(node.data.category) },
          { label: 'Confidence', value: humanize(node.data.confidence) },
          { label: 'Provenance', value: provenance },
          { label: 'Complexity', value: humanize(node.data.complexity) },
        ]} />

        <section aria-labelledby={`node-files-${node.id}`}>
          <SectionHeading count={node.data.files.length}><span id={`node-files-${node.id}`}>Files</span></SectionHeading>
          <FileList key={node.id} files={node.data.files} evidence={evidence} onNavigate={onNavigateToSource} />
        </section>

        <section aria-labelledby={`node-evidence-${node.id}`}>
          <SectionHeading count={evidence.length}><span id={`node-evidence-${node.id}`}>Evidence</span></SectionHeading>
          <EvidenceList key={node.id} evidence={evidence} onNavigate={onNavigateToSource} />
        </section>

        <section aria-labelledby={`node-outgoing-${node.id}`}>
          <SectionHeading count={outgoing.length}><span id={`node-outgoing-${node.id}`}>Outgoing</span></SectionHeading>
          <RelationshipList edges={outgoing} nodes={nodes} nodeId={node.id} direction="outgoing" onReveal={onRevealGraphElement} />
        </section>

        <section aria-labelledby={`node-incoming-${node.id}`}>
          <SectionHeading count={incoming.length}><span id={`node-incoming-${node.id}`}>Incoming</span></SectionHeading>
          <RelationshipList edges={incoming} nodes={nodes} nodeId={node.id} direction="incoming" onReveal={onRevealGraphElement} />
        </section>
      </div>
    </section>
  );
}

export function EdgeEvidenceInspector({
  edge,
  nodes,
  onNavigateToSource,
  onRevealGraphElement,
  onEditEdge,
}: EdgeEvidenceInspectorProps) {
  const evidence = edge.data?.evidence ?? [];
  const sourceLabel = nodeLabel(nodes, edge.source);
  const targetLabel = nodeLabel(nodes, edge.target);
  const label = String(edge.data?.label || edge.label || edge.data?.type || 'Relationship');

  return (
    <section aria-labelledby={`edge-inspector-${edge.id}`}>
      <InspectorHeading
        headingId={`edge-inspector-${edge.id}`}
        icon={<GitBranch size={16} aria-hidden="true" />}
        title={label}
        subtitle="Relationship"
        editLabel={`Edit ${label} relationship`}
        onEdit={onEditEdge ? () => onEditEdge(edge.id) : undefined}
      />
      <div className="space-y-5 px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
          {onRevealGraphElement ? (
            <button
              type="button"
              onClick={() => onRevealGraphElement({ kind: 'node', id: edge.source })}
              className="min-h-10 truncate rounded-md px-2 text-left text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label={`Reveal source node ${sourceLabel}`}
            >
              {sourceLabel}
            </button>
          ) : <span className="truncate px-2 text-slate-200">{sourceLabel}</span>}
          <ArrowUpRight size={15} className="text-cyan-400" aria-hidden="true" />
          {onRevealGraphElement ? (
            <button
              type="button"
              onClick={() => onRevealGraphElement({ kind: 'node', id: edge.target })}
              className="min-h-10 truncate rounded-md px-2 text-right text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label={`Reveal target node ${targetLabel}`}
            >
              {targetLabel}
            </button>
          ) : <span className="truncate px-2 text-right text-slate-200">{targetLabel}</span>}
        </div>

        <Metadata items={[
          { label: 'Type', value: humanize(edge.data?.type) },
          { label: 'Direction', value: humanize(edge.data?.direction || 'one-way') },
          { label: 'Confidence', value: humanize(edge.data?.confidence) },
          { label: 'Evidence', value: `${evidence.length} reference${evidence.length === 1 ? '' : 's'}` },
        ]} />

        <section aria-labelledby={`edge-evidence-${edge.id}`}>
          <SectionHeading count={evidence.length}><span id={`edge-evidence-${edge.id}`}>Source evidence</span></SectionHeading>
          <EvidenceList key={edge.id} evidence={evidence} onNavigate={onNavigateToSource} />
        </section>
      </div>
    </section>
  );
}

export default function EvidenceInspector({
  selection,
  nodes,
  edges,
  onNavigateToSource,
  onRevealGraphElement,
  onEditNode,
  onEditEdge,
  className,
}: EvidenceInspectorProps) {
  let content: React.ReactNode;

  if (!selection) {
    content = (
      <div className="grid min-h-48 place-items-center px-6 py-10 text-center">
        <div>
          <FileCheck2 className="mx-auto text-slate-600" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-medium text-slate-300">Inspect source evidence</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">Select a component or relationship on the map.</p>
        </div>
      </div>
    );
  } else if (selection.kind === 'node') {
    const node = nodes.find((item) => item.id === selection.id);
    content = node ? (
      <NodeEvidenceInspector
        node={node}
        nodes={nodes}
        edges={edges}
        onNavigateToSource={onNavigateToSource}
        onRevealGraphElement={onRevealGraphElement}
        onEditNode={onEditNode}
      />
    ) : (
      <p role="status" className="px-4 py-5 text-xs text-amber-300">The selected component is no longer available.</p>
    );
  } else {
    const edge = edges.find((item) => item.id === selection.id);
    content = edge ? (
      <EdgeEvidenceInspector
        edge={edge}
        nodes={nodes}
        edges={edges}
        onNavigateToSource={onNavigateToSource}
        onRevealGraphElement={onRevealGraphElement}
        onEditEdge={onEditEdge}
      />
    ) : (
      <p role="status" className="px-4 py-5 text-xs text-amber-300">The selected relationship is no longer available.</p>
    );
  }

  return (
    <aside
      aria-label="Evidence inspector"
      className={cn('h-full overflow-y-auto border-l border-slate-800 bg-slate-950 text-slate-200', className)}
    >
      {content}
    </aside>
  );
}
