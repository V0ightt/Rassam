import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { BLUEPRINT_ESCALATIONS_DIR, BLUEPRINT_PROPOSALS_DIR } from "../../blueprint/schema";
import { stringFlag } from "../args";
import type { ParsedArgs } from "../args";
import { renderJsonText } from "../format";
import { repoRoot } from "../git";
import { EXIT_OK } from "../io";
import type { Io } from "../io";
import { resolve } from "node:path";

export interface ProposalEntry {
  type: "proposal" | "escalation";
  file: string;
  title: string;
  author: string | null;
  date: string | null;
  status: string | null;
  /** Set when the file is not a JSON object. */
  problem?: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readEntry(root: string, directory: string, name: string, type: ProposalEntry["type"]): Promise<ProposalEntry> {
  const file = `${directory}/${name}`;
  const blank = { type, file, title: name, author: null, date: null, status: null };
  try {
    const data: unknown = JSON.parse(await readFile(join(root, file), "utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) return { ...blank, problem: "not a JSON object" };
    const record = data as Record<string, unknown>;
    return {
      type,
      file,
      title: text(record.title) ?? text(record.summary) ?? name,
      author: text(record.agent) ?? text(record.author),
      date: text(record.createdAt) ?? text(record.date),
      status: text(record.status),
    };
  } catch {
    return { ...blank, problem: "unreadable or invalid JSON" };
  }
}

export async function listEntries(root: string): Promise<ProposalEntry[]> {
  const entries: ProposalEntry[] = [];
  const sources: Array<[string, ProposalEntry["type"]]> = [
    [BLUEPRINT_PROPOSALS_DIR, "proposal"],
    [BLUEPRINT_ESCALATIONS_DIR, "escalation"],
  ];
  for (const [directory, type] of sources) {
    const names = await readdir(join(root, directory)).catch(() => [] as string[]);
    for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
      entries.push(await readEntry(root, directory, name, type));
    }
  }
  return entries;
}

function section(heading: string, entries: ProposalEntry[]): string[] {
  if (entries.length === 0) return [];
  const lines = [`${heading} (${entries.length})`];
  for (const entry of entries) {
    const meta = [entry.author, entry.date, entry.status, entry.problem].filter(Boolean).join(" · ");
    lines.push(`  ${entry.title}`, `    ${meta ? `${meta} · ` : ""}${entry.file}`);
  }
  return [...lines, ""];
}

export async function proposalsCommand(args: ParsedArgs, io: Io): Promise<number> {
  const rootFlag = stringFlag(args, "root");
  const start = resolve(io.cwd, rootFlag ?? ".");
  const root = rootFlag ? start : (await repoRoot(start).catch(() => null)) ?? start;
  const entries = await listEntries(root);
  if (stringFlag(args, "format") === "json") {
    io.stdout(renderJsonText({ entries }));
    return EXIT_OK;
  }
  if (entries.length === 0) {
    io.stdout(`No proposals or escalations. Agents file them in ${BLUEPRINT_PROPOSALS_DIR}/ and ${BLUEPRINT_ESCALATIONS_DIR}/ through the MCP server.\n`);
    return EXIT_OK;
  }
  const lines = [
    ...section("Escalations: an agent stopped because the task and the contract conflict", entries.filter((entry) => entry.type === "escalation")),
    ...section("Proposals: changes to the blueprint that an agent suggests", entries.filter((entry) => entry.type === "proposal")),
    "Review each file, apply what you agree with to the blueprint yourself, then delete the file.",
  ];
  io.stdout(`${lines.join("\n")}\n`);
  return EXIT_OK;
}
