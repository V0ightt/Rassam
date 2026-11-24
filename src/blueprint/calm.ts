import type { Blueprint } from "./schema";
import type { WorkspaceGraphView } from "./workspace";

// A calm view of the system graph leaves out what a reader can take for
// granted, so the structure that matters stays legible:
//   - test components (they depend on everything by design),
//   - edges into components marked `public` (shared by all),
//   - declared dependencies already implied by another declared path.
// Anything that needs attention is never hidden: undeclared, forbidden and
// missing edges, edges on a dependency cycle, components with findings, and
// whatever the caller pins.

export interface CalmOptions {
  /** Edges that must stay visible ("from\u0000to"), e.g. what a commit or proposal touched. */
  keepEdges?: ReadonlySet<string>;
  /** Components that must stay visible, e.g. the current selection. */
  keepComponents?: ReadonlySet<string>;
}

export interface CalmGraphView {
  view: WorkspaceGraphView;
  /** Ids of components left out of the view. */
  hiddenComponents: Set<string>;
  /** Components whose incoming edges were hidden because everything may use them. */
  sharedComponents: Set<string>;
  hidden: { tests: number; shared: number; implied: number };
  /** One sentence for a footnote or tooltip; empty when nothing was hidden. */
  note: string;
}

export const calmEdgeKey = (edge: { from: string; to: string }): string => `${edge.from}\u0000${edge.to}`;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function calmGraphView(view: WorkspaceGraphView, blueprint: Blueprint | null, options: CalmOptions = {}): CalmGraphView {
  const publicIds = new Set((blueprint?.components ?? []).filter((component) => component.public).map((component) => component.id));
  const ids = new Set(view.components.map((component) => component.id));
  const edges = new Map<string, WorkspaceGraphView["edges"][number]>();
  for (const edge of view.edges) {
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to) || edges.has(calmEdgeKey(edge))) continue;
    edges.set(calmEdgeKey(edge), edge);
  }
  const keep = (edge: WorkspaceGraphView["edges"][number]): boolean => (
    edge.status !== "declared" || Boolean(edge.cycle) || Boolean(options.keepEdges?.has(calmEdgeKey(edge)))
  );

  const pinned = new Set<string>(options.keepComponents ?? []);
  for (const edge of edges.values()) {
    if (!keep(edge)) continue;
    pinned.add(edge.from);
    pinned.add(edge.to);
  }

  const hidden = { tests: 0, shared: 0, implied: 0 };
  const hiddenComponents = new Set<string>();
  const sharedComponents = new Set<string>();
  for (const component of view.components) {
    if (component.kind !== "test" || (component.findings ?? 0) > 0 || pinned.has(component.id)) continue;
    hiddenComponents.add(component.id);
  }
  hidden.tests = hiddenComponents.size;

  for (const [key, edge] of [...edges]) {
    if (hiddenComponents.has(edge.from) || hiddenComponents.has(edge.to)) edges.delete(key);
    else if (!keep(edge) && publicIds.has(edge.to)) {
      edges.delete(key);
      sharedComponents.add(edge.to);
      hidden.shared += 1;
    }
  }

  // Transitive reduction over declared edges.
  const next = new Map<string, Set<string>>();
  for (const edge of edges.values()) {
    if (edge.status !== "declared") continue;
    const targets = next.get(edge.from);
    if (targets) targets.add(edge.to);
    else next.set(edge.from, new Set([edge.to]));
  }
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length) {
      const node = stack.pop() as string;
      for (const target of next.get(node) ?? []) {
        if (node === from && target === to) continue;
        if (target === to) return true;
        if (seen.has(target)) continue;
        seen.add(target);
        stack.push(target);
      }
    }
    return false;
  };
  for (const key of [...edges.keys()].sort()) {
    const edge = edges.get(key) as WorkspaceGraphView["edges"][number];
    if (keep(edge) || !reaches(edge.from, edge.to)) continue;
    next.get(edge.from)?.delete(edge.to);
    edges.delete(key);
    hidden.implied += 1;
  }

  const parts = [
    hidden.tests ? plural(hidden.tests, "test component") : "",
    hidden.shared ? `${plural(hidden.shared, "edge")} into shared components` : "",
    hidden.implied ? plural(hidden.implied, "implied dependency", "implied dependencies") : "",
  ].filter(Boolean);

  return {
    view: {
      components: view.components.filter((component) => !hiddenComponents.has(component.id)),
      edges: [...edges.values()],
      ...(view.cycles ? { cycles: view.cycles } : {}),
    },
    hiddenComponents,
    sharedComponents,
    hidden,
    note: parts.length ? `Hidden for clarity: ${parts.join(", ")}` : "",
  };
}
