// A tiny argument parser: `rassam <command> [positionals] [--flag value]`.
// Supports `--flag value`, `--flag=value`, boolean flags, `--no-flag`,
// `-h/--help`, `-v/--version` and `--` to end flag parsing.

import { UsageError } from "./io";

export type FlagType = "boolean" | "string" | "number";
export type FlagValue = string | number | boolean;

export interface FlagSpec {
  /** Long name without dashes, e.g. "fail-on". */
  name: string;
  type: FlagType;
  description: string;
  valueName?: string;
  choices?: readonly string[];
  default?: FlagValue;
}

export interface CommandSpec {
  name: string;
  summary: string;
  /** Positional usage, e.g. "<path>" or "<paths...>". */
  positionals?: string;
  minPositionals?: number;
  maxPositionals?: number;
  flags: FlagSpec[];
  details?: string[];
  examples?: string[];
}

export interface ParsedArgs {
  command: string | null;
  positionals: string[];
  /** Keyed by camelCased flag name ("fail-on" → "failOn"). */
  flags: Record<string, FlagValue>;
  help: boolean;
  version: boolean;
}

const ROOT_FLAG: FlagSpec = {
  name: "root",
  type: "string",
  valueName: "dir",
  description: "Repository directory (default: the git root of the current directory)",
};

const FORMAT_TEXT_JSON: FlagSpec = {
  name: "format",
  type: "string",
  valueName: "fmt",
  choices: ["text", "json"],
  default: "text",
  description: "Output format: text or json",
};

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: "init",
    summary: "Derive a draft blueprint from the working tree",
    flags: [
      { name: "force", type: "boolean", description: "Overwrite an existing .rassam/blueprint.json" },
      { name: "name", type: "string", valueName: "name", description: "System name (default: the directory name)" },
      { name: "dry-run", type: "boolean", description: "Print the draft instead of writing it" },
      ROOT_FLAG,
    ],
    details: [
      "The draft only records what static analysis can see. Intent, rules and",
      "invariants are yours to write: they are what agents cannot infer.",
    ],
    examples: ["rassam init", "rassam init --name Payments --dry-run"],
  },
  {
    name: "check",
    summary: "Check the repository (or a change) against the blueprint",
    flags: [
      { name: "base", type: "string", valueName: "ref", description: "Diff mode: judge the change since the merge-base with <ref>, using the blueprint at that merge-base" },
      { name: "format", type: "string", valueName: "fmt", choices: ["text", "markdown", "json", "sarif"], default: "text", description: "Output format: text, markdown, json or sarif" },
      { name: "output", type: "string", valueName: "file", description: "Write the report to a file instead of stdout" },
      { name: "sarif-output", type: "string", valueName: "file", description: "Additionally write a SARIF report to a file" },
      { name: "fail-on", type: "string", valueName: "level", choices: ["error", "warning", "never"], default: "error", description: "Exit 1 when findings at or above this severity exist: error, warning or never" },
      { name: "budget", type: "number", valueName: "n", description: "Maximum number of findings to show (attention budget)" },
      { name: "approved", type: "boolean", description: "A human approved the contract changes in this change" },
      { name: "run-invariants", type: "boolean", description: "Run invariant check commands (taken from the base blueprint in diff mode)" },
      { name: "invariant-timeout", type: "number", valueName: "seconds", default: 300, description: "Timeout for each invariant command" },
      { name: "github", type: "boolean", description: "GitHub Actions mode: PR context, annotations, step summary" },
      { name: "comment", type: "boolean", description: "With --github: create or update one sticky PR comment" },
      { name: "approve-label", type: "string", valueName: "label", default: "rassam:approved", description: "With --github: PR label that counts as human approval" },
      { name: "verbose", type: "boolean", description: "Show pre-existing findings and extra detail" },
      { name: "color", type: "boolean", default: true, description: "Colored output (disable with --no-color or NO_COLOR)" },
      ROOT_FLAG,
    ],
    details: [
      "Without --base the whole working tree is checked (full mode).",
      "With --base, only what the change introduces fails the gate, and the",
      "change is judged by the blueprint at the merge-base, so a change cannot",
      "relax the rules it is judged by.",
      "",
      "Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or configuration error.",
    ],
    examples: ["rassam check", "rassam check --base origin/main", "rassam check --github --comment --sarif-output rassam.sarif"],
  },
  {
    name: "explain",
    summary: "Show what the blueprint says about a path",
    positionals: "<path>",
    minPositionals: 1,
    maxPositionals: 1,
    flags: [FORMAT_TEXT_JSON, ROOT_FLAG],
    examples: ["rassam explain src/lib/ai.ts"],
  },
  {
    name: "impact",
    summary: "Show the blast radius of changing some paths",
    positionals: "<paths...>",
    minPositionals: 1,
    flags: [FORMAT_TEXT_JSON, ROOT_FLAG],
    examples: ["rassam impact src/lib/github.ts src/lib/ai.ts"],
  },
  {
    name: "graph",
    summary: "Print the component graph",
    flags: [
      { name: "format", type: "string", valueName: "fmt", choices: ["mermaid", "dot", "json"], default: "mermaid", description: "Output format: mermaid, dot or json" },
      ROOT_FLAG,
    ],
    examples: ["rassam graph --format dot | dot -Tsvg > graph.svg"],
  },
  {
    name: "verify",
    summary: "Sign off a component, rule, dependency or invariant as a human",
    positionals: "<id>",
    minPositionals: 1,
    maxPositionals: 1,
    flags: [
      { name: "by", type: "string", valueName: "name", description: "Who is signing (default: git config user.name)" },
      { name: "note", type: "string", valueName: "text", description: "What was checked" },
      ROOT_FLAG,
    ],
    details: ["Sign-offs are recorded in .rassam/blueprint.json and reviewed in pull requests like any other change."],
    examples: ['rassam verify api --note "Read every handler against the intent"'],
  },
  {
    name: "sync",
    summary: "Propose derived facts for code the blueprint does not cover yet",
    flags: [
      { name: "write", type: "boolean", description: "Apply the additions to .rassam/blueprint.json (default: dry run)" },
      { name: "no-components", type: "boolean", description: "Do not propose components for unclaimed files" },
      { name: "no-dependencies", type: "boolean", description: "Do not declare observed dependencies" },
      FORMAT_TEXT_JSON,
      ROOT_FLAG,
    ],
    details: [
      "Adds components for source files no component claims and declares observed",
      "dependencies, all marked provenance \"derived\". Never changes or removes a fact",
      "a person wrote, and never moves a file out of the component that owns it.",
    ],
    examples: ["rassam sync", "rassam sync --write --no-dependencies"],
  },
  {
    name: "reach",
    summary: "Summarize what coding agents can reach (MCP servers, permissions, secrets)",
    flags: [FORMAT_TEXT_JSON, ROOT_FLAG],
  },
  {
    name: "proposals",
    summary: "List pending agent proposals and escalations",
    flags: [FORMAT_TEXT_JSON, ROOT_FLAG],
  },
  {
    name: "schema",
    summary: "Print the JSON Schema of .rassam/blueprint.json",
    flags: [],
  },
  {
    name: "mcp",
    summary: "Start the MCP server on stdio (for coding agents)",
    flags: [ROOT_FLAG],
    details: [
      "Add it to an agent with .mcp.json:",
      '  {"mcpServers":{"rassam":{"command":"npx","args":["rassam","mcp"]}}}',
    ],
  },
];

