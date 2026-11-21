// `.rassam/layout.json`: canvas positions per component. Presentation only;
// it never affects checks, so parsing is lenient and never throws.

export interface LayoutPosition {
  x: number;
  y: number;
}

export type BlueprintLayout = Record<string, LayoutPosition>;

const MAX_LAYOUT_ENTRIES = 5_000;
const MAX_LAYOUT_ID_LENGTH = 200;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep only well-formed `{ x, y }` entries from an untrusted value. */
export function sanitizeLayout(value: unknown): BlueprintLayout {
  const layout: BlueprintLayout = {};
  if (!isRecord(value)) return layout;
  let count = 0;
  for (const key of Object.keys(value)) {
    if (count >= MAX_LAYOUT_ENTRIES) break;
    if (!key || key.length > MAX_LAYOUT_ID_LENGTH || UNSAFE_KEYS.has(key)) continue;
    const entry = value[key];
    if (!isRecord(entry)) continue;
    const { x, y } = entry;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    layout[key] = { x, y };
    count += 1;
  }
  return layout;
}

/** Parse layout file text. Returns null when it is not a usable layout file. */
export function parseLayout(text: string | null | undefined): BlueprintLayout | null {
  if (typeof text !== "string" || !text.trim()) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.positions)) return null;
  return sanitizeLayout(value.positions);
}

/** Deterministic, diff-friendly layout file text (sorted ids, trailing newline). */
export function serializeLayout(positions: BlueprintLayout): string {
  const clean = sanitizeLayout(positions);
  const ordered: BlueprintLayout = {};
  for (const key of Object.keys(clean).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    ordered[key] = { x: clean[key].x, y: clean[key].y };
  }
  return `${JSON.stringify({ version: 1, positions: ordered }, null, 2)}\n`;
}
