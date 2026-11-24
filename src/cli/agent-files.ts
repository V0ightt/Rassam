// Wires a repository to its contract: the MCP server entry agents start, the
// contract as prose in AGENTS.md (with a pointer from CLAUDE.md), and the
// pull request gate. Every writer is idempotent: running it twice changes
// nothing, text outside Rassam's markers is never touched, and a file a person
// already configured differently is left alone and reported.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ENGINE_VERSION, PACKAGE_NAME } from "../blueprint/constants";
import { AGENTS_BLOCK_END, AGENTS_BLOCK_START, renderAgentBlock } from "../blueprint/prose";
import type { Blueprint } from "../blueprint/schema";
import { runGit } from "./git";

/** How to name the CLI in advice: `npx <package>` when npm started this process, otherwise `rassam`. */
export function cliName(env: Record<string, string | undefined>): string {
  return env.npm_command === "exec" ? `npx ${PACKAGE_NAME}` : "rassam";
}

/** How generated files run the CLI: pinned, so what agents and CI execute changes only when you upgrade. */
export const PINNED_COMMAND = `npx -y ${PACKAGE_NAME}@${ENGINE_VERSION}`;
/** The GitHub Action, pinned to the release that matches this CLI. */
export const ACTION_REF = `V0ightt/Rassam@v${ENGINE_VERSION}`;

export const AGENTS_FILE = "AGENTS.md";
export const CLAUDE_FILE = "CLAUDE.md";
export const MCP_FILE = ".mcp.json";
export const WORKFLOW_FILE = ".github/workflows/rassam.yml";

export const CLAUDE_BLOCK_START = "<!-- rassam:claude:start -->";
export const CLAUDE_BLOCK_END = "<!-- rassam:claude:end -->";

export type WriteState = "created" | "updated" | "unchanged" | "kept";

export interface WriteResult {
  path: string;
  state: WriteState;
  /** One line for the person: what happened, or why the file was left alone. */
  note: string;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

/** Index of a marker that stands on a line of its own (a marker quoted inside prose does not count), or -1. */
export function findMarker(text: string, marker: string, from = 0): number {
  for (let index = text.indexOf(marker, from); index >= 0; index = text.indexOf(marker, index + 1)) {
    const lineStart = index === 0 || text[index - 1] === "\n";
    const lineEnd = text.indexOf("\n", index);
    const rest = text.slice(index + marker.length, lineEnd < 0 ? undefined : lineEnd);
    if (lineStart && /^[ \t\r]*$/.test(rest)) return index;
  }
  return -1;
}

export type BlockUpdate =
  | { state: "unchanged" }
  | { state: "updated" | "appended"; text: string };

/**
 * Put `block` (which starts with `start` and ends with `end`) into `text`:
 * replace what is between the markers, or append it after a blank line when
 * the markers are missing. The file's line endings are kept.
 */
export function upsertBlock(text: string, block: string, start: string, end: string): BlockUpdate {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = block.replace(/\r\n/g, "\n").split("\n").join(eol);
  const from = findMarker(text, start);
  const to = from < 0 ? -1 : findMarker(text, end, from + start.length);
  if (from >= 0 && to >= 0) {
    const current = text.slice(from, to + end.length);
    if (current.replace(/\r\n/g, "\n") === block.replace(/\r\n/g, "\n")) return { state: "unchanged" };
    return { state: "updated", text: `${text.slice(0, from)}${normalized}${text.slice(to + end.length)}` };
  }
  const trimmed = text.replace(/\s+$/, "");
  return { state: "appended", text: `${trimmed}${trimmed ? `${eol}${eol}` : ""}${normalized}${eol}` };
}

/** The block currently in a file, or null when the markers are missing. */
export function extractBlock(text: string, start: string, end: string): string | null {
  const from = findMarker(text, start);
  const to = from < 0 ? -1 : findMarker(text, end, from + start.length);
  return from >= 0 && to >= 0 ? text.slice(from, to + end.length).replace(/\r\n/g, "\n") : null;
}

/** The branch pull requests merge into: origin's HEAD when git knows it, else "main". */
export async function defaultBranch(root: string): Promise<string> {
  const result = await runGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { allowFailure: true }).catch(() => null);
  const ref = result && result.code === 0 ? result.stdout.toString("utf8").trim() : "";
  const branch = ref.replace(/^origin\//, "");
  return /^[\w./-]{1,100}$/.test(branch) ? branch : "main";
}

export interface InstructionOptions {
  command?: string;
  baseBranch?: string;
  /** The repository configures the rassam MCP server. */
  mcp?: boolean;
}

export function agentBlock(blueprint: Blueprint, options: InstructionOptions = {}): string {
  return renderAgentBlock(blueprint, { command: options.command ?? PINNED_COMMAND, baseBranch: options.baseBranch, mcp: options.mcp });
}

/** The repository's AGENTS.md under whatever case it was created with (agents.md is common). */
export async function agentsFileName(root: string): Promise<string> {
  const names = await readdir(root).catch(() => [] as string[]);
  if (names.includes(AGENTS_FILE)) return AGENTS_FILE;
  return names.find((name) => name.toLowerCase() === AGENTS_FILE.toLowerCase()) ?? AGENTS_FILE;
}

/** The command an existing block was generated with (its header records it), so a refresh keeps it. */
export function recordedCommand(block: string | null): string | undefined {
  const match = block ? /by `([^`\n]{1,120}) instructions --write`/.exec(block) : null;
  return match?.[1];
}

export interface AgentsState {
  file: string;
  /** What the block should say now. */
  block: string;
  status: "current" | "stale" | "missing";
}

/**
 * Compare the block in an instruction file with what the contract says now.
 * Without an explicit command, the one recorded in the existing block is kept,
 * so a repository that runs Rassam another way does not look stale.
 */
export async function agentsState(root: string, blueprint: Blueprint, options: InstructionOptions & { file?: string } = {}): Promise<AgentsState> {
  const file = options.file ?? (await agentsFileName(root));
  const text = await readText(join(root, file));
  const current = text === null ? null : extractBlock(text, AGENTS_BLOCK_START, AGENTS_BLOCK_END);
  const block = agentBlock(blueprint, { ...options, command: options.command ?? recordedCommand(current) });
  const status = current === null ? "missing" : current === block.replace(/\r\n/g, "\n") ? "current" : "stale";
  return { file, block, status };
}

export async function writeAgentsFile(root: string, block: string, file = AGENTS_FILE): Promise<WriteResult> {
  const target = join(root, file);
  const existing = await readText(target);
  if (existing === null) {
    await writeText(target, `# Agent instructions\n\n${block}\n`);
    return { path: file, state: "created", note: "the contract's rules, in prose every agent reads" };
  }
  const update = upsertBlock(existing, block, AGENTS_BLOCK_START, AGENTS_BLOCK_END);
  if (update.state === "unchanged") return { path: file, state: "unchanged", note: "already states the current contract" };
  await writeText(target, update.text);
  return {
    path: file,
    state: "updated",
    note: update.state === "appended" ? "added the contract's rules after your own instructions" : "refreshed the contract's rules",
  };
}