export function findCommand(name: string, commands: readonly CommandSpec[] = COMMANDS): CommandSpec | undefined {
  return commands.find((command) => command.name === name);
}

export function camelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

export function suggest(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.max(2, Math.floor(input.length / 3)) + 1;
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function unknownFlag(name: string, spec: CommandSpec): UsageError {
  const hint = suggest(name, spec.flags.map((flag) => flag.name));
  return new UsageError(`Unknown option --${name} for "rassam ${spec.name}"${hint ? `. Did you mean --${hint}?` : ""}`, spec.name);
}

function parseBoolean(flag: string, raw: string, command: string): boolean {
  if (/^(true|1|yes|on)$/i.test(raw)) return true;
  if (/^(false|0|no|off)$/i.test(raw)) return false;
  throw new UsageError(`Option --${flag} expects true or false, got "${raw}"`, command);
}

function coerce(flag: FlagSpec, raw: string, command: string): FlagValue {
  if (flag.type === "number") {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) throw new UsageError(`Option --${flag.name} expects a number, got "${raw}"`, command);
    return value;
  }
  if (flag.choices && !flag.choices.includes(raw)) {
    throw new UsageError(`Option --${flag.name} must be one of ${flag.choices.join(", ")} (got "${raw}")`, command);
  }
  return raw;
}

function checkPositionals(spec: CommandSpec, count: number): void {
  const min = spec.minPositionals ?? 0;
  const max = spec.positionals ? spec.maxPositionals ?? Infinity : 0;
  if (count < min) throw new UsageError(`"rassam ${spec.name}" expects ${spec.positionals}`, spec.name);
  if (count > max) {
    const expected = max === 0 ? "no positional arguments" : `at most ${max} positional argument${max === 1 ? "" : "s"}`;
    throw new UsageError(`"rassam ${spec.name}" takes ${expected}`, spec.name);
  }
}

