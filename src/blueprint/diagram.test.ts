import { describe, expect, it } from "vitest";
import { diffArchitecture } from "./arch-diff";
import { DIAGRAM_PALETTES, escapeXml, estimateTextWidth, renderStatusBadge, renderSystemDiagram, truncateText, type SystemDiagramInput } from "./diagram";
import { blueprintSchema } from "./schema";
import type { SystemStatus } from "./status";
import type { SourceFile } from "./types";
import { createWorkspace, type WorkspaceGraphView } from "./workspace";

// ── Fixture: a tiny in-memory repository ──────────────────────

const file = (path: string, content: string): SourceFile => ({ path, content });

const AWKWARD = 'A & <B> "C"';
const LONG_NAME = "Customer notification and outbound messaging orchestration service";

const files = [
  file("src/ui/page.ts", 'import { handle } from "../api/handler";\nimport { query } from "../db/client";\nexport const page = [handle, query];\n'),
  file("src/api/handler.ts", 'import { query } from "../db/client";\nimport { push } from "../queue/push";\nexport const handle = [query, push];\n'),
  file("src/db/client.ts", "export const query = 1;\n"),
  file("src/queue/push.ts", "export const push = 1;\n"),
  file("src/worker/run.ts", 'import { push } from "../queue/push";\nexport const run = push;\n'),
];

const blueprint = blueprintSchema.parse({
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "ui", name: AWKWARD, kind: "frontend", paths: ["src/ui/**"], runtime: { health: { url: "https://shop.example/health" } } },
    { id: "api", name: "API", kind: "api", paths: ["src/api/**"], runtime: { health: { url: "https://shop.example/api/health" } }, verified: { by: "Layla", at: "2026-02-01" } },
    { id: "db", name: "Database", kind: "database", paths: ["src/db/**"], runtime: { deployment: { environment: "production" } }, provenance: { source: "derived" } },
    { id: "queue", name: LONG_NAME, kind: "queue", paths: ["src/queue/**"], runtime: { workflow: { file: "queue.yml" } } },
    { id: "worker", name: "Worker", kind: "service", paths: ["src/worker/**"], provenance: { source: "human", by: "Layla" } },
    { id: "stripe", name: "Stripe", kind: "external-api", external: true },
  ],
  dependencies: [
    { from: "ui", to: "api" },
    { from: "api", to: "db" },
    { from: "api", to: "stripe" },
    { from: "worker", to: "queue" },
  ],
  rules: [{ id: "ui-not-db", kind: "forbid", from: "ui", to: "db" }],
});

const workspace = createWorkspace(files, blueprint);
const view = workspace.graphView();

const status: SystemStatus = {
  version: 1,
  checkedAt: "2026-03-01T10:00:00Z",
  components: {
    ui: { state: "up", source: "health-check" },
    api: { state: "degraded", source: "health-check" },
    db: { state: "down", source: "deployment" },
  },
};

const before: WorkspaceGraphView = {
  components: [...view.components.filter((component) => component.id !== "worker"), { id: "legacy", name: "Legacy" }],
  edges: [...view.edges.filter((edge) => edge.from !== "worker" && !(edge.from === "api" && edge.to === "queue")), { from: "legacy", to: "db", status: "declared" }, { from: "api", to: "ui", status: "declared" }],
};

const full: SystemDiagramInput = {
  title: "Shop <system> & friends",
  subtitle: "Checked on every commit",
  view,
  blueprint,
  status,
  diff: diffArchitecture(before, view),
  findings: { errors: 2, warnings: 1 },
  commit: "0123456789abcdef",
  generatedAt: "2026-03-01T10:05:09Z",
  fileCounts: { ui: 1, api: 1, db: 1, queue: 1, worker: 1 },
};

// ── A tiny XML well-formedness checker ────────────────────────

