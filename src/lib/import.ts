import type { RepoDetails } from '@/types';

export interface ImportedProjectData {
  nodes: any[];
  edges: any[];
  repoDetails: RepoDetails | null;
  name: string;
}

interface ImportJson {
  metadata?: {
    version?: string;
    repo?: { owner: string; repo: string } | null;
    exportedAt?: string;
  };
  nodes?: any[];
  edges?: any[];
}

/**
 * Generate a fresh ID for imported nodes/edges to avoid React Flow key collisions.
 */
const freshId = () => `imp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Parse and validate a JSON string exported by ExportPanel.
 * Returns sanitised nodes, edges, repoDetails and a derived project name.
 * Throws a descriptive Error on any validation failure.
 */
export function parseAndValidateImportJson(
  raw: string,
  fileName?: string,
): ImportedProjectData {
  // ── 1. Parse ──
  let json: ImportJson;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('The file does not contain valid JSON.');
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Expected a JSON object with "nodes" and "edges" arrays.');
  }

  // ── 2. Version check ──
  const version = json.metadata?.version;
  if (version && version !== '1.0') {
    throw new Error(
      `Unsupported export version "${version}". Only version 1.0 is supported.`,
    );
  }

  // ── 3. Validate nodes ──
  if (!Array.isArray(json.nodes)) {
    throw new Error('Missing or invalid "nodes" array in the JSON file.');
  }

  // Build an old-id → new-id map so edges can be remapped
  const idMap = new Map<string, string>();

  const nodes = json.nodes.map((n: any, index: number) => {
    if (!n || typeof n !== 'object') {
      throw new Error(`Node at index ${index} is not a valid object.`);
    }

    const oldId = n.id ?? `node-${index}`;
    const newId = freshId();
    idMap.set(String(oldId), newId);

    // Ensure position exists
    const position = n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
      ? { x: n.position.x, y: n.position.y }
      : { x: index * 300, y: index * 150 };

    // Ensure data.label exists
    const data = n.data && typeof n.data === 'object' ? { ...n.data } : {};
    if (!data.label) {
      data.label = `Node ${index + 1}`;
    }
    // Defaults for optional fields
    data.files = Array.isArray(data.files) ? data.files : [];
    data.category = data.category || 'default';
    data.complexity = data.complexity || 'medium';
    data.dependencies = Array.isArray(data.dependencies) ? data.dependencies : [];
    data.exports = Array.isArray(data.exports) ? data.exports : [];
    data.description = data.description || '';

    return {
      id: newId,
      type: n.type || 'enhanced',
      position,
      data,
    };
  });

  // ── 4. Validate edges ──
  if (!Array.isArray(json.edges)) {
    throw new Error('Missing or invalid "edges" array in the JSON file.');
  }

  const edges = json.edges
    .map((e: any, index: number) => {
      if (!e || typeof e !== 'object') return null;

      const sourceId = idMap.get(String(e.source));
      const targetId = idMap.get(String(e.target));

      // Drop edges that reference missing nodes
      if (!sourceId || !targetId) return null;

      return {
        id: freshId(),
        source: sourceId,
        target: targetId,
        type: e.type || 'custom',
        animated: e.animated ?? false,
        data: e.data && typeof e.data === 'object' ? { ...e.data } : {},
      };
    })
    .filter(Boolean);

  // ── 5. Derive repoDetails ──
  let repoDetails: RepoDetails | null = null;
  const repo = json.metadata?.repo;
  if (repo && repo.owner && repo.repo) {
    const totalFiles = nodes.reduce(
      (sum: number, n: any) => sum + (n.data?.files?.length || 0),
      0,
    );
    repoDetails = {
      owner: repo.owner,
      repo: repo.repo,
      fileCount: totalFiles || undefined,
    };
  }

  // ── 6. Derive project name ──
  const name =
    repoDetails
      ? `${repoDetails.owner}/${repoDetails.repo}`
      : fileName
        ? fileName.replace(/\.json$/i, '')
        : 'Imported Project';

  return { nodes, edges, repoDetails, name };
}