export function parseArgs(argv: readonly string[], commands: readonly CommandSpec[] = COMMANDS): ParsedArgs {
  const parsed: ParsedArgs = { command: null, positionals: [], flags: {}, help: false, version: false };
  let spec: CommandSpec | undefined;
  let flagsEnded = false;

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (flagsEnded || !token.startsWith("-") || token === "-") {
      if (!spec && !flagsEnded) {
        if (token === "help") {
          parsed.help = true;
          continue;
        }
        spec = findCommand(token, commands);
        if (!spec) {
          const hint = suggest(token, commands.map((command) => command.name));
          throw new UsageError(`Unknown command "${token}"${hint ? `. Did you mean "${hint}"?` : ""}`);
        }
        parsed.command = spec.name;
        continue;
      }
      parsed.positionals.push(token);
      continue;
    }
    if (token === "--") {
      flagsEnded = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      parsed.help = true;
      continue;
    }
    if (token === "-v" || token === "--version") {
      parsed.version = true;
      continue;
    }
    if (!token.startsWith("--")) throw new UsageError(`Unknown option ${token}`, spec?.name);
    if (!spec) throw new UsageError(`Option ${token} must come after a command`);

    const equals = token.indexOf("=");
    const name = equals < 0 ? token.slice(2) : token.slice(2, equals);
    const inline = equals < 0 ? undefined : token.slice(equals + 1);
    let flag = spec.flags.find((candidate) => candidate.name === name);

    if (!flag && name.startsWith("no-")) {
      flag = spec.flags.find((candidate) => candidate.name === name.slice(3) && candidate.type === "boolean");
      if (!flag) throw unknownFlag(name, spec);
      if (inline !== undefined) throw new UsageError(`Option --${name} does not take a value`, spec.name);
      parsed.flags[camelCase(flag.name)] = false;
      continue;
    }
    if (!flag) throw unknownFlag(name, spec);

    if (flag.type === "boolean") {
      parsed.flags[camelCase(flag.name)] = inline === undefined ? true : parseBoolean(flag.name, inline, spec.name);
      continue;
    }
    let raw = inline;
    if (raw === undefined) {
      raw = argv[index + 1];
      if (raw === undefined || raw === "--") throw new UsageError(`Option --${flag.name} needs a value (${flag.valueName ?? "value"})`, spec.name);
      index++;
    }
    parsed.flags[camelCase(flag.name)] = coerce(flag, raw, spec.name);
  }

  if (spec && !parsed.help && !parsed.version) {
    for (const flag of spec.flags) {
      const key = camelCase(flag.name);
      if (parsed.flags[key] === undefined && flag.default !== undefined) parsed.flags[key] = flag.default;
    }
    checkPositionals(spec, parsed.positionals.length);
  }
  return parsed;
}

// ── Typed accessors ───────────────────────────────────────────

export function stringFlag(args: ParsedArgs, key: string): string | undefined {
  const value = args.flags[key];
  return typeof value === "string" ? value : undefined;
}

export function numberFlag(args: ParsedArgs, key: string): number | undefined {
  const value = args.flags[key];
  return typeof value === "number" ? value : undefined;
}

export function booleanFlag(args: ParsedArgs, key: string): boolean {
  return args.flags[key] === true;
}

// ── Help text ─────────────────────────────────────────────────

function flagLabel(flag: FlagSpec): string {
  if (flag.type === "boolean") return flag.default === true ? `--no-${flag.name}` : `--${flag.name}`;
  return `--${flag.name} <${flag.valueName ?? "value"}>`;
}

function flagHelp(flag: FlagSpec): string {
  const suffix = flag.type !== "boolean" && flag.default !== undefined ? ` (default: ${flag.default})` : "";
  return `${flag.description}${suffix}`;
}

function table(rows: Array<[string, string]>): string[] {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`);
}

export function generalHelp(version: string, commands: readonly CommandSpec[] = COMMANDS): string {
  return [
    `rassam ${version} — a human-owned architecture contract that coding agents must obey`,
    "",
    "Usage: rassam <command> [options]",
    "",
    "Commands:",
    ...table(commands.map((command) => [command.name, command.summary])),
    "",
    "Options:",
    ...table([
      ["-h, --help", "Show help (also: rassam <command> --help)"],
      ["-v, --version", "Print the version"],
    ]),
    "",
    "The contract lives in .rassam/blueprint.json. Start with: rassam init",
    "",
  ].join("\n");
}

export function commandHelp(spec: CommandSpec): string {
  const usage = ["rassam", spec.name, spec.positionals, spec.flags.length ? "[options]" : undefined].filter(Boolean).join(" ");
  const lines = [`Usage: ${usage}`, "", spec.summary, ""];
  if (spec.details?.length) lines.push(...spec.details, "");
  const rows = spec.flags.map((flag): [string, string] => [flagLabel(flag), flagHelp(flag)]);
  rows.push(["-h, --help", "Show this help"]);
  lines.push("Options:", ...table(rows), "");
  if (spec.examples?.length) lines.push("Examples:", ...spec.examples.map((example) => `  ${example}`), "");
  return lines.join("\n");
}
