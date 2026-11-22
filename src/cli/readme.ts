// The README block `rassam render --readme` maintains: one picture that
// follows the reader's color scheme, two badges, a caption and a component
// table. A README can only show static images, so everything here is plain
// HTML and Markdown that GitHub's sanitizer keeps.

import type { Blueprint } from "../blueprint/schema";
import type { SystemStatus } from "../blueprint/status";

export const README_START = "<!-- rassam:system:start -->";
export const README_END = "<!-- rassam:system:end -->";

export interface ReadmeBlockInput {
  blueprint: Blueprint;
  status: SystemStatus | null;
  /** URL or relative path the four images are loaded from (no trailing slash). */
  imageBase: string;
  /** Where the picture links to; no link when omitted. */
  link?: string;
  /** ISO time shown in the caption. */
  generatedAt: string;
  /** One sentence used as the picture's alt text. */
  alt: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Text for one Markdown table cell: one line, no pipes or markup that could break the row. */
function cell(value: string, limit = 160): string {
  const line = value.replace(/\s+/g, " ").trim();
  const cut = line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line;
  return escapeHtml(cut).replace(/\|/g, "\\|").replace(/([*_`[\]])/g, "\\$1");
}

function firstLine(value: string | undefined): string {
  return (value ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

/** "2026-05-01T14:05:09Z" → "2026-05-01 14:05 UTC". */
export function captionTime(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}

const STATE_LABEL = { up: "Up", degraded: "Degraded", down: "Down", unknown: "No data" } as const;

function imageUrl(base: string, file: string): string {
  return `${base.replace(/\/+$/, "")}/${file}`;
}

export function renderReadmeBlock(input: ReadmeBlockInput): string {
  const { blueprint, status } = input;
  const src = (file: string): string => escapeHtml(imageUrl(input.imageBase, file));
  const picture = [
    "  <picture>",
    `    <source media="(prefers-color-scheme: dark)" srcset="${src("system-dark.svg")}">`,
    `    <img alt="${escapeHtml(input.alt)}" src="${src("system-light.svg")}">`,
    "  </picture>",
  ];
  const linked = input.link ? [`  <a href="${escapeHtml(input.link)}">`, ...picture.map((line) => `  ${line}`), "  </a>"] : picture;
  const rows = blueprint.components.map((component) => {
    const state = component.runtime ? STATE_LABEL[status?.components[component.id]?.state ?? "unknown"] : "—";
    const kind = component.external ? `external ${component.kind === "default" ? "" : component.kind}`.trim() : component.kind;
    return `| ${cell(component.name)} | ${cell(kind)} | ${state} | ${cell(firstLine(component.intent) || firstLine(component.description))} |`;
  });
  return [
    README_START,
    "<!-- Written by `rassam render --readme`. Edit the blueprint, not this block: it is overwritten. -->",
    '<p align="center">',
    ...linked,
    "</p>",
    '<p align="center">',
    `  <img alt="Blueprint check" src="${src("badge-blueprint.svg")}">`,
    `  <img alt="System status" src="${src("badge-system.svg")}">`,
    "</p>",
    `<p align="center"><sub>Updated on every push by <a href="https://rassam.dev">Rassam</a> · status as of ${escapeHtml(captionTime(input.generatedAt))}</sub></p>`,
    "",
    "<details>",
    `<summary>Components (${blueprint.components.length})</summary>`,
    "",
    "| Component | Kind | Status | Intent |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "</details>",
    README_END,
  ].join("\n");
}

export type ReadmeUpdate =
  | { state: "no-markers" }
  | { state: "unchanged" }
  | { state: "updated"; text: string };

/** The caption time changes on every run; a block that differs only there is not a change. */
function withoutTime(block: string): string {
  return block.replace(/status as of [^<]*/g, "status as of").replace(/\r\n/g, "\n");
}

/** Replace what is between the markers. Text outside them and the file's line endings are kept. */
export function updateReadme(text: string, block: string): ReadmeUpdate {
  const start = text.indexOf(README_START);
  const end = start < 0 ? -1 : text.indexOf(README_END, start + README_START.length);
  if (start < 0 || end < 0) return { state: "no-markers" };
  const current = text.slice(start, end + README_END.length);
  if (withoutTime(current) === withoutTime(block)) return { state: "unchanged" };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { state: "updated", text: `${text.slice(0, start)}${block.split("\n").join(eol)}${text.slice(end + README_END.length)}` };
}
