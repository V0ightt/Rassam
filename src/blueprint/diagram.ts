import type { ArchitectureDiff } from "./arch-diff";
import { layoutGraph, type LayoutDirection, type LayoutPoint, type LayoutResult } from "./layout";
import type { Blueprint } from "./schema";
import { overallStatus, type ComponentState, type OverallStatus, type SystemStatus } from "./status";
import { hash53, plural } from "./util";
import type { GraphEdgeStatus, WorkspaceGraphView } from "./workspace";

// The system design as one self-contained SVG: components as cards, their
// dependencies as arrows, live status and the changes of a commit on top.
//
// The output must survive GitHub's README pipeline, where an SVG is only ever
// an <img>: no scripts, no external resources, no foreignObject, no web fonts.
// Text cannot be measured there, so widths are estimated per character and
// every string is truncated to the room it has. Same input, same bytes.

export type DiagramTheme = "light" | "dark";

export interface SystemDiagramInput {
  title: string;
  subtitle?: string;
  view: WorkspaceGraphView;
  /** Adds the verified / derived mark and tells which components declare `runtime`. */
  blueprint?: Blueprint | null;
  status?: SystemStatus | null;
  diff?: ArchitectureDiff | null;
  findings?: { errors: number; warnings: number };
  commit?: string;
  /** ISO-8601 time shown in the header. Pass it in: the renderer never reads the clock. */
  generatedAt?: string;
  /** Files owned per component id, shown on the card when the view itself carries no `files` count. */
  fileCounts?: Record<string, number>;
}

export interface SystemDiagramOptions {
  theme?: DiagramTheme;
  /** Flow direction; when omitted the better-proportioned of the two is used. */
  direction?: LayoutDirection;
  /** Caps the `width` attribute (the drawing scales down; the viewBox keeps natural units). */
  maxWidth?: number;
  showLegend?: boolean;
  showHeader?: boolean;
  /**
   * "calm" (default) leaves out what a reader can take for granted: test
   * components, edges into components marked `public`, and declared
   * dependencies already implied by a longer declared path. Undeclared,
   * forbidden and missing edges, and everything a commit changed, always stay.
   * "full" draws every component and edge.
   */
  detail?: DiagramDetail;
}

export type DiagramDetail = "calm" | "full";

export interface DiagramPalette {
  surface: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  edge: string;
  /** Shape and line colors. */
  ok: string;
  warn: string;
  error: string;
  /** Text colors (WCAG AA on surface and card). */
  okText: string;
  warnText: string;
  errorText: string;
  /** Text on a solid `error` badge. */
  onError: string;
}

export const DIAGRAM_PALETTES: Record<DiagramTheme, DiagramPalette> = {
  light: {
    surface: "#ffffff",
    card: "#f7f8fa",
    border: "#d8dde4",
    text: "#0b0f19",
    muted: "#57606e",
    edge: "#7b8594",
    ok: "#1a7f37",
    warn: "#a87400",
    error: "#cf222e",
    okText: "#116329",
    warnText: "#7d4e00",
    errorText: "#a40e26",
    onError: "#ffffff",
  },
  dark: {
    surface: "#0b0f19",
    card: "#131a29",
    border: "#2a3447",
    text: "#e8ebf1",
    muted: "#9aa5b5",
    edge: "#657186",
    ok: "#3fb950",
    warn: "#d29922",
    error: "#f85149",
    okText: "#56d364",
    warnText: "#e3b341",
    errorText: "#ff7b72",
    onError: "#0b0f19",
  },
};

const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

// ── Text: escaping, width estimate, truncation ────────────────

/** Escape text for XML content and attributes; drops characters XML 1.0 cannot carry. */
export function escapeXml(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (code === 0x09 || code === 0x0a || code === 0x0d) out += " ";
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff) continue;
    else if (char === "&") out += "&amp;";
    else if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (char === '"') out += "&quot;";
    else if (char === "'") out += "&#39;";
    else out += char;
  }
  return out;
}

const NARROW = new Set([..." iIl.,:;|!'`j·"]);
const SLIM = new Set([...'ftr()[]{}-/\\"*'] as string[]);
const WIDE = new Set([..."mMW@%"]);

function charEm(char: string): number {
  const code = char.codePointAt(0) as number;
  if (code >= 0x1f000) return 1.2;
  if (code >= 0x2e80) return 1.02;
  if (char === "…" || char === "—") return 1;
  if (NARROW.has(char)) return 0.32;
  if (SLIM.has(char)) return 0.4;
  if (WIDE.has(char)) return 0.95;
  if (code >= 0x41 && code <= 0x5a) return 0.74;
  if (char === "w") return 0.76;
  if (code >= 0x30 && code <= 0x39) return 0.58;
  if (code < 0x80) return 0.57;
  return 0.64;
}

/** Upper estimate of rendered width in px for a system sans-serif font. */
export function estimateTextWidth(text: string, fontSize: number, fontWeight = 400): number {
  let em = 0;
  for (const char of text) em += charEm(char);
  return em * fontSize * (fontWeight >= 600 ? 1.07 : 1);
}

/** Cut `text` so its estimated width fits `maxWidth`, ending with an ellipsis when shortened. */
export function truncateText(text: string, maxWidth: number, fontSize: number, fontWeight = 400): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (estimateTextWidth(clean, fontSize, fontWeight) <= maxWidth) return clean;
  const chars = Array.from(clean);
  for (let length = chars.length - 1; length > 0; length -= 1) {
    const candidate = `${chars.slice(0, length).join("").trimEnd()}…`;
    if (estimateTextWidth(candidate, fontSize, fontWeight) <= maxWidth) return candidate;
  }
  return estimateTextWidth("…", fontSize, fontWeight) <= maxWidth ? "…" : "";
}

/** Coordinates with at most two decimals, no trailing zeros. */
function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

interface TextStyle {
  size: number;
  weight?: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  extra?: string;
}

