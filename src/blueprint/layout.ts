// Dependency-free layered graph layout (Sugiyama style) for system diagrams.
//
//   1. break cycles          DFS back edges are reversed for layering only
//   2. layering              longest path; sources pulled next to their targets;
//                            over-full layers wrapped into several
//   3. ordering              long edges get waypoints; barycenter sweeps keep
//                            the order with the fewest crossings
//   4. coordinates           neighbours pull nodes into line, never overlapping
//
// Nodes without any edge are packed into a compact grid under the graph.
// Everything is deterministic: ties are broken by node id, never by input order.

export type LayoutDirection = "LR" | "TB";

export interface LayoutNodeInput {
  id: string;
  width: number;
  height: number;
  /** Hint: nodes sharing a group stay adjacent inside a layer. */
  group?: string;
}

export interface LayoutEdgeInput {
  from: string;
  to: string;
}

export interface LayoutOptions {
  /** "LR": layers are columns, edges flow left to right (default). "TB": layers are rows. */
  direction?: LayoutDirection;
  /** Gap between neighbouring nodes of one layer. */
  nodeGap?: number;
  /** Gap between layers. */
  layerGap?: number;
  padding?: number;
  /** Layers with more nodes are wrapped into several (default 6). */
  maxPerLayer?: number;
  /** Barycenter crossing-reduction sweeps, 0–12 (default 4). */
  sweeps?: number;
}

export interface LayoutNode {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  order: number;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** True when the edge closes a cycle and so runs against the layer order. */
  reversed: boolean;
  /** Route from the border of `from` to the border of `to`, through the layers in between. */
  points: LayoutPoint[];
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  /** One entry per distinct edge between known nodes (self-loops are dropped), sorted by from, to. */
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const finite = (value: number | undefined, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Inversions between two adjacent layers, counted with a Fenwick tree. */
function countCrossings(segments: Array<[number, number]>, position: number[], lowerSize: number): number {
  if (segments.length < 2) return 0;
  const sorted = segments
    .map(([upper, lower]) => [position[upper], position[lower]] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const tree = new Array<number>(lowerSize + 1).fill(0);
  let crossings = 0;
  let seen = 0;
  for (const [, lower] of sorted) {
    let notAfter = 0;
    for (let index = lower + 1; index > 0; index -= index & -index) notAfter += tree[index];
    crossings += seen - notAfter;
    for (let index = lower + 1; index <= lowerSize; index += index & -index) tree[index] += 1;
    seen += 1;
  }
  return crossings;
}

/**
 * Least-squares positions that keep the given order and minimum separations:
 * isotonic regression (pool adjacent violators) on the gap-adjusted targets.
 */
function placeInOrder(desired: number[], separation: number[], weight: number[]): number[] {
  const count = desired.length;
  const offset = new Array<number>(count).fill(0);
  for (let index = 1; index < count; index += 1) offset[index] = offset[index - 1] + separation[index - 1];
  const blocks: Array<{ sum: number; weight: number; size: number }> = [];
  for (let index = 0; index < count; index += 1) {
    blocks.push({ sum: (desired[index] - offset[index]) * weight[index], weight: weight[index], size: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const previous = blocks[blocks.length - 2];
      if (previous.sum / previous.weight <= last.sum / last.weight) break;
      previous.sum += last.sum;
      previous.weight += last.weight;
      previous.size += last.size;
      blocks.pop();
    }
  }
  const result: number[] = [];
  for (const block of blocks) {
    const value = block.sum / block.weight;
    for (let index = 0; index < block.size; index += 1) result.push(value + offset[result.length]);
  }
  return result;
}

export function layoutGraph(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[], options: LayoutOptions = {}): LayoutResult {
  const direction: LayoutDirection = options.direction === "TB" ? "TB" : "LR";
  const horizontal = direction === "LR";
  const nodeGap = finite(options.nodeGap, 32, 0, 1_000);
  const layerGap = finite(options.layerGap, 96, 0, 2_000);
  const padding = finite(options.padding, 24, 0, 1_000);
  const maxPerLayer = Math.round(finite(options.maxPerLayer, 6, 1, 1_000));
  const sweeps = Math.round(finite(options.sweeps, 4, 0, 12));

  // ── Inputs: unique nodes sorted by id, unique edges between them ──
  const byId = new Map<string, LayoutNodeInput>();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);
  const ids = [...byId.keys()].sort(compare);
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  const real = ids.length;
  const input = ids.map((id) => byId.get(id) as LayoutNodeInput);
  const sizeOf = (index: number, axis: "main" | "cross"): number => {
    const node = input[index];
    const value = (axis === "main") === horizontal ? node.width : node.height;
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const seenEdges = new Set<string>();
  const pairs: Array<{ from: number; to: number }> = [];
  for (const edge of edges) {
    const from = indexOf.get(edge.from);
    const to = indexOf.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}:${to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    pairs.push({ from, to });
  }
  pairs.sort((a, b) => a.from - b.from || a.to - b.to);

  const connected = new Array<boolean>(real).fill(false);
  for (const pair of pairs) {
    connected[pair.from] = true;
    connected[pair.to] = true;
  }

  // ── 1. Break cycles: iterative DFS in id order, back edges reversed ──
  const outgoing: number[][] = Array.from({ length: real }, () => []);
  pairs.forEach((pair, edgeIndex) => outgoing[pair.from].push(edgeIndex));
  const reversed = new Array<boolean>(pairs.length).fill(false);
  const state = new Uint8Array(real); // 0 new, 1 on stack, 2 done
  for (let root = 0; root < real; root += 1) {
    if (state[root] !== 0) continue;
    const stack: Array<{ node: number; next: number }> = [{ node: root, next: 0 }];
    state[root] = 1;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.next >= outgoing[frame.node].length) {
        state[frame.node] = 2;
        stack.pop();
        continue;
      }
      const edgeIndex = outgoing[frame.node][frame.next];
      frame.next += 1;
      const target = pairs[edgeIndex].to;
      if (state[target] === 1) reversed[edgeIndex] = true;
      else if (state[target] === 0) {
        state[target] = 1;
        stack.push({ node: target, next: 0 });
      }
    }
  }
  /** Edges in layering orientation: `upper` always ends up in an earlier layer than `lower`. */
  const dag = pairs.map((pair, edgeIndex) => (reversed[edgeIndex] ? { upper: pair.to, lower: pair.from } : { upper: pair.from, lower: pair.to }));

  // ── 2. Layering: longest path, then pull sources next to their targets ──
  const successors: number[][] = Array.from({ length: real }, () => []);
  const indegree = new Array<number>(real).fill(0);
  for (const edge of dag) {
    successors[edge.upper].push(edge.lower);
    indegree[edge.lower] += 1;
  }
  const layer = new Array<number>(real).fill(0);
  const remaining = indegree.slice();
  const queue: number[] = [];
  for (let index = 0; index < real; index += 1) if (remaining[index] === 0) queue.push(index);
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const next of successors[node]) {
      if (layer[next] < layer[node] + 1) layer[next] = layer[node] + 1;
      remaining[next] -= 1;
      if (remaining[next] === 0) queue.push(next);
    }
  }
  for (let index = 0; index < real; index += 1) {
    if (indegree[index] !== 0 || successors[index].length === 0) continue;
    let nearest = Infinity;
    for (const next of successors[index]) nearest = Math.min(nearest, layer[next]);
    layer[index] = nearest - 1;
  }

