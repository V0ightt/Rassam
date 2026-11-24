// A tiny argument parser: `rassam <command> [positionals] [--flag value]`.
// Supports `--flag value`, `--flag=value`, boolean flags, `--no-flag`,
// `-h/--help`, `-v/--version` and `--` to end flag parsing.

import { ENGINE_VERSION, PACKAGE_NAME } from "../blueprint/constants";
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
  /** A string flag whose value may be left out (`--readme` or `--readme docs/README.md`); without a value it is `true`. */
  optionalValue?: boolean;
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
    summary: "Draft a blueprint from the code, then wire up agents and CI",
    flags: [
      { name: "force", type: "boolean", description: "Replace an existing .rassam/blueprint.json with a fresh draft" },
      { name: "name", type: "string", valueName: "name", description: "System name (default: the directory name)" },
      { name: "dry-run", type: "boolean", description: "Print the draft instead of writing anything" },
      { name: "yes", type: "boolean", description: "Also write all three: the MCP entry, the AGENTS.md rules and the workflow" },
      { name: "mcp", type: "boolean", description: "Add the rassam MCP server to .mcp.json (--no-mcp to skip)" },
      { name: "agents", type: "boolean", description: "Write the contract as rules in AGENTS.md and point CLAUDE.md at it (--no-agents to skip)" },
      { name: "workflow", type: "boolean", description: "Add .github/workflows/rassam.yml, the pull request gate (--no-workflow to skip)" },
      ROOT_FLAG,
    ],
    details: [
      "The draft only records what static analysis can see. Intent, rules and",
      "invariants are yours to write: they are what agents cannot infer.",
      "",
      "In a terminal, init asks before writing each of .mcp.json, AGENTS.md (plus a",
      "pointer in CLAUDE.md) and .github/workflows/rassam.yml. Elsewhere it writes",
      "only what the flags ask for. Every file is written idempotently: text outside",
      "Rassam's markers and existing settings are never changed. With a blueprint",
      "already in place, init skips the draft and only wires what you ask for.",
    ],
    examples: ["rassam init", "rassam init --yes", "rassam init --name Payments --dry-run", "rassam init --agents --no-workflow"],
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
      { name: "approved", type: "boolean", description: "A human approved this change's weakening of the contract or the tests" },
      { name: "run-invariants", type: "boolean", description: "Run invariant check commands (taken from the base blueprint in diff mode)" },
      { name: "invariant-timeout", type: "number", valueName: "seconds", default: 300, description: "Timeout for each invariant command" },
      { name: "github", type: "boolean", description: "GitHub Actions mode: PR context, annotations, step summary" },
      { name: "comment", type: "boolean", description: "With --github: create or update one sticky PR comment" },
      { name: "approve-label", type: "string", valueName: "label", default: "rassam:approved", description: "With --github: PR label that counts as human approval of contract or test weakening" },
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
    name: "render",
    summary: "Draw the system design (SVG, badges, system.json) and keep the README block current",
    flags: [
      { name: "out", type: "string", valueName: "dir", default: ".rassam/live", description: "Directory for system-light.svg, system-dark.svg, the badges and system.json" },
      { name: "theme", type: "string", valueName: "theme", choices: ["light", "dark", "both"], default: "both", description: "Which diagrams to write: light, dark or both" },
      { name: "detail", type: "string", valueName: "level", choices: ["calm", "full"], default: "calm", description: "calm hides tests, edges into shared components and implied dependencies; full draws everything" },
      { name: "base", type: "string", valueName: "ref", description: "Highlight what changed in the architecture since the merge-base with <ref>" },
      { name: "status", type: "string", valueName: "file", description: "Runtime status to overlay (default: .rassam/status.json when it exists)" },
      { name: "status-max-age", type: "number", valueName: "minutes", default: 60, description: "Older status is drawn as \"No data\" instead of a stale state" },
      { name: "readme", type: "string", valueName: "file", optionalValue: true, description: "Update the block between the rassam:system markers in README.md (or <file>)" },
      { name: "format", type: "string", valueName: "fmt", choices: ["svg", "mermaid", "json"], default: "svg", description: "svg writes the files; mermaid and json print to stdout and write nothing" },
      { name: "link", type: "string", valueName: "url", description: "Where the README diagram links to (default: the repository URL)" },
      { name: "image-base", type: "string", valueName: "url|path", description: "URL or relative path the README loads the images from (default: the rassam-live branch on raw.githubusercontent.com)" },
      { name: "stamp", type: "boolean", description: "Draw the time into the diagrams (otherwise identical commits give identical files)" },
      ROOT_FLAG,
    ],
    details: [
      "Writes system-light.svg, system-dark.svg, badge-blueprint.svg, badge-system.svg",
      "and system.json. The drawing is a pure function of the blueprint, the code and",
      "the status file: no model is involved, and nothing is rewritten when nothing changed.",
      "",
      "A README can only show a static image. Put these two lines where it should appear,",
      "then run rassam render --readme:",
      "  <!-- rassam:system:start -->",
      "  <!-- rassam:system:end -->",
      "",
      "Exit codes: 0 rendered (violations are shown in the picture, they do not fail it), 2 usage or configuration error.",
    ],
    examples: ["rassam render", "rassam render --base HEAD~1 --out out/live", "rassam render --readme --image-base .rassam/live"],
  },
  {
    name: "status",
    summary: "Probe what is running: health URLs, deployments and workflows declared as runtime",
    flags: [
      { name: "write", type: "boolean", description: "Save the result to .rassam/status.json" },
      FORMAT_TEXT_JSON,
      { name: "timeout", type: "number", valueName: "ms", default: 5000, description: "Timeout of each request (a component's health.timeoutMs wins)" },
      { name: "github", type: "boolean", description: "Read deployments and workflow runs from the GitHub API (also on when GITHUB_TOKEN is set)" },
      { name: "fail-on-down", type: "boolean", description: "Exit 1 when a component is down" },
      ROOT_FLAG,
    ],
    details: [
      "For every component that declares runtime in the blueprint:",
      "  health      GET or HEAD the URL: 2xx (or expectStatus) is up, 5xx, a timeout or a network error is down, anything else is degraded",
      "  deployment  the latest GitHub deployment of that environment",
      "  workflow    the latest run of that workflow file on the default branch",
      "The worst signal wins. Requests are made from this machine; only http(s) URLs",
      "without credentials are fetched, and response bodies are never read or printed.",
      "",
      "Exit codes: 0 always, unless --fail-on-down and a component is down (1); 2 usage or configuration error.",
    ],
    examples: ["rassam status", "rassam status --write --github"],
  },
  {
    name: "do",
    summary: "Change the blueprint with a plain-language instruction (a dry run by default)",
    positionals: "<instruction...>",
    minPositionals: 1,
    flags: [
      { name: "write", type: "boolean", description: "Save the change to .rassam/blueprint.json (default: show what would change)" },
      { name: "allow-weakening", type: "boolean", description: "Allow an instruction that loosens the contract" },
      { name: "choose", type: "number", valueName: "n", description: "Pick option <n> when the instruction is ambiguous" },
      { name: "by", type: "string", valueName: "name", description: "Who is making the change (default: git config user.name)" },
      FORMAT_TEXT_JSON,
      ROOT_FLAG,
    ],
    details: [
      "The instruction is parsed by fixed rules, not by a model, so the same words",
      "always give the same edits. Quote it so the shell passes it as one argument.",
      "New facts are recorded as written by a person (provenance \"human\").",
      "",
      "Exit codes: 0 understood (and saved with --write), 2 ambiguous, not understood, or refused.",
    ],
    examples: ['rassam do "forbid ui from importing db because pages go through the API"', 'rassam do "add a component Payments for src/payments/**" --write'],
  },
  {
    name: "instructions",
    summary: "Write the contract's rules as prose into AGENTS.md, for every agent to read",
    flags: [
      { name: "write", type: "boolean", description: "Create or refresh the block in the file (default: print it)" },
      { name: "check", type: "boolean", description: "Exit 1 when the block is missing or out of date (for CI or a pre-commit hook)" },
      { name: "file", type: "string", valueName: "path", description: "Instruction file to keep current (default: AGENTS.md, in whatever case it exists)" },
      { name: "command", type: "string", valueName: "cmd", description: "How agents run the CLI in this repository (default: the pinned npx command)" },
      { name: "no-mcp", type: "boolean", description: "Leave out the sentences about the MCP tools (included when .mcp.json configures rassam)" },
      ROOT_FLAG,
    ],
    details: [
      "The block between <!-- rassam:agents:start --> and <!-- rassam:agents:end -->",
      "states the rules, protected paths and invariants in plain language, plus the",
      "standing orders: never weaken a test or a check, and stop and report when a",
      "task needs a rule broken. It is generated from the blueprint alone, so run",
      "this again whenever the contract changes. Text outside the markers is kept.",
      "",
      "Exit codes: 0 ok, 1 with --check when the block is missing or stale, 2 usage or configuration error.",
    ],
    examples: ["rassam instructions", "rassam instructions --write", "rassam instructions --check"],
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
      "Add it to an agent with .mcp.json (rassam init --mcp writes this for you):",
      `  {"mcpServers":{"rassam":{"command":"npx","args":["-y","${PACKAGE_NAME}@${ENGINE_VERSION}","mcp"]}}}`,
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
    if (raw === undefined && flag.optionalValue && (argv[index + 1] === undefined || argv[index + 1].startsWith("-"))) {
      parsed.flags[camelCase(flag.name)] = true;
      continue;
    }
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
  return flag.optionalValue ? `--${flag.name} [${flag.valueName ?? "value"}]` : `--${flag.name} <${flag.valueName ?? "value"}>`;
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