function text(x: number, y: number, content: string, style: TextStyle): string {
  if (!content) return "";
  const weight = style.weight && style.weight !== 400 ? ` font-weight="${style.weight}"` : "";
  const anchor = style.anchor && style.anchor !== "start" ? ` text-anchor="${style.anchor}"` : "";
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(style.size)}"${weight}${anchor} fill="${style.fill}"${style.extra ?? ""}>${escapeXml(content)}</text>`;
}

// ── Shapes ────────────────────────────────────────────────────

type ShownState = ComponentState;

const STATE_LABEL: Record<ShownState, string> = { up: "Up", degraded: "Degraded", down: "Down", unknown: "No data" };

/** Status mark: color and shape both carry the state (circle, triangle, square, hollow circle). */
function stateShape(state: ShownState, cx: number, cy: number, palette: DiagramPalette): string {
  switch (state) {
    case "up":
      return `<circle data-state="up" cx="${n(cx)}" cy="${n(cy)}" r="4.5" fill="${palette.ok}"/>`;
    case "degraded":
      return `<path data-state="degraded" d="M${n(cx)} ${n(cy - 5)}L${n(cx + 5.4)} ${n(cy + 4.2)}L${n(cx - 5.4)} ${n(cy + 4.2)}Z" fill="${palette.warn}"/>`;
    case "down":
      return `<rect data-state="down" x="${n(cx - 4.3)}" y="${n(cy - 4.3)}" width="8.6" height="8.6" rx="1.5" fill="${palette.error}"/>`;
    case "unknown":
      return `<circle data-state="unknown" cx="${n(cx)}" cy="${n(cy)}" r="3.8" fill="none" stroke="${palette.muted}" stroke-width="1.5"/>`;
  }
}

function stateTextColor(state: ShownState, palette: DiagramPalette): string {
  return state === "up" ? palette.okText : state === "degraded" ? palette.warnText : state === "down" ? palette.errorText : palette.muted;
}