  // Wrap over-full layers. Nodes of one layer never depend on each other, so
  // splitting a layer keeps every edge pointing forward.
  const groupOf = (index: number): string => input[index].group ?? "";
  const byGroupThenId = (a: number, b: number): number => compare(groupOf(a), groupOf(b)) || a - b;
  const logical = new Map<number, number[]>();
  for (let index = 0; index < real; index += 1) {
    if (!connected[index]) continue;
    const members = logical.get(layer[index]);
    if (members) members.push(index);
    else logical.set(layer[index], [index]);
  }
  const rank = new Array<number>(real).fill(-1);
  let rankCount = 0;
  for (const key of [...logical.keys()].sort((a, b) => a - b)) {
    const members = logical.get(key) as number[];
    const parts = Math.ceil(members.length / maxPerLayer);
    const perPart = Math.ceil(members.length / parts);
    // Sinks stay near their dependents; nodes with targets move to the later part.
    members.sort((a, b) => Number(successors[a].length > 0) - Number(successors[b].length > 0) || byGroupThenId(a, b));
    members.forEach((member, position) => {
      rank[member] = rankCount + Math.floor(position / perPart);
    });
    rankCount += parts;
  }

  // ── 3. Ordering: waypoints for long edges, then barycenter sweeps ──
  const nodeRank: number[] = rank.slice();
  const group: string[] = input.map((node, index) => (node.group !== undefined ? `g:${node.group}` : `n:${index}`));
  const chains: number[][] = [];
  dag.forEach((edge, edgeIndex) => {
    const chain = [edge.upper];
    for (let at = rank[edge.upper] + 1; at < rank[edge.lower]; at += 1) {
      const waypoint = nodeRank.length;
      nodeRank.push(at);
      group.push(`w:${edgeIndex}:${at}`);
      chain.push(waypoint);
    }
    chain.push(edge.lower);
    chains.push(chain);
  });
  const total = nodeRank.length;
  const isWaypoint = (index: number): boolean => index >= real;
  const above: number[][] = Array.from({ length: total }, () => []);
  const below: number[][] = Array.from({ length: total }, () => []);
  const segments: Array<Array<[number, number]>> = Array.from({ length: Math.max(0, rankCount - 1) }, () => []);
  for (const chain of chains) {
    for (let step = 0; step + 1 < chain.length; step += 1) {
      const upper = chain[step];
      const lower = chain[step + 1];
      below[upper].push(lower);
      above[lower].push(upper);
      segments[nodeRank[upper]].push([upper, lower]);
    }
  }