function checkXml(xml: string): { ok: boolean; error?: string; tags: string[] } {
  const stack: string[] = [];
  const tags: string[] = [];
  let index = 0;
  let roots = 0;
  const fail = (error: string) => ({ ok: false, error: `${error} at ${index}`, tags });
  while (index < xml.length) {
    const open = xml.indexOf("<", index);
    const textRun = xml.slice(index, open === -1 ? xml.length : open);
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(textRun)) return fail("bare ampersand in text");
    if (textRun.includes(">") && stack.length) return fail("bare > in text");
    if (!stack.length && textRun.trim()) return fail("text outside the root");
    if (open === -1) break;
    const close = xml.indexOf(">", open);
    if (close === -1) return fail("unterminated tag");
    const body = xml.slice(open + 1, close);
    index = close + 1;
    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      if (stack.pop() !== name) return fail(`unbalanced </${name}>`);
      continue;
    }
    const match = /^([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*="[^"<]*")*)\s*(\/?)$/.exec(body);
    if (!match) return fail(`malformed tag <${body.slice(0, 40)}>`);
    const attributes = [...match[2].matchAll(/\s+([A-Za-z_:][\w:.-]*)="([^"<]*)"/g)];
    if (new Set(attributes.map((attribute) => attribute[1])).size !== attributes.length) return fail("duplicate attribute");
    for (const attribute of attributes) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(attribute[2])) return fail("bare ampersand in attribute");
    }
    tags.push(match[1]);
    if (!stack.length) roots += 1;
    if (!match[3]) stack.push(match[1]);
  }
  if (stack.length) return fail(`unclosed <${stack[stack.length - 1]}>`);
  if (roots !== 1) return fail("expected exactly one root element");
  return { ok: true, tags };
}

const unescape = (value: string): string => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

interface TextNode {
  x: number;
  size: number;
  weight: number;
  anchor: string;
  content: string;
}

function textNodes(fragment: string): TextNode[] {
  return [...fragment.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map((match) => {
    const attribute = (name: string): string | undefined => new RegExp(`(?:^| )${name}="([^"]*)"`).exec(match[1])?.[1];
    return {
      x: Number(attribute("x")),
      size: Number(attribute("font-size")),
      weight: Number(attribute("font-weight") ?? 400),
      anchor: attribute("text-anchor") ?? "start",
      content: unescape(match[2]),
    };
  });
}

function cardsOf(svg: string): Array<{ id: string; x: number; y: number; width: number; height: number; inner: string }> {
  return [...svg.matchAll(/<g data-component="([^"]*)" transform="translate\(([\d.-]+) ([\d.-]+)\)"[^>]*>(.*?)<\/g>/g)].map((match) => {
    const rect = /<rect x="0.5" y="0.5" width="([\d.]+)" height="([\d.]+)"/.exec(match[4]) as RegExpExecArray;
    return { id: unescape(match[1]), x: Number(match[2]), y: Number(match[3]), width: Number(rect[1]) + 1, height: Number(rect[2]) + 1, inner: match[4] };
  });
}

const legendKeys = (svg: string): string[] => [...svg.matchAll(/data-legend="([^"]*)"/g)].map((match) => match[1]);
const viewBox = (svg: string): { width: number; height: number } => {
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) as RegExpExecArray;
  return { width: Number(match[1]), height: Number(match[2]) };
};

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrast = (a: string, b: string): number => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

// ── Tests ─────────────────────────────────────────────────────

describe("the XML checker itself", () => {
  it("accepts balanced markup and rejects broken markup", () => {
    expect(checkXml('<a x="1"><b/>t &amp; t</a>').ok).toBe(true);
    expect(checkXml("<a><b></a></b>").ok).toBe(false);
    expect(checkXml("<a>").ok).toBe(false);
    expect(checkXml("<a>x & y</a>").ok).toBe(false);
    expect(checkXml('<a x="<"/>').ok).toBe(false);
    expect(checkXml("<a x=1/>").ok).toBe(false);
    expect(checkXml("<a/><b/>").ok).toBe(false);
  });
});

