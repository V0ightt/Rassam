import type { FlowEdge, FlowNode, NodeCategory, RepoFileEntry } from '@/types';

export type WorkspaceSearchResultKind = 'node' | 'file' | 'relationship' | 'category';
export type WorkspaceSearchFilter = WorkspaceSearchResultKind | 'all';

interface WorkspaceSearchResultBase {
  id: string;
  kind: WorkspaceSearchResultKind;
  title: string;
  subtitle: string;
  keywords: string[];
}

export interface WorkspaceNodeSearchResult extends WorkspaceSearchResultBase {
  kind: 'node';
  nodeId: string;
  category: NodeCategory;
  fileCount: number;
}

export interface WorkspaceFileSearchResult extends WorkspaceSearchResultBase {
  kind: 'file';
  path: string;
  blobSha?: string;
  ownerNodeIds: string[];
}

export interface WorkspaceRelationshipSearchResult extends WorkspaceSearchResultBase {
  kind: 'relationship';
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface WorkspaceCategorySearchResult extends WorkspaceSearchResultBase {
  kind: 'category';
  category: NodeCategory;
  nodeIds: string[];
}

export type WorkspaceSearchResult =
  | WorkspaceNodeSearchResult
  | WorkspaceFileSearchResult
  | WorkspaceRelationshipSearchResult
  | WorkspaceCategorySearchResult;

interface IndexedWorkspaceSearchResult {
  result: WorkspaceSearchResult;
  normalizedTitle: string;
  normalizedSubtitle: string;
  normalizedSearchText: string;
}

export interface WorkspaceSearchIndex {
  entries: IndexedWorkspaceSearchResult[];
}

export interface WorkspaceSearchCounts {
  all: number;
  node: number;
  file: number;
  relationship: number;
  category: number;
}

export interface WorkspaceSearchResponse {
  results: WorkspaceSearchResult[];
  counts: WorkspaceSearchCounts;
  effectiveFilter: WorkspaceSearchFilter;
  normalizedQuery: string;
}

export interface WorkspaceTransientMatches {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  filePaths: Set<string>;
  categories: Set<NodeCategory>;
}

const RESULT_KIND_ORDER: Record<WorkspaceSearchResultKind, number> = {
  node: 0,
  relationship: 1,
  file: 2,
  category: 3,
};

const FILTER_ALIASES: Record<string, WorkspaceSearchResultKind> = {
  node: 'node',
  nodes: 'node',
  file: 'file',
  files: 'file',
  edge: 'relationship',
  edges: 'relationship',
  relation: 'relationship',
  relations: 'relationship',
  relationship: 'relationship',
  relationships: 'relationship',
  category: 'category',
  categories: 'category',
};

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[\\/_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeCategory(category: string): string {
  return category
    .split('-')
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' ');
}

function basename(path: string): string {
  return path.split('/').at(-1) || path;
}

function dirname(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Repository root';
}

function toIndexed(result: WorkspaceSearchResult): IndexedWorkspaceSearchResult {
  return {
    result,
    normalizedTitle: normalize(result.title),
    normalizedSubtitle: normalize(result.subtitle),
    normalizedSearchText: normalize([
      result.title,
      result.subtitle,
      ...result.keywords,
    ].join(' ')),
  };
}

/**
 * Builds a read-only index from canonical graph and repository data. The
 * returned entries contain no React Flow styling or selection state, so search
 * can never leak into a persisted GraphDocument.
 */
export function buildWorkspaceSearchIndex({
  nodes,
  edges,
  files = [],
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  files?: RepoFileEntry[];
}): WorkspaceSearchIndex {
  const nodeLabels = new Map(nodes.map((node) => [node.id, node.data.label || node.id]));
  const ownersByPath = new Map<string, Set<string>>();

  for (const node of nodes) {
    for (const path of node.data.files || []) {
      const owners = ownersByPath.get(path) || new Set<string>();
      owners.add(node.id);
      ownersByPath.set(path, owners);
    }
  }

  const entries: IndexedWorkspaceSearchResult[] = [];

  for (const node of nodes) {
    entries.push(toIndexed({
      id: `node:${node.id}`,
      kind: 'node',
      title: node.data.label || 'Untitled node',
      subtitle: [humanizeCategory(node.data.category), node.data.description]
        .filter(Boolean)
        .join(' · '),
      keywords: [
        node.id,
        node.data.category,
        ...(node.data.files || []),
        ...(node.data.dependencies || []),
        ...(node.data.exports || []),
      ],
      nodeId: node.id,
      category: node.data.category,
      fileCount: node.data.files?.length || 0,
    }));
  }

  const repositoryFiles = new Map<string, RepoFileEntry>();
  for (const file of files) {
    if (file.type === 'blob') repositoryFiles.set(file.path, file);
  }
  for (const path of ownersByPath.keys()) {
    if (!repositoryFiles.has(path)) repositoryFiles.set(path, { path, type: 'blob' });
  }

  for (const [path, file] of repositoryFiles) {
    const ownerNodeIds = [...(ownersByPath.get(path) || [])].sort();
    const ownerLabels = ownerNodeIds.map((id) => nodeLabels.get(id) || id);
    entries.push(toIndexed({
      id: `file:${path}`,
      kind: 'file',
      title: basename(path),
      subtitle: dirname(path),
      keywords: [path, file.sha || '', ...ownerLabels],
      path,
      blobSha: file.sha,
      ownerNodeIds,
    }));
  }

  for (const edge of edges) {
    const sourceLabel = nodeLabels.get(edge.source) || edge.source;
    const targetLabel = nodeLabels.get(edge.target) || edge.target;
    const relationLabel = edge.data?.label || edge.label?.toString() || edge.data?.type || 'relationship';
    entries.push(toIndexed({
      id: `relationship:${edge.id}`,
      kind: 'relationship',
      title: `${sourceLabel} → ${targetLabel}`,
      subtitle: relationLabel,
      keywords: [
        edge.id,
        edge.data?.type || '',
        edge.data?.direction || '',
        edge.data?.confidence || '',
        ...(edge.data?.evidence || []).map((evidence) => evidence.path),
      ],
      edgeId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
    }));
  }

  const nodesByCategory = new Map<NodeCategory, string[]>();
  for (const node of nodes) {
    const matchingNodes = nodesByCategory.get(node.data.category) || [];
    matchingNodes.push(node.id);
    nodesByCategory.set(node.data.category, matchingNodes);
  }
  for (const [category, nodeIds] of nodesByCategory) {
    entries.push(toIndexed({
      id: `category:${category}`,
      kind: 'category',
      title: humanizeCategory(category),
      subtitle: `${nodeIds.length} ${nodeIds.length === 1 ? 'node' : 'nodes'}`,
      keywords: [category, ...nodeIds.map((id) => nodeLabels.get(id) || id)],
      category,
      nodeIds: [...nodeIds].sort(),
    }));
  }

  return { entries };
}

function parseQuery(query: string, requestedFilter: WorkspaceSearchFilter) {
  const trimmed = query.trim();
  const prefixMatch = trimmed.match(/^([a-z]+):\s*/i);
  const prefixFilter = prefixMatch ? FILTER_ALIASES[prefixMatch[1].toLocaleLowerCase()] : undefined;
  const effectiveFilter = prefixFilter || requestedFilter;
  const withoutPrefix = prefixFilter ? trimmed.slice(prefixMatch?.[0].length || 0) : trimmed;
  const normalizedQuery = normalize(withoutPrefix);
  return {
    effectiveFilter,
    normalizedQuery,
    tokens: normalizedQuery ? normalizedQuery.split(' ') : [],
  };
}

function scoreEntry(entry: IndexedWorkspaceSearchResult, tokens: string[]): number | null {
  if (tokens.length === 0) return 0;
  if (!tokens.every((token) => entry.normalizedSearchText.includes(token))) return null;

  const fullQuery = tokens.join(' ');
  let score = 0;
  if (entry.normalizedTitle === fullQuery) score += 1_000;
  else if (entry.normalizedTitle.startsWith(fullQuery)) score += 700;
  else if (entry.normalizedTitle.split(' ').some((word) => word.startsWith(fullQuery))) score += 520;
  else if (entry.normalizedTitle.includes(fullQuery)) score += 420;
  else if (entry.normalizedSubtitle.includes(fullQuery)) score += 240;

  for (const token of tokens) {
    if (entry.normalizedTitle.split(' ').some((word) => word.startsWith(token))) score += 80;
    else if (entry.normalizedTitle.includes(token)) score += 55;
    else if (entry.normalizedSubtitle.includes(token)) score += 30;
    else score += 10;
  }

  return score - Math.min(entry.normalizedTitle.length, 80) / 100;
}

/** Searches an existing index with deterministic ranking and optional kind prefixes. */
export function searchWorkspace(
  index: WorkspaceSearchIndex,
  query: string,
  requestedFilter: WorkspaceSearchFilter = 'all',
): WorkspaceSearchResponse {
  const { effectiveFilter, normalizedQuery, tokens } = parseQuery(query, requestedFilter);
  const ranked = index.entries
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((candidate): candidate is { entry: IndexedWorkspaceSearchResult; score: number } => candidate.score !== null);

  const counts: WorkspaceSearchCounts = {
    all: ranked.length,
    node: 0,
    file: 0,
    relationship: 0,
    category: 0,
  };
  for (const candidate of ranked) counts[candidate.entry.result.kind] += 1;

  const results = ranked
    .filter(({ entry }) => effectiveFilter === 'all' || entry.result.kind === effectiveFilter)
    .sort((a, b) => (
      b.score - a.score
      || RESULT_KIND_ORDER[a.entry.result.kind] - RESULT_KIND_ORDER[b.entry.result.kind]
      || a.entry.result.title.localeCompare(b.entry.result.title)
      || a.entry.result.id.localeCompare(b.entry.result.id)
    ))
    .map(({ entry }) => entry.result);

  return { results, counts, effectiveFilter, normalizedQuery };
}

/** Derives highlight targets without modifying canonical node or edge objects. */
export function getWorkspaceTransientMatches(results: WorkspaceSearchResult[]): WorkspaceTransientMatches {
  const matches: WorkspaceTransientMatches = {
    nodeIds: new Set(),
    edgeIds: new Set(),
    filePaths: new Set(),
    categories: new Set(),
  };

  for (const result of results) {
    if (result.kind === 'node') {
      matches.nodeIds.add(result.nodeId);
    } else if (result.kind === 'file') {
      matches.filePaths.add(result.path);
      result.ownerNodeIds.forEach((id) => matches.nodeIds.add(id));
    } else if (result.kind === 'relationship') {
      matches.edgeIds.add(result.edgeId);
      matches.nodeIds.add(result.sourceNodeId);
      matches.nodeIds.add(result.targetNodeId);
    } else {
      matches.categories.add(result.category);
      result.nodeIds.forEach((id) => matches.nodeIds.add(id));
    }
  }

  return matches;
}

/** Returns one-hop graph neighbors for a transient isolate-neighbors view. */
export function getNeighborNodeIds(
  nodeId: string,
  edges: Pick<FlowEdge, 'source' | 'target'>[],
  includeSelf = true,
): Set<string> {
  const neighbors = new Set<string>();
  if (includeSelf) neighbors.add(nodeId);
  for (const edge of edges) {
    if (edge.source === nodeId) neighbors.add(edge.target);
    if (edge.target === nodeId) neighbors.add(edge.source);
  }
  return neighbors;
}
