import { plural } from "./util";
import type { GraphEdgeStatus, WorkspaceGraphView } from "./workspace";

// What a commit changed in the system design: compares two graph views
// (base and head) so the diagram can highlight added and removed parts.

export type ArchitectureEdge = WorkspaceGraphView["edges"][number];

export interface ArchitectureDiff {
  components: { added: string[]; removed: string[] };
  edges: {
    added: ArchitectureEdge[];
    removed: ArchitectureEdge[];
    statusChanged: Array<{ from: string; to: string; before: GraphEdgeStatus; after: GraphEdgeStatus }>;
  };
  /** One human sentence, e.g. "2 components added, 1 dependency removed, 1 dependency became forbidden". */
  summary: string;
  changed: boolean;
}

type Pair = { from: string; to: string };

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const edgeKey = (edge: Pair): string => `${edge.from}\u0000${edge.to}`;
const byEdge = (a: Pair, b: Pair): number => compare(a.from, b.from) || compare(a.to, b.to);

function edgeMap(view: WorkspaceGraphView): Map<string, ArchitectureEdge> {
  const map = new Map<string, ArchitectureEdge>();
  for (const edge of view.edges) if (!map.has(edgeKey(edge))) map.set(edgeKey(edge), edge);
  return map;
}

const dependencies = (count: number): string => plural(count, "dependency", "dependencies");

const STATUS_PHRASE: Record<GraphEdgeStatus, (count: number) => string> = {
  forbidden: (count) => `${dependencies(count)} became forbidden`,
  undeclared: (count) => `${dependencies(count)} became undeclared`,
  missing: (count) => `${plural(count, "declared dependency", "declared dependencies")} no longer observed`,
  declared: (count) => `${dependencies(count)} became declared`,
};
const STATUS_ORDER: GraphEdgeStatus[] = ["forbidden", "undeclared", "missing", "declared"];

/**
 * Diff two architecture views. With no baseline (`before` is null) nothing is
 * reported as changed, so a first render is not painted entirely "new".
 */
export function diffArchitecture(before: WorkspaceGraphView | null, after: WorkspaceGraphView): ArchitectureDiff {
  if (!before) {
    return {
      components: { added: [], removed: [] },
      edges: { added: [], removed: [], statusChanged: [] },
      summary: "No previous architecture to compare",
      changed: false,
    };
  }
  const beforeIds = new Set(before.components.map((component) => component.id));
  const afterIds = new Set(after.components.map((component) => component.id));
  const added = [...afterIds].filter((id) => !beforeIds.has(id)).sort(compare);
  const removed = [...beforeIds].filter((id) => !afterIds.has(id)).sort(compare);

  const beforeEdges = edgeMap(before);
  const afterEdges = edgeMap(after);
  const edgesAdded: ArchitectureEdge[] = [];
  const edgesRemoved: ArchitectureEdge[] = [];
  const statusChanged: ArchitectureDiff["edges"]["statusChanged"] = [];
  for (const [key, edge] of afterEdges) {
    const old = beforeEdges.get(key);
    if (!old) edgesAdded.push(edge);
    else if (old.status !== edge.status) statusChanged.push({ from: edge.from, to: edge.to, before: old.status, after: edge.status });
  }
  for (const [key, edge] of beforeEdges) if (!afterEdges.has(key)) edgesRemoved.push(edge);
  edgesAdded.sort(byEdge);
  edgesRemoved.sort(byEdge);
  statusChanged.sort(byEdge);

  const parts: string[] = [];
  if (added.length) parts.push(`${plural(added.length, "component")} added`);
  if (removed.length) parts.push(`${plural(removed.length, "component")} removed`);
  if (edgesAdded.length) parts.push(`${dependencies(edgesAdded.length)} added`);
  if (edgesRemoved.length) parts.push(`${dependencies(edgesRemoved.length)} removed`);
  for (const status of STATUS_ORDER) {
    const count = statusChanged.filter((change) => change.after === status).length;
    if (count) parts.push(STATUS_PHRASE[status](count));
  }

  return {
    components: { added, removed },
    edges: { added: edgesAdded, removed: edgesRemoved, statusChanged },
    summary: parts.length ? parts.join(", ") : "No architecture changes",
    changed: parts.length > 0,
  };
}