function claudeBlock(agentsFile: string): string {
  return [
    CLAUDE_BLOCK_START,
    `This repository's architecture contract is stated in ${agentsFile} (generated from .rassam/blueprint.json). It is binding:`,
    "",
    `@${agentsFile}`,
    CLAUDE_BLOCK_END,
  ].join("\n");
}

/** Claude Code reads CLAUDE.md, not AGENTS.md: import it from there. */
export async function writeClaudePointer(root: string, agentsFile = AGENTS_FILE): Promise<WriteResult> {
  const target = join(root, CLAUDE_FILE);
  const existing = await readText(target);
  const block = claudeBlock(agentsFile);
  if (existing === null) {
    await writeText(target, `${block}\n`);
    return { path: CLAUDE_FILE, state: "created", note: `imports ${agentsFile} so Claude Code reads the rules` };
  }
  const imports = new RegExp(`^\\s*@${agentsFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  if (extractBlock(existing, CLAUDE_BLOCK_START, CLAUDE_BLOCK_END) === null && imports.test(existing)) {
    return { path: CLAUDE_FILE, state: "kept", note: `already imports ${agentsFile}` };
  }
  const update = upsertBlock(existing, block, CLAUDE_BLOCK_START, CLAUDE_BLOCK_END);
  if (update.state === "unchanged") return { path: CLAUDE_FILE, state: "unchanged", note: `already imports ${agentsFile}` };
  await writeText(target, update.text);
  return { path: CLAUDE_FILE, state: "updated", note: `now imports ${agentsFile} so Claude Code reads the rules` };
}

/** Does .mcp.json configure a server named "rassam"? Decides whether the prose mentions the MCP tools. */
export async function hasRassamMcp(root: string): Promise<boolean> {
  const text = await readText(join(root, MCP_FILE)).catch(() => null);
  if (!text) return false;
  try {
    const config = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
    return Boolean(config?.mcpServers && typeof config.mcpServers === "object" && Object.prototype.hasOwnProperty.call(config.mcpServers, "rassam"));
  } catch {
    return false;
  }
}

export function mcpServerEntry(): { command: string; args: string[] } {
  return { command: "npx", args: ["-y", `${PACKAGE_NAME}@${ENGINE_VERSION}`, "mcp"] };
}

/** Adds the rassam server to .mcp.json. An existing "rassam" entry is a person's choice and is kept. */
export async function writeMcpConfig(root: string): Promise<WriteResult> {
  const target = join(root, MCP_FILE);
  const existing = await readText(target);
  const entry = mcpServerEntry();
  if (existing === null) {
    await writeText(target, `${JSON.stringify({ mcpServers: { rassam: entry } }, null, 2)}\n`);
    return { path: MCP_FILE, state: "created", note: `agents can ask the contract (${entry.command} ${entry.args.join(" ")})` };
  }
  let config: unknown;
  try {
    config = JSON.parse(existing);
  } catch {
    return { path: MCP_FILE, state: "kept", note: "is not valid JSON; add the rassam server by hand (see rassam mcp --help)" };
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { path: MCP_FILE, state: "kept", note: "is not a JSON object; add the rassam server by hand (see rassam mcp --help)" };
  }
  const record = config as Record<string, unknown>;
  const servers = record.mcpServers;
  if (servers !== undefined && (!servers || typeof servers !== "object" || Array.isArray(servers))) {
    return { path: MCP_FILE, state: "kept", note: "has an mcpServers value that is not an object; left as is" };
  }
  if (servers && Object.prototype.hasOwnProperty.call(servers, "rassam")) {
    const same = JSON.stringify((servers as Record<string, unknown>).rassam) === JSON.stringify(entry);
    return same
      ? { path: MCP_FILE, state: "unchanged", note: "already starts the rassam server" }
      : { path: MCP_FILE, state: "kept", note: "already has a rassam server of its own; left as is" };
  }
  const indent = /^[ \t]+(?=")/m.exec(existing)?.[0] ?? "  ";
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const next = { ...record, mcpServers: { ...((servers as Record<string, unknown> | undefined) ?? {}), rassam: entry } };
  await writeText(target, `${JSON.stringify(next, null, indent).split("\n").join(eol)}${eol}`);
  return { path: MCP_FILE, state: "updated", note: `added the rassam server (${entry.command} ${entry.args.join(" ")})` };
}

export function workflowText(): string {
  return [
    "# Written by `rassam init`. Every pull request is judged by the blueprint on",
    "# its base branch, so a pull request cannot relax the rules it is checked",
    "# against. Weakening the contract or the tests needs a person to apply the",
    "# `rassam:approved` label. For supply-chain safety, pin the action to the",
    "# release's full commit SHA (keep the version as a comment):",
    `#   uses: V0ightt/Rassam@<40-character SHA> # v${ENGINE_VERSION}`,
    "name: Rassam",
    "",
    "on:",
    "  pull_request:",
    "",
    "permissions:",
    "  contents: read",
    "  pull-requests: write # one sticky comment; drop it and set comment: \"false\" to run read-only",
    "",
    "concurrency:",
    "  group: rassam-${{ github.event.pull_request.number }}",
    "  cancel-in-progress: true",
    "",
    "jobs:",
    "  blueprint:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 10",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0 # the gate needs the merge-base to tell new findings from old ones",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    `      - uses: ${ACTION_REF}`,
    "",
  ].join("\n");
}