  let order: number[][] = Array.from({ length: rankCount }, () => []);
  for (let index = 0; index < total; index += 1) if (nodeRank[index] >= 0) order[nodeRank[index]].push(index);
  for (const members of order) members.sort((a, b) => Number(isWaypoint(a)) - Number(isWaypoint(b)) || (isWaypoint(a) ? a - b : byGroupThenId(a, b)));
  const position = new Array<number>(total).fill(0);
  const reindex = (): void => {
    for (const members of order) members.forEach((member, at) => (position[member] = at));
  };
  reindex();

  const reorder = (at: number, neighbours: number[][]): void => {
    const members = order[at];
    const barycenter = new Map<number, number>();
    const groupSum = new Map<string, { sum: number; count: number }>();
    for (const member of members) {
      const around = neighbours[member];
      let value = position[member];
      if (around.length) {
        value = 0;
        for (const other of around) value += position[other];
        value /= around.length;
      }
      barycenter.set(member, value);
      const entry = groupSum.get(group[member]);
      if (entry) {
        entry.sum += value;
        entry.count += 1;
      } else groupSum.set(group[member], { sum: value, count: 1 });
    }
    const groupCenter = (member: number): number => {
      const entry = groupSum.get(group[member]) as { sum: number; count: number };
      return entry.sum / entry.count;
    };
    members.sort(
      (a, b) =>
        groupCenter(a) - groupCenter(b) ||
        compare(group[a], group[b]) ||
        (barycenter.get(a) as number) - (barycenter.get(b) as number) ||
        position[a] - position[b] ||
        a - b,
    );
    members.forEach((member, slot) => (position[member] = slot));
  };
  const crossings = (): number => {
    let sum = 0;
    for (let at = 0; at + 1 < rankCount; at += 1) sum += countCrossings(segments[at], position, order[at + 1].length);
    return sum;
  };

  for (let at = 1; at < rankCount; at += 1) reorder(at, above);
  let best = order.map((members) => members.slice());
  let bestCrossings = crossings();
  for (let sweep = 0; sweep < sweeps && bestCrossings > 0; sweep += 1) {
    if (sweep % 2 === 0) for (let at = rankCount - 2; at >= 0; at -= 1) reorder(at, below);
    else for (let at = 1; at < rankCount; at += 1) reorder(at, above);
    const current = crossings();
    if (current < bestCrossings) {
      bestCrossings = current;
      best = order.map((members) => members.slice());
    }
  }
  order = best;
  reindex();

  // ── 4. Coordinates ──
  const crossSize = (member: number): number => (isWaypoint(member) ? 0 : sizeOf(member, "cross"));
  const gapBetween = (a: number, b: number): number => {
    const waypoints = Number(isWaypoint(a)) + Number(isWaypoint(b));
    return waypoints === 2 ? Math.max(10, nodeGap * 0.4) : waypoints === 1 ? Math.max(12, nodeGap * 0.6) : nodeGap;
  };
  const separations = order.map((members) =>
    members.slice(0, -1).map((member, at) => (crossSize(member) + crossSize(members[at + 1])) / 2 + gapBetween(member, members[at + 1])),
  );
  const weights = order.map((members) => members.map((member) => (isWaypoint(member) ? 8 : 1)));
  /** Center of each node on the cross axis. */
  const center = new Array<number>(total).fill(0);
  order.forEach((members, at) => {
    const packed = placeInOrder(members.map(() => 0), separations[at], weights[at]);
    const span = packed.length ? packed[packed.length - 1] : 0;
    members.forEach((member, slot) => (center[member] = packed[slot] - span / 2));
  });
  const align = (at: number, neighbours: (member: number) => number[]): void => {
    const members = order[at];
    const desired = members.map((member) => {
      const around = neighbours(member);
      if (!around.length) return center[member];
      let sum = 0;
      for (const other of around) sum += center[other];
      return sum / around.length;
    });
    const placed = placeInOrder(desired, separations[at], weights[at]);
    members.forEach((member, slot) => (center[member] = placed[slot]));
  };
  const both = (member: number): number[] => above[member].concat(below[member]);
  for (let pass = 0; pass < 6; pass += 1) {
    for (let at = 1; at < rankCount; at += 1) align(at, (member) => above[member]);
    for (let at = rankCount - 2; at >= 0; at -= 1) align(at, (member) => below[member]);
  }
  for (let pass = 0; pass < 4; pass += 1) for (let at = 0; at < rankCount; at += 1) align(at, both);

