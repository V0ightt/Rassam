import { describe, expect, it } from "vitest";
import { layoutGraph, type LayoutEdgeInput, type LayoutNodeInput, type LayoutResult } from "./layout";

const node = (id: string, group?: string): LayoutNodeInput => ({ id, width: 200, height: 76, group });
const edge = (from: string, to: string): LayoutEdgeInput => ({ from, to });

function overlaps(result: LayoutResult): string[] {
  const entries = [...result.nodes.entries()];
  const hits: string[] = [];
  for (let a = 0; a < entries.length; a += 1) {
    for (let b = a + 1; b < entries.length; b += 1) {
      const [idA, first] = entries[a];
      const [idB, second] = entries[b];
      const apart =
        first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y;
      if (!apart) hits.push(`${idA}/${idB}`);
    }
  }
  return hits;
}

function expectInsideCanvas(result: LayoutResult): void {
  for (const [, placed] of result.nodes) {
    for (const value of [placed.x, placed.y]) expect(Number.isFinite(value)).toBe(true);
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.y).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.width).toBeLessThanOrEqual(result.width);
    expect(placed.y + placed.height).toBeLessThanOrEqual(result.height);
  }
  for (const route of result.edges) {
    expect(route.points.length).toBeGreaterThanOrEqual(2);
    for (const point of route.points) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(result.width);
      expect(point.y).toBeLessThanOrEqual(result.height);
    }
  }
}

function expectForward(result: LayoutResult): void {
  for (const route of result.edges) {
    const from = result.nodes.get(route.from)!;
    const to = result.nodes.get(route.to)!;
    if (route.reversed) expect(from.layer).toBeGreaterThan(to.layer);
    else expect(from.layer).toBeLessThan(to.layer);
  }
}