function checkMark(x: number, y: number, color: string): string {
  return `<path d="M${n(x)} ${n(y)}l2.8 2.8l5.2 -6.2" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

interface Pill {
  width: number;
  svg: (x: number, y: number) => string;
}

const PILL_HEIGHT = 26;

function pill(label: string, tone: { line: string; text: string }, icon: ((cx: number, cy: number) => string) | null): Pill {
  const size = 12;
  const labelWidth = estimateTextWidth(label, size, 600);
  const iconWidth = icon ? 16 : 0;
  const width = Math.ceil(labelWidth + iconWidth + 24);
  return {
    width,
    svg: (x, y) =>
      `<rect x="${n(x)}" y="${n(y)}" width="${width}" height="${PILL_HEIGHT}" rx="13" fill="${tone.line}" fill-opacity="0.1" stroke="${tone.line}" stroke-opacity="0.4"/>` +
      (icon ? icon(x + 17, y + PILL_HEIGHT / 2) : "") +
      text(x + 12 + iconWidth, y + 17.2, label, { size, weight: 600, fill: tone.text }),
  };
}

// ── Edges ─────────────────────────────────────────────────────

const EDGE_LABEL: Record<GraphEdgeStatus, string> = { declared: "", undeclared: "undeclared", forbidden: "forbidden", missing: "not observed" };
const EDGE_RANK: Record<GraphEdgeStatus, number> = { declared: 0, missing: 1, undeclared: 2, forbidden: 3 };
const EDGE_LEGEND: Record<GraphEdgeStatus, string> = {
  declared: "Declared dependency",
  undeclared: "Undeclared dependency",
  forbidden: "Forbidden dependency",
  missing: "Declared, not observed",
};

function edgeStroke(status: GraphEdgeStatus, palette: DiagramPalette): { color: string; label: string; attrs: string } {
  switch (status) {
    case "declared":
      return { color: palette.edge, label: palette.muted, attrs: ' stroke-width="1.4"' };
    case "undeclared":
      return { color: palette.warn, label: palette.warnText, attrs: ' stroke-width="1.5" stroke-dasharray="6 4"' };
    case "forbidden":
      return { color: palette.error, label: palette.errorText, attrs: ' stroke-width="2.5"' };
    case "missing":
      return { color: palette.edge, label: palette.muted, attrs: ' stroke-width="1.6" stroke-dasharray="0.1 4.5" stroke-linecap="round"' };
  }
}

/** Smooth path through route points: curves between layers, straight across them. */
function routePath(points: LayoutPoint[], horizontal: boolean): string {
  let d = `M${n(points[0].x)} ${n(points[0].y)}`;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (horizontal ? Math.abs(a.y - b.y) < 0.01 : Math.abs(a.x - b.x) < 0.01) d += `L${n(b.x)} ${n(b.y)}`;
    else if (horizontal) {
      const half = (b.x - a.x) / 2;
      d += `C${n(a.x + half)} ${n(a.y)} ${n(b.x - half)} ${n(b.y)} ${n(b.x)} ${n(b.y)}`;
    } else {
      const half = (b.y - a.y) / 2;
      d += `C${n(a.x)} ${n(a.y + half)} ${n(b.x)} ${n(b.y - half)} ${n(b.x)} ${n(b.y)}`;
    }
  }
  return d;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// ── Cards ─────────────────────────────────────────────────────

const CARD_WIDTH = 216;
const CARD_PAD = 14;

interface Card {
  id: string;
  name: string;
  kind: string;
  external: boolean;
  findings: number;
  files: number | null;
  state: ShownState | null;
  /** Verified by a person (check), or not human-authored ("derived" / "agent"). Human-authored facts carry no tag. */
  mark: "verified" | "derived" | "agent" | null;
  /** Calm mode hid the edges into this shared component. */
  shared: boolean;
  change: "added" | "removed" | null;
}

function renderCard(card: Card, box: Box, palette: DiagramPalette): string {
  const inner = CARD_WIDTH - CARD_PAD * 2;
  const removed = card.change === "removed";
  const parts: string[] = [];
  const stroke = card.change === "added" ? palette.ok : removed ? palette.error : palette.border;
  const strokeWidth = card.change === "added" ? 2 : 1;
  const dash = card.external || removed ? ' stroke-dasharray="5 4"' : "";
  parts.push(
    `<rect x="0.5" y="0.5" width="${n(box.width - 1)}" height="${n(box.height - 1)}" rx="12" fill="${palette.card}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`,
  );

  let nameRoom = inner;
  if (card.findings > 0) {
    const label = card.findings > 99 ? "99+" : String(card.findings);
    const width = Math.max(20, Math.ceil(estimateTextWidth(label, 10.5, 700) + 12));
    const x = CARD_WIDTH - CARD_PAD - width;
    parts.push(
      `<rect data-badge="violations" x="${n(x)}" y="11" width="${width}" height="18" rx="9" fill="${palette.error}"/>` +
        text(x + width / 2, 23.8, label, { size: 10.5, weight: 700, fill: palette.onError, anchor: "middle" }),
    );
    nameRoom -= width + 8;
  }
  parts.push(
    text(CARD_PAD, 25, truncateText(card.name, nameRoom, 13.5, 600), {
      size: 13.5,
      weight: 600,
      fill: palette.text,
      extra: removed ? ' text-decoration="line-through"' : "",
    }),
  );

  const facts = [card.external ? "external" : "", card.kind && card.kind !== "default" ? card.kind : card.external ? "" : "component"].filter(Boolean);
  if (card.files !== null && !card.external) facts.push(plural(card.files, "file"));
  let factsRoom = inner;
  if (card.shared) {
    const label = "shared by all";
    const width = Math.ceil(estimateTextWidth(label, 9.5) + 12);
    const x = CARD_WIDTH - CARD_PAD - width;
    parts.push(
      `<rect x="${n(x)}" y="32.5" width="${width}" height="15" rx="7.5" fill="${palette.surface}" stroke="${palette.border}"/>` +
        text(x + width / 2, 43.2, label, { size: 9.5, fill: palette.muted, anchor: "middle", extra: ' data-tag="shared"' }),
    );
    factsRoom -= width + 6;
  }
  parts.push(text(CARD_PAD, 43, truncateText(facts.join(" · "), factsRoom, 11), { size: 11, fill: palette.muted }));

  let markWidth = 0;
  if (card.mark) {
    const label = card.mark;
    const labelWidth = estimateTextWidth(label, 10.5);
    markWidth = labelWidth + (card.mark === "verified" ? 14 : 0);
    if (card.mark === "verified") parts.push(checkMark(CARD_WIDTH - CARD_PAD - labelWidth - 13, 58.4, palette.ok));
    parts.push(
      text(CARD_WIDTH - CARD_PAD, 62, label, { size: 10.5, fill: card.mark === "verified" ? palette.okText : palette.muted, anchor: "end", extra: ` data-mark="${card.mark}"` }),
    );
  }
  if (card.state) {
    parts.push(stateShape(card.state, CARD_PAD + 5, 58.2, palette));
    const room = inner - 16 - (markWidth ? markWidth + 10 : 0);
    parts.push(text(CARD_PAD + 16, 62, truncateText(STATE_LABEL[card.state], room, 11, 600), { size: 11, weight: 600, fill: stateTextColor(card.state, palette) }));
  }

  if (card.change) {
    const label = card.change === "added" ? "+ new" : "removed";
    const color = card.change === "added" ? palette.ok : palette.error;
    const width = Math.ceil(estimateTextWidth(label, 10, 600) + 14);
    const x = CARD_WIDTH - CARD_PAD - width;
    parts.push(
      `<rect x="${n(x)}" y="-9" width="${width}" height="18" rx="9" fill="${palette.surface}" stroke="${color}" stroke-width="1.2"/>` +
        text(x + width / 2, 3.6, label, {
          size: 10,
          weight: 600,
          fill: card.change === "added" ? palette.okText : palette.errorText,
          anchor: "middle",
          extra: ` data-change="${card.change}"`,
        }),
    );
  }

  const opacity = removed ? ' opacity="0.62"' : "";
  return `<g data-component="${escapeXml(card.id)}" transform="translate(${n(box.x)} ${n(box.y)})"${opacity}>${parts.join("")}</g>`;
}

// ── Header helpers ────────────────────────────────────────────

/** "2026-05-01T14:05:09Z" → "2026-05-01 14:05 UTC"; anything else is shown as given. */
function formatTime(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  if (!match) return value.trim().slice(0, 40);
  const zone = !match[3] ? "" : match[3] === "Z" || /^[+-]00:?00$/.test(match[3]) ? " UTC" : ` ${match[3]}`;
  return `${match[1]} ${match[2]}${zone}`;
}

function violationText(findings: { errors: number; warnings: number }): string {
  const errors = Math.max(0, Math.floor(findings.errors) || 0);
  const warnings = Math.max(0, Math.floor(findings.warnings) || 0);
  if (errors + warnings === 0) return "0 violations";
  return [errors ? plural(errors, "error") : "", warnings ? plural(warnings, "warning") : ""].filter(Boolean).join(" · ");
}

const OVERALL_LABEL: Record<OverallStatus, string> = { operational: "Operational", degraded: "Degraded", outage: "Outage", unknown: "Not monitored" };
const OVERALL_STATE: Record<OverallStatus, ShownState> = { operational: "up", degraded: "degraded", outage: "down", unknown: "unknown" };

// ── The diagram ───────────────────────────────────────────────

const OUTER = 28;
const MIN_CONTENT_WIDTH = 584;

