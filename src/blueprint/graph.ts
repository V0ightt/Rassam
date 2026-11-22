import { compileGlob } from "./glob";
import type { Blueprint, BlueprintComponent } from "./schema";
import type {
  ComponentEdge,
  ComponentGraph,
  ComponentMembership,
  EnvRef,
  FileEdge,
  FileGraph,
} from "./types";

const MAX_EDGE_EVIDENCE = 20;

interface CompiledComponent {
  component: BlueprintComponent;
  index: number;
  include: ReturnType<typeof compileGlob>[];
  exclude: ReturnType<typeof compileGlob>[];
}

function compileComponents(blueprint: Blueprint | null): CompiledComponent[] {
  if (!blueprint) return [];
  return blueprint.components
    .map((component, index) => ({
      component,
      index,
      include: component.external ? [] : component.paths.map((pattern) => compileGlob(pattern)),
      exclude: (component.exclude ?? []).map((pattern) => compileGlob(pattern)),
    }))
    .filter((entry) => entry.include.length > 0);
}

function ownerOf(path: string, compiled: CompiledComponent[]): string | null {
  let best: { id: string; priority: number; specificity: number; index: number } | null = null;
  for (const entry of compiled) {
    let specificity = -1;
    for (const matcher of entry.include) {
      if (matcher.specificity > specificity && matcher.test(path)) specificity = matcher.specificity;
    }
    if (specificity < 0) continue;
    if (entry.exclude.some((matcher) => matcher.test(path))) continue;
    const priority = entry.component.priority ?? 0;
    if (
      !best
      || priority > best.priority
      || (priority === best.priority && specificity > best.specificity)
      || (priority === best.priority && specificity === best.specificity && entry.index < best.index)
    ) {
      best = { id: entry.component.id, priority, specificity, index: entry.index };
    }
  }
  return best?.id ?? null;
}

/**
 * Assign every file to at most one component. Precedence: higher `priority`,
 * then the most specific matching glob (most literal characters), then the
 * component declared first.
 */
export function assignComponents(files: readonly string[], blueprint: Blueprint | null): ComponentMembership {
  const compiled = compileComponents(blueprint);
  const fileToComponent = new Map<string, string>();
  const componentFiles = new Map<string, string[]>();
  const unmapped: string[] = [];
  for (const component of blueprint?.components ?? []) componentFiles.set(component.id, []);

  for (const path of files) {
    const owner = ownerOf(path, compiled);
    if (owner === null) {
      unmapped.push(path);
      continue;
    }
    fileToComponent.set(path, owner);
    componentFiles.get(owner)?.push(path);
  }
  for (const list of componentFiles.values()) list.sort();
  unmapped.sort();
  return { fileToComponent, componentFiles, unmapped };
}

export function componentForPath(path: string, blueprint: Blueprint | null): string | null {
  return ownerOf(path, compileComponents(blueprint));
}

export function buildComponentGraph(fileGraph: FileGraph, membership: ComponentMembership): ComponentGraph {
  const aggregates = new Map<string, ComponentEdge>();
  for (const edge of fileGraph.edges) {
    const from = membership.fileToComponent.get(edge.from);
    const to = membership.fileToComponent.get(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    const aggregate = aggregates.get(key) ?? { from, to, evidence: [], count: 0, typeOnly: true };
    aggregate.count += 1;
    aggregate.typeOnly = aggregate.typeOnly && edge.typeOnly;
    if (aggregate.evidence.length < MAX_EDGE_EVIDENCE) aggregate.evidence.push(edge);
    aggregates.set(key, aggregate);
  }

  const externals = new Map<string, Set<string>>();
  for (const ref of fileGraph.externals) {
    const owner = membership.fileToComponent.get(ref.from);
    if (!owner) continue;
    const set = externals.get(owner) ?? new Set<string>();
    set.add(ref.pkg);
    externals.set(owner, set);
  }

  const env = new Map<string, EnvRef[]>();
  const tests = new Map<string, Set<string>>();
  for (const [path, facts] of fileGraph.facts) {
    const owner = membership.fileToComponent.get(path);
    if (owner && facts.envRefs.length) env.set(owner, [...(env.get(owner) ?? []), ...facts.envRefs]);
  }
  for (const edge of fileGraph.edges) {
    if (!fileGraph.facts.get(edge.from)?.isTest) continue;
    const target = membership.fileToComponent.get(edge.to);
    if (!target) continue;
    const set = tests.get(target) ?? new Set<string>();
    set.add(edge.from);
    tests.set(target, set);
  }

  return {
    membership,
    edges: [...aggregates.values()].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    externals: new Map([...externals].map(([id, set]) => [id, [...set].sort()])),
    env,
    tests: new Map([...tests].map(([id, set]) => [id, [...set].sort()])),
  };
}

/** Edges allowed into rule evaluation, honoring includeTypeOnly. */
export function runtimeEdges(edges: readonly FileEdge[], includeTypeOnly: boolean): FileEdge[] {
  return includeTypeOnly ? [...edges] : edges.filter((edge) => !edge.typeOnly);
}

/** component id → ids of components that depend on it (reverse adjacency). */
export function reverseAdjacency(graph: ComponentGraph): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const set = reverse.get(edge.to) ?? new Set<string>();
    set.add(edge.from);
    reverse.set(edge.to, set);
  }
  return reverse;
}