/** Small deterministic generator (mulberry32). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGraph(count: number, edgeCount: number, seed: number): { nodes: LayoutNodeInput[]; edges: LayoutEdgeInput[] } {
  const next = random(seed);
  const nodes = Array.from({ length: count }, (_, index) => node(`n${String(index).padStart(3, "0")}`, index % 5 === 0 ? `g${index % 3}` : undefined));
  const edges: LayoutEdgeInput[] = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const from = Math.floor(next() * count);
    const to = Math.floor(next() * count);
    edges.push(edge(nodes[from].id, nodes[to].id));
  }
  return { nodes, edges };
}

describe("layoutGraph", () => {
  it("layers a chain left to right and top to bottom", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const lr = layoutGraph(nodes, edges, { direction: "LR" });
    expect([...lr.nodes.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(lr.nodes.get("a")!.x).toBeLessThan(lr.nodes.get("b")!.x);
    expect(lr.nodes.get("b")!.x).toBeLessThan(lr.nodes.get("c")!.x);
    expect(lr.nodes.get("a")!.y).toBe(lr.nodes.get("c")!.y);
    expect([lr.nodes.get("a")!.layer, lr.nodes.get("b")!.layer, lr.nodes.get("c")!.layer]).toEqual([0, 1, 2]);

    const tb = layoutGraph(nodes, edges, { direction: "TB" });
    expect(tb.nodes.get("a")!.y).toBeLessThan(tb.nodes.get("b")!.y);
    expect(tb.nodes.get("a")!.x).toBe(tb.nodes.get("b")!.x);
    expect(tb.height).toBeGreaterThan(tb.width);
    expectInsideCanvas(lr);
    expectInsideCanvas(tb);
  });

  it("respects size, gaps and padding", () => {
    const result = layoutGraph([node("a"), node("b")], [edge("a", "b")], { direction: "LR", layerGap: 100, padding: 10 });
    expect(result.nodes.get("a")).toMatchObject({ x: 10, y: 10, width: 200, height: 76 });
    expect(result.nodes.get("b")).toMatchObject({ x: 310, y: 10 });
    expect(result).toMatchObject({ width: 520, height: 96 });
    expect(result.edges).toEqual([{ from: "a", to: "b", reversed: false, points: [{ x: 210, y: 48 }, { x: 310, y: 48 }] }]);
  });

  it("never overlaps nodes and keeps every edge pointing forward", () => {
    const nodes = ["ui", "api", "core", "db", "queue", "worker", "docs", "tools"].map((id) => node(id));
    const edges = [edge("ui", "api"), edge("api", "core"), edge("api", "db"), edge("worker", "queue"), edge("worker", "core"), edge("ui", "core"), edge("api", "queue")];
    for (const direction of ["LR", "TB"] as const) {
      const result = layoutGraph(nodes, edges, { direction });
      expect(result.nodes.size).toBe(8);
      expect(overlaps(result)).toEqual([]);
      expectForward(result);
      expectInsideCanvas(result);
      expect(result.edges.every((route) => !route.reversed)).toBe(true);
    }
  });

  it("reverses only the edges that close a cycle", () => {
    const nodes = ["a", "b", "c", "d"].map((id) => node(id));
    const result = layoutGraph(nodes, [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("c", "d"), edge("d", "d")]);
    expect(result.edges.map((route) => `${route.from}>${route.to}`)).toEqual(["a>b", "b>c", "c>a", "c>d"]);
    expect(result.edges.filter((route) => route.reversed).map((route) => `${route.from}>${route.to}`)).toEqual(["c>a"]);
    expectForward(result);
    expect(overlaps(result)).toEqual([]);
    // The reversed edge still runs from its real source to its real target.
    const back = result.edges.find((route) => route.reversed)!;
    expect(back.points[0].x).toBeGreaterThan(back.points[back.points.length - 1].x);
  });

  it("routes long edges through the layers they skip", () => {
    const nodes = ["a", "b", "c"].map((id) => node(id));
    const result = layoutGraph(nodes, [edge("a", "b"), edge("b", "c"), edge("a", "c")], { direction: "LR" });
    const long = result.edges.find((route) => route.from === "a" && route.to === "c")!;
    expect(long.points.length).toBe(4);
    const middle = result.nodes.get("b")!;
    for (const point of long.points.slice(1, 3)) {
      expect(point.y < middle.y || point.y > middle.y + middle.height).toBe(true);
    }
  });

  it("packs isolated nodes into compact rows under the graph", () => {
    const linked = [node("a"), node("b")];
    const loose = Array.from({ length: 11 }, (_, index) => node(`z${String(index).padStart(2, "0")}`));
    const result = layoutGraph([...linked, ...loose], [edge("a", "b")]);
    const bottom = Math.max(result.nodes.get("a")!.y, result.nodes.get("b")!.y) + 76;
    const rows = new Set<number>();
    for (const item of loose) {
      const placed = result.nodes.get(item.id)!;
      expect(placed.y).toBeGreaterThanOrEqual(bottom);
      expect(placed.layer).toBeGreaterThan(1);
      rows.add(placed.y);
    }
    expect(rows.size).toBeGreaterThan(1);
    expect(rows.size).toBeLessThan(11);
    expect(overlaps(result)).toEqual([]);
    expectInsideCanvas(result);

    const onlyLoose = layoutGraph(loose, []);
    expect(overlaps(onlyLoose)).toEqual([]);
    expect(new Set([...onlyLoose.nodes.values()].map((placed) => placed.y)).size).toBeGreaterThan(1);
    expect(new Set([...onlyLoose.nodes.values()].map((placed) => placed.x)).size).toBeGreaterThan(1);
  });

  it("wraps layers that are too wide", () => {
    const leaves = Array.from({ length: 20 }, (_, index) => node(`leaf${String(index).padStart(2, "0")}`));
    const result = layoutGraph([node("hub"), ...leaves], leaves.map((leaf) => edge("hub", leaf.id)), { direction: "LR", maxPerLayer: 6 });
    const perLayer = new Map<number, number>();
    for (const [, placed] of result.nodes) perLayer.set(placed.layer, (perLayer.get(placed.layer) ?? 0) + 1);
    expect(Math.max(...perLayer.values())).toBeLessThanOrEqual(6);
    expect(overlaps(result)).toEqual([]);
    expectForward(result);
  });

  it("keeps nodes of one group adjacent inside a layer", () => {
    const nodes = [node("hub"), node("a1", "alpha"), node("b1", "beta"), node("a2", "alpha"), node("b2", "beta"), node("a3", "alpha")];
    const edges = nodes.slice(1).map((target) => edge("hub", target.id));
    const result = layoutGraph(nodes, edges, { direction: "LR" });
    const column = nodes
      .slice(1)
      .map((item) => ({ group: item.group, order: result.nodes.get(item.id)!.order }))
      .sort((a, b) => a.order - b.order)
      .map((item) => item.group);
    expect(column.join(",").replace(/(\w+)(,\1)+/g, "$1").split(",").length).toBe(2);
  });

  it("is deterministic and independent of input order", () => {
    const { nodes, edges } = randomGraph(40, 70, 7);
    const first = layoutGraph(nodes, edges);
    const second = layoutGraph(nodes, edges);
    const shuffled = layoutGraph([...nodes].reverse(), [...edges].reverse());
    const flat = (result: LayoutResult): string => JSON.stringify({ ...result, nodes: [...result.nodes.entries()].sort() });
    expect(flat(second)).toBe(flat(first));
    expect(flat(shuffled)).toBe(flat(first));
  });

  it("ignores unknown endpoints, duplicates and empty input", () => {
    expect(layoutGraph([], [])).toMatchObject({ width: 48, height: 48, edges: [] });
    const result = layoutGraph([node("a"), node("b"), node("a")], [edge("a", "b"), edge("a", "b"), edge("a", "ghost")]);
    expect(result.nodes.size).toBe(2);
    expect(result.edges.length).toBe(1);
  });

  it("lays out a 150-node random graph without overlaps in under 200 ms", () => {
    layoutGraph(randomGraph(30, 40, 1).nodes, randomGraph(30, 40, 1).edges); // warm up
    const { nodes, edges } = randomGraph(150, 220, 42);
    const started = performance.now();
    const result = layoutGraph(nodes, edges);
    const elapsed = performance.now() - started;
    expect(result.nodes.size).toBe(150);
    expect(overlaps(result)).toEqual([]);
    expectForward(result);
    expectInsideCanvas(result);
    expect(elapsed).toBeLessThan(200);
  });
});