describe("renderSystemDiagram", () => {
  const svg = renderSystemDiagram(full);

  it("fixture exercises every edge status", () => {
    expect(new Set(view.edges.map((edge) => edge.status))).toEqual(new Set(["declared", "undeclared", "forbidden", "missing"]));
  });

  it("is one well-formed, self-contained SVG", () => {
    const result = checkXml(svg);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain('role="img"');
    for (const banned of ["<script", "foreignObject", 'href="http', "@import", "<style", "<image", "<use", "url(http", "javascript:", "<a ", " on"]) {
      if (banned === " on") expect(svg).not.toMatch(/ on[a-z]+="/);
      else expect(svg).not.toContain(banned);
    }
    // Only local references.
    for (const match of svg.matchAll(/url\(([^)]*)\)/g)) expect(match[1].startsWith("#rs")).toBe(true);
    expect(svg).not.toMatch(/NaN|Infinity|undefined|null/);
    for (const match of svg.matchAll(/ (?:x|y|cx|cy|width|height)="(-?[\d.]+)"/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(-9);
    const tags = new Set(result.tags);
    for (const tag of tags) expect(["svg", "title", "desc", "defs", "marker", "path", "rect", "circle", "g", "text", "tspan"]).toContain(tag);
  });

  it("has a title and a description for screen readers", () => {
    const labelled = /aria-labelledby="(\S+) (\S+)"/.exec(svg) as RegExpExecArray;
    expect(svg).toContain(`<title id="${labelled[1]}">Shop &lt;system&gt; &amp; friends</title>`);
    const desc = unescape(new RegExp(`<desc id="${labelled[2]}">([^<]*)</desc>`).exec(svg)![1]);
    expect(desc).toContain("6 components (1 external) and 6 dependencies");
    expect(desc).toContain("1 undeclared");
    expect(desc).toContain("1 forbidden");
    expect(desc).toContain("Status: outage; 1 up, 1 degraded, 1 down, 1 without data");
    expect(desc).toContain("Violations: 2 errors, 1 warning");
    expect(desc).toContain(`${AWKWARD} (up`);
    expect(desc).toContain("Removed: legacy");
    expect(desc).toContain("Commit 0123456");
  });

  it("escapes names for XML", () => {
    expect(svg).toContain("A &amp; &lt;B&gt; &quot;C&quot;");
    expect(svg).not.toContain("<B>");
    expect(escapeXml(`a&b<c>d"e'f\u0000g\u0007h\ni￿`)).toBe("a&amp;b&lt;c&gt;d&quot;e&#39;fgh i");
    const hostile = renderSystemDiagram({ title: ']]></title><script>alert(1)</script>', view: { components: [{ id: 'x"><script>', name: "</text><script>x</script>" }], edges: [] } });
    expect(checkXml(hostile).ok).toBe(true);
    expect(hostile).not.toContain("<script");
  });

  it("draws every component once, inside the canvas, without overlaps", () => {
    const cards = cardsOf(svg);
    expect(cards.map((card) => card.id).sort()).toEqual(["api", "db", "legacy", "queue", "stripe", "ui", "worker"]);
    const box = viewBox(svg);
    for (const card of cards) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(box.width);
      expect(card.y + card.height).toBeLessThanOrEqual(box.height);
    }
    for (let a = 0; a < cards.length; a += 1) {
      for (let b = a + 1; b < cards.length; b += 1) {
        const [first, second] = [cards[a], cards[b]];
        const apart = first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y;
        expect(apart, `${first.id} overlaps ${second.id}`).toBe(true);
      }
    }
  });

  it("truncates every text to fit its card", () => {
    const cards = cardsOf(svg);
    let checked = 0;
    for (const card of cards) {
      for (const node of textNodes(card.inner)) {
        const width = estimateTextWidth(node.content, node.size, node.weight);
        const left = node.anchor === "end" ? node.x - width : node.anchor === "middle" ? node.x - width / 2 : node.x;
        expect(left, `${card.id}: "${node.content}"`).toBeGreaterThanOrEqual(0);
        expect(left + width, `${card.id}: "${node.content}"`).toBeLessThanOrEqual(card.width);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(15);
    const queue = cards.find((card) => card.id === "queue")!;
    const name = textNodes(queue.inner)[0].content;
    expect(name.endsWith("…")).toBe(true);
    expect(LONG_NAME.startsWith(name.slice(0, -1).trimEnd())).toBe(true);
    expect(svg).not.toContain(LONG_NAME + "<");
  });

  it("keeps header and legend text inside the canvas", () => {
    const box = viewBox(svg);
    const outside = svg.replace(/<g data-component=.*?<\/g>/g, "").replace(/<tspan[^>]*>([^<]*)<\/tspan>/g, "$1");
    const nodes = textNodes(outside);
    expect(nodes.length).toBeGreaterThan(8);
    for (const node of nodes) {
      const width = estimateTextWidth(node.content, node.size, node.weight);
      const left = node.anchor === "end" ? node.x - width : node.anchor === "middle" ? node.x - width / 2 : node.x;
      expect(left, node.content).toBeGreaterThanOrEqual(0);
      expect(left + width, node.content).toBeLessThanOrEqual(box.width);
    }
    const long = renderSystemDiagram({ ...full, title: "T".repeat(400), subtitle: "s".repeat(900) });
    expect(viewBox(long).width).toBe(box.width);
    expect(long).toContain("…</text>");
  });

  it("shows status with shape and text, not color alone", () => {
    const cards = new Map(cardsOf(svg).map((card) => [card.id, card.inner]));
    expect(cards.get("ui")).toMatch(/<circle data-state="up"[^>]*fill="#1a7f37"/);
    expect(cards.get("ui")).toContain(">Up</text>");
    expect(cards.get("api")).toMatch(/<path data-state="degraded"/);
    expect(cards.get("api")).toContain(">Degraded</text>");
    expect(cards.get("db")).toMatch(/<rect data-state="down"/);
    expect(cards.get("db")).toContain(">Down</text>");
    // Declares runtime but has no status entry.
    expect(cards.get("queue")).toMatch(/<circle data-state="unknown"[^>]*fill="none"/);
    expect(cards.get("queue")).toContain(">No data</text>");
    // No runtime, no status: nothing.
    expect(cards.get("worker")).not.toContain("data-state");
    expect(cards.get("stripe")).not.toContain("data-state");
    expect(svg).toContain(">Outage</text>");
  });

  it("marks violations, verification and external systems", () => {
    const cards = new Map(cardsOf(svg).map((card) => [card.id, card.inner]));
    expect(view.components.find((component) => component.id === "ui")!.findings).toBeGreaterThan(0);
    expect(cards.get("ui")).toContain('data-badge="violations"');
    expect(cards.get("worker")).not.toContain('data-badge="violations"');
    expect(cards.get("api")).toContain('data-mark="verified"');
    expect(cards.get("db")).toContain('data-mark="derived"');
    // No provenance, or provenance "human": written by a person, so no tag.
    expect(cards.get("ui")).not.toContain("data-mark");
    expect(cards.get("worker")).not.toContain("data-mark");
    const agentMade = { ...blueprint, components: blueprint.components.map((component) => (component.id === "queue" ? { ...component, provenance: { source: "agent" as const } } : component)) };
    expect(renderSystemDiagram({ ...full, blueprint: agentMade })).toContain('data-mark="agent"');
    expect(cards.get("stripe")).toContain("stroke-dasharray");
    expect(cards.get("stripe")).toContain(">external · external-api</text>");
    expect(cards.get("db")).toContain(">database · 1 file</text>");
    expect(svg).toContain(">2 errors · 1 warning</text>");
    expect(svg).toContain(">0123456 · 2026-03-01 10:05 UTC</text>");
    expect(renderSystemDiagram({ ...full, findings: { errors: 0, warnings: 0 } })).toContain(">0 violations</text>");
    expect(renderSystemDiagram({ ...full, blueprint: null })).not.toContain("data-mark");
  });

  it("styles edges by status with arrowheads", () => {
    for (const status of ["declared", "undeclared", "forbidden", "missing"]) {
      expect(svg).toMatch(new RegExp(`<path data-edge="${status}"[^>]*marker-end="url\\(#rs[a-z0-9]+-arrow-${status}\\)"`));
      expect(svg).toMatch(new RegExp(`<marker id="rs[a-z0-9]+-arrow-${status}"`));
    }
    expect(svg).toMatch(/<path data-edge="undeclared"[^>]*stroke-dasharray/);
    expect(svg).toMatch(/<path data-edge="forbidden"[^>]*stroke="#cf222e" stroke-width="2.5"/);
    expect(svg).toMatch(/data-edge-label="forbidden">forbidden<\/text>/);
    expect(svg).toMatch(/data-edge-label="missing">not observed<\/text>/);
    expect(svg).toMatch(/data-edge-label="undeclared">[^<]*undeclared<\/text>/);
    const edges = [...svg.matchAll(/<path data-edge="[a-z]+" d="([^"]+)"/g)];
    expect(edges.length).toBe(view.edges.length + 2);
    for (const edge of edges) expect(edge[1]).toMatch(/^M[\d.]+ [\d.]+[CL]/);
  });

  it("overlays what the commit changed", () => {
    const cards = new Map(cardsOf(svg).map((card) => [card.id, card.inner]));
    expect(full.diff).toMatchObject({ components: { added: ["worker"], removed: ["legacy"] }, changed: true });
    expect(cards.get("worker")).toContain('data-change="added">+ new</text>');
    expect(cards.get("worker")).toMatch(/stroke="#1a7f37" stroke-width="2"/);
    expect(cards.get("legacy")).toContain('data-change="removed">removed</text>');
    expect(cards.get("legacy")).toContain("line-through");
    expect(cards.get("api")).not.toContain("data-change");
    // The removed component sits in its own row under the graph.
    const placed = cardsOf(svg);
    const legacy = placed.find((card) => card.id === "legacy")!;
    for (const card of placed) if (card.id !== "legacy") expect(legacy.y).toBeGreaterThanOrEqual(card.y + card.height);
    expect(svg.match(/<path data-edge="removed"/g)).toHaveLength(2);
    expect(svg).toMatch(/data-edge-label="[a-z]+">\+ new/);
    expect(svg).toContain('data-diff="summary"');
    expect(svg).toContain("1 component added, 1 component removed");

    const plain = renderSystemDiagram({ ...full, diff: null });
    expect(plain).not.toContain("data-change");
    expect(plain).not.toContain('data-edge="removed"');
    expect(renderSystemDiagram({ ...full, diff: diffArchitecture(view, view) })).toBe(plain);
  });

  it("lists only what is used in the legend", () => {
    expect(legendKeys(svg)).toEqual(["declared", "undeclared", "forbidden", "missing", "up", "degraded", "down", "unknown", "external", "verified", "violations", "added", "removed"]);
    const small: WorkspaceGraphView = {
      components: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      edges: [{ from: "a", to: "b", status: "declared" }],
    };
    expect(legendKeys(renderSystemDiagram({ title: "Small", view: small }))).toEqual(["declared"]);
    expect(legendKeys(renderSystemDiagram({ title: "Small", view: { ...small, edges: [{ from: "a", to: "b", status: "forbidden" }] }, status: { version: 1, checkedAt: "2026-01-01", components: { a: { state: "up", source: "manual" } } } }))).toEqual(["forbidden", "up"]);
    expect(legendKeys(renderSystemDiagram(full, { showLegend: false }))).toEqual([]);
    expect(renderSystemDiagram({ title: "Small", view: small })).not.toMatch(/Operational|Not monitored|violations/);
    expect(renderSystemDiagram({ title: "Small", view: small, status: { version: 1, checkedAt: "2026-01-01", components: {} } })).toContain(">Not monitored</text>");
  });

  it("is byte-stable and independent of unrelated state", () => {
    expect(renderSystemDiagram(full)).toBe(svg);
    expect(renderSystemDiagram(JSON.parse(JSON.stringify(full)) as SystemDiagramInput)).toBe(svg);
    expect(svg.endsWith("</svg>\n")).toBe(true);
  });

  it("derives ids from the title so two diagrams can share a page", () => {
    const ids = (text: string): string[] => [...text.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    const other = renderSystemDiagram({ ...full, title: "Another system" });
    const dark = renderSystemDiagram(full, { theme: "dark" });
    expect(ids(svg).length).toBeGreaterThan(4);
    expect(new Set(ids(svg)).size).toBe(ids(svg).length);
    for (const id of ids(other)) expect(ids(svg)).not.toContain(id);
    for (const id of ids(dark)) expect(ids(svg)).not.toContain(id);
  });

  it("renders light and dark themes with accessible contrast", () => {
    const dark = renderSystemDiagram(full, { theme: "dark" });
    expect(dark).not.toBe(svg);
    expect(checkXml(dark).ok).toBe(true);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#0b0f19"');
    expect(dark).toMatch(/<rect x="0.5" y="0.5"[^>]*rx="16" fill="#0b0f19"/);
    expect(dark.replace(/#[0-9a-f]{6}/g, "#").replace(/rs[a-z0-9]{1,7}-/g, "")).toBe(svg.replace(/#[0-9a-f]{6}/g, "#").replace(/rs[a-z0-9]{1,7}-/g, ""));
    for (const palette of Object.values(DIAGRAM_PALETTES)) {
      for (const background of [palette.surface, palette.card]) {
        for (const color of [palette.text, palette.muted, palette.okText, palette.warnText, palette.errorText]) {
          expect(contrast(color, background), `${color} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const color of [palette.ok, palette.warn, palette.error, palette.edge]) expect(contrast(color, background), `${color} on ${background}`).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(palette.onError, palette.error)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("honours direction, maxWidth and showHeader", () => {
    const lr = cardsOf(renderSystemDiagram(full, { direction: "LR" }));
    const tb = cardsOf(renderSystemDiagram(full, { direction: "TB" }));
    const at = (cards: typeof lr, id: string) => cards.find((card) => card.id === id)!;
    expect(at(lr, "ui").x).toBeLessThan(at(lr, "api").x);
    expect(at(tb, "ui").y).toBeLessThan(at(tb, "api").y);

    const natural = viewBox(svg);
    const capped = renderSystemDiagram(full, { maxWidth: 400 });
    expect(capped).toMatch(/^<svg xmlns="[^"]+" width="400" height="[\d.]+" viewBox/);
    expect(viewBox(capped)).toEqual(natural);
    expect(renderSystemDiagram(full, { maxWidth: 100000 })).toBe(svg);

    const bare = renderSystemDiagram(full, { showHeader: false });
    expect(bare).not.toContain(">Outage</text>");
    expect(bare).toContain("<title");
    expect(viewBox(bare).height).toBeLessThan(natural.height);
  });

  it("handles an empty view and cycles", () => {
    const empty = renderSystemDiagram({ title: "", view: { components: [], edges: [] } });
    expect(checkXml(empty).ok).toBe(true);
    expect(empty).toContain("No components yet");
    const cycle: WorkspaceGraphView = {
      components: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      edges: [{ from: "a", to: "b", status: "declared" }, { from: "b", to: "c", status: "declared" }, { from: "c", to: "a", status: "forbidden" }, { from: "a", to: "a", status: "declared" }, { from: "a", to: "ghost", status: "declared" }],
    };
    const drawn = renderSystemDiagram({ title: "Cycle", view: cycle });
    expect(checkXml(drawn).ok).toBe(true);
    expect(drawn.match(/<path data-edge=/g)).toHaveLength(3);
    expect(drawn).not.toMatch(/NaN|="-\d/);
  });
});

describe("text estimator", () => {
  it("grows with length, size and weight", () => {
    expect(estimateTextWidth("", 12)).toBe(0);
    expect(estimateTextWidth("abcd", 12)).toBeGreaterThan(estimateTextWidth("abc", 12));
    expect(estimateTextWidth("abc", 14)).toBeGreaterThan(estimateTextWidth("abc", 12));
    expect(estimateTextWidth("abc", 12, 600)).toBeGreaterThan(estimateTextWidth("abc", 12));
    expect(estimateTextWidth("WWW", 12)).toBeGreaterThan(estimateTextWidth("iii", 12));
    expect(estimateTextWidth("日本語", 12)).toBeGreaterThan(estimateTextWidth("abc", 12));
  });

  it("truncates with an ellipsis and never exceeds the room", () => {
    expect(truncateText("short", 200, 12)).toBe("short");
    expect(truncateText("  spaced \n out  ", 200, 12)).toBe("spaced out");
    for (const room of [0, 5, 12, 40, 80, 160]) {
      const cut = truncateText("The quick brown fox jumps over the lazy dog 😀😀😀", room, 12, 600);
      expect(estimateTextWidth(cut, 12, 600)).toBeLessThanOrEqual(room);
      if (cut && cut.length < 40) expect(cut.endsWith("…")).toBe(true);
    }
    expect(truncateText("abc", 0, 12)).toBe("");
    // Never splits a surrogate pair.
    expect(truncateText("😀😀😀😀😀😀", 40, 12)).toMatch(/^(😀)*…$/u);
  });
});

describe("renderStatusBadge", () => {
  it("renders a small accessible flat badge", () => {
    const badge = renderStatusBadge({ label: "blueprint", message: "passing", tone: "ok" });
    expect(checkXml(badge).ok).toBe(true);
    expect(badge).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="20" viewBox="0 0 \d+ 20" role="img"/);
    expect(badge).toContain(">blueprint: passing</title>");
    expect(badge).toContain(">blueprint</text>");
    expect(badge).toContain(">passing</text>");
    expect(badge).not.toMatch(/<script|foreignObject|href=|<style/);
    expect(renderStatusBadge({ label: "blueprint", message: "passing", tone: "ok" })).toBe(badge);
  });

  it("varies with tone and theme and escapes its text", () => {
    const tones = (["ok", "warn", "error", "neutral"] as const).map((tone) => renderStatusBadge({ label: "system", message: "state", tone }));
    expect(new Set(tones).size).toBe(4);
    expect(renderStatusBadge({ label: "system", message: "operational", tone: "ok" }, { theme: "dark" })).not.toBe(renderStatusBadge({ label: "system", message: "operational", tone: "ok" }));
    const hostile = renderStatusBadge({ label: "<a&b>", message: '"x"'.repeat(200), tone: "error" });
    expect(checkXml(hostile).ok).toBe(true);
    expect(hostile).toContain("&lt;a&amp;b&gt;");
    expect(Number(/width="(\d+)"/.exec(hostile)![1])).toBeLessThan(520);
    for (const fill of ["#1a7f37", "#8a5a00", "#c21f2b", "#57606e", "#30363f", "#1f7a36", "#845306", "#b62324", "#4b5565", "#1c2330"]) {
      expect(contrast("#ffffff", fill), fill).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("calm mode", () => {
  const calmBlueprint = blueprintSchema.parse({
    version: "0.1",
    system: { name: "Layers" },
    components: [
      { id: "app", name: "App", kind: "frontend", paths: ["src/app/**"] },
      { id: "domain", name: "Domain", kind: "service", paths: ["src/domain/**"] },
      { id: "infra", name: "Infra", kind: "service", paths: ["src/infra/**"] },
      { id: "shared", name: "Shared", kind: "library", paths: ["src/shared/**"], public: true },
      { id: "tests", name: "Tests", kind: "test", paths: ["tests/**"] },
    ],
  });
  const calmView: WorkspaceGraphView = {
    components: [
      { id: "app", name: "App", kind: "frontend", files: 7 },
      { id: "domain", name: "Domain", kind: "service", files: 3 },
      { id: "infra", name: "Infra", kind: "service", files: 2 },
      { id: "shared", name: "Shared", kind: "library", files: 1 },
      { id: "tests", name: "Tests", kind: "test", files: 4 },
    ],
    edges: [
      { from: "app", to: "domain", status: "declared" },
      { from: "domain", to: "infra", status: "declared" },
      { from: "app", to: "infra", status: "declared" },
      { from: "app", to: "shared", status: "declared" },
      { from: "domain", to: "shared", status: "declared" },
      { from: "infra", to: "shared", status: "declared" },
      { from: "tests", to: "app", status: "declared" },
      { from: "tests", to: "domain", status: "declared" },
    ],
  };
  const input: SystemDiagramInput = { title: "Layers", view: calmView, blueprint: calmBlueprint, fileCounts: { app: 99 } };
  const edgesOf = (svg: string): number => (svg.match(/<path data-edge=/g) ?? []).length;
  const idsOf = (svg: string): string[] => [...svg.matchAll(/<g data-component="([^"]+)"/g)].map((match) => match[1]);

  it("is the default: hides tests, edges into shared components and implied dependencies", () => {
    const svg = renderSystemDiagram(input);
    expect(checkXml(svg).ok).toBe(true);
    expect(renderSystemDiagram(input, { detail: "calm" })).toBe(svg);
    expect(idsOf(svg).sort()).toEqual(["app", "domain", "infra", "shared"]);
    expect(edgesOf(svg)).toBe(2);
    expect(svg).toContain('data-tag="shared">shared by all</text>');
    expect(svg).toContain('data-note="simplified">Hidden for clarity: 1 test component, 3 edges into shared components, 1 implied dependency</text>');
    expect(svg).toContain("Hidden for clarity: 1 test component, 3 edges into shared components, 1 implied dependency.");
  });

  it("draws everything in full detail, without a footnote", () => {
    const svg = renderSystemDiagram(input, { detail: "full" });
    expect(checkXml(svg).ok).toBe(true);
    expect(idsOf(svg).sort()).toEqual(["app", "domain", "infra", "shared", "tests"]);
    expect(edgesOf(svg)).toBe(8);
    expect(svg).not.toContain("Hidden for clarity");
    expect(svg).not.toContain("data-tag");
  });

  it("prefers the file count carried by the view over fileCounts", () => {
    const svg = renderSystemDiagram(input);
    expect(svg).toContain(">frontend · 7 files</text>");
    expect(svg).not.toContain("99 files");
  });

  it("never hides undeclared, forbidden or missing edges", () => {
    const view: WorkspaceGraphView = {
      components: calmView.components,
      edges: [
        { from: "app", to: "domain", status: "declared" },
        { from: "domain", to: "infra", status: "declared" },
        { from: "app", to: "infra", status: "undeclared" },
        { from: "infra", to: "shared", status: "forbidden" },
        { from: "domain", to: "shared", status: "missing" },
        { from: "app", to: "shared", status: "declared" },
        { from: "tests", to: "infra", status: "forbidden" },
        { from: "tests", to: "app", status: "declared" },
      ],
    };
    const svg = renderSystemDiagram({ ...input, view });
    // The test component is part of a forbidden edge, so it stays, and so do its edges.
    expect(idsOf(svg)).toContain("tests");
    expect(svg.match(/<path data-edge="undeclared"/g)).toHaveLength(1);
    expect(svg.match(/<path data-edge="forbidden"/g)).toHaveLength(2);
    expect(svg.match(/<path data-edge="missing"/g)).toHaveLength(1);
    expect(svg.match(/<path data-edge="declared"/g)).toHaveLength(3);
    expect(svg).toContain("Hidden for clarity: 1 edge into shared components</text>");
  });

  it("keeps every edge and component a commit changed", () => {
    const before: WorkspaceGraphView = {
      components: calmView.components.filter((component) => component.id !== "tests"),
      edges: calmView.edges.filter((edge) => edge.from !== "tests" && !(edge.from === "app" && edge.to === "infra") && !(edge.from === "app" && edge.to === "shared")),
    };
    const diff = diffArchitecture(before, calmView);
    expect(diff.components.added).toEqual(["tests"]);
    const svg = renderSystemDiagram({ ...input, diff });
    expect(idsOf(svg)).toContain("tests");
    // Added in this commit: app → infra (otherwise implied), app → shared (otherwise hidden) and both test edges.
    expect(edgesOf(svg)).toBe(6);
    expect(svg).toContain("Hidden for clarity: 2 edges into shared components</text>");
  });

  it("reduces cycles without losing reachability and stays deterministic", () => {
    const view: WorkspaceGraphView = {
      components: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      edges: [
        { from: "a", to: "b", status: "declared" },
        { from: "b", to: "c", status: "declared" },
        { from: "c", to: "a", status: "declared" },
        { from: "a", to: "c", status: "declared" },
      ],
    };
    const svg = renderSystemDiagram({ title: "Cycle", view });
    expect(checkXml(svg).ok).toBe(true);
    expect(edgesOf(svg)).toBe(3);
    expect(svg).toContain("Hidden for clarity: 1 implied dependency</text>");
    expect(renderSystemDiagram({ title: "Cycle", view: { components: [...view.components].reverse(), edges: [...view.edges].reverse() } })).toContain("Hidden for clarity: 1 implied dependency</text>");
    expect(renderSystemDiagram({ title: "Cycle", view })).toBe(svg);
  });
});