/** Transitive dependents of a component, with BFS depth. */
export function dependentsOf(start: Iterable<string>, reverse: Map<string, Set<string>>): Array<{ id: string; depth: number }> {
  const seen = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [];
  const starts = new Set(start);
  for (const id of starts) queue.push({ id, depth: 0 });
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependent of reverse.get(current.id) ?? []) {
      if (starts.has(dependent) || seen.has(dependent)) continue;
      seen.set(dependent, current.depth + 1);
      queue.push({ id: dependent, depth: current.depth + 1 });
    }
  }
  return [...seen.entries()]
    .map(([id, depth]) => ({ id, depth }))
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
}

/** Strongly connected components with more than one member (Tarjan). */
export function findCycles(nodes: readonly string[], edges: ReadonlyArray<{ from: string; to: string }>): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node, []);
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) adjacency.get(edge.from)!.push(edge.to);
  }
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];

  // Iterative Tarjan to avoid recursion limits on large graphs.
  for (const root of adjacency.keys()) {
    if (indices.has(root)) continue;
    const work: Array<{ node: string; next: number }> = [{ node: root, next: 0 }];
    indices.set(root, index);
    lowlink.set(root, index);
    index += 1;
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const neighbors = adjacency.get(frame.node)!;
      if (frame.next < neighbors.length) {
        const neighbor = neighbors[frame.next];
        frame.next += 1;
        if (!indices.has(neighbor)) {
          indices.set(neighbor, index);
          lowlink.set(neighbor, index);
          index += 1;
          stack.push(neighbor);
          onStack.add(neighbor);
          work.push({ node: neighbor, next: 0 });
        } else if (onStack.has(neighbor)) {
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node)!, indices.get(neighbor)!));
        }
        continue;
      }
      if (lowlink.get(frame.node) === indices.get(frame.node)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        if (component.length > 1) result.push(component.sort());
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].node;
        lowlink.set(parent, Math.min(lowlink.get(parent)!, lowlink.get(frame.node)!));
      }
    }
  }
  return result.sort((left, right) => left.join(",").localeCompare(right.join(",")));
}

/** One concrete path through a cycle, for messages: a → b → c → a. */
export function cyclePath(members: readonly string[], edges: ReadonlyArray<{ from: string; to: string }>): string[] {
  const set = new Set(members);
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (set.has(edge.from) && set.has(edge.to)) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  const start = [...members].sort()[0];
  // BFS for the shortest path from start back to start.
  const previous = new Map<string, string>();
  const queue = [start];
  const visited = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    for (const next of adjacency.get(node) ?? []) {
      if (next === start) {
        const path = [start];
        let cursor: string | undefined = node;
        const reversed: string[] = [];
        while (cursor && cursor !== start) {
          reversed.push(cursor);
          cursor = previous.get(cursor);
        }
        return [...path, ...reversed.reverse(), start];
      }
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, node);
      queue.push(next);
    }
  }
  return [...members, members[0]];
}