/** A workflow under another name that already runs the gate. */
async function existingGateWorkflow(root: string): Promise<string | null> {
  const directory = join(root, ".github/workflows");
  const names = await readdir(directory).catch(() => [] as string[]);
  for (const name of names.filter((entry) => /\.ya?ml$/i.test(entry)).sort()) {
    const text = await readText(join(directory, name)).catch(() => null);
    if (text && /V0ightt\/Rassam@|rassam(?:\.mjs)?\s+check\b/i.test(text)) return `.github/workflows/${name}`;
  }
  return null;
}

/** Writes the gate workflow unless one exists; an existing file is never overwritten. */
export async function writeWorkflow(root: string): Promise<WriteResult> {
  const target = join(root, WORKFLOW_FILE);
  const existing = await readText(target);
  const text = workflowText();
  if (existing !== null) {
    const same = existing.replace(/\r\n/g, "\n") === text;
    return { path: WORKFLOW_FILE, state: same ? "unchanged" : "kept", note: same ? "already gates pull requests" : "exists; left as is" };
  }
  const other = await existingGateWorkflow(root);
  if (other) return { path: other, state: "kept", note: "already runs the gate; no second workflow added" };
  await writeText(target, text);
  return { path: WORKFLOW_FILE, state: "created", note: `gates every pull request (${ACTION_REF})` };
}