  const thickness = order.map((members) => members.reduce((max, member) => (isWaypoint(member) ? max : Math.max(max, sizeOf(member, "main"))), 0));
  const start: number[] = [];
  let cursor = padding;
  for (let at = 0; at < rankCount; at += 1) {
    start.push(cursor);
    cursor += thickness[at] + layerGap;
  }
  const mainEnd = rankCount ? cursor - layerGap : padding;

  let crossMin = Infinity;
  let crossMax = -Infinity;
  for (let member = 0; member < total; member += 1) {
    if (nodeRank[member] < 0) continue;
    crossMin = Math.min(crossMin, center[member] - crossSize(member) / 2);
    crossMax = Math.max(crossMax, center[member] + crossSize(member) / 2);
  }
  const shift = rankCount ? padding - crossMin : 0;
  const crossEnd = rankCount ? crossMax + shift : padding;

  const round = (value: number): number => Math.round(value * 100) / 100;
  const toPoint = (main: number, cross: number): LayoutPoint => (horizontal ? { x: round(main), y: round(cross) } : { x: round(cross), y: round(main) });
  const result = new Map<string, LayoutNode>();
  const mainStart = new Array<number>(real).fill(0);
  for (let at = 0; at < rankCount; at += 1) {
    let slot = 0;
    for (const member of order[at]) {
      if (isWaypoint(member)) continue;
      mainStart[member] = start[at] + (thickness[at] - sizeOf(member, "main")) / 2;
      const corner = toPoint(mainStart[member], center[member] + shift - crossSize(member) / 2);
      result.set(ids[member], { x: corner.x, y: corner.y, width: input[member].width, height: input[member].height, layer: at, order: slot });
      slot += 1;
    }
  }

  let width = horizontal ? mainEnd : crossEnd;
  let height = horizontal ? crossEnd : mainEnd;

  // ── Nodes without edges: a compact grid under the graph ──
  const isolated: number[] = [];
  for (let node = 0; node < real; node += 1) if (!connected[node]) isolated.push(node);
  if (isolated.length) {
    isolated.sort(byGroupThenId);
    const cellWidth = Math.max(...isolated.map((node) => input[node].width || 0));
    const cellHeight = Math.max(...isolated.map((node) => input[node].height || 0));
    const gap = nodeGap;
    let columns: number;
    if (rankCount) {
      const available = Math.max(width - padding, 3 * cellWidth + 2 * gap);
      columns = Math.floor((available + gap) / (cellWidth + gap));
    } else {
      columns = Math.ceil(Math.sqrt((1.6 * isolated.length * (cellHeight + gap)) / (cellWidth + gap)));
    }
    columns = Math.max(1, Math.min(isolated.length, columns));
    const top = rankCount ? height + Math.max(nodeGap, layerGap / 2) : padding;
    isolated.forEach((node, at) => {
      const column = at % columns;
      const row = Math.floor(at / columns);
      const cellX = padding + column * (cellWidth + gap);
      const cellY = top + row * (cellHeight + gap);
      result.set(ids[node], {
        x: round(cellX + (cellWidth - input[node].width) / 2),
        y: round(cellY + (cellHeight - input[node].height) / 2),
        width: input[node].width,
        height: input[node].height,
        layer: rankCount + row,
        order: column,
      });
    });
    const rows = Math.ceil(isolated.length / columns);
    width = Math.max(width, padding + columns * cellWidth + (columns - 1) * gap);
    height = top + rows * cellHeight + (rows - 1) * gap;
  }

  // ── Edge routes ──
  const routes: LayoutEdge[] = pairs.map((pair, edgeIndex) => {
    const chain = chains[edgeIndex];
    const points: LayoutPoint[] = [];
    chain.forEach((member, step) => {
      const cross = center[member] + shift;
      if (step === 0) points.push(toPoint(mainStart[member] + sizeOf(member, "main"), cross));
      else if (step === chain.length - 1) points.push(toPoint(mainStart[member], cross));
      else {
        const at = nodeRank[member];
        points.push(toPoint(start[at], cross));
        if (thickness[at] > 0) points.push(toPoint(start[at] + thickness[at], cross));
      }
    });
    if (reversed[edgeIndex]) points.reverse();
    return { from: ids[pair.from], to: ids[pair.to], reversed: reversed[edgeIndex], points };
  });

  return { nodes: result, edges: routes, width: round(width + padding), height: round(height + padding) };
}