function chooseLayout(
  nodes: Array<{ id: string; width: number; height: number; group?: string }>,
  edges: Array<{ from: string; to: string }>,
  direction: LayoutDirection | undefined,
): { layout: LayoutResult; direction: LayoutDirection } {
  const run = (dir: LayoutDirection): LayoutResult =>
    layoutGraph(nodes, edges, dir === "LR" ? { direction: dir, nodeGap: 30, layerGap: 124, padding: 0, maxPerLayer: 6 } : { direction: dir, nodeGap: 40, layerGap: 88, padding: 0, maxPerLayer: 5 });
  if (direction) return { layout: run(direction), direction };
  const lr = run("LR");
  const tb = run("TB");
  // Prefer the shape closest to a 3:2 landscape, which reads best in a README column.
  const score = (layout: LayoutResult): number => Math.abs(Math.log(Math.max(layout.width, MIN_CONTENT_WIDTH) / Math.max(layout.height, 1) / 1.5));
  return score(tb) < score(lr) - 1e-9 ? { layout: tb, direction: "TB" } : { layout: lr, direction: "LR" };
}

export function renderSystemDiagram(input: SystemDiagramInput, options: SystemDiagramOptions = {}): string {
  const theme: DiagramTheme = options.theme === "dark" ? "dark" : "light";
  const palette = DIAGRAM_PALETTES[theme];
  const showHeader = options.showHeader !== false;
  const showLegend = options.showLegend !== false;
  const uid = `rs${hash53(`${input.title}\u0000${theme}`).toString(36).slice(0, 7)}`;
  const diff = input.diff && input.diff.changed ? input.diff : null;

  // ── Model ──
  const blueprintById = new Map((input.blueprint?.components ?? []).map((component) => [component.id, component]));
  const addedComponents = new Set(diff?.components.added ?? []);
  const edgeKey = (edge: { from: string; to: string }): string => `${edge.from}\u0000${edge.to}`;
  const addedEdges = new Set((diff?.edges.added ?? []).map(edgeKey));

  // Calm mode: decide what to leave out before anything is laid out.
  const calm = options.detail !== "full";
  const viewIds = new Set(input.view.components.map((component) => component.id));
  const viewEdges = new Map<string, WorkspaceGraphView["edges"][number]>();
  for (const edge of input.view.edges) {
    if (edge.from === edge.to || !viewIds.has(edge.from) || !viewIds.has(edge.to) || viewEdges.has(edgeKey(edge))) continue;
    viewEdges.set(edgeKey(edge), edge);
  }
  const hidden = { tests: 0, shared: 0, implied: 0 };
  const hiddenComponents = new Set<string>();
  const sharedComponents = new Set<string>();
  if (calm) {
    const changedEdges = new Set([...(diff?.edges.statusChanged ?? []).map(edgeKey), ...addedEdges]);
    /** Never simplified away: anything that is not a plain declared dependency, and anything the commit touched. */
    const keep = (edge: { from: string; to: string; status: GraphEdgeStatus }): boolean => edge.status !== "declared" || changedEdges.has(edgeKey(edge));
    const pinned = new Set<string>();
    for (const edge of viewEdges.values()) {
      if (!keep(edge)) continue;
      pinned.add(edge.from);
      pinned.add(edge.to);
    }
    for (const edge of diff?.edges.removed ?? []) {
      pinned.add(edge.from);
      pinned.add(edge.to);
    }
    for (const component of input.view.components) {
      if (component.kind !== "test" || (component.findings ?? 0) > 0 || addedComponents.has(component.id) || pinned.has(component.id)) continue;
      hiddenComponents.add(component.id);
    }
    hidden.tests = hiddenComponents.size;
    for (const [key, edge] of [...viewEdges]) {
      if (hiddenComponents.has(edge.from) || hiddenComponents.has(edge.to)) viewEdges.delete(key);
      else if (!keep(edge) && blueprintById.get(edge.to)?.public) {
        viewEdges.delete(key);
        sharedComponents.add(edge.to);
        hidden.shared += 1;
      }
    }
    // Transitive reduction over declared edges: drop one when another declared path already connects its ends.
    const next = new Map<string, Set<string>>();
    for (const edge of viewEdges.values()) {
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
    for (const key of [...viewEdges.keys()].sort()) {
      const edge = viewEdges.get(key) as WorkspaceGraphView["edges"][number];
      if (keep(edge) || !reaches(edge.from, edge.to)) continue;
      next.get(edge.from)?.delete(edge.to);
      viewEdges.delete(key);
      hidden.implied += 1;
    }
  }
  const simplified = [
    hidden.tests ? plural(hidden.tests, "test component") : "",
    hidden.shared ? `${plural(hidden.shared, "edge")} into shared components` : "",
    hidden.implied ? plural(hidden.implied, "implied dependency", "implied dependencies") : "",
  ].filter(Boolean);
  const footnote = simplified.length ? `Hidden for clarity: ${simplified.join(", ")}` : "";

  const cards = new Map<string, Card>();
  for (const component of input.view.components) {
    if (cards.has(component.id) || hiddenComponents.has(component.id)) continue;
    const declared = blueprintById.get(component.id);
    const reported = input.status?.components[component.id]?.state;
    const state: ShownState | null = reported && reported !== "unknown" ? reported : declared?.runtime ? "unknown" : null;
    const files =
      typeof component.files === "number"
        ? component.files
        : input.fileCounts && Object.prototype.hasOwnProperty.call(input.fileCounts, component.id)
          ? input.fileCounts[component.id]
          : null;
    const source = declared?.provenance?.source;
    cards.set(component.id, {
      id: component.id,
      name: component.name || component.id,
      kind: component.kind ?? "",
      external: Boolean(component.external),
      findings: Math.max(0, Math.floor(component.findings ?? 0) || 0),
      files: typeof files === "number" && Number.isFinite(files) && files >= 0 ? Math.floor(files) : null,
      state,
      mark: declared?.verified ? "verified" : source === "derived" || source === "agent" ? source : null,
      shared: sharedComponents.has(component.id),
      change: addedComponents.has(component.id) ? "added" : null,
    });
  }
  const removedCards: Card[] = (diff?.components.removed ?? [])
    .filter((id, index, all) => !cards.has(id) && all.indexOf(id) === index)
    .map((id) => ({ id, name: id, kind: "", external: false, findings: 0, files: null, state: null, mark: null, shared: false, change: "removed" as const }));

  const live = [...cards.values()];
  const hasFooter = live.some((card) => card.state !== null || card.mark !== null);
  const cardHeight = hasFooter ? 76 : 56;

  interface DrawnEdge {
    from: string;
    to: string;
    status: GraphEdgeStatus;
    change: "added" | "removed" | null;
  }
  const drawn = new Map<string, DrawnEdge>();
  for (const edge of viewEdges.values()) {
    if (!cards.has(edge.from) || !cards.has(edge.to)) continue;
    drawn.set(edgeKey(edge), { from: edge.from, to: edge.to, status: edge.status, change: addedEdges.has(edgeKey(edge)) ? "added" : null });
  }
  /** Removed edges are drawn as direct ghost curves: they must not influence the layout of what exists. */
  const ghostEdges: DrawnEdge[] = [];
  const removedIds = new Set(removedCards.map((card) => card.id));
  for (const edge of diff?.edges.removed ?? []) {
    if (edge.from === edge.to || drawn.has(edgeKey(edge))) continue;
    const entry: DrawnEdge = { from: edge.from, to: edge.to, status: edge.status, change: "removed" };
    if ((cards.has(edge.from) || removedIds.has(edge.from)) && (cards.has(edge.to) || removedIds.has(edge.to))) ghostEdges.push(entry);
  }

  // ── Layout ──
  const { layout, direction } = chooseLayout(
    live.map((card) => ({ id: card.id, width: CARD_WIDTH, height: cardHeight, group: card.external ? "~external" : card.kind && card.kind !== "default" ? card.kind : undefined })),
    [...drawn.values()].map((edge) => ({ from: edge.from, to: edge.to })),
    options.direction,
  );
  const horizontal = direction === "LR";
  const graphWidth = live.length ? layout.width : 0;
  const graphHeight = live.length ? layout.height : 0;

  const statusCounts = { up: 0, degraded: 0, down: 0, unknown: 0 };
  for (const card of live) if (card.state) statusCounts[card.state] += 1;
  const monitored = statusCounts.up + statusCounts.degraded + statusCounts.down + statusCounts.unknown;
  const overall = overallStatus(statusCounts);
  const showStatus = monitored > 0 || Boolean(input.status);
  const overallLabel = overall === "unknown" && monitored > 0 ? "No data" : OVERALL_LABEL[overall];
  const componentsWithFindings = live.filter((card) => card.findings > 0).length;

  // ── Header ──
  const pills: Pill[] = [];
  if (showStatus) {
    const state = OVERALL_STATE[overall];
    const line = state === "up" ? palette.ok : state === "degraded" ? palette.warn : state === "down" ? palette.error : palette.muted;
    pills.push(pill(overallLabel, { line, text: stateTextColor(state, palette) }, (cx, cy) => stateShape(state, cx, cy, palette).replace(/ data-state="[a-z]+"/, "")));
  }
  if (input.findings) {
    const clean = input.findings.errors + input.findings.warnings <= 0;
    const tone = clean ? { line: palette.ok, text: palette.okText } : input.findings.errors > 0 ? { line: palette.error, text: palette.errorText } : { line: palette.warn, text: palette.warnText };
    pills.push(pill(violationText(input.findings), tone, clean ? (cx, cy) => checkMark(cx - 5, cy + 0.6, palette.ok) : null));
  }
  const pillsWidth = pills.reduce((sum, item) => sum + item.width, 0) + Math.max(0, pills.length - 1) * 8;
  const meta = [input.commit ? input.commit.trim().slice(0, 7) : "", input.generatedAt ? formatTime(input.generatedAt) : ""].filter(Boolean).join(" · ");

  const removedPerRow = (contentWidth: number): number => Math.max(1, Math.floor((contentWidth + 24) / (CARD_WIDTH + 24)));
  const contentWidth = Math.max(MIN_CONTENT_WIDTH, graphWidth);
  const width = Math.ceil(contentWidth + OUTER * 2);

  const body: string[] = [];
  let cursor = OUTER;
  if (showHeader) {
    const titleRoom = contentWidth - (pillsWidth ? pillsWidth + 20 : 0);
    body.push(text(OUTER, cursor + 20, truncateText(input.title, titleRoom, 20, 600), { size: 20, weight: 600, fill: palette.text }));
    let pillX = width - OUTER - pillsWidth;
    for (const item of pills) {
      body.push(item.svg(pillX, cursor));
      pillX += item.width + 8;
    }
    cursor += 30;
    if (input.subtitle || meta) {
      const metaText = truncateText(meta, contentWidth * 0.6, 11);
      const metaWidth = metaText ? estimateTextWidth(metaText, 11) + 16 : 0;
      if (input.subtitle) body.push(text(OUTER, cursor + 13, truncateText(input.subtitle, contentWidth - metaWidth, 13), { size: 13, fill: palette.muted }));
      if (metaText) body.push(text(width - OUTER, cursor + 13, metaText, { size: 11, fill: palette.muted, anchor: "end" }));
      cursor += 22;
    }
    if (diff) {
      const lead = "Changed in this commit:";
      const summary = truncateText(diff.summary, contentWidth - estimateTextWidth(`${lead} `, 12, 600), 12);
      body.push(
        `<text x="${OUTER}" y="${n(cursor + 13)}" font-size="12" fill="${palette.muted}" data-diff="summary"><tspan font-weight="600" fill="${palette.text}">${lead}</tspan> ${escapeXml(summary)}</text>`,
      );
      cursor += 22;
    }
    cursor += 10;
    body.push(`<path d="M${OUTER} ${n(cursor + 0.5)}H${width - OUTER}" stroke="${palette.border}"/>`);
    cursor += 30;
  } else cursor += 10;

  // ── Graph ──
  const originX = OUTER + (contentWidth - graphWidth) / 2;
  const originY = cursor;
  const boxes = new Map<string, Box>();
  for (const [id, placed] of layout.nodes) boxes.set(id, { x: originX + placed.x, y: originY + placed.y, width: placed.width, height: placed.height });
  cursor += graphHeight;

  if (removedCards.length) {
    if (live.length) cursor += 44;
    const perRow = removedPerRow(contentWidth);
    removedCards.forEach((card, index) => {
      boxes.set(card.id, { x: OUTER + (index % perRow) * (CARD_WIDTH + 24), y: cursor + Math.floor(index / perRow) * (cardHeight + 30), width: CARD_WIDTH, height: cardHeight });
    });
    const rows = Math.ceil(removedCards.length / perRow);
    cursor += rows * cardHeight + (rows - 1) * 30;
  }
  if (!live.length && !removedCards.length) {
    body.push(text(width / 2, cursor + 24, "No components yet", { size: 13, fill: palette.muted, anchor: "middle" }));
    cursor += 48;
  }

  // Routes, shifted to the canvas, with ports spread along each card side.
  interface Route {
    edge: DrawnEdge;
    points: LayoutPoint[];
    vertical: boolean;
  }
  const routes: Route[] = [];
  for (const route of layout.edges) {
    const edge = drawn.get(edgeKey(route));
    if (!edge) continue;
    routes.push({ edge, points: route.points.map((point) => ({ x: point.x + originX, y: point.y + originY })), vertical: !horizontal });
  }
  const ports = new Map<string, Array<{ route: Route; end: "first" | "last"; other: number }>>();
  const cross = (point: LayoutPoint): number => (horizontal ? point.y : point.x);
  const main = (point: LayoutPoint): number => (horizontal ? point.x : point.y);
  for (const route of routes) {
    const last = route.points.length - 1;
    for (const end of ["first", "last"] as const) {
      const point = route.points[end === "first" ? 0 : last];
      const next = route.points[end === "first" ? 1 : last - 1];
      const id = end === "first" ? route.edge.from : route.edge.to;
      const key = `${id}\u0000${main(next) > main(point) ? "out" : "in"}`;
      const list = ports.get(key);
      const entry = { route, end, other: cross(next) };
      if (list) list.push(entry);
      else ports.set(key, [entry]);
    }
  }
  for (const [key, list] of ports) {
    if (list.length < 2) continue;
    const box = boxes.get(key.split("\u0000")[0]) as Box;
    const side = horizontal ? box.height : box.width;
    const spacing = Math.max(0, Math.min(14, (side - 28) / list.length));
    list.sort((a, b) => a.other - b.other || (edgeKey(a.route.edge) < edgeKey(b.route.edge) ? -1 : 1));
    list.forEach((entry, index) => {
      const point = entry.route.points[entry.end === "first" ? 0 : entry.route.points.length - 1];
      const offset = (index - (list.length - 1) / 2) * spacing;
      if (horizontal) point.y += offset;
      else point.x += offset;
    });
  }

  const center = (box: Box): LayoutPoint => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  for (const edge of ghostEdges) {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) continue;
    const a = center(from);
    const b = center(to);
    const stacked = Math.abs(b.y - a.y) >= (from.height + to.height) / 2;
    const points: LayoutPoint[] = stacked
      ? [{ x: a.x, y: b.y > a.y ? from.y + from.height : from.y }, { x: b.x, y: b.y > a.y ? to.y : to.y + to.height }]
      : [{ x: b.x > a.x ? from.x + from.width : from.x, y: a.y }, { x: b.x > a.x ? to.x : to.x + to.width, y: b.y }];
    routes.push({ edge, points, vertical: stacked });
  }

  routes.sort(
    (a, b) =>
      Number(b.edge.change === "removed") - Number(a.edge.change === "removed") ||
      EDGE_RANK[a.edge.status] - EDGE_RANK[b.edge.status] ||
      (edgeKey(a.edge) < edgeKey(b.edge) ? -1 : edgeKey(a.edge) > edgeKey(b.edge) ? 1 : 0),
  );

  const usedEdgeStatuses = new Set<GraphEdgeStatus>();
  const usedMarkers = new Set<string>();
  const edgeSvg: string[] = [];
  const labelSvg: string[] = [];
  const labelBoxes: Box[] = [];
  const cardBoxes = [...boxes.values()];
  let anyAdded = live.some((card) => card.change === "added");
  let anyRemoved = removedCards.length > 0;
  for (const route of routes) {
    const { edge } = route;
    const removed = edge.change === "removed";
    const style = removed ? { color: palette.error, label: palette.errorText, attrs: ' stroke-width="1.5" stroke-dasharray="4 4" opacity="0.55"' } : edgeStroke(edge.status, palette);
    const marker = removed ? "removed" : edge.status;
    usedMarkers.add(marker);
    if (removed) anyRemoved = true;
    else usedEdgeStatuses.add(edge.status);
    if (edge.change === "added") anyAdded = true;
    const d = routePath(route.points, !route.vertical);
    if (edge.change === "added") edgeSvg.push(`<path d="${d}" fill="none" stroke="${palette.ok}" stroke-width="7" stroke-opacity="0.28" stroke-linecap="round"/>`);
    edgeSvg.push(
      `<path data-edge="${removed ? "removed" : edge.status}" d="${d}" fill="none" stroke="${style.color}"${style.attrs} marker-end="url(#${uid}-arrow-${marker})"/>`,
    );

    const label = removed ? "removed" : [edge.change === "added" ? "+ new" : "", EDGE_LABEL[edge.status]].filter(Boolean).join(" · ");
    if (!label) continue;
    const labelWidth = Math.ceil(estimateTextWidth(label, 10, 600) + 14);
    // Candidates: the middle of each stretch between layers, nearest the route's middle first.
    const gaps: number[] = [];
    for (let index = 0; index + 1 < route.points.length; index += 2) gaps.push(index);
    const middle = (gaps.length - 1) / 2;
    gaps.sort((a, b) => Math.abs(a / 2 - middle) - Math.abs(b / 2 - middle) || a - b);
    for (const fraction of [0.5, 0.3, 0.7]) {
      let placed = false;
      for (const index of gaps) {
        const a = route.points[index];
        const b = route.points[index + 1];
        // The point at parameter t of the symmetric cubic drawn by routePath.
        const along = 1.5 * fraction - 1.5 * fraction * fraction + fraction ** 3;
        const across = fraction * fraction * (3 - 2 * fraction);
        const point = route.vertical ? { x: a.x + (b.x - a.x) * across, y: a.y + (b.y - a.y) * along } : { x: a.x + (b.x - a.x) * along, y: a.y + (b.y - a.y) * across };
        const box: Box = { x: point.x - labelWidth / 2, y: point.y - 8, width: labelWidth, height: 16 };
        const padded: Box = { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 };
        if (box.x < OUTER || box.x + box.width > width - OUTER) continue;
        if (labelBoxes.some((other) => intersects(padded, other)) || cardBoxes.some((other) => intersects(padded, other))) continue;
        labelBoxes.push(box);
        labelSvg.push(
          `<rect x="${n(box.x)}" y="${n(box.y)}" width="${labelWidth}" height="16" rx="8" fill="${palette.surface}" stroke="${edge.change === "added" ? palette.ok : style.color}" stroke-opacity="0.45"/>` +
            text(point.x, point.y + 3.5, label, { size: 10, weight: 600, fill: edge.change === "added" && edge.status === "declared" ? palette.okText : style.label, anchor: "middle", extra: ` data-edge-label="${removed ? "removed" : edge.status}"` }),
        );
        placed = true;
        break;
      }
      if (placed) break;
    }
  }

  body.push(`<g fill="none">${edgeSvg.join("")}</g>`);
  for (const card of live) body.push(renderCard(card, boxes.get(card.id) as Box, palette));
  for (const card of removedCards) body.push(renderCard(card, boxes.get(card.id) as Box, palette));
  body.push(labelSvg.join(""));

  // ── Legend: only what this picture uses ──
  if (showLegend) {
    const entries: Array<{ key: string; label: string; icon: (x: number, y: number) => string }> = [];
    for (const status of ["declared", "undeclared", "forbidden", "missing"] as const) {
      if (!usedEdgeStatuses.has(status)) continue;
      const style = edgeStroke(status, palette);
      entries.push({ key: status, label: EDGE_LEGEND[status], icon: (x, y) => `<path d="M${n(x)} ${n(y)}H${n(x + 24)}" fill="none" stroke="${style.color}"${style.attrs}/>` });
    }
    for (const state of ["up", "degraded", "down", "unknown"] as const) {
      if (!statusCounts[state]) continue;
      entries.push({ key: state, label: STATE_LABEL[state], icon: (x, y) => stateShape(state, x + 12, y, palette).replace(/ data-state="[a-z]+"/, "") });
    }
    const box = (stroke: string, extra: string) => (x: number, y: number): string =>
      `<rect x="${n(x + 2)}" y="${n(y - 6)}" width="20" height="12" rx="3.5" fill="${palette.card}" stroke="${stroke}"${extra}/>`;
    if (live.some((card) => card.external)) entries.push({ key: "external", label: "External system", icon: box(palette.muted, ' stroke-dasharray="3 2.5"') });
    if (live.some((card) => card.mark === "verified")) entries.push({ key: "verified", label: "Verified by a human", icon: (x, y) => checkMark(x + 7, y + 0.4, palette.ok) });
    if (componentsWithFindings) entries.push({ key: "violations", label: "Violations", icon: (x, y) => `<rect x="${n(x + 3)}" y="${n(y - 6.5)}" width="18" height="13" rx="6.5" fill="${palette.error}"/>` });
    if (anyAdded) entries.push({ key: "added", label: "Added", icon: box(palette.ok, ' stroke-width="1.8"') });
    if (anyRemoved) entries.push({ key: "removed", label: "Removed", icon: box(palette.error, ' stroke-dasharray="3 2.5" opacity="0.7"') });

    if (entries.length) {
      cursor += 28;
      body.push(`<path d="M${OUTER} ${n(cursor + 0.5)}H${width - OUTER}" stroke="${palette.border}"/>`);
      cursor += 26;
      let x = OUTER;
      for (const entry of entries) {
        const label = truncateText(entry.label, contentWidth - 32, 11);
        const entryWidth = 32 + estimateTextWidth(label, 11);
        if (x > OUTER && x + entryWidth > width - OUTER) {
          x = OUTER;
          cursor += 22;
        }
        body.push(`<g data-legend="${entry.key}">${entry.icon(x, cursor)}${text(x + 32, cursor + 3.8, label, { size: 11, fill: palette.muted })}</g>`);
        x += entryWidth + 22;
      }
      cursor += 8;
    }
  }
  if (footnote) {
    cursor += 24;
    body.push(text(OUTER, cursor, truncateText(footnote, contentWidth, 11), { size: 11, fill: palette.muted, extra: ' data-note="simplified"' }));
  }
  const height = Math.ceil(cursor + OUTER);

  // ── Accessible description ──
  const edgeCounts = { declared: 0, undeclared: 0, forbidden: 0, missing: 0 };
  for (const edge of drawn.values()) if (edge.change !== "removed") edgeCounts[edge.status] += 1;
  const liveEdges = edgeCounts.declared + edgeCounts.undeclared + edgeCounts.forbidden + edgeCounts.missing;
  const externals = live.filter((card) => card.external).length;
  const sentences: string[] = [];
  sentences.push(
    `${plural(live.length, "component")}${externals ? ` (${externals} external)` : ""} and ${plural(liveEdges, "dependency", "dependencies")}` +
      (liveEdges
        ? ` (${[`${edgeCounts.declared} declared`, edgeCounts.undeclared ? `${edgeCounts.undeclared} undeclared` : "", edgeCounts.forbidden ? `${edgeCounts.forbidden} forbidden` : "", edgeCounts.missing ? `${edgeCounts.missing} declared but not observed` : ""].filter(Boolean).join(", ")})`
        : ""),
  );
  if (showStatus) {
    sentences.push(
      monitored
        ? `Status: ${overallLabel.toLowerCase()}; ${statusCounts.up} up, ${statusCounts.degraded} degraded, ${statusCounts.down} down, ${statusCounts.unknown} without data`
        : "Status: not monitored",
    );
  }
  if (input.findings) sentences.push(`Violations: ${violationText(input.findings).replace(" · ", ", ")}`);
  else if (componentsWithFindings) sentences.push(`${plural(componentsWithFindings, "component")} with violations`);
  if (diff) sentences.push(`Changed: ${diff.summary}`);
  if (footnote) sentences.push(footnote);
  const listed = live.slice(0, 40).map((card) => {
    const notes = [card.state ? STATE_LABEL[card.state].toLowerCase() : "", card.findings ? plural(card.findings, "violation") : "", card.change === "added" ? "new" : ""].filter(Boolean);
    return notes.length ? `${card.name} (${notes.join(", ")})` : card.name;
  });
  if (listed.length) sentences.push(`Components: ${listed.join(", ")}${live.length > listed.length ? `, and ${live.length - listed.length} more` : ""}`);
  if (removedCards.length) sentences.push(`Removed: ${removedCards.map((card) => card.name).join(", ")}`);
  if (input.commit) sentences.push(`Commit ${input.commit.trim().slice(0, 7)}`);
  const description = `${sentences.join(". ")}.`;

  // ── Document ──
  const markerColor = (marker: string): string => (marker === "removed" ? palette.error : edgeStroke(marker as GraphEdgeStatus, palette).color);
  const defs = ["declared", "missing", "undeclared", "forbidden", "removed"]
    .filter((marker) => usedMarkers.has(marker))
    .map(
      (marker) =>
        `<marker id="${uid}-arrow-${marker}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${marker === "forbidden" ? 10 : 8.5}" markerHeight="${marker === "forbidden" ? 10 : 8.5}" markerUnits="userSpaceOnUse" orient="auto">` +
        `<path d="M1 1.2L9 5L1 8.8Z" fill="${markerColor(marker)}"/></marker>`,
    )
    .join("");

  const cap = typeof options.maxWidth === "number" && Number.isFinite(options.maxWidth) && options.maxWidth > 0 ? options.maxWidth : Infinity;
  const scale = Math.min(1, cap / width);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width * scale)}" height="${n(height * scale)}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${uid}-title ${uid}-desc" font-family="${FONT_FAMILY}">` +
    `<title id="${uid}-title">${escapeXml(input.title)}</title>` +
    `<desc id="${uid}-desc">${escapeXml(description)}</desc>` +
    (defs ? `<defs>${defs}</defs>` : "") +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="16" fill="${palette.surface}" stroke="${palette.border}"/>` +
    body.filter(Boolean).join("") +
    `</svg>\n`
  );
}

// ── Badge ─────────────────────────────────────────────────────

export type BadgeTone = "ok" | "warn" | "error" | "neutral";

export interface StatusBadgeInput {
  label: string;
  message: string;
  tone: BadgeTone;
}

const BADGE_TONES: Record<DiagramTheme, Record<BadgeTone, string>> = {
  light: { ok: "#1a7f37", warn: "#8a5a00", error: "#c21f2b", neutral: "#57606e" },
  dark: { ok: "#1f7a36", warn: "#845306", error: "#b62324", neutral: "#4b5565" },
};
const BADGE_LABEL: Record<DiagramTheme, string> = { light: "#30363f", dark: "#1c2330" };

/** A small flat badge ("blueprint | passing", "system | operational"): white text on solid fills in both themes. */
export function renderStatusBadge(input: StatusBadgeInput, options: { theme?: DiagramTheme } = {}): string {
  const theme: DiagramTheme = options.theme === "dark" ? "dark" : "light";
  const size = 11;
  const label = truncateText(input.label, 200, size, 600);
  const message = truncateText(input.message, 280, size, 600);
  const labelWidth = label ? Math.ceil(estimateTextWidth(label, size, 600) + 14) : 0;
  const messageWidth = Math.ceil(estimateTextWidth(message, size, 600) + 14);
  const width = labelWidth + messageWidth;
  const tone = BADGE_TONES[theme][input.tone] ?? BADGE_TONES[theme].neutral;
  const uid = `rb${hash53(`${input.label}\u0000${input.message}\u0000${input.tone}\u0000${theme}`).toString(36).slice(0, 7)}`;
  const name = [label, message].filter(Boolean).join(": ");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-labelledby="${uid}-title" font-family="${FONT_FAMILY}">` +
    `<title id="${uid}-title">${escapeXml(name)}</title>` +
    `<clipPath id="${uid}-clip"><rect width="${width}" height="20" rx="4"/></clipPath>` +
    `<g clip-path="url(#${uid}-clip)">` +
    (labelWidth ? `<rect width="${labelWidth}" height="20" fill="${BADGE_LABEL[theme]}"/>` : "") +
    `<rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${tone}"/>` +
    `</g>` +
    (labelWidth ? text(labelWidth / 2, 14, label, { size, weight: 600, fill: "#ffffff", anchor: "middle" }) : "") +
    text(labelWidth + messageWidth / 2, 14, message, { size, weight: 600, fill: "#ffffff", anchor: "middle" }) +
    `</svg>\n`
  );
}
