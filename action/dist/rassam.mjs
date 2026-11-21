#!/usr/bin/env node
import { createRequire as __rassamCreateRequire } from "node:module"; const require = __rassamCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/cli/io.ts
function processIo() {
  return {
    stdout: (text3) => void process.stdout.write(text3),
    stderr: (text3) => void process.stderr.write(text3),
    env: process.env,
    cwd: process.cwd(),
    isTTY: Boolean(process.stdout.isTTY),
    stdin: process.stdin,
    stdoutStream: process.stdout,
    fetch: typeof fetch === "function" ? fetch : void 0
  };
}
function ensureTrailingNewline(text3) {
  return text3.endsWith("\n") ? text3 : `${text3}
`;
}
var EXIT_OK, EXIT_USAGE, CliError, UsageError;
var init_io = __esm({
  "src/cli/io.ts"() {
    "use strict";
    EXIT_OK = 0;
    EXIT_USAGE = 2;
    CliError = class extends Error {
      constructor(message, options = {}) {
        super(message);
        this.name = "CliError";
        this.exitCode = options.exitCode ?? EXIT_USAGE;
        this.hint = options.hint;
      }
    };
    UsageError = class extends CliError {
      constructor(message, command) {
        super(message, { exitCode: EXIT_USAGE });
        this.name = "UsageError";
        this.command = command;
      }
    };
  }
});

// src/blueprint/constants.ts
var ENGINE_NAME, ENGINE_VERSION, MAX_ANALYZED_FILE_BYTES, DEFAULT_IGNORE, TEST_PATTERNS, DEFAULT_TRIPWIRES;
var init_constants = __esm({
  "src/blueprint/constants.ts"() {
    "use strict";
    ENGINE_NAME = "rassam";
    ENGINE_VERSION = "0.4.0";
    MAX_ANALYZED_FILE_BYTES = 512 * 1024;
    DEFAULT_IGNORE = [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/.nuxt/**",
      "**/.output/**",
      "**/.svelte-kit/**",
      "**/.turbo/**",
      "**/.cache/**",
      "**/.venv/**",
      "**/venv/**",
      "**/__pycache__/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/coverage/**",
      "**/target/**",
      "**/vendor/**",
      "**/*.min.js",
      "**/*.map",
      "**/*.d.ts"
    ];
    TEST_PATTERNS = [
      "**/*.test.*",
      "**/*.spec.*",
      "**/*_test.go",
      "**/test_*.py",
      "**/*_test.py",
      "**/__tests__/**",
      "**/tests/**",
      "**/test/**",
      "**/spec/**",
      "**/e2e/**",
      "**/*Test.java",
      "**/*Tests.java",
      "**/*Test.kt",
      "**/*Tests.cs"
    ];
    DEFAULT_TRIPWIRES = [
      { glob: ".rassam/blueprint.json", category: "contract", reason: "The architecture contract itself changed." },
      { glob: "**/*.test.*", category: "tests", reason: "Tests are the checks agents are graded by." },
      { glob: "**/*.spec.*", category: "tests", reason: "Tests are the checks agents are graded by." },
      { glob: "**/__tests__/**", category: "tests", reason: "Tests are the checks agents are graded by." },
      { glob: "**/*_test.go", category: "tests", reason: "Tests are the checks agents are graded by." },
      { glob: "**/test_*.py", category: "tests", reason: "Tests are the checks agents are graded by." },
      { glob: "**/conftest.py", category: "tests", reason: "Test fixtures shape what tests can detect." },
      { glob: "{**/tests/**,**/test/**,**/__mocks__/**,**/__fixtures__/**}", category: "tests", reason: "Test helpers, fixtures and mocks shape what tests can detect." },
      { glob: "**/{setupTests,vitest.setup,jest.setup,test-setup}.*", category: "tests", reason: "Test setup runs before every test and can change what passes." },
      { glob: "{jest,vitest,playwright,cypress,karma}.config.*", category: "tests", reason: "Test runner configuration controls what runs and what counts as passing." },
      { glob: "{pytest.ini,tox.ini,.coveragerc,codecov.yml,.nycrc,.nycrc.json}", category: "tests", reason: "Test or coverage configuration changed." },
      { glob: ".github/workflows/**", category: "ci", reason: "CI decides what is verified before merge." },
      { glob: ".gitlab-ci.yml", category: "ci", reason: "CI decides what is verified before merge." },
      { glob: ".circleci/**", category: "ci", reason: "CI decides what is verified before merge." },
      { glob: "{.husky/**,.pre-commit-config.yaml,lefthook.yml,.git-hooks/**}", category: "ci", reason: "Git hooks are local verification gates." },
      { glob: ".github/CODEOWNERS", category: "ci", reason: "Ownership rules decide who must review." },
      { glob: "{package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lock,bun.lockb,Cargo.lock,poetry.lock,uv.lock,go.sum,Gemfile.lock,composer.lock}", category: "dependencies", reason: "Lockfile changes alter the supply chain." },
      { glob: "{.mcp.json,mcp.json,.cursor/mcp.json,.vscode/mcp.json,.windsurf/mcp_config.json}", category: "agent-permissions", reason: "MCP configuration controls which tools and credentials agents can reach." },
      { glob: ".claude/settings.json", category: "agent-permissions", reason: "Agent permission and hook settings changed." },
      { glob: ".codex/**", category: "agent-permissions", reason: "Agent configuration changed." },
      { glob: ".gemini/settings.json", category: "agent-permissions", reason: "Agent configuration changed." },
      { glob: "{AGENTS.md,CLAUDE.md,GEMINI.md,.cursorrules,.cursor/rules/**,.github/copilot-instructions.md}", category: "agent-permissions", reason: "Instructions that steer coding agents changed." },
      { glob: "**/.env*", category: "secrets", reason: "Environment files can carry credentials." },
      { glob: "{Dockerfile,**/Dockerfile,docker-compose*.yml,**/*.tf,**/*.tfvars}", category: "build", reason: "Infrastructure and deployment definitions changed." }
    ];
  }
});

// src/cli/args.ts
function findCommand(name, commands = COMMANDS) {
  return commands.find((command) => command.name === name);
}
function camelCase(name) {
  return name.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());
}
function editDistance(a, b) {
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
function suggest(input, candidates) {
  let best;
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
function unknownFlag(name, spec) {
  const hint = suggest(name, spec.flags.map((flag) => flag.name));
  return new UsageError(`Unknown option --${name} for "rassam ${spec.name}"${hint ? `. Did you mean --${hint}?` : ""}`, spec.name);
}
function parseBoolean(flag, raw, command) {
  if (/^(true|1|yes|on)$/i.test(raw)) return true;
  if (/^(false|0|no|off)$/i.test(raw)) return false;
  throw new UsageError(`Option --${flag} expects true or false, got "${raw}"`, command);
}
function coerce(flag, raw, command) {
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
function checkPositionals(spec, count) {
  const min = spec.minPositionals ?? 0;
  const max = spec.positionals ? spec.maxPositionals ?? Infinity : 0;
  if (count < min) throw new UsageError(`"rassam ${spec.name}" expects ${spec.positionals}`, spec.name);
  if (count > max) {
    const expected = max === 0 ? "no positional arguments" : `at most ${max} positional argument${max === 1 ? "" : "s"}`;
    throw new UsageError(`"rassam ${spec.name}" takes ${expected}`, spec.name);
  }
}
function parseArgs(argv, commands = COMMANDS) {
  const parsed = { command: null, positionals: [], flags: {}, help: false, version: false };
  let spec;
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
    const inline = equals < 0 ? void 0 : token.slice(equals + 1);
    let flag = spec.flags.find((candidate) => candidate.name === name);
    if (!flag && name.startsWith("no-")) {
      flag = spec.flags.find((candidate) => candidate.name === name.slice(3) && candidate.type === "boolean");
      if (!flag) throw unknownFlag(name, spec);
      if (inline !== void 0) throw new UsageError(`Option --${name} does not take a value`, spec.name);
      parsed.flags[camelCase(flag.name)] = false;
      continue;
    }
    if (!flag) throw unknownFlag(name, spec);
    if (flag.type === "boolean") {
      parsed.flags[camelCase(flag.name)] = inline === void 0 ? true : parseBoolean(flag.name, inline, spec.name);
      continue;
    }
    let raw = inline;
    if (raw === void 0) {
      raw = argv[index + 1];
      if (raw === void 0 || raw === "--") throw new UsageError(`Option --${flag.name} needs a value (${flag.valueName ?? "value"})`, spec.name);
      index++;
    }
    parsed.flags[camelCase(flag.name)] = coerce(flag, raw, spec.name);
  }
  if (spec && !parsed.help && !parsed.version) {
    for (const flag of spec.flags) {
      const key = camelCase(flag.name);
      if (parsed.flags[key] === void 0 && flag.default !== void 0) parsed.flags[key] = flag.default;
    }
    checkPositionals(spec, parsed.positionals.length);
  }
  return parsed;
}
function stringFlag(args, key) {
  const value = args.flags[key];
  return typeof value === "string" ? value : void 0;
}
function numberFlag(args, key) {
  const value = args.flags[key];
  return typeof value === "number" ? value : void 0;
}
function booleanFlag(args, key) {
  return args.flags[key] === true;
}
function flagLabel(flag) {
  if (flag.type === "boolean") return flag.default === true ? `--no-${flag.name}` : `--${flag.name}`;
  return `--${flag.name} <${flag.valueName ?? "value"}>`;
}
function flagHelp(flag) {
  const suffix = flag.type !== "boolean" && flag.default !== void 0 ? ` (default: ${flag.default})` : "";
  return `${flag.description}${suffix}`;
}
function table(rows) {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`);
}
function generalHelp(version2, commands = COMMANDS) {
  return [
    `rassam ${version2} — a human-owned architecture contract that coding agents must obey`,
    "",
    "Usage: rassam <command> [options]",
    "",
    "Commands:",
    ...table(commands.map((command) => [command.name, command.summary])),
    "",
    "Options:",
    ...table([
      ["-h, --help", "Show help (also: rassam <command> --help)"],
      ["-v, --version", "Print the version"]
    ]),
    "",
    "The contract lives in .rassam/blueprint.json. Start with: rassam init",
    ""
  ].join("\n");
}
function commandHelp(spec) {
  const usage = ["rassam", spec.name, spec.positionals, spec.flags.length ? "[options]" : void 0].filter(Boolean).join(" ");
  const lines = [`Usage: ${usage}`, "", spec.summary, ""];
  if (spec.details?.length) lines.push(...spec.details, "");
  const rows = spec.flags.map((flag) => [flagLabel(flag), flagHelp(flag)]);
  rows.push(["-h, --help", "Show this help"]);
  lines.push("Options:", ...table(rows), "");
  if (spec.examples?.length) lines.push("Examples:", ...spec.examples.map((example) => `  ${example}`), "");
  return lines.join("\n");
}
var ROOT_FLAG, FORMAT_TEXT_JSON, COMMANDS;
var init_args = __esm({
  "src/cli/args.ts"() {
    "use strict";
    init_io();
    ROOT_FLAG = {
      name: "root",
      type: "string",
      valueName: "dir",
      description: "Repository directory (default: the git root of the current directory)"
    };
    FORMAT_TEXT_JSON = {
      name: "format",
      type: "string",
      valueName: "fmt",
      choices: ["text", "json"],
      default: "text",
      description: "Output format: text or json"
    };
    COMMANDS = [
      {
        name: "init",
        summary: "Derive a draft blueprint from the working tree",
        flags: [
          { name: "force", type: "boolean", description: "Overwrite an existing .rassam/blueprint.json" },
          { name: "name", type: "string", valueName: "name", description: "System name (default: the directory name)" },
          { name: "dry-run", type: "boolean", description: "Print the draft instead of writing it" },
          ROOT_FLAG
        ],
        details: [
          "The draft only records what static analysis can see. Intent, rules and",
          "invariants are yours to write: they are what agents cannot infer."
        ],
        examples: ["rassam init", "rassam init --name Payments --dry-run"]
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
          ROOT_FLAG
        ],
        details: [
          "Without --base the whole working tree is checked (full mode).",
          "With --base, only what the change introduces fails the gate, and the",
          "change is judged by the blueprint at the merge-base, so a change cannot",
          "relax the rules it is judged by.",
          "",
          "Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or configuration error."
        ],
        examples: ["rassam check", "rassam check --base origin/main", "rassam check --github --comment --sarif-output rassam.sarif"]
      },
      {
        name: "explain",
        summary: "Show what the blueprint says about a path",
        positionals: "<path>",
        minPositionals: 1,
        maxPositionals: 1,
        flags: [FORMAT_TEXT_JSON, ROOT_FLAG],
        examples: ["rassam explain src/lib/ai.ts"]
      },
      {
        name: "impact",
        summary: "Show the blast radius of changing some paths",
        positionals: "<paths...>",
        minPositionals: 1,
        flags: [FORMAT_TEXT_JSON, ROOT_FLAG],
        examples: ["rassam impact src/lib/github.ts src/lib/ai.ts"]
      },
      {
        name: "graph",
        summary: "Print the component graph",
        flags: [
          { name: "format", type: "string", valueName: "fmt", choices: ["mermaid", "dot", "json"], default: "mermaid", description: "Output format: mermaid, dot or json" },
          ROOT_FLAG
        ],
        examples: ["rassam graph --format dot | dot -Tsvg > graph.svg"]
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
          ROOT_FLAG
        ],
        details: ["Sign-offs are recorded in .rassam/blueprint.json and reviewed in pull requests like any other change."],
        examples: ['rassam verify api --note "Read every handler against the intent"']
      },
      {
        name: "sync",
        summary: "Propose derived facts for code the blueprint does not cover yet",
        flags: [
          { name: "write", type: "boolean", description: "Apply the additions to .rassam/blueprint.json (default: dry run)" },
          { name: "no-components", type: "boolean", description: "Do not propose components for unclaimed files" },
          { name: "no-dependencies", type: "boolean", description: "Do not declare observed dependencies" },
          FORMAT_TEXT_JSON,
          ROOT_FLAG
        ],
        details: [
          "Adds components for source files no component claims and declares observed",
          'dependencies, all marked provenance "derived". Never changes or removes a fact',
          "a person wrote, and never moves a file out of the component that owns it."
        ],
        examples: ["rassam sync", "rassam sync --write --no-dependencies"]
      },
      {
        name: "reach",
        summary: "Summarize what coding agents can reach (MCP servers, permissions, secrets)",
        flags: [FORMAT_TEXT_JSON, ROOT_FLAG]
      },
      {
        name: "proposals",
        summary: "List pending agent proposals and escalations",
        flags: [FORMAT_TEXT_JSON, ROOT_FLAG]
      },
      {
        name: "schema",
        summary: "Print the JSON Schema of .rassam/blueprint.json",
        flags: []
      },
      {
        name: "mcp",
        summary: "Start the MCP server on stdio (for coding agents)",
        flags: [ROOT_FLAG],
        details: [
          "Add it to an agent with .mcp.json:",
          '  {"mcpServers":{"rassam":{"command":"npx","args":["rassam","mcp"]}}}'
        ]
      }
    ];
  }
});

// src/cli/util.ts
import { open, stat } from "node:fs/promises";
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane);
  await Promise.all(lanes);
  return results;
}
function looksBinary(buffer) {
  const end = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < end; index++) if (buffer[index] === 0) return true;
  return false;
}
function isEnvFile(path) {
  const base = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  return base === ".env" || base.startsWith(".env.") || base.startsWith(".env-") || base.startsWith(".env_");
}
function decodeText(buffer) {
  if (buffer.length > MAX_ANALYZED_FILE_BYTES || looksBinary(buffer)) return null;
  const text3 = buffer.toString("utf8");
  return text3.charCodeAt(0) === 65279 ? text3.slice(1) : text3;
}
async function readTextFile(absolutePath, wantContent) {
  let size;
  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) return { content: null, missing: true };
    size = info.size;
  } catch {
    return { content: null, missing: true };
  }
  if (!wantContent || size > MAX_ANALYZED_FILE_BYTES || isEnvFile(absolutePath)) return { size, content: null, missing: false };
  try {
    const handle = await open(absolutePath, "r");
    try {
      const buffer = await handle.readFile();
      return { size, content: decodeText(buffer), missing: false };
    } finally {
      await handle.close();
    }
  } catch {
    return { size, content: null, missing: false };
  }
}
function tailBytes(text3, maxBytes) {
  const buffer = Buffer.from(text3, "utf8");
  if (buffer.length <= maxBytes) return text3;
  return `…${buffer.subarray(buffer.length - maxBytes).toString("utf8").replace(/^�+/, "")}`;
}
function slugify(value, fallback, maxLength = 48) {
  const slug = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, maxLength).replace(/-+$/, "");
  return slug || fallback;
}
function fileTimestamp(date5) {
  return date5.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}
function errorMessage(error51) {
  return error51 instanceof Error ? error51.message : String(error51);
}
var BINARY_SNIFF_BYTES;
var init_util = __esm({
  "src/cli/util.ts"() {
    "use strict";
    init_constants();
    BINARY_SNIFF_BYTES = 8 * 1024;
  }
});

// node_modules/zod/v4/core/core.js
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer3, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: /* @__PURE__ */ new Set()
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer3(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a3;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
var _a, NEVER, $brand, $ZodAsyncError, $ZodEncodeError, globalConfig;
var init_core = __esm({
  "node_modules/zod/v4/core/core.js"() {
    NEVER = /* @__PURE__ */ Object.freeze({
      status: "aborted"
    });
    $brand = /* @__PURE__ */ Symbol("zod_brand");
    $ZodAsyncError = class extends Error {
      constructor() {
        super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
      }
    };
    $ZodEncodeError = class extends Error {
      constructor(name) {
        super(`Encountered unidirectional transform during encode: ${name}`);
        this.name = "ZodEncodeError";
      }
    };
    (_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
    globalConfig = globalThis.__zod_globalConfig;
  }
});

// node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  base64ToUint8Array: () => base64ToUint8Array,
  base64urlToUint8Array: () => base64urlToUint8Array,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  cloneDef: () => cloneDef,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  explicitlyAborted: () => explicitlyAborted,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  hexToUint8Array: () => hexToUint8Array,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  merge: () => merge,
  mergeDefs: () => mergeDefs,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  objectClone: () => objectClone,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  parsedType: () => parsedType,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  required: () => required,
  safeExtend: () => safeExtend,
  shallowClone: () => shallowClone,
  slugify: () => slugify2,
  stringifyPrimitive: () => stringifyPrimitive,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToHex: () => uint8ArrayToHex,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {
}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {
}
function getEnumValues(entries2) {
  const numericValues = Object.values(entries2).filter((v) => typeof v === "number");
  const values = Object.entries(entries2).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array2, separator = "|") {
  return array2.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set2 = false;
  return {
    get value() {
      if (!set2) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
function defineLazy(object2, key, getter) {
  let value = void 0;
  Object.defineProperty(object2, key, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object2, key, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify2(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class2, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class2 ? new Class2({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class2 ? new Class2({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class2, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a3;
    (_a3 = iss).path ?? (_a3.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base643) {
  const binaryString = atob(base643);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url3) {
  const base643 = base64url3.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base643.length % 4) % 4);
  return base64ToUint8Array(base643 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex3) {
  const cleanHex = hex3.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var EVALUATING, captureStackTrace, allowsEval, getParsedType, propertyKeyTypes, primitiveTypes, NUMBER_FORMAT_RANGES, BIGINT_FORMAT_RANGES, Class;
var init_util2 = __esm({
  "node_modules/zod/v4/core/util.js"() {
    init_core();
    EVALUATING = /* @__PURE__ */ Symbol("evaluating");
    captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
    };
    allowsEval = /* @__PURE__ */ cached(() => {
      if (globalConfig.jitless) {
        return false;
      }
      if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
      }
      try {
        const F = Function;
        new F("");
        return true;
      } catch (_) {
        return false;
      }
    });
    getParsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "undefined":
          return "undefined";
        case "string":
          return "string";
        case "number":
          return Number.isNaN(data) ? "nan" : "number";
        case "boolean":
          return "boolean";
        case "function":
          return "function";
        case "bigint":
          return "bigint";
        case "symbol":
          return "symbol";
        case "object":
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
            return "promise";
          }
          if (typeof Map !== "undefined" && data instanceof Map) {
            return "map";
          }
          if (typeof Set !== "undefined" && data instanceof Set) {
            return "set";
          }
          if (typeof Date !== "undefined" && data instanceof Date) {
            return "date";
          }
          if (typeof File !== "undefined" && data instanceof File) {
            return "file";
          }
          return "object";
        default:
          throw new Error(`Unknown data type: ${t}`);
      }
    };
    propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
    primitiveTypes = /* @__PURE__ */ new Set([
      "string",
      "number",
      "bigint",
      "boolean",
      "symbol",
      "undefined"
    ]);
    NUMBER_FORMAT_RANGES = {
      safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      int32: [-2147483648, 2147483647],
      uint32: [0, 4294967295],
      float32: [-34028234663852886e22, 34028234663852886e22],
      float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
    };
    BIGINT_FORMAT_RANGES = {
      int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
      uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
    };
    Class = class {
      constructor(..._args) {
      }
    };
  }
});

// node_modules/zod/v4/core/errors.js
function flattenError(error51, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error51.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error51, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error52, path = []) => {
    for (const issue2 of error52.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error51);
  return fieldErrors;
}
function treeifyError(error51, mapper = (issue2) => issue2.message) {
  const result = { errors: [] };
  const processError = (error52, path = []) => {
    var _a3, _b;
    for (const issue2 of error52.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          result.errors.push(mapper(issue2));
          continue;
        }
        let curr = result;
        let i = 0;
        while (i < fullpath.length) {
          const el = fullpath[i];
          const terminal = i === fullpath.length - 1;
          if (typeof el === "string") {
            curr.properties ?? (curr.properties = {});
            (_a3 = curr.properties)[el] ?? (_a3[el] = { errors: [] });
            curr = curr.properties[el];
          } else {
            curr.items ?? (curr.items = []);
            (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
            curr = curr.items[el];
          }
          if (terminal) {
            curr.errors.push(mapper(issue2));
          }
          i++;
        }
      }
    }
  };
  processError(error51);
  return result;
}
function toDotPath(_path) {
  const segs = [];
  const path = _path.map((seg) => typeof seg === "object" ? seg.key : seg);
  for (const seg of path) {
    if (typeof seg === "number")
      segs.push(`[${seg}]`);
    else if (typeof seg === "symbol")
      segs.push(`[${JSON.stringify(String(seg))}]`);
    else if (/[^\w$]/.test(seg))
      segs.push(`[${JSON.stringify(seg)}]`);
    else {
      if (segs.length)
        segs.push(".");
      segs.push(seg);
    }
  }
  return segs.join("");
}
function prettifyError(error51) {
  const lines = [];
  const issues = [...error51.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);
  for (const issue2 of issues) {
    lines.push(`✖ ${issue2.message}`);
    if (issue2.path?.length)
      lines.push(`  → at ${toDotPath(issue2.path)}`);
  }
  return lines.join("\n");
}
var initializer, $ZodError, $ZodRealError;
var init_errors = __esm({
  "node_modules/zod/v4/core/errors.js"() {
    init_core();
    init_util2();
    initializer = (inst, def) => {
      inst.name = "$ZodError";
      Object.defineProperty(inst, "_zod", {
        value: inst._zod,
        enumerable: false
      });
      Object.defineProperty(inst, "issues", {
        value: def,
        enumerable: false
      });
      inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
      Object.defineProperty(inst, "toString", {
        value: () => inst.message,
        enumerable: false
      });
    };
    $ZodError = $constructor("$ZodError", initializer);
    $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
  }
});

// node_modules/zod/v4/core/parse.js
var _parse, parse, _parseAsync, parseAsync, _safeParse, safeParse, _safeParseAsync, safeParseAsync, _encode, encode, _decode, decode, _encodeAsync, encodeAsync, _decodeAsync, decodeAsync, _safeEncode, safeEncode, _safeDecode, safeDecode, _safeEncodeAsync, safeEncodeAsync, _safeDecodeAsync, safeDecodeAsync;
var init_parse = __esm({
  "node_modules/zod/v4/core/parse.js"() {
    init_core();
    init_errors();
    init_util2();
    _parse = (_Err) => (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
      const result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise) {
        throw new $ZodAsyncError();
      }
      if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee);
        throw e;
      }
      return result.value;
    };
    parse = /* @__PURE__ */ _parse($ZodRealError);
    _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
      const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
      let result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise)
        result = await result;
      if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee);
        throw e;
      }
      return result.value;
    };
    parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
    _safeParse = (_Err) => (schema, value, _ctx) => {
      const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
      const result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise) {
        throw new $ZodAsyncError();
      }
      return result.issues.length ? {
        success: false,
        error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
      } : { success: true, data: result.value };
    };
    safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
    _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
      const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
      let result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise)
        result = await result;
      return result.issues.length ? {
        success: false,
        error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
      } : { success: true, data: result.value };
    };
    safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
    _encode = (_Err) => (schema, value, _ctx) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return _parse(_Err)(schema, value, ctx);
    };
    encode = /* @__PURE__ */ _encode($ZodRealError);
    _decode = (_Err) => (schema, value, _ctx) => {
      return _parse(_Err)(schema, value, _ctx);
    };
    decode = /* @__PURE__ */ _decode($ZodRealError);
    _encodeAsync = (_Err) => async (schema, value, _ctx) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return _parseAsync(_Err)(schema, value, ctx);
    };
    encodeAsync = /* @__PURE__ */ _encodeAsync($ZodRealError);
    _decodeAsync = (_Err) => async (schema, value, _ctx) => {
      return _parseAsync(_Err)(schema, value, _ctx);
    };
    decodeAsync = /* @__PURE__ */ _decodeAsync($ZodRealError);
    _safeEncode = (_Err) => (schema, value, _ctx) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return _safeParse(_Err)(schema, value, ctx);
    };
    safeEncode = /* @__PURE__ */ _safeEncode($ZodRealError);
    _safeDecode = (_Err) => (schema, value, _ctx) => {
      return _safeParse(_Err)(schema, value, _ctx);
    };
    safeDecode = /* @__PURE__ */ _safeDecode($ZodRealError);
    _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return _safeParseAsync(_Err)(schema, value, ctx);
    };
    safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync($ZodRealError);
    _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
      return _safeParseAsync(_Err)(schema, value, _ctx);
    };
    safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync($ZodRealError);
  }
});

// node_modules/zod/v4/core/regexes.js
var regexes_exports = {};
__export(regexes_exports, {
  base64: () => base64,
  base64url: () => base64url,
  bigint: () => bigint,
  boolean: () => boolean,
  browserEmail: () => browserEmail,
  cidrv4: () => cidrv4,
  cidrv6: () => cidrv6,
  cuid: () => cuid,
  cuid2: () => cuid2,
  date: () => date,
  datetime: () => datetime,
  domain: () => domain,
  duration: () => duration,
  e164: () => e164,
  email: () => email,
  emoji: () => emoji,
  extendedDuration: () => extendedDuration,
  guid: () => guid,
  hex: () => hex,
  hostname: () => hostname,
  html5Email: () => html5Email,
  httpProtocol: () => httpProtocol,
  idnEmail: () => idnEmail,
  integer: () => integer,
  ipv4: () => ipv4,
  ipv6: () => ipv6,
  ksuid: () => ksuid,
  lowercase: () => lowercase,
  mac: () => mac,
  md5_base64: () => md5_base64,
  md5_base64url: () => md5_base64url,
  md5_hex: () => md5_hex,
  nanoid: () => nanoid,
  null: () => _null,
  number: () => number,
  rfc5322Email: () => rfc5322Email,
  sha1_base64: () => sha1_base64,
  sha1_base64url: () => sha1_base64url,
  sha1_hex: () => sha1_hex,
  sha256_base64: () => sha256_base64,
  sha256_base64url: () => sha256_base64url,
  sha256_hex: () => sha256_hex,
  sha384_base64: () => sha384_base64,
  sha384_base64url: () => sha384_base64url,
  sha384_hex: () => sha384_hex,
  sha512_base64: () => sha512_base64,
  sha512_base64url: () => sha512_base64url,
  sha512_hex: () => sha512_hex,
  string: () => string,
  time: () => time,
  ulid: () => ulid,
  undefined: () => _undefined,
  unicodeEmail: () => unicodeEmail,
  uppercase: () => uppercase,
  uuid: () => uuid,
  uuid4: () => uuid4,
  uuid6: () => uuid6,
  uuid7: () => uuid7,
  xid: () => xid
});
function emoji() {
  return new RegExp(_emoji, "u");
}
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time3 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time3}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
function fixedBase64(bodyLength, padding) {
  return new RegExp(`^[A-Za-z0-9+/]{${bodyLength}}${padding}$`);
}
function fixedBase64url(length) {
  return new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
}
var cuid, cuid2, ulid, xid, ksuid, nanoid, duration, extendedDuration, guid, uuid, uuid4, uuid6, uuid7, email, html5Email, rfc5322Email, unicodeEmail, idnEmail, browserEmail, _emoji, ipv4, ipv6, mac, cidrv4, cidrv6, base64, base64url, hostname, domain, httpProtocol, e164, dateSource, date, string, bigint, integer, number, boolean, _null, _undefined, lowercase, uppercase, hex, md5_hex, md5_base64, md5_base64url, sha1_hex, sha1_base64, sha1_base64url, sha256_hex, sha256_base64, sha256_base64url, sha384_hex, sha384_base64, sha384_base64url, sha512_hex, sha512_base64, sha512_base64url;
var init_regexes = __esm({
  "node_modules/zod/v4/core/regexes.js"() {
    init_util2();
    cuid = /^[cC][0-9a-z]{6,}$/;
    cuid2 = /^[0-9a-z]+$/;
    ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
    xid = /^[0-9a-vA-V]{20}$/;
    ksuid = /^[A-Za-z0-9]{27}$/;
    nanoid = /^[a-zA-Z0-9_-]{21}$/;
    duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
    extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
    guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
    uuid = (version2) => {
      if (!version2)
        return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
      return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
    };
    uuid4 = /* @__PURE__ */ uuid(4);
    uuid6 = /* @__PURE__ */ uuid(6);
    uuid7 = /* @__PURE__ */ uuid(7);
    email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
    html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
    idnEmail = unicodeEmail;
    browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
    ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
    ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
    mac = (delimiter) => {
      const escapedDelim = escapeRegex(delimiter ?? ":");
      return new RegExp(`^(?:[0-9A-F]{2}${escapedDelim}){5}[0-9A-F]{2}$|^(?:[0-9a-f]{2}${escapedDelim}){5}[0-9a-f]{2}$`);
    };
    cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
    cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
    base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
    base64url = /^[A-Za-z0-9_-]*$/;
    hostname = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/;
    domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    httpProtocol = /^https?$/;
    e164 = /^\+[1-9]\d{6,14}$/;
    dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
    date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
    string = (params) => {
      const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
      return new RegExp(`^${regex}$`);
    };
    bigint = /^-?\d+n?$/;
    integer = /^-?\d+$/;
    number = /^-?\d+(?:\.\d+)?$/;
    boolean = /^(?:true|false)$/i;
    _null = /^null$/i;
    _undefined = /^undefined$/i;
    lowercase = /^[^A-Z]*$/;
    uppercase = /^[^a-z]*$/;
    hex = /^[0-9a-fA-F]*$/;
    md5_hex = /^[0-9a-fA-F]{32}$/;
    md5_base64 = /* @__PURE__ */ fixedBase64(22, "==");
    md5_base64url = /* @__PURE__ */ fixedBase64url(22);
    sha1_hex = /^[0-9a-fA-F]{40}$/;
    sha1_base64 = /* @__PURE__ */ fixedBase64(27, "=");
    sha1_base64url = /* @__PURE__ */ fixedBase64url(27);
    sha256_hex = /^[0-9a-fA-F]{64}$/;
    sha256_base64 = /* @__PURE__ */ fixedBase64(43, "=");
    sha256_base64url = /* @__PURE__ */ fixedBase64url(43);
    sha384_hex = /^[0-9a-fA-F]{96}$/;
    sha384_base64 = /* @__PURE__ */ fixedBase64(64, "");
    sha384_base64url = /* @__PURE__ */ fixedBase64url(64);
    sha512_hex = /^[0-9a-fA-F]{128}$/;
    sha512_base64 = /* @__PURE__ */ fixedBase64(86, "==");
    sha512_base64url = /* @__PURE__ */ fixedBase64url(86);
  }
});

// node_modules/zod/v4/core/checks.js
function handleCheckPropertyResult(result, payload, property) {
  if (result.issues.length) {
    payload.issues.push(...prefixIssues(property, result.issues));
  }
}
var $ZodCheck, numericOriginMap, $ZodCheckLessThan, $ZodCheckGreaterThan, $ZodCheckMultipleOf, $ZodCheckNumberFormat, $ZodCheckBigIntFormat, $ZodCheckMaxSize, $ZodCheckMinSize, $ZodCheckSizeEquals, $ZodCheckMaxLength, $ZodCheckMinLength, $ZodCheckLengthEquals, $ZodCheckStringFormat, $ZodCheckRegex, $ZodCheckLowerCase, $ZodCheckUpperCase, $ZodCheckIncludes, $ZodCheckStartsWith, $ZodCheckEndsWith, $ZodCheckProperty, $ZodCheckMimeType, $ZodCheckOverwrite;
var init_checks = __esm({
  "node_modules/zod/v4/core/checks.js"() {
    init_core();
    init_regexes();
    init_util2();
    $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
      var _a3;
      inst._zod ?? (inst._zod = {});
      inst._zod.def = def;
      (_a3 = inst._zod).onattach ?? (_a3.onattach = []);
    });
    numericOriginMap = {
      number: "number",
      bigint: "bigint",
      object: "date"
    };
    $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
      $ZodCheck.init(inst, def);
      const origin = numericOriginMap[typeof def.value];
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
        if (def.value < curr) {
          if (def.inclusive)
            bag.maximum = def.value;
          else
            bag.exclusiveMaximum = def.value;
        }
      });
      inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
          return;
        }
        payload.issues.push({
          origin,
          code: "too_big",
          maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
          input: payload.value,
          inclusive: def.inclusive,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
      $ZodCheck.init(inst, def);
      const origin = numericOriginMap[typeof def.value];
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
        if (def.value > curr) {
          if (def.inclusive)
            bag.minimum = def.value;
          else
            bag.exclusiveMinimum = def.value;
        }
      });
      inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
          return;
        }
        payload.issues.push({
          origin,
          code: "too_small",
          minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
          input: payload.value,
          inclusive: def.inclusive,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
      $ZodCheck.init(inst, def);
      inst._zod.onattach.push((inst2) => {
        var _a3;
        (_a3 = inst2._zod.bag).multipleOf ?? (_a3.multipleOf = def.value);
      });
      inst._zod.check = (payload) => {
        if (typeof payload.value !== typeof def.value)
          throw new Error("Cannot mix number and bigint in multiple_of check.");
        const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
        if (isMultiple)
          return;
        payload.issues.push({
          origin: typeof payload.value,
          code: "not_multiple_of",
          divisor: def.value,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
      $ZodCheck.init(inst, def);
      def.format = def.format || "float64";
      const isInt = def.format?.includes("int");
      const origin = isInt ? "int" : "number";
      const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
        if (isInt)
          bag.pattern = integer;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        if (isInt) {
          if (!Number.isInteger(input)) {
            payload.issues.push({
              expected: origin,
              format: def.format,
              code: "invalid_type",
              continue: false,
              input,
              inst
            });
            return;
          }
          if (!Number.isSafeInteger(input)) {
            if (input > 0) {
              payload.issues.push({
                input,
                code: "too_big",
                maximum: Number.MAX_SAFE_INTEGER,
                note: "Integers must be within the safe integer range.",
                inst,
                origin,
                inclusive: true,
                continue: !def.abort
              });
            } else {
              payload.issues.push({
                input,
                code: "too_small",
                minimum: Number.MIN_SAFE_INTEGER,
                note: "Integers must be within the safe integer range.",
                inst,
                origin,
                inclusive: true,
                continue: !def.abort
              });
            }
            return;
          }
        }
        if (input < minimum) {
          payload.issues.push({
            origin: "number",
            input,
            code: "too_small",
            minimum,
            inclusive: true,
            inst,
            continue: !def.abort
          });
        }
        if (input > maximum) {
          payload.issues.push({
            origin: "number",
            input,
            code: "too_big",
            maximum,
            inclusive: true,
            inst,
            continue: !def.abort
          });
        }
      };
    });
    $ZodCheckBigIntFormat = /* @__PURE__ */ $constructor("$ZodCheckBigIntFormat", (inst, def) => {
      $ZodCheck.init(inst, def);
      const [minimum, maximum] = BIGINT_FORMAT_RANGES[def.format];
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        if (input < minimum) {
          payload.issues.push({
            origin: "bigint",
            input,
            code: "too_small",
            minimum,
            inclusive: true,
            inst,
            continue: !def.abort
          });
        }
        if (input > maximum) {
          payload.issues.push({
            origin: "bigint",
            input,
            code: "too_big",
            maximum,
            inclusive: true,
            inst,
            continue: !def.abort
          });
        }
      };
    });
    $ZodCheckMaxSize = /* @__PURE__ */ $constructor("$ZodCheckMaxSize", (inst, def) => {
      var _a3;
      $ZodCheck.init(inst, def);
      (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.size !== void 0;
      });
      inst._zod.onattach.push((inst2) => {
        const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
        if (def.maximum < curr)
          inst2._zod.bag.maximum = def.maximum;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size <= def.maximum)
          return;
        payload.issues.push({
          origin: getSizableOrigin(input),
          code: "too_big",
          maximum: def.maximum,
          inclusive: true,
          input,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckMinSize = /* @__PURE__ */ $constructor("$ZodCheckMinSize", (inst, def) => {
      var _a3;
      $ZodCheck.init(inst, def);
      (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.size !== void 0;
      });
      inst._zod.onattach.push((inst2) => {
        const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
        if (def.minimum > curr)
          inst2._zod.bag.minimum = def.minimum;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size >= def.minimum)
          return;
        payload.issues.push({
          origin: getSizableOrigin(input),
          code: "too_small",
          minimum: def.minimum,
          inclusive: true,
          input,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckSizeEquals = /* @__PURE__ */ $constructor("$ZodCheckSizeEquals", (inst, def) => {
      var _a3;
      $ZodCheck.init(inst, def);
      (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.size !== void 0;
      });
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.minimum = def.size;
        bag.maximum = def.size;
        bag.size = def.size;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size === def.size)
          return;
        const tooBig = size > def.size;
        payload.issues.push({
          origin: getSizableOrigin(input),
          ...tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size },
          inclusive: true,
          exact: true,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
      var _a3;
      $ZodCheck.init(inst, def);
      (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== void 0;
      });
      inst._zod.onattach.push((inst2) => {
        const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
        if (def.maximum < curr)
          inst2._zod.bag.maximum = def.maximum;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length <= def.maximum)
          return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
          origin,
          code: "too_big",
          maximum: def.maximum,
          inclusive: true,
          input,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
      var _a3;
      $ZodCheck.init(inst, def);
      (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== void 0;
      });
      inst._zod.onattach.push((inst2) => {
        const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
        if (def.minimum > curr)
          inst2._zod.bag.minimum = def.minimum;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length >= def.minimum)
          return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
          origin,
          code: "too_small",
          minimum: def.minimum,
          inclusive: true,
          input,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
      var _a3;
      $ZodCheck.init(inst, def);
      (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== void 0;
      });
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.minimum = def.length;
        bag.maximum = def.length;
        bag.length = def.length;
      });
      inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length === def.length)
          return;
        const origin = getLengthableOrigin(input);
        const tooBig = length > def.length;
        payload.issues.push({
          origin,
          ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
          inclusive: true,
          exact: true,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
      var _a3, _b;
      $ZodCheck.init(inst, def);
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.format = def.format;
        if (def.pattern) {
          bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
          bag.patterns.add(def.pattern);
        }
      });
      if (def.pattern)
        (_a3 = inst._zod).check ?? (_a3.check = (payload) => {
          def.pattern.lastIndex = 0;
          if (def.pattern.test(payload.value))
            return;
          payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: def.format,
            input: payload.value,
            ...def.pattern ? { pattern: def.pattern.toString() } : {},
            inst,
            continue: !def.abort
          });
        });
      else
        (_b = inst._zod).check ?? (_b.check = () => {
        });
    });
    $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
      $ZodCheckStringFormat.init(inst, def);
      inst._zod.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: "regex",
          input: payload.value,
          pattern: def.pattern.toString(),
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
      def.pattern ?? (def.pattern = lowercase);
      $ZodCheckStringFormat.init(inst, def);
    });
    $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
      def.pattern ?? (def.pattern = uppercase);
      $ZodCheckStringFormat.init(inst, def);
    });
    $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
      $ZodCheck.init(inst, def);
      const escapedRegex = escapeRegex(def.includes);
      const pattern2 = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
      def.pattern = pattern2;
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
        bag.patterns.add(pattern2);
      });
      inst._zod.check = (payload) => {
        if (payload.value.includes(def.includes, def.position))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: "includes",
          includes: def.includes,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
      $ZodCheck.init(inst, def);
      const pattern2 = new RegExp(`^${escapeRegex(def.prefix)}.*`);
      def.pattern ?? (def.pattern = pattern2);
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
        bag.patterns.add(pattern2);
      });
      inst._zod.check = (payload) => {
        if (payload.value.startsWith(def.prefix))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: "starts_with",
          prefix: def.prefix,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
      $ZodCheck.init(inst, def);
      const pattern2 = new RegExp(`.*${escapeRegex(def.suffix)}$`);
      def.pattern ?? (def.pattern = pattern2);
      inst._zod.onattach.push((inst2) => {
        const bag = inst2._zod.bag;
        bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
        bag.patterns.add(pattern2);
      });
      inst._zod.check = (payload) => {
        if (payload.value.endsWith(def.suffix))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: "ends_with",
          suffix: def.suffix,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckProperty = /* @__PURE__ */ $constructor("$ZodCheckProperty", (inst, def) => {
      $ZodCheck.init(inst, def);
      inst._zod.check = (payload) => {
        const result = def.schema._zod.run({
          value: payload.value[def.property],
          issues: []
        }, {});
        if (result instanceof Promise) {
          return result.then((result2) => handleCheckPropertyResult(result2, payload, def.property));
        }
        handleCheckPropertyResult(result, payload, def.property);
        return;
      };
    });
    $ZodCheckMimeType = /* @__PURE__ */ $constructor("$ZodCheckMimeType", (inst, def) => {
      $ZodCheck.init(inst, def);
      const mimeSet = new Set(def.mime);
      inst._zod.onattach.push((inst2) => {
        inst2._zod.bag.mime = def.mime;
      });
      inst._zod.check = (payload) => {
        if (mimeSet.has(payload.value.type))
          return;
        payload.issues.push({
          code: "invalid_value",
          values: def.mime,
          input: payload.value.type,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
      $ZodCheck.init(inst, def);
      inst._zod.check = (payload) => {
        payload.value = def.tx(payload.value);
      };
    });
  }
});

// node_modules/zod/v4/core/doc.js
var Doc;
var init_doc = __esm({
  "node_modules/zod/v4/core/doc.js"() {
    Doc = class {
      constructor(args = []) {
        this.content = [];
        this.indent = 0;
        if (this)
          this.args = args;
      }
      indented(fn) {
        this.indent += 1;
        fn(this);
        this.indent -= 1;
      }
      write(arg) {
        if (typeof arg === "function") {
          arg(this, { execution: "sync" });
          arg(this, { execution: "async" });
          return;
        }
        const content = arg;
        const lines = content.split("\n").filter((x) => x);
        const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
        const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
        for (const line of dedented) {
          this.content.push(line);
        }
      }
      compile() {
        const F = Function;
        const args = this?.args;
        const content = this?.content ?? [``];
        const lines = [...content.map((x) => `  ${x}`)];
        return new F(...args, lines.join("\n"));
      }
    };
  }
});

// node_modules/zod/v4/core/versions.js
var version;
var init_versions = __esm({
  "node_modules/zod/v4/core/versions.js"() {
    version = {
      major: 4,
      minor: 4,
      patch: 3
    };
  }
});

// node_modules/zod/v4/core/schemas.js
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base643 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base643.padEnd(Math.ceil(base643.length / 4) * 4, "=");
  return isValidBase64(padded);
}
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
function handleExclusiveUnionResults(results, final, inst, ctx) {
  const successes = results.filter((r) => r.issues.length === 0);
  if (successes.length === 1) {
    final.value = successes[0].value;
    return final;
  }
  if (successes.length === 0) {
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
    });
  } else {
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: [],
      inclusive: false
    });
  }
  return final;
}
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = /* @__PURE__ */ new Map();
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
function getTupleOptStart(items, key) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]._zod[key] !== "optional")
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0; i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1; i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === void 0) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
  if (keyResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, keyResult.issues));
    } else {
      final.issues.push({
        code: "invalid_key",
        origin: "map",
        input,
        inst,
        issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  if (valueResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, valueResult.issues));
    } else {
      final.issues.push({
        origin: "map",
        code: "invalid_element",
        input,
        inst,
        key,
        issues: valueResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  final.value.set(keyResult.value, valueResult.value);
}
function handleSetResult(result, final) {
  if (result.issues.length) {
    final.issues.push(...result.issues);
  }
  final.value.add(result.value);
}
function handleOptionalResult(result, input) {
  if (input === void 0 && (result.issues.length || result.fallback)) {
    return { issues: [], value: void 0 };
  }
  return result;
}
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
function handleCodecAResult(result, def, ctx) {
  if (result.issues.length) {
    result.aborted = true;
    return result;
  }
  const direction = ctx.direction || "forward";
  if (direction === "forward") {
    const transformed = def.transform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.out, ctx));
    }
    return handleCodecTxResult(result, transformed, def.out, ctx);
  } else {
    const transformed = def.reverseTransform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.in, ctx));
    }
    return handleCodecTxResult(result, transformed, def.in, ctx);
  }
}
function handleCodecTxResult(left, value, nextSchema, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return nextSchema._zod.run({ value, issues: left.issues }, ctx);
}
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
var $ZodType, $ZodString, $ZodStringFormat, $ZodGUID, $ZodUUID, $ZodEmail, $ZodURL, $ZodEmoji, $ZodNanoID, $ZodCUID, $ZodCUID2, $ZodULID, $ZodXID, $ZodKSUID, $ZodISODateTime, $ZodISODate, $ZodISOTime, $ZodISODuration, $ZodIPv4, $ZodIPv6, $ZodMAC, $ZodCIDRv4, $ZodCIDRv6, $ZodBase64, $ZodBase64URL, $ZodE164, $ZodJWT, $ZodCustomStringFormat, $ZodNumber, $ZodNumberFormat, $ZodBoolean, $ZodBigInt, $ZodBigIntFormat, $ZodSymbol, $ZodUndefined, $ZodNull, $ZodAny, $ZodUnknown, $ZodNever, $ZodVoid, $ZodDate, $ZodArray, $ZodObject, $ZodObjectJIT, $ZodUnion, $ZodXor, $ZodDiscriminatedUnion, $ZodIntersection, $ZodTuple, $ZodRecord, $ZodMap, $ZodSet, $ZodEnum, $ZodLiteral, $ZodFile, $ZodTransform, $ZodOptional, $ZodExactOptional, $ZodNullable, $ZodDefault, $ZodPrefault, $ZodNonOptional, $ZodSuccess, $ZodCatch, $ZodNaN, $ZodPipe, $ZodCodec, $ZodPreprocess, $ZodReadonly, $ZodTemplateLiteral, $ZodFunction, $ZodPromise, $ZodLazy, $ZodCustom;
var init_schemas = __esm({
  "node_modules/zod/v4/core/schemas.js"() {
    init_checks();
    init_core();
    init_doc();
    init_parse();
    init_regexes();
    init_util2();
    init_versions();
    init_util2();
    $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
      var _a3;
      inst ?? (inst = {});
      inst._zod.def = def;
      inst._zod.bag = inst._zod.bag || {};
      inst._zod.version = version;
      const checks = [...inst._zod.def.checks ?? []];
      if (inst._zod.traits.has("$ZodCheck")) {
        checks.unshift(inst);
      }
      for (const ch of checks) {
        for (const fn of ch._zod.onattach) {
          fn(inst);
        }
      }
      if (checks.length === 0) {
        (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
        inst._zod.deferred?.push(() => {
          inst._zod.run = inst._zod.parse;
        });
      } else {
        const runChecks = (payload, checks2, ctx) => {
          let isAborted = aborted(payload);
          let asyncResult;
          for (const ch of checks2) {
            if (ch._zod.def.when) {
              if (explicitlyAborted(payload))
                continue;
              const shouldRun = ch._zod.def.when(payload);
              if (!shouldRun)
                continue;
            } else if (isAborted) {
              continue;
            }
            const currLen = payload.issues.length;
            const _ = ch._zod.check(payload);
            if (_ instanceof Promise && ctx?.async === false) {
              throw new $ZodAsyncError();
            }
            if (asyncResult || _ instanceof Promise) {
              asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
                await _;
                const nextLen = payload.issues.length;
                if (nextLen === currLen)
                  return;
                if (!isAborted)
                  isAborted = aborted(payload, currLen);
              });
            } else {
              const nextLen = payload.issues.length;
              if (nextLen === currLen)
                continue;
              if (!isAborted)
                isAborted = aborted(payload, currLen);
            }
          }
          if (asyncResult) {
            return asyncResult.then(() => {
              return payload;
            });
          }
          return payload;
        };
        const handleCanaryResult = (canary, payload, ctx) => {
          if (aborted(canary)) {
            canary.aborted = true;
            return canary;
          }
          const checkResult = runChecks(payload, checks, ctx);
          if (checkResult instanceof Promise) {
            if (ctx.async === false)
              throw new $ZodAsyncError();
            return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
          }
          return inst._zod.parse(checkResult, ctx);
        };
        inst._zod.run = (payload, ctx) => {
          if (ctx.skipChecks) {
            return inst._zod.parse(payload, ctx);
          }
          if (ctx.direction === "backward") {
            const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
            if (canary instanceof Promise) {
              return canary.then((canary2) => {
                return handleCanaryResult(canary2, payload, ctx);
              });
            }
            return handleCanaryResult(canary, payload, ctx);
          }
          const result = inst._zod.parse(payload, ctx);
          if (result instanceof Promise) {
            if (ctx.async === false)
              throw new $ZodAsyncError();
            return result.then((result2) => runChecks(result2, checks, ctx));
          }
          return runChecks(result, checks, ctx);
        };
      }
      defineLazy(inst, "~standard", () => ({
        validate: (value) => {
          try {
            const r = safeParse(inst, value);
            return r.success ? { value: r.data } : { issues: r.error?.issues };
          } catch (_) {
            return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
          }
        },
        vendor: "zod",
        version: 1
      }));
    });
    $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
      inst._zod.parse = (payload, _) => {
        if (def.coerce)
          try {
            payload.value = String(payload.value);
          } catch (_2) {
          }
        if (typeof payload.value === "string")
          return payload;
        payload.issues.push({
          expected: "string",
          code: "invalid_type",
          input: payload.value,
          inst
        });
        return payload;
      };
    });
    $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
      $ZodCheckStringFormat.init(inst, def);
      $ZodString.init(inst, def);
    });
    $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
      def.pattern ?? (def.pattern = guid);
      $ZodStringFormat.init(inst, def);
    });
    $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
      if (def.version) {
        const versionMap = {
          v1: 1,
          v2: 2,
          v3: 3,
          v4: 4,
          v5: 5,
          v6: 6,
          v7: 7,
          v8: 8
        };
        const v = versionMap[def.version];
        if (v === void 0)
          throw new Error(`Invalid UUID version: "${def.version}"`);
        def.pattern ?? (def.pattern = uuid(v));
      } else
        def.pattern ?? (def.pattern = uuid());
      $ZodStringFormat.init(inst, def);
    });
    $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
      def.pattern ?? (def.pattern = email);
      $ZodStringFormat.init(inst, def);
    });
    $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
      $ZodStringFormat.init(inst, def);
      inst._zod.check = (payload) => {
        try {
          const trimmed = payload.value.trim();
          if (!def.normalize && def.protocol?.source === httpProtocol.source) {
            if (!/^https?:\/\//i.test(trimmed)) {
              payload.issues.push({
                code: "invalid_format",
                format: "url",
                note: "Invalid URL format",
                input: payload.value,
                inst,
                continue: !def.abort
              });
              return;
            }
          }
          const url2 = new URL(trimmed);
          if (def.hostname) {
            def.hostname.lastIndex = 0;
            if (!def.hostname.test(url2.hostname)) {
              payload.issues.push({
                code: "invalid_format",
                format: "url",
                note: "Invalid hostname",
                pattern: def.hostname.source,
                input: payload.value,
                inst,
                continue: !def.abort
              });
            }
          }
          if (def.protocol) {
            def.protocol.lastIndex = 0;
            if (!def.protocol.test(url2.protocol.endsWith(":") ? url2.protocol.slice(0, -1) : url2.protocol)) {
              payload.issues.push({
                code: "invalid_format",
                format: "url",
                note: "Invalid protocol",
                pattern: def.protocol.source,
                input: payload.value,
                inst,
                continue: !def.abort
              });
            }
          }
          if (def.normalize) {
            payload.value = url2.href;
          } else {
            payload.value = trimmed;
          }
          return;
        } catch (_) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      };
    });
    $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
      def.pattern ?? (def.pattern = emoji());
      $ZodStringFormat.init(inst, def);
    });
    $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
      def.pattern ?? (def.pattern = nanoid);
      $ZodStringFormat.init(inst, def);
    });
    $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
      def.pattern ?? (def.pattern = cuid);
      $ZodStringFormat.init(inst, def);
    });
    $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
      def.pattern ?? (def.pattern = cuid2);
      $ZodStringFormat.init(inst, def);
    });
    $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
      def.pattern ?? (def.pattern = ulid);
      $ZodStringFormat.init(inst, def);
    });
    $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
      def.pattern ?? (def.pattern = xid);
      $ZodStringFormat.init(inst, def);
    });
    $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
      def.pattern ?? (def.pattern = ksuid);
      $ZodStringFormat.init(inst, def);
    });
    $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
      def.pattern ?? (def.pattern = datetime(def));
      $ZodStringFormat.init(inst, def);
    });
    $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
      def.pattern ?? (def.pattern = date);
      $ZodStringFormat.init(inst, def);
    });
    $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
      def.pattern ?? (def.pattern = time(def));
      $ZodStringFormat.init(inst, def);
    });
    $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
      def.pattern ?? (def.pattern = duration);
      $ZodStringFormat.init(inst, def);
    });
    $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
      def.pattern ?? (def.pattern = ipv4);
      $ZodStringFormat.init(inst, def);
      inst._zod.bag.format = `ipv4`;
    });
    $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
      def.pattern ?? (def.pattern = ipv6);
      $ZodStringFormat.init(inst, def);
      inst._zod.bag.format = `ipv6`;
      inst._zod.check = (payload) => {
        try {
          new URL(`http://[${payload.value}]`);
        } catch {
          payload.issues.push({
            code: "invalid_format",
            format: "ipv6",
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      };
    });
    $ZodMAC = /* @__PURE__ */ $constructor("$ZodMAC", (inst, def) => {
      def.pattern ?? (def.pattern = mac(def.delimiter));
      $ZodStringFormat.init(inst, def);
      inst._zod.bag.format = `mac`;
    });
    $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
      def.pattern ?? (def.pattern = cidrv4);
      $ZodStringFormat.init(inst, def);
    });
    $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
      def.pattern ?? (def.pattern = cidrv6);
      $ZodStringFormat.init(inst, def);
      inst._zod.check = (payload) => {
        const parts = payload.value.split("/");
        try {
          if (parts.length !== 2)
            throw new Error();
          const [address, prefix] = parts;
          if (!prefix)
            throw new Error();
          const prefixNum = Number(prefix);
          if (`${prefixNum}` !== prefix)
            throw new Error();
          if (prefixNum < 0 || prefixNum > 128)
            throw new Error();
          new URL(`http://[${address}]`);
        } catch {
          payload.issues.push({
            code: "invalid_format",
            format: "cidrv6",
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      };
    });
    $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
      def.pattern ?? (def.pattern = base64);
      $ZodStringFormat.init(inst, def);
      inst._zod.bag.contentEncoding = "base64";
      inst._zod.check = (payload) => {
        if (isValidBase64(payload.value))
          return;
        payload.issues.push({
          code: "invalid_format",
          format: "base64",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
      def.pattern ?? (def.pattern = base64url);
      $ZodStringFormat.init(inst, def);
      inst._zod.bag.contentEncoding = "base64url";
      inst._zod.check = (payload) => {
        if (isValidBase64URL(payload.value))
          return;
        payload.issues.push({
          code: "invalid_format",
          format: "base64url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
      def.pattern ?? (def.pattern = e164);
      $ZodStringFormat.init(inst, def);
    });
    $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
      $ZodStringFormat.init(inst, def);
      inst._zod.check = (payload) => {
        if (isValidJWT(payload.value, def.alg))
          return;
        payload.issues.push({
          code: "invalid_format",
          format: "jwt",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodCustomStringFormat = /* @__PURE__ */ $constructor("$ZodCustomStringFormat", (inst, def) => {
      $ZodStringFormat.init(inst, def);
      inst._zod.check = (payload) => {
        if (def.fn(payload.value))
          return;
        payload.issues.push({
          code: "invalid_format",
          format: def.format,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      };
    });
    $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.pattern = inst._zod.bag.pattern ?? number;
      inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
          try {
            payload.value = Number(payload.value);
          } catch (_) {
          }
        const input = payload.value;
        if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
          return payload;
        }
        const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
        payload.issues.push({
          expected: "number",
          code: "invalid_type",
          input,
          inst,
          ...received ? { received } : {}
        });
        return payload;
      };
    });
    $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
      $ZodCheckNumberFormat.init(inst, def);
      $ZodNumber.init(inst, def);
    });
    $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.pattern = boolean;
      inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
          try {
            payload.value = Boolean(payload.value);
          } catch (_) {
          }
        const input = payload.value;
        if (typeof input === "boolean")
          return payload;
        payload.issues.push({
          expected: "boolean",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      };
    });
    $ZodBigInt = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.pattern = bigint;
      inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
          try {
            payload.value = BigInt(payload.value);
          } catch (_) {
          }
        if (typeof payload.value === "bigint")
          return payload;
        payload.issues.push({
          expected: "bigint",
          code: "invalid_type",
          input: payload.value,
          inst
        });
        return payload;
      };
    });
    $ZodBigIntFormat = /* @__PURE__ */ $constructor("$ZodBigIntFormat", (inst, def) => {
      $ZodCheckBigIntFormat.init(inst, def);
      $ZodBigInt.init(inst, def);
    });
    $ZodSymbol = /* @__PURE__ */ $constructor("$ZodSymbol", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "symbol")
          return payload;
        payload.issues.push({
          expected: "symbol",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      };
    });
    $ZodUndefined = /* @__PURE__ */ $constructor("$ZodUndefined", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.pattern = _undefined;
      inst._zod.values = /* @__PURE__ */ new Set([void 0]);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "undefined")
          return payload;
        payload.issues.push({
          expected: "undefined",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      };
    });
    $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.pattern = _null;
      inst._zod.values = /* @__PURE__ */ new Set([null]);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (input === null)
          return payload;
        payload.issues.push({
          expected: "null",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      };
    });
    $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload) => payload;
    });
    $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload) => payload;
    });
    $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _ctx) => {
        payload.issues.push({
          expected: "never",
          code: "invalid_type",
          input: payload.value,
          inst
        });
        return payload;
      };
    });
    $ZodVoid = /* @__PURE__ */ $constructor("$ZodVoid", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "undefined")
          return payload;
        payload.issues.push({
          expected: "void",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      };
    });
    $ZodDate = /* @__PURE__ */ $constructor("$ZodDate", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _ctx) => {
        if (def.coerce) {
          try {
            payload.value = new Date(payload.value);
          } catch (_err) {
          }
        }
        const input = payload.value;
        const isDate = input instanceof Date;
        const isValidDate = isDate && !Number.isNaN(input.getTime());
        if (isValidDate)
          return payload;
        payload.issues.push({
          expected: "date",
          code: "invalid_type",
          input,
          ...isDate ? { received: "Invalid Date" } : {},
          inst
        });
        return payload;
      };
    });
    $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
          payload.issues.push({
            expected: "array",
            code: "invalid_type",
            input,
            inst
          });
          return payload;
        }
        payload.value = Array(input.length);
        const proms = [];
        for (let i = 0; i < input.length; i++) {
          const item = input[i];
          const result = def.element._zod.run({
            value: item,
            issues: []
          }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
          } else {
            handleArrayResult(result, payload, i);
          }
        }
        if (proms.length) {
          return Promise.all(proms).then(() => payload);
        }
        return payload;
      };
    });
    $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
      $ZodType.init(inst, def);
      const desc = Object.getOwnPropertyDescriptor(def, "shape");
      if (!desc?.get) {
        const sh = def.shape;
        Object.defineProperty(def, "shape", {
          get: () => {
            const newSh = { ...sh };
            Object.defineProperty(def, "shape", {
              value: newSh
            });
            return newSh;
          }
        });
      }
      const _normalized = cached(() => normalizeDef(def));
      defineLazy(inst._zod, "propValues", () => {
        const shape = def.shape;
        const propValues = {};
        for (const key in shape) {
          const field = shape[key]._zod;
          if (field.values) {
            propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
            for (const v of field.values)
              propValues[key].add(v);
          }
        }
        return propValues;
      });
      const isObject3 = isObject;
      const catchall = def.catchall;
      let value;
      inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject3(input)) {
          payload.issues.push({
            expected: "object",
            code: "invalid_type",
            input,
            inst
          });
          return payload;
        }
        payload.value = {};
        const proms = [];
        const shape = value.shape;
        for (const key of value.keys) {
          const el = shape[key];
          const isOptionalIn = el._zod.optin === "optional";
          const isOptionalOut = el._zod.optout === "optional";
          const r = el._zod.run({ value: input[key], issues: [] }, ctx);
          if (r instanceof Promise) {
            proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
          } else {
            handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
          }
        }
        if (!catchall) {
          return proms.length ? Promise.all(proms).then(() => payload) : payload;
        }
        return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
      };
    });
    $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
      $ZodObject.init(inst, def);
      const superParse = inst._zod.parse;
      const _normalized = cached(() => normalizeDef(def));
      const generateFastpass = (shape) => {
        const doc = new Doc(["shape", "payload", "ctx"]);
        const normalized = _normalized.value;
        const parseStr = (key) => {
          const k = esc(key);
          return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
        };
        doc.write(`const input = payload.value;`);
        const ids = /* @__PURE__ */ Object.create(null);
        let counter = 0;
        for (const key of normalized.keys) {
          ids[key] = `key_${counter++}`;
        }
        doc.write(`const newResult = {};`);
        for (const key of normalized.keys) {
          const id = ids[key];
          const k = esc(key);
          const schema = shape[key];
          const isOptionalIn = schema?._zod?.optin === "optional";
          const isOptionalOut = schema?._zod?.optout === "optional";
          doc.write(`const ${id} = ${parseStr(key)};`);
          if (isOptionalIn && isOptionalOut) {
            doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
          } else if (!isOptionalIn) {
            doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
          } else {
            doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
          }
        }
        doc.write(`payload.value = newResult;`);
        doc.write(`return payload;`);
        const fn = doc.compile();
        return (payload, ctx) => fn(shape, payload, ctx);
      };
      let fastpass;
      const isObject3 = isObject;
      const jit = !globalConfig.jitless;
      const allowsEval2 = allowsEval;
      const fastEnabled = jit && allowsEval2.value;
      const catchall = def.catchall;
      let value;
      inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject3(input)) {
          payload.issues.push({
            expected: "object",
            code: "invalid_type",
            input,
            inst
          });
          return payload;
        }
        if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
          if (!fastpass)
            fastpass = generateFastpass(def.shape);
          payload = fastpass(payload, ctx);
          if (!catchall)
            return payload;
          return handleCatchall([], input, payload, ctx, value, inst);
        }
        return superParse(payload, ctx);
      };
    });
    $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
      defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
      defineLazy(inst._zod, "values", () => {
        if (def.options.every((o) => o._zod.values)) {
          return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
        }
        return void 0;
      });
      defineLazy(inst._zod, "pattern", () => {
        if (def.options.every((o) => o._zod.pattern)) {
          const patterns = def.options.map((o) => o._zod.pattern);
          return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
        }
        return void 0;
      });
      const first = def.options.length === 1 ? def.options[0]._zod.run : null;
      inst._zod.parse = (payload, ctx) => {
        if (first) {
          return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
          const result = option._zod.run({
            value: payload.value,
            issues: []
          }, ctx);
          if (result instanceof Promise) {
            results.push(result);
            async = true;
          } else {
            if (result.issues.length === 0)
              return result;
            results.push(result);
          }
        }
        if (!async)
          return handleUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results2) => {
          return handleUnionResults(results2, payload, inst, ctx);
        });
      };
    });
    $ZodXor = /* @__PURE__ */ $constructor("$ZodXor", (inst, def) => {
      $ZodUnion.init(inst, def);
      def.inclusive = false;
      const first = def.options.length === 1 ? def.options[0]._zod.run : null;
      inst._zod.parse = (payload, ctx) => {
        if (first) {
          return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
          const result = option._zod.run({
            value: payload.value,
            issues: []
          }, ctx);
          if (result instanceof Promise) {
            results.push(result);
            async = true;
          } else {
            results.push(result);
          }
        }
        if (!async)
          return handleExclusiveUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results2) => {
          return handleExclusiveUnionResults(results2, payload, inst, ctx);
        });
      };
    });
    $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
      def.inclusive = false;
      $ZodUnion.init(inst, def);
      const _super = inst._zod.parse;
      defineLazy(inst._zod, "propValues", () => {
        const propValues = {};
        for (const option of def.options) {
          const pv = option._zod.propValues;
          if (!pv || Object.keys(pv).length === 0)
            throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
          for (const [k, v] of Object.entries(pv)) {
            if (!propValues[k])
              propValues[k] = /* @__PURE__ */ new Set();
            for (const val of v) {
              propValues[k].add(val);
            }
          }
        }
        return propValues;
      });
      const disc = cached(() => {
        const opts = def.options;
        const map2 = /* @__PURE__ */ new Map();
        for (const o of opts) {
          const values = o._zod.propValues?.[def.discriminator];
          if (!values || values.size === 0)
            throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
          for (const v of values) {
            if (map2.has(v)) {
              throw new Error(`Duplicate discriminator value "${String(v)}"`);
            }
            map2.set(v, o);
          }
        }
        return map2;
      });
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!isObject(input)) {
          payload.issues.push({
            code: "invalid_type",
            expected: "object",
            input,
            inst
          });
          return payload;
        }
        const opt = disc.value.get(input?.[def.discriminator]);
        if (opt) {
          return opt._zod.run(payload, ctx);
        }
        if (def.unionFallback || ctx.direction === "backward") {
          return _super(payload, ctx);
        }
        payload.issues.push({
          code: "invalid_union",
          errors: [],
          note: "No matching discriminator",
          discriminator: def.discriminator,
          options: Array.from(disc.value.keys()),
          input,
          path: [def.discriminator],
          inst
        });
        return payload;
      };
    });
    $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        const left = def.left._zod.run({ value: input, issues: [] }, ctx);
        const right = def.right._zod.run({ value: input, issues: [] }, ctx);
        const async = left instanceof Promise || right instanceof Promise;
        if (async) {
          return Promise.all([left, right]).then(([left2, right2]) => {
            return handleIntersectionResults(payload, left2, right2);
          });
        }
        return handleIntersectionResults(payload, left, right);
      };
    });
    $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
      $ZodType.init(inst, def);
      const items = def.items;
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
          payload.issues.push({
            input,
            inst,
            expected: "tuple",
            code: "invalid_type"
          });
          return payload;
        }
        payload.value = [];
        const proms = [];
        const optinStart = getTupleOptStart(items, "optin");
        const optoutStart = getTupleOptStart(items, "optout");
        if (!def.rest) {
          if (input.length < optinStart) {
            payload.issues.push({
              code: "too_small",
              minimum: optinStart,
              inclusive: true,
              input,
              inst,
              origin: "array"
            });
            return payload;
          }
          if (input.length > items.length) {
            payload.issues.push({
              code: "too_big",
              maximum: items.length,
              inclusive: true,
              input,
              inst,
              origin: "array"
            });
          }
        }
        const itemResults = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
          const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
          if (r instanceof Promise) {
            proms.push(r.then((rr) => {
              itemResults[i] = rr;
            }));
          } else {
            itemResults[i] = r;
          }
        }
        if (def.rest) {
          let i = items.length - 1;
          const rest = input.slice(items.length);
          for (const el of rest) {
            i++;
            const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
            if (result instanceof Promise) {
              proms.push(result.then((r) => handleTupleResult(r, payload, i)));
            } else {
              handleTupleResult(result, payload, i);
            }
          }
        }
        if (proms.length) {
          return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
        }
        return handleTupleResults(itemResults, payload, items, input, optoutStart);
      };
    });
    $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!isPlainObject(input)) {
          payload.issues.push({
            expected: "record",
            code: "invalid_type",
            input,
            inst
          });
          return payload;
        }
        const proms = [];
        const values = def.keyType._zod.values;
        if (values) {
          payload.value = {};
          const recordKeys = /* @__PURE__ */ new Set();
          for (const key of values) {
            if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
              recordKeys.add(typeof key === "number" ? key.toString() : key);
              const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
              if (keyResult instanceof Promise) {
                throw new Error("Async schemas not supported in object keys currently");
              }
              if (keyResult.issues.length) {
                payload.issues.push({
                  code: "invalid_key",
                  origin: "record",
                  issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                  input: key,
                  path: [key],
                  inst
                });
                continue;
              }
              const outKey = keyResult.value;
              const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
              if (result instanceof Promise) {
                proms.push(result.then((result2) => {
                  if (result2.issues.length) {
                    payload.issues.push(...prefixIssues(key, result2.issues));
                  }
                  payload.value[outKey] = result2.value;
                }));
              } else {
                if (result.issues.length) {
                  payload.issues.push(...prefixIssues(key, result.issues));
                }
                payload.value[outKey] = result.value;
              }
            }
          }
          let unrecognized;
          for (const key in input) {
            if (!recordKeys.has(key)) {
              unrecognized = unrecognized ?? [];
              unrecognized.push(key);
            }
          }
          if (unrecognized && unrecognized.length > 0) {
            payload.issues.push({
              code: "unrecognized_keys",
              input,
              inst,
              keys: unrecognized
            });
          }
        } else {
          payload.value = {};
          for (const key of Reflect.ownKeys(input)) {
            if (key === "__proto__")
              continue;
            if (!Object.prototype.propertyIsEnumerable.call(input, key))
              continue;
            let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
            if (keyResult instanceof Promise) {
              throw new Error("Async schemas not supported in object keys currently");
            }
            const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
            if (checkNumericKey) {
              const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
              if (retryResult instanceof Promise) {
                throw new Error("Async schemas not supported in object keys currently");
              }
              if (retryResult.issues.length === 0) {
                keyResult = retryResult;
              }
            }
            if (keyResult.issues.length) {
              if (def.mode === "loose") {
                payload.value[key] = input[key];
              } else {
                payload.issues.push({
                  code: "invalid_key",
                  origin: "record",
                  issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                  input: key,
                  path: [key],
                  inst
                });
              }
              continue;
            }
            const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
            if (result instanceof Promise) {
              proms.push(result.then((result2) => {
                if (result2.issues.length) {
                  payload.issues.push(...prefixIssues(key, result2.issues));
                }
                payload.value[keyResult.value] = result2.value;
              }));
            } else {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[keyResult.value] = result.value;
            }
          }
        }
        if (proms.length) {
          return Promise.all(proms).then(() => payload);
        }
        return payload;
      };
    });
    $ZodMap = /* @__PURE__ */ $constructor("$ZodMap", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!(input instanceof Map)) {
          payload.issues.push({
            expected: "map",
            code: "invalid_type",
            input,
            inst
          });
          return payload;
        }
        const proms = [];
        payload.value = /* @__PURE__ */ new Map();
        for (const [key, value] of input) {
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          const valueResult = def.valueType._zod.run({ value, issues: [] }, ctx);
          if (keyResult instanceof Promise || valueResult instanceof Promise) {
            proms.push(Promise.all([keyResult, valueResult]).then(([keyResult2, valueResult2]) => {
              handleMapResult(keyResult2, valueResult2, payload, key, input, inst, ctx);
            }));
          } else {
            handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
          }
        }
        if (proms.length)
          return Promise.all(proms).then(() => payload);
        return payload;
      };
    });
    $ZodSet = /* @__PURE__ */ $constructor("$ZodSet", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!(input instanceof Set)) {
          payload.issues.push({
            input,
            inst,
            expected: "set",
            code: "invalid_type"
          });
          return payload;
        }
        const proms = [];
        payload.value = /* @__PURE__ */ new Set();
        for (const item of input) {
          const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => handleSetResult(result2, payload)));
          } else
            handleSetResult(result, payload);
        }
        if (proms.length)
          return Promise.all(proms).then(() => payload);
        return payload;
      };
    });
    $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
      $ZodType.init(inst, def);
      const values = getEnumValues(def.entries);
      const valuesSet = new Set(values);
      inst._zod.values = valuesSet;
      inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (valuesSet.has(input)) {
          return payload;
        }
        payload.issues.push({
          code: "invalid_value",
          values,
          input,
          inst
        });
        return payload;
      };
    });
    $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
      $ZodType.init(inst, def);
      if (def.values.length === 0) {
        throw new Error("Cannot create literal schema with no valid values");
      }
      const values = new Set(def.values);
      inst._zod.values = values;
      inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (values.has(input)) {
          return payload;
        }
        payload.issues.push({
          code: "invalid_value",
          values: def.values,
          input,
          inst
        });
        return payload;
      };
    });
    $ZodFile = /* @__PURE__ */ $constructor("$ZodFile", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (input instanceof File)
          return payload;
        payload.issues.push({
          expected: "file",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      };
    });
    $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.optin = "optional";
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          throw new $ZodEncodeError(inst.constructor.name);
        }
        const _out = def.transform(payload.value, payload);
        if (ctx.async) {
          const output = _out instanceof Promise ? _out : Promise.resolve(_out);
          return output.then((output2) => {
            payload.value = output2;
            payload.fallback = true;
            return payload;
          });
        }
        if (_out instanceof Promise) {
          throw new $ZodAsyncError();
        }
        payload.value = _out;
        payload.fallback = true;
        return payload;
      };
    });
    $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.optin = "optional";
      inst._zod.optout = "optional";
      defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
      });
      defineLazy(inst._zod, "pattern", () => {
        const pattern2 = def.innerType._zod.pattern;
        return pattern2 ? new RegExp(`^(${cleanRegex(pattern2.source)})?$`) : void 0;
      });
      inst._zod.parse = (payload, ctx) => {
        if (def.innerType._zod.optin === "optional") {
          const input = payload.value;
          const result = def.innerType._zod.run(payload, ctx);
          if (result instanceof Promise)
            return result.then((r) => handleOptionalResult(r, input));
          return handleOptionalResult(result, input);
        }
        if (payload.value === void 0) {
          return payload;
        }
        return def.innerType._zod.run(payload, ctx);
      };
    });
    $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
      $ZodOptional.init(inst, def);
      defineLazy(inst._zod, "values", () => def.innerType._zod.values);
      defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
      inst._zod.parse = (payload, ctx) => {
        return def.innerType._zod.run(payload, ctx);
      };
    });
    $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
      defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
      defineLazy(inst._zod, "pattern", () => {
        const pattern2 = def.innerType._zod.pattern;
        return pattern2 ? new RegExp(`^(${cleanRegex(pattern2.source)}|null)$`) : void 0;
      });
      defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
      });
      inst._zod.parse = (payload, ctx) => {
        if (payload.value === null)
          return payload;
        return def.innerType._zod.run(payload, ctx);
      };
    });
    $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.optin = "optional";
      defineLazy(inst._zod, "values", () => def.innerType._zod.values);
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          return def.innerType._zod.run(payload, ctx);
        }
        if (payload.value === void 0) {
          payload.value = def.defaultValue;
          return payload;
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
          return result.then((result2) => handleDefaultResult(result2, def));
        }
        return handleDefaultResult(result, def);
      };
    });
    $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.optin = "optional";
      defineLazy(inst._zod, "values", () => def.innerType._zod.values);
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          return def.innerType._zod.run(payload, ctx);
        }
        if (payload.value === void 0) {
          payload.value = def.defaultValue;
        }
        return def.innerType._zod.run(payload, ctx);
      };
    });
    $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "values", () => {
        const v = def.innerType._zod.values;
        return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
      });
      inst._zod.parse = (payload, ctx) => {
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
          return result.then((result2) => handleNonOptionalResult(result2, inst));
        }
        return handleNonOptionalResult(result, inst);
      };
    });
    $ZodSuccess = /* @__PURE__ */ $constructor("$ZodSuccess", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          throw new $ZodEncodeError("ZodSuccess");
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
          return result.then((result2) => {
            payload.value = result2.issues.length === 0;
            return payload;
          });
        }
        payload.value = result.issues.length === 0;
        return payload;
      };
    });
    $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.optin = "optional";
      defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
      defineLazy(inst._zod, "values", () => def.innerType._zod.values);
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          return def.innerType._zod.run(payload, ctx);
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
          return result.then((result2) => {
            payload.value = result2.value;
            if (result2.issues.length) {
              payload.value = def.catchValue({
                ...payload,
                error: {
                  issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
                },
                input: payload.value
              });
              payload.issues = [];
              payload.fallback = true;
            }
            return payload;
          });
        }
        payload.value = result.value;
        if (result.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      };
    });
    $ZodNaN = /* @__PURE__ */ $constructor("$ZodNaN", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
          payload.issues.push({
            input: payload.value,
            inst,
            expected: "nan",
            code: "invalid_type"
          });
          return payload;
        }
        return payload;
      };
    });
    $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "values", () => def.in._zod.values);
      defineLazy(inst._zod, "optin", () => def.in._zod.optin);
      defineLazy(inst._zod, "optout", () => def.out._zod.optout);
      defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          const right = def.out._zod.run(payload, ctx);
          if (right instanceof Promise) {
            return right.then((right2) => handlePipeResult(right2, def.in, ctx));
          }
          return handlePipeResult(right, def.in, ctx);
        }
        const left = def.in._zod.run(payload, ctx);
        if (left instanceof Promise) {
          return left.then((left2) => handlePipeResult(left2, def.out, ctx));
        }
        return handlePipeResult(left, def.out, ctx);
      };
    });
    $ZodCodec = /* @__PURE__ */ $constructor("$ZodCodec", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "values", () => def.in._zod.values);
      defineLazy(inst._zod, "optin", () => def.in._zod.optin);
      defineLazy(inst._zod, "optout", () => def.out._zod.optout);
      defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
      inst._zod.parse = (payload, ctx) => {
        const direction = ctx.direction || "forward";
        if (direction === "forward") {
          const left = def.in._zod.run(payload, ctx);
          if (left instanceof Promise) {
            return left.then((left2) => handleCodecAResult(left2, def, ctx));
          }
          return handleCodecAResult(left, def, ctx);
        } else {
          const right = def.out._zod.run(payload, ctx);
          if (right instanceof Promise) {
            return right.then((right2) => handleCodecAResult(right2, def, ctx));
          }
          return handleCodecAResult(right, def, ctx);
        }
      };
    });
    $ZodPreprocess = /* @__PURE__ */ $constructor("$ZodPreprocess", (inst, def) => {
      $ZodPipe.init(inst, def);
    });
    $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
      defineLazy(inst._zod, "values", () => def.innerType._zod.values);
      defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
      defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
      inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
          return def.innerType._zod.run(payload, ctx);
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
          return result.then(handleReadonlyResult);
        }
        return handleReadonlyResult(result);
      };
    });
    $ZodTemplateLiteral = /* @__PURE__ */ $constructor("$ZodTemplateLiteral", (inst, def) => {
      $ZodType.init(inst, def);
      const regexParts = [];
      for (const part of def.parts) {
        if (typeof part === "object" && part !== null) {
          if (!part._zod.pattern) {
            throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
          }
          const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
          if (!source)
            throw new Error(`Invalid template literal part: ${part._zod.traits}`);
          const start = source.startsWith("^") ? 1 : 0;
          const end = source.endsWith("$") ? source.length - 1 : source.length;
          regexParts.push(source.slice(start, end));
        } else if (part === null || primitiveTypes.has(typeof part)) {
          regexParts.push(escapeRegex(`${part}`));
        } else {
          throw new Error(`Invalid template literal part: ${part}`);
        }
      }
      inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
      inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "string") {
          payload.issues.push({
            input: payload.value,
            inst,
            expected: "string",
            code: "invalid_type"
          });
          return payload;
        }
        inst._zod.pattern.lastIndex = 0;
        if (!inst._zod.pattern.test(payload.value)) {
          payload.issues.push({
            input: payload.value,
            inst,
            code: "invalid_format",
            format: def.format ?? "template_literal",
            pattern: inst._zod.pattern.source
          });
          return payload;
        }
        return payload;
      };
    });
    $ZodFunction = /* @__PURE__ */ $constructor("$ZodFunction", (inst, def) => {
      $ZodType.init(inst, def);
      inst._def = def;
      inst._zod.def = def;
      inst.implement = (func) => {
        if (typeof func !== "function") {
          throw new Error("implement() must be called with a function");
        }
        return function(...args) {
          const parsedArgs = inst._def.input ? parse(inst._def.input, args) : args;
          const result = Reflect.apply(func, this, parsedArgs);
          if (inst._def.output) {
            return parse(inst._def.output, result);
          }
          return result;
        };
      };
      inst.implementAsync = (func) => {
        if (typeof func !== "function") {
          throw new Error("implementAsync() must be called with a function");
        }
        return async function(...args) {
          const parsedArgs = inst._def.input ? await parseAsync(inst._def.input, args) : args;
          const result = await Reflect.apply(func, this, parsedArgs);
          if (inst._def.output) {
            return await parseAsync(inst._def.output, result);
          }
          return result;
        };
      };
      inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "function") {
          payload.issues.push({
            code: "invalid_type",
            expected: "function",
            input: payload.value,
            inst
          });
          return payload;
        }
        const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
        if (hasPromiseOutput) {
          payload.value = inst.implementAsync(payload.value);
        } else {
          payload.value = inst.implement(payload.value);
        }
        return payload;
      };
      inst.input = (...args) => {
        const F = inst.constructor;
        if (Array.isArray(args[0])) {
          return new F({
            type: "function",
            input: new $ZodTuple({
              type: "tuple",
              items: args[0],
              rest: args[1]
            }),
            output: inst._def.output
          });
        }
        return new F({
          type: "function",
          input: args[0],
          output: inst._def.output
        });
      };
      inst.output = (output) => {
        const F = inst.constructor;
        return new F({
          type: "function",
          input: inst._def.input,
          output
        });
      };
      return inst;
    });
    $ZodPromise = /* @__PURE__ */ $constructor("$ZodPromise", (inst, def) => {
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, ctx) => {
        return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
      };
    });
    $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
      $ZodType.init(inst, def);
      defineLazy(inst._zod, "innerType", () => {
        const d = def;
        if (!d._cachedInner)
          d._cachedInner = def.getter();
        return d._cachedInner;
      });
      defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
      defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
      defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? void 0);
      defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? void 0);
      inst._zod.parse = (payload, ctx) => {
        const inner = inst._zod.innerType;
        return inner._zod.run(payload, ctx);
      };
    });
    $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
      $ZodCheck.init(inst, def);
      $ZodType.init(inst, def);
      inst._zod.parse = (payload, _) => {
        return payload;
      };
      inst._zod.check = (payload) => {
        const input = payload.value;
        const r = def.fn(input);
        if (r instanceof Promise) {
          return r.then((r2) => handleRefineResult(r2, payload, input, inst));
        }
        handleRefineResult(r, payload, input, inst);
        return;
      };
    });
  }
});

// node_modules/zod/v4/locales/ar.js
function ar_default() {
  return {
    localeError: error()
  };
}
var error;
var init_ar = __esm({
  "node_modules/zod/v4/locales/ar.js"() {
    init_util2();
    error = () => {
      const Sizable = {
        string: { unit: "حرف", verb: "أن يحوي" },
        file: { unit: "بايت", verb: "أن يحوي" },
        array: { unit: "عنصر", verb: "أن يحوي" },
        set: { unit: "عنصر", verb: "أن يحوي" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "مدخل",
        email: "بريد إلكتروني",
        url: "رابط",
        emoji: "إيموجي",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "تاريخ ووقت بمعيار ISO",
        date: "تاريخ بمعيار ISO",
        time: "وقت بمعيار ISO",
        duration: "مدة بمعيار ISO",
        ipv4: "عنوان IPv4",
        ipv6: "عنوان IPv6",
        cidrv4: "مدى عناوين بصيغة IPv4",
        cidrv6: "مدى عناوين بصيغة IPv6",
        base64: "نَص بترميز base64-encoded",
        base64url: "نَص بترميز base64url-encoded",
        json_string: "نَص على هيئة JSON",
        e164: "رقم هاتف بمعيار E.164",
        jwt: "JWT",
        template_literal: "مدخل"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `مدخلات غير مقبولة: يفترض إدخال instanceof ${issue2.expected}، ولكن تم إدخال ${received}`;
            }
            return `مدخلات غير مقبولة: يفترض إدخال ${expected}، ولكن تم إدخال ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `مدخلات غير مقبولة: يفترض إدخال ${stringifyPrimitive(issue2.values[0])}`;
            return `اختيار غير مقبول: يتوقع انتقاء أحد هذه الخيارات: ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return ` أكبر من اللازم: يفترض أن تكون ${issue2.origin ?? "القيمة"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "عنصر"}`;
            return `أكبر من اللازم: يفترض أن تكون ${issue2.origin ?? "القيمة"} ${adj} ${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `أصغر من اللازم: يفترض لـ ${issue2.origin} أن يكون ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `أصغر من اللازم: يفترض لـ ${issue2.origin} أن يكون ${adj} ${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `نَص غير مقبول: يجب أن يبدأ بـ "${issue2.prefix}"`;
            if (_issue.format === "ends_with")
              return `نَص غير مقبول: يجب أن ينتهي بـ "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `نَص غير مقبول: يجب أن يتضمَّن "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `نَص غير مقبول: يجب أن يطابق النمط ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} غير مقبول`;
          }
          case "not_multiple_of":
            return `رقم غير مقبول: يجب أن يكون من مضاعفات ${issue2.divisor}`;
          case "unrecognized_keys":
            return `معرف${issue2.keys.length > 1 ? "ات" : ""} غريب${issue2.keys.length > 1 ? "ة" : ""}: ${joinValues(issue2.keys, "، ")}`;
          case "invalid_key":
            return `معرف غير مقبول في ${issue2.origin}`;
          case "invalid_union":
            return "مدخل غير مقبول";
          case "invalid_element":
            return `مدخل غير مقبول في ${issue2.origin}`;
          default:
            return "مدخل غير مقبول";
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/az.js
function az_default() {
  return {
    localeError: error2()
  };
}
var error2;
var init_az = __esm({
  "node_modules/zod/v4/locales/az.js"() {
    init_util2();
    error2 = () => {
      const Sizable = {
        string: { unit: "simvol", verb: "olmalıdır" },
        file: { unit: "bayt", verb: "olmalıdır" },
        array: { unit: "element", verb: "olmalıdır" },
        set: { unit: "element", verb: "olmalıdır" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "email address",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datetime",
        date: "ISO date",
        time: "ISO time",
        duration: "ISO duration",
        ipv4: "IPv4 address",
        ipv6: "IPv6 address",
        cidrv4: "IPv4 range",
        cidrv6: "IPv6 range",
        base64: "base64-encoded string",
        base64url: "base64url-encoded string",
        json_string: "JSON string",
        e164: "E.164 number",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Yanlış dəyər: gözlənilən instanceof ${issue2.expected}, daxil olan ${received}`;
            }
            return `Yanlış dəyər: gözlənilən ${expected}, daxil olan ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Yanlış dəyər: gözlənilən ${stringifyPrimitive(issue2.values[0])}`;
            return `Yanlış seçim: aşağıdakılardan biri olmalıdır: ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Çox böyük: gözlənilən ${issue2.origin ?? "dəyər"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
            return `Çox böyük: gözlənilən ${issue2.origin ?? "dəyər"} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Çox kiçik: gözlənilən ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            return `Çox kiçik: gözlənilən ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Yanlış mətn: "${_issue.prefix}" ilə başlamalıdır`;
            if (_issue.format === "ends_with")
              return `Yanlış mətn: "${_issue.suffix}" ilə bitməlidir`;
            if (_issue.format === "includes")
              return `Yanlış mətn: "${_issue.includes}" daxil olmalıdır`;
            if (_issue.format === "regex")
              return `Yanlış mətn: ${_issue.pattern} şablonuna uyğun olmalıdır`;
            return `Yanlış ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Yanlış ədəd: ${issue2.divisor} ilə bölünə bilən olmalıdır`;
          case "unrecognized_keys":
            return `Tanınmayan açar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `${issue2.origin} daxilində yanlış açar`;
          case "invalid_union":
            return "Yanlış dəyər";
          case "invalid_element":
            return `${issue2.origin} daxilində yanlış dəyər`;
          default:
            return `Yanlış dəyər`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/be.js
function getBelarusianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
function be_default() {
  return {
    localeError: error3()
  };
}
var error3;
var init_be = __esm({
  "node_modules/zod/v4/locales/be.js"() {
    init_util2();
    error3 = () => {
      const Sizable = {
        string: {
          unit: {
            one: "сімвал",
            few: "сімвалы",
            many: "сімвалаў"
          },
          verb: "мець"
        },
        array: {
          unit: {
            one: "элемент",
            few: "элементы",
            many: "элементаў"
          },
          verb: "мець"
        },
        set: {
          unit: {
            one: "элемент",
            few: "элементы",
            many: "элементаў"
          },
          verb: "мець"
        },
        file: {
          unit: {
            one: "байт",
            few: "байты",
            many: "байтаў"
          },
          verb: "мець"
        }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "увод",
        email: "email адрас",
        url: "URL",
        emoji: "эмодзі",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO дата і час",
        date: "ISO дата",
        time: "ISO час",
        duration: "ISO працягласць",
        ipv4: "IPv4 адрас",
        ipv6: "IPv6 адрас",
        cidrv4: "IPv4 дыяпазон",
        cidrv6: "IPv6 дыяпазон",
        base64: "радок у фармаце base64",
        base64url: "радок у фармаце base64url",
        json_string: "JSON радок",
        e164: "нумар E.164",
        jwt: "JWT",
        template_literal: "увод"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "лік",
        array: "масіў"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Няправільны ўвод: чакаўся instanceof ${issue2.expected}, атрымана ${received}`;
            }
            return `Няправільны ўвод: чакаўся ${expected}, атрымана ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Няправільны ўвод: чакалася ${stringifyPrimitive(issue2.values[0])}`;
            return `Няправільны варыянт: чакаўся адзін з ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              const maxValue = Number(issue2.maximum);
              const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
              return `Занадта вялікі: чакалася, што ${issue2.origin ?? "значэнне"} павінна ${sizing.verb} ${adj}${issue2.maximum.toString()} ${unit}`;
            }
            return `Занадта вялікі: чакалася, што ${issue2.origin ?? "значэнне"} павінна быць ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              const minValue = Number(issue2.minimum);
              const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
              return `Занадта малы: чакалася, што ${issue2.origin} павінна ${sizing.verb} ${adj}${issue2.minimum.toString()} ${unit}`;
            }
            return `Занадта малы: чакалася, што ${issue2.origin} павінна быць ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Няправільны радок: павінен пачынацца з "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Няправільны радок: павінен заканчвацца на "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Няправільны радок: павінен змяшчаць "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Няправільны радок: павінен адпавядаць шаблону ${_issue.pattern}`;
            return `Няправільны ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Няправільны лік: павінен быць кратным ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Нераспазнаны ${issue2.keys.length > 1 ? "ключы" : "ключ"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Няправільны ключ у ${issue2.origin}`;
          case "invalid_union":
            return "Няправільны ўвод";
          case "invalid_element":
            return `Няправільнае значэнне ў ${issue2.origin}`;
          default:
            return `Няправільны ўвод`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/bg.js
function bg_default() {
  return {
    localeError: error4()
  };
}
var error4;
var init_bg = __esm({
  "node_modules/zod/v4/locales/bg.js"() {
    init_util2();
    error4 = () => {
      const Sizable = {
        string: { unit: "символа", verb: "да съдържа" },
        file: { unit: "байта", verb: "да съдържа" },
        array: { unit: "елемента", verb: "да съдържа" },
        set: { unit: "елемента", verb: "да съдържа" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "вход",
        email: "имейл адрес",
        url: "URL",
        emoji: "емоджи",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO време",
        date: "ISO дата",
        time: "ISO време",
        duration: "ISO продължителност",
        ipv4: "IPv4 адрес",
        ipv6: "IPv6 адрес",
        cidrv4: "IPv4 диапазон",
        cidrv6: "IPv6 диапазон",
        base64: "base64-кодиран низ",
        base64url: "base64url-кодиран низ",
        json_string: "JSON низ",
        e164: "E.164 номер",
        jwt: "JWT",
        template_literal: "вход"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "число",
        array: "масив"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Невалиден вход: очакван instanceof ${issue2.expected}, получен ${received}`;
            }
            return `Невалиден вход: очакван ${expected}, получен ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Невалиден вход: очакван ${stringifyPrimitive(issue2.values[0])}`;
            return `Невалидна опция: очаквано едно от ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Твърде голямо: очаква се ${issue2.origin ?? "стойност"} да съдържа ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елемента"}`;
            return `Твърде голямо: очаква се ${issue2.origin ?? "стойност"} да бъде ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Твърде малко: очаква се ${issue2.origin} да съдържа ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Твърде малко: очаква се ${issue2.origin} да бъде ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Невалиден низ: трябва да започва с "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Невалиден низ: трябва да завършва с "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Невалиден низ: трябва да включва "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Невалиден низ: трябва да съвпада с ${_issue.pattern}`;
            let invalid_adj = "Невалиден";
            if (_issue.format === "emoji")
              invalid_adj = "Невалидно";
            if (_issue.format === "datetime")
              invalid_adj = "Невалидно";
            if (_issue.format === "date")
              invalid_adj = "Невалидна";
            if (_issue.format === "time")
              invalid_adj = "Невалидно";
            if (_issue.format === "duration")
              invalid_adj = "Невалидна";
            return `${invalid_adj} ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Невалидно число: трябва да бъде кратно на ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Неразпознат${issue2.keys.length > 1 ? "и" : ""} ключ${issue2.keys.length > 1 ? "ове" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Невалиден ключ в ${issue2.origin}`;
          case "invalid_union":
            return "Невалиден вход";
          case "invalid_element":
            return `Невалидна стойност в ${issue2.origin}`;
          default:
            return `Невалиден вход`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ca.js
function ca_default() {
  return {
    localeError: error5()
  };
}
var error5;
var init_ca = __esm({
  "node_modules/zod/v4/locales/ca.js"() {
    init_util2();
    error5 = () => {
      const Sizable = {
        string: { unit: "caràcters", verb: "contenir" },
        file: { unit: "bytes", verb: "contenir" },
        array: { unit: "elements", verb: "contenir" },
        set: { unit: "elements", verb: "contenir" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "entrada",
        email: "adreça electrònica",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data i hora ISO",
        date: "data ISO",
        time: "hora ISO",
        duration: "durada ISO",
        ipv4: "adreça IPv4",
        ipv6: "adreça IPv6",
        cidrv4: "rang IPv4",
        cidrv6: "rang IPv6",
        base64: "cadena codificada en base64",
        base64url: "cadena codificada en base64url",
        json_string: "cadena JSON",
        e164: "número E.164",
        jwt: "JWT",
        template_literal: "entrada"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Tipus invàlid: s'esperava instanceof ${issue2.expected}, s'ha rebut ${received}`;
            }
            return `Tipus invàlid: s'esperava ${expected}, s'ha rebut ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Valor invàlid: s'esperava ${stringifyPrimitive(issue2.values[0])}`;
            return `Opció invàlida: s'esperava una de ${joinValues(issue2.values, " o ")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "com a màxim" : "menys de";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} contingués ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
            return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} fos ${adj} ${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? "com a mínim" : "més de";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Massa petit: s'esperava que ${issue2.origin} contingués ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Massa petit: s'esperava que ${issue2.origin} fos ${adj} ${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Format invàlid: ha de començar amb "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Format invàlid: ha d'acabar amb "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Format invàlid: ha d'incloure "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Format invàlid: ha de coincidir amb el patró ${_issue.pattern}`;
            return `Format invàlid per a ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Número invàlid: ha de ser múltiple de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Clau${issue2.keys.length > 1 ? "s" : ""} no reconeguda${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Clau invàlida a ${issue2.origin}`;
          case "invalid_union":
            return "Entrada invàlida";
          // Could also be "Tipus d'unió invàlid" but "Entrada invàlida" is more general
          case "invalid_element":
            return `Element invàlid a ${issue2.origin}`;
          default:
            return `Entrada invàlida`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/cs.js
function cs_default() {
  return {
    localeError: error6()
  };
}
var error6;
var init_cs = __esm({
  "node_modules/zod/v4/locales/cs.js"() {
    init_util2();
    error6 = () => {
      const Sizable = {
        string: { unit: "znaků", verb: "mít" },
        file: { unit: "bajtů", verb: "mít" },
        array: { unit: "prvků", verb: "mít" },
        set: { unit: "prvků", verb: "mít" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "regulární výraz",
        email: "e-mailová adresa",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "datum a čas ve formátu ISO",
        date: "datum ve formátu ISO",
        time: "čas ve formátu ISO",
        duration: "doba trvání ISO",
        ipv4: "IPv4 adresa",
        ipv6: "IPv6 adresa",
        cidrv4: "rozsah IPv4",
        cidrv6: "rozsah IPv6",
        base64: "řetězec zakódovaný ve formátu base64",
        base64url: "řetězec zakódovaný ve formátu base64url",
        json_string: "řetězec ve formátu JSON",
        e164: "číslo E.164",
        jwt: "JWT",
        template_literal: "vstup"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "číslo",
        string: "řetězec",
        function: "funkce",
        array: "pole"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Neplatný vstup: očekáváno instanceof ${issue2.expected}, obdrženo ${received}`;
            }
            return `Neplatný vstup: očekáváno ${expected}, obdrženo ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Neplatný vstup: očekáváno ${stringifyPrimitive(issue2.values[0])}`;
            return `Neplatná možnost: očekávána jedna z hodnot ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Hodnota je příliš velká: ${issue2.origin ?? "hodnota"} musí mít ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "prvků"}`;
            }
            return `Hodnota je příliš velká: ${issue2.origin ?? "hodnota"} musí být ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Hodnota je příliš malá: ${issue2.origin ?? "hodnota"} musí mít ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "prvků"}`;
            }
            return `Hodnota je příliš malá: ${issue2.origin ?? "hodnota"} musí být ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Neplatný řetězec: musí začínat na "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Neplatný řetězec: musí končit na "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Neplatný řetězec: musí obsahovat "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Neplatný řetězec: musí odpovídat vzoru ${_issue.pattern}`;
            return `Neplatný formát ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Neplatné číslo: musí být násobkem ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Neznámé klíče: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Neplatný klíč v ${issue2.origin}`;
          case "invalid_union":
            return "Neplatný vstup";
          case "invalid_element":
            return `Neplatná hodnota v ${issue2.origin}`;
          default:
            return `Neplatný vstup`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/da.js
function da_default() {
  return {
    localeError: error7()
  };
}
var error7;
var init_da = __esm({
  "node_modules/zod/v4/locales/da.js"() {
    init_util2();
    error7 = () => {
      const Sizable = {
        string: { unit: "tegn", verb: "havde" },
        file: { unit: "bytes", verb: "havde" },
        array: { unit: "elementer", verb: "indeholdt" },
        set: { unit: "elementer", verb: "indeholdt" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "e-mailadresse",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO dato- og klokkeslæt",
        date: "ISO-dato",
        time: "ISO-klokkeslæt",
        duration: "ISO-varighed",
        ipv4: "IPv4-område",
        ipv6: "IPv6-område",
        cidrv4: "IPv4-spektrum",
        cidrv6: "IPv6-spektrum",
        base64: "base64-kodet streng",
        base64url: "base64url-kodet streng",
        json_string: "JSON-streng",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN",
        string: "streng",
        number: "tal",
        boolean: "boolean",
        array: "liste",
        object: "objekt",
        set: "sæt",
        file: "fil"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Ugyldigt input: forventede instanceof ${issue2.expected}, fik ${received}`;
            }
            return `Ugyldigt input: forventede ${expected}, fik ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Ugyldig værdi: forventede ${stringifyPrimitive(issue2.values[0])}`;
            return `Ugyldigt valg: forventede en af følgende ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            if (sizing)
              return `For stor: forventede ${origin ?? "value"} ${sizing.verb} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
            return `For stor: forventede ${origin ?? "value"} havde ${adj} ${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            if (sizing) {
              return `For lille: forventede ${origin} ${sizing.verb} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `For lille: forventede ${origin} havde ${adj} ${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Ugyldig streng: skal starte med "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Ugyldig streng: skal ende med "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Ugyldig streng: skal indeholde "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Ugyldig streng: skal matche mønsteret ${_issue.pattern}`;
            return `Ugyldig ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Ugyldigt tal: skal være deleligt med ${issue2.divisor}`;
          case "unrecognized_keys":
            return `${issue2.keys.length > 1 ? "Ukendte nøgler" : "Ukendt nøgle"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Ugyldig nøgle i ${issue2.origin}`;
          case "invalid_union":
            return "Ugyldigt input: matcher ingen af de tilladte typer";
          case "invalid_element":
            return `Ugyldig værdi i ${issue2.origin}`;
          default:
            return `Ugyldigt input`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/de.js
function de_default() {
  return {
    localeError: error8()
  };
}
var error8;
var init_de = __esm({
  "node_modules/zod/v4/locales/de.js"() {
    init_util2();
    error8 = () => {
      const Sizable = {
        string: { unit: "Zeichen", verb: "zu haben" },
        file: { unit: "Bytes", verb: "zu haben" },
        array: { unit: "Elemente", verb: "zu haben" },
        set: { unit: "Elemente", verb: "zu haben" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "Eingabe",
        email: "E-Mail-Adresse",
        url: "URL",
        emoji: "Emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-Datum und -Uhrzeit",
        date: "ISO-Datum",
        time: "ISO-Uhrzeit",
        duration: "ISO-Dauer",
        ipv4: "IPv4-Adresse",
        ipv6: "IPv6-Adresse",
        cidrv4: "IPv4-Bereich",
        cidrv6: "IPv6-Bereich",
        base64: "Base64-codierter String",
        base64url: "Base64-URL-codierter String",
        json_string: "JSON-String",
        e164: "E.164-Nummer",
        jwt: "JWT",
        template_literal: "Eingabe"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "Zahl",
        array: "Array"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Ungültige Eingabe: erwartet instanceof ${issue2.expected}, erhalten ${received}`;
            }
            return `Ungültige Eingabe: erwartet ${expected}, erhalten ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Ungültige Eingabe: erwartet ${stringifyPrimitive(issue2.values[0])}`;
            return `Ungültige Option: erwartet eine von ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Zu groß: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
            return `Zu groß: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ist`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} hat`;
            }
            return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ist`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Ungültiger String: muss mit "${_issue.prefix}" beginnen`;
            if (_issue.format === "ends_with")
              return `Ungültiger String: muss mit "${_issue.suffix}" enden`;
            if (_issue.format === "includes")
              return `Ungültiger String: muss "${_issue.includes}" enthalten`;
            if (_issue.format === "regex")
              return `Ungültiger String: muss dem Muster ${_issue.pattern} entsprechen`;
            return `Ungültig: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Ungültige Zahl: muss ein Vielfaches von ${issue2.divisor} sein`;
          case "unrecognized_keys":
            return `${issue2.keys.length > 1 ? "Unbekannte Schlüssel" : "Unbekannter Schlüssel"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Ungültiger Schlüssel in ${issue2.origin}`;
          case "invalid_union":
            return "Ungültige Eingabe";
          case "invalid_element":
            return `Ungültiger Wert in ${issue2.origin}`;
          default:
            return `Ungültige Eingabe`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/el.js
function el_default() {
  return {
    localeError: error9()
  };
}
var error9;
var init_el = __esm({
  "node_modules/zod/v4/locales/el.js"() {
    init_util2();
    error9 = () => {
      const Sizable = {
        string: { unit: "χαρακτήρες", verb: "να έχει" },
        file: { unit: "bytes", verb: "να έχει" },
        array: { unit: "στοιχεία", verb: "να έχει" },
        set: { unit: "στοιχεία", verb: "να έχει" },
        map: { unit: "καταχωρήσεις", verb: "να έχει" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "είσοδος",
        email: "διεύθυνση email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO ημερομηνία και ώρα",
        date: "ISO ημερομηνία",
        time: "ISO ώρα",
        duration: "ISO διάρκεια",
        ipv4: "διεύθυνση IPv4",
        ipv6: "διεύθυνση IPv6",
        mac: "διεύθυνση MAC",
        cidrv4: "εύρος IPv4",
        cidrv6: "εύρος IPv6",
        base64: "συμβολοσειρά κωδικοποιημένη σε base64",
        base64url: "συμβολοσειρά κωδικοποιημένη σε base64url",
        json_string: "συμβολοσειρά JSON",
        e164: "αριθμός E.164",
        jwt: "JWT",
        template_literal: "είσοδος"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (typeof issue2.expected === "string" && /^[A-Z]/.test(issue2.expected)) {
              return `Μη έγκυρη είσοδος: αναμενόταν instanceof ${issue2.expected}, λήφθηκε ${received}`;
            }
            return `Μη έγκυρη είσοδος: αναμενόταν ${expected}, λήφθηκε ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Μη έγκυρη είσοδος: αναμενόταν ${stringifyPrimitive(issue2.values[0])}`;
            return `Μη έγκυρη επιλογή: αναμενόταν ένα από ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Πολύ μεγάλο: αναμενόταν ${issue2.origin ?? "τιμή"} να έχει ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "στοιχεία"}`;
            return `Πολύ μεγάλο: αναμενόταν ${issue2.origin ?? "τιμή"} να είναι ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Πολύ μικρό: αναμενόταν ${issue2.origin} να έχει ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Πολύ μικρό: αναμενόταν ${issue2.origin} να είναι ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Μη έγκυρη συμβολοσειρά: πρέπει να ξεκινά με "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Μη έγκυρη συμβολοσειρά: πρέπει να τελειώνει με "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Μη έγκυρη συμβολοσειρά: πρέπει να περιέχει "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Μη έγκυρη συμβολοσειρά: πρέπει να ταιριάζει με το μοτίβο ${_issue.pattern}`;
            return `Μη έγκυρο: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Μη έγκυρος αριθμός: πρέπει να είναι πολλαπλάσιο του ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Άγνωστ${issue2.keys.length > 1 ? "α" : "ο"} κλειδ${issue2.keys.length > 1 ? "ιά" : "ί"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Μη έγκυρο κλειδί στο ${issue2.origin}`;
          case "invalid_union":
            return "Μη έγκυρη είσοδος";
          case "invalid_element":
            return `Μη έγκυρη τιμή στο ${issue2.origin}`;
          default:
            return `Μη έγκυρη είσοδος`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/en.js
function en_default() {
  return {
    localeError: error10()
  };
}
var error10;
var init_en = __esm({
  "node_modules/zod/v4/locales/en.js"() {
    init_util2();
    error10 = () => {
      const Sizable = {
        string: { unit: "characters", verb: "to have" },
        file: { unit: "bytes", verb: "to have" },
        array: { unit: "items", verb: "to have" },
        set: { unit: "items", verb: "to have" },
        map: { unit: "entries", verb: "to have" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "email address",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datetime",
        date: "ISO date",
        time: "ISO time",
        duration: "ISO duration",
        ipv4: "IPv4 address",
        ipv6: "IPv6 address",
        mac: "MAC address",
        cidrv4: "IPv4 range",
        cidrv6: "IPv6 range",
        base64: "base64-encoded string",
        base64url: "base64url-encoded string",
        json_string: "JSON string",
        e164: "E.164 number",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        // Compatibility: "nan" -> "NaN" for display
        nan: "NaN"
        // All other type names omitted - they fall back to raw values via ?? operator
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            return `Invalid input: expected ${expected}, received ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
            return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
            return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Invalid string: must start with "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Invalid string: must end with "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Invalid string: must include "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Invalid string: must match pattern ${_issue.pattern}`;
            return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Invalid number: must be a multiple of ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Invalid key in ${issue2.origin}`;
          case "invalid_union":
            if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
              const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
              return `Invalid discriminator value. Expected ${opts}`;
            }
            return "Invalid input";
          case "invalid_element":
            return `Invalid value in ${issue2.origin}`;
          default:
            return `Invalid input`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/eo.js
function eo_default() {
  return {
    localeError: error11()
  };
}
var error11;
var init_eo = __esm({
  "node_modules/zod/v4/locales/eo.js"() {
    init_util2();
    error11 = () => {
      const Sizable = {
        string: { unit: "karaktrojn", verb: "havi" },
        file: { unit: "bajtojn", verb: "havi" },
        array: { unit: "elementojn", verb: "havi" },
        set: { unit: "elementojn", verb: "havi" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "enigo",
        email: "retadreso",
        url: "URL",
        emoji: "emoĝio",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-datotempo",
        date: "ISO-dato",
        time: "ISO-tempo",
        duration: "ISO-daŭro",
        ipv4: "IPv4-adreso",
        ipv6: "IPv6-adreso",
        cidrv4: "IPv4-rango",
        cidrv6: "IPv6-rango",
        base64: "64-ume kodita karaktraro",
        base64url: "URL-64-ume kodita karaktraro",
        json_string: "JSON-karaktraro",
        e164: "E.164-nombro",
        jwt: "JWT",
        template_literal: "enigo"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "nombro",
        array: "tabelo",
        null: "senvalora"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Nevalida enigo: atendiĝis instanceof ${issue2.expected}, riceviĝis ${received}`;
            }
            return `Nevalida enigo: atendiĝis ${expected}, riceviĝis ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Nevalida enigo: atendiĝis ${stringifyPrimitive(issue2.values[0])}`;
            return `Nevalida opcio: atendiĝis unu el ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Tro granda: atendiĝis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
            return `Tro granda: atendiĝis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Tro malgranda: atendiĝis ke ${issue2.origin} havu ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Tro malgranda: atendiĝis ke ${issue2.origin} estu ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Nevalida karaktraro: devas komenciĝi per "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Nevalida karaktraro: devas finiĝi per "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
            return `Nevalida ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Nevalida nombro: devas esti oblo de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Nekonata${issue2.keys.length > 1 ? "j" : ""} ŝlosilo${issue2.keys.length > 1 ? "j" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Nevalida ŝlosilo en ${issue2.origin}`;
          case "invalid_union":
            return "Nevalida enigo";
          case "invalid_element":
            return `Nevalida valoro en ${issue2.origin}`;
          default:
            return `Nevalida enigo`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/es.js
function es_default() {
  return {
    localeError: error12()
  };
}
var error12;
var init_es = __esm({
  "node_modules/zod/v4/locales/es.js"() {
    init_util2();
    error12 = () => {
      const Sizable = {
        string: { unit: "caracteres", verb: "tener" },
        file: { unit: "bytes", verb: "tener" },
        array: { unit: "elementos", verb: "tener" },
        set: { unit: "elementos", verb: "tener" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "entrada",
        email: "dirección de correo electrónico",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "fecha y hora ISO",
        date: "fecha ISO",
        time: "hora ISO",
        duration: "duración ISO",
        ipv4: "dirección IPv4",
        ipv6: "dirección IPv6",
        cidrv4: "rango IPv4",
        cidrv6: "rango IPv6",
        base64: "cadena codificada en base64",
        base64url: "URL codificada en base64",
        json_string: "cadena JSON",
        e164: "número E.164",
        jwt: "JWT",
        template_literal: "entrada"
      };
      const TypeDictionary = {
        nan: "NaN",
        string: "texto",
        number: "número",
        boolean: "booleano",
        array: "arreglo",
        object: "objeto",
        set: "conjunto",
        file: "archivo",
        date: "fecha",
        bigint: "número grande",
        symbol: "símbolo",
        undefined: "indefinido",
        null: "nulo",
        function: "función",
        map: "mapa",
        record: "registro",
        tuple: "tupla",
        enum: "enumeración",
        union: "unión",
        literal: "literal",
        promise: "promesa",
        void: "vacío",
        never: "nunca",
        unknown: "desconocido",
        any: "cualquiera"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Entrada inválida: se esperaba instanceof ${issue2.expected}, recibido ${received}`;
            }
            return `Entrada inválida: se esperaba ${expected}, recibido ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Entrada inválida: se esperaba ${stringifyPrimitive(issue2.values[0])}`;
            return `Opción inválida: se esperaba una de ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            if (sizing)
              return `Demasiado grande: se esperaba que ${origin ?? "valor"} tuviera ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
            return `Demasiado grande: se esperaba que ${origin ?? "valor"} fuera ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            if (sizing) {
              return `Demasiado pequeño: se esperaba que ${origin} tuviera ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Demasiado pequeño: se esperaba que ${origin} fuera ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Cadena inválida: debe comenzar con "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Cadena inválida: debe terminar en "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Cadena inválida: debe incluir "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Cadena inválida: debe coincidir con el patrón ${_issue.pattern}`;
            return `Inválido ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Número inválido: debe ser múltiplo de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Llave${issue2.keys.length > 1 ? "s" : ""} desconocida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Llave inválida en ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
          case "invalid_union":
            return "Entrada inválida";
          case "invalid_element":
            return `Valor inválido en ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
          default:
            return `Entrada inválida`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/fa.js
function fa_default() {
  return {
    localeError: error13()
  };
}
var error13;
var init_fa = __esm({
  "node_modules/zod/v4/locales/fa.js"() {
    init_util2();
    error13 = () => {
      const Sizable = {
        string: { unit: "کاراکتر", verb: "داشته باشد" },
        file: { unit: "بایت", verb: "داشته باشد" },
        array: { unit: "آیتم", verb: "داشته باشد" },
        set: { unit: "آیتم", verb: "داشته باشد" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ورودی",
        email: "آدرس ایمیل",
        url: "URL",
        emoji: "ایموجی",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "تاریخ و زمان ایزو",
        date: "تاریخ ایزو",
        time: "زمان ایزو",
        duration: "مدت زمان ایزو",
        ipv4: "IPv4 آدرس",
        ipv6: "IPv6 آدرس",
        cidrv4: "IPv4 دامنه",
        cidrv6: "IPv6 دامنه",
        base64: "base64-encoded رشته",
        base64url: "base64url-encoded رشته",
        json_string: "JSON رشته",
        e164: "E.164 عدد",
        jwt: "JWT",
        template_literal: "ورودی"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "عدد",
        array: "آرایه"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `ورودی نامعتبر: می‌بایست instanceof ${issue2.expected} می‌بود، ${received} دریافت شد`;
            }
            return `ورودی نامعتبر: می‌بایست ${expected} می‌بود، ${received} دریافت شد`;
          }
          case "invalid_value":
            if (issue2.values.length === 1) {
              return `ورودی نامعتبر: می‌بایست ${stringifyPrimitive(issue2.values[0])} می‌بود`;
            }
            return `گزینه نامعتبر: می‌بایست یکی از ${joinValues(issue2.values, "|")} می‌بود`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `خیلی بزرگ: ${issue2.origin ?? "مقدار"} باید ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عنصر"} باشد`;
            }
            return `خیلی بزرگ: ${issue2.origin ?? "مقدار"} باید ${adj}${issue2.maximum.toString()} باشد`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `خیلی کوچک: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} ${sizing.unit} باشد`;
            }
            return `خیلی کوچک: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} باشد`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `رشته نامعتبر: باید با "${_issue.prefix}" شروع شود`;
            }
            if (_issue.format === "ends_with") {
              return `رشته نامعتبر: باید با "${_issue.suffix}" تمام شود`;
            }
            if (_issue.format === "includes") {
              return `رشته نامعتبر: باید شامل "${_issue.includes}" باشد`;
            }
            if (_issue.format === "regex") {
              return `رشته نامعتبر: باید با الگوی ${_issue.pattern} مطابقت داشته باشد`;
            }
            return `${FormatDictionary[_issue.format] ?? issue2.format} نامعتبر`;
          }
          case "not_multiple_of":
            return `عدد نامعتبر: باید مضرب ${issue2.divisor} باشد`;
          case "unrecognized_keys":
            return `کلید${issue2.keys.length > 1 ? "های" : ""} ناشناس: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `کلید ناشناس در ${issue2.origin}`;
          case "invalid_union":
            return `ورودی نامعتبر`;
          case "invalid_element":
            return `مقدار نامعتبر در ${issue2.origin}`;
          default:
            return `ورودی نامعتبر`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/fi.js
function fi_default() {
  return {
    localeError: error14()
  };
}
var error14;
var init_fi = __esm({
  "node_modules/zod/v4/locales/fi.js"() {
    init_util2();
    error14 = () => {
      const Sizable = {
        string: { unit: "merkkiä", subject: "merkkijonon" },
        file: { unit: "tavua", subject: "tiedoston" },
        array: { unit: "alkiota", subject: "listan" },
        set: { unit: "alkiota", subject: "joukon" },
        number: { unit: "", subject: "luvun" },
        bigint: { unit: "", subject: "suuren kokonaisluvun" },
        int: { unit: "", subject: "kokonaisluvun" },
        date: { unit: "", subject: "päivämäärän" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "säännöllinen lauseke",
        email: "sähköpostiosoite",
        url: "URL-osoite",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-aikaleima",
        date: "ISO-päivämäärä",
        time: "ISO-aika",
        duration: "ISO-kesto",
        ipv4: "IPv4-osoite",
        ipv6: "IPv6-osoite",
        cidrv4: "IPv4-alue",
        cidrv6: "IPv6-alue",
        base64: "base64-koodattu merkkijono",
        base64url: "base64url-koodattu merkkijono",
        json_string: "JSON-merkkijono",
        e164: "E.164-luku",
        jwt: "JWT",
        template_literal: "templaattimerkkijono"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Virheellinen tyyppi: odotettiin instanceof ${issue2.expected}, oli ${received}`;
            }
            return `Virheellinen tyyppi: odotettiin ${expected}, oli ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Virheellinen syöte: täytyy olla ${stringifyPrimitive(issue2.values[0])}`;
            return `Virheellinen valinta: täytyy olla yksi seuraavista: ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Liian suuri: ${sizing.subject} täytyy olla ${adj}${issue2.maximum.toString()} ${sizing.unit}`.trim();
            }
            return `Liian suuri: arvon täytyy olla ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Liian pieni: ${sizing.subject} täytyy olla ${adj}${issue2.minimum.toString()} ${sizing.unit}`.trim();
            }
            return `Liian pieni: arvon täytyy olla ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Virheellinen syöte: täytyy alkaa "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Virheellinen syöte: täytyy loppua "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Virheellinen syöte: täytyy sisältää "${_issue.includes}"`;
            if (_issue.format === "regex") {
              return `Virheellinen syöte: täytyy vastata säännöllistä lauseketta ${_issue.pattern}`;
            }
            return `Virheellinen ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Virheellinen luku: täytyy olla luvun ${issue2.divisor} monikerta`;
          case "unrecognized_keys":
            return `${issue2.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return "Virheellinen avain tietueessa";
          case "invalid_union":
            return "Virheellinen unioni";
          case "invalid_element":
            return "Virheellinen arvo joukossa";
          default:
            return `Virheellinen syöte`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/fr.js
function fr_default() {
  return {
    localeError: error15()
  };
}
var error15;
var init_fr = __esm({
  "node_modules/zod/v4/locales/fr.js"() {
    init_util2();
    error15 = () => {
      const Sizable = {
        string: { unit: "caractères", verb: "avoir" },
        file: { unit: "octets", verb: "avoir" },
        array: { unit: "éléments", verb: "avoir" },
        set: { unit: "éléments", verb: "avoir" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "entrée",
        email: "adresse e-mail",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "date et heure ISO",
        date: "date ISO",
        time: "heure ISO",
        duration: "durée ISO",
        ipv4: "adresse IPv4",
        ipv6: "adresse IPv6",
        cidrv4: "plage IPv4",
        cidrv6: "plage IPv6",
        base64: "chaîne encodée en base64",
        base64url: "chaîne encodée en base64url",
        json_string: "chaîne JSON",
        e164: "numéro E.164",
        jwt: "JWT",
        template_literal: "entrée"
      };
      const TypeDictionary = {
        string: "chaîne",
        number: "nombre",
        int: "entier",
        boolean: "booléen",
        bigint: "grand entier",
        symbol: "symbole",
        undefined: "indéfini",
        null: "null",
        never: "jamais",
        void: "vide",
        date: "date",
        array: "tableau",
        object: "objet",
        tuple: "tuple",
        record: "enregistrement",
        map: "carte",
        set: "ensemble",
        file: "fichier",
        nonoptional: "non-optionnel",
        nan: "NaN",
        function: "fonction"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Entrée invalide : instanceof ${issue2.expected} attendu, ${received} reçu`;
            }
            return `Entrée invalide : ${expected} attendu, ${received} reçu`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Entrée invalide : ${stringifyPrimitive(issue2.values[0])} attendu`;
            return `Option invalide : une valeur parmi ${joinValues(issue2.values, "|")} attendue`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Trop grand : ${TypeDictionary[issue2.origin] ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "élément(s)"}`;
            return `Trop grand : ${TypeDictionary[issue2.origin] ?? "valeur"} doit être ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Trop petit : ${TypeDictionary[issue2.origin] ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            return `Trop petit : ${TypeDictionary[issue2.origin] ?? "valeur"} doit être ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Chaîne invalide : doit inclure "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Chaîne invalide : doit correspondre au modèle ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} invalide`;
          }
          case "not_multiple_of":
            return `Nombre invalide : doit être un multiple de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Clé${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Clé invalide dans ${issue2.origin}`;
          case "invalid_union":
            return "Entrée invalide";
          case "invalid_element":
            return `Valeur invalide dans ${issue2.origin}`;
          default:
            return `Entrée invalide`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/fr-CA.js
function fr_CA_default() {
  return {
    localeError: error16()
  };
}
var error16;
var init_fr_CA = __esm({
  "node_modules/zod/v4/locales/fr-CA.js"() {
    init_util2();
    error16 = () => {
      const Sizable = {
        string: { unit: "caractères", verb: "avoir" },
        file: { unit: "octets", verb: "avoir" },
        array: { unit: "éléments", verb: "avoir" },
        set: { unit: "éléments", verb: "avoir" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "entrée",
        email: "adresse courriel",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "date-heure ISO",
        date: "date ISO",
        time: "heure ISO",
        duration: "durée ISO",
        ipv4: "adresse IPv4",
        ipv6: "adresse IPv6",
        cidrv4: "plage IPv4",
        cidrv6: "plage IPv6",
        base64: "chaîne encodée en base64",
        base64url: "chaîne encodée en base64url",
        json_string: "chaîne JSON",
        e164: "numéro E.164",
        jwt: "JWT",
        template_literal: "entrée"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Entrée invalide : attendu instanceof ${issue2.expected}, reçu ${received}`;
            }
            return `Entrée invalide : attendu ${expected}, reçu ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Entrée invalide : attendu ${stringifyPrimitive(issue2.values[0])}`;
            return `Option invalide : attendu l'une des valeurs suivantes ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "≤" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} ait ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
            return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} soit ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? "≥" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Trop petit : attendu que ${issue2.origin} ait ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Trop petit : attendu que ${issue2.origin} soit ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Chaîne invalide : doit inclure "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Chaîne invalide : doit correspondre au motif ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} invalide`;
          }
          case "not_multiple_of":
            return `Nombre invalide : doit être un multiple de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Clé${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Clé invalide dans ${issue2.origin}`;
          case "invalid_union":
            return "Entrée invalide";
          case "invalid_element":
            return `Valeur invalide dans ${issue2.origin}`;
          default:
            return `Entrée invalide`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/he.js
function he_default() {
  return {
    localeError: error17()
  };
}
var error17;
var init_he = __esm({
  "node_modules/zod/v4/locales/he.js"() {
    init_util2();
    error17 = () => {
      const TypeNames = {
        string: { label: "מחרוזת", gender: "f" },
        number: { label: "מספר", gender: "m" },
        boolean: { label: "ערך בוליאני", gender: "m" },
        bigint: { label: "BigInt", gender: "m" },
        date: { label: "תאריך", gender: "m" },
        array: { label: "מערך", gender: "m" },
        object: { label: "אובייקט", gender: "m" },
        null: { label: "ערך ריק (null)", gender: "m" },
        undefined: { label: "ערך לא מוגדר (undefined)", gender: "m" },
        symbol: { label: "סימבול (Symbol)", gender: "m" },
        function: { label: "פונקציה", gender: "f" },
        map: { label: "מפה (Map)", gender: "f" },
        set: { label: "קבוצה (Set)", gender: "f" },
        file: { label: "קובץ", gender: "m" },
        promise: { label: "Promise", gender: "m" },
        NaN: { label: "NaN", gender: "m" },
        unknown: { label: "ערך לא ידוע", gender: "m" },
        value: { label: "ערך", gender: "m" }
      };
      const Sizable = {
        string: { unit: "תווים", shortLabel: "קצר", longLabel: "ארוך" },
        file: { unit: "בייטים", shortLabel: "קטן", longLabel: "גדול" },
        array: { unit: "פריטים", shortLabel: "קטן", longLabel: "גדול" },
        set: { unit: "פריטים", shortLabel: "קטן", longLabel: "גדול" },
        number: { unit: "", shortLabel: "קטן", longLabel: "גדול" }
        // no unit
      };
      const typeEntry = (t) => t ? TypeNames[t] : void 0;
      const typeLabel = (t) => {
        const e = typeEntry(t);
        if (e)
          return e.label;
        return t ?? TypeNames.unknown.label;
      };
      const withDefinite = (t) => `ה${typeLabel(t)}`;
      const verbFor = (t) => {
        const e = typeEntry(t);
        const gender = e?.gender ?? "m";
        return gender === "f" ? "צריכה להיות" : "צריך להיות";
      };
      const getSizing = (origin) => {
        if (!origin)
          return null;
        return Sizable[origin] ?? null;
      };
      const FormatDictionary = {
        regex: { label: "קלט", gender: "m" },
        email: { label: "כתובת אימייל", gender: "f" },
        url: { label: "כתובת רשת", gender: "f" },
        emoji: { label: "אימוג'י", gender: "m" },
        uuid: { label: "UUID", gender: "m" },
        nanoid: { label: "nanoid", gender: "m" },
        guid: { label: "GUID", gender: "m" },
        cuid: { label: "cuid", gender: "m" },
        cuid2: { label: "cuid2", gender: "m" },
        ulid: { label: "ULID", gender: "m" },
        xid: { label: "XID", gender: "m" },
        ksuid: { label: "KSUID", gender: "m" },
        datetime: { label: "תאריך וזמן ISO", gender: "m" },
        date: { label: "תאריך ISO", gender: "m" },
        time: { label: "זמן ISO", gender: "m" },
        duration: { label: "משך זמן ISO", gender: "m" },
        ipv4: { label: "כתובת IPv4", gender: "f" },
        ipv6: { label: "כתובת IPv6", gender: "f" },
        cidrv4: { label: "טווח IPv4", gender: "m" },
        cidrv6: { label: "טווח IPv6", gender: "m" },
        base64: { label: "מחרוזת בבסיס 64", gender: "f" },
        base64url: { label: "מחרוזת בבסיס 64 לכתובות רשת", gender: "f" },
        json_string: { label: "מחרוזת JSON", gender: "f" },
        e164: { label: "מספר E.164", gender: "m" },
        jwt: { label: "JWT", gender: "m" },
        ends_with: { label: "קלט", gender: "m" },
        includes: { label: "קלט", gender: "m" },
        lowercase: { label: "קלט", gender: "m" },
        starts_with: { label: "קלט", gender: "m" },
        uppercase: { label: "קלט", gender: "m" }
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expectedKey = issue2.expected;
            const expected = TypeDictionary[expectedKey ?? ""] ?? typeLabel(expectedKey);
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? TypeNames[receivedType]?.label ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `קלט לא תקין: צריך להיות instanceof ${issue2.expected}, התקבל ${received}`;
            }
            return `קלט לא תקין: צריך להיות ${expected}, התקבל ${received}`;
          }
          case "invalid_value": {
            if (issue2.values.length === 1) {
              return `ערך לא תקין: הערך חייב להיות ${stringifyPrimitive(issue2.values[0])}`;
            }
            const stringified = issue2.values.map((v) => stringifyPrimitive(v));
            if (issue2.values.length === 2) {
              return `ערך לא תקין: האפשרויות המתאימות הן ${stringified[0]} או ${stringified[1]}`;
            }
            const lastValue = stringified[stringified.length - 1];
            const restValues = stringified.slice(0, -1).join(", ");
            return `ערך לא תקין: האפשרויות המתאימות הן ${restValues} או ${lastValue}`;
          }
          case "too_big": {
            const sizing = getSizing(issue2.origin);
            const subject = withDefinite(issue2.origin ?? "value");
            if (issue2.origin === "string") {
              return `${sizing?.longLabel ?? "ארוך"} מדי: ${subject} צריכה להכיל ${issue2.maximum.toString()} ${sizing?.unit ?? ""} ${issue2.inclusive ? "או פחות" : "לכל היותר"}`.trim();
            }
            if (issue2.origin === "number") {
              const comparison = issue2.inclusive ? `קטן או שווה ל-${issue2.maximum}` : `קטן מ-${issue2.maximum}`;
              return `גדול מדי: ${subject} צריך להיות ${comparison}`;
            }
            if (issue2.origin === "array" || issue2.origin === "set") {
              const verb = issue2.origin === "set" ? "צריכה" : "צריך";
              const comparison = issue2.inclusive ? `${issue2.maximum} ${sizing?.unit ?? ""} או פחות` : `פחות מ-${issue2.maximum} ${sizing?.unit ?? ""}`;
              return `גדול מדי: ${subject} ${verb} להכיל ${comparison}`.trim();
            }
            const adj = issue2.inclusive ? "<=" : "<";
            const be = verbFor(issue2.origin ?? "value");
            if (sizing?.unit) {
              return `${sizing.longLabel} מדי: ${subject} ${be} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
            }
            return `${sizing?.longLabel ?? "גדול"} מדי: ${subject} ${be} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const sizing = getSizing(issue2.origin);
            const subject = withDefinite(issue2.origin ?? "value");
            if (issue2.origin === "string") {
              return `${sizing?.shortLabel ?? "קצר"} מדי: ${subject} צריכה להכיל ${issue2.minimum.toString()} ${sizing?.unit ?? ""} ${issue2.inclusive ? "או יותר" : "לפחות"}`.trim();
            }
            if (issue2.origin === "number") {
              const comparison = issue2.inclusive ? `גדול או שווה ל-${issue2.minimum}` : `גדול מ-${issue2.minimum}`;
              return `קטן מדי: ${subject} צריך להיות ${comparison}`;
            }
            if (issue2.origin === "array" || issue2.origin === "set") {
              const verb = issue2.origin === "set" ? "צריכה" : "צריך";
              if (issue2.minimum === 1 && issue2.inclusive) {
                const singularPhrase = issue2.origin === "set" ? "לפחות פריט אחד" : "לפחות פריט אחד";
                return `קטן מדי: ${subject} ${verb} להכיל ${singularPhrase}`;
              }
              const comparison = issue2.inclusive ? `${issue2.minimum} ${sizing?.unit ?? ""} או יותר` : `יותר מ-${issue2.minimum} ${sizing?.unit ?? ""}`;
              return `קטן מדי: ${subject} ${verb} להכיל ${comparison}`.trim();
            }
            const adj = issue2.inclusive ? ">=" : ">";
            const be = verbFor(issue2.origin ?? "value");
            if (sizing?.unit) {
              return `${sizing.shortLabel} מדי: ${subject} ${be} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `${sizing?.shortLabel ?? "קטן"} מדי: ${subject} ${be} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `המחרוזת חייבת להתחיל ב "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `המחרוזת חייבת להסתיים ב "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `המחרוזת חייבת לכלול "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `המחרוזת חייבת להתאים לתבנית ${_issue.pattern}`;
            const nounEntry = FormatDictionary[_issue.format];
            const noun = nounEntry?.label ?? _issue.format;
            const gender = nounEntry?.gender ?? "m";
            const adjective = gender === "f" ? "תקינה" : "תקין";
            return `${noun} לא ${adjective}`;
          }
          case "not_multiple_of":
            return `מספר לא תקין: חייב להיות מכפלה של ${issue2.divisor}`;
          case "unrecognized_keys":
            return `מפתח${issue2.keys.length > 1 ? "ות" : ""} לא מזוה${issue2.keys.length > 1 ? "ים" : "ה"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key": {
            return `שדה לא תקין באובייקט`;
          }
          case "invalid_union":
            return "קלט לא תקין";
          case "invalid_element": {
            const place = withDefinite(issue2.origin ?? "array");
            return `ערך לא תקין ב${place}`;
          }
          default:
            return `קלט לא תקין`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/hr.js
function hr_default() {
  return {
    localeError: error18()
  };
}
var error18;
var init_hr = __esm({
  "node_modules/zod/v4/locales/hr.js"() {
    init_util2();
    error18 = () => {
      const Sizable = {
        string: { unit: "znakova", verb: "imati" },
        file: { unit: "bajtova", verb: "imati" },
        array: { unit: "stavki", verb: "imati" },
        set: { unit: "stavki", verb: "imati" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "unos",
        email: "email adresa",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datum i vrijeme",
        date: "ISO datum",
        time: "ISO vrijeme",
        duration: "ISO trajanje",
        ipv4: "IPv4 adresa",
        ipv6: "IPv6 adresa",
        cidrv4: "IPv4 raspon",
        cidrv6: "IPv6 raspon",
        base64: "base64 kodirani tekst",
        base64url: "base64url kodirani tekst",
        json_string: "JSON tekst",
        e164: "E.164 broj",
        jwt: "JWT",
        template_literal: "unos"
      };
      const TypeDictionary = {
        nan: "NaN",
        string: "tekst",
        number: "broj",
        boolean: "boolean",
        array: "niz",
        object: "objekt",
        set: "skup",
        file: "datoteka",
        date: "datum",
        bigint: "bigint",
        symbol: "simbol",
        undefined: "undefined",
        null: "null",
        function: "funkcija",
        map: "mapa"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Neispravan unos: očekuje se instanceof ${issue2.expected}, a primljeno je ${received}`;
            }
            return `Neispravan unos: očekuje se ${expected}, a primljeno je ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Neispravna vrijednost: očekivano ${stringifyPrimitive(issue2.values[0])}`;
            return `Neispravna opcija: očekivano jedno od ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            if (sizing)
              return `Preveliko: očekivano da ${origin ?? "vrijednost"} ima ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemenata"}`;
            return `Preveliko: očekivano da ${origin ?? "vrijednost"} bude ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            if (sizing) {
              return `Premalo: očekivano da ${origin} ima ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Premalo: očekivano da ${origin} bude ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Neispravan tekst: mora započinjati s "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Neispravan tekst: mora završavati s "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Neispravan tekst: mora sadržavati "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Neispravan tekst: mora odgovarati uzorku ${_issue.pattern}`;
            return `Neispravna ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Neispravan broj: mora biti višekratnik od ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Neprepoznat${issue2.keys.length > 1 ? "i ključevi" : " ključ"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Neispravan ključ u ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
          case "invalid_union":
            return "Neispravan unos";
          case "invalid_element":
            return `Neispravna vrijednost u ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
          default:
            return `Neispravan unos`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/hu.js
function hu_default() {
  return {
    localeError: error19()
  };
}
var error19;
var init_hu = __esm({
  "node_modules/zod/v4/locales/hu.js"() {
    init_util2();
    error19 = () => {
      const Sizable = {
        string: { unit: "karakter", verb: "legyen" },
        file: { unit: "byte", verb: "legyen" },
        array: { unit: "elem", verb: "legyen" },
        set: { unit: "elem", verb: "legyen" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "bemenet",
        email: "email cím",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO időbélyeg",
        date: "ISO dátum",
        time: "ISO idő",
        duration: "ISO időintervallum",
        ipv4: "IPv4 cím",
        ipv6: "IPv6 cím",
        cidrv4: "IPv4 tartomány",
        cidrv6: "IPv6 tartomány",
        base64: "base64-kódolt string",
        base64url: "base64url-kódolt string",
        json_string: "JSON string",
        e164: "E.164 szám",
        jwt: "JWT",
        template_literal: "bemenet"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "szám",
        array: "tömb"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Érvénytelen bemenet: a várt érték instanceof ${issue2.expected}, a kapott érték ${received}`;
            }
            return `Érvénytelen bemenet: a várt érték ${expected}, a kapott érték ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Érvénytelen bemenet: a várt érték ${stringifyPrimitive(issue2.values[0])}`;
            return `Érvénytelen opció: valamelyik érték várt ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Túl nagy: ${issue2.origin ?? "érték"} mérete túl nagy ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elem"}`;
            return `Túl nagy: a bemeneti érték ${issue2.origin ?? "érték"} túl nagy: ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Túl kicsi: a bemeneti érték ${issue2.origin} mérete túl kicsi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Túl kicsi: a bemeneti érték ${issue2.origin} túl kicsi ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Érvénytelen string: "${_issue.prefix}" értékkel kell kezdődnie`;
            if (_issue.format === "ends_with")
              return `Érvénytelen string: "${_issue.suffix}" értékkel kell végződnie`;
            if (_issue.format === "includes")
              return `Érvénytelen string: "${_issue.includes}" értéket kell tartalmaznia`;
            if (_issue.format === "regex")
              return `Érvénytelen string: ${_issue.pattern} mintának kell megfelelnie`;
            return `Érvénytelen ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Érvénytelen szám: ${issue2.divisor} többszörösének kell lennie`;
          case "unrecognized_keys":
            return `Ismeretlen kulcs${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Érvénytelen kulcs ${issue2.origin}`;
          case "invalid_union":
            return "Érvénytelen bemenet";
          case "invalid_element":
            return `Érvénytelen érték: ${issue2.origin}`;
          default:
            return `Érvénytelen bemenet`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/hy.js
function getArmenianPlural(count, one, many) {
  return Math.abs(count) === 1 ? one : many;
}
function withDefiniteArticle(word) {
  if (!word)
    return "";
  const vowels = ["ա", "ե", "ը", "ի", "ո", "ու", "օ"];
  const lastChar = word[word.length - 1];
  return word + (vowels.includes(lastChar) ? "ն" : "ը");
}
function hy_default() {
  return {
    localeError: error20()
  };
}
var error20;
var init_hy = __esm({
  "node_modules/zod/v4/locales/hy.js"() {
    init_util2();
    error20 = () => {
      const Sizable = {
        string: {
          unit: {
            one: "նշան",
            many: "նշաններ"
          },
          verb: "ունենալ"
        },
        file: {
          unit: {
            one: "բայթ",
            many: "բայթեր"
          },
          verb: "ունենալ"
        },
        array: {
          unit: {
            one: "տարր",
            many: "տարրեր"
          },
          verb: "ունենալ"
        },
        set: {
          unit: {
            one: "տարր",
            many: "տարրեր"
          },
          verb: "ունենալ"
        }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "մուտք",
        email: "էլ. հասցե",
        url: "URL",
        emoji: "էմոջի",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO ամսաթիվ և ժամ",
        date: "ISO ամսաթիվ",
        time: "ISO ժամ",
        duration: "ISO տևողություն",
        ipv4: "IPv4 հասցե",
        ipv6: "IPv6 հասցե",
        cidrv4: "IPv4 միջակայք",
        cidrv6: "IPv6 միջակայք",
        base64: "base64 ձևաչափով տող",
        base64url: "base64url ձևաչափով տող",
        json_string: "JSON տող",
        e164: "E.164 համար",
        jwt: "JWT",
        template_literal: "մուտք"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "թիվ",
        array: "զանգված"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Սխալ մուտքագրում․ սպասվում էր instanceof ${issue2.expected}, ստացվել է ${received}`;
            }
            return `Սխալ մուտքագրում․ սպասվում էր ${expected}, ստացվել է ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Սխալ մուտքագրում․ սպասվում էր ${stringifyPrimitive(issue2.values[1])}`;
            return `Սխալ տարբերակ․ սպասվում էր հետևյալներից մեկը՝ ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              const maxValue = Number(issue2.maximum);
              const unit = getArmenianPlural(maxValue, sizing.unit.one, sizing.unit.many);
              return `Չափազանց մեծ արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin ?? "արժեք")} կունենա ${adj}${issue2.maximum.toString()} ${unit}`;
            }
            return `Չափազանց մեծ արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin ?? "արժեք")} լինի ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              const minValue = Number(issue2.minimum);
              const unit = getArmenianPlural(minValue, sizing.unit.one, sizing.unit.many);
              return `Չափազանց փոքր արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin)} կունենա ${adj}${issue2.minimum.toString()} ${unit}`;
            }
            return `Չափազանց փոքր արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin)} լինի ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Սխալ տող․ պետք է սկսվի "${_issue.prefix}"-ով`;
            if (_issue.format === "ends_with")
              return `Սխալ տող․ պետք է ավարտվի "${_issue.suffix}"-ով`;
            if (_issue.format === "includes")
              return `Սխալ տող․ պետք է պարունակի "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Սխալ տող․ պետք է համապատասխանի ${_issue.pattern} ձևաչափին`;
            return `Սխալ ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Սխալ թիվ․ պետք է բազմապատիկ լինի ${issue2.divisor}-ի`;
          case "unrecognized_keys":
            return `Չճանաչված բանալի${issue2.keys.length > 1 ? "ներ" : ""}. ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Սխալ բանալի ${withDefiniteArticle(issue2.origin)}-ում`;
          case "invalid_union":
            return "Սխալ մուտքագրում";
          case "invalid_element":
            return `Սխալ արժեք ${withDefiniteArticle(issue2.origin)}-ում`;
          default:
            return `Սխալ մուտքագրում`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/id.js
function id_default() {
  return {
    localeError: error21()
  };
}
var error21;
var init_id = __esm({
  "node_modules/zod/v4/locales/id.js"() {
    init_util2();
    error21 = () => {
      const Sizable = {
        string: { unit: "karakter", verb: "memiliki" },
        file: { unit: "byte", verb: "memiliki" },
        array: { unit: "item", verb: "memiliki" },
        set: { unit: "item", verb: "memiliki" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "alamat email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "tanggal dan waktu format ISO",
        date: "tanggal format ISO",
        time: "jam format ISO",
        duration: "durasi format ISO",
        ipv4: "alamat IPv4",
        ipv6: "alamat IPv6",
        cidrv4: "rentang alamat IPv4",
        cidrv6: "rentang alamat IPv6",
        base64: "string dengan enkode base64",
        base64url: "string dengan enkode base64url",
        json_string: "string JSON",
        e164: "angka E.164",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Input tidak valid: diharapkan instanceof ${issue2.expected}, diterima ${received}`;
            }
            return `Input tidak valid: diharapkan ${expected}, diterima ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Input tidak valid: diharapkan ${stringifyPrimitive(issue2.values[0])}`;
            return `Pilihan tidak valid: diharapkan salah satu dari ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} memiliki ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
            return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} menjadi ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Terlalu kecil: diharapkan ${issue2.origin} memiliki ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Terlalu kecil: diharapkan ${issue2.origin} menjadi ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `String tidak valid: harus menyertakan "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} tidak valid`;
          }
          case "not_multiple_of":
            return `Angka tidak valid: harus kelipatan dari ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Kunci tidak dikenali ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Kunci tidak valid di ${issue2.origin}`;
          case "invalid_union":
            return "Input tidak valid";
          case "invalid_element":
            return `Nilai tidak valid di ${issue2.origin}`;
          default:
            return `Input tidak valid`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/is.js
function is_default() {
  return {
    localeError: error22()
  };
}
var error22;
var init_is = __esm({
  "node_modules/zod/v4/locales/is.js"() {
    init_util2();
    error22 = () => {
      const Sizable = {
        string: { unit: "stafi", verb: "að hafa" },
        file: { unit: "bæti", verb: "að hafa" },
        array: { unit: "hluti", verb: "að hafa" },
        set: { unit: "hluti", verb: "að hafa" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "gildi",
        email: "netfang",
        url: "vefslóð",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO dagsetning og tími",
        date: "ISO dagsetning",
        time: "ISO tími",
        duration: "ISO tímalengd",
        ipv4: "IPv4 address",
        ipv6: "IPv6 address",
        cidrv4: "IPv4 range",
        cidrv6: "IPv6 range",
        base64: "base64-encoded strengur",
        base64url: "base64url-encoded strengur",
        json_string: "JSON strengur",
        e164: "E.164 tölugildi",
        jwt: "JWT",
        template_literal: "gildi"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "númer",
        array: "fylki"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Rangt gildi: Þú slóst inn ${received} þar sem á að vera instanceof ${issue2.expected}`;
            }
            return `Rangt gildi: Þú slóst inn ${received} þar sem á að vera ${expected}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Rangt gildi: gert ráð fyrir ${stringifyPrimitive(issue2.values[0])}`;
            return `Ógilt val: má vera eitt af eftirfarandi ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Of stórt: gert er ráð fyrir að ${issue2.origin ?? "gildi"} hafi ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "hluti"}`;
            return `Of stórt: gert er ráð fyrir að ${issue2.origin ?? "gildi"} sé ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Of lítið: gert er ráð fyrir að ${issue2.origin} hafi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Of lítið: gert er ráð fyrir að ${issue2.origin} sé ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Ógildur strengur: verður að byrja á "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Ógildur strengur: verður að enda á "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Ógildur strengur: verður að innihalda "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Ógildur strengur: verður að fylgja mynstri ${_issue.pattern}`;
            return `Rangt ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Röng tala: verður að vera margfeldi af ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Óþekkt ${issue2.keys.length > 1 ? "ir lyklar" : "ur lykill"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Rangur lykill í ${issue2.origin}`;
          case "invalid_union":
            return "Rangt gildi";
          case "invalid_element":
            return `Rangt gildi í ${issue2.origin}`;
          default:
            return `Rangt gildi`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/it.js
function it_default() {
  return {
    localeError: error23()
  };
}
var error23;
var init_it = __esm({
  "node_modules/zod/v4/locales/it.js"() {
    init_util2();
    error23 = () => {
      const Sizable = {
        string: { unit: "caratteri", verb: "avere" },
        file: { unit: "byte", verb: "avere" },
        array: { unit: "elementi", verb: "avere" },
        set: { unit: "elementi", verb: "avere" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "indirizzo email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data e ora ISO",
        date: "data ISO",
        time: "ora ISO",
        duration: "durata ISO",
        ipv4: "indirizzo IPv4",
        ipv6: "indirizzo IPv6",
        cidrv4: "intervallo IPv4",
        cidrv6: "intervallo IPv6",
        base64: "stringa codificata in base64",
        base64url: "URL codificata in base64",
        json_string: "stringa JSON",
        e164: "numero E.164",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "numero",
        array: "vettore"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Input non valido: atteso instanceof ${issue2.expected}, ricevuto ${received}`;
            }
            return `Input non valido: atteso ${expected}, ricevuto ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Input non valido: atteso ${stringifyPrimitive(issue2.values[0])}`;
            return `Opzione non valida: atteso uno tra ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Troppo grande: ${issue2.origin ?? "valore"} deve avere ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementi"}`;
            return `Troppo grande: ${issue2.origin ?? "valore"} deve essere ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Troppo piccolo: ${issue2.origin} deve avere ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Troppo piccolo: ${issue2.origin} deve essere ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Stringa non valida: deve includere "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
            return `Input non valido: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Numero non valido: deve essere un multiplo di ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Chiav${issue2.keys.length > 1 ? "i" : "e"} non riconosciut${issue2.keys.length > 1 ? "e" : "a"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Chiave non valida in ${issue2.origin}`;
          case "invalid_union":
            return "Input non valido";
          case "invalid_element":
            return `Valore non valido in ${issue2.origin}`;
          default:
            return `Input non valido`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ja.js
function ja_default() {
  return {
    localeError: error24()
  };
}
var error24;
var init_ja = __esm({
  "node_modules/zod/v4/locales/ja.js"() {
    init_util2();
    error24 = () => {
      const Sizable = {
        string: { unit: "文字", verb: "である" },
        file: { unit: "バイト", verb: "である" },
        array: { unit: "要素", verb: "である" },
        set: { unit: "要素", verb: "である" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "入力値",
        email: "メールアドレス",
        url: "URL",
        emoji: "絵文字",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO日時",
        date: "ISO日付",
        time: "ISO時刻",
        duration: "ISO期間",
        ipv4: "IPv4アドレス",
        ipv6: "IPv6アドレス",
        cidrv4: "IPv4範囲",
        cidrv6: "IPv6範囲",
        base64: "base64エンコード文字列",
        base64url: "base64urlエンコード文字列",
        json_string: "JSON文字列",
        e164: "E.164番号",
        jwt: "JWT",
        template_literal: "入力値"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "数値",
        array: "配列"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `無効な入力: instanceof ${issue2.expected}が期待されましたが、${received}が入力されました`;
            }
            return `無効な入力: ${expected}が期待されましたが、${received}が入力されました`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `無効な入力: ${stringifyPrimitive(issue2.values[0])}が期待されました`;
            return `無効な選択: ${joinValues(issue2.values, "、")}のいずれかである必要があります`;
          case "too_big": {
            const adj = issue2.inclusive ? "以下である" : "より小さい";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `大きすぎる値: ${issue2.origin ?? "値"}は${issue2.maximum.toString()}${sizing.unit ?? "要素"}${adj}必要があります`;
            return `大きすぎる値: ${issue2.origin ?? "値"}は${issue2.maximum.toString()}${adj}必要があります`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? "以上である" : "より大きい";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `小さすぎる値: ${issue2.origin}は${issue2.minimum.toString()}${sizing.unit}${adj}必要があります`;
            return `小さすぎる値: ${issue2.origin}は${issue2.minimum.toString()}${adj}必要があります`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `無効な文字列: "${_issue.prefix}"で始まる必要があります`;
            if (_issue.format === "ends_with")
              return `無効な文字列: "${_issue.suffix}"で終わる必要があります`;
            if (_issue.format === "includes")
              return `無効な文字列: "${_issue.includes}"を含む必要があります`;
            if (_issue.format === "regex")
              return `無効な文字列: パターン${_issue.pattern}に一致する必要があります`;
            return `無効な${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `無効な数値: ${issue2.divisor}の倍数である必要があります`;
          case "unrecognized_keys":
            return `認識されていないキー${issue2.keys.length > 1 ? "群" : ""}: ${joinValues(issue2.keys, "、")}`;
          case "invalid_key":
            return `${issue2.origin}内の無効なキー`;
          case "invalid_union":
            return "無効な入力";
          case "invalid_element":
            return `${issue2.origin}内の無効な値`;
          default:
            return `無効な入力`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ka.js
function ka_default() {
  return {
    localeError: error25()
  };
}
var error25;
var init_ka = __esm({
  "node_modules/zod/v4/locales/ka.js"() {
    init_util2();
    error25 = () => {
      const Sizable = {
        string: { unit: "სიმბოლო", verb: "უნდა შეიცავდეს" },
        file: { unit: "ბაიტი", verb: "უნდა შეიცავდეს" },
        array: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" },
        set: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "შეყვანა",
        email: "ელ-ფოსტის მისამართი",
        url: "URL",
        emoji: "ემოჯი",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "თარიღი-დრო",
        date: "თარიღი",
        time: "დრო",
        duration: "ხანგრძლივობა",
        ipv4: "IPv4 მისამართი",
        ipv6: "IPv6 მისამართი",
        cidrv4: "IPv4 დიაპაზონი",
        cidrv6: "IPv6 დიაპაზონი",
        base64: "base64-კოდირებული ველი",
        base64url: "base64url-კოდირებული ველი",
        json_string: "JSON ველი",
        e164: "E.164 ნომერი",
        jwt: "JWT",
        template_literal: "შეყვანა"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "რიცხვი",
        string: "ველი",
        boolean: "ბულეანი",
        function: "ფუნქცია",
        array: "მასივი"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `არასწორი შეყვანა: მოსალოდნელი instanceof ${issue2.expected}, მიღებული ${received}`;
            }
            return `არასწორი შეყვანა: მოსალოდნელი ${expected}, მიღებული ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `არასწორი შეყვანა: მოსალოდნელი ${stringifyPrimitive(issue2.values[0])}`;
            return `არასწორი ვარიანტი: მოსალოდნელია ერთ-ერთი ${joinValues(issue2.values, "|")}-დან`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `ზედმეტად დიდი: მოსალოდნელი ${issue2.origin ?? "მნიშვნელობა"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
            return `ზედმეტად დიდი: მოსალოდნელი ${issue2.origin ?? "მნიშვნელობა"} იყოს ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `ზედმეტად პატარა: მოსალოდნელი ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `ზედმეტად პატარა: მოსალოდნელი ${issue2.origin} იყოს ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `არასწორი ველი: უნდა იწყებოდეს "${_issue.prefix}"-ით`;
            }
            if (_issue.format === "ends_with")
              return `არასწორი ველი: უნდა მთავრდებოდეს "${_issue.suffix}"-ით`;
            if (_issue.format === "includes")
              return `არასწორი ველი: უნდა შეიცავდეს "${_issue.includes}"-ს`;
            if (_issue.format === "regex")
              return `არასწორი ველი: უნდა შეესაბამებოდეს შაბლონს ${_issue.pattern}`;
            return `არასწორი ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `არასწორი რიცხვი: უნდა იყოს ${issue2.divisor}-ის ჯერადი`;
          case "unrecognized_keys":
            return `უცნობი გასაღებ${issue2.keys.length > 1 ? "ები" : "ი"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `არასწორი გასაღები ${issue2.origin}-ში`;
          case "invalid_union":
            return "არასწორი შეყვანა";
          case "invalid_element":
            return `არასწორი მნიშვნელობა ${issue2.origin}-ში`;
          default:
            return `არასწორი შეყვანა`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/km.js
function km_default() {
  return {
    localeError: error26()
  };
}
var error26;
var init_km = __esm({
  "node_modules/zod/v4/locales/km.js"() {
    init_util2();
    error26 = () => {
      const Sizable = {
        string: { unit: "តួអក្សរ", verb: "គួរមាន" },
        file: { unit: "បៃ", verb: "គួរមាន" },
        array: { unit: "ធាតុ", verb: "គួរមាន" },
        set: { unit: "ធាតុ", verb: "គួរមាន" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ទិន្នន័យបញ្ចូល",
        email: "អាសយដ្ឋានអ៊ីមែល",
        url: "URL",
        emoji: "សញ្ញាអារម្មណ៍",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "កាលបរិច្ឆេទ និងម៉ោង ISO",
        date: "កាលបរិច្ឆេទ ISO",
        time: "ម៉ោង ISO",
        duration: "រយៈពេល ISO",
        ipv4: "អាសយដ្ឋាន IPv4",
        ipv6: "អាសយដ្ឋាន IPv6",
        cidrv4: "ដែនអាសយដ្ឋាន IPv4",
        cidrv6: "ដែនអាសយដ្ឋាន IPv6",
        base64: "ខ្សែអក្សរអ៊ិកូដ base64",
        base64url: "ខ្សែអក្សរអ៊ិកូដ base64url",
        json_string: "ខ្សែអក្សរ JSON",
        e164: "លេខ E.164",
        jwt: "JWT",
        template_literal: "ទិន្នន័យបញ្ចូល"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "លេខ",
        array: "អារេ (Array)",
        null: "គ្មានតម្លៃ (null)"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ instanceof ${issue2.expected} ប៉ុន្តែទទួលបាន ${received}`;
            }
            return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${expected} ប៉ុន្តែទទួលបាន ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${stringifyPrimitive(issue2.values[0])}`;
            return `ជម្រើសមិនត្រឹមត្រូវ៖ ត្រូវជាមួយក្នុងចំណោម ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `ធំពេក៖ ត្រូវការ ${issue2.origin ?? "តម្លៃ"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "ធាតុ"}`;
            return `ធំពេក៖ ត្រូវការ ${issue2.origin ?? "តម្លៃ"} ${adj} ${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `តូចពេក៖ ត្រូវការ ${issue2.origin} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `តូចពេក៖ ត្រូវការ ${issue2.origin} ${adj} ${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវចាប់ផ្តើមដោយ "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវបញ្ចប់ដោយ "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវមាន "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវតែផ្គូផ្គងនឹងទម្រង់ដែលបានកំណត់ ${_issue.pattern}`;
            return `មិនត្រឹមត្រូវ៖ ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `លេខមិនត្រឹមត្រូវ៖ ត្រូវតែជាពហុគុណនៃ ${issue2.divisor}`;
          case "unrecognized_keys":
            return `រកឃើញសោមិនស្គាល់៖ ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `សោមិនត្រឹមត្រូវនៅក្នុង ${issue2.origin}`;
          case "invalid_union":
            return `ទិន្នន័យមិនត្រឹមត្រូវ`;
          case "invalid_element":
            return `ទិន្នន័យមិនត្រឹមត្រូវនៅក្នុង ${issue2.origin}`;
          default:
            return `ទិន្នន័យមិនត្រឹមត្រូវ`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/kh.js
function kh_default() {
  return km_default();
}
var init_kh = __esm({
  "node_modules/zod/v4/locales/kh.js"() {
    init_km();
  }
});

// node_modules/zod/v4/locales/ko.js
function ko_default() {
  return {
    localeError: error27()
  };
}
var error27;
var init_ko = __esm({
  "node_modules/zod/v4/locales/ko.js"() {
    init_util2();
    error27 = () => {
      const Sizable = {
        string: { unit: "문자", verb: "to have" },
        file: { unit: "바이트", verb: "to have" },
        array: { unit: "개", verb: "to have" },
        set: { unit: "개", verb: "to have" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "입력",
        email: "이메일 주소",
        url: "URL",
        emoji: "이모지",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO 날짜시간",
        date: "ISO 날짜",
        time: "ISO 시간",
        duration: "ISO 기간",
        ipv4: "IPv4 주소",
        ipv6: "IPv6 주소",
        cidrv4: "IPv4 범위",
        cidrv6: "IPv6 범위",
        base64: "base64 인코딩 문자열",
        base64url: "base64url 인코딩 문자열",
        json_string: "JSON 문자열",
        e164: "E.164 번호",
        jwt: "JWT",
        template_literal: "입력"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `잘못된 입력: 예상 타입은 instanceof ${issue2.expected}, 받은 타입은 ${received}입니다`;
            }
            return `잘못된 입력: 예상 타입은 ${expected}, 받은 타입은 ${received}입니다`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `잘못된 입력: 값은 ${stringifyPrimitive(issue2.values[0])} 이어야 합니다`;
            return `잘못된 옵션: ${joinValues(issue2.values, "또는 ")} 중 하나여야 합니다`;
          case "too_big": {
            const adj = issue2.inclusive ? "이하" : "미만";
            const suffix = adj === "미만" ? "이어야 합니다" : "여야 합니다";
            const sizing = getSizing(issue2.origin);
            const unit = sizing?.unit ?? "요소";
            if (sizing)
              return `${issue2.origin ?? "값"}이 너무 큽니다: ${issue2.maximum.toString()}${unit} ${adj}${suffix}`;
            return `${issue2.origin ?? "값"}이 너무 큽니다: ${issue2.maximum.toString()} ${adj}${suffix}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? "이상" : "초과";
            const suffix = adj === "이상" ? "이어야 합니다" : "여야 합니다";
            const sizing = getSizing(issue2.origin);
            const unit = sizing?.unit ?? "요소";
            if (sizing) {
              return `${issue2.origin ?? "값"}이 너무 작습니다: ${issue2.minimum.toString()}${unit} ${adj}${suffix}`;
            }
            return `${issue2.origin ?? "값"}이 너무 작습니다: ${issue2.minimum.toString()} ${adj}${suffix}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `잘못된 문자열: "${_issue.prefix}"(으)로 시작해야 합니다`;
            }
            if (_issue.format === "ends_with")
              return `잘못된 문자열: "${_issue.suffix}"(으)로 끝나야 합니다`;
            if (_issue.format === "includes")
              return `잘못된 문자열: "${_issue.includes}"을(를) 포함해야 합니다`;
            if (_issue.format === "regex")
              return `잘못된 문자열: 정규식 ${_issue.pattern} 패턴과 일치해야 합니다`;
            return `잘못된 ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `잘못된 숫자: ${issue2.divisor}의 배수여야 합니다`;
          case "unrecognized_keys":
            return `인식할 수 없는 키: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `잘못된 키: ${issue2.origin}`;
          case "invalid_union":
            return `잘못된 입력`;
          case "invalid_element":
            return `잘못된 값: ${issue2.origin}`;
          default:
            return `잘못된 입력`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/lt.js
function getUnitTypeFromNumber(number4) {
  const abs = Math.abs(number4);
  const last = abs % 10;
  const last2 = abs % 100;
  if (last2 >= 11 && last2 <= 19 || last === 0)
    return "many";
  if (last === 1)
    return "one";
  return "few";
}
function lt_default() {
  return {
    localeError: error28()
  };
}
var capitalizeFirstCharacter, error28;
var init_lt = __esm({
  "node_modules/zod/v4/locales/lt.js"() {
    init_util2();
    capitalizeFirstCharacter = (text3) => {
      return text3.charAt(0).toUpperCase() + text3.slice(1);
    };
    error28 = () => {
      const Sizable = {
        string: {
          unit: {
            one: "simbolis",
            few: "simboliai",
            many: "simbolių"
          },
          verb: {
            smaller: {
              inclusive: "turi būti ne ilgesnė kaip",
              notInclusive: "turi būti trumpesnė kaip"
            },
            bigger: {
              inclusive: "turi būti ne trumpesnė kaip",
              notInclusive: "turi būti ilgesnė kaip"
            }
          }
        },
        file: {
          unit: {
            one: "baitas",
            few: "baitai",
            many: "baitų"
          },
          verb: {
            smaller: {
              inclusive: "turi būti ne didesnis kaip",
              notInclusive: "turi būti mažesnis kaip"
            },
            bigger: {
              inclusive: "turi būti ne mažesnis kaip",
              notInclusive: "turi būti didesnis kaip"
            }
          }
        },
        array: {
          unit: {
            one: "elementą",
            few: "elementus",
            many: "elementų"
          },
          verb: {
            smaller: {
              inclusive: "turi turėti ne daugiau kaip",
              notInclusive: "turi turėti mažiau kaip"
            },
            bigger: {
              inclusive: "turi turėti ne mažiau kaip",
              notInclusive: "turi turėti daugiau kaip"
            }
          }
        },
        set: {
          unit: {
            one: "elementą",
            few: "elementus",
            many: "elementų"
          },
          verb: {
            smaller: {
              inclusive: "turi turėti ne daugiau kaip",
              notInclusive: "turi turėti mažiau kaip"
            },
            bigger: {
              inclusive: "turi turėti ne mažiau kaip",
              notInclusive: "turi turėti daugiau kaip"
            }
          }
        }
      };
      function getSizing(origin, unitType, inclusive, targetShouldBe) {
        const result = Sizable[origin] ?? null;
        if (result === null)
          return result;
        return {
          unit: result.unit[unitType],
          verb: result.verb[targetShouldBe][inclusive ? "inclusive" : "notInclusive"]
        };
      }
      const FormatDictionary = {
        regex: "įvestis",
        email: "el. pašto adresas",
        url: "URL",
        emoji: "jaustukas",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO data ir laikas",
        date: "ISO data",
        time: "ISO laikas",
        duration: "ISO trukmė",
        ipv4: "IPv4 adresas",
        ipv6: "IPv6 adresas",
        cidrv4: "IPv4 tinklo prefiksas (CIDR)",
        cidrv6: "IPv6 tinklo prefiksas (CIDR)",
        base64: "base64 užkoduota eilutė",
        base64url: "base64url užkoduota eilutė",
        json_string: "JSON eilutė",
        e164: "E.164 numeris",
        jwt: "JWT",
        template_literal: "įvestis"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "skaičius",
        bigint: "sveikasis skaičius",
        string: "eilutė",
        boolean: "loginė reikšmė",
        undefined: "neapibrėžta reikšmė",
        function: "funkcija",
        symbol: "simbolis",
        array: "masyvas",
        object: "objektas",
        null: "nulinė reikšmė"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Gautas tipas ${received}, o tikėtasi - instanceof ${issue2.expected}`;
            }
            return `Gautas tipas ${received}, o tikėtasi - ${expected}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Privalo būti ${stringifyPrimitive(issue2.values[0])}`;
            return `Privalo būti vienas iš ${joinValues(issue2.values, "|")} pasirinkimų`;
          case "too_big": {
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.maximum)), issue2.inclusive ?? false, "smaller");
            if (sizing?.verb)
              return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} ${sizing.verb} ${issue2.maximum.toString()} ${sizing.unit ?? "elementų"}`;
            const adj = issue2.inclusive ? "ne didesnis kaip" : "mažesnis kaip";
            return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi būti ${adj} ${issue2.maximum.toString()} ${sizing?.unit}`;
          }
          case "too_small": {
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.minimum)), issue2.inclusive ?? false, "bigger");
            if (sizing?.verb)
              return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} ${sizing.verb} ${issue2.minimum.toString()} ${sizing.unit ?? "elementų"}`;
            const adj = issue2.inclusive ? "ne mažesnis kaip" : "didesnis kaip";
            return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi būti ${adj} ${issue2.minimum.toString()} ${sizing?.unit}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Eilutė privalo prasidėti "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Eilutė privalo pasibaigti "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Eilutė privalo įtraukti "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Eilutė privalo atitikti ${_issue.pattern}`;
            return `Neteisingas ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Skaičius privalo būti ${issue2.divisor} kartotinis.`;
          case "unrecognized_keys":
            return `Neatpažint${issue2.keys.length > 1 ? "i" : "as"} rakt${issue2.keys.length > 1 ? "ai" : "as"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return "Rastas klaidingas raktas";
          case "invalid_union":
            return "Klaidinga įvestis";
          case "invalid_element": {
            const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
            return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi klaidingą įvestį`;
          }
          default:
            return "Klaidinga įvestis";
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/mk.js
function mk_default() {
  return {
    localeError: error29()
  };
}
var error29;
var init_mk = __esm({
  "node_modules/zod/v4/locales/mk.js"() {
    init_util2();
    error29 = () => {
      const Sizable = {
        string: { unit: "знаци", verb: "да имаат" },
        file: { unit: "бајти", verb: "да имаат" },
        array: { unit: "ставки", verb: "да имаат" },
        set: { unit: "ставки", verb: "да имаат" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "внес",
        email: "адреса на е-пошта",
        url: "URL",
        emoji: "емоџи",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO датум и време",
        date: "ISO датум",
        time: "ISO време",
        duration: "ISO времетраење",
        ipv4: "IPv4 адреса",
        ipv6: "IPv6 адреса",
        cidrv4: "IPv4 опсег",
        cidrv6: "IPv6 опсег",
        base64: "base64-енкодирана низа",
        base64url: "base64url-енкодирана низа",
        json_string: "JSON низа",
        e164: "E.164 број",
        jwt: "JWT",
        template_literal: "внес"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "број",
        array: "низа"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Грешен внес: се очекува instanceof ${issue2.expected}, примено ${received}`;
            }
            return `Грешен внес: се очекува ${expected}, примено ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
            return `Грешана опција: се очекува една ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Премногу голем: се очекува ${issue2.origin ?? "вредноста"} да има ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елементи"}`;
            return `Премногу голем: се очекува ${issue2.origin ?? "вредноста"} да биде ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Премногу мал: се очекува ${issue2.origin} да има ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Премногу мал: се очекува ${issue2.origin} да биде ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Неважечка низа: мора да започнува со "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Неважечка низа: мора да завршува со "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Неважечка низа: мора да вклучува "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Неважечка низа: мора да одгоара на патернот ${_issue.pattern}`;
            return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Грешен број: мора да биде делив со ${issue2.divisor}`;
          case "unrecognized_keys":
            return `${issue2.keys.length > 1 ? "Непрепознаени клучеви" : "Непрепознаен клуч"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Грешен клуч во ${issue2.origin}`;
          case "invalid_union":
            return "Грешен внес";
          case "invalid_element":
            return `Грешна вредност во ${issue2.origin}`;
          default:
            return `Грешен внес`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ms.js
function ms_default() {
  return {
    localeError: error30()
  };
}
var error30;
var init_ms = __esm({
  "node_modules/zod/v4/locales/ms.js"() {
    init_util2();
    error30 = () => {
      const Sizable = {
        string: { unit: "aksara", verb: "mempunyai" },
        file: { unit: "bait", verb: "mempunyai" },
        array: { unit: "elemen", verb: "mempunyai" },
        set: { unit: "elemen", verb: "mempunyai" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "alamat e-mel",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "tarikh masa ISO",
        date: "tarikh ISO",
        time: "masa ISO",
        duration: "tempoh ISO",
        ipv4: "alamat IPv4",
        ipv6: "alamat IPv6",
        cidrv4: "julat IPv4",
        cidrv6: "julat IPv6",
        base64: "string dikodkan base64",
        base64url: "string dikodkan base64url",
        json_string: "string JSON",
        e164: "nombor E.164",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "nombor"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Input tidak sah: dijangka instanceof ${issue2.expected}, diterima ${received}`;
            }
            return `Input tidak sah: dijangka ${expected}, diterima ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Input tidak sah: dijangka ${stringifyPrimitive(issue2.values[0])}`;
            return `Pilihan tidak sah: dijangka salah satu daripada ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
            return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} adalah ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Terlalu kecil: dijangka ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Terlalu kecil: dijangka ${issue2.origin} adalah ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} tidak sah`;
          }
          case "not_multiple_of":
            return `Nombor tidak sah: perlu gandaan ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Kunci tidak dikenali: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Kunci tidak sah dalam ${issue2.origin}`;
          case "invalid_union":
            return "Input tidak sah";
          case "invalid_element":
            return `Nilai tidak sah dalam ${issue2.origin}`;
          default:
            return `Input tidak sah`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/nl.js
function nl_default() {
  return {
    localeError: error31()
  };
}
var error31;
var init_nl = __esm({
  "node_modules/zod/v4/locales/nl.js"() {
    init_util2();
    error31 = () => {
      const Sizable = {
        string: { unit: "tekens", verb: "heeft" },
        file: { unit: "bytes", verb: "heeft" },
        array: { unit: "elementen", verb: "heeft" },
        set: { unit: "elementen", verb: "heeft" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "invoer",
        email: "emailadres",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datum en tijd",
        date: "ISO datum",
        time: "ISO tijd",
        duration: "ISO duur",
        ipv4: "IPv4-adres",
        ipv6: "IPv6-adres",
        cidrv4: "IPv4-bereik",
        cidrv6: "IPv6-bereik",
        base64: "base64-gecodeerde tekst",
        base64url: "base64 URL-gecodeerde tekst",
        json_string: "JSON string",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "invoer"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "getal"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Ongeldige invoer: verwacht instanceof ${issue2.expected}, ontving ${received}`;
            }
            return `Ongeldige invoer: verwacht ${expected}, ontving ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Ongeldige invoer: verwacht ${stringifyPrimitive(issue2.values[0])}`;
            return `Ongeldige optie: verwacht één van ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            const longName = issue2.origin === "date" ? "laat" : issue2.origin === "string" ? "lang" : "groot";
            if (sizing)
              return `Te ${longName}: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementen"} ${sizing.verb}`;
            return `Te ${longName}: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} is`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            const shortName = issue2.origin === "date" ? "vroeg" : issue2.origin === "string" ? "kort" : "klein";
            if (sizing) {
              return `Te ${shortName}: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ${sizing.verb}`;
            }
            return `Te ${shortName}: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} is`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
            }
            if (_issue.format === "ends_with")
              return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
            if (_issue.format === "includes")
              return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
            if (_issue.format === "regex")
              return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
            return `Ongeldig: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Ongeldig getal: moet een veelvoud van ${issue2.divisor} zijn`;
          case "unrecognized_keys":
            return `Onbekende key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Ongeldige key in ${issue2.origin}`;
          case "invalid_union":
            return "Ongeldige invoer";
          case "invalid_element":
            return `Ongeldige waarde in ${issue2.origin}`;
          default:
            return `Ongeldige invoer`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/no.js
function no_default() {
  return {
    localeError: error32()
  };
}
var error32;
var init_no = __esm({
  "node_modules/zod/v4/locales/no.js"() {
    init_util2();
    error32 = () => {
      const Sizable = {
        string: { unit: "tegn", verb: "å ha" },
        file: { unit: "bytes", verb: "å ha" },
        array: { unit: "elementer", verb: "å inneholde" },
        set: { unit: "elementer", verb: "å inneholde" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "input",
        email: "e-postadresse",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO dato- og klokkeslett",
        date: "ISO-dato",
        time: "ISO-klokkeslett",
        duration: "ISO-varighet",
        ipv4: "IPv4-område",
        ipv6: "IPv6-område",
        cidrv4: "IPv4-spekter",
        cidrv6: "IPv6-spekter",
        base64: "base64-enkodet streng",
        base64url: "base64url-enkodet streng",
        json_string: "JSON-streng",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "tall",
        array: "liste"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Ugyldig input: forventet instanceof ${issue2.expected}, fikk ${received}`;
            }
            return `Ugyldig input: forventet ${expected}, fikk ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Ugyldig verdi: forventet ${stringifyPrimitive(issue2.values[0])}`;
            return `Ugyldig valg: forventet en av ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `For stor(t): forventet ${issue2.origin ?? "value"} til å ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
            return `For stor(t): forventet ${issue2.origin ?? "value"} til å ha ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `For lite(n): forventet ${issue2.origin} til å ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `For lite(n): forventet ${issue2.origin} til å ha ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Ugyldig streng: må starte med "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Ugyldig streng: må ende med "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Ugyldig streng: må inneholde "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Ugyldig streng: må matche mønsteret ${_issue.pattern}`;
            return `Ugyldig ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Ugyldig tall: må være et multiplum av ${issue2.divisor}`;
          case "unrecognized_keys":
            return `${issue2.keys.length > 1 ? "Ukjente nøkler" : "Ukjent nøkkel"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Ugyldig nøkkel i ${issue2.origin}`;
          case "invalid_union":
            return "Ugyldig input";
          case "invalid_element":
            return `Ugyldig verdi i ${issue2.origin}`;
          default:
            return `Ugyldig input`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ota.js
function ota_default() {
  return {
    localeError: error33()
  };
}
var error33;
var init_ota = __esm({
  "node_modules/zod/v4/locales/ota.js"() {
    init_util2();
    error33 = () => {
      const Sizable = {
        string: { unit: "harf", verb: "olmalıdır" },
        file: { unit: "bayt", verb: "olmalıdır" },
        array: { unit: "unsur", verb: "olmalıdır" },
        set: { unit: "unsur", verb: "olmalıdır" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "giren",
        email: "epostagâh",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO hengâmı",
        date: "ISO tarihi",
        time: "ISO zamanı",
        duration: "ISO müddeti",
        ipv4: "IPv4 nişânı",
        ipv6: "IPv6 nişânı",
        cidrv4: "IPv4 menzili",
        cidrv6: "IPv6 menzili",
        base64: "base64-şifreli metin",
        base64url: "base64url-şifreli metin",
        json_string: "JSON metin",
        e164: "E.164 sayısı",
        jwt: "JWT",
        template_literal: "giren"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "numara",
        array: "saf",
        null: "gayb"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Fâsit giren: umulan instanceof ${issue2.expected}, alınan ${received}`;
            }
            return `Fâsit giren: umulan ${expected}, alınan ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Fâsit giren: umulan ${stringifyPrimitive(issue2.values[0])}`;
            return `Fâsit tercih: mûteberler ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Fazla büyük: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmalıydı.`;
            return `Fazla büyük: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} olmalıydı.`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Fazla küçük: ${issue2.origin}, ${adj}${issue2.minimum.toString()} ${sizing.unit} sahip olmalıydı.`;
            }
            return `Fazla küçük: ${issue2.origin}, ${adj}${issue2.minimum.toString()} olmalıydı.`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Fâsit metin: "${_issue.prefix}" ile başlamalı.`;
            if (_issue.format === "ends_with")
              return `Fâsit metin: "${_issue.suffix}" ile bitmeli.`;
            if (_issue.format === "includes")
              return `Fâsit metin: "${_issue.includes}" ihtivâ etmeli.`;
            if (_issue.format === "regex")
              return `Fâsit metin: ${_issue.pattern} nakşına uymalı.`;
            return `Fâsit ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Fâsit sayı: ${issue2.divisor} katı olmalıydı.`;
          case "unrecognized_keys":
            return `Tanınmayan anahtar ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `${issue2.origin} için tanınmayan anahtar var.`;
          case "invalid_union":
            return "Giren tanınamadı.";
          case "invalid_element":
            return `${issue2.origin} için tanınmayan kıymet var.`;
          default:
            return `Kıymet tanınamadı.`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ps.js
function ps_default() {
  return {
    localeError: error34()
  };
}
var error34;
var init_ps = __esm({
  "node_modules/zod/v4/locales/ps.js"() {
    init_util2();
    error34 = () => {
      const Sizable = {
        string: { unit: "توکي", verb: "ولري" },
        file: { unit: "بایټس", verb: "ولري" },
        array: { unit: "توکي", verb: "ولري" },
        set: { unit: "توکي", verb: "ولري" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ورودي",
        email: "بریښنالیک",
        url: "یو آر ال",
        emoji: "ایموجي",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "نیټه او وخت",
        date: "نېټه",
        time: "وخت",
        duration: "موده",
        ipv4: "د IPv4 پته",
        ipv6: "د IPv6 پته",
        cidrv4: "د IPv4 ساحه",
        cidrv6: "د IPv6 ساحه",
        base64: "base64-encoded متن",
        base64url: "base64url-encoded متن",
        json_string: "JSON متن",
        e164: "د E.164 شمېره",
        jwt: "JWT",
        template_literal: "ورودي"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "عدد",
        array: "ارې"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `ناسم ورودي: باید instanceof ${issue2.expected} وای, مګر ${received} ترلاسه شو`;
            }
            return `ناسم ورودي: باید ${expected} وای, مګر ${received} ترلاسه شو`;
          }
          case "invalid_value":
            if (issue2.values.length === 1) {
              return `ناسم ورودي: باید ${stringifyPrimitive(issue2.values[0])} وای`;
            }
            return `ناسم انتخاب: باید یو له ${joinValues(issue2.values, "|")} څخه وای`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `ډیر لوی: ${issue2.origin ?? "ارزښت"} باید ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عنصرونه"} ولري`;
            }
            return `ډیر لوی: ${issue2.origin ?? "ارزښت"} باید ${adj}${issue2.maximum.toString()} وي`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `ډیر کوچنی: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} ${sizing.unit} ولري`;
            }
            return `ډیر کوچنی: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} وي`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `ناسم متن: باید د "${_issue.prefix}" سره پیل شي`;
            }
            if (_issue.format === "ends_with") {
              return `ناسم متن: باید د "${_issue.suffix}" سره پای ته ورسيږي`;
            }
            if (_issue.format === "includes") {
              return `ناسم متن: باید "${_issue.includes}" ولري`;
            }
            if (_issue.format === "regex") {
              return `ناسم متن: باید د ${_issue.pattern} سره مطابقت ولري`;
            }
            return `${FormatDictionary[_issue.format] ?? issue2.format} ناسم دی`;
          }
          case "not_multiple_of":
            return `ناسم عدد: باید د ${issue2.divisor} مضرب وي`;
          case "unrecognized_keys":
            return `ناسم ${issue2.keys.length > 1 ? "کلیډونه" : "کلیډ"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `ناسم کلیډ په ${issue2.origin} کې`;
          case "invalid_union":
            return `ناسمه ورودي`;
          case "invalid_element":
            return `ناسم عنصر په ${issue2.origin} کې`;
          default:
            return `ناسمه ورودي`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/pl.js
function pl_default() {
  return {
    localeError: error35()
  };
}
var error35;
var init_pl = __esm({
  "node_modules/zod/v4/locales/pl.js"() {
    init_util2();
    error35 = () => {
      const Sizable = {
        string: { unit: "znaków", verb: "mieć" },
        file: { unit: "bajtów", verb: "mieć" },
        array: { unit: "elementów", verb: "mieć" },
        set: { unit: "elementów", verb: "mieć" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "wyrażenie",
        email: "adres email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data i godzina w formacie ISO",
        date: "data w formacie ISO",
        time: "godzina w formacie ISO",
        duration: "czas trwania ISO",
        ipv4: "adres IPv4",
        ipv6: "adres IPv6",
        cidrv4: "zakres IPv4",
        cidrv6: "zakres IPv6",
        base64: "ciąg znaków zakodowany w formacie base64",
        base64url: "ciąg znaków zakodowany w formacie base64url",
        json_string: "ciąg znaków w formacie JSON",
        e164: "liczba E.164",
        jwt: "JWT",
        template_literal: "wejście"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "liczba",
        array: "tablica"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Nieprawidłowe dane wejściowe: oczekiwano instanceof ${issue2.expected}, otrzymano ${received}`;
            }
            return `Nieprawidłowe dane wejściowe: oczekiwano ${expected}, otrzymano ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Nieprawidłowe dane wejściowe: oczekiwano ${stringifyPrimitive(issue2.values[0])}`;
            return `Nieprawidłowa opcja: oczekiwano jednej z wartości ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Za duża wartość: oczekiwano, że ${issue2.origin ?? "wartość"} będzie mieć ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementów"}`;
            }
            return `Zbyt duż(y/a/e): oczekiwano, że ${issue2.origin ?? "wartość"} będzie wynosić ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Za mała wartość: oczekiwano, że ${issue2.origin ?? "wartość"} będzie mieć ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "elementów"}`;
            }
            return `Zbyt mał(y/a/e): oczekiwano, że ${issue2.origin ?? "wartość"} będzie wynosić ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Nieprawidłowy ciąg znaków: musi zaczynać się od "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Nieprawidłowy ciąg znaków: musi kończyć się na "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Nieprawidłowy ciąg znaków: musi zawierać "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Nieprawidłowy ciąg znaków: musi odpowiadać wzorcowi ${_issue.pattern}`;
            return `Nieprawidłow(y/a/e) ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Nieprawidłowa liczba: musi być wielokrotnością ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Nierozpoznane klucze${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Nieprawidłowy klucz w ${issue2.origin}`;
          case "invalid_union":
            return "Nieprawidłowe dane wejściowe";
          case "invalid_element":
            return `Nieprawidłowa wartość w ${issue2.origin}`;
          default:
            return `Nieprawidłowe dane wejściowe`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/pt.js
function pt_default() {
  return {
    localeError: error36()
  };
}
var error36;
var init_pt = __esm({
  "node_modules/zod/v4/locales/pt.js"() {
    init_util2();
    error36 = () => {
      const Sizable = {
        string: { unit: "caracteres", verb: "ter" },
        file: { unit: "bytes", verb: "ter" },
        array: { unit: "itens", verb: "ter" },
        set: { unit: "itens", verb: "ter" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "padrão",
        email: "endereço de e-mail",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "data e hora ISO",
        date: "data ISO",
        time: "hora ISO",
        duration: "duração ISO",
        ipv4: "endereço IPv4",
        ipv6: "endereço IPv6",
        cidrv4: "faixa de IPv4",
        cidrv6: "faixa de IPv6",
        base64: "texto codificado em base64",
        base64url: "URL codificada em base64",
        json_string: "texto JSON",
        e164: "número E.164",
        jwt: "JWT",
        template_literal: "entrada"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "número",
        null: "nulo"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Tipo inválido: esperado instanceof ${issue2.expected}, recebido ${received}`;
            }
            return `Tipo inválido: esperado ${expected}, recebido ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Entrada inválida: esperado ${stringifyPrimitive(issue2.values[0])}`;
            return `Opção inválida: esperada uma das ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Muito grande: esperado que ${issue2.origin ?? "valor"} tivesse ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
            return `Muito grande: esperado que ${issue2.origin ?? "valor"} fosse ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Muito pequeno: esperado que ${issue2.origin} tivesse ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Muito pequeno: esperado que ${issue2.origin} fosse ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Texto inválido: deve começar com "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Texto inválido: deve terminar com "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Texto inválido: deve incluir "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Texto inválido: deve corresponder ao padrão ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} inválido`;
          }
          case "not_multiple_of":
            return `Número inválido: deve ser múltiplo de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Chave${issue2.keys.length > 1 ? "s" : ""} desconhecida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Chave inválida em ${issue2.origin}`;
          case "invalid_union":
            return "Entrada inválida";
          case "invalid_element":
            return `Valor inválido em ${issue2.origin}`;
          default:
            return `Campo inválido`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ro.js
function ro_default() {
  return {
    localeError: error37()
  };
}
var error37;
var init_ro = __esm({
  "node_modules/zod/v4/locales/ro.js"() {
    init_util2();
    error37 = () => {
      const Sizable = {
        string: { unit: "caractere", verb: "să aibă" },
        file: { unit: "octeți", verb: "să aibă" },
        array: { unit: "elemente", verb: "să aibă" },
        set: { unit: "elemente", verb: "să aibă" },
        map: { unit: "intrări", verb: "să aibă" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "intrare",
        email: "adresă de email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "dată și oră ISO",
        date: "dată ISO",
        time: "oră ISO",
        duration: "durată ISO",
        ipv4: "adresă IPv4",
        ipv6: "adresă IPv6",
        mac: "adresă MAC",
        cidrv4: "interval IPv4",
        cidrv6: "interval IPv6",
        base64: "șir codat base64",
        base64url: "șir codat base64url",
        json_string: "șir JSON",
        e164: "număr E.164",
        jwt: "JWT",
        template_literal: "intrare"
      };
      const TypeDictionary = {
        nan: "NaN",
        string: "șir",
        number: "număr",
        boolean: "boolean",
        function: "funcție",
        array: "matrice",
        object: "obiect",
        undefined: "nedefinit",
        symbol: "simbol",
        bigint: "număr mare",
        void: "void",
        never: "never",
        map: "hartă",
        set: "set"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            return `Intrare invalidă: așteptat ${expected}, primit ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Intrare invalidă: așteptat ${stringifyPrimitive(issue2.values[0])}`;
            return `Opțiune invalidă: așteptat una dintre ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Prea mare: așteptat ca ${issue2.origin ?? "valoarea"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemente"}`;
            return `Prea mare: așteptat ca ${issue2.origin ?? "valoarea"} să fie ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Prea mic: așteptat ca ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Prea mic: așteptat ca ${issue2.origin} să fie ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Șir invalid: trebuie să înceapă cu "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Șir invalid: trebuie să se termine cu "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Șir invalid: trebuie să includă "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Șir invalid: trebuie să se potrivească cu modelul ${_issue.pattern}`;
            return `Format invalid: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Număr invalid: trebuie să fie multiplu de ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Chei nerecunoscute: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Cheie invalidă în ${issue2.origin}`;
          case "invalid_union":
            return "Intrare invalidă";
          case "invalid_element":
            return `Valoare invalidă în ${issue2.origin}`;
          default:
            return `Intrare invalidă`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ru.js
function getRussianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
function ru_default() {
  return {
    localeError: error38()
  };
}
var error38;
var init_ru = __esm({
  "node_modules/zod/v4/locales/ru.js"() {
    init_util2();
    error38 = () => {
      const Sizable = {
        string: {
          unit: {
            one: "символ",
            few: "символа",
            many: "символов"
          },
          verb: "иметь"
        },
        file: {
          unit: {
            one: "байт",
            few: "байта",
            many: "байт"
          },
          verb: "иметь"
        },
        array: {
          unit: {
            one: "элемент",
            few: "элемента",
            many: "элементов"
          },
          verb: "иметь"
        },
        set: {
          unit: {
            one: "элемент",
            few: "элемента",
            many: "элементов"
          },
          verb: "иметь"
        }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ввод",
        email: "email адрес",
        url: "URL",
        emoji: "эмодзи",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO дата и время",
        date: "ISO дата",
        time: "ISO время",
        duration: "ISO длительность",
        ipv4: "IPv4 адрес",
        ipv6: "IPv6 адрес",
        cidrv4: "IPv4 диапазон",
        cidrv6: "IPv6 диапазон",
        base64: "строка в формате base64",
        base64url: "строка в формате base64url",
        json_string: "JSON строка",
        e164: "номер E.164",
        jwt: "JWT",
        template_literal: "ввод"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "число",
        array: "массив"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Неверный ввод: ожидалось instanceof ${issue2.expected}, получено ${received}`;
            }
            return `Неверный ввод: ожидалось ${expected}, получено ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Неверный ввод: ожидалось ${stringifyPrimitive(issue2.values[0])}`;
            return `Неверный вариант: ожидалось одно из ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              const maxValue = Number(issue2.maximum);
              const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
              return `Слишком большое значение: ожидалось, что ${issue2.origin ?? "значение"} будет иметь ${adj}${issue2.maximum.toString()} ${unit}`;
            }
            return `Слишком большое значение: ожидалось, что ${issue2.origin ?? "значение"} будет ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              const minValue = Number(issue2.minimum);
              const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
              return `Слишком маленькое значение: ожидалось, что ${issue2.origin} будет иметь ${adj}${issue2.minimum.toString()} ${unit}`;
            }
            return `Слишком маленькое значение: ожидалось, что ${issue2.origin} будет ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Неверная строка: должна начинаться с "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Неверная строка: должна заканчиваться на "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Неверная строка: должна содержать "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Неверная строка: должна соответствовать шаблону ${_issue.pattern}`;
            return `Неверный ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Неверное число: должно быть кратным ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Нераспознанн${issue2.keys.length > 1 ? "ые" : "ый"} ключ${issue2.keys.length > 1 ? "и" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Неверный ключ в ${issue2.origin}`;
          case "invalid_union":
            return "Неверные входные данные";
          case "invalid_element":
            return `Неверное значение в ${issue2.origin}`;
          default:
            return `Неверные входные данные`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/sl.js
function sl_default() {
  return {
    localeError: error39()
  };
}
var error39;
var init_sl = __esm({
  "node_modules/zod/v4/locales/sl.js"() {
    init_util2();
    error39 = () => {
      const Sizable = {
        string: { unit: "znakov", verb: "imeti" },
        file: { unit: "bajtov", verb: "imeti" },
        array: { unit: "elementov", verb: "imeti" },
        set: { unit: "elementov", verb: "imeti" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "vnos",
        email: "e-poštni naslov",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO datum in čas",
        date: "ISO datum",
        time: "ISO čas",
        duration: "ISO trajanje",
        ipv4: "IPv4 naslov",
        ipv6: "IPv6 naslov",
        cidrv4: "obseg IPv4",
        cidrv6: "obseg IPv6",
        base64: "base64 kodiran niz",
        base64url: "base64url kodiran niz",
        json_string: "JSON niz",
        e164: "E.164 številka",
        jwt: "JWT",
        template_literal: "vnos"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "število",
        array: "tabela"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Neveljaven vnos: pričakovano instanceof ${issue2.expected}, prejeto ${received}`;
            }
            return `Neveljaven vnos: pričakovano ${expected}, prejeto ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Neveljaven vnos: pričakovano ${stringifyPrimitive(issue2.values[0])}`;
            return `Neveljavna možnost: pričakovano eno izmed ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Preveliko: pričakovano, da bo ${issue2.origin ?? "vrednost"} imelo ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementov"}`;
            return `Preveliko: pričakovano, da bo ${issue2.origin ?? "vrednost"} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Premajhno: pričakovano, da bo ${issue2.origin} imelo ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Premajhno: pričakovano, da bo ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Neveljaven niz: mora se začeti z "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Neveljaven niz: mora se končati z "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
            return `Neveljaven ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Neveljavno število: mora biti večkratnik ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Neprepoznan${issue2.keys.length > 1 ? "i ključi" : " ključ"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Neveljaven ključ v ${issue2.origin}`;
          case "invalid_union":
            return "Neveljaven vnos";
          case "invalid_element":
            return `Neveljavna vrednost v ${issue2.origin}`;
          default:
            return "Neveljaven vnos";
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/sv.js
function sv_default() {
  return {
    localeError: error40()
  };
}
var error40;
var init_sv = __esm({
  "node_modules/zod/v4/locales/sv.js"() {
    init_util2();
    error40 = () => {
      const Sizable = {
        string: { unit: "tecken", verb: "att ha" },
        file: { unit: "bytes", verb: "att ha" },
        array: { unit: "objekt", verb: "att innehålla" },
        set: { unit: "objekt", verb: "att innehålla" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "reguljärt uttryck",
        email: "e-postadress",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO-datum och tid",
        date: "ISO-datum",
        time: "ISO-tid",
        duration: "ISO-varaktighet",
        ipv4: "IPv4-intervall",
        ipv6: "IPv6-intervall",
        cidrv4: "IPv4-spektrum",
        cidrv6: "IPv6-spektrum",
        base64: "base64-kodad sträng",
        base64url: "base64url-kodad sträng",
        json_string: "JSON-sträng",
        e164: "E.164-nummer",
        jwt: "JWT",
        template_literal: "mall-literal"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "antal",
        array: "lista"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Ogiltig inmatning: förväntat instanceof ${issue2.expected}, fick ${received}`;
            }
            return `Ogiltig inmatning: förväntat ${expected}, fick ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Ogiltig inmatning: förväntat ${stringifyPrimitive(issue2.values[0])}`;
            return `Ogiltigt val: förväntade en av ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `För stor(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
            }
            return `För stor(t): förväntat ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `För lite(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `För lite(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `Ogiltig sträng: måste börja med "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `Ogiltig sträng: måste sluta med "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Ogiltig sträng: måste innehålla "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Ogiltig sträng: måste matcha mönstret "${_issue.pattern}"`;
            return `Ogiltig(t) ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Ogiltigt tal: måste vara en multipel av ${issue2.divisor}`;
          case "unrecognized_keys":
            return `${issue2.keys.length > 1 ? "Okända nycklar" : "Okänd nyckel"}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Ogiltig nyckel i ${issue2.origin ?? "värdet"}`;
          case "invalid_union":
            return "Ogiltig input";
          case "invalid_element":
            return `Ogiltigt värde i ${issue2.origin ?? "värdet"}`;
          default:
            return `Ogiltig input`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ta.js
function ta_default() {
  return {
    localeError: error41()
  };
}
var error41;
var init_ta = __esm({
  "node_modules/zod/v4/locales/ta.js"() {
    init_util2();
    error41 = () => {
      const Sizable = {
        string: { unit: "எழுத்துக்கள்", verb: "கொண்டிருக்க வேண்டும்" },
        file: { unit: "பைட்டுகள்", verb: "கொண்டிருக்க வேண்டும்" },
        array: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
        set: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "உள்ளீடு",
        email: "மின்னஞ்சல் முகவரி",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO தேதி நேரம்",
        date: "ISO தேதி",
        time: "ISO நேரம்",
        duration: "ISO கால அளவு",
        ipv4: "IPv4 முகவரி",
        ipv6: "IPv6 முகவரி",
        cidrv4: "IPv4 வரம்பு",
        cidrv6: "IPv6 வரம்பு",
        base64: "base64-encoded சரம்",
        base64url: "base64url-encoded சரம்",
        json_string: "JSON சரம்",
        e164: "E.164 எண்",
        jwt: "JWT",
        template_literal: "input"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "எண்",
        array: "அணி",
        null: "வெறுமை"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது instanceof ${issue2.expected}, பெறப்பட்டது ${received}`;
            }
            return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${expected}, பெறப்பட்டது ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${stringifyPrimitive(issue2.values[0])}`;
            return `தவறான விருப்பம்: எதிர்பார்க்கப்பட்டது ${joinValues(issue2.values, "|")} இல் ஒன்று`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue2.origin ?? "மதிப்பு"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "உறுப்புகள்"} ஆக இருக்க வேண்டும்`;
            }
            return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue2.origin ?? "மதிப்பு"} ${adj}${issue2.maximum.toString()} ஆக இருக்க வேண்டும்`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ஆக இருக்க வேண்டும்`;
            }
            return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue2.origin} ${adj}${issue2.minimum.toString()} ஆக இருக்க வேண்டும்`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `தவறான சரம்: "${_issue.prefix}" இல் தொடங்க வேண்டும்`;
            if (_issue.format === "ends_with")
              return `தவறான சரம்: "${_issue.suffix}" இல் முடிவடைய வேண்டும்`;
            if (_issue.format === "includes")
              return `தவறான சரம்: "${_issue.includes}" ஐ உள்ளடக்க வேண்டும்`;
            if (_issue.format === "regex")
              return `தவறான சரம்: ${_issue.pattern} முறைபாட்டுடன் பொருந்த வேண்டும்`;
            return `தவறான ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `தவறான எண்: ${issue2.divisor} இன் பலமாக இருக்க வேண்டும்`;
          case "unrecognized_keys":
            return `அடையாளம் தெரியாத விசை${issue2.keys.length > 1 ? "கள்" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `${issue2.origin} இல் தவறான விசை`;
          case "invalid_union":
            return "தவறான உள்ளீடு";
          case "invalid_element":
            return `${issue2.origin} இல் தவறான மதிப்பு`;
          default:
            return `தவறான உள்ளீடு`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/th.js
function th_default() {
  return {
    localeError: error42()
  };
}
var error42;
var init_th = __esm({
  "node_modules/zod/v4/locales/th.js"() {
    init_util2();
    error42 = () => {
      const Sizable = {
        string: { unit: "ตัวอักษร", verb: "ควรมี" },
        file: { unit: "ไบต์", verb: "ควรมี" },
        array: { unit: "รายการ", verb: "ควรมี" },
        set: { unit: "รายการ", verb: "ควรมี" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ข้อมูลที่ป้อน",
        email: "ที่อยู่อีเมล",
        url: "URL",
        emoji: "อิโมจิ",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "วันที่เวลาแบบ ISO",
        date: "วันที่แบบ ISO",
        time: "เวลาแบบ ISO",
        duration: "ช่วงเวลาแบบ ISO",
        ipv4: "ที่อยู่ IPv4",
        ipv6: "ที่อยู่ IPv6",
        cidrv4: "ช่วง IP แบบ IPv4",
        cidrv6: "ช่วง IP แบบ IPv6",
        base64: "ข้อความแบบ Base64",
        base64url: "ข้อความแบบ Base64 สำหรับ URL",
        json_string: "ข้อความแบบ JSON",
        e164: "เบอร์โทรศัพท์ระหว่างประเทศ (E.164)",
        jwt: "โทเคน JWT",
        template_literal: "ข้อมูลที่ป้อน"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "ตัวเลข",
        array: "อาร์เรย์ (Array)",
        null: "ไม่มีค่า (null)"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น instanceof ${issue2.expected} แต่ได้รับ ${received}`;
            }
            return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น ${expected} แต่ได้รับ ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `ค่าไม่ถูกต้อง: ควรเป็น ${stringifyPrimitive(issue2.values[0])}`;
            return `ตัวเลือกไม่ถูกต้อง: ควรเป็นหนึ่งใน ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "ไม่เกิน" : "น้อยกว่า";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `เกินกำหนด: ${issue2.origin ?? "ค่า"} ควรมี${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "รายการ"}`;
            return `เกินกำหนด: ${issue2.origin ?? "ค่า"} ควรมี${adj} ${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? "อย่างน้อย" : "มากกว่า";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `น้อยกว่ากำหนด: ${issue2.origin} ควรมี${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `น้อยกว่ากำหนด: ${issue2.origin} ควรมี${adj} ${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `รูปแบบไม่ถูกต้อง: ข้อความต้องขึ้นต้นด้วย "${_issue.prefix}"`;
            }
            if (_issue.format === "ends_with")
              return `รูปแบบไม่ถูกต้อง: ข้อความต้องลงท้ายด้วย "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `รูปแบบไม่ถูกต้อง: ข้อความต้องมี "${_issue.includes}" อยู่ในข้อความ`;
            if (_issue.format === "regex")
              return `รูปแบบไม่ถูกต้อง: ต้องตรงกับรูปแบบที่กำหนด ${_issue.pattern}`;
            return `รูปแบบไม่ถูกต้อง: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `ตัวเลขไม่ถูกต้อง: ต้องเป็นจำนวนที่หารด้วย ${issue2.divisor} ได้ลงตัว`;
          case "unrecognized_keys":
            return `พบคีย์ที่ไม่รู้จัก: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `คีย์ไม่ถูกต้องใน ${issue2.origin}`;
          case "invalid_union":
            return "ข้อมูลไม่ถูกต้อง: ไม่ตรงกับรูปแบบยูเนียนที่กำหนดไว้";
          case "invalid_element":
            return `ข้อมูลไม่ถูกต้องใน ${issue2.origin}`;
          default:
            return `ข้อมูลไม่ถูกต้อง`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/tr.js
function tr_default() {
  return {
    localeError: error43()
  };
}
var error43;
var init_tr = __esm({
  "node_modules/zod/v4/locales/tr.js"() {
    init_util2();
    error43 = () => {
      const Sizable = {
        string: { unit: "karakter", verb: "olmalı" },
        file: { unit: "bayt", verb: "olmalı" },
        array: { unit: "öğe", verb: "olmalı" },
        set: { unit: "öğe", verb: "olmalı" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "girdi",
        email: "e-posta adresi",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO tarih ve saat",
        date: "ISO tarih",
        time: "ISO saat",
        duration: "ISO süre",
        ipv4: "IPv4 adresi",
        ipv6: "IPv6 adresi",
        cidrv4: "IPv4 aralığı",
        cidrv6: "IPv6 aralığı",
        base64: "base64 ile şifrelenmiş metin",
        base64url: "base64url ile şifrelenmiş metin",
        json_string: "JSON dizesi",
        e164: "E.164 sayısı",
        jwt: "JWT",
        template_literal: "Şablon dizesi"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Geçersiz değer: beklenen instanceof ${issue2.expected}, alınan ${received}`;
            }
            return `Geçersiz değer: beklenen ${expected}, alınan ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Geçersiz değer: beklenen ${stringifyPrimitive(issue2.values[0])}`;
            return `Geçersiz seçenek: aşağıdakilerden biri olmalı: ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Çok büyük: beklenen ${issue2.origin ?? "değer"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "öğe"}`;
            return `Çok büyük: beklenen ${issue2.origin ?? "değer"} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Çok küçük: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            return `Çok küçük: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Geçersiz metin: "${_issue.prefix}" ile başlamalı`;
            if (_issue.format === "ends_with")
              return `Geçersiz metin: "${_issue.suffix}" ile bitmeli`;
            if (_issue.format === "includes")
              return `Geçersiz metin: "${_issue.includes}" içermeli`;
            if (_issue.format === "regex")
              return `Geçersiz metin: ${_issue.pattern} desenine uymalı`;
            return `Geçersiz ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Geçersiz sayı: ${issue2.divisor} ile tam bölünebilmeli`;
          case "unrecognized_keys":
            return `Tanınmayan anahtar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `${issue2.origin} içinde geçersiz anahtar`;
          case "invalid_union":
            return "Geçersiz değer";
          case "invalid_element":
            return `${issue2.origin} içinde geçersiz değer`;
          default:
            return `Geçersiz değer`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/uk.js
function uk_default() {
  return {
    localeError: error44()
  };
}
var error44;
var init_uk = __esm({
  "node_modules/zod/v4/locales/uk.js"() {
    init_util2();
    error44 = () => {
      const Sizable = {
        string: { unit: "символів", verb: "матиме" },
        file: { unit: "байтів", verb: "матиме" },
        array: { unit: "елементів", verb: "матиме" },
        set: { unit: "елементів", verb: "матиме" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "вхідні дані",
        email: "адреса електронної пошти",
        url: "URL",
        emoji: "емодзі",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "дата та час ISO",
        date: "дата ISO",
        time: "час ISO",
        duration: "тривалість ISO",
        ipv4: "адреса IPv4",
        ipv6: "адреса IPv6",
        cidrv4: "діапазон IPv4",
        cidrv6: "діапазон IPv6",
        base64: "рядок у кодуванні base64",
        base64url: "рядок у кодуванні base64url",
        json_string: "рядок JSON",
        e164: "номер E.164",
        jwt: "JWT",
        template_literal: "вхідні дані"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "число",
        array: "масив"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Неправильні вхідні дані: очікується instanceof ${issue2.expected}, отримано ${received}`;
            }
            return `Неправильні вхідні дані: очікується ${expected}, отримано ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Неправильні вхідні дані: очікується ${stringifyPrimitive(issue2.values[0])}`;
            return `Неправильна опція: очікується одне з ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Занадто велике: очікується, що ${issue2.origin ?? "значення"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елементів"}`;
            return `Занадто велике: очікується, що ${issue2.origin ?? "значення"} буде ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Занадто мале: очікується, що ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Занадто мале: очікується, що ${issue2.origin} буде ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Неправильний рядок: повинен починатися з "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Неправильний рядок: повинен закінчуватися на "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Неправильний рядок: повинен містити "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Неправильний рядок: повинен відповідати шаблону ${_issue.pattern}`;
            return `Неправильний ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Неправильне число: повинно бути кратним ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Нерозпізнаний ключ${issue2.keys.length > 1 ? "і" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Неправильний ключ у ${issue2.origin}`;
          case "invalid_union":
            return "Неправильні вхідні дані";
          case "invalid_element":
            return `Неправильне значення у ${issue2.origin}`;
          default:
            return `Неправильні вхідні дані`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/ua.js
function ua_default() {
  return uk_default();
}
var init_ua = __esm({
  "node_modules/zod/v4/locales/ua.js"() {
    init_uk();
  }
});

// node_modules/zod/v4/locales/ur.js
function ur_default() {
  return {
    localeError: error45()
  };
}
var error45;
var init_ur = __esm({
  "node_modules/zod/v4/locales/ur.js"() {
    init_util2();
    error45 = () => {
      const Sizable = {
        string: { unit: "حروف", verb: "ہونا" },
        file: { unit: "بائٹس", verb: "ہونا" },
        array: { unit: "آئٹمز", verb: "ہونا" },
        set: { unit: "آئٹمز", verb: "ہونا" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ان پٹ",
        email: "ای میل ایڈریس",
        url: "یو آر ایل",
        emoji: "ایموجی",
        uuid: "یو یو آئی ڈی",
        uuidv4: "یو یو آئی ڈی وی 4",
        uuidv6: "یو یو آئی ڈی وی 6",
        nanoid: "نینو آئی ڈی",
        guid: "جی یو آئی ڈی",
        cuid: "سی یو آئی ڈی",
        cuid2: "سی یو آئی ڈی 2",
        ulid: "یو ایل آئی ڈی",
        xid: "ایکس آئی ڈی",
        ksuid: "کے ایس یو آئی ڈی",
        datetime: "آئی ایس او ڈیٹ ٹائم",
        date: "آئی ایس او تاریخ",
        time: "آئی ایس او وقت",
        duration: "آئی ایس او مدت",
        ipv4: "آئی پی وی 4 ایڈریس",
        ipv6: "آئی پی وی 6 ایڈریس",
        cidrv4: "آئی پی وی 4 رینج",
        cidrv6: "آئی پی وی 6 رینج",
        base64: "بیس 64 ان کوڈڈ سٹرنگ",
        base64url: "بیس 64 یو آر ایل ان کوڈڈ سٹرنگ",
        json_string: "جے ایس او این سٹرنگ",
        e164: "ای 164 نمبر",
        jwt: "جے ڈبلیو ٹی",
        template_literal: "ان پٹ"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "نمبر",
        array: "آرے",
        null: "نل"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `غلط ان پٹ: instanceof ${issue2.expected} متوقع تھا، ${received} موصول ہوا`;
            }
            return `غلط ان پٹ: ${expected} متوقع تھا، ${received} موصول ہوا`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `غلط ان پٹ: ${stringifyPrimitive(issue2.values[0])} متوقع تھا`;
            return `غلط آپشن: ${joinValues(issue2.values, "|")} میں سے ایک متوقع تھا`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `بہت بڑا: ${issue2.origin ?? "ویلیو"} کے ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عناصر"} ہونے متوقع تھے`;
            return `بہت بڑا: ${issue2.origin ?? "ویلیو"} کا ${adj}${issue2.maximum.toString()} ہونا متوقع تھا`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `بہت چھوٹا: ${issue2.origin} کے ${adj}${issue2.minimum.toString()} ${sizing.unit} ہونے متوقع تھے`;
            }
            return `بہت چھوٹا: ${issue2.origin} کا ${adj}${issue2.minimum.toString()} ہونا متوقع تھا`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `غلط سٹرنگ: "${_issue.prefix}" سے شروع ہونا چاہیے`;
            }
            if (_issue.format === "ends_with")
              return `غلط سٹرنگ: "${_issue.suffix}" پر ختم ہونا چاہیے`;
            if (_issue.format === "includes")
              return `غلط سٹرنگ: "${_issue.includes}" شامل ہونا چاہیے`;
            if (_issue.format === "regex")
              return `غلط سٹرنگ: پیٹرن ${_issue.pattern} سے میچ ہونا چاہیے`;
            return `غلط ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `غلط نمبر: ${issue2.divisor} کا مضاعف ہونا چاہیے`;
          case "unrecognized_keys":
            return `غیر تسلیم شدہ کی${issue2.keys.length > 1 ? "ز" : ""}: ${joinValues(issue2.keys, "، ")}`;
          case "invalid_key":
            return `${issue2.origin} میں غلط کی`;
          case "invalid_union":
            return "غلط ان پٹ";
          case "invalid_element":
            return `${issue2.origin} میں غلط ویلیو`;
          default:
            return `غلط ان پٹ`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/uz.js
function uz_default() {
  return {
    localeError: error46()
  };
}
var error46;
var init_uz = __esm({
  "node_modules/zod/v4/locales/uz.js"() {
    init_util2();
    error46 = () => {
      const Sizable = {
        string: { unit: "belgi", verb: "bo‘lishi kerak" },
        file: { unit: "bayt", verb: "bo‘lishi kerak" },
        array: { unit: "element", verb: "bo‘lishi kerak" },
        set: { unit: "element", verb: "bo‘lishi kerak" },
        map: { unit: "yozuv", verb: "bo‘lishi kerak" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "kirish",
        email: "elektron pochta manzili",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO sana va vaqti",
        date: "ISO sana",
        time: "ISO vaqt",
        duration: "ISO davomiylik",
        ipv4: "IPv4 manzil",
        ipv6: "IPv6 manzil",
        mac: "MAC manzil",
        cidrv4: "IPv4 diapazon",
        cidrv6: "IPv6 diapazon",
        base64: "base64 kodlangan satr",
        base64url: "base64url kodlangan satr",
        json_string: "JSON satr",
        e164: "E.164 raqam",
        jwt: "JWT",
        template_literal: "kirish"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "raqam",
        array: "massiv"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Noto‘g‘ri kirish: kutilgan instanceof ${issue2.expected}, qabul qilingan ${received}`;
            }
            return `Noto‘g‘ri kirish: kutilgan ${expected}, qabul qilingan ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Noto‘g‘ri kirish: kutilgan ${stringifyPrimitive(issue2.values[0])}`;
            return `Noto‘g‘ri variant: quyidagilardan biri kutilgan ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Juda katta: kutilgan ${issue2.origin ?? "qiymat"} ${adj}${issue2.maximum.toString()} ${sizing.unit} ${sizing.verb}`;
            return `Juda katta: kutilgan ${issue2.origin ?? "qiymat"} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Juda kichik: kutilgan ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ${sizing.verb}`;
            }
            return `Juda kichik: kutilgan ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Noto‘g‘ri satr: "${_issue.prefix}" bilan boshlanishi kerak`;
            if (_issue.format === "ends_with")
              return `Noto‘g‘ri satr: "${_issue.suffix}" bilan tugashi kerak`;
            if (_issue.format === "includes")
              return `Noto‘g‘ri satr: "${_issue.includes}" ni o‘z ichiga olishi kerak`;
            if (_issue.format === "regex")
              return `Noto‘g‘ri satr: ${_issue.pattern} shabloniga mos kelishi kerak`;
            return `Noto‘g‘ri ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Noto‘g‘ri raqam: ${issue2.divisor} ning karralisi bo‘lishi kerak`;
          case "unrecognized_keys":
            return `Noma’lum kalit${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `${issue2.origin} dagi kalit noto‘g‘ri`;
          case "invalid_union":
            return "Noto‘g‘ri kirish";
          case "invalid_element":
            return `${issue2.origin} da noto‘g‘ri qiymat`;
          default:
            return `Noto‘g‘ri kirish`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/vi.js
function vi_default() {
  return {
    localeError: error47()
  };
}
var error47;
var init_vi = __esm({
  "node_modules/zod/v4/locales/vi.js"() {
    init_util2();
    error47 = () => {
      const Sizable = {
        string: { unit: "ký tự", verb: "có" },
        file: { unit: "byte", verb: "có" },
        array: { unit: "phần tử", verb: "có" },
        set: { unit: "phần tử", verb: "có" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "đầu vào",
        email: "địa chỉ email",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ngày giờ ISO",
        date: "ngày ISO",
        time: "giờ ISO",
        duration: "khoảng thời gian ISO",
        ipv4: "địa chỉ IPv4",
        ipv6: "địa chỉ IPv6",
        cidrv4: "dải IPv4",
        cidrv6: "dải IPv6",
        base64: "chuỗi mã hóa base64",
        base64url: "chuỗi mã hóa base64url",
        json_string: "chuỗi JSON",
        e164: "số E.164",
        jwt: "JWT",
        template_literal: "đầu vào"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "số",
        array: "mảng"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Đầu vào không hợp lệ: mong đợi instanceof ${issue2.expected}, nhận được ${received}`;
            }
            return `Đầu vào không hợp lệ: mong đợi ${expected}, nhận được ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Đầu vào không hợp lệ: mong đợi ${stringifyPrimitive(issue2.values[0])}`;
            return `Tùy chọn không hợp lệ: mong đợi một trong các giá trị ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Quá lớn: mong đợi ${issue2.origin ?? "giá trị"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "phần tử"}`;
            return `Quá lớn: mong đợi ${issue2.origin ?? "giá trị"} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `Quá nhỏ: mong đợi ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `Quá nhỏ: mong đợi ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Chuỗi không hợp lệ: phải bắt đầu bằng "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Chuỗi không hợp lệ: phải kết thúc bằng "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Chuỗi không hợp lệ: phải bao gồm "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Chuỗi không hợp lệ: phải khớp với mẫu ${_issue.pattern}`;
            return `${FormatDictionary[_issue.format] ?? issue2.format} không hợp lệ`;
          }
          case "not_multiple_of":
            return `Số không hợp lệ: phải là bội số của ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Khóa không được nhận dạng: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Khóa không hợp lệ trong ${issue2.origin}`;
          case "invalid_union":
            return "Đầu vào không hợp lệ";
          case "invalid_element":
            return `Giá trị không hợp lệ trong ${issue2.origin}`;
          default:
            return `Đầu vào không hợp lệ`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/zh-CN.js
function zh_CN_default() {
  return {
    localeError: error48()
  };
}
var error48;
var init_zh_CN = __esm({
  "node_modules/zod/v4/locales/zh-CN.js"() {
    init_util2();
    error48 = () => {
      const Sizable = {
        string: { unit: "字符", verb: "包含" },
        file: { unit: "字节", verb: "包含" },
        array: { unit: "项", verb: "包含" },
        set: { unit: "项", verb: "包含" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "输入",
        email: "电子邮件",
        url: "URL",
        emoji: "表情符号",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO日期时间",
        date: "ISO日期",
        time: "ISO时间",
        duration: "ISO时长",
        ipv4: "IPv4地址",
        ipv6: "IPv6地址",
        cidrv4: "IPv4网段",
        cidrv6: "IPv6网段",
        base64: "base64编码字符串",
        base64url: "base64url编码字符串",
        json_string: "JSON字符串",
        e164: "E.164号码",
        jwt: "JWT",
        template_literal: "输入"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "数字",
        array: "数组",
        null: "空值(null)"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `无效输入：期望 instanceof ${issue2.expected}，实际接收 ${received}`;
            }
            return `无效输入：期望 ${expected}，实际接收 ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `无效输入：期望 ${stringifyPrimitive(issue2.values[0])}`;
            return `无效选项：期望以下之一 ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `数值过大：期望 ${issue2.origin ?? "值"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "个元素"}`;
            return `数值过大：期望 ${issue2.origin ?? "值"} ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `数值过小：期望 ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `数值过小：期望 ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `无效字符串：必须以 "${_issue.prefix}" 开头`;
            if (_issue.format === "ends_with")
              return `无效字符串：必须以 "${_issue.suffix}" 结尾`;
            if (_issue.format === "includes")
              return `无效字符串：必须包含 "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `无效字符串：必须满足正则表达式 ${_issue.pattern}`;
            return `无效${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `无效数字：必须是 ${issue2.divisor} 的倍数`;
          case "unrecognized_keys":
            return `出现未知的键(key): ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `${issue2.origin} 中的键(key)无效`;
          case "invalid_union":
            return "无效输入";
          case "invalid_element":
            return `${issue2.origin} 中包含无效值(value)`;
          default:
            return `无效输入`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/zh-TW.js
function zh_TW_default() {
  return {
    localeError: error49()
  };
}
var error49;
var init_zh_TW = __esm({
  "node_modules/zod/v4/locales/zh-TW.js"() {
    init_util2();
    error49 = () => {
      const Sizable = {
        string: { unit: "字元", verb: "擁有" },
        file: { unit: "位元組", verb: "擁有" },
        array: { unit: "項目", verb: "擁有" },
        set: { unit: "項目", verb: "擁有" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "輸入",
        email: "郵件地址",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "ISO 日期時間",
        date: "ISO 日期",
        time: "ISO 時間",
        duration: "ISO 期間",
        ipv4: "IPv4 位址",
        ipv6: "IPv6 位址",
        cidrv4: "IPv4 範圍",
        cidrv6: "IPv6 範圍",
        base64: "base64 編碼字串",
        base64url: "base64url 編碼字串",
        json_string: "JSON 字串",
        e164: "E.164 數值",
        jwt: "JWT",
        template_literal: "輸入"
      };
      const TypeDictionary = {
        nan: "NaN"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `無效的輸入值：預期為 instanceof ${issue2.expected}，但收到 ${received}`;
            }
            return `無效的輸入值：預期為 ${expected}，但收到 ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `無效的輸入值：預期為 ${stringifyPrimitive(issue2.values[0])}`;
            return `無效的選項：預期為以下其中之一 ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `數值過大：預期 ${issue2.origin ?? "值"} 應為 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "個元素"}`;
            return `數值過大：預期 ${issue2.origin ?? "值"} 應為 ${adj}${issue2.maximum.toString()}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing) {
              return `數值過小：預期 ${issue2.origin} 應為 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
            }
            return `數值過小：預期 ${issue2.origin} 應為 ${adj}${issue2.minimum.toString()}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with") {
              return `無效的字串：必須以 "${_issue.prefix}" 開頭`;
            }
            if (_issue.format === "ends_with")
              return `無效的字串：必須以 "${_issue.suffix}" 結尾`;
            if (_issue.format === "includes")
              return `無效的字串：必須包含 "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `無效的字串：必須符合格式 ${_issue.pattern}`;
            return `無效的 ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `無效的數字：必須為 ${issue2.divisor} 的倍數`;
          case "unrecognized_keys":
            return `無法識別的鍵值${issue2.keys.length > 1 ? "們" : ""}：${joinValues(issue2.keys, "、")}`;
          case "invalid_key":
            return `${issue2.origin} 中有無效的鍵值`;
          case "invalid_union":
            return "無效的輸入值";
          case "invalid_element":
            return `${issue2.origin} 中有無效的值`;
          default:
            return `無效的輸入值`;
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/yo.js
function yo_default() {
  return {
    localeError: error50()
  };
}
var error50;
var init_yo = __esm({
  "node_modules/zod/v4/locales/yo.js"() {
    init_util2();
    error50 = () => {
      const Sizable = {
        string: { unit: "àmi", verb: "ní" },
        file: { unit: "bytes", verb: "ní" },
        array: { unit: "nkan", verb: "ní" },
        set: { unit: "nkan", verb: "ní" }
      };
      function getSizing(origin) {
        return Sizable[origin] ?? null;
      }
      const FormatDictionary = {
        regex: "ẹ̀rọ ìbáwọlé",
        email: "àdírẹ́sì ìmẹ́lì",
        url: "URL",
        emoji: "emoji",
        uuid: "UUID",
        uuidv4: "UUIDv4",
        uuidv6: "UUIDv6",
        nanoid: "nanoid",
        guid: "GUID",
        cuid: "cuid",
        cuid2: "cuid2",
        ulid: "ULID",
        xid: "XID",
        ksuid: "KSUID",
        datetime: "àkókò ISO",
        date: "ọjọ́ ISO",
        time: "àkókò ISO",
        duration: "àkókò tó pé ISO",
        ipv4: "àdírẹ́sì IPv4",
        ipv6: "àdírẹ́sì IPv6",
        cidrv4: "àgbègbè IPv4",
        cidrv6: "àgbègbè IPv6",
        base64: "ọ̀rọ̀ tí a kọ́ ní base64",
        base64url: "ọ̀rọ̀ base64url",
        json_string: "ọ̀rọ̀ JSON",
        e164: "nọ́mbà E.164",
        jwt: "JWT",
        template_literal: "ẹ̀rọ ìbáwọlé"
      };
      const TypeDictionary = {
        nan: "NaN",
        number: "nọ́mbà",
        array: "akopọ"
      };
      return (issue2) => {
        switch (issue2.code) {
          case "invalid_type": {
            const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
            const receivedType = parsedType(issue2.input);
            const received = TypeDictionary[receivedType] ?? receivedType;
            if (/^[A-Z]/.test(issue2.expected)) {
              return `Ìbáwọlé aṣìṣe: a ní láti fi instanceof ${issue2.expected}, àmọ̀ a rí ${received}`;
            }
            return `Ìbáwọlé aṣìṣe: a ní láti fi ${expected}, àmọ̀ a rí ${received}`;
          }
          case "invalid_value":
            if (issue2.values.length === 1)
              return `Ìbáwọlé aṣìṣe: a ní láti fi ${stringifyPrimitive(issue2.values[0])}`;
            return `Àṣàyàn aṣìṣe: yan ọ̀kan lára ${joinValues(issue2.values, "|")}`;
          case "too_big": {
            const adj = issue2.inclusive ? "<=" : "<";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Tó pọ̀ jù: a ní láti jẹ́ pé ${issue2.origin ?? "iye"} ${sizing.verb} ${adj}${issue2.maximum} ${sizing.unit}`;
            return `Tó pọ̀ jù: a ní láti jẹ́ ${adj}${issue2.maximum}`;
          }
          case "too_small": {
            const adj = issue2.inclusive ? ">=" : ">";
            const sizing = getSizing(issue2.origin);
            if (sizing)
              return `Kéré ju: a ní láti jẹ́ pé ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum} ${sizing.unit}`;
            return `Kéré ju: a ní láti jẹ́ ${adj}${issue2.minimum}`;
          }
          case "invalid_format": {
            const _issue = issue2;
            if (_issue.format === "starts_with")
              return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ bẹ̀rẹ̀ pẹ̀lú "${_issue.prefix}"`;
            if (_issue.format === "ends_with")
              return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ parí pẹ̀lú "${_issue.suffix}"`;
            if (_issue.format === "includes")
              return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ ní "${_issue.includes}"`;
            if (_issue.format === "regex")
              return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ bá àpẹẹrẹ mu ${_issue.pattern}`;
            return `Aṣìṣe: ${FormatDictionary[_issue.format] ?? issue2.format}`;
          }
          case "not_multiple_of":
            return `Nọ́mbà aṣìṣe: gbọ́dọ̀ jẹ́ èyà pípín ti ${issue2.divisor}`;
          case "unrecognized_keys":
            return `Bọtìnì àìmọ̀: ${joinValues(issue2.keys, ", ")}`;
          case "invalid_key":
            return `Bọtìnì aṣìṣe nínú ${issue2.origin}`;
          case "invalid_union":
            return "Ìbáwọlé aṣìṣe";
          case "invalid_element":
            return `Iye aṣìṣe nínú ${issue2.origin}`;
          default:
            return "Ìbáwọlé aṣìṣe";
        }
      };
    };
  }
});

// node_modules/zod/v4/locales/index.js
var locales_exports = {};
__export(locales_exports, {
  ar: () => ar_default,
  az: () => az_default,
  be: () => be_default,
  bg: () => bg_default,
  ca: () => ca_default,
  cs: () => cs_default,
  da: () => da_default,
  de: () => de_default,
  el: () => el_default,
  en: () => en_default,
  eo: () => eo_default,
  es: () => es_default,
  fa: () => fa_default,
  fi: () => fi_default,
  fr: () => fr_default,
  frCA: () => fr_CA_default,
  he: () => he_default,
  hr: () => hr_default,
  hu: () => hu_default,
  hy: () => hy_default,
  id: () => id_default,
  is: () => is_default,
  it: () => it_default,
  ja: () => ja_default,
  ka: () => ka_default,
  kh: () => kh_default,
  km: () => km_default,
  ko: () => ko_default,
  lt: () => lt_default,
  mk: () => mk_default,
  ms: () => ms_default,
  nl: () => nl_default,
  no: () => no_default,
  ota: () => ota_default,
  pl: () => pl_default,
  ps: () => ps_default,
  pt: () => pt_default,
  ro: () => ro_default,
  ru: () => ru_default,
  sl: () => sl_default,
  sv: () => sv_default,
  ta: () => ta_default,
  th: () => th_default,
  tr: () => tr_default,
  ua: () => ua_default,
  uk: () => uk_default,
  ur: () => ur_default,
  uz: () => uz_default,
  vi: () => vi_default,
  yo: () => yo_default,
  zhCN: () => zh_CN_default,
  zhTW: () => zh_TW_default
});
var init_locales = __esm({
  "node_modules/zod/v4/locales/index.js"() {
    init_ar();
    init_az();
    init_be();
    init_bg();
    init_ca();
    init_cs();
    init_da();
    init_de();
    init_el();
    init_en();
    init_eo();
    init_es();
    init_fa();
    init_fi();
    init_fr();
    init_fr_CA();
    init_he();
    init_hr();
    init_hu();
    init_hy();
    init_id();
    init_is();
    init_it();
    init_ja();
    init_ka();
    init_kh();
    init_km();
    init_ko();
    init_lt();
    init_mk();
    init_ms();
    init_nl();
    init_no();
    init_ota();
    init_ps();
    init_pl();
    init_pt();
    init_ro();
    init_ru();
    init_sl();
    init_sv();
    init_ta();
    init_th();
    init_tr();
    init_ua();
    init_uk();
    init_ur();
    init_uz();
    init_vi();
    init_zh_CN();
    init_zh_TW();
    init_yo();
  }
});

// node_modules/zod/v4/core/registries.js
function registry() {
  return new $ZodRegistry();
}
var _a2, $output, $input, $ZodRegistry, globalRegistry;
var init_registries = __esm({
  "node_modules/zod/v4/core/registries.js"() {
    $output = /* @__PURE__ */ Symbol("ZodOutput");
    $input = /* @__PURE__ */ Symbol("ZodInput");
    $ZodRegistry = class {
      constructor() {
        this._map = /* @__PURE__ */ new WeakMap();
        this._idmap = /* @__PURE__ */ new Map();
      }
      add(schema, ..._meta) {
        const meta3 = _meta[0];
        this._map.set(schema, meta3);
        if (meta3 && typeof meta3 === "object" && "id" in meta3) {
          this._idmap.set(meta3.id, schema);
        }
        return this;
      }
      clear() {
        this._map = /* @__PURE__ */ new WeakMap();
        this._idmap = /* @__PURE__ */ new Map();
        return this;
      }
      remove(schema) {
        const meta3 = this._map.get(schema);
        if (meta3 && typeof meta3 === "object" && "id" in meta3) {
          this._idmap.delete(meta3.id);
        }
        this._map.delete(schema);
        return this;
      }
      get(schema) {
        const p = schema._zod.parent;
        if (p) {
          const pm = { ...this.get(p) ?? {} };
          delete pm.id;
          const f = { ...pm, ...this._map.get(schema) };
          return Object.keys(f).length ? f : void 0;
        }
        return this._map.get(schema);
      }
      has(schema) {
        return this._map.has(schema);
      }
    };
    (_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
    globalRegistry = globalThis.__zod_globalRegistry;
  }
});

// node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedString(Class2, params) {
  return new Class2({
    type: "string",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _mac(Class2, params) {
  return new Class2({
    type: "string",
    format: "mac",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedNumber(Class2, params) {
  return new Class2({
    type: "number",
    coerce: true,
    checks: [],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _float32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float32",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _float64(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float64",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "int32",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uint32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "uint32",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedBoolean(Class2, params) {
  return new Class2({
    type: "boolean",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _bigint(Class2, params) {
  return new Class2({
    type: "bigint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedBigint(Class2, params) {
  return new Class2({
    type: "bigint",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "int64",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uint64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "uint64",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _symbol(Class2, params) {
  return new Class2({
    type: "symbol",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _undefined2(Class2, params) {
  return new Class2({
    type: "undefined",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _any(Class2) {
  return new Class2({
    type: "any"
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _void(Class2, params) {
  return new Class2({
    type: "void",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _date(Class2, params) {
  return new Class2({
    type: "date",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedDate(Class2, params) {
  return new Class2({
    type: "date",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nan(Class2, params) {
  return new Class2({
    type: "nan",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _positive(params) {
  return /* @__PURE__ */ _gt(0, params);
}
// @__NO_SIDE_EFFECTS__
function _negative(params) {
  return /* @__PURE__ */ _lt(0, params);
}
// @__NO_SIDE_EFFECTS__
function _nonpositive(params) {
  return /* @__PURE__ */ _lte(0, params);
}
// @__NO_SIDE_EFFECTS__
function _nonnegative(params) {
  return /* @__PURE__ */ _gte(0, params);
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
// @__NO_SIDE_EFFECTS__
function _maxSize(maximum, params) {
  return new $ZodCheckMaxSize({
    check: "max_size",
    ...normalizeParams(params),
    maximum
  });
}
// @__NO_SIDE_EFFECTS__
function _minSize(minimum, params) {
  return new $ZodCheckMinSize({
    check: "min_size",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _size(size, params) {
  return new $ZodCheckSizeEquals({
    check: "size_equals",
    ...normalizeParams(params),
    size
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern2, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern: pattern2
  });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
// @__NO_SIDE_EFFECTS__
function _property(property, schema, params) {
  return new $ZodCheckProperty({
    check: "property",
    property,
    schema,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _mime(types, params) {
  return new $ZodCheckMimeType({
    check: "mime_type",
    mime: types,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
  return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
  return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
  return /* @__PURE__ */ _overwrite((input) => slugify2(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _union(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
function _xor(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    inclusive: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _discriminatedUnion(Class2, discriminator, options, params) {
  return new Class2({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _intersection(Class2, left, right) {
  return new Class2({
    type: "intersection",
    left,
    right
  });
}
// @__NO_SIDE_EFFECTS__
function _tuple(Class2, items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new Class2({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _record(Class2, keyType, valueType, params) {
  return new Class2({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _map(Class2, keyType, valueType, params) {
  return new Class2({
    type: "map",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _set(Class2, valueType, params) {
  return new Class2({
    type: "set",
    valueType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _enum(Class2, values, params) {
  const entries2 = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new Class2({
    type: "enum",
    entries: entries2,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nativeEnum(Class2, entries2, params) {
  return new Class2({
    type: "enum",
    entries: entries2,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _literal(Class2, value, params) {
  return new Class2({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _file(Class2, params) {
  return new Class2({
    type: "file",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _transform(Class2, fn) {
  return new Class2({
    type: "transform",
    transform: fn
  });
}
// @__NO_SIDE_EFFECTS__
function _optional(Class2, innerType) {
  return new Class2({
    type: "optional",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _nullable(Class2, innerType) {
  return new Class2({
    type: "nullable",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _default(Class2, innerType, defaultValue) {
  return new Class2({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
// @__NO_SIDE_EFFECTS__
function _nonoptional(Class2, innerType, params) {
  return new Class2({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _success(Class2, innerType) {
  return new Class2({
    type: "success",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _catch(Class2, innerType, catchValue) {
  return new Class2({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
// @__NO_SIDE_EFFECTS__
function _pipe(Class2, in_, out) {
  return new Class2({
    type: "pipe",
    in: in_,
    out
  });
}
// @__NO_SIDE_EFFECTS__
function _readonly(Class2, innerType) {
  return new Class2({
    type: "readonly",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _templateLiteral(Class2, parts, params) {
  return new Class2({
    type: "template_literal",
    parts,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lazy(Class2, getter) {
  return new Class2({
    type: "lazy",
    getter
  });
}
// @__NO_SIDE_EFFECTS__
function _promise(Class2, innerType) {
  return new Class2({
    type: "promise",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _custom(Class2, fn, _params) {
  const norm = normalizeParams(_params);
  norm.abort ?? (norm.abort = true);
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...norm
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
  const ch = /* @__PURE__ */ _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// @__NO_SIDE_EFFECTS__
function describe(description) {
  const ch = new $ZodCheck({ check: "describe" });
  ch._zod.onattach = [
    (inst) => {
      const existing = globalRegistry.get(inst) ?? {};
      globalRegistry.add(inst, { ...existing, description });
    }
  ];
  ch._zod.check = () => {
  };
  return ch;
}
// @__NO_SIDE_EFFECTS__
function meta(metadata) {
  const ch = new $ZodCheck({ check: "meta" });
  ch._zod.onattach = [
    (inst) => {
      const existing = globalRegistry.get(inst) ?? {};
      globalRegistry.add(inst, { ...existing, ...metadata });
    }
  ];
  ch._zod.check = () => {
  };
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _stringbool(Classes, _params) {
  const params = normalizeParams(_params);
  let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
  let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
  if (params.case !== "sensitive") {
    truthyArray = truthyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
    falsyArray = falsyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
  }
  const truthySet = new Set(truthyArray);
  const falsySet = new Set(falsyArray);
  const _Codec = Classes.Codec ?? $ZodCodec;
  const _Boolean = Classes.Boolean ?? $ZodBoolean;
  const _String = Classes.String ?? $ZodString;
  const stringSchema = new _String({ type: "string", error: params.error });
  const booleanSchema = new _Boolean({ type: "boolean", error: params.error });
  const codec2 = new _Codec({
    type: "pipe",
    in: stringSchema,
    out: booleanSchema,
    transform: ((input, payload) => {
      let data = input;
      if (params.case !== "sensitive")
        data = data.toLowerCase();
      if (truthySet.has(data)) {
        return true;
      } else if (falsySet.has(data)) {
        return false;
      } else {
        payload.issues.push({
          code: "invalid_value",
          expected: "stringbool",
          values: [...truthySet, ...falsySet],
          input: payload.value,
          inst: codec2,
          continue: false
        });
        return {};
      }
    }),
    reverseTransform: ((input, _payload) => {
      if (input === true) {
        return truthyArray[0] || "true";
      } else {
        return falsyArray[0] || "false";
      }
    }),
    error: params.error
  });
  return codec2;
}
// @__NO_SIDE_EFFECTS__
function _stringFormat(Class2, format, fnOrRegex, _params = {}) {
  const params = normalizeParams(_params);
  const def = {
    ...normalizeParams(_params),
    check: "string_format",
    type: "string",
    format,
    fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
    ...params
  };
  if (fnOrRegex instanceof RegExp) {
    def.pattern = fnOrRegex;
  }
  const inst = new Class2(def);
  return inst;
}
var TimePrecision;
var init_api = __esm({
  "node_modules/zod/v4/core/api.js"() {
    init_checks();
    init_registries();
    init_schemas();
    init_util2();
    TimePrecision = {
      Any: null,
      Minute: -1,
      Second: 0,
      Millisecond: 3,
      Microsecond: 6
    };
  }
});

// node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {
    }),
    io: params?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? void 0
  };
}
function process2(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process2(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta3 = ctx.metadataRegistry.get(schema);
  if (meta3)
    Object.assign(result.schema, meta3);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {
  } else {
  }
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== void 0 && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {
  } else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod, createStandardJSONSchemaMethod;
var init_to_json_schema = __esm({
  "node_modules/zod/v4/core/to-json-schema.js"() {
    init_registries();
    createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
      const ctx = initializeContext({ ...params, processors });
      process2(schema, ctx);
      extractDefs(ctx, schema);
      return finalize(ctx, schema);
    };
    createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
      const { libraryOptions, target } = params ?? {};
      const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
      process2(schema, ctx);
      extractDefs(ctx, schema);
      return finalize(ctx, schema);
    };
  }
});

// node_modules/zod/v4/core/json-schema-processors.js
function toJSONSchema(input, params) {
  if ("_idmap" in input) {
    const registry2 = input;
    const ctx2 = initializeContext({ ...params, processors: allProcessors });
    const defs = {};
    for (const entry of registry2._idmap.entries()) {
      const [_, schema] = entry;
      process2(schema, ctx2);
    }
    const schemas = {};
    const external = {
      registry: registry2,
      uri: params?.uri,
      defs
    };
    ctx2.external = external;
    for (const entry of registry2._idmap.entries()) {
      const [key, schema] = entry;
      extractDefs(ctx2, schema);
      schemas[key] = finalize(ctx2, schema);
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = ctx2.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const ctx = initializeContext({ ...params, processors: allProcessors });
  process2(input, ctx);
  extractDefs(ctx, input);
  return finalize(ctx, input);
}
var formatMap, stringProcessor, numberProcessor, booleanProcessor, bigintProcessor, symbolProcessor, nullProcessor, undefinedProcessor, voidProcessor, neverProcessor, anyProcessor, unknownProcessor, dateProcessor, enumProcessor, literalProcessor, nanProcessor, templateLiteralProcessor, fileProcessor, successProcessor, customProcessor, functionProcessor, transformProcessor, mapProcessor, setProcessor, arrayProcessor, objectProcessor, unionProcessor, intersectionProcessor, tupleProcessor, recordProcessor, nullableProcessor, nonoptionalProcessor, defaultProcessor, prefaultProcessor, catchProcessor, pipeProcessor, readonlyProcessor, promiseProcessor, optionalProcessor, lazyProcessor, allProcessors;
var init_json_schema_processors = __esm({
  "node_modules/zod/v4/core/json-schema-processors.js"() {
    init_to_json_schema();
    init_util2();
    formatMap = {
      guid: "uuid",
      url: "uri",
      datetime: "date-time",
      json_string: "json-string",
      regex: ""
      // do not set
    };
    stringProcessor = (schema, ctx, _json, _params) => {
      const json2 = _json;
      json2.type = "string";
      const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
      if (typeof minimum === "number")
        json2.minLength = minimum;
      if (typeof maximum === "number")
        json2.maxLength = maximum;
      if (format) {
        json2.format = formatMap[format] ?? format;
        if (json2.format === "")
          delete json2.format;
        if (format === "time") {
          delete json2.format;
        }
      }
      if (contentEncoding)
        json2.contentEncoding = contentEncoding;
      if (patterns && patterns.size > 0) {
        const regexes = [...patterns];
        if (regexes.length === 1)
          json2.pattern = regexes[0].source;
        else if (regexes.length > 1) {
          json2.allOf = [
            ...regexes.map((regex) => ({
              ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
              pattern: regex.source
            }))
          ];
        }
      }
    };
    numberProcessor = (schema, ctx, _json, _params) => {
      const json2 = _json;
      const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
      if (typeof format === "string" && format.includes("int"))
        json2.type = "integer";
      else
        json2.type = "number";
      const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
      const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
      const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
      if (exMin) {
        if (legacy) {
          json2.minimum = exclusiveMinimum;
          json2.exclusiveMinimum = true;
        } else {
          json2.exclusiveMinimum = exclusiveMinimum;
        }
      } else if (typeof minimum === "number") {
        json2.minimum = minimum;
      }
      if (exMax) {
        if (legacy) {
          json2.maximum = exclusiveMaximum;
          json2.exclusiveMaximum = true;
        } else {
          json2.exclusiveMaximum = exclusiveMaximum;
        }
      } else if (typeof maximum === "number") {
        json2.maximum = maximum;
      }
      if (typeof multipleOf === "number")
        json2.multipleOf = multipleOf;
    };
    booleanProcessor = (_schema, _ctx, json2, _params) => {
      json2.type = "boolean";
    };
    bigintProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt cannot be represented in JSON Schema");
      }
    };
    symbolProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Symbols cannot be represented in JSON Schema");
      }
    };
    nullProcessor = (_schema, ctx, json2, _params) => {
      if (ctx.target === "openapi-3.0") {
        json2.type = "string";
        json2.nullable = true;
        json2.enum = [null];
      } else {
        json2.type = "null";
      }
    };
    undefinedProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Undefined cannot be represented in JSON Schema");
      }
    };
    voidProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Void cannot be represented in JSON Schema");
      }
    };
    neverProcessor = (_schema, _ctx, json2, _params) => {
      json2.not = {};
    };
    anyProcessor = (_schema, _ctx, _json, _params) => {
    };
    unknownProcessor = (_schema, _ctx, _json, _params) => {
    };
    dateProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Date cannot be represented in JSON Schema");
      }
    };
    enumProcessor = (schema, _ctx, json2, _params) => {
      const def = schema._zod.def;
      const values = getEnumValues(def.entries);
      if (values.every((v) => typeof v === "number"))
        json2.type = "number";
      if (values.every((v) => typeof v === "string"))
        json2.type = "string";
      json2.enum = values;
    };
    literalProcessor = (schema, ctx, json2, _params) => {
      const def = schema._zod.def;
      const vals = [];
      for (const val of def.values) {
        if (val === void 0) {
          if (ctx.unrepresentable === "throw") {
            throw new Error("Literal `undefined` cannot be represented in JSON Schema");
          } else {
          }
        } else if (typeof val === "bigint") {
          if (ctx.unrepresentable === "throw") {
            throw new Error("BigInt literals cannot be represented in JSON Schema");
          } else {
            vals.push(Number(val));
          }
        } else {
          vals.push(val);
        }
      }
      if (vals.length === 0) {
      } else if (vals.length === 1) {
        const val = vals[0];
        json2.type = val === null ? "null" : typeof val;
        if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
          json2.enum = [val];
        } else {
          json2.const = val;
        }
      } else {
        if (vals.every((v) => typeof v === "number"))
          json2.type = "number";
        if (vals.every((v) => typeof v === "string"))
          json2.type = "string";
        if (vals.every((v) => typeof v === "boolean"))
          json2.type = "boolean";
        if (vals.every((v) => v === null))
          json2.type = "null";
        json2.enum = vals;
      }
    };
    nanProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("NaN cannot be represented in JSON Schema");
      }
    };
    templateLiteralProcessor = (schema, _ctx, json2, _params) => {
      const _json = json2;
      const pattern2 = schema._zod.pattern;
      if (!pattern2)
        throw new Error("Pattern not found in template literal");
      _json.type = "string";
      _json.pattern = pattern2.source;
    };
    fileProcessor = (schema, _ctx, json2, _params) => {
      const _json = json2;
      const file2 = {
        type: "string",
        format: "binary",
        contentEncoding: "binary"
      };
      const { minimum, maximum, mime } = schema._zod.bag;
      if (minimum !== void 0)
        file2.minLength = minimum;
      if (maximum !== void 0)
        file2.maxLength = maximum;
      if (mime) {
        if (mime.length === 1) {
          file2.contentMediaType = mime[0];
          Object.assign(_json, file2);
        } else {
          Object.assign(_json, file2);
          _json.anyOf = mime.map((m) => ({ contentMediaType: m }));
        }
      } else {
        Object.assign(_json, file2);
      }
    };
    successProcessor = (_schema, _ctx, json2, _params) => {
      json2.type = "boolean";
    };
    customProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Custom types cannot be represented in JSON Schema");
      }
    };
    functionProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Function types cannot be represented in JSON Schema");
      }
    };
    transformProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Transforms cannot be represented in JSON Schema");
      }
    };
    mapProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Map cannot be represented in JSON Schema");
      }
    };
    setProcessor = (_schema, ctx, _json, _params) => {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Set cannot be represented in JSON Schema");
      }
    };
    arrayProcessor = (schema, ctx, _json, params) => {
      const json2 = _json;
      const def = schema._zod.def;
      const { minimum, maximum } = schema._zod.bag;
      if (typeof minimum === "number")
        json2.minItems = minimum;
      if (typeof maximum === "number")
        json2.maxItems = maximum;
      json2.type = "array";
      json2.items = process2(def.element, ctx, {
        ...params,
        path: [...params.path, "items"]
      });
    };
    objectProcessor = (schema, ctx, _json, params) => {
      const json2 = _json;
      const def = schema._zod.def;
      json2.type = "object";
      json2.properties = {};
      const shape = def.shape;
      for (const key in shape) {
        json2.properties[key] = process2(shape[key], ctx, {
          ...params,
          path: [...params.path, "properties", key]
        });
      }
      const allKeys = new Set(Object.keys(shape));
      const requiredKeys = new Set([...allKeys].filter((key) => {
        const v = def.shape[key]._zod;
        if (ctx.io === "input") {
          return v.optin === void 0;
        } else {
          return v.optout === void 0;
        }
      }));
      if (requiredKeys.size > 0) {
        json2.required = Array.from(requiredKeys);
      }
      if (def.catchall?._zod.def.type === "never") {
        json2.additionalProperties = false;
      } else if (!def.catchall) {
        if (ctx.io === "output")
          json2.additionalProperties = false;
      } else if (def.catchall) {
        json2.additionalProperties = process2(def.catchall, ctx, {
          ...params,
          path: [...params.path, "additionalProperties"]
        });
      }
    };
    unionProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      const isExclusive = def.inclusive === false;
      const options = def.options.map((x, i) => process2(x, ctx, {
        ...params,
        path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
      }));
      if (isExclusive) {
        json2.oneOf = options;
      } else {
        json2.anyOf = options;
      }
    };
    intersectionProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      const a = process2(def.left, ctx, {
        ...params,
        path: [...params.path, "allOf", 0]
      });
      const b = process2(def.right, ctx, {
        ...params,
        path: [...params.path, "allOf", 1]
      });
      const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
      const allOf = [
        ...isSimpleIntersection(a) ? a.allOf : [a],
        ...isSimpleIntersection(b) ? b.allOf : [b]
      ];
      json2.allOf = allOf;
    };
    tupleProcessor = (schema, ctx, _json, params) => {
      const json2 = _json;
      const def = schema._zod.def;
      json2.type = "array";
      const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
      const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
      const prefixItems = def.items.map((x, i) => process2(x, ctx, {
        ...params,
        path: [...params.path, prefixPath, i]
      }));
      const rest = def.rest ? process2(def.rest, ctx, {
        ...params,
        path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
      }) : null;
      if (ctx.target === "draft-2020-12") {
        json2.prefixItems = prefixItems;
        if (rest) {
          json2.items = rest;
        }
      } else if (ctx.target === "openapi-3.0") {
        json2.items = {
          anyOf: prefixItems
        };
        if (rest) {
          json2.items.anyOf.push(rest);
        }
        json2.minItems = prefixItems.length;
        if (!rest) {
          json2.maxItems = prefixItems.length;
        }
      } else {
        json2.items = prefixItems;
        if (rest) {
          json2.additionalItems = rest;
        }
      }
      const { minimum, maximum } = schema._zod.bag;
      if (typeof minimum === "number")
        json2.minItems = minimum;
      if (typeof maximum === "number")
        json2.maxItems = maximum;
    };
    recordProcessor = (schema, ctx, _json, params) => {
      const json2 = _json;
      const def = schema._zod.def;
      json2.type = "object";
      const keyType = def.keyType;
      const keyBag = keyType._zod.bag;
      const patterns = keyBag?.patterns;
      if (def.mode === "loose" && patterns && patterns.size > 0) {
        const valueSchema = process2(def.valueType, ctx, {
          ...params,
          path: [...params.path, "patternProperties", "*"]
        });
        json2.patternProperties = {};
        for (const pattern2 of patterns) {
          json2.patternProperties[pattern2.source] = valueSchema;
        }
      } else {
        if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
          json2.propertyNames = process2(def.keyType, ctx, {
            ...params,
            path: [...params.path, "propertyNames"]
          });
        }
        json2.additionalProperties = process2(def.valueType, ctx, {
          ...params,
          path: [...params.path, "additionalProperties"]
        });
      }
      const keyValues = keyType._zod.values;
      if (keyValues) {
        const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
        if (validKeyValues.length > 0) {
          json2.required = validKeyValues;
        }
      }
    };
    nullableProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      const inner = process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      if (ctx.target === "openapi-3.0") {
        seen.ref = def.innerType;
        json2.nullable = true;
      } else {
        json2.anyOf = [inner, { type: "null" }];
      }
    };
    nonoptionalProcessor = (schema, ctx, _json, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
    };
    defaultProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
      json2.default = JSON.parse(JSON.stringify(def.defaultValue));
    };
    prefaultProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
      if (ctx.io === "input")
        json2._prefault = JSON.parse(JSON.stringify(def.defaultValue));
    };
    catchProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
      let catchValue;
      try {
        catchValue = def.catchValue(void 0);
      } catch {
        throw new Error("Dynamic catch values are not supported in JSON Schema");
      }
      json2.default = catchValue;
    };
    pipeProcessor = (schema, ctx, _json, params) => {
      const def = schema._zod.def;
      const inIsTransform = def.in._zod.traits.has("$ZodTransform");
      const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
      process2(innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = innerType;
    };
    readonlyProcessor = (schema, ctx, json2, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
      json2.readOnly = true;
    };
    promiseProcessor = (schema, ctx, _json, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
    };
    optionalProcessor = (schema, ctx, _json, params) => {
      const def = schema._zod.def;
      process2(def.innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = def.innerType;
    };
    lazyProcessor = (schema, ctx, _json, params) => {
      const innerType = schema._zod.innerType;
      process2(innerType, ctx, params);
      const seen = ctx.seen.get(schema);
      seen.ref = innerType;
    };
    allProcessors = {
      string: stringProcessor,
      number: numberProcessor,
      boolean: booleanProcessor,
      bigint: bigintProcessor,
      symbol: symbolProcessor,
      null: nullProcessor,
      undefined: undefinedProcessor,
      void: voidProcessor,
      never: neverProcessor,
      any: anyProcessor,
      unknown: unknownProcessor,
      date: dateProcessor,
      enum: enumProcessor,
      literal: literalProcessor,
      nan: nanProcessor,
      template_literal: templateLiteralProcessor,
      file: fileProcessor,
      success: successProcessor,
      custom: customProcessor,
      function: functionProcessor,
      transform: transformProcessor,
      map: mapProcessor,
      set: setProcessor,
      array: arrayProcessor,
      object: objectProcessor,
      union: unionProcessor,
      intersection: intersectionProcessor,
      tuple: tupleProcessor,
      record: recordProcessor,
      nullable: nullableProcessor,
      nonoptional: nonoptionalProcessor,
      default: defaultProcessor,
      prefault: prefaultProcessor,
      catch: catchProcessor,
      pipe: pipeProcessor,
      readonly: readonlyProcessor,
      promise: promiseProcessor,
      optional: optionalProcessor,
      lazy: lazyProcessor
    };
  }
});

// node_modules/zod/v4/core/json-schema-generator.js
var JSONSchemaGenerator;
var init_json_schema_generator = __esm({
  "node_modules/zod/v4/core/json-schema-generator.js"() {
    init_json_schema_processors();
    init_to_json_schema();
    JSONSchemaGenerator = class {
      /** @deprecated Access via ctx instead */
      get metadataRegistry() {
        return this.ctx.metadataRegistry;
      }
      /** @deprecated Access via ctx instead */
      get target() {
        return this.ctx.target;
      }
      /** @deprecated Access via ctx instead */
      get unrepresentable() {
        return this.ctx.unrepresentable;
      }
      /** @deprecated Access via ctx instead */
      get override() {
        return this.ctx.override;
      }
      /** @deprecated Access via ctx instead */
      get io() {
        return this.ctx.io;
      }
      /** @deprecated Access via ctx instead */
      get counter() {
        return this.ctx.counter;
      }
      set counter(value) {
        this.ctx.counter = value;
      }
      /** @deprecated Access via ctx instead */
      get seen() {
        return this.ctx.seen;
      }
      constructor(params) {
        let normalizedTarget = params?.target ?? "draft-2020-12";
        if (normalizedTarget === "draft-4")
          normalizedTarget = "draft-04";
        if (normalizedTarget === "draft-7")
          normalizedTarget = "draft-07";
        this.ctx = initializeContext({
          processors: allProcessors,
          target: normalizedTarget,
          ...params?.metadata && { metadata: params.metadata },
          ...params?.unrepresentable && { unrepresentable: params.unrepresentable },
          ...params?.override && { override: params.override },
          ...params?.io && { io: params.io }
        });
      }
      /**
       * Process a schema to prepare it for JSON Schema generation.
       * This must be called before emit().
       */
      process(schema, _params = { path: [], schemaPath: [] }) {
        return process2(schema, this.ctx, _params);
      }
      /**
       * Emit the final JSON Schema after processing.
       * Must call process() first.
       */
      emit(schema, _params) {
        if (_params) {
          if (_params.cycles)
            this.ctx.cycles = _params.cycles;
          if (_params.reused)
            this.ctx.reused = _params.reused;
          if (_params.external)
            this.ctx.external = _params.external;
        }
        extractDefs(this.ctx, schema);
        const result = finalize(this.ctx, schema);
        const { "~standard": _, ...plainResult } = result;
        return plainResult;
      }
    };
  }
});

// node_modules/zod/v4/core/json-schema.js
var json_schema_exports = {};
var init_json_schema = __esm({
  "node_modules/zod/v4/core/json-schema.js"() {
  }
});

// node_modules/zod/v4/core/index.js
var core_exports2 = {};
__export(core_exports2, {
  $ZodAny: () => $ZodAny,
  $ZodArray: () => $ZodArray,
  $ZodAsyncError: () => $ZodAsyncError,
  $ZodBase64: () => $ZodBase64,
  $ZodBase64URL: () => $ZodBase64URL,
  $ZodBigInt: () => $ZodBigInt,
  $ZodBigIntFormat: () => $ZodBigIntFormat,
  $ZodBoolean: () => $ZodBoolean,
  $ZodCIDRv4: () => $ZodCIDRv4,
  $ZodCIDRv6: () => $ZodCIDRv6,
  $ZodCUID: () => $ZodCUID,
  $ZodCUID2: () => $ZodCUID2,
  $ZodCatch: () => $ZodCatch,
  $ZodCheck: () => $ZodCheck,
  $ZodCheckBigIntFormat: () => $ZodCheckBigIntFormat,
  $ZodCheckEndsWith: () => $ZodCheckEndsWith,
  $ZodCheckGreaterThan: () => $ZodCheckGreaterThan,
  $ZodCheckIncludes: () => $ZodCheckIncludes,
  $ZodCheckLengthEquals: () => $ZodCheckLengthEquals,
  $ZodCheckLessThan: () => $ZodCheckLessThan,
  $ZodCheckLowerCase: () => $ZodCheckLowerCase,
  $ZodCheckMaxLength: () => $ZodCheckMaxLength,
  $ZodCheckMaxSize: () => $ZodCheckMaxSize,
  $ZodCheckMimeType: () => $ZodCheckMimeType,
  $ZodCheckMinLength: () => $ZodCheckMinLength,
  $ZodCheckMinSize: () => $ZodCheckMinSize,
  $ZodCheckMultipleOf: () => $ZodCheckMultipleOf,
  $ZodCheckNumberFormat: () => $ZodCheckNumberFormat,
  $ZodCheckOverwrite: () => $ZodCheckOverwrite,
  $ZodCheckProperty: () => $ZodCheckProperty,
  $ZodCheckRegex: () => $ZodCheckRegex,
  $ZodCheckSizeEquals: () => $ZodCheckSizeEquals,
  $ZodCheckStartsWith: () => $ZodCheckStartsWith,
  $ZodCheckStringFormat: () => $ZodCheckStringFormat,
  $ZodCheckUpperCase: () => $ZodCheckUpperCase,
  $ZodCodec: () => $ZodCodec,
  $ZodCustom: () => $ZodCustom,
  $ZodCustomStringFormat: () => $ZodCustomStringFormat,
  $ZodDate: () => $ZodDate,
  $ZodDefault: () => $ZodDefault,
  $ZodDiscriminatedUnion: () => $ZodDiscriminatedUnion,
  $ZodE164: () => $ZodE164,
  $ZodEmail: () => $ZodEmail,
  $ZodEmoji: () => $ZodEmoji,
  $ZodEncodeError: () => $ZodEncodeError,
  $ZodEnum: () => $ZodEnum,
  $ZodError: () => $ZodError,
  $ZodExactOptional: () => $ZodExactOptional,
  $ZodFile: () => $ZodFile,
  $ZodFunction: () => $ZodFunction,
  $ZodGUID: () => $ZodGUID,
  $ZodIPv4: () => $ZodIPv4,
  $ZodIPv6: () => $ZodIPv6,
  $ZodISODate: () => $ZodISODate,
  $ZodISODateTime: () => $ZodISODateTime,
  $ZodISODuration: () => $ZodISODuration,
  $ZodISOTime: () => $ZodISOTime,
  $ZodIntersection: () => $ZodIntersection,
  $ZodJWT: () => $ZodJWT,
  $ZodKSUID: () => $ZodKSUID,
  $ZodLazy: () => $ZodLazy,
  $ZodLiteral: () => $ZodLiteral,
  $ZodMAC: () => $ZodMAC,
  $ZodMap: () => $ZodMap,
  $ZodNaN: () => $ZodNaN,
  $ZodNanoID: () => $ZodNanoID,
  $ZodNever: () => $ZodNever,
  $ZodNonOptional: () => $ZodNonOptional,
  $ZodNull: () => $ZodNull,
  $ZodNullable: () => $ZodNullable,
  $ZodNumber: () => $ZodNumber,
  $ZodNumberFormat: () => $ZodNumberFormat,
  $ZodObject: () => $ZodObject,
  $ZodObjectJIT: () => $ZodObjectJIT,
  $ZodOptional: () => $ZodOptional,
  $ZodPipe: () => $ZodPipe,
  $ZodPrefault: () => $ZodPrefault,
  $ZodPreprocess: () => $ZodPreprocess,
  $ZodPromise: () => $ZodPromise,
  $ZodReadonly: () => $ZodReadonly,
  $ZodRealError: () => $ZodRealError,
  $ZodRecord: () => $ZodRecord,
  $ZodRegistry: () => $ZodRegistry,
  $ZodSet: () => $ZodSet,
  $ZodString: () => $ZodString,
  $ZodStringFormat: () => $ZodStringFormat,
  $ZodSuccess: () => $ZodSuccess,
  $ZodSymbol: () => $ZodSymbol,
  $ZodTemplateLiteral: () => $ZodTemplateLiteral,
  $ZodTransform: () => $ZodTransform,
  $ZodTuple: () => $ZodTuple,
  $ZodType: () => $ZodType,
  $ZodULID: () => $ZodULID,
  $ZodURL: () => $ZodURL,
  $ZodUUID: () => $ZodUUID,
  $ZodUndefined: () => $ZodUndefined,
  $ZodUnion: () => $ZodUnion,
  $ZodUnknown: () => $ZodUnknown,
  $ZodVoid: () => $ZodVoid,
  $ZodXID: () => $ZodXID,
  $ZodXor: () => $ZodXor,
  $brand: () => $brand,
  $constructor: () => $constructor,
  $input: () => $input,
  $output: () => $output,
  Doc: () => Doc,
  JSONSchema: () => json_schema_exports,
  JSONSchemaGenerator: () => JSONSchemaGenerator,
  NEVER: () => NEVER,
  TimePrecision: () => TimePrecision,
  _any: () => _any,
  _array: () => _array,
  _base64: () => _base64,
  _base64url: () => _base64url,
  _bigint: () => _bigint,
  _boolean: () => _boolean,
  _catch: () => _catch,
  _check: () => _check,
  _cidrv4: () => _cidrv4,
  _cidrv6: () => _cidrv6,
  _coercedBigint: () => _coercedBigint,
  _coercedBoolean: () => _coercedBoolean,
  _coercedDate: () => _coercedDate,
  _coercedNumber: () => _coercedNumber,
  _coercedString: () => _coercedString,
  _cuid: () => _cuid,
  _cuid2: () => _cuid2,
  _custom: () => _custom,
  _date: () => _date,
  _decode: () => _decode,
  _decodeAsync: () => _decodeAsync,
  _default: () => _default,
  _discriminatedUnion: () => _discriminatedUnion,
  _e164: () => _e164,
  _email: () => _email,
  _emoji: () => _emoji2,
  _encode: () => _encode,
  _encodeAsync: () => _encodeAsync,
  _endsWith: () => _endsWith,
  _enum: () => _enum,
  _file: () => _file,
  _float32: () => _float32,
  _float64: () => _float64,
  _gt: () => _gt,
  _gte: () => _gte,
  _guid: () => _guid,
  _includes: () => _includes,
  _int: () => _int,
  _int32: () => _int32,
  _int64: () => _int64,
  _intersection: () => _intersection,
  _ipv4: () => _ipv4,
  _ipv6: () => _ipv6,
  _isoDate: () => _isoDate,
  _isoDateTime: () => _isoDateTime,
  _isoDuration: () => _isoDuration,
  _isoTime: () => _isoTime,
  _jwt: () => _jwt,
  _ksuid: () => _ksuid,
  _lazy: () => _lazy,
  _length: () => _length,
  _literal: () => _literal,
  _lowercase: () => _lowercase,
  _lt: () => _lt,
  _lte: () => _lte,
  _mac: () => _mac,
  _map: () => _map,
  _max: () => _lte,
  _maxLength: () => _maxLength,
  _maxSize: () => _maxSize,
  _mime: () => _mime,
  _min: () => _gte,
  _minLength: () => _minLength,
  _minSize: () => _minSize,
  _multipleOf: () => _multipleOf,
  _nan: () => _nan,
  _nanoid: () => _nanoid,
  _nativeEnum: () => _nativeEnum,
  _negative: () => _negative,
  _never: () => _never,
  _nonnegative: () => _nonnegative,
  _nonoptional: () => _nonoptional,
  _nonpositive: () => _nonpositive,
  _normalize: () => _normalize,
  _null: () => _null2,
  _nullable: () => _nullable,
  _number: () => _number,
  _optional: () => _optional,
  _overwrite: () => _overwrite,
  _parse: () => _parse,
  _parseAsync: () => _parseAsync,
  _pipe: () => _pipe,
  _positive: () => _positive,
  _promise: () => _promise,
  _property: () => _property,
  _readonly: () => _readonly,
  _record: () => _record,
  _refine: () => _refine,
  _regex: () => _regex,
  _safeDecode: () => _safeDecode,
  _safeDecodeAsync: () => _safeDecodeAsync,
  _safeEncode: () => _safeEncode,
  _safeEncodeAsync: () => _safeEncodeAsync,
  _safeParse: () => _safeParse,
  _safeParseAsync: () => _safeParseAsync,
  _set: () => _set,
  _size: () => _size,
  _slugify: () => _slugify,
  _startsWith: () => _startsWith,
  _string: () => _string,
  _stringFormat: () => _stringFormat,
  _stringbool: () => _stringbool,
  _success: () => _success,
  _superRefine: () => _superRefine,
  _symbol: () => _symbol,
  _templateLiteral: () => _templateLiteral,
  _toLowerCase: () => _toLowerCase,
  _toUpperCase: () => _toUpperCase,
  _transform: () => _transform,
  _trim: () => _trim,
  _tuple: () => _tuple,
  _uint32: () => _uint32,
  _uint64: () => _uint64,
  _ulid: () => _ulid,
  _undefined: () => _undefined2,
  _union: () => _union,
  _unknown: () => _unknown,
  _uppercase: () => _uppercase,
  _url: () => _url,
  _uuid: () => _uuid,
  _uuidv4: () => _uuidv4,
  _uuidv6: () => _uuidv6,
  _uuidv7: () => _uuidv7,
  _void: () => _void,
  _xid: () => _xid,
  _xor: () => _xor,
  clone: () => clone,
  config: () => config,
  createStandardJSONSchemaMethod: () => createStandardJSONSchemaMethod,
  createToJSONSchemaMethod: () => createToJSONSchemaMethod,
  decode: () => decode,
  decodeAsync: () => decodeAsync,
  describe: () => describe,
  encode: () => encode,
  encodeAsync: () => encodeAsync,
  extractDefs: () => extractDefs,
  finalize: () => finalize,
  flattenError: () => flattenError,
  formatError: () => formatError,
  globalConfig: () => globalConfig,
  globalRegistry: () => globalRegistry,
  initializeContext: () => initializeContext,
  isValidBase64: () => isValidBase64,
  isValidBase64URL: () => isValidBase64URL,
  isValidJWT: () => isValidJWT,
  locales: () => locales_exports,
  meta: () => meta,
  parse: () => parse,
  parseAsync: () => parseAsync,
  prettifyError: () => prettifyError,
  process: () => process2,
  regexes: () => regexes_exports,
  registry: () => registry,
  safeDecode: () => safeDecode,
  safeDecodeAsync: () => safeDecodeAsync,
  safeEncode: () => safeEncode,
  safeEncodeAsync: () => safeEncodeAsync,
  safeParse: () => safeParse,
  safeParseAsync: () => safeParseAsync,
  toDotPath: () => toDotPath,
  toJSONSchema: () => toJSONSchema,
  treeifyError: () => treeifyError,
  util: () => util_exports,
  version: () => version
});
var init_core2 = __esm({
  "node_modules/zod/v4/core/index.js"() {
    init_core();
    init_parse();
    init_errors();
    init_schemas();
    init_checks();
    init_versions();
    init_util2();
    init_regexes();
    init_locales();
    init_registries();
    init_doc();
    init_api();
    init_to_json_schema();
    init_json_schema_processors();
    init_json_schema_generator();
    init_json_schema();
  }
});

// node_modules/zod/v4/classic/checks.js
var checks_exports2 = {};
__export(checks_exports2, {
  endsWith: () => _endsWith,
  gt: () => _gt,
  gte: () => _gte,
  includes: () => _includes,
  length: () => _length,
  lowercase: () => _lowercase,
  lt: () => _lt,
  lte: () => _lte,
  maxLength: () => _maxLength,
  maxSize: () => _maxSize,
  mime: () => _mime,
  minLength: () => _minLength,
  minSize: () => _minSize,
  multipleOf: () => _multipleOf,
  negative: () => _negative,
  nonnegative: () => _nonnegative,
  nonpositive: () => _nonpositive,
  normalize: () => _normalize,
  overwrite: () => _overwrite,
  positive: () => _positive,
  property: () => _property,
  regex: () => _regex,
  size: () => _size,
  slugify: () => _slugify,
  startsWith: () => _startsWith,
  toLowerCase: () => _toLowerCase,
  toUpperCase: () => _toUpperCase,
  trim: () => _trim,
  uppercase: () => _uppercase
});
var init_checks2 = __esm({
  "node_modules/zod/v4/classic/checks.js"() {
    init_core2();
  }
});

// node_modules/zod/v4/classic/iso.js
var iso_exports = {};
__export(iso_exports, {
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  date: () => date2,
  datetime: () => datetime2,
  duration: () => duration2,
  time: () => time2
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
function date2(params) {
  return _isoDate(ZodISODate, params);
}
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}
var ZodISODateTime, ZodISODate, ZodISOTime, ZodISODuration;
var init_iso = __esm({
  "node_modules/zod/v4/classic/iso.js"() {
    init_core2();
    init_schemas2();
    ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
      $ZodISODateTime.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
      $ZodISODate.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
      $ZodISOTime.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
      $ZodISODuration.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
  }
});

// node_modules/zod/v4/classic/errors.js
var initializer2, ZodError, ZodRealError;
var init_errors2 = __esm({
  "node_modules/zod/v4/classic/errors.js"() {
    init_core2();
    init_core2();
    init_util2();
    initializer2 = (inst, issues) => {
      $ZodError.init(inst, issues);
      inst.name = "ZodError";
      Object.defineProperties(inst, {
        format: {
          value: (mapper) => formatError(inst, mapper)
          // enumerable: false,
        },
        flatten: {
          value: (mapper) => flattenError(inst, mapper)
          // enumerable: false,
        },
        addIssue: {
          value: (issue2) => {
            inst.issues.push(issue2);
            inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
          }
          // enumerable: false,
        },
        addIssues: {
          value: (issues2) => {
            inst.issues.push(...issues2);
            inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
          }
          // enumerable: false,
        },
        isEmpty: {
          get() {
            return inst.issues.length === 0;
          }
          // enumerable: false,
        }
      });
    };
    ZodError = /* @__PURE__ */ $constructor("ZodError", initializer2);
    ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
      Parent: Error
    });
  }
});

// node_modules/zod/v4/classic/parse.js
var parse2, parseAsync2, safeParse2, safeParseAsync2, encode2, decode2, encodeAsync2, decodeAsync2, safeEncode2, safeDecode2, safeEncodeAsync2, safeDecodeAsync2;
var init_parse2 = __esm({
  "node_modules/zod/v4/classic/parse.js"() {
    init_core2();
    init_errors2();
    parse2 = /* @__PURE__ */ _parse(ZodRealError);
    parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
    safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
    safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
    encode2 = /* @__PURE__ */ _encode(ZodRealError);
    decode2 = /* @__PURE__ */ _decode(ZodRealError);
    encodeAsync2 = /* @__PURE__ */ _encodeAsync(ZodRealError);
    decodeAsync2 = /* @__PURE__ */ _decodeAsync(ZodRealError);
    safeEncode2 = /* @__PURE__ */ _safeEncode(ZodRealError);
    safeDecode2 = /* @__PURE__ */ _safeDecode(ZodRealError);
    safeEncodeAsync2 = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
    safeDecodeAsync2 = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
  }
});

// node_modules/zod/v4/classic/schemas.js
var schemas_exports2 = {};
__export(schemas_exports2, {
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBase64: () => ZodBase64,
  ZodBase64URL: () => ZodBase64URL,
  ZodBigInt: () => ZodBigInt,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBoolean: () => ZodBoolean,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCUID: () => ZodCUID,
  ZodCUID2: () => ZodCUID2,
  ZodCatch: () => ZodCatch,
  ZodCodec: () => ZodCodec,
  ZodCustom: () => ZodCustom,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodE164: () => ZodE164,
  ZodEmail: () => ZodEmail,
  ZodEmoji: () => ZodEmoji,
  ZodEnum: () => ZodEnum,
  ZodExactOptional: () => ZodExactOptional,
  ZodFile: () => ZodFile,
  ZodFunction: () => ZodFunction,
  ZodGUID: () => ZodGUID,
  ZodIPv4: () => ZodIPv4,
  ZodIPv6: () => ZodIPv6,
  ZodIntersection: () => ZodIntersection,
  ZodJWT: () => ZodJWT,
  ZodKSUID: () => ZodKSUID,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMAC: () => ZodMAC,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNanoID: () => ZodNanoID,
  ZodNever: () => ZodNever,
  ZodNonOptional: () => ZodNonOptional,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodPipe: () => ZodPipe,
  ZodPrefault: () => ZodPrefault,
  ZodPreprocess: () => ZodPreprocess,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodStringFormat: () => ZodStringFormat,
  ZodSuccess: () => ZodSuccess,
  ZodSymbol: () => ZodSymbol,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodTransform: () => ZodTransform,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodULID: () => ZodULID,
  ZodURL: () => ZodURL,
  ZodUUID: () => ZodUUID,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  ZodXID: () => ZodXID,
  ZodXor: () => ZodXor,
  _ZodString: () => _ZodString,
  _default: () => _default2,
  _function: () => _function,
  any: () => any,
  array: () => array,
  base64: () => base642,
  base64url: () => base64url2,
  bigint: () => bigint2,
  boolean: () => boolean2,
  catch: () => _catch2,
  check: () => check,
  cidrv4: () => cidrv42,
  cidrv6: () => cidrv62,
  codec: () => codec,
  cuid: () => cuid3,
  cuid2: () => cuid22,
  custom: () => custom,
  date: () => date3,
  describe: () => describe2,
  discriminatedUnion: () => discriminatedUnion,
  e164: () => e1642,
  email: () => email2,
  emoji: () => emoji2,
  enum: () => _enum2,
  exactOptional: () => exactOptional,
  file: () => file,
  float32: () => float32,
  float64: () => float64,
  function: () => _function,
  guid: () => guid2,
  hash: () => hash,
  hex: () => hex2,
  hostname: () => hostname2,
  httpUrl: () => httpUrl,
  instanceof: () => _instanceof,
  int: () => int,
  int32: () => int32,
  int64: () => int64,
  intersection: () => intersection,
  invertCodec: () => invertCodec,
  ipv4: () => ipv42,
  ipv6: () => ipv62,
  json: () => json,
  jwt: () => jwt,
  keyof: () => keyof,
  ksuid: () => ksuid2,
  lazy: () => lazy,
  literal: () => literal,
  looseObject: () => looseObject,
  looseRecord: () => looseRecord,
  mac: () => mac2,
  map: () => map,
  meta: () => meta2,
  nan: () => nan,
  nanoid: () => nanoid2,
  nativeEnum: () => nativeEnum,
  never: () => never,
  nonoptional: () => nonoptional,
  null: () => _null3,
  nullable: () => nullable,
  nullish: () => nullish2,
  number: () => number2,
  object: () => object,
  optional: () => optional,
  partialRecord: () => partialRecord,
  pipe: () => pipe,
  prefault: () => prefault,
  preprocess: () => preprocess,
  promise: () => promise,
  readonly: () => readonly,
  record: () => record,
  refine: () => refine,
  set: () => set,
  strictObject: () => strictObject,
  string: () => string2,
  stringFormat: () => stringFormat,
  stringbool: () => stringbool,
  success: () => success,
  superRefine: () => superRefine,
  symbol: () => symbol,
  templateLiteral: () => templateLiteral,
  transform: () => transform,
  tuple: () => tuple,
  uint32: () => uint32,
  uint64: () => uint64,
  ulid: () => ulid2,
  undefined: () => _undefined3,
  union: () => union,
  unknown: () => unknown,
  url: () => url,
  uuid: () => uuid2,
  uuidv4: () => uuidv4,
  uuidv6: () => uuidv6,
  uuidv7: () => uuidv7,
  void: () => _void2,
  xid: () => xid2,
  xor: () => xor
});
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = /* @__PURE__ */ new Set();
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
function string2(params) {
  return _string(ZodString, params);
}
function email2(params) {
  return _email(ZodEmail, params);
}
function guid2(params) {
  return _guid(ZodGUID, params);
}
function uuid2(params) {
  return _uuid(ZodUUID, params);
}
function uuidv4(params) {
  return _uuidv4(ZodUUID, params);
}
function uuidv6(params) {
  return _uuidv6(ZodUUID, params);
}
function uuidv7(params) {
  return _uuidv7(ZodUUID, params);
}
function url(params) {
  return _url(ZodURL, params);
}
function httpUrl(params) {
  return _url(ZodURL, {
    protocol: regexes_exports.httpProtocol,
    hostname: regexes_exports.domain,
    ...util_exports.normalizeParams(params)
  });
}
function emoji2(params) {
  return _emoji2(ZodEmoji, params);
}
function nanoid2(params) {
  return _nanoid(ZodNanoID, params);
}
function cuid3(params) {
  return _cuid(ZodCUID, params);
}
function cuid22(params) {
  return _cuid2(ZodCUID2, params);
}
function ulid2(params) {
  return _ulid(ZodULID, params);
}
function xid2(params) {
  return _xid(ZodXID, params);
}
function ksuid2(params) {
  return _ksuid(ZodKSUID, params);
}
function ipv42(params) {
  return _ipv4(ZodIPv4, params);
}
function mac2(params) {
  return _mac(ZodMAC, params);
}
function ipv62(params) {
  return _ipv6(ZodIPv6, params);
}
function cidrv42(params) {
  return _cidrv4(ZodCIDRv4, params);
}
function cidrv62(params) {
  return _cidrv6(ZodCIDRv6, params);
}
function base642(params) {
  return _base64(ZodBase64, params);
}
function base64url2(params) {
  return _base64url(ZodBase64URL, params);
}
function e1642(params) {
  return _e164(ZodE164, params);
}
function jwt(params) {
  return _jwt(ZodJWT, params);
}
function stringFormat(format, fnOrRegex, _params = {}) {
  return _stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
function hostname2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hostname", regexes_exports.hostname, _params);
}
function hex2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hex", regexes_exports.hex, _params);
}
function hash(alg, params) {
  const enc = params?.enc ?? "hex";
  const format = `${alg}_${enc}`;
  const regex = regexes_exports[format];
  if (!regex)
    throw new Error(`Unrecognized hash format: ${format}`);
  return _stringFormat(ZodCustomStringFormat, format, regex, params);
}
function number2(params) {
  return _number(ZodNumber, params);
}
function int(params) {
  return _int(ZodNumberFormat, params);
}
function float32(params) {
  return _float32(ZodNumberFormat, params);
}
function float64(params) {
  return _float64(ZodNumberFormat, params);
}
function int32(params) {
  return _int32(ZodNumberFormat, params);
}
function uint32(params) {
  return _uint32(ZodNumberFormat, params);
}
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
function bigint2(params) {
  return _bigint(ZodBigInt, params);
}
function int64(params) {
  return _int64(ZodBigIntFormat, params);
}
function uint64(params) {
  return _uint64(ZodBigIntFormat, params);
}
function symbol(params) {
  return _symbol(ZodSymbol, params);
}
function _undefined3(params) {
  return _undefined2(ZodUndefined, params);
}
function _null3(params) {
  return _null2(ZodNull, params);
}
function any() {
  return _any(ZodAny);
}
function unknown() {
  return _unknown(ZodUnknown);
}
function never(params) {
  return _never(ZodNever, params);
}
function _void2(params) {
  return _void(ZodVoid, params);
}
function date3(params) {
  return _date(ZodDate, params);
}
function array(element, params) {
  return _array(ZodArray, element, params);
}
function keyof(schema) {
  const shape = schema._zod.def.shape;
  return _enum2(Object.keys(shape));
}
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...util_exports.normalizeParams(params)
  };
  return new ZodObject(def);
}
function strictObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: never(),
    ...util_exports.normalizeParams(params)
  });
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: unknown(),
    ...util_exports.normalizeParams(params)
  });
}
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...util_exports.normalizeParams(params)
  });
}
function xor(options, params) {
  return new ZodXor({
    type: "union",
    options,
    inclusive: false,
    ...util_exports.normalizeParams(params)
  });
}
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...util_exports.normalizeParams(params)
  });
}
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...util_exports.normalizeParams(params)
  });
}
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...util_exports.normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function partialRecord(keyType, valueType, params) {
  const k = clone(keyType);
  k._zod.values = void 0;
  return new ZodRecord({
    type: "record",
    keyType: k,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function looseRecord(keyType, valueType, params) {
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    mode: "loose",
    ...util_exports.normalizeParams(params)
  });
}
function map(keyType, valueType, params) {
  return new ZodMap({
    type: "map",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function set(valueType, params) {
  return new ZodSet({
    type: "set",
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function _enum2(values, params) {
  const entries2 = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries: entries2,
    ...util_exports.normalizeParams(params)
  });
}
function nativeEnum(entries2, params) {
  return new ZodEnum({
    type: "enum",
    entries: entries2,
    ...util_exports.normalizeParams(params)
  });
}
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...util_exports.normalizeParams(params)
  });
}
function file(params) {
  return _file(ZodFile, params);
}
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
function nullish2(innerType) {
  return optional(nullable(innerType));
}
function _default2(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : util_exports.shallowClone(defaultValue);
    }
  });
}
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : util_exports.shallowClone(defaultValue);
    }
  });
}
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...util_exports.normalizeParams(params)
  });
}
function success(innerType) {
  return new ZodSuccess({
    type: "success",
    innerType
  });
}
function _catch2(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
function nan(params) {
  return _nan(ZodNaN, params);
}
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
function codec(in_, out, params) {
  return new ZodCodec({
    type: "pipe",
    in: in_,
    out,
    transform: params.decode,
    reverseTransform: params.encode
  });
}
function invertCodec(codec2) {
  const def = codec2._zod.def;
  return new ZodCodec({
    type: "pipe",
    in: def.out,
    out: def.in,
    transform: def.reverseTransform,
    reverseTransform: def.transform
  });
}
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
function templateLiteral(parts, params) {
  return new ZodTemplateLiteral({
    type: "template_literal",
    parts,
    ...util_exports.normalizeParams(params)
  });
}
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
function promise(innerType) {
  return new ZodPromise({
    type: "promise",
    innerType
  });
}
function _function(params) {
  return new ZodFunction({
    type: "function",
    input: Array.isArray(params?.input) ? tuple(params?.input) : params?.input ?? array(unknown()),
    output: params?.output ?? unknown()
  });
}
function check(fn) {
  const ch = new $ZodCheck({
    check: "custom"
    // ...util.normalizeParams(params),
  });
  ch._zod.check = fn;
  return ch;
}
function custom(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
function _instanceof(cls, params = {}) {
  const inst = new ZodCustom({
    type: "custom",
    check: "custom",
    fn: (data) => data instanceof cls,
    abort: true,
    ...util_exports.normalizeParams(params)
  });
  inst._zod.bag.Class = cls;
  inst._zod.check = (payload) => {
    if (!(payload.value instanceof cls)) {
      payload.issues.push({
        code: "invalid_type",
        expected: cls.name,
        input: payload.value,
        inst,
        path: [...inst._zod.def.path ?? []]
      });
    }
  };
  return inst;
}
function json(params) {
  const jsonSchema = lazy(() => {
    return union([string2(params), number2(), boolean2(), _null3(), array(jsonSchema), record(string2(), jsonSchema)]);
  });
  return jsonSchema;
}
function preprocess(fn, schema) {
  return new ZodPreprocess({
    type: "pipe",
    in: transform(fn),
    out: schema
  });
}
var _installedGroups, ZodType, _ZodString, ZodString, ZodStringFormat, ZodEmail, ZodGUID, ZodUUID, ZodURL, ZodEmoji, ZodNanoID, ZodCUID, ZodCUID2, ZodULID, ZodXID, ZodKSUID, ZodIPv4, ZodMAC, ZodIPv6, ZodCIDRv4, ZodCIDRv6, ZodBase64, ZodBase64URL, ZodE164, ZodJWT, ZodCustomStringFormat, ZodNumber, ZodNumberFormat, ZodBoolean, ZodBigInt, ZodBigIntFormat, ZodSymbol, ZodUndefined, ZodNull, ZodAny, ZodUnknown, ZodNever, ZodVoid, ZodDate, ZodArray, ZodObject, ZodUnion, ZodXor, ZodDiscriminatedUnion, ZodIntersection, ZodTuple, ZodRecord, ZodMap, ZodSet, ZodEnum, ZodLiteral, ZodFile, ZodTransform, ZodOptional, ZodExactOptional, ZodNullable, ZodDefault, ZodPrefault, ZodNonOptional, ZodSuccess, ZodCatch, ZodNaN, ZodPipe, ZodCodec, ZodPreprocess, ZodReadonly, ZodTemplateLiteral, ZodLazy, ZodPromise, ZodFunction, ZodCustom, describe2, meta2, stringbool;
var init_schemas2 = __esm({
  "node_modules/zod/v4/classic/schemas.js"() {
    init_core2();
    init_core2();
    init_json_schema_processors();
    init_to_json_schema();
    init_checks2();
    init_iso();
    init_parse2();
    _installedGroups = /* @__PURE__ */ new WeakMap();
    ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
      $ZodType.init(inst, def);
      Object.assign(inst["~standard"], {
        jsonSchema: {
          input: createStandardJSONSchemaMethod(inst, "input"),
          output: createStandardJSONSchemaMethod(inst, "output")
        }
      });
      inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
      inst.def = def;
      inst.type = def.type;
      Object.defineProperty(inst, "_def", { value: def });
      inst.parse = (data, params) => parse2(inst, data, params, { callee: inst.parse });
      inst.safeParse = (data, params) => safeParse2(inst, data, params);
      inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
      inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
      inst.spa = inst.safeParseAsync;
      inst.encode = (data, params) => encode2(inst, data, params);
      inst.decode = (data, params) => decode2(inst, data, params);
      inst.encodeAsync = async (data, params) => encodeAsync2(inst, data, params);
      inst.decodeAsync = async (data, params) => decodeAsync2(inst, data, params);
      inst.safeEncode = (data, params) => safeEncode2(inst, data, params);
      inst.safeDecode = (data, params) => safeDecode2(inst, data, params);
      inst.safeEncodeAsync = async (data, params) => safeEncodeAsync2(inst, data, params);
      inst.safeDecodeAsync = async (data, params) => safeDecodeAsync2(inst, data, params);
      _installLazyMethods(inst, "ZodType", {
        check(...chks) {
          const def2 = this.def;
          return this.clone(util_exports.mergeDefs(def2, {
            checks: [
              ...def2.checks ?? [],
              ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
            ]
          }), { parent: true });
        },
        with(...chks) {
          return this.check(...chks);
        },
        clone(def2, params) {
          return clone(this, def2, params);
        },
        brand() {
          return this;
        },
        register(reg, meta3) {
          reg.add(this, meta3);
          return this;
        },
        refine(check2, params) {
          return this.check(refine(check2, params));
        },
        superRefine(refinement, params) {
          return this.check(superRefine(refinement, params));
        },
        overwrite(fn) {
          return this.check(_overwrite(fn));
        },
        optional() {
          return optional(this);
        },
        exactOptional() {
          return exactOptional(this);
        },
        nullable() {
          return nullable(this);
        },
        nullish() {
          return optional(nullable(this));
        },
        nonoptional(params) {
          return nonoptional(this, params);
        },
        array() {
          return array(this);
        },
        or(arg) {
          return union([this, arg]);
        },
        and(arg) {
          return intersection(this, arg);
        },
        transform(tx) {
          return pipe(this, transform(tx));
        },
        default(d) {
          return _default2(this, d);
        },
        prefault(d) {
          return prefault(this, d);
        },
        catch(params) {
          return _catch2(this, params);
        },
        pipe(target) {
          return pipe(this, target);
        },
        readonly() {
          return readonly(this);
        },
        describe(description) {
          const cl = this.clone();
          globalRegistry.add(cl, { description });
          return cl;
        },
        meta(...args) {
          if (args.length === 0)
            return globalRegistry.get(this);
          const cl = this.clone();
          globalRegistry.add(cl, args[0]);
          return cl;
        },
        isOptional() {
          return this.safeParse(void 0).success;
        },
        isNullable() {
          return this.safeParse(null).success;
        },
        apply(fn) {
          return fn(this);
        }
      });
      Object.defineProperty(inst, "description", {
        get() {
          return globalRegistry.get(inst)?.description;
        },
        configurable: true
      });
      return inst;
    });
    _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
      $ZodString.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => stringProcessor(inst, ctx, json2, params);
      const bag = inst._zod.bag;
      inst.format = bag.format ?? null;
      inst.minLength = bag.minimum ?? null;
      inst.maxLength = bag.maximum ?? null;
      _installLazyMethods(inst, "_ZodString", {
        regex(...args) {
          return this.check(_regex(...args));
        },
        includes(...args) {
          return this.check(_includes(...args));
        },
        startsWith(...args) {
          return this.check(_startsWith(...args));
        },
        endsWith(...args) {
          return this.check(_endsWith(...args));
        },
        min(...args) {
          return this.check(_minLength(...args));
        },
        max(...args) {
          return this.check(_maxLength(...args));
        },
        length(...args) {
          return this.check(_length(...args));
        },
        nonempty(...args) {
          return this.check(_minLength(1, ...args));
        },
        lowercase(params) {
          return this.check(_lowercase(params));
        },
        uppercase(params) {
          return this.check(_uppercase(params));
        },
        trim() {
          return this.check(_trim());
        },
        normalize(...args) {
          return this.check(_normalize(...args));
        },
        toLowerCase() {
          return this.check(_toLowerCase());
        },
        toUpperCase() {
          return this.check(_toUpperCase());
        },
        slugify() {
          return this.check(_slugify());
        }
      });
    });
    ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
      $ZodString.init(inst, def);
      _ZodString.init(inst, def);
      inst.email = (params) => inst.check(_email(ZodEmail, params));
      inst.url = (params) => inst.check(_url(ZodURL, params));
      inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
      inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
      inst.guid = (params) => inst.check(_guid(ZodGUID, params));
      inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
      inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
      inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
      inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
      inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
      inst.guid = (params) => inst.check(_guid(ZodGUID, params));
      inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
      inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
      inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
      inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
      inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
      inst.xid = (params) => inst.check(_xid(ZodXID, params));
      inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
      inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
      inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
      inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
      inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
      inst.e164 = (params) => inst.check(_e164(ZodE164, params));
      inst.datetime = (params) => inst.check(datetime2(params));
      inst.date = (params) => inst.check(date2(params));
      inst.time = (params) => inst.check(time2(params));
      inst.duration = (params) => inst.check(duration2(params));
    });
    ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
      $ZodStringFormat.init(inst, def);
      _ZodString.init(inst, def);
    });
    ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
      $ZodEmail.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
      $ZodGUID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
      $ZodUUID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
      $ZodURL.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
      $ZodEmoji.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
      $ZodNanoID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
      $ZodCUID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
      $ZodCUID2.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
      $ZodULID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
      $ZodXID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
      $ZodKSUID.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
      $ZodIPv4.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodMAC = /* @__PURE__ */ $constructor("ZodMAC", (inst, def) => {
      $ZodMAC.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
      $ZodIPv6.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
      $ZodCIDRv4.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
      $ZodCIDRv6.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
      $ZodBase64.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
      $ZodBase64URL.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
      $ZodE164.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
      $ZodJWT.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodCustomStringFormat = /* @__PURE__ */ $constructor("ZodCustomStringFormat", (inst, def) => {
      $ZodCustomStringFormat.init(inst, def);
      ZodStringFormat.init(inst, def);
    });
    ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
      $ZodNumber.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => numberProcessor(inst, ctx, json2, params);
      _installLazyMethods(inst, "ZodNumber", {
        gt(value, params) {
          return this.check(_gt(value, params));
        },
        gte(value, params) {
          return this.check(_gte(value, params));
        },
        min(value, params) {
          return this.check(_gte(value, params));
        },
        lt(value, params) {
          return this.check(_lt(value, params));
        },
        lte(value, params) {
          return this.check(_lte(value, params));
        },
        max(value, params) {
          return this.check(_lte(value, params));
        },
        int(params) {
          return this.check(int(params));
        },
        safe(params) {
          return this.check(int(params));
        },
        positive(params) {
          return this.check(_gt(0, params));
        },
        nonnegative(params) {
          return this.check(_gte(0, params));
        },
        negative(params) {
          return this.check(_lt(0, params));
        },
        nonpositive(params) {
          return this.check(_lte(0, params));
        },
        multipleOf(value, params) {
          return this.check(_multipleOf(value, params));
        },
        step(value, params) {
          return this.check(_multipleOf(value, params));
        },
        finite() {
          return this;
        }
      });
      const bag = inst._zod.bag;
      inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
      inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
      inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
      inst.isFinite = true;
      inst.format = bag.format ?? null;
    });
    ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
      $ZodNumberFormat.init(inst, def);
      ZodNumber.init(inst, def);
    });
    ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
      $ZodBoolean.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => booleanProcessor(inst, ctx, json2, params);
    });
    ZodBigInt = /* @__PURE__ */ $constructor("ZodBigInt", (inst, def) => {
      $ZodBigInt.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => bigintProcessor(inst, ctx, json2, params);
      inst.gte = (value, params) => inst.check(_gte(value, params));
      inst.min = (value, params) => inst.check(_gte(value, params));
      inst.gt = (value, params) => inst.check(_gt(value, params));
      inst.gte = (value, params) => inst.check(_gte(value, params));
      inst.min = (value, params) => inst.check(_gte(value, params));
      inst.lt = (value, params) => inst.check(_lt(value, params));
      inst.lte = (value, params) => inst.check(_lte(value, params));
      inst.max = (value, params) => inst.check(_lte(value, params));
      inst.positive = (params) => inst.check(_gt(BigInt(0), params));
      inst.negative = (params) => inst.check(_lt(BigInt(0), params));
      inst.nonpositive = (params) => inst.check(_lte(BigInt(0), params));
      inst.nonnegative = (params) => inst.check(_gte(BigInt(0), params));
      inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
      const bag = inst._zod.bag;
      inst.minValue = bag.minimum ?? null;
      inst.maxValue = bag.maximum ?? null;
      inst.format = bag.format ?? null;
    });
    ZodBigIntFormat = /* @__PURE__ */ $constructor("ZodBigIntFormat", (inst, def) => {
      $ZodBigIntFormat.init(inst, def);
      ZodBigInt.init(inst, def);
    });
    ZodSymbol = /* @__PURE__ */ $constructor("ZodSymbol", (inst, def) => {
      $ZodSymbol.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => symbolProcessor(inst, ctx, json2, params);
    });
    ZodUndefined = /* @__PURE__ */ $constructor("ZodUndefined", (inst, def) => {
      $ZodUndefined.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => undefinedProcessor(inst, ctx, json2, params);
    });
    ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
      $ZodNull.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => nullProcessor(inst, ctx, json2, params);
    });
    ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
      $ZodAny.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => anyProcessor(inst, ctx, json2, params);
    });
    ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
      $ZodUnknown.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => unknownProcessor(inst, ctx, json2, params);
    });
    ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
      $ZodNever.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => neverProcessor(inst, ctx, json2, params);
    });
    ZodVoid = /* @__PURE__ */ $constructor("ZodVoid", (inst, def) => {
      $ZodVoid.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => voidProcessor(inst, ctx, json2, params);
    });
    ZodDate = /* @__PURE__ */ $constructor("ZodDate", (inst, def) => {
      $ZodDate.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => dateProcessor(inst, ctx, json2, params);
      inst.min = (value, params) => inst.check(_gte(value, params));
      inst.max = (value, params) => inst.check(_lte(value, params));
      const c = inst._zod.bag;
      inst.minDate = c.minimum ? new Date(c.minimum) : null;
      inst.maxDate = c.maximum ? new Date(c.maximum) : null;
    });
    ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
      $ZodArray.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => arrayProcessor(inst, ctx, json2, params);
      inst.element = def.element;
      _installLazyMethods(inst, "ZodArray", {
        min(n, params) {
          return this.check(_minLength(n, params));
        },
        nonempty(params) {
          return this.check(_minLength(1, params));
        },
        max(n, params) {
          return this.check(_maxLength(n, params));
        },
        length(n, params) {
          return this.check(_length(n, params));
        },
        unwrap() {
          return this.element;
        }
      });
    });
    ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
      $ZodObjectJIT.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => objectProcessor(inst, ctx, json2, params);
      util_exports.defineLazy(inst, "shape", () => {
        return def.shape;
      });
      _installLazyMethods(inst, "ZodObject", {
        keyof() {
          return _enum2(Object.keys(this._zod.def.shape));
        },
        catchall(catchall) {
          return this.clone({ ...this._zod.def, catchall });
        },
        passthrough() {
          return this.clone({ ...this._zod.def, catchall: unknown() });
        },
        loose() {
          return this.clone({ ...this._zod.def, catchall: unknown() });
        },
        strict() {
          return this.clone({ ...this._zod.def, catchall: never() });
        },
        strip() {
          return this.clone({ ...this._zod.def, catchall: void 0 });
        },
        extend(incoming) {
          return util_exports.extend(this, incoming);
        },
        safeExtend(incoming) {
          return util_exports.safeExtend(this, incoming);
        },
        merge(other) {
          return util_exports.merge(this, other);
        },
        pick(mask) {
          return util_exports.pick(this, mask);
        },
        omit(mask) {
          return util_exports.omit(this, mask);
        },
        partial(...args) {
          return util_exports.partial(ZodOptional, this, args[0]);
        },
        required(...args) {
          return util_exports.required(ZodNonOptional, this, args[0]);
        }
      });
    });
    ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
      $ZodUnion.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => unionProcessor(inst, ctx, json2, params);
      inst.options = def.options;
    });
    ZodXor = /* @__PURE__ */ $constructor("ZodXor", (inst, def) => {
      ZodUnion.init(inst, def);
      $ZodXor.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => unionProcessor(inst, ctx, json2, params);
      inst.options = def.options;
    });
    ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
      ZodUnion.init(inst, def);
      $ZodDiscriminatedUnion.init(inst, def);
    });
    ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
      $ZodIntersection.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => intersectionProcessor(inst, ctx, json2, params);
    });
    ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
      $ZodTuple.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => tupleProcessor(inst, ctx, json2, params);
      inst.rest = (rest) => inst.clone({
        ...inst._zod.def,
        rest
      });
    });
    ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
      $ZodRecord.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => recordProcessor(inst, ctx, json2, params);
      inst.keyType = def.keyType;
      inst.valueType = def.valueType;
    });
    ZodMap = /* @__PURE__ */ $constructor("ZodMap", (inst, def) => {
      $ZodMap.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => mapProcessor(inst, ctx, json2, params);
      inst.keyType = def.keyType;
      inst.valueType = def.valueType;
      inst.min = (...args) => inst.check(_minSize(...args));
      inst.nonempty = (params) => inst.check(_minSize(1, params));
      inst.max = (...args) => inst.check(_maxSize(...args));
      inst.size = (...args) => inst.check(_size(...args));
    });
    ZodSet = /* @__PURE__ */ $constructor("ZodSet", (inst, def) => {
      $ZodSet.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => setProcessor(inst, ctx, json2, params);
      inst.min = (...args) => inst.check(_minSize(...args));
      inst.nonempty = (params) => inst.check(_minSize(1, params));
      inst.max = (...args) => inst.check(_maxSize(...args));
      inst.size = (...args) => inst.check(_size(...args));
    });
    ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
      $ZodEnum.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => enumProcessor(inst, ctx, json2, params);
      inst.enum = def.entries;
      inst.options = Object.values(def.entries);
      const keys = new Set(Object.keys(def.entries));
      inst.extract = (values, params) => {
        const newEntries = {};
        for (const value of values) {
          if (keys.has(value)) {
            newEntries[value] = def.entries[value];
          } else
            throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
          ...def,
          checks: [],
          ...util_exports.normalizeParams(params),
          entries: newEntries
        });
      };
      inst.exclude = (values, params) => {
        const newEntries = { ...def.entries };
        for (const value of values) {
          if (keys.has(value)) {
            delete newEntries[value];
          } else
            throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
          ...def,
          checks: [],
          ...util_exports.normalizeParams(params),
          entries: newEntries
        });
      };
    });
    ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
      $ZodLiteral.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => literalProcessor(inst, ctx, json2, params);
      inst.values = new Set(def.values);
      Object.defineProperty(inst, "value", {
        get() {
          if (def.values.length > 1) {
            throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
          }
          return def.values[0];
        }
      });
    });
    ZodFile = /* @__PURE__ */ $constructor("ZodFile", (inst, def) => {
      $ZodFile.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => fileProcessor(inst, ctx, json2, params);
      inst.min = (size, params) => inst.check(_minSize(size, params));
      inst.max = (size, params) => inst.check(_maxSize(size, params));
      inst.mime = (types, params) => inst.check(_mime(Array.isArray(types) ? types : [types], params));
    });
    ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
      $ZodTransform.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => transformProcessor(inst, ctx, json2, params);
      inst._zod.parse = (payload, _ctx) => {
        if (_ctx.direction === "backward") {
          throw new $ZodEncodeError(inst.constructor.name);
        }
        payload.addIssue = (issue2) => {
          if (typeof issue2 === "string") {
            payload.issues.push(util_exports.issue(issue2, payload.value, def));
          } else {
            const _issue = issue2;
            if (_issue.fatal)
              _issue.continue = false;
            _issue.code ?? (_issue.code = "custom");
            _issue.input ?? (_issue.input = payload.value);
            _issue.inst ?? (_issue.inst = inst);
            payload.issues.push(util_exports.issue(_issue));
          }
        };
        const output = def.transform(payload.value, payload);
        if (output instanceof Promise) {
          return output.then((output2) => {
            payload.value = output2;
            payload.fallback = true;
            return payload;
          });
        }
        payload.value = output;
        payload.fallback = true;
        return payload;
      };
    });
    ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
      $ZodOptional.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
      $ZodExactOptional.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
      $ZodNullable.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => nullableProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
      $ZodDefault.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => defaultProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
      inst.removeDefault = inst.unwrap;
    });
    ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
      $ZodPrefault.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => prefaultProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
      $ZodNonOptional.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => nonoptionalProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodSuccess = /* @__PURE__ */ $constructor("ZodSuccess", (inst, def) => {
      $ZodSuccess.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => successProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
      $ZodCatch.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => catchProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
      inst.removeCatch = inst.unwrap;
    });
    ZodNaN = /* @__PURE__ */ $constructor("ZodNaN", (inst, def) => {
      $ZodNaN.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => nanProcessor(inst, ctx, json2, params);
    });
    ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
      $ZodPipe.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => pipeProcessor(inst, ctx, json2, params);
      inst.in = def.in;
      inst.out = def.out;
    });
    ZodCodec = /* @__PURE__ */ $constructor("ZodCodec", (inst, def) => {
      ZodPipe.init(inst, def);
      $ZodCodec.init(inst, def);
    });
    ZodPreprocess = /* @__PURE__ */ $constructor("ZodPreprocess", (inst, def) => {
      ZodPipe.init(inst, def);
      $ZodPreprocess.init(inst, def);
    });
    ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
      $ZodReadonly.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => readonlyProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodTemplateLiteral = /* @__PURE__ */ $constructor("ZodTemplateLiteral", (inst, def) => {
      $ZodTemplateLiteral.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => templateLiteralProcessor(inst, ctx, json2, params);
    });
    ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
      $ZodLazy.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => lazyProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.getter();
    });
    ZodPromise = /* @__PURE__ */ $constructor("ZodPromise", (inst, def) => {
      $ZodPromise.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => promiseProcessor(inst, ctx, json2, params);
      inst.unwrap = () => inst._zod.def.innerType;
    });
    ZodFunction = /* @__PURE__ */ $constructor("ZodFunction", (inst, def) => {
      $ZodFunction.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => functionProcessor(inst, ctx, json2, params);
    });
    ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
      $ZodCustom.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json2, params) => customProcessor(inst, ctx, json2, params);
    });
    describe2 = describe;
    meta2 = meta;
    stringbool = (...args) => _stringbool({
      Codec: ZodCodec,
      Boolean: ZodBoolean,
      String: ZodString
    }, ...args);
  }
});

// node_modules/zod/v4/classic/compat.js
function setErrorMap(map2) {
  config({
    customError: map2
  });
}
function getErrorMap() {
  return config().customError;
}
var ZodIssueCode, ZodFirstPartyTypeKind;
var init_compat = __esm({
  "node_modules/zod/v4/classic/compat.js"() {
    init_core2();
    ZodIssueCode = {
      invalid_type: "invalid_type",
      too_big: "too_big",
      too_small: "too_small",
      invalid_format: "invalid_format",
      not_multiple_of: "not_multiple_of",
      unrecognized_keys: "unrecognized_keys",
      invalid_union: "invalid_union",
      invalid_key: "invalid_key",
      invalid_element: "invalid_element",
      invalid_value: "invalid_value",
      custom: "custom"
    };
    /* @__PURE__ */ (function(ZodFirstPartyTypeKind2) {
    })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  }
});

// node_modules/zod/v4/classic/from-json-schema.js
function detectVersion(schema, defaultTarget) {
  const $schema = schema.$schema;
  if ($schema === "https://json-schema.org/draft/2020-12/schema") {
    return "draft-2020-12";
  }
  if ($schema === "http://json-schema.org/draft-07/schema#") {
    return "draft-7";
  }
  if ($schema === "http://json-schema.org/draft-04/schema#") {
    return "draft-4";
  }
  return defaultTarget ?? "draft-2020-12";
}
function resolveRef(ref, ctx) {
  if (!ref.startsWith("#")) {
    throw new Error("External $ref is not supported, only local refs (#/...) are allowed");
  }
  const path = ref.slice(1).split("/").filter(Boolean);
  if (path.length === 0) {
    return ctx.rootSchema;
  }
  const defsKey = ctx.version === "draft-2020-12" ? "$defs" : "definitions";
  if (path[0] === defsKey) {
    const key = path[1];
    if (!key || !ctx.defs[key]) {
      throw new Error(`Reference not found: ${ref}`);
    }
    return ctx.defs[key];
  }
  throw new Error(`Reference not found: ${ref}`);
}
function convertBaseSchema(schema, ctx) {
  if (schema.not !== void 0) {
    if (typeof schema.not === "object" && Object.keys(schema.not).length === 0) {
      return z.never();
    }
    throw new Error("not is not supported in Zod (except { not: {} } for never)");
  }
  if (schema.unevaluatedItems !== void 0) {
    throw new Error("unevaluatedItems is not supported");
  }
  if (schema.unevaluatedProperties !== void 0) {
    throw new Error("unevaluatedProperties is not supported");
  }
  if (schema.if !== void 0 || schema.then !== void 0 || schema.else !== void 0) {
    throw new Error("Conditional schemas (if/then/else) are not supported");
  }
  if (schema.dependentSchemas !== void 0 || schema.dependentRequired !== void 0) {
    throw new Error("dependentSchemas and dependentRequired are not supported");
  }
  if (schema.$ref) {
    const refPath = schema.$ref;
    if (ctx.refs.has(refPath)) {
      return ctx.refs.get(refPath);
    }
    if (ctx.processing.has(refPath)) {
      return z.lazy(() => {
        if (!ctx.refs.has(refPath)) {
          throw new Error(`Circular reference not resolved: ${refPath}`);
        }
        return ctx.refs.get(refPath);
      });
    }
    ctx.processing.add(refPath);
    const resolved = resolveRef(refPath, ctx);
    const zodSchema2 = convertSchema(resolved, ctx);
    ctx.refs.set(refPath, zodSchema2);
    ctx.processing.delete(refPath);
    return zodSchema2;
  }
  if (schema.enum !== void 0) {
    const enumValues = schema.enum;
    if (ctx.version === "openapi-3.0" && schema.nullable === true && enumValues.length === 1 && enumValues[0] === null) {
      return z.null();
    }
    if (enumValues.length === 0) {
      return z.never();
    }
    if (enumValues.length === 1) {
      return z.literal(enumValues[0]);
    }
    if (enumValues.every((v) => typeof v === "string")) {
      return z.enum(enumValues);
    }
    const literalSchemas = enumValues.map((v) => z.literal(v));
    if (literalSchemas.length < 2) {
      return literalSchemas[0];
    }
    return z.union([literalSchemas[0], literalSchemas[1], ...literalSchemas.slice(2)]);
  }
  if (schema.const !== void 0) {
    return z.literal(schema.const);
  }
  const type = schema.type;
  if (Array.isArray(type)) {
    const typeSchemas = type.map((t) => {
      const typeSchema = { ...schema, type: t };
      return convertBaseSchema(typeSchema, ctx);
    });
    if (typeSchemas.length === 0) {
      return z.never();
    }
    if (typeSchemas.length === 1) {
      return typeSchemas[0];
    }
    return z.union(typeSchemas);
  }
  if (!type) {
    return z.any();
  }
  let zodSchema;
  switch (type) {
    case "string": {
      let stringSchema = z.string();
      if (schema.format) {
        const format = schema.format;
        if (format === "email") {
          stringSchema = stringSchema.check(z.email());
        } else if (format === "uri" || format === "uri-reference") {
          stringSchema = stringSchema.check(z.url());
        } else if (format === "uuid" || format === "guid") {
          stringSchema = stringSchema.check(z.uuid());
        } else if (format === "date-time") {
          stringSchema = stringSchema.check(z.iso.datetime());
        } else if (format === "date") {
          stringSchema = stringSchema.check(z.iso.date());
        } else if (format === "time") {
          stringSchema = stringSchema.check(z.iso.time());
        } else if (format === "duration") {
          stringSchema = stringSchema.check(z.iso.duration());
        } else if (format === "ipv4") {
          stringSchema = stringSchema.check(z.ipv4());
        } else if (format === "ipv6") {
          stringSchema = stringSchema.check(z.ipv6());
        } else if (format === "mac") {
          stringSchema = stringSchema.check(z.mac());
        } else if (format === "cidr") {
          stringSchema = stringSchema.check(z.cidrv4());
        } else if (format === "cidr-v6") {
          stringSchema = stringSchema.check(z.cidrv6());
        } else if (format === "base64") {
          stringSchema = stringSchema.check(z.base64());
        } else if (format === "base64url") {
          stringSchema = stringSchema.check(z.base64url());
        } else if (format === "e164") {
          stringSchema = stringSchema.check(z.e164());
        } else if (format === "jwt") {
          stringSchema = stringSchema.check(z.jwt());
        } else if (format === "emoji") {
          stringSchema = stringSchema.check(z.emoji());
        } else if (format === "nanoid") {
          stringSchema = stringSchema.check(z.nanoid());
        } else if (format === "cuid") {
          stringSchema = stringSchema.check(z.cuid());
        } else if (format === "cuid2") {
          stringSchema = stringSchema.check(z.cuid2());
        } else if (format === "ulid") {
          stringSchema = stringSchema.check(z.ulid());
        } else if (format === "xid") {
          stringSchema = stringSchema.check(z.xid());
        } else if (format === "ksuid") {
          stringSchema = stringSchema.check(z.ksuid());
        }
      }
      if (typeof schema.minLength === "number") {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (typeof schema.maxLength === "number") {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.pattern) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }
      zodSchema = stringSchema;
      break;
    }
    case "number":
    case "integer": {
      let numberSchema = type === "integer" ? z.number().int() : z.number();
      if (typeof schema.minimum === "number") {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (typeof schema.maximum === "number") {
        numberSchema = numberSchema.max(schema.maximum);
      }
      if (typeof schema.exclusiveMinimum === "number") {
        numberSchema = numberSchema.gt(schema.exclusiveMinimum);
      } else if (schema.exclusiveMinimum === true && typeof schema.minimum === "number") {
        numberSchema = numberSchema.gt(schema.minimum);
      }
      if (typeof schema.exclusiveMaximum === "number") {
        numberSchema = numberSchema.lt(schema.exclusiveMaximum);
      } else if (schema.exclusiveMaximum === true && typeof schema.maximum === "number") {
        numberSchema = numberSchema.lt(schema.maximum);
      }
      if (typeof schema.multipleOf === "number") {
        numberSchema = numberSchema.multipleOf(schema.multipleOf);
      }
      zodSchema = numberSchema;
      break;
    }
    case "boolean": {
      zodSchema = z.boolean();
      break;
    }
    case "null": {
      zodSchema = z.null();
      break;
    }
    case "object": {
      const shape = {};
      const properties = schema.properties || {};
      const requiredSet = new Set(schema.required || []);
      for (const [key, propSchema] of Object.entries(properties)) {
        const propZodSchema = convertSchema(propSchema, ctx);
        shape[key] = requiredSet.has(key) ? propZodSchema : propZodSchema.optional();
      }
      if (schema.propertyNames) {
        const keySchema = convertSchema(schema.propertyNames, ctx);
        const valueSchema = schema.additionalProperties && typeof schema.additionalProperties === "object" ? convertSchema(schema.additionalProperties, ctx) : z.any();
        if (Object.keys(shape).length === 0) {
          zodSchema = z.record(keySchema, valueSchema);
          break;
        }
        const objectSchema3 = z.object(shape).passthrough();
        const recordSchema = z.looseRecord(keySchema, valueSchema);
        zodSchema = z.intersection(objectSchema3, recordSchema);
        break;
      }
      if (schema.patternProperties) {
        const patternProps = schema.patternProperties;
        const patternKeys = Object.keys(patternProps);
        const looseRecords = [];
        for (const pattern2 of patternKeys) {
          const patternValue = convertSchema(patternProps[pattern2], ctx);
          const keySchema = z.string().regex(new RegExp(pattern2));
          looseRecords.push(z.looseRecord(keySchema, patternValue));
        }
        const schemasToIntersect = [];
        if (Object.keys(shape).length > 0) {
          schemasToIntersect.push(z.object(shape).passthrough());
        }
        schemasToIntersect.push(...looseRecords);
        if (schemasToIntersect.length === 0) {
          zodSchema = z.object({}).passthrough();
        } else if (schemasToIntersect.length === 1) {
          zodSchema = schemasToIntersect[0];
        } else {
          let result = z.intersection(schemasToIntersect[0], schemasToIntersect[1]);
          for (let i = 2; i < schemasToIntersect.length; i++) {
            result = z.intersection(result, schemasToIntersect[i]);
          }
          zodSchema = result;
        }
        break;
      }
      const objectSchema2 = z.object(shape);
      if (schema.additionalProperties === false) {
        zodSchema = objectSchema2.strict();
      } else if (typeof schema.additionalProperties === "object") {
        zodSchema = objectSchema2.catchall(convertSchema(schema.additionalProperties, ctx));
      } else {
        zodSchema = objectSchema2.passthrough();
      }
      break;
    }
    case "array": {
      const prefixItems = schema.prefixItems;
      const items = schema.items;
      if (prefixItems && Array.isArray(prefixItems)) {
        const tupleItems = prefixItems.map((item) => convertSchema(item, ctx));
        const rest = items && typeof items === "object" && !Array.isArray(items) ? convertSchema(items, ctx) : void 0;
        if (rest) {
          zodSchema = z.tuple(tupleItems).rest(rest);
        } else {
          zodSchema = z.tuple(tupleItems);
        }
        if (typeof schema.minItems === "number") {
          zodSchema = zodSchema.check(z.minLength(schema.minItems));
        }
        if (typeof schema.maxItems === "number") {
          zodSchema = zodSchema.check(z.maxLength(schema.maxItems));
        }
      } else if (Array.isArray(items)) {
        const tupleItems = items.map((item) => convertSchema(item, ctx));
        const rest = schema.additionalItems && typeof schema.additionalItems === "object" ? convertSchema(schema.additionalItems, ctx) : void 0;
        if (rest) {
          zodSchema = z.tuple(tupleItems).rest(rest);
        } else {
          zodSchema = z.tuple(tupleItems);
        }
        if (typeof schema.minItems === "number") {
          zodSchema = zodSchema.check(z.minLength(schema.minItems));
        }
        if (typeof schema.maxItems === "number") {
          zodSchema = zodSchema.check(z.maxLength(schema.maxItems));
        }
      } else if (items !== void 0) {
        const element = convertSchema(items, ctx);
        let arraySchema = z.array(element);
        if (typeof schema.minItems === "number") {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (typeof schema.maxItems === "number") {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        zodSchema = arraySchema;
      } else {
        zodSchema = z.array(z.any());
      }
      break;
    }
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
  return zodSchema;
}
function convertSchema(schema, ctx) {
  if (typeof schema === "boolean") {
    return schema ? z.any() : z.never();
  }
  let baseSchema = convertBaseSchema(schema, ctx);
  const hasExplicitType = schema.type || schema.enum !== void 0 || schema.const !== void 0;
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const options = schema.anyOf.map((s) => convertSchema(s, ctx));
    const anyOfUnion = z.union(options);
    baseSchema = hasExplicitType ? z.intersection(baseSchema, anyOfUnion) : anyOfUnion;
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const options = schema.oneOf.map((s) => convertSchema(s, ctx));
    const oneOfUnion = z.xor(options);
    baseSchema = hasExplicitType ? z.intersection(baseSchema, oneOfUnion) : oneOfUnion;
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    if (schema.allOf.length === 0) {
      baseSchema = hasExplicitType ? baseSchema : z.any();
    } else {
      let result = hasExplicitType ? baseSchema : convertSchema(schema.allOf[0], ctx);
      const startIdx = hasExplicitType ? 0 : 1;
      for (let i = startIdx; i < schema.allOf.length; i++) {
        result = z.intersection(result, convertSchema(schema.allOf[i], ctx));
      }
      baseSchema = result;
    }
  }
  if (schema.nullable === true && ctx.version === "openapi-3.0") {
    baseSchema = z.nullable(baseSchema);
  }
  if (schema.readOnly === true) {
    baseSchema = z.readonly(baseSchema);
  }
  if (schema.default !== void 0) {
    baseSchema = baseSchema.default(schema.default);
  }
  const extraMeta = {};
  const coreMetadataKeys = ["$id", "id", "$comment", "$anchor", "$vocabulary", "$dynamicRef", "$dynamicAnchor"];
  for (const key of coreMetadataKeys) {
    if (key in schema) {
      extraMeta[key] = schema[key];
    }
  }
  const contentMetadataKeys = ["contentEncoding", "contentMediaType", "contentSchema"];
  for (const key of contentMetadataKeys) {
    if (key in schema) {
      extraMeta[key] = schema[key];
    }
  }
  for (const key of Object.keys(schema)) {
    if (!RECOGNIZED_KEYS.has(key)) {
      extraMeta[key] = schema[key];
    }
  }
  if (Object.keys(extraMeta).length > 0) {
    ctx.registry.add(baseSchema, extraMeta);
  }
  if (schema.description) {
    baseSchema = baseSchema.describe(schema.description);
  }
  return baseSchema;
}
function fromJSONSchema(schema, params) {
  if (typeof schema === "boolean") {
    return schema ? z.any() : z.never();
  }
  let normalized;
  try {
    normalized = JSON.parse(JSON.stringify(schema));
  } catch {
    throw new Error("fromJSONSchema input is not valid JSON (possibly cyclic); use $defs/$ref for recursive schemas");
  }
  const version2 = detectVersion(normalized, params?.defaultTarget);
  const defs = normalized.$defs || normalized.definitions || {};
  const ctx = {
    version: version2,
    defs,
    refs: /* @__PURE__ */ new Map(),
    processing: /* @__PURE__ */ new Set(),
    rootSchema: normalized,
    registry: params?.registry ?? globalRegistry
  };
  return convertSchema(normalized, ctx);
}
var z, RECOGNIZED_KEYS;
var init_from_json_schema = __esm({
  "node_modules/zod/v4/classic/from-json-schema.js"() {
    init_registries();
    init_checks2();
    init_iso();
    init_schemas2();
    z = {
      ...schemas_exports2,
      ...checks_exports2,
      iso: iso_exports
    };
    RECOGNIZED_KEYS = /* @__PURE__ */ new Set([
      // Schema identification
      "$schema",
      "$ref",
      "$defs",
      "definitions",
      // Core schema keywords
      "$id",
      "id",
      "$comment",
      "$anchor",
      "$vocabulary",
      "$dynamicRef",
      "$dynamicAnchor",
      // Type
      "type",
      "enum",
      "const",
      // Composition
      "anyOf",
      "oneOf",
      "allOf",
      "not",
      // Object
      "properties",
      "required",
      "additionalProperties",
      "patternProperties",
      "propertyNames",
      "minProperties",
      "maxProperties",
      // Array
      "items",
      "prefixItems",
      "additionalItems",
      "minItems",
      "maxItems",
      "uniqueItems",
      "contains",
      "minContains",
      "maxContains",
      // String
      "minLength",
      "maxLength",
      "pattern",
      "format",
      // Number
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      // Already handled metadata
      "description",
      "default",
      // Content
      "contentEncoding",
      "contentMediaType",
      "contentSchema",
      // Unsupported (error-throwing)
      "unevaluatedItems",
      "unevaluatedProperties",
      "if",
      "then",
      "else",
      "dependentSchemas",
      "dependentRequired",
      // OpenAPI
      "nullable",
      "readOnly"
    ]);
  }
});

// node_modules/zod/v4/classic/coerce.js
var coerce_exports = {};
__export(coerce_exports, {
  bigint: () => bigint3,
  boolean: () => boolean3,
  date: () => date4,
  number: () => number3,
  string: () => string3
});
function string3(params) {
  return _coercedString(ZodString, params);
}
function number3(params) {
  return _coercedNumber(ZodNumber, params);
}
function boolean3(params) {
  return _coercedBoolean(ZodBoolean, params);
}
function bigint3(params) {
  return _coercedBigint(ZodBigInt, params);
}
function date4(params) {
  return _coercedDate(ZodDate, params);
}
var init_coerce = __esm({
  "node_modules/zod/v4/classic/coerce.js"() {
    init_core2();
    init_schemas2();
  }
});

// node_modules/zod/v4/classic/external.js
var external_exports = {};
__export(external_exports, {
  $brand: () => $brand,
  $input: () => $input,
  $output: () => $output,
  NEVER: () => NEVER,
  TimePrecision: () => TimePrecision,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBase64: () => ZodBase64,
  ZodBase64URL: () => ZodBase64URL,
  ZodBigInt: () => ZodBigInt,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBoolean: () => ZodBoolean,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCUID: () => ZodCUID,
  ZodCUID2: () => ZodCUID2,
  ZodCatch: () => ZodCatch,
  ZodCodec: () => ZodCodec,
  ZodCustom: () => ZodCustom,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodE164: () => ZodE164,
  ZodEmail: () => ZodEmail,
  ZodEmoji: () => ZodEmoji,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodExactOptional: () => ZodExactOptional,
  ZodFile: () => ZodFile,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodGUID: () => ZodGUID,
  ZodIPv4: () => ZodIPv4,
  ZodIPv6: () => ZodIPv6,
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodJWT: () => ZodJWT,
  ZodKSUID: () => ZodKSUID,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMAC: () => ZodMAC,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNanoID: () => ZodNanoID,
  ZodNever: () => ZodNever,
  ZodNonOptional: () => ZodNonOptional,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodPipe: () => ZodPipe,
  ZodPrefault: () => ZodPrefault,
  ZodPreprocess: () => ZodPreprocess,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRealError: () => ZodRealError,
  ZodRecord: () => ZodRecord,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodStringFormat: () => ZodStringFormat,
  ZodSuccess: () => ZodSuccess,
  ZodSymbol: () => ZodSymbol,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodTransform: () => ZodTransform,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodULID: () => ZodULID,
  ZodURL: () => ZodURL,
  ZodUUID: () => ZodUUID,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  ZodXID: () => ZodXID,
  ZodXor: () => ZodXor,
  _ZodString: () => _ZodString,
  _default: () => _default2,
  _function: () => _function,
  any: () => any,
  array: () => array,
  base64: () => base642,
  base64url: () => base64url2,
  bigint: () => bigint2,
  boolean: () => boolean2,
  catch: () => _catch2,
  check: () => check,
  cidrv4: () => cidrv42,
  cidrv6: () => cidrv62,
  clone: () => clone,
  codec: () => codec,
  coerce: () => coerce_exports,
  config: () => config,
  core: () => core_exports2,
  cuid: () => cuid3,
  cuid2: () => cuid22,
  custom: () => custom,
  date: () => date3,
  decode: () => decode2,
  decodeAsync: () => decodeAsync2,
  describe: () => describe2,
  discriminatedUnion: () => discriminatedUnion,
  e164: () => e1642,
  email: () => email2,
  emoji: () => emoji2,
  encode: () => encode2,
  encodeAsync: () => encodeAsync2,
  endsWith: () => _endsWith,
  enum: () => _enum2,
  exactOptional: () => exactOptional,
  file: () => file,
  flattenError: () => flattenError,
  float32: () => float32,
  float64: () => float64,
  formatError: () => formatError,
  fromJSONSchema: () => fromJSONSchema,
  function: () => _function,
  getErrorMap: () => getErrorMap,
  globalRegistry: () => globalRegistry,
  gt: () => _gt,
  gte: () => _gte,
  guid: () => guid2,
  hash: () => hash,
  hex: () => hex2,
  hostname: () => hostname2,
  httpUrl: () => httpUrl,
  includes: () => _includes,
  instanceof: () => _instanceof,
  int: () => int,
  int32: () => int32,
  int64: () => int64,
  intersection: () => intersection,
  invertCodec: () => invertCodec,
  ipv4: () => ipv42,
  ipv6: () => ipv62,
  iso: () => iso_exports,
  json: () => json,
  jwt: () => jwt,
  keyof: () => keyof,
  ksuid: () => ksuid2,
  lazy: () => lazy,
  length: () => _length,
  literal: () => literal,
  locales: () => locales_exports,
  looseObject: () => looseObject,
  looseRecord: () => looseRecord,
  lowercase: () => _lowercase,
  lt: () => _lt,
  lte: () => _lte,
  mac: () => mac2,
  map: () => map,
  maxLength: () => _maxLength,
  maxSize: () => _maxSize,
  meta: () => meta2,
  mime: () => _mime,
  minLength: () => _minLength,
  minSize: () => _minSize,
  multipleOf: () => _multipleOf,
  nan: () => nan,
  nanoid: () => nanoid2,
  nativeEnum: () => nativeEnum,
  negative: () => _negative,
  never: () => never,
  nonnegative: () => _nonnegative,
  nonoptional: () => nonoptional,
  nonpositive: () => _nonpositive,
  normalize: () => _normalize,
  null: () => _null3,
  nullable: () => nullable,
  nullish: () => nullish2,
  number: () => number2,
  object: () => object,
  optional: () => optional,
  overwrite: () => _overwrite,
  parse: () => parse2,
  parseAsync: () => parseAsync2,
  partialRecord: () => partialRecord,
  pipe: () => pipe,
  positive: () => _positive,
  prefault: () => prefault,
  preprocess: () => preprocess,
  prettifyError: () => prettifyError,
  promise: () => promise,
  property: () => _property,
  readonly: () => readonly,
  record: () => record,
  refine: () => refine,
  regex: () => _regex,
  regexes: () => regexes_exports,
  registry: () => registry,
  safeDecode: () => safeDecode2,
  safeDecodeAsync: () => safeDecodeAsync2,
  safeEncode: () => safeEncode2,
  safeEncodeAsync: () => safeEncodeAsync2,
  safeParse: () => safeParse2,
  safeParseAsync: () => safeParseAsync2,
  set: () => set,
  setErrorMap: () => setErrorMap,
  size: () => _size,
  slugify: () => _slugify,
  startsWith: () => _startsWith,
  strictObject: () => strictObject,
  string: () => string2,
  stringFormat: () => stringFormat,
  stringbool: () => stringbool,
  success: () => success,
  superRefine: () => superRefine,
  symbol: () => symbol,
  templateLiteral: () => templateLiteral,
  toJSONSchema: () => toJSONSchema,
  toLowerCase: () => _toLowerCase,
  toUpperCase: () => _toUpperCase,
  transform: () => transform,
  treeifyError: () => treeifyError,
  trim: () => _trim,
  tuple: () => tuple,
  uint32: () => uint32,
  uint64: () => uint64,
  ulid: () => ulid2,
  undefined: () => _undefined3,
  union: () => union,
  unknown: () => unknown,
  uppercase: () => _uppercase,
  url: () => url,
  util: () => util_exports,
  uuid: () => uuid2,
  uuidv4: () => uuidv4,
  uuidv6: () => uuidv6,
  uuidv7: () => uuidv7,
  void: () => _void2,
  xid: () => xid2,
  xor: () => xor
});
var init_external = __esm({
  "node_modules/zod/v4/classic/external.js"() {
    init_core2();
    init_schemas2();
    init_checks2();
    init_errors2();
    init_parse2();
    init_compat();
    init_core2();
    init_en();
    init_core2();
    init_json_schema_processors();
    init_from_json_schema();
    init_locales();
    init_iso();
    init_iso();
    init_coerce();
    config(en_default());
  }
});

// node_modules/zod/index.js
var init_zod = __esm({
  "node_modules/zod/index.js"() {
    init_external();
    init_external();
  }
});

// src/blueprint/schema.ts
function issuePath(path) {
  return path.map((segment) => typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`).join("").replace(/^\./, "") || "(root)";
}
function selectorComponentRefs(selector) {
  if (selector === void 0) return [];
  const entries2 = Array.isArray(selector) ? selector : [selector];
  const refs = [];
  for (const raw of entries2) {
    const entry = raw.startsWith("!") ? raw.slice(1) : raw;
    if (entry === "*") continue;
    if (entry.startsWith("component:")) refs.push(entry.slice("component:".length));
    else if (!RESERVED_SELECTOR_PREFIXES.some((prefix) => entry.startsWith(prefix))) refs.push(entry);
  }
  return refs;
}
function ruleSelectors(rule) {
  switch (rule.kind) {
    case "forbid":
    case "allow-only":
      return [rule.from, rule.to];
    case "layers":
      return rule.layers;
    case "no-cycles":
      return rule.scope ? [rule.scope] : [];
    case "secret-access":
      return [rule.allow];
    case "protect":
      return [];
  }
}
function semanticIssues(blueprint) {
  const issues = [];
  const componentIds = /* @__PURE__ */ new Set();
  blueprint.components.forEach((component, index) => {
    if (componentIds.has(component.id)) {
      issues.push({ path: `components[${index}].id`, message: `Duplicate component id "${component.id}"` });
    }
    componentIds.add(component.id);
    if (RESERVED_SELECTOR_PREFIXES.some((prefix) => component.id.startsWith(prefix)) || component.id === "*") {
      issues.push({ path: `components[${index}].id`, message: `Component id "${component.id}" collides with selector syntax (component:, tag:, path:, package:)` });
    }
    if (!component.external && component.paths.length === 0) {
      issues.push({ path: `components[${index}].paths`, message: `Component "${component.id}" owns no paths; mark it external or add globs` });
    }
  });
  blueprint.dependencies.forEach((dependency, index) => {
    for (const side of ["from", "to"]) {
      if (!componentIds.has(dependency[side])) {
        issues.push({ path: `dependencies[${index}].${side}`, message: `Unknown component "${dependency[side]}"` });
      }
    }
  });
  const ruleIds = /* @__PURE__ */ new Set();
  blueprint.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) issues.push({ path: `rules[${index}].id`, message: `Duplicate rule id "${rule.id}"` });
    ruleIds.add(rule.id);
    for (const selector of ruleSelectors(rule)) {
      for (const ref of selectorComponentRefs(selector)) {
        if (!componentIds.has(ref)) {
          issues.push({ path: `rules[${index}]`, message: `Rule "${rule.id}" references unknown component "${ref}"` });
        }
      }
    }
  });
  const invariantIds = /* @__PURE__ */ new Set();
  blueprint.invariants.forEach((invariant, index) => {
    if (invariantIds.has(invariant.id)) issues.push({ path: `invariants[${index}].id`, message: `Duplicate invariant id "${invariant.id}"` });
    invariantIds.add(invariant.id);
    for (const ref of invariant.components ?? []) {
      if (!componentIds.has(ref)) issues.push({ path: `invariants[${index}].components`, message: `Unknown component "${ref}"` });
    }
  });
  const decisionIds = /* @__PURE__ */ new Set();
  blueprint.decisions.forEach((decision, index) => {
    if (decisionIds.has(decision.id)) issues.push({ path: `decisions[${index}].id`, message: `Duplicate decision id "${decision.id}"` });
    decisionIds.add(decision.id);
    for (const ref of decision.components ?? []) {
      if (!componentIds.has(ref)) issues.push({ path: `decisions[${index}].components`, message: `Unknown component "${ref}"` });
    }
  });
  blueprint.decisions.forEach((decision, index) => {
    if (decision.supersededBy && !decisionIds.has(decision.supersededBy)) {
      issues.push({ path: `decisions[${index}].supersededBy`, message: `Unknown decision "${decision.supersededBy}"` });
    }
  });
  return issues;
}
function parseBlueprint(value) {
  const result = blueprintSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue2) => ({ path: issuePath(issue2.path), message: issue2.message }))
    };
  }
  const issues = semanticIssues(result.data);
  return issues.length ? { ok: false, issues } : { ok: true, blueprint: result.data, issues: [] };
}
function parseBlueprintText(text3) {
  let value;
  try {
    value = JSON.parse(text3.replace(/^﻿/, ""));
  } catch (error51) {
    return {
      ok: false,
      issues: [{ path: "(root)", message: `Invalid JSON: ${error51 instanceof Error ? error51.message : String(error51)}` }]
    };
  }
  return parseBlueprint(value);
}
function serializeBlueprint(blueprint) {
  const ordered = {};
  const source = { $schema: BLUEPRINT_SCHEMA_URL, ...blueprint };
  for (const key of TOP_LEVEL_ORDER) if (source[key] !== void 0) ordered[key] = source[key];
  for (const key of Object.keys(source)) if (!(key in ordered) && source[key] !== void 0) ordered[key] = source[key];
  return `${JSON.stringify(ordered, null, 2)}
`;
}
function blueprintJsonSchema() {
  const schema = external_exports.toJSONSchema(blueprintSchema, { target: "draft-2020-12", io: "input" });
  return {
    $id: BLUEPRINT_SCHEMA_URL,
    title: "Rassam Blueprint",
    description: "A human-owned architecture contract for agent-built software. See https://rassam.dev",
    ...schema
  };
}
var BLUEPRINT_VERSION, BLUEPRINT_PATH, BLUEPRINT_PROPOSALS_DIR, BLUEPRINT_ESCALATIONS_DIR, BLUEPRINT_SCHEMA_URL, idPattern, blueprintIdSchema, shortText, longText, globSchema, timestampSchema, severitySchema, provenanceSchema, verificationSchema, assuranceSchema, componentKindSchema, componentSchema, dependencyKindSchema, dependencySchema, selectorSchema, ruleBase, forbidRuleSchema, allowOnlyRuleSchema, layersRuleSchema, noCyclesRuleSchema, protectRuleSchema, secretAccessRuleSchema, ruleSchema, invariantSchema, decisionSchema, policySchema, blueprintSchema, RESERVED_SELECTOR_PREFIXES, TOP_LEVEL_ORDER;
var init_schema = __esm({
  "src/blueprint/schema.ts"() {
    "use strict";
    init_zod();
    BLUEPRINT_VERSION = "0.1";
    BLUEPRINT_PATH = ".rassam/blueprint.json";
    BLUEPRINT_PROPOSALS_DIR = ".rassam/proposals";
    BLUEPRINT_ESCALATIONS_DIR = ".rassam/escalations";
    BLUEPRINT_SCHEMA_URL = "https://rassam.dev/schema/blueprint-0.1.json";
    idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
    blueprintIdSchema = external_exports.string().regex(idPattern, "IDs use letters, digits, '.', '_', ':' or '-' and start with a letter or digit (max 80 chars)");
    shortText = external_exports.string().trim().min(1).max(200);
    longText = external_exports.string().max(8e3);
    globSchema = external_exports.string().trim().min(1).max(400);
    timestampSchema = external_exports.string().trim().min(4).max(40);
    severitySchema = external_exports.enum(["error", "warning", "info"]);
    provenanceSchema = external_exports.object({
      source: external_exports.enum(["human", "derived", "agent"]),
      by: external_exports.string().trim().max(200).optional(),
      at: timestampSchema.optional(),
      commit: external_exports.string().trim().max(64).optional(),
      note: external_exports.string().max(1e3).optional()
    }).strict();
    verificationSchema = external_exports.object({
      by: shortText,
      at: timestampSchema,
      commit: external_exports.string().trim().max(64).optional(),
      note: external_exports.string().max(1e3).optional()
    }).strict();
    assuranceSchema = external_exports.enum([
      "unknown",
      "untested",
      "tested",
      "property-tested",
      "formally-verified"
    ]);
    componentKindSchema = external_exports.string().trim().regex(/^[a-z][a-z0-9-]{0,39}$/, "kind is a lowercase slug such as api, service, database or external-api");
    componentSchema = external_exports.object({
      id: blueprintIdSchema,
      name: shortText,
      kind: componentKindSchema.default("default"),
      description: external_exports.string().max(2e3).optional(),
      /** Human-authored purpose, responsibilities and boundaries. */
      intent: longText.optional(),
      /** Globs (repo-relative) for the files this component owns. Empty for external systems. */
      paths: external_exports.array(globSchema).max(200).default([]),
      exclude: external_exports.array(globSchema).max(200).optional(),
      /** Resolves overlaps between components: higher wins, then glob specificity. */
      priority: external_exports.number().int().min(-100).max(100).optional(),
      /** True for systems outside the repository (SaaS APIs, databases, queues). */
      external: external_exports.boolean().optional(),
      /** Any component may depend on this one without declaring it (contracts, types, utilities). Rules still apply. */
      public: external_exports.boolean().optional(),
      tags: external_exports.array(external_exports.string().trim().min(1).max(80)).max(50).optional(),
      owners: external_exports.array(external_exports.string().trim().min(1).max(120)).max(50).optional(),
      assurance: assuranceSchema.optional(),
      provenance: provenanceSchema.optional(),
      verified: verificationSchema.optional()
    }).strict();
    dependencyKindSchema = external_exports.enum(["imports", "calls", "reads", "writes", "sends", "receives", "uses"]);
    dependencySchema = external_exports.object({
      from: blueprintIdSchema,
      to: blueprintIdSchema,
      kind: dependencyKindSchema.optional(),
      label: external_exports.string().trim().max(120).optional(),
      reason: external_exports.string().max(2e3).optional(),
      provenance: provenanceSchema.optional(),
      verified: verificationSchema.optional()
    }).strict();
    selectorSchema = external_exports.union([
      external_exports.string().trim().min(1).max(400),
      external_exports.array(external_exports.string().trim().min(1).max(400)).min(1).max(100)
    ]);
    ruleBase = {
      id: blueprintIdSchema,
      severity: severitySchema.optional(),
      reason: external_exports.string().max(2e3).optional(),
      provenance: provenanceSchema.optional(),
      verified: verificationSchema.optional()
    };
    forbidRuleSchema = external_exports.object({
      ...ruleBase,
      kind: external_exports.literal("forbid"),
      from: selectorSchema,
      to: selectorSchema,
      /** Count `import type` edges too (default true). */
      includeTypeOnly: external_exports.boolean().optional()
    }).strict();
    allowOnlyRuleSchema = external_exports.object({
      ...ruleBase,
      kind: external_exports.literal("allow-only"),
      from: selectorSchema,
      to: selectorSchema,
      includeTypeOnly: external_exports.boolean().optional()
    }).strict();
    layersRuleSchema = external_exports.object({
      ...ruleBase,
      kind: external_exports.literal("layers"),
      layers: external_exports.array(selectorSchema).min(2).max(20),
      includeTypeOnly: external_exports.boolean().optional()
    }).strict();
    noCyclesRuleSchema = external_exports.object({
      ...ruleBase,
      kind: external_exports.literal("no-cycles"),
      scope: selectorSchema.optional(),
      includeTypeOnly: external_exports.boolean().optional()
    }).strict();
    protectRuleSchema = external_exports.object({
      ...ruleBase,
      kind: external_exports.literal("protect"),
      paths: external_exports.array(globSchema).min(1).max(200)
    }).strict();
    secretAccessRuleSchema = external_exports.object({
      ...ruleBase,
      kind: external_exports.literal("secret-access"),
      secrets: external_exports.array(external_exports.string().trim().min(1).max(200)).min(1).max(200),
      allow: selectorSchema
    }).strict();
    ruleSchema = external_exports.discriminatedUnion("kind", [
      forbidRuleSchema,
      allowOnlyRuleSchema,
      layersRuleSchema,
      noCyclesRuleSchema,
      protectRuleSchema,
      secretAccessRuleSchema
    ]);
    invariantSchema = external_exports.object({
      id: blueprintIdSchema,
      statement: external_exports.string().trim().min(1).max(2e3),
      components: external_exports.array(blueprintIdSchema).max(100).optional(),
      check: external_exports.object({
        /** Shell command run by `rassam check --run-invariants` (read from the base blueprint only). */
        run: external_exports.string().trim().min(1).max(1e3).optional(),
        /** Test files that exercise this invariant. */
        tests: external_exports.array(globSchema).max(100).optional()
      }).strict().optional(),
      severity: severitySchema.optional(),
      provenance: provenanceSchema.optional(),
      verified: verificationSchema.optional()
    }).strict();
    decisionSchema = external_exports.object({
      id: blueprintIdSchema,
      title: external_exports.string().trim().min(1).max(300),
      status: external_exports.enum(["proposed", "accepted", "superseded", "deprecated"]),
      date: timestampSchema.optional(),
      components: external_exports.array(blueprintIdSchema).max(100).optional(),
      context: longText.optional(),
      decision: longText,
      consequences: longText.optional(),
      supersededBy: blueprintIdSchema.optional(),
      links: external_exports.array(external_exports.string().trim().min(1).max(500)).max(20).optional(),
      provenance: provenanceSchema.optional()
    }).strict();
    policySchema = external_exports.object({
      /** How to treat observed cross-component dependencies that are not declared. */
      undeclaredDependencies: external_exports.enum(["off", "info", "warning", "error"]).default("warning"),
      /** How to treat source files that no component claims. */
      unmappedFiles: external_exports.enum(["off", "info", "warning"]).default("info"),
      /** Count `import type` edges in rules by default. */
      includeTypeOnly: external_exports.boolean().default(true),
      /** Built-in tripwires for tests, CI, lockfiles, agent permissions and the blueprint itself. */
      tripwires: external_exports.object({
        defaults: external_exports.boolean().default(true),
        paths: external_exports.array(globSchema).max(200).optional()
      }).strict().default({ defaults: true }),
      /** Heuristics that flag weakened verification (skipped tests, deleted assertions, ...). */
      verificationHeuristics: external_exports.boolean().default(true),
      /** Globs excluded from analysis entirely (generated code, fixtures, vendored code). */
      ignore: external_exports.array(globSchema).max(500).default([])
    }).strict();
    blueprintSchema = external_exports.object({
      $schema: external_exports.string().max(500).optional(),
      version: external_exports.literal(BLUEPRINT_VERSION),
      system: external_exports.object({
        name: shortText,
        description: external_exports.string().max(4e3).optional(),
        repository: external_exports.string().trim().max(500).optional()
      }).strict(),
      policy: policySchema.default(() => policySchema.parse({})),
      components: external_exports.array(componentSchema).max(500),
      dependencies: external_exports.array(dependencySchema).max(5e3).default([]),
      rules: external_exports.array(ruleSchema).max(500).default([]),
      invariants: external_exports.array(invariantSchema).max(500).default([]),
      decisions: external_exports.array(decisionSchema).max(500).default([])
    }).strict();
    RESERVED_SELECTOR_PREFIXES = ["component:", "tag:", "path:", "package:"];
    TOP_LEVEL_ORDER = ["$schema", "version", "system", "policy", "components", "dependencies", "rules", "invariants", "decisions"];
  }
});

// src/blueprint/glob.ts
function escapeRegex2(char) {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}
function translate(pattern2) {
  let regex = "";
  let index = 0;
  let braceDepth = 0;
  while (index < pattern2.length) {
    const char = pattern2[index];
    if (char === "*") {
      if (pattern2[index + 1] === "*") {
        const atSegmentStart = index === 0 || pattern2[index - 1] === "/";
        const atSegmentEnd = index + 2 === pattern2.length || pattern2[index + 2] === "/";
        if (atSegmentStart && atSegmentEnd) {
          if (pattern2[index + 2] === "/") {
            regex += "(?:.*/)?";
            index += 3;
          } else {
            regex += ".*";
            index += 2;
          }
          continue;
        }
        regex += "[^/]*";
        index += 2;
        continue;
      }
      regex += "[^/]*";
      index += 1;
      continue;
    }
    if (char === "?") {
      regex += "[^/]";
      index += 1;
      continue;
    }
    if (char === "[") {
      const close = pattern2.indexOf("]", index + 1);
      if (close > index + 1) {
        let body = pattern2.slice(index + 1, close);
        const negated = body.startsWith("!") || body.startsWith("^");
        if (negated) body = body.slice(1);
        body = body.replace(/\\/g, "\\\\");
        regex += negated ? `[^/${body}]` : `[${body}]`;
        index = close + 1;
        continue;
      }
      regex += "\\[";
      index += 1;
      continue;
    }
    if (char === "{") {
      braceDepth += 1;
      regex += "(?:";
      index += 1;
      continue;
    }
    if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      regex += ")";
      index += 1;
      continue;
    }
    if (char === "," && braceDepth > 0) {
      regex += "|";
      index += 1;
      continue;
    }
    if (char === "\\" && index + 1 < pattern2.length) {
      regex += escapeRegex2(pattern2[index + 1]);
      index += 2;
      continue;
    }
    regex += escapeRegex2(char);
    index += 1;
  }
  while (braceDepth > 0) {
    regex += ")";
    braceDepth -= 1;
  }
  return regex;
}
function compileGlob(rawPattern) {
  const cached2 = cache.get(rawPattern);
  if (cached2) return cached2;
  let pattern2 = rawPattern.trim().replace(/\\(?=[^*?[\]{}!\\])/g, "/");
  if (pattern2.startsWith("./")) pattern2 = pattern2.slice(2);
  const anchored = pattern2.startsWith("/");
  if (anchored) pattern2 = pattern2.slice(1);
  if (pattern2.endsWith("/")) pattern2 = `${pattern2}**`;
  const basenameOnly = !anchored && !pattern2.includes("/");
  const body = translate(pattern2);
  const regex = basenameOnly ? new RegExp(`^(?:.*/)?${body}$`) : new RegExp(`^${body}$`);
  const directoryRegex = !/[*?[{]/.test(pattern2) ? new RegExp(`^${body}/`) : null;
  const matcher = {
    pattern: rawPattern,
    specificity: pattern2.replace(/\*\*|[*?]|\[[^\]]*]|[{},]/g, "").length,
    test(path) {
      const candidate = path.replace(/\\/g, "/").replace(/^\.\//, "");
      return regex.test(candidate) || directoryRegex !== null && directoryRegex.test(candidate);
    }
  };
  if (cache.size > 5e3) cache.clear();
  cache.set(rawPattern, matcher);
  return matcher;
}
function matchesAny(path, patterns) {
  if (!patterns?.length) return false;
  return patterns.some((pattern2) => compileGlob(pattern2).test(path));
}
var cache;
var init_glob = __esm({
  "src/blueprint/glob.ts"() {
    "use strict";
    cache = /* @__PURE__ */ new Map();
  }
});

// src/blueprint/graph.ts
function compileComponents(blueprint) {
  if (!blueprint) return [];
  return blueprint.components.map((component, index) => ({
    component,
    index,
    include: component.external ? [] : component.paths.map((pattern2) => compileGlob(pattern2)),
    exclude: (component.exclude ?? []).map((pattern2) => compileGlob(pattern2))
  })).filter((entry) => entry.include.length > 0);
}
function ownerOf(path, compiled) {
  let best = null;
  for (const entry of compiled) {
    let specificity = -1;
    for (const matcher of entry.include) {
      if (matcher.specificity > specificity && matcher.test(path)) specificity = matcher.specificity;
    }
    if (specificity < 0) continue;
    if (entry.exclude.some((matcher) => matcher.test(path))) continue;
    const priority = entry.component.priority ?? 0;
    if (!best || priority > best.priority || priority === best.priority && specificity > best.specificity || priority === best.priority && specificity === best.specificity && entry.index < best.index) {
      best = { id: entry.component.id, priority, specificity, index: entry.index };
    }
  }
  return best?.id ?? null;
}
function assignComponents(files, blueprint) {
  const compiled = compileComponents(blueprint);
  const fileToComponent = /* @__PURE__ */ new Map();
  const componentFiles = /* @__PURE__ */ new Map();
  const unmapped = [];
  for (const component of blueprint?.components ?? []) componentFiles.set(component.id, []);
  for (const path of files) {
    const owner = ownerOf(path, compiled);
    if (owner === null) {
      unmapped.push(path);
      continue;
    }
    fileToComponent.set(path, owner);
    componentFiles.get(owner)?.push(path);
  }
  for (const list of componentFiles.values()) list.sort();
  unmapped.sort();
  return { fileToComponent, componentFiles, unmapped };
}
function componentForPath(path, blueprint) {
  return ownerOf(path, compileComponents(blueprint));
}
function buildComponentGraph(fileGraph, membership) {
  const aggregates = /* @__PURE__ */ new Map();
  for (const edge of fileGraph.edges) {
    const from = membership.fileToComponent.get(edge.from);
    const to = membership.fileToComponent.get(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}\0${to}`;
    const aggregate = aggregates.get(key) ?? { from, to, evidence: [], count: 0, typeOnly: true };
    aggregate.count += 1;
    aggregate.typeOnly = aggregate.typeOnly && edge.typeOnly;
    if (aggregate.evidence.length < MAX_EDGE_EVIDENCE) aggregate.evidence.push(edge);
    aggregates.set(key, aggregate);
  }
  const externals = /* @__PURE__ */ new Map();
  for (const ref of fileGraph.externals) {
    const owner = membership.fileToComponent.get(ref.from);
    if (!owner) continue;
    const set2 = externals.get(owner) ?? /* @__PURE__ */ new Set();
    set2.add(ref.pkg);
    externals.set(owner, set2);
  }
  const env = /* @__PURE__ */ new Map();
  const tests = /* @__PURE__ */ new Map();
  for (const [path, facts] of fileGraph.facts) {
    const owner = membership.fileToComponent.get(path);
    if (owner && facts.envRefs.length) env.set(owner, [...env.get(owner) ?? [], ...facts.envRefs]);
  }
  for (const edge of fileGraph.edges) {
    if (!fileGraph.facts.get(edge.from)?.isTest) continue;
    const target = membership.fileToComponent.get(edge.to);
    if (!target) continue;
    const set2 = tests.get(target) ?? /* @__PURE__ */ new Set();
    set2.add(edge.from);
    tests.set(target, set2);
  }
  return {
    membership,
    edges: [...aggregates.values()].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    externals: new Map([...externals].map(([id, set2]) => [id, [...set2].sort()])),
    env,
    tests: new Map([...tests].map(([id, set2]) => [id, [...set2].sort()]))
  };
}
function reverseAdjacency(graph) {
  const reverse = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    const set2 = reverse.get(edge.to) ?? /* @__PURE__ */ new Set();
    set2.add(edge.from);
    reverse.set(edge.to, set2);
  }
  return reverse;
}
function dependentsOf(start, reverse) {
  const seen = /* @__PURE__ */ new Map();
  const queue = [];
  const starts = new Set(start);
  for (const id of starts) queue.push({ id, depth: 0 });
  while (queue.length) {
    const current = queue.shift();
    for (const dependent of reverse.get(current.id) ?? []) {
      if (starts.has(dependent) || seen.has(dependent)) continue;
      seen.set(dependent, current.depth + 1);
      queue.push({ id: dependent, depth: current.depth + 1 });
    }
  }
  return [...seen.entries()].map(([id, depth]) => ({ id, depth })).sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
}
function findCycles(nodes, edges) {
  const adjacency = /* @__PURE__ */ new Map();
  for (const node of nodes) adjacency.set(node, []);
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) adjacency.get(edge.from).push(edge.to);
  }
  let index = 0;
  const indices = /* @__PURE__ */ new Map();
  const lowlink = /* @__PURE__ */ new Map();
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const result = [];
  for (const root of adjacency.keys()) {
    if (indices.has(root)) continue;
    const work = [{ node: root, next: 0 }];
    indices.set(root, index);
    lowlink.set(root, index);
    index += 1;
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const neighbors = adjacency.get(frame.node);
      if (frame.next < neighbors.length) {
        const neighbor = neighbors[frame.next];
        frame.next += 1;
        if (!indices.has(neighbor)) {
          indices.set(neighbor, index);
          lowlink.set(neighbor, index);
          index += 1;
          stack.push(neighbor);
          onStack.add(neighbor);
          work.push({ node: neighbor, next: 0 });
        } else if (onStack.has(neighbor)) {
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node), indices.get(neighbor)));
        }
        continue;
      }
      if (lowlink.get(frame.node) === indices.get(frame.node)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        if (component.length > 1) result.push(component.sort());
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].node;
        lowlink.set(parent, Math.min(lowlink.get(parent), lowlink.get(frame.node)));
      }
    }
  }
  return result.sort((left, right) => left.join(",").localeCompare(right.join(",")));
}
function cyclePath(members, edges) {
  const set2 = new Set(members);
  const adjacency = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (set2.has(edge.from) && set2.has(edge.to)) adjacency.set(edge.from, [...adjacency.get(edge.from) ?? [], edge.to]);
  }
  const start = [...members].sort()[0];
  const previous = /* @__PURE__ */ new Map();
  const queue = [start];
  const visited = /* @__PURE__ */ new Set();
  while (queue.length) {
    const node = queue.shift();
    for (const next of adjacency.get(node) ?? []) {
      if (next === start) {
        const path = [start];
        let cursor = node;
        const reversed = [];
        while (cursor && cursor !== start) {
          reversed.push(cursor);
          cursor = previous.get(cursor);
        }
        return [...path, ...reversed.reverse(), start];
      }
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, node);
      queue.push(next);
    }
  }
  return [...members, members[0]];
}
var MAX_EDGE_EVIDENCE;
var init_graph = __esm({
  "src/blueprint/graph.ts"() {
    "use strict";
    init_glob();
    MAX_EDGE_EVIDENCE = 20;
  }
});

// src/blueprint/env.ts
function normalizeName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-.\s]+/g, "_").toUpperCase();
}
function isSecretLikeName(name) {
  const normalized = normalizeName(name);
  if (PUBLIC_PREFIX.test(normalized)) {
    return CLEARLY_SECRET.test(normalized.replace(PUBLIC_PREFIX, ""));
  }
  const candidate = TOKEN_COUNT.test(normalized) ? normalized.replace(/TOKENS?/g, "") : normalized;
  return SECRET_WORDS.test(candidate);
}
function skipString(content, start, quote2) {
  const multiline = quote2 === "`";
  let index = start + 1;
  while (index < content.length) {
    const char = content[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote2) return index + 1;
    if (char === "\n" && !multiline) return index;
    index += 1;
  }
  return content.length;
}
function blankComments(content, style) {
  const parts = [];
  let copied = 0;
  let index = 0;
  const blank = (start, end) => {
    parts.push(content.slice(copied, start), content.slice(start, end).replace(/[^\n\r]/g, " "));
    copied = end;
  };
  while (index < content.length) {
    const char = content[index];
    if (style.triple && (char === '"' || char === "'") && content.startsWith(char.repeat(3), index)) {
      const close = content.indexOf(char.repeat(3), index + 3);
      index = close < 0 ? content.length : close + 3;
      continue;
    }
    if (style.rustChars && char === "'") {
      const literal2 = RUST_CHAR.exec(content.slice(index, index + 12));
      index += literal2 ? literal2[0].length : 1;
      continue;
    }
    if (style.quotes.includes(char)) {
      index = skipString(content, index, char);
      continue;
    }
    if (style.block && char === "/" && content[index + 1] === "*") {
      const close = content.indexOf("*/", index + 2);
      const end = close < 0 ? content.length : close + 2;
      blank(index, end);
      index = end;
      continue;
    }
    if (style.line.some((marker) => content.startsWith(marker, index))) {
      const newline = content.indexOf("\n", index);
      const end = newline < 0 ? content.length : newline;
      blank(index, end);
      index = end;
      continue;
    }
    index += 1;
  }
  parts.push(content.slice(copied));
  return parts.join("");
}
function collectPattern(text3, entry, hits) {
  entry.regex.lastIndex = 0;
  let match;
  while ((match = entry.regex.exec(text3)) !== null) {
    const name = match[entry.group];
    if (!name) continue;
    if (entry.accept && !entry.accept(name)) continue;
    const end = match.index + match[0].length;
    if (entry.skipAssignment && ASSIGNMENT.test(text3.slice(end, end + 16))) continue;
    hits.push({ name, offset: match.index + match[0].lastIndexOf(name) });
  }
}
function splitTopLevel(body) {
  const pieces = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(body, index, char);
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      pieces.push({ text: body.slice(start, index), start });
      start = index + 1;
    }
    index += 1;
  }
  pieces.push({ text: body.slice(start), start });
  return pieces;
}
function collectDestructuring(text3, hits) {
  JS_DESTRUCTURING.lastIndex = 0;
  let match;
  while ((match = JS_DESTRUCTURING.exec(text3)) !== null) {
    const body = match[1];
    const bodyStart = match.index + match[0].indexOf("{") + 1;
    for (const piece of splitTopLevel(body)) {
      const key = DESTRUCTURED_KEY.exec(piece.text);
      if (!key) continue;
      const name = key[1] ?? key[3];
      hits.push({ name, offset: bodyStart + piece.start + piece.text.indexOf(name) });
    }
  }
}
function lineStarts(content) {
  const starts = [0];
  for (let index = content.indexOf("\n"); index >= 0; index = content.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}
function lineOf(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = low + high + 1 >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}
function extractEnvRefs(path, content, language) {
  if (!content) return [];
  const isJs = language === null || language === "typescript" || language === "javascript";
  const text3 = blankComments(content, language ? COMMENT_STYLES[language] : JS_STYLE);
  const hits = [];
  for (const entry of language ? PATTERNS[language] : JS_PATTERNS) collectPattern(text3, entry, hits);
  if (isJs) collectDestructuring(text3, hits);
  const starts = lineStarts(content);
  const seen = /* @__PURE__ */ new Set();
  const refs = [];
  for (const hit of hits) {
    const line = lineOf(starts, hit.offset);
    const key = `${line}\0${hit.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ file: path, name: hit.name, line, secretLike: isSecretLikeName(hit.name) });
  }
  return refs.sort((a, b) => a.line - b.line || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
var SECRET_WORDS, CLEARLY_SECRET, PUBLIC_PREFIX, TOKEN_COUNT, C_STYLE, JS_STYLE, TRIPLE_C_STYLE, HASH_STYLE, COMMENT_STYLES, RUST_CHAR, IDENT, quoted, Q, DQ, pattern, JS_ENV_OBJECT, JS_PATTERNS, JS_DESTRUCTURING, PHP_SERVER_BUILTIN, PYTHON_PATTERNS, JVM_PATTERNS, C_PATTERNS, PATTERNS, ASSIGNMENT, DESTRUCTURED_KEY;
var init_env = __esm({
  "src/blueprint/env.ts"() {
    "use strict";
    SECRET_WORDS = new RegExp(
      [
        "TOKEN",
        "SECRET",
        "PASSWORD",
        "PASSWD",
        "API_?KEY",
        "PRIVATE_?KEY",
        "CREDENTIAL",
        // AUTH, AUTHORIZATION, OAUTH — but not AUTHOR(S) or AUTHORITY.
        "AUTH(?!OR(?!IZ))",
        "(?:^|_)DSN(?:_|$)",
        "DATABASE_?URL",
        "CONNECTION_?STRING",
        "ACCESS_?KEY",
        "SIGNING",
        "SESSION_?KEY",
        "_PWD(?:_|$)"
      ].join("|")
    );
    CLEARLY_SECRET = /SECRET|PASSWORD|PASSWD|PRIVATE_?KEY|CREDENTIAL|DATABASE_?URL|CONNECTION_?STRING|SIGNING/;
    PUBLIC_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;
    TOKEN_COUNT = /(?:^|_)(?:MAX|MIN|NUM|TOTAL|INPUT|OUTPUT|CONTEXT)_(?:[A-Z0-9]+_)*TOKENS?(?:_|$)|TOKENS?_(?:LIMIT|COUNT|BUDGET|PER)(?:_|$)/;
    C_STYLE = { line: ["//"], block: true, quotes: `"'`, triple: false, rustChars: false };
    JS_STYLE = { ...C_STYLE, quotes: "\"'`" };
    TRIPLE_C_STYLE = { ...C_STYLE, triple: true };
    HASH_STYLE = { line: ["#"], block: false, quotes: `"'`, triple: false, rustChars: false };
    COMMENT_STYLES = {
      typescript: JS_STYLE,
      javascript: JS_STYLE,
      python: { ...HASH_STYLE, triple: true },
      go: JS_STYLE,
      java: TRIPLE_C_STYLE,
      kotlin: TRIPLE_C_STYLE,
      rust: { ...C_STYLE, quotes: '"', rustChars: true },
      c: C_STYLE,
      cpp: C_STYLE,
      ruby: HASH_STYLE,
      csharp: C_STYLE,
      php: { line: ["//", "#"], block: true, quotes: `"'`, triple: false, rustChars: false },
      swift: TRIPLE_C_STYLE
    };
    RUST_CHAR = /^'(?:\\[^\n']+|[^'\\\n])'/;
    IDENT = "[A-Za-z_$][\\w$]*";
    quoted = (quotes) => `([${quotes}])([A-Za-z_][\\w.-]*)\\1`;
    Q = quoted(`"'`);
    DQ = quoted('"');
    pattern = (source, group, extra = {}) => ({
      regex: new RegExp(source, "g"),
      group,
      ...extra
    });
    JS_ENV_OBJECT = "(?:\\bprocess\\??\\.env|\\bimport\\.meta\\.env|\\bBun\\.env)";
    JS_PATTERNS = [
      pattern(`${JS_ENV_OBJECT}\\??\\.(${IDENT})`, 1, { skipAssignment: true }),
      pattern(`${JS_ENV_OBJECT}(?:\\?\\.)?\\[\\s*${quoted("\"'`")}\\s*\\]`, 2, { skipAssignment: true }),
      pattern(`\\bDeno\\.env\\.get\\(\\s*${quoted("\"'`")}`, 2)
    ];
    JS_DESTRUCTURING = new RegExp(
      "\\b(?:const|let|var)\\s*\\{([^{}]*)\\}\\s*=\\s*(?:process\\.env|import\\.meta\\.env|Bun\\.env)\\b(?!\\s*[.\\[])",
      "g"
    );
    PHP_SERVER_BUILTIN = /^(?:REQUEST_|HTTP_|SERVER_|REMOTE_|SCRIPT_|PHP_|REDIRECT_|CONTENT_|GATEWAY_|PATH_|ORIG_)|^(?:QUERY_STRING|DOCUMENT_ROOT|HTTPS|AUTH_TYPE|PATH)$/;
    PYTHON_PATTERNS = [
      pattern(`\\b(?:os\\.)?environ\\s*\\[\\s*${Q}\\s*\\]`, 2, { skipAssignment: true }),
      pattern(`\\b(?:os\\.)?environ\\.get\\(\\s*${Q}`, 2),
      pattern(`\\b(?:os\\.)?getenv\\(\\s*${Q}`, 2)
    ];
    JVM_PATTERNS = [
      pattern(`\\bSystem\\.getenv\\(\\s*${DQ}`, 2),
      pattern(`\\bSystem\\.getenv\\(\\s*\\)\\s*(?:\\[|\\.get\\()\\s*${DQ}`, 2)
    ];
    C_PATTERNS = [pattern(`\\b(?:secure_)?getenv\\(\\s*${DQ}`, 2)];
    PATTERNS = {
      typescript: JS_PATTERNS,
      javascript: JS_PATTERNS,
      python: PYTHON_PATTERNS,
      go: [pattern(`\\bos\\.(?:Getenv|LookupEnv)\\(\\s*${quoted('"`')}`, 2)],
      java: JVM_PATTERNS,
      kotlin: JVM_PATTERNS,
      rust: [
        pattern(`\\benv::(?:var|var_os)\\(\\s*${DQ}`, 2),
        pattern(`\\b(?:option_env|env)!\\(\\s*${DQ}`, 2)
      ],
      c: C_PATTERNS,
      cpp: C_PATTERNS,
      ruby: [
        pattern(`\\bENV\\s*\\[\\s*${Q}\\s*\\]`, 2, { skipAssignment: true }),
        pattern(`\\bENV\\.fetch[\\s(]\\s*${Q}`, 2)
      ],
      csharp: [pattern(`\\bEnvironment\\.GetEnvironmentVariable\\(\\s*${DQ}`, 2)],
      php: [
        pattern(`\\bgetenv\\(\\s*${Q}`, 2),
        pattern(`(?<![\\w>:$])env\\(\\s*${Q}`, 2),
        pattern(`\\$_ENV\\[\\s*${Q}\\s*\\]`, 2),
        pattern(`\\$_SERVER\\[\\s*(["'])([A-Z][A-Z0-9_]*)\\1\\s*\\]`, 2, {
          accept: (name) => !PHP_SERVER_BUILTIN.test(name)
        })
      ],
      swift: [pattern(`\\bProcessInfo\\.processInfo\\.environment\\[\\s*${DQ}\\s*\\]`, 2)]
    };
    ASSIGNMENT = /^\s*=(?![=>])/;
    DESTRUCTURED_KEY = new RegExp(`^\\s*(?:(${IDENT})\\s*(?:[:=]|$)|(["'])([A-Za-z_][\\w.-]*)\\2\\s*:)`);
  }
});

// src/blueprint/paths.ts
function toPosix(value) {
  return value.replace(/\\/g, "/");
}
function normalize(value) {
  const input = toPosix(value);
  const absolute = input.startsWith("/");
  const parts = [];
  for (const segment of input.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join("/");
  return absolute ? `/${joined}` : joined || ".";
}
function join(...segments) {
  return normalize(segments.filter((segment) => segment.length > 0).join("/"));
}
function dirname(value) {
  const normalized = toPosix(value).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}
function basename(value, extension) {
  const normalized = toPosix(value).replace(/\/+$/, "");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (extension && base.endsWith(extension) && base !== extension) return base.slice(0, -extension.length);
  return base;
}
function extname(value) {
  const base = basename(value);
  const index = base.lastIndexOf(".");
  return index <= 0 ? "" : base.slice(index);
}
function repoPath(value) {
  const normalized = normalize(value);
  return normalized === "." ? "" : normalized.replace(/^\.\//, "");
}
function ancestors(filePath) {
  const result = [];
  let current = dirname(filePath);
  while (current !== "." && current !== "/" && current !== "") {
    result.push(current);
    current = dirname(current);
  }
  result.push("");
  return result;
}
function isWithin(filePath, directory) {
  if (!directory) return true;
  return filePath === directory || filePath.startsWith(`${directory}/`);
}
var init_paths = __esm({
  "src/blueprint/paths.ts"() {
    "use strict";
  }
});

// src/blueprint/imports.ts
function languageOf(path) {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1).toLowerCase()] ?? null;
}
function isTestPath(path) {
  return matchesAny(path, TEST_PATTERNS);
}
function isIgnoredPath(path, extraIgnore) {
  return matchesAny(path, DEFAULT_IGNORE) || matchesAny(path, extraIgnore);
}
function isWordChar(char) {
  return char !== void 0 && /[\w$]/.test(char);
}
function maskSource(src, flavor) {
  const n = src.length;
  let out = "";
  let copied = 0;
  let i = 0;
  let lastSig = -1;
  let lastWasLiteral = false;
  const templateDepth = [];
  const blank = (from, to, fill) => {
    if (to <= from) return;
    out += src.slice(copied, from) + src.slice(from, to).replace(NOT_NEWLINE, fill);
    copied = to;
  };
  const endLiteral = (end) => {
    lastSig = end - 1;
    lastWasLiteral = true;
    return end;
  };
  const scanQuoted = (start, quote2) => {
    let j = start + 1;
    while (j < n) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === quote2 || c === "\n") break;
      j += 1;
    }
    j = Math.min(j, n);
    blank(start + 1, j, FILL);
    return endLiteral(src[j] === quote2 ? j + 1 : j);
  };
  const scanDelimited = (bodyStart, close) => {
    const found = src.indexOf(close, bodyStart);
    blank(bodyStart, found < 0 ? n : found, FILL);
    return endLiteral(found < 0 ? n : found + close.length);
  };
  const scanTemplate = (bodyStart) => {
    let j = bodyStart;
    while (j < n) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "`") {
        blank(bodyStart, j, FILL);
        return endLiteral(j + 1);
      }
      if (c === "$" && src[j + 1] === "{") {
        blank(bodyStart, j, FILL);
        templateDepth.push(0);
        lastSig = j + 1;
        lastWasLiteral = false;
        return j + 2;
      }
      j += 1;
    }
    blank(bodyStart, n, FILL);
    return n;
  };
  const regexAllowed = () => {
    if (lastSig < 0) return true;
    if (lastWasLiteral) return false;
    const prev = src[lastSig];
    if (isWordChar(prev)) {
      let start = lastSig;
      while (start > 0 && isWordChar(src[start - 1])) start -= 1;
      return REGEX_PRECEDING_KEYWORDS.has(src.slice(start, lastSig + 1));
    }
    return !(prev === ")" || prev === "]" || prev === "}" || prev === "<");
  };
  const scanRegex = (start) => {
    let j = start + 1;
    let inClass = false;
    while (j < n) {
      const c = src[j];
      if (c === "\n") return -1;
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (inClass) {
        if (c === "]") inClass = false;
      } else if (c === "[") {
        inClass = true;
      } else if (c === "/") {
        return j > start + 1 ? j + 1 : -1;
      }
      j += 1;
    }
    return -1;
  };
  if (src.startsWith("#!")) {
    const end = src.indexOf("\n");
    i = end < 0 ? n : end;
    blank(0, i, " ");
  }
  while (i < n) {
    const c = src[i];
    if (c === "/" && flavor.slashComments) {
      const next = src[i + 1];
      if (next === "/") {
        const nl = src.indexOf("\n", i);
        const end = nl < 0 ? n : nl;
        blank(i, end, " ");
        i = end;
        continue;
      }
      if (next === "*") {
        let end;
        if (flavor.nestedBlocks) {
          let depth = 1;
          let j = i + 2;
          while (j < n && depth > 0) {
            if (src[j] === "/" && src[j + 1] === "*") {
              depth += 1;
              j += 2;
            } else if (src[j] === "*" && src[j + 1] === "/") {
              depth -= 1;
              j += 2;
            } else {
              j += 1;
            }
          }
          end = Math.min(j, n);
        } else {
          const close = src.indexOf("*/", i + 2);
          end = close < 0 ? n : close + 2;
        }
        blank(i, end, " ");
        i = end;
        continue;
      }
      if (flavor.regex && regexAllowed()) {
        const end = scanRegex(i);
        if (end > 0) {
          blank(i + 1, end - 1, FILL);
          i = endLiteral(end);
          continue;
        }
      }
    }
    if (c === "#" && flavor.hashComments) {
      const nl = src.indexOf("\n", i);
      const end = nl < 0 ? n : nl;
      blank(i, end, " ");
      i = end;
      continue;
    }
    if (c === '"') {
      if (flavor.rustRaw) {
        let hashes = 0;
        while (src[i - 1 - hashes] === "#") hashes += 1;
        const r = i - 1 - hashes;
        if (src[r] === "r" && (!isWordChar(src[r - 1]) || src[r - 1] === "b" && !isWordChar(src[r - 2]))) {
          i = scanDelimited(i + 1, `"${"#".repeat(hashes)}`);
          continue;
        }
      }
      if (flavor.tripleDouble && src.startsWith('"""', i)) {
        i = scanDelimited(i + 3, '"""');
        continue;
      }
      i = scanQuoted(i, '"');
      continue;
    }
    if (c === "'") {
      if (flavor.singleQuote === "string") {
        if (flavor.tripleSingle && src.startsWith("'''", i)) {
          i = scanDelimited(i + 3, "'''");
          continue;
        }
        i = scanQuoted(i, "'");
        continue;
      }
      if (src[i + 1] === "\\") {
        const close = src.indexOf("'", i + 3);
        if (close > 0 && close - i <= 12 && !src.slice(i, close).includes("\n")) {
          blank(i + 1, close, FILL);
          i = endLiteral(close + 1);
          continue;
        }
      } else if (src[i + 2] === "'" && src[i + 1] !== "\n") {
        blank(i + 1, i + 2, FILL);
        i = endLiteral(i + 3);
        continue;
      } else if (src[i + 3] === "'" && src.charCodeAt(i + 1) >= 55296 && src.charCodeAt(i + 1) <= 56319) {
        blank(i + 1, i + 3, FILL);
        i = endLiteral(i + 4);
        continue;
      }
    }
    if (c === "`" && flavor.backtick !== "none") {
      i = flavor.backtick === "template" ? scanTemplate(i + 1) : scanDelimited(i + 1, "`");
      continue;
    }
    if (templateDepth.length > 0) {
      const top = templateDepth.length - 1;
      if (c === "{") {
        templateDepth[top] += 1;
      } else if (c === "}") {
        if (templateDepth[top] === 0) {
          templateDepth.pop();
          i = scanTemplate(i + 1);
          continue;
        }
        templateDepth[top] -= 1;
      }
    }
    if (c > " ") {
      lastSig = i;
      lastWasLiteral = false;
    }
    i += 1;
  }
  return copied === 0 ? src : out + src.slice(copied);
}
function readString(masked, src, quoteIndex) {
  const quote2 = masked[quoteIndex];
  if (quote2 !== '"' && quote2 !== "'" && quote2 !== "`") return null;
  let j = quoteIndex + 1;
  while (masked[j] === FILL) j += 1;
  if (masked[j] !== quote2 || j === quoteIndex + 1) return null;
  return { value: src.slice(quoteIndex + 1, j), end: j + 1 };
}
function createLineLocator(text3) {
  const starts = [0];
  for (let i = text3.indexOf("\n"); i >= 0; i = text3.indexOf("\n", i + 1)) starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = low + high + 1 >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}
function makeImport(specifier, line, kind, typeOnly = false) {
  return { specifier, line, kind, typeOnly };
}
function stickyMatch(pattern2, text3, at) {
  pattern2.lastIndex = at;
  return pattern2.exec(text3);
}
function atStatementStart(masked, at) {
  let j = at - 1;
  while (j >= 0 && (masked[j] === " " || masked[j] === "	" || masked[j] === "\r" || masked[j] === "\uFEFF")) j -= 1;
  if (j < 0) return true;
  const prev = masked[j];
  return prev === "\n" || prev === ";" || prev === "{" || prev === "}";
}
function isInlineTypeOnly(clause) {
  const trimmed = clause.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  const bindings = trimmed.slice(1, -1).split(",").map((binding) => binding.trim()).filter(Boolean);
  if (bindings.length === 0) return false;
  return bindings.every((binding) => /^type\s+\S/.test(binding) && !/^type\s+as\s+[\w$]+$/.test(binding));
}
function extractJs(content) {
  const masked = maskSource(content, JS_FLAVOR);
  const lineAt2 = createLineLocator(masked);
  const imports = [];
  const stringAt = (index) => readString(masked, content, index);
  JS_KEYWORD.lastIndex = 0;
  let match;
  while ((match = JS_KEYWORD.exec(masked)) !== null) {
    const at = match.index;
    const after = at + match[0].length;
    if (masked[at - 1] === "." && masked[at - 2] !== ".") continue;
    const keyword = match[1];
    const line = lineAt2(at);
    if (keyword === "require" || keyword === "import") {
      const call = stickyMatch(JS_CALL_OPEN, masked, after);
      if (call) {
        const literal2 = stringAt(JS_CALL_OPEN.lastIndex);
        if (literal2 && stickyMatch(JS_CALL_CLOSE, masked, literal2.end)) {
          imports.push(makeImport(literal2.value, line, keyword === "require" ? "require" : "dynamic"));
        }
        continue;
      }
      if (keyword === "require") continue;
    }
    if (!atStatementStart(masked, at)) continue;
    if (keyword === "import") {
      if (stickyMatch(JS_SIDE_EFFECT, masked, after)) {
        const literal2 = stringAt(JS_SIDE_EFFECT.lastIndex);
        if (literal2) imports.push(makeImport(literal2.value, line, "side-effect"));
        continue;
      }
      const clause2 = stickyMatch(JS_IMPORT_CLAUSE, masked, after);
      if (clause2) {
        const literal2 = stringAt(JS_IMPORT_CLAUSE.lastIndex);
        if (literal2) {
          const typeOnly = Boolean(clause2[1]) || isInlineTypeOnly(clause2[2]);
          imports.push(makeImport(literal2.value, line, "static", typeOnly));
        }
      }
      continue;
    }
    const clause = stickyMatch(JS_EXPORT_CLAUSE, masked, after);
    if (clause) {
      const literal2 = stringAt(JS_EXPORT_CLAUSE.lastIndex);
      if (literal2) {
        const typeOnly = Boolean(clause[1]) || isInlineTypeOnly(clause[2]);
        imports.push(makeImport(literal2.value, line, "reexport", typeOnly));
      }
    }
  }
  return imports;
}
function extractPython(content) {
  const masked = maskSource(content, PYTHON_FLAVOR);
  const lineAt2 = createLineLocator(masked);
  const found = [];
  let order = 0;
  const keywordOffset = (match2) => match2.index + match2[0].search(/\S/);
  let match;
  PY_IMPORT.lastIndex = 0;
  while ((match = PY_IMPORT.exec(masked)) !== null) {
    const at = keywordOffset(match);
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+/)[0];
      if (/^[A-Za-z_][\w.]*$/.test(name)) found.push({ at, order: order++, item: makeImport(name, lineAt2(at), "static") });
    }
  }
  PY_FROM.lastIndex = 0;
  while ((match = PY_FROM.exec(masked)) !== null) {
    const moduleName = match[1];
    if (!moduleName || !/^\.*(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)?$/.test(moduleName)) continue;
    const at = keywordOffset(match);
    const line = lineAt2(at);
    const names = match[2].replace(/[()\\]/g, " ").split(",").map((part) => part.trim().split(/\s+/)[0]).filter((name) => name === "*" || /^[A-Za-z_]\w*$/.test(name));
    for (const name of names) {
      const specifier = name === "*" ? moduleName : `${moduleName}:${name}`;
      found.push({ at, order: order++, item: makeImport(specifier, line, "static") });
    }
  }
  return found.sort((a, b) => a.at - b.at || a.order - b.order).map((entry) => entry.item);
}
function extractGo(content) {
  const masked = maskSource(content, GO_FLAVOR);
  const lineAt2 = createLineLocator(masked);
  const imports = [];
  GO_IMPORT.lastIndex = 0;
  let match;
  while ((match = GO_IMPORT.exec(masked)) !== null) {
    const start = GO_IMPORT.lastIndex;
    if (!match[1]) {
      const literal2 = readString(masked, content, start);
      if (literal2) imports.push(makeImport(literal2.value, lineAt2(start), "static"));
      continue;
    }
    const close = masked.indexOf(")", start);
    const end = close < 0 ? masked.length : close;
    GO_GROUP_ENTRY.lastIndex = start;
    let quote2;
    while ((quote2 = GO_GROUP_ENTRY.exec(masked)) !== null && quote2.index < end) {
      const literal2 = readString(masked, content, quote2.index);
      if (!literal2) continue;
      imports.push(makeImport(literal2.value, lineAt2(quote2.index), "static"));
      GO_GROUP_ENTRY.lastIndex = literal2.end;
    }
    GO_IMPORT.lastIndex = end;
  }
  return imports;
}
function extractJvm(content, flavor) {
  const masked = maskSource(content, flavor);
  const lineAt2 = createLineLocator(masked);
  const imports = [];
  JVM_IMPORT.lastIndex = 0;
  let match;
  while ((match = JVM_IMPORT.exec(masked)) !== null) {
    const specifier = match[1];
    const at = match.index + match[0].indexOf("import");
    if (specifier.includes(".")) imports.push(makeImport(specifier, lineAt2(at), "static"));
  }
  return imports;
}
function splitTopLevel2(text3) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text3.length; i += 1) {
    const c = text3[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(text3.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text3.slice(start));
  return parts;
}
function joinRustPath(prefix, rest) {
  if (!prefix) return rest;
  return rest ? `${prefix}::${rest}` : prefix;
}
function expandUseTree(tree, prefix, out) {
  const text3 = tree.trim().replace(/^::/, "");
  const open2 = text3.indexOf("{");
  if (open2 < 0) {
    let path = text3.replace(/\s+as\s+\w+$/, "").replace(/\s+/g, "");
    if (path === "self" && prefix) path = "";
    else if (path === "*") path = "";
    else path = path.replace(/::\*$/, "");
    const full = joinRustPath(prefix, path);
    if (/^\w+(?:::\w+)*$/.test(full)) out.push(full);
    return;
  }
  const head = text3.slice(0, open2).replace(/\s+/g, "").replace(/::$/, "");
  const close = text3.lastIndexOf("}");
  const inner = text3.slice(open2 + 1, close < 0 ? void 0 : close);
  for (const part of splitTopLevel2(inner)) {
    if (part.trim()) expandUseTree(part, joinRustPath(prefix, head), out);
  }
}
function extractRust(content) {
  const masked = maskSource(content, RUST_FLAVOR);
  const lineAt2 = createLineLocator(masked);
  const imports = [];
  RUST_STATEMENT.lastIndex = 0;
  let match;
  while ((match = RUST_STATEMENT.exec(masked)) !== null) {
    const line = lineAt2(match.index);
    if (match[3]) {
      imports.push(makeImport(match[4], line, "mod"));
    } else if (match[5]) {
      imports.push(makeImport(match[6], line, "use"));
    } else {
      const leaves = [];
      expandUseTree(match[2], "", leaves);
      for (const leaf of new Set(leaves)) {
        if (/^[A-Z]/.test(leaf)) continue;
        imports.push(makeImport(leaf, line, "use"));
      }
    }
  }
  return imports;
}
function extractC(content) {
  const masked = maskSource(content, C_FLAVOR);
  const lineAt2 = createLineLocator(masked);
  const imports = [];
  C_INCLUDE.lastIndex = 0;
  while (C_INCLUDE.exec(masked) !== null) {
    const open2 = C_INCLUDE.lastIndex;
    const line = lineAt2(open2);
    if (masked[open2] === '"') {
      const literal2 = readString(masked, content, open2);
      if (literal2) imports.push(makeImport(literal2.value, line, "include"));
      continue;
    }
    const close = masked.indexOf(">", open2);
    const newline = masked.indexOf("\n", open2);
    if (close > open2 + 1 && (newline < 0 || close < newline)) {
      imports.push(makeImport(`<${content.slice(open2 + 1, close).trim()}>`, line, "include"));
    }
  }
  return imports;
}
function extractRuby(content) {
  const imports = [];
  let inBlockComment = false;
  content.split("\n").forEach((text3, index) => {
    if (inBlockComment) {
      if (/^=end\b/.test(text3)) inBlockComment = false;
      return;
    }
    if (/^=begin\b/.test(text3)) {
      inBlockComment = true;
      return;
    }
    const match = RUBY_REQUIRE.exec(text3);
    if (!match) return;
    if (match[1] === "require_relative") {
      const target = match[3].startsWith(".") ? match[3] : `./${match[3]}`;
      imports.push(makeImport(target, index + 1, "static"));
    } else {
      imports.push(makeImport(match[3], index + 1, "require"));
    }
  });
  return imports;
}
function extractImports(path, content) {
  switch (languageOf(path)) {
    case "typescript":
    case "javascript":
      return extractJs(content);
    case "python":
      return extractPython(content);
    case "go":
      return extractGo(content);
    case "java":
      return extractJvm(content, JAVA_FLAVOR);
    case "kotlin":
      return extractJvm(content, KOTLIN_FLAVOR);
    case "rust":
      return extractRust(content);
    case "c":
    case "cpp":
      return extractC(content);
    case "ruby":
      return extractRuby(content);
    default:
      return [];
  }
}
function normalizeJsPackage(specifier) {
  let spec = specifier.replace(/\?.*$/, "");
  if (spec.startsWith("node:")) return `node:${spec.slice(5).split("/")[0]}`;
  if (spec.startsWith("npm:")) spec = spec.slice(4).replace(/^(@?[^@]+)@[^/]*/, "$1");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return spec;
  const segments = spec.split("/");
  const name = spec.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  return NODE_BUILTINS.has(name) ? `node:${name}` : name;
}
function normalizeGoPackage(specifier) {
  const segments = specifier.split("/");
  if (!segments[0].includes(".")) return `go:${specifier}`;
  return segments.slice(0, segments[0] === "gopkg.in" ? 2 : 3).join("/");
}
function normalizeJvmPackage(specifier) {
  const segments = specifier.replace(/\.\*$/, "").split(".");
  if (segments[0] === "java" || segments[0] === "javax") return `jdk:${segments[0]}`;
  if (segments[0] === "kotlin") return "kotlin:stdlib";
  return segments.slice(0, 2).join(".");
}
function normalizePackageName(specifier, language) {
  switch (language) {
    case "typescript":
    case "javascript":
      return normalizeJsPackage(specifier);
    case "python":
      return specifier.split(":")[0].replace(/^\.+/, "").split(".")[0] || specifier;
    case "go":
      return normalizeGoPackage(specifier);
    case "java":
    case "kotlin":
      return normalizeJvmPackage(specifier);
    case "rust": {
      const crate = specifier.replace(/^::/, "").split("::")[0].replace(/-/g, "_");
      return crate === "std" || crate === "core" || crate === "alloc" ? "rust:std" : crate;
    }
    case "c":
    case "cpp":
      return `c:${specifier.replace(/^<|>$/g, "")}`;
    case "ruby":
      return specifier.split("/")[0];
    default:
      return specifier;
  }
}
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function cleanPath(path) {
  return toPosix(path).replace(/^(?:\.\/)+/, "");
}
function rel(...segments) {
  const joined = join(...segments);
  return joined === "." ? "" : joined;
}
function parentDir(path) {
  const dir = dirname(path);
  return dir === "." ? "" : dir;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createResolveContext(files) {
  const fileSet = /* @__PURE__ */ new Set();
  const dirs = /* @__PURE__ */ new Set([""]);
  const contents = /* @__PURE__ */ new Map();
  for (const file2 of files) {
    const path = cleanPath(file2.path);
    fileSet.add(path);
    if (file2.content !== null) contents.set(path, file2.content);
    for (const dir of ancestors(path)) {
      if (dirs.has(dir)) break;
      dirs.add(dir);
    }
  }
  return {
    files: fileSet,
    dirs,
    sorted: [...fileSet].sort(compare),
    contents,
    aliasesByConfig: /* @__PURE__ */ new Map(),
    aliasesByDir: /* @__PURE__ */ new Map()
  };
}
function resolveJsFile(ctx, base) {
  if (base.startsWith("..")) return null;
  if (base && ctx.files.has(base)) return base;
  for (const [from, to] of JS_EXTENSION_SWAPS) {
    if (!base.endsWith(from)) continue;
    const stem = base.slice(0, -from.length);
    for (const extension of to) {
      if (ctx.files.has(stem + extension)) return stem + extension;
    }
    break;
  }
  if (base) {
    for (const extension of JS_EXTENSIONS) {
      if (ctx.files.has(base + extension)) return base + extension;
    }
  }
  if (ctx.dirs.has(base)) {
    const prefix = base ? `${base}/index` : "index";
    for (const extension of JS_EXTENSIONS) {
      if (ctx.files.has(prefix + extension)) return prefix + extension;
    }
  }
  return null;
}
function parseJsonc(input) {
  const text3 = input.charCodeAt(0) === 65279 ? input.slice(1) : input;
  const n = text3.length;
  let out = "";
  let commaAt = -1;
  let i = 0;
  while (i < n) {
    const c = text3[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text3[j] !== '"') j += text3[j] === "\\" ? 2 : 1;
      out += text3.slice(i, j + 1);
      commaAt = -1;
      i = j + 1;
    } else if (c === "/" && text3[i + 1] === "/") {
      const nl = text3.indexOf("\n", i);
      i = nl < 0 ? n : nl;
    } else if (c === "/" && text3[i + 1] === "*") {
      const close = text3.indexOf("*/", i + 2);
      i = close < 0 ? n : close + 2;
    } else {
      if ((c === "}" || c === "]") && commaAt >= 0) out = out.slice(0, commaAt) + out.slice(commaAt + 1);
      if (c === ",") commaAt = out.length;
      else if (c > " ") commaAt = -1;
      out += c;
      i += 1;
    }
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}
function findConfigFile(ctx, reference) {
  for (const candidate of [reference, `${reference}.json`, rel(reference, "tsconfig.json")]) {
    if (candidate.endsWith(".json") && ctx.contents.has(candidate)) return candidate;
  }
  return null;
}
function loadConfigJson(ctx, configPath) {
  const text3 = ctx.contents.get(configPath);
  if (text3 === void 0) return null;
  const json2 = parseJsonc(text3);
  return isRecord(json2) ? json2 : null;
}
function loadConfigLayer(ctx, configPath, depth) {
  const json2 = loadConfigJson(ctx, configPath);
  if (!json2) return null;
  const dir = parentDir(configPath);
  const layer = { pathsDir: dir };
  const parents = typeof json2.extends === "string" ? [json2.extends] : Array.isArray(json2.extends) ? json2.extends : [];
  for (const parent of parents) {
    if (typeof parent !== "string" || !parent.startsWith(".") || depth >= MAX_EXTENDS_DEPTH) continue;
    const parentPath = findConfigFile(ctx, rel(dir, parent));
    const inherited = parentPath ? loadConfigLayer(ctx, parentPath, depth + 1) : null;
    if (!inherited) continue;
    if (inherited.baseDir !== void 0) layer.baseDir = inherited.baseDir;
    if (inherited.paths) {
      layer.paths = inherited.paths;
      layer.pathsDir = inherited.pathsDir;
    }
  }
  const options = isRecord(json2.compilerOptions) ? json2.compilerOptions : {};
  if (typeof options.baseUrl === "string") layer.baseDir = rel(dir, options.baseUrl);
  if (isRecord(options.paths)) {
    const paths = {};
    for (const [pattern2, targets] of Object.entries(options.paths)) {
      if (Array.isArray(targets)) paths[pattern2] = targets.filter((target) => typeof target === "string");
    }
    layer.paths = paths;
    layer.pathsDir = dir;
  }
  return layer;
}
function loadAliases(ctx, configPath) {
  const cached2 = ctx.aliasesByConfig.get(configPath);
  if (cached2 !== void 0) return cached2;
  let layer = loadConfigLayer(ctx, configPath, 0);
  if (layer && !layer.paths && layer.baseDir === void 0) {
    const json2 = loadConfigJson(ctx, configPath);
    const references = json2 && Array.isArray(json2.references) ? json2.references : [];
    for (const reference of references) {
      if (!isRecord(reference) || typeof reference.path !== "string") continue;
      const referenced = findConfigFile(ctx, rel(parentDir(configPath), reference.path));
      const candidate = referenced ? loadConfigLayer(ctx, referenced, 1) : null;
      if (candidate?.paths) {
        layer = candidate;
        break;
      }
    }
  }
  let aliases = null;
  if (layer) {
    const pathsBase = layer.baseDir ?? layer.pathsDir;
    const patterns = [];
    for (const [pattern2, targets] of Object.entries(layer.paths ?? {})) {
      const star = pattern2.indexOf("*");
      patterns.push({
        prefix: star < 0 ? pattern2 : pattern2.slice(0, star),
        suffix: star < 0 ? "" : pattern2.slice(star + 1),
        wildcard: star >= 0,
        targets: targets.map((target) => rel(pathsBase, target))
      });
    }
    patterns.sort(
      (a, b) => Number(a.wildcard) - Number(b.wildcard) || b.prefix.length - a.prefix.length || compare(a.prefix, b.prefix)
    );
    aliases = { baseDir: layer.baseDir ?? null, patterns };
  }
  ctx.aliasesByConfig.set(configPath, aliases);
  return aliases;
}
function nearestAliases(ctx, fromPath) {
  const startDir = parentDir(fromPath);
  const cached2 = ctx.aliasesByDir.get(startDir);
  if (cached2 !== void 0) return cached2;
  let result = null;
  for (const dir of ancestors(fromPath)) {
    const config2 = [rel(dir, "tsconfig.json"), rel(dir, "jsconfig.json")].find((path) => ctx.contents.has(path));
    if (config2) {
      result = loadAliases(ctx, config2);
      break;
    }
  }
  ctx.aliasesByDir.set(startDir, result);
  return result;
}
function workspacePackages(ctx) {
  if (ctx.packages) return ctx.packages;
  const packages = /* @__PURE__ */ new Map();
  for (const path of ctx.sorted) {
    if (!path.endsWith("package.json") || basename(path) !== "package.json") continue;
    const text3 = ctx.contents.get(path);
    if (text3 === void 0) continue;
    let manifest;
    try {
      manifest = JSON.parse(text3);
    } catch {
      manifest = parseJsonc(text3);
    }
    if (isRecord(manifest) && typeof manifest.name === "string" && manifest.name && !packages.has(manifest.name)) {
      packages.set(manifest.name, { dir: parentDir(path), manifest });
    }
  }
  ctx.packages = packages;
  return packages;
}
function collectExportTargets(entry, out, depth = 0) {
  if (typeof entry === "string") {
    out.push(entry);
  } else if (Array.isArray(entry)) {
    for (const item of entry) collectExportTargets(item, out, depth + 1);
  } else if (isRecord(entry) && depth < 6) {
    const keys = Object.keys(entry);
    const ordered = [...EXPORT_CONDITIONS.filter((key) => key in entry), ...keys.filter((key) => !EXPORT_CONDITIONS.includes(key))];
    for (const key of ordered) collectExportTargets(entry[key], out, depth + 1);
  }
}
function exportTargets(manifest, subpath) {
  const out = [];
  const exportsField = manifest.exports;
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    if (!subpath) collectExportTargets(exportsField, out);
    return out;
  }
  if (!isRecord(exportsField)) return out;
  const keys = Object.keys(exportsField);
  if (!keys.some((key) => key.startsWith("."))) {
    if (!subpath) collectExportTargets(exportsField, out);
    return out;
  }
  const wanted = subpath ? `./${subpath}` : ".";
  if (wanted in exportsField) {
    collectExportTargets(exportsField[wanted], out);
    return out;
  }
  for (const key of keys) {
    const star = key.indexOf("*");
    if (star < 0) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (wanted.length < prefix.length + suffix.length || !wanted.startsWith(prefix) || !wanted.endsWith(suffix)) continue;
    const captured = wanted.slice(prefix.length, wanted.length - suffix.length);
    const targets = [];
    collectExportTargets(exportsField[key], targets);
    out.push(...targets.map((target) => target.split("*").join(captured)));
  }
  return out;
}
function resolveWorkspaceImport(ctx, pkg, subpath) {
  const candidates = exportTargets(pkg.manifest, subpath);
  if (subpath) {
    candidates.push(subpath, `src/${subpath}`);
  } else {
    for (const field of ["source", "module", "main", "types", "typings"]) {
      const value = pkg.manifest[field];
      if (typeof value === "string") candidates.push(value);
    }
    candidates.push("src/index", "index");
  }
  for (const candidate of candidates) {
    const direct = resolveJsFile(ctx, rel(pkg.dir, candidate));
    if (direct) return direct;
    const source = cleanPath(candidate).replace(/^(?:dist|build|lib|out)\//, "src/");
    if (source !== cleanPath(candidate)) {
      const mapped = resolveJsFile(ctx, rel(pkg.dir, source));
      if (mapped) return mapped;
    }
  }
  return null;
}
function internal(target) {
  return { kind: "internal", target };
}
function resolveJs(fromPath, specifier, ctx) {
  const spec = specifier.replace(/\?.*$/, "");
  const fromDir = parentDir(fromPath);
  if (spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../")) {
    const target = resolveJsFile(ctx, rel(fromDir, spec));
    return target ? internal(target) : UNRESOLVED;
  }
  if (spec.startsWith("/")) {
    const target = resolveJsFile(ctx, rel(spec.slice(1))) ?? resolveJsFile(ctx, rel("public", spec.slice(1)));
    return target ? internal(target) : UNRESOLVED;
  }
  let aliasMissed = false;
  const aliases = nearestAliases(ctx, fromPath);
  if (aliases) {
    const pattern2 = aliases.patterns.find(
      (candidate) => candidate.wildcard ? spec.length >= candidate.prefix.length + candidate.suffix.length && spec.startsWith(candidate.prefix) && spec.endsWith(candidate.suffix) : spec === candidate.prefix
    );
    if (pattern2) {
      const captured = pattern2.wildcard ? spec.slice(pattern2.prefix.length, spec.length - pattern2.suffix.length) : "";
      for (const target of pattern2.targets) {
        const resolved = resolveJsFile(ctx, target.split("*").join(captured));
        if (resolved) return internal(resolved);
      }
      aliasMissed = (pattern2.prefix.length > 0 || !pattern2.wildcard) && !pattern2.targets.every((target) => target.includes("node_modules"));
    }
    if (aliases.baseDir !== null) {
      const resolved = resolveJsFile(ctx, rel(aliases.baseDir, spec));
      if (resolved) return internal(resolved);
    }
  }
  const segments = spec.split("/");
  const packageName = spec.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  const workspace = workspacePackages(ctx).get(packageName);
  if (workspace) {
    const subpath = spec.slice(packageName.length + 1);
    const target = resolveWorkspaceImport(ctx, workspace, subpath);
    return target ? internal(target) : UNRESOLVED;
  }
  if (spec.startsWith("@/") || spec.startsWith("~/")) {
    const rest = spec.slice(2);
    const searchDirs = ancestors(fromPath);
    for (const dir of searchDirs) {
      const target = resolveJsFile(ctx, rel(dir, "src", rest));
      if (target) return internal(target);
    }
    if (spec.startsWith("~/")) {
      for (const dir of searchDirs) {
        const target = resolveJsFile(ctx, rel(dir, rest));
        if (target) return internal(target);
      }
    }
    return UNRESOLVED;
  }
  if (aliasMissed || spec.startsWith("#")) return UNRESOLVED;
  return { kind: "external", pkg: normalizeJsPackage(spec) };
}
function pythonIndex(ctx) {
  if (ctx.python) return ctx.python;
  const roots = ["", "src"];
  const dirs = /* @__PURE__ */ new Set();
  for (const path of ctx.sorted) {
    const base = basename(path);
    if (base === "pyproject.toml" || base === "setup.py" || base === "setup.cfg") {
      const dir = parentDir(path);
      roots.push(dir, rel(dir, "src"));
    }
    if (path.endsWith(".py")) {
      for (const dir of ancestors(path)) {
        if (dirs.has(dir)) break;
        dirs.add(dir);
      }
    }
  }
  const unique = [...new Set(roots)];
  ctx.python = { roots: unique, rootSet: new Set(unique), dirs };
  return ctx.python;
}
function child(base, name) {
  return base ? `${base}/${name}` : name;
}
function pythonModule(ctx, base, name) {
  const candidates = [];
  if (name) candidates.push(child(base, `${name}.py`), child(base, `${name}/__init__.py`));
  if (base) candidates.push(`${base}.py`);
  candidates.push(child(base, "__init__.py"));
  return candidates.find((candidate) => ctx.files.has(candidate)) ?? null;
}
function resolvePython(fromPath, specifier, ctx) {
  const colon = specifier.indexOf(":");
  const modulePart = colon < 0 ? specifier : specifier.slice(0, colon);
  const name = colon < 0 ? null : specifier.slice(colon + 1);
  const level = /^\.*/.exec(modulePart)?.[0].length ?? 0;
  const segments = modulePart.slice(level).split(".").filter(Boolean);
  if (level > 0) {
    let base = parentDir(fromPath);
    for (let up = 1; up < level; up += 1) {
      if (!base) return UNRESOLVED;
      base = parentDir(base);
    }
    const target = pythonModule(ctx, rel(base, ...segments), name);
    return target ? internal(target) : UNRESOLVED;
  }
  if (segments.length === 0) return UNRESOLVED;
  const index = pythonIndex(ctx);
  const modulePath = segments.join("/");
  for (const root of index.roots) {
    const target = pythonModule(ctx, child(root, modulePath), name);
    if (target) return internal(target);
  }
  if (!PYTHON_STDLIB.has(segments[0])) {
    for (const root of ancestors(fromPath)) {
      if (index.rootSet.has(root)) continue;
      const target = pythonModule(ctx, child(root, modulePath), name);
      if (target) return internal(target);
    }
  }
  for (const root of index.roots) {
    const top = child(root, segments[0]);
    if (ctx.files.has(`${top}.py`) || index.dirs.has(top)) return UNRESOLVED;
  }
  return { kind: "external", pkg: segments[0] };
}
function goIndex(ctx) {
  if (ctx.go) return ctx.go;
  const modules = [];
  const filesByDir = /* @__PURE__ */ new Map();
  for (const path of ctx.sorted) {
    if (basename(path) === "go.mod") {
      const match = /^[ \t]*module[ \t]+"?([^\s"]+)"?/m.exec(ctx.contents.get(path) ?? "");
      if (match) modules.push({ path: match[1], dir: parentDir(path) });
    } else if (path.endsWith(".go")) {
      const dir = parentDir(path);
      const list = filesByDir.get(dir);
      if (list) list.push(path);
      else filesByDir.set(dir, [path]);
    }
  }
  modules.sort((a, b) => b.path.length - a.path.length || compare(a.path, b.path));
  ctx.go = { modules, filesByDir };
  return ctx.go;
}
function resolveGo(specifier, ctx) {
  const index = goIndex(ctx);
  const goModule = index.modules.find((candidate) => specifier === candidate.path || specifier.startsWith(`${candidate.path}/`));
  if (!goModule) return { kind: "external", pkg: normalizeGoPackage(specifier) };
  const dir = rel(goModule.dir, specifier.slice(goModule.path.length + 1));
  const files = index.filesByDir.get(dir);
  if (!files?.length) return UNRESOLVED;
  return internal(files.find((file2) => !file2.endsWith("_test.go")) ?? files[0]);
}
function jvmIndex(ctx) {
  if (ctx.jvm) return ctx.jvm;
  const index = { byStem: /* @__PURE__ */ new Map(), byDeclaration: /* @__PURE__ */ new Map(), firstInPackage: /* @__PURE__ */ new Map() };
  const setOnce = (map2, key, value) => {
    if (!map2.has(key)) map2.set(key, value);
  };
  for (const path of ctx.sorted) {
    const isKotlin = path.endsWith(".kt") || path.endsWith(".kts");
    if (!isKotlin && !path.endsWith(".java")) continue;
    const content = ctx.contents.get(path);
    if (content === void 0) continue;
    const pkg = JVM_PACKAGE.exec(content)?.[1] ?? "";
    const qualify = (name) => pkg ? `${pkg}.${name}` : name;
    setOnce(index.firstInPackage, pkg, path);
    setOnce(index.byStem, qualify(basename(path).replace(/\.[^.]+$/, "")), path);
    for (const pattern2 of isKotlin ? [JVM_TYPE_DECLARATION, KOTLIN_TOP_LEVEL] : [JVM_TYPE_DECLARATION]) {
      pattern2.lastIndex = 0;
      let match;
      while ((match = pattern2.exec(content)) !== null) setOnce(index.byDeclaration, qualify(match[1]), path);
    }
  }
  ctx.jvm = index;
  return index;
}
function resolveJvm(specifier, ctx) {
  const index = jvmIndex(ctx);
  const wildcard = specifier.endsWith(".*");
  const name = wildcard ? specifier.slice(0, -2) : specifier;
  if (wildcard) {
    const first = index.firstInPackage.get(name);
    if (first) return internal(first);
  }
  const segments = name.split(".");
  for (let length = segments.length; length >= 1; length -= 1) {
    const qualified = segments.slice(0, length).join(".");
    const target = index.byStem.get(qualified) ?? index.byDeclaration.get(qualified);
    if (target) return internal(target);
  }
  for (let length = wildcard ? segments.length : segments.length - 1; length >= 1; length -= 1) {
    if (index.firstInPackage.has(segments.slice(0, length).join("."))) return UNRESOLVED;
  }
  return { kind: "external", pkg: normalizeJvmPackage(specifier) };
}
function rustIndex(ctx) {
  if (ctx.rust) return ctx.rust;
  const index = { byName: /* @__PURE__ */ new Map(), byDir: /* @__PURE__ */ new Map() };
  for (const path of ctx.sorted) {
    if (basename(path) !== "Cargo.toml") continue;
    const section2 = /^\[package\][^\n]*\n([^]*?)(?=^\[|(?![^]))/m.exec(ctx.contents.get(path) ?? "");
    const name = section2 ? /^[ \t]*name[ \t]*=[ \t]*["']([^"']+)["']/m.exec(section2[1])?.[1] : void 0;
    if (!name) continue;
    const dir = parentDir(path);
    const srcDir = rel(dir, "src");
    const root = [child(srcDir, "lib.rs"), child(srcDir, "main.rs")].find((candidate) => ctx.files.has(candidate)) ?? null;
    const crate = { dir, srcDir, root };
    index.byDir.set(dir, crate);
    const key = name.replace(/-/g, "_");
    if (!index.byName.has(key)) index.byName.set(key, crate);
  }
  ctx.rust = index;
  return index;
}
function rustCrateOf(ctx, fromPath) {
  const index = rustIndex(ctx);
  const dirs = ancestors(fromPath);
  for (const dir of dirs) {
    const crate = index.byDir.get(dir);
    if (crate) return crate;
  }
  for (const dir of dirs) {
    const srcDir = rel(dir, "src");
    const root = [child(srcDir, "lib.rs"), child(srcDir, "main.rs")].find((candidate) => ctx.files.has(candidate));
    if (root) return { dir, srcDir, root };
  }
  return null;
}
function rustModuleDir(filePath) {
  const base = basename(filePath);
  const dir = parentDir(filePath);
  if (base === "mod.rs" || base === "lib.rs" || base === "main.rs") return dir;
  return child(dir, base.replace(/\.rs$/, ""));
}
function rustWithin(ctx, dir, segments, fallback) {
  for (let length = segments.length; length >= 1; length -= 1) {
    const base = child(dir, segments.slice(0, length).join("/"));
    if (ctx.files.has(`${base}.rs`)) return internal(`${base}.rs`);
    if (ctx.files.has(`${base}/mod.rs`)) return internal(`${base}/mod.rs`);
  }
  return fallback ? internal(fallback) : UNRESOLVED;
}
function rustModuleFile(ctx, dir) {
  const candidates = [`${dir}.rs`, child(dir, "mod.rs"), child(dir, "lib.rs"), child(dir, "main.rs")];
  return candidates.find((candidate) => candidate !== ".rs" && ctx.files.has(candidate)) ?? null;
}
function resolveRust(fromPath, raw, ctx) {
  const ownDir = rustModuleDir(fromPath);
  if (raw.kind === "mod") {
    const fileDir = parentDir(fromPath);
    const candidates = [
      child(ownDir, `${raw.specifier}.rs`),
      child(ownDir, `${raw.specifier}/mod.rs`),
      child(fileDir, `${raw.specifier}.rs`),
      child(fileDir, `${raw.specifier}/mod.rs`)
    ];
    const target = candidates.find((candidate) => ctx.files.has(candidate));
    return target ? internal(target) : UNRESOLVED;
  }
  const segments = raw.specifier.split("::");
  const head = segments[0];
  if (head === "crate") {
    const crate = rustCrateOf(ctx, fromPath);
    return crate ? rustWithin(ctx, crate.srcDir, segments.slice(1), crate.root) : UNRESOLVED;
  }
  if (head === "self" || head === "super") {
    let dir = ownDir;
    let consumed = head === "self" ? 1 : 0;
    while (segments[consumed] === "super") {
      if (!dir) return UNRESOLVED;
      dir = parentDir(dir);
      consumed += 1;
    }
    const fallback = dir === ownDir ? fromPath : rustModuleFile(ctx, dir);
    return rustWithin(ctx, dir, segments.slice(consumed), fallback);
  }
  const workspaceCrate = rustIndex(ctx).byName.get(head);
  if (workspaceCrate) return rustWithin(ctx, workspaceCrate.srcDir, segments.slice(1), workspaceCrate.root);
  if (ctx.files.has(child(ownDir, `${head}.rs`)) || ctx.files.has(child(ownDir, `${head}/mod.rs`))) {
    return rustWithin(ctx, ownDir, segments, null);
  }
  return { kind: "external", pkg: normalizePackageName(raw.specifier, "rust") };
}
function cSuffixIndex(ctx) {
  if (ctx.cSuffixes) return ctx.cSuffixes;
  const suffixes = /* @__PURE__ */ new Map();
  for (const path of ctx.sorted) {
    const language = languageOf(path);
    if (language !== "c" && language !== "cpp" && !C_FAMILY_EXTRA.test(path)) continue;
    for (let at = 0; at >= 0; at = path.indexOf("/", at) + 1 || -1) {
      const suffix = path.slice(at);
      const list = suffixes.get(suffix);
      if (list) list.push(path);
      else suffixes.set(suffix, [path]);
    }
  }
  ctx.cSuffixes = suffixes;
  return suffixes;
}
function resolveC(fromPath, specifier, ctx) {
  const angle = specifier.startsWith("<");
  const header = angle ? specifier.slice(1, -1) : specifier;
  if (!angle) {
    const sibling = rel(parentDir(fromPath), header);
    if (!sibling.startsWith("..") && ctx.files.has(sibling)) return internal(sibling);
  }
  const suffix = header.split("/").filter((segment) => segment && segment !== "." && segment !== "..").join("/");
  const matches = suffix ? cSuffixIndex(ctx).get(suffix) ?? [] : [];
  if (matches.length === 1) return internal(matches[0]);
  if (matches.length > 1 && !angle) return UNRESOLVED;
  return { kind: "external", pkg: `c:${header}` };
}
function resolveRuby(fromPath, raw, ctx) {
  const withExtension = (path) => path.endsWith(".rb") ? path : `${path}.rb`;
  if (raw.kind !== "require") {
    const target = withExtension(rel(parentDir(fromPath), raw.specifier));
    return ctx.files.has(target) ? internal(target) : UNRESOLVED;
  }
  if (raw.specifier.startsWith(".")) {
    const target = withExtension(rel(raw.specifier));
    return ctx.files.has(target) ? internal(target) : UNRESOLVED;
  }
  const file2 = withExtension(raw.specifier);
  for (const dir of ["", ...ancestors(fromPath)]) {
    const target = rel(dir, "lib", file2);
    if (ctx.files.has(target)) return internal(target);
  }
  return { kind: "external", pkg: normalizePackageName(raw.specifier, "ruby") };
}
function resolveImport(fromPath, raw, ctx) {
  const from = cleanPath(fromPath);
  switch (languageOf(from)) {
    case "typescript":
    case "javascript":
      return resolveJs(from, raw.specifier, ctx);
    case "python":
      return resolvePython(from, raw.specifier, ctx);
    case "go":
      return resolveGo(raw.specifier, ctx);
    case "java":
    case "kotlin":
      return resolveJvm(raw.specifier, ctx);
    case "rust":
      return resolveRust(from, raw, ctx);
    case "c":
    case "cpp":
      return resolveC(from, raw.specifier, ctx);
    case "ruby":
      return resolveRuby(from, raw, ctx);
    default:
      return UNRESOLVED;
  }
}
function buildFileGraph(files, options) {
  const kept = /* @__PURE__ */ new Map();
  for (const file2 of files) {
    const path = cleanPath(file2.path);
    if (!path || kept.has(path) || isIgnoredPath(path, options?.ignore)) continue;
    kept.set(path, file2.path === path ? file2 : { ...file2, path });
  }
  const paths = [...kept.keys()].sort(compare);
  const ctx = createResolveContext([...kept.values()]);
  const facts = /* @__PURE__ */ new Map();
  const edges = /* @__PURE__ */ new Map();
  const externals = /* @__PURE__ */ new Map();
  const unresolved = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const file2 = kept.get(path);
    const language = languageOf(path);
    if (!file2 || language === null || file2.content === null) continue;
    if ((file2.size ?? 0) > MAX_ANALYZED_FILE_BYTES || file2.content.length > MAX_ANALYZED_FILE_BYTES) continue;
    const imports = extractImports(path, file2.content);
    facts.set(path, {
      path,
      language,
      isTest: isTestPath(path),
      imports,
      envRefs: extractEnvRefs(path, file2.content, language)
    });
    for (const raw of imports) {
      const resolved = resolveImport(path, raw, ctx);
      if (resolved.kind === "internal") {
        if (resolved.target === path) continue;
        const key = `${path}\0${resolved.target}\0${raw.line}`;
        const existing = edges.get(key);
        if (existing) existing.typeOnly = existing.typeOnly && raw.typeOnly;
        else edges.set(key, { from: path, to: resolved.target, line: raw.line, specifier: raw.specifier, typeOnly: raw.typeOnly });
      } else if (resolved.kind === "external") {
        const key = `${path}\0${resolved.pkg}\0${raw.line}`;
        const existing = externals.get(key);
        if (existing) existing.typeOnly = existing.typeOnly && raw.typeOnly;
        else externals.set(key, { from: path, pkg: resolved.pkg, line: raw.line, specifier: raw.specifier, typeOnly: raw.typeOnly });
      } else {
        const key = `${path}\0${raw.specifier}\0${raw.line}`;
        if (!unresolved.has(key)) unresolved.set(key, { from: path, specifier: raw.specifier, line: raw.line });
      }
    }
  }
  return {
    files: paths,
    facts,
    edges: [...edges.values()].sort((a, b) => compare(a.from, b.from) || a.line - b.line || compare(a.to, b.to)),
    externals: [...externals.values()].sort((a, b) => compare(a.from, b.from) || a.line - b.line || compare(a.pkg, b.pkg)),
    unresolved: [...unresolved.values()].sort(
      (a, b) => compare(a.from, b.from) || a.line - b.line || compare(a.specifier, b.specifier)
    )
  };
}
var LANGUAGE_BY_EXTENSION, FILL, NOT_NEWLINE, C_FLAVOR, JS_FLAVOR, GO_FLAVOR, JAVA_FLAVOR, KOTLIN_FLAVOR, RUST_FLAVOR, PYTHON_FLAVOR, REGEX_PRECEDING_KEYWORDS, JS_KEYWORD, JS_CALL_OPEN, JS_SIDE_EFFECT, JS_IMPORT_CLAUSE, JS_EXPORT_CLAUSE, JS_CALL_CLOSE, PY_IMPORT, PY_FROM, GO_IMPORT, GO_GROUP_ENTRY, JVM_IMPORT, JVM_PACKAGE, RUST_STATEMENT, C_INCLUDE, RUBY_REQUIRE, NODE_BUILTINS, JS_EXTENSIONS, JS_EXTENSION_SWAPS, MAX_EXTENDS_DEPTH, EXPORT_CONDITIONS, UNRESOLVED, PYTHON_STDLIB, JVM_TYPE_DECLARATION, KOTLIN_TOP_LEVEL, C_FAMILY_EXTRA;
var init_imports = __esm({
  "src/blueprint/imports.ts"() {
    "use strict";
    init_constants();
    init_env();
    init_glob();
    init_paths();
    LANGUAGE_BY_EXTENSION = {
      ts: "typescript",
      tsx: "typescript",
      mts: "typescript",
      cts: "typescript",
      js: "javascript",
      jsx: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      py: "python",
      go: "go",
      java: "java",
      kt: "kotlin",
      kts: "kotlin",
      rs: "rust",
      c: "c",
      h: "c",
      cc: "cpp",
      cpp: "cpp",
      cxx: "cpp",
      hpp: "cpp",
      hh: "cpp",
      hxx: "cpp",
      rb: "ruby",
      cs: "csharp",
      php: "php",
      swift: "swift"
    };
    FILL = "";
    NOT_NEWLINE = /[^\r\n]/g;
    C_FLAVOR = {
      slashComments: true,
      nestedBlocks: false,
      hashComments: false,
      singleQuote: "char",
      tripleDouble: false,
      tripleSingle: false,
      backtick: "none",
      regex: false,
      rustRaw: false
    };
    JS_FLAVOR = { ...C_FLAVOR, singleQuote: "string", backtick: "template", regex: true };
    GO_FLAVOR = { ...C_FLAVOR, backtick: "raw" };
    JAVA_FLAVOR = { ...C_FLAVOR, tripleDouble: true };
    KOTLIN_FLAVOR = { ...JAVA_FLAVOR, nestedBlocks: true };
    RUST_FLAVOR = { ...C_FLAVOR, nestedBlocks: true, rustRaw: true };
    PYTHON_FLAVOR = {
      ...C_FLAVOR,
      slashComments: false,
      hashComments: true,
      singleQuote: "string",
      tripleDouble: true,
      tripleSingle: true
    };
    REGEX_PRECEDING_KEYWORDS = /* @__PURE__ */ new Set([
      "return",
      "typeof",
      "instanceof",
      "in",
      "of",
      "new",
      "delete",
      "void",
      "throw",
      "case",
      "do",
      "else",
      "yield",
      "await"
    ]);
    JS_KEYWORD = /(?<![\w$#])(import|export|require)(?![\w$])/g;
    JS_CALL_OPEN = /\s*\(\s*(?=["'`])/y;
    JS_SIDE_EFFECT = /\s*(?=["'])/y;
    JS_IMPORT_CLAUSE = /\s*(type\s+)?([\w$\s,{}*]+?)\s*from\s*(?=["'])/y;
    JS_EXPORT_CLAUSE = /\s*(type\s+)?(\*(?:\s*as\s+[\w$]+)?|\{[\w$\s,]*\})\s*from\s*(?=["'])/y;
    JS_CALL_CLOSE = /\s*[,)]/y;
    PY_IMPORT = /^[ \t]*import[ \t]+([^\n;]+)/gm;
    PY_FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]*(\([^)]*\)|[^\n;]*)/gm;
    GO_IMPORT = /^[ \t]*import[ \t]*(?:(\()|(?:[\w.]+[ \t]+)?(?=["`]))/gm;
    GO_GROUP_ENTRY = /["`]/g;
    JVM_IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\.\*)?)/gm;
    JVM_PACKAGE = /^[ \t]*package[ \t]+([A-Za-z_][\w.]*)/m;
    RUST_STATEMENT = /(?<![\w#])(?:(use)\s+([^;{}]*(?:\{[^;]*\})?[^;{}]*);|(mod)\s+(\w+)\s*;|extern\s+(crate)\s+(\w+)[^;]*;)/g;
    C_INCLUDE = /^[ \t]*#[ \t]*(?:include|include_next|import)[ \t]*(?=["<])/gm;
    RUBY_REQUIRE = /^\s*(require_relative|require)\s*\(?\s*(["'])([^"'#\n]+)\2/;
    NODE_BUILTINS = /* @__PURE__ */ new Set([
      "fs",
      "path",
      "os",
      "crypto",
      "http",
      "https",
      "url",
      "util",
      "stream",
      "events",
      "child_process",
      "worker_threads",
      "zlib",
      "net",
      "tls",
      "dns",
      "buffer",
      "assert",
      "readline",
      "process",
      "perf_hooks",
      "async_hooks",
      "cluster",
      "dgram",
      "inspector",
      "module",
      "querystring",
      "string_decoder",
      "timers",
      "tty",
      "v8",
      "vm",
      "wasi",
      "test",
      "sqlite",
      "constants",
      "diagnostics_channel",
      "http2",
      "punycode",
      "repl",
      "trace_events"
    ]);
    JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
    JS_EXTENSION_SWAPS = [
      [".d.ts", [".ts", ".tsx"]],
      [".d.mts", [".mts"]],
      [".d.cts", [".cts"]],
      [".js", [".ts", ".tsx"]],
      [".jsx", [".tsx"]],
      [".mjs", [".mts"]],
      [".cjs", [".cts"]]
    ];
    MAX_EXTENDS_DEPTH = 5;
    EXPORT_CONDITIONS = ["source", "import", "default", "types", "require"];
    UNRESOLVED = { kind: "unresolved" };
    PYTHON_STDLIB = /* @__PURE__ */ new Set([
      "abc",
      "argparse",
      "array",
      "ast",
      "asyncio",
      "base64",
      "bisect",
      "calendar",
      "collections",
      "concurrent",
      "contextlib",
      "copy",
      "csv",
      "ctypes",
      "dataclasses",
      "datetime",
      "decimal",
      "email",
      "enum",
      "errno",
      "functools",
      "glob",
      "hashlib",
      "heapq",
      "html",
      "http",
      "importlib",
      "inspect",
      "io",
      "itertools",
      "json",
      "logging",
      "math",
      "multiprocessing",
      "operator",
      "os",
      "pathlib",
      "pickle",
      "platform",
      "queue",
      "random",
      "re",
      "secrets",
      "select",
      "shutil",
      "signal",
      "socket",
      "sqlite3",
      "ssl",
      "statistics",
      "string",
      "struct",
      "subprocess",
      "sys",
      "tempfile",
      "test",
      "threading",
      "time",
      "tokenize",
      "traceback",
      "types",
      "typing",
      "unittest",
      "urllib",
      "uuid",
      "warnings",
      "weakref",
      "xml",
      "zipfile",
      "zlib"
    ]);
    JVM_TYPE_DECLARATION = /\b(?:class|interface|enum|record|object|typealias)\s+([A-Za-z_]\w*)/g;
    KOTLIN_TOP_LEVEL = /^(?:[\w@]+[ \t]+)*(?:fun[ \t]+(?:<[^>\n]*>[ \t]*)?(?:[\w.<>?, ]+\.)?|va[lr][ \t]+(?:[\w.<>?, ]+\.)?)([A-Za-z_]\w*)/gm;
    C_FAMILY_EXTRA = /\.(?:inc|inl|ipp|tpp|def)$/;
  }
});

// src/blueprint/util.ts
function hash53(value, seed = 0) {
  let h1 = 3735928559 ^ seed;
  let h2 = 1103547991 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function fingerprint(...parts) {
  return hash53(parts.map((part) => String(part ?? "")).join("")).toString(16).padStart(14, "0");
}
function slugify3(value, maxLength = 48) {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, maxLength).replace(/-+$/g, "");
  return slug || "item";
}
function titleCase(value) {
  const words = value.replace(/\.[^.]+$/, "").replace(/[-_.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return words ? words.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Root";
}
function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
var init_util3 = __esm({
  "src/blueprint/util.ts"() {
    "use strict";
  }
});

// src/blueprint/derive.ts
function kindFor(directory) {
  const segments = directory.split("/").filter(Boolean).reverse();
  for (const segment of segments) {
    const kind = KIND_BY_SEGMENT[segment.toLowerCase()];
    if (kind) return kind;
  }
  return "core";
}
function directoryOfFile(path) {
  const dir = dirname(path);
  return dir === "." ? "" : dir;
}
function clusterFiles(sourceFiles, maxFiles) {
  const counts = /* @__PURE__ */ new Map();
  const direct = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  for (const file2 of sourceFiles) {
    const dir = directoryOfFile(file2);
    direct.set(dir, [...direct.get(dir) ?? [], file2]);
    let current = dir;
    counts.set("", (counts.get("") ?? 0) + 1);
    while (current) {
      counts.set(current, (counts.get(current) ?? 0) + 1);
      const parent = directoryOfFile(current);
      const set2 = children.get(parent) ?? /* @__PURE__ */ new Set();
      set2.add(current);
      children.set(parent, set2);
      current = parent;
    }
  }
  const filesUnder = (dir) => sourceFiles.filter((file2) => isWithin(file2, dir));
  const clusters = [];
  const visit = (dir, depth) => {
    const total = counts.get(dir) ?? 0;
    const subdirs = [...children.get(dir) ?? []].sort();
    const directFiles = direct.get(dir) ?? [];
    const mustSplit = dir === "" && subdirs.length > 0;
    if (!mustSplit && (total <= maxFiles || subdirs.length === 0 || depth >= 6)) {
      clusters.push({ key: dir || "root", globs: [dir ? `${dir}/**` : "/*"], files: dir ? filesUnder(dir) : directFiles, directory: dir });
      return;
    }
    const small = [];
    for (const sub of subdirs) {
      if ((counts.get(sub) ?? 0) < 2 && subdirs.length > 1) small.push(sub);
      else visit(sub, depth + 1);
    }
    if (directFiles.length || small.length) {
      const globs = [...directFiles.length ? [dir ? `${dir}/*` : "/*"] : [], ...small.map((sub) => `${sub}/**`)];
      const files = [...directFiles, ...small.flatMap((sub) => filesUnder(sub))];
      clusters.push({ key: dir ? `${dir}:root` : "root", globs, files, directory: dir });
    }
  };
  visit("", 0);
  return clusters.filter((cluster) => cluster.files.length > 0);
}
function readJson(files, path) {
  const file2 = files.find((candidate) => candidate.path === path);
  if (!file2?.content) return null;
  try {
    const value = JSON.parse(file2.content);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function detectSystemName(files) {
  const pkg = readJson(files, "package.json");
  if (typeof pkg?.name === "string" && pkg.name.trim()) return pkg.name.trim();
  const text3 = (path) => files.find((file2) => file2.path === path)?.content ?? null;
  const goModule = text3("go.mod")?.match(/^module\s+(\S+)/m)?.[1];
  if (goModule) return goModule.split("/").pop() ?? goModule;
  const cargo = text3("Cargo.toml")?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (cargo) return cargo;
  const pyproject = text3("pyproject.toml")?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (pyproject) return pyproject;
  return null;
}
function uniqueId(base, used) {
  let candidate = base || "component";
  let counter = 2;
  while (used.has(candidate)) candidate = `${base}-${counter++}`;
  used.add(candidate);
  return candidate;
}
function componentIdFor(directory, isRootCluster) {
  const segments = directory.split("/").filter(Boolean).filter((segment) => !["src", "source", "packages", "apps"].includes(segment.toLowerCase()) || directory.split("/").length === 1);
  const tail = segments.slice(-2).join("-");
  const base = slugify3(tail || directory || "root");
  return isRootCluster && directory ? `${base}-root` : base;
}
function componentName(directory, isRootCluster) {
  const segments = directory.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Root";
  const parent = segments.length > 1 ? segments[segments.length - 2] : "";
  const base = parent && !["src", "app", "packages", "apps"].includes(parent) && segments.length > 2 ? `${titleCase(parent)} ${titleCase(last)}` : titleCase(last);
  return isRootCluster && directory ? `${base} (top-level files)` : base;
}
function deriveBlueprint(files, options = {}) {
  const now = options.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const provenance = {
    source: PROVENANCE_SOURCE,
    by: options.author ?? "rassam init",
    at: now,
    ...options.commit ? { commit: options.commit } : {}
  };
  const maxFiles = options.maxFilesPerComponent ?? 40;
  const maxComponents = options.maxComponents ?? 40;
  const graph = buildFileGraph(files);
  const sourceFiles = [...graph.facts.values()].map((facts) => facts.path).sort();
  const testFiles = sourceFiles.filter((path) => graph.facts.get(path)?.isTest);
  const productionFiles = sourceFiles.filter((path) => !graph.facts.get(path)?.isTest);
  let clusters = clusterFiles(productionFiles, maxFiles);
  let budget = maxFiles;
  while (clusters.length > maxComponents && budget < 5e3) {
    budget = Math.ceil(budget * 1.6);
    clusters = clusterFiles(productionFiles, budget);
  }
  const used = /* @__PURE__ */ new Set();
  const components = clusters.map((cluster) => {
    const isRootCluster = cluster.key.endsWith(":root") || cluster.key === "root";
    return {
      id: uniqueId(componentIdFor(cluster.directory, isRootCluster && cluster.globs.some((glob) => glob.endsWith("/*"))), used),
      name: componentName(cluster.directory, isRootCluster && cluster.globs.some((glob) => glob.endsWith("/*"))),
      kind: cluster.directory ? kindFor(cluster.directory) : "config",
      description: `${cluster.files.length} source file${cluster.files.length === 1 ? "" : "s"} under ${cluster.directory || "the repository root"}`,
      paths: cluster.globs,
      provenance
    };
  });
  if (testFiles.length) {
    const testGlobs = TEST_PATTERNS.filter((pattern2) => testFiles.some((file2) => compileGlob(pattern2).test(file2)));
    components.push({
      id: uniqueId("tests", used),
      name: "Tests",
      kind: "test",
      description: `${testFiles.length} test file${testFiles.length === 1 ? "" : "s"}`,
      paths: testGlobs,
      priority: 10,
      provenance
    });
  }
  const draft = blueprintSchema.parse({
    $schema: BLUEPRINT_SCHEMA_URL,
    version: BLUEPRINT_VERSION,
    system: {
      name: options.name ?? detectSystemName(files) ?? "repository",
      ...options.repository ? { repository: options.repository } : {},
      description: "Draft generated by `rassam init`. Replace derived facts with human-authored intent, rules and invariants."
    },
    components
  });
  const membership = assignComponents(graph.files, draft);
  const componentGraph = buildComponentGraph(graph, membership);
  const testsId = components.find((component) => component.kind === "test")?.id;
  draft.dependencies = componentGraph.edges.filter((edge) => edge.from !== testsId).map((edge) => ({ from: edge.from, to: edge.to, kind: "imports", provenance }));
  const rules = [
    {
      id: "no-component-cycles",
      kind: "no-cycles",
      severity: "warning",
      reason: "Cycles erase the direction of dependency, so no component can change safely in isolation.",
      provenance
    }
  ];
  if (testsId) {
    rules.push({
      id: "tests-are-leaves",
      kind: "forbid",
      from: ["*", `!${testsId}`],
      to: testsId,
      severity: "error",
      reason: "Production code must never depend on test code.",
      provenance
    });
  }
  const readers = /* @__PURE__ */ new Map();
  for (const [componentId, refs] of componentGraph.env) {
    for (const ref of refs) {
      if (!ref.secretLike || componentId === testsId) continue;
      const set2 = readers.get(ref.name) ?? /* @__PURE__ */ new Set();
      set2.add(componentId);
      readers.set(ref.name, set2);
    }
  }
  for (const [name, set2] of [...readers.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (set2.size > 3) continue;
    rules.push({
      id: `secret-${slugify3(name, 60)}`,
      kind: "secret-access",
      secrets: [name],
      // Tests legitimately set and read environment variables.
      allow: [...[...set2].sort(), ...testsId ? [testsId] : []],
      severity: "error",
      reason: `Only the components that read ${name} today may hold it. Review before accepting.`,
      provenance
    });
  }
  draft.rules = rules;
  return draft;
}
var KIND_BY_SEGMENT, PROVENANCE_SOURCE;
var init_derive = __esm({
  "src/blueprint/derive.ts"() {
    "use strict";
    init_schema();
    init_constants();
    init_glob();
    init_graph();
    init_imports();
    init_paths();
    init_util3();
    KIND_BY_SEGMENT = {
      api: "api",
      apis: "api",
      routes: "route",
      route: "route",
      pages: "route",
      app: "route",
      views: "component",
      components: "component",
      ui: "component",
      widgets: "component",
      hooks: "hook",
      context: "context",
      contexts: "context",
      store: "context",
      stores: "context",
      state: "context",
      services: "service",
      service: "service",
      workers: "service",
      jobs: "queue",
      queue: "queue",
      queues: "queue",
      models: "model",
      model: "model",
      entities: "model",
      schemas: "model",
      types: "model",
      db: "database",
      database: "database",
      migrations: "database",
      prisma: "database",
      repositories: "database",
      auth: "auth",
      security: "auth",
      middleware: "middleware",
      middlewares: "middleware",
      config: "config",
      configs: "config",
      settings: "config",
      utils: "utility",
      util: "utility",
      helpers: "utility",
      lib: "core",
      libs: "core",
      core: "core",
      domain: "core",
      internal: "core",
      pkg: "core",
      cmd: "client",
      cli: "client",
      bin: "client",
      client: "client",
      server: "service",
      styles: "style",
      css: "style",
      cache: "cache",
      gateway: "gateway",
      proxy: "proxy"
    };
    PROVENANCE_SOURCE = "derived";
  }
});

// src/blueprint/reach.ts
function classifyAgentConfig(path) {
  const normalized = repoPath(path);
  if (!normalized) return null;
  const rule = CONFIG_RULES.find((candidate) => compileGlob(candidate.glob).test(normalized));
  return rule ? { path: normalized, type: rule.type, agent: rule.agent } : null;
}
function isAgentConfigPath(path) {
  return classifyAgentConfig(path) !== null;
}
function isDict(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function newDict() {
  return /* @__PURE__ */ Object.create(null);
}
function compare2(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function lineAt(content, offset) {
  let line = 1;
  for (let index = content.indexOf("\n"); index >= 0 && index < offset; index = content.indexOf("\n", index + 1)) {
    line += 1;
  }
  return line;
}
function isToml(path) {
  return /\.toml$/i.test(path);
}
function isYaml(path) {
  return /\.ya?ml$/i.test(path);
}
function skipJsonTrivia(cursor) {
  const { text: text3 } = cursor;
  while (cursor.pos < text3.length) {
    const char = text3[cursor.pos];
    if (char === " " || char === "	" || char === "\n" || char === "\r" || char === "\uFEFF") {
      cursor.pos += 1;
    } else if (char === "/" && text3[cursor.pos + 1] === "/") {
      const newline = text3.indexOf("\n", cursor.pos);
      cursor.pos = newline < 0 ? text3.length : newline;
    } else if (char === "/" && text3[cursor.pos + 1] === "*") {
      const close = text3.indexOf("*/", cursor.pos + 2);
      cursor.pos = close < 0 ? text3.length : close + 2;
    } else {
      return;
    }
  }
}
function readQuoted(cursor) {
  const { text: text3 } = cursor;
  const quote2 = text3[cursor.pos];
  let result = "";
  cursor.pos += 1;
  while (cursor.pos < text3.length) {
    const char = text3[cursor.pos];
    if (char === quote2) {
      cursor.pos += 1;
      return result;
    }
    if (char === "\n") break;
    if (char === "\\") {
      const next = text3[cursor.pos + 1];
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text3.slice(cursor.pos + 2, cursor.pos + 6))) {
        result += String.fromCharCode(parseInt(text3.slice(cursor.pos + 2, cursor.pos + 6), 16));
        cursor.pos += 6;
      } else {
        result += JSON_ESCAPES[next] ?? next ?? "";
        cursor.pos += 2;
      }
      continue;
    }
    result += char;
    cursor.pos += 1;
  }
  throw new ParseError("unterminated string");
}
function readJsonValue(cursor, path, depth) {
  if (depth > MAX_DEPTH) throw new ParseError("too deep");
  skipJsonTrivia(cursor);
  const { text: text3 } = cursor;
  const char = text3[cursor.pos];
  if (char === void 0) throw new ParseError("unexpected end");
  if (char === "{") {
    cursor.pos += 1;
    const result = newDict();
    for (; ; ) {
      skipJsonTrivia(cursor);
      if (text3[cursor.pos] === "}") {
        cursor.pos += 1;
        return result;
      }
      if (text3[cursor.pos] !== '"' && text3[cursor.pos] !== "'") throw new ParseError("expected key");
      const key = readQuoted(cursor);
      skipJsonTrivia(cursor);
      if (text3[cursor.pos] !== ":") throw new ParseError("expected ':'");
      cursor.pos += 1;
      result[key] = readJsonValue(cursor, [...path, key], depth + 1);
      skipJsonTrivia(cursor);
      if (text3[cursor.pos] === ",") cursor.pos += 1;
      else if (text3[cursor.pos] !== "}") throw new ParseError("expected ',' or '}'");
    }
  }
  if (char === "[") {
    cursor.pos += 1;
    const result = [];
    for (; ; ) {
      skipJsonTrivia(cursor);
      if (text3[cursor.pos] === "]") {
        cursor.pos += 1;
        return result;
      }
      result.push(readJsonValue(cursor, [...path, String(result.length)], depth + 1));
      skipJsonTrivia(cursor);
      if (text3[cursor.pos] === ",") cursor.pos += 1;
      else if (text3[cursor.pos] !== "]") throw new ParseError("expected ',' or ']'");
    }
  }
  if (char === '"' || char === "'") {
    const start = cursor.pos;
    const value = readQuoted(cursor);
    cursor.leaves.push({ path, value, start, end: cursor.pos });
    return value;
  }
  const bare = /^[-+.\w]+/.exec(text3.slice(cursor.pos, cursor.pos + 64));
  if (!bare) throw new ParseError("unexpected character");
  cursor.pos += bare[0].length;
  if (bare[0] === "true") return true;
  if (bare[0] === "false") return false;
  if (bare[0] === "null") return null;
  const numeric = Number(bare[0]);
  if (Number.isNaN(numeric)) throw new ParseError("unexpected token");
  return numeric;
}
function parseJsonc2(content) {
  const cursor = { text: content, pos: 0, leaves: [] };
  try {
    const value = readJsonValue(cursor, [], 0);
    skipJsonTrivia(cursor);
    if (cursor.pos < content.length) return null;
    return { value, leaves: cursor.leaves };
  } catch {
    return null;
  }
}
function skipTomlSpace(cursor, newlines) {
  const { text: text3 } = cursor;
  while (cursor.pos < text3.length) {
    const char = text3[cursor.pos];
    if (char === " " || char === "	" || char === "\r" || char === "\uFEFF" || newlines && char === "\n") {
      cursor.pos += 1;
    } else if (char === "#") {
      const newline = text3.indexOf("\n", cursor.pos);
      cursor.pos = newline < 0 ? text3.length : newline;
    } else {
      return;
    }
  }
}
function readTomlLiteral(cursor) {
  const close = cursor.text.indexOf("'", cursor.pos + 1);
  const newline = cursor.text.indexOf("\n", cursor.pos);
  if (close < 0 || newline >= 0 && newline < close) throw new ParseError("unterminated string");
  const value = cursor.text.slice(cursor.pos + 1, close);
  cursor.pos = close + 1;
  return value;
}
function readTomlString(cursor) {
  const { text: text3 } = cursor;
  const quote2 = text3[cursor.pos];
  const triple = quote2.repeat(3);
  if (text3.startsWith(triple, cursor.pos)) {
    const close = text3.indexOf(triple, cursor.pos + 3);
    if (close < 0) throw new ParseError("unterminated string");
    const value = text3.slice(cursor.pos + 3, close).replace(/^\r?\n/, "");
    cursor.pos = close + 3;
    return value;
  }
  return quote2 === "'" ? readTomlLiteral(cursor) : readQuoted(cursor);
}
function readTomlKey(cursor) {
  const { text: text3 } = cursor;
  const keys = [];
  for (; ; ) {
    skipTomlSpace(cursor, false);
    const char = text3[cursor.pos];
    if (char === '"' || char === "'") {
      keys.push(char === "'" ? readTomlLiteral(cursor) : readQuoted(cursor));
    } else {
      const bare = /^[A-Za-z0-9_-]+/.exec(text3.slice(cursor.pos, cursor.pos + 200));
      if (!bare) throw new ParseError("expected key");
      keys.push(bare[0]);
      cursor.pos += bare[0].length;
    }
    skipTomlSpace(cursor, false);
    if (text3[cursor.pos] !== ".") return keys;
    cursor.pos += 1;
  }
}
function tomlDescend(root, keys) {
  let current = root;
  for (const key of keys) {
    const next = current[key];
    if (isDict(next)) {
      current = next;
    } else {
      const created = newDict();
      current[key] = created;
      current = created;
    }
  }
  return current;
}
function readTomlValue(cursor, path, depth) {
  if (depth > MAX_DEPTH) throw new ParseError("too deep");
  const { text: text3 } = cursor;
  const char = text3[cursor.pos];
  if (char === '"' || char === "'") {
    const start = cursor.pos;
    const value = readTomlString(cursor);
    cursor.leaves.push({ path, value, start, end: cursor.pos });
    return value;
  }
  if (char === "[") {
    cursor.pos += 1;
    const result = [];
    for (; ; ) {
      skipTomlSpace(cursor, true);
      if (text3[cursor.pos] === "]") {
        cursor.pos += 1;
        return result;
      }
      if (cursor.pos >= text3.length) throw new ParseError("unterminated array");
      result.push(readTomlValue(cursor, [...path, String(result.length)], depth + 1));
      skipTomlSpace(cursor, true);
      if (text3[cursor.pos] === ",") cursor.pos += 1;
      else if (text3[cursor.pos] !== "]") throw new ParseError("expected ',' or ']'");
    }
  }
  if (char === "{") {
    cursor.pos += 1;
    const result = newDict();
    for (; ; ) {
      skipTomlSpace(cursor, true);
      if (text3[cursor.pos] === "}") {
        cursor.pos += 1;
        return result;
      }
      if (cursor.pos >= text3.length) throw new ParseError("unterminated table");
      const keys = readTomlKey(cursor);
      if (text3[cursor.pos] !== "=") throw new ParseError("expected '='");
      cursor.pos += 1;
      skipTomlSpace(cursor, false);
      const last = keys[keys.length - 1];
      tomlDescend(result, keys.slice(0, -1))[last] = readTomlValue(cursor, [...path, ...keys], depth + 1);
      skipTomlSpace(cursor, true);
      if (text3[cursor.pos] === ",") cursor.pos += 1;
      else if (text3[cursor.pos] !== "}") throw new ParseError("expected ',' or '}'");
    }
  }
  const bare = /^[^\s,\]}#]+/.exec(text3.slice(cursor.pos, cursor.pos + 200));
  if (!bare) throw new ParseError("expected value");
  cursor.pos += bare[0].length;
  if (bare[0] === "true") return true;
  if (bare[0] === "false") return false;
  const numeric = Number(bare[0].replace(/_/g, ""));
  return Number.isNaN(numeric) ? bare[0] : numeric;
}
function parseToml(content) {
  const cursor = { text: content, pos: 0, leaves: [] };
  const root = newDict();
  let tablePath = [];
  let table2 = root;
  while (cursor.pos < content.length) {
    skipTomlSpace(cursor, true);
    if (cursor.pos >= content.length) break;
    const lineStart = cursor.pos;
    const leafCount = cursor.leaves.length;
    try {
      if (content[cursor.pos] === "[") {
        const double = content[cursor.pos + 1] === "[";
        cursor.pos += double ? 2 : 1;
        const keys = readTomlKey(cursor);
        if (content[cursor.pos] !== "]") throw new ParseError("expected ']'");
        cursor.pos += double ? 2 : 1;
        tablePath = keys;
        table2 = tomlDescend(root, keys);
      } else {
        const keys = readTomlKey(cursor);
        if (content[cursor.pos] !== "=") throw new ParseError("expected '='");
        cursor.pos += 1;
        skipTomlSpace(cursor, false);
        const value = readTomlValue(cursor, [...tablePath, ...keys], 0);
        tomlDescend(table2, keys.slice(0, -1))[keys[keys.length - 1]] = value;
      }
      skipTomlSpace(cursor, false);
      if (cursor.pos < content.length && content[cursor.pos] !== "\n") throw new ParseError("trailing characters");
    } catch {
      cursor.leaves.length = leafCount;
      const newline = content.indexOf("\n", lineStart);
      cursor.pos = newline < 0 ? content.length : newline + 1;
    }
  }
  return { value: root, leaves: cursor.leaves };
}
function parseConfig(path, content) {
  if (isToml(path)) return parseToml(content);
  if (isYaml(path) || /\.(?:md|mdc|txt)$/i.test(path)) return null;
  return parseJsonc2(content);
}
function shannonEntropy(value) {
  const counts = /* @__PURE__ */ new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  const length = [...value].length;
  let entropy = 0;
  for (const count of counts.values()) {
    const share = count / length;
    entropy -= share * Math.log2(share);
  }
  return entropy;
}
function isPlaceholder(raw) {
  const value = raw.trim().replace(/^(?:bearer|basic|token)\s+/i, "");
  if (!value) return true;
  if (value.includes("${") || value.includes("{{") || /\{env:/i.test(value) || /\$\(/.test(value)) return true;
  if (/example/i.test(value)) return true;
  return PLACEHOLDER_WHOLE.some((regex) => regex.test(value));
}
function isReferenceValue(value) {
  const trimmed = value.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return true;
  if (/^(?:\/|\.{1,2}\/|~\/|[A-Za-z]:[\\/])/.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\/\S*$/i.test(trimmed)) return true;
  return false;
}
function redactedPreview(secret) {
  const chars = [...secret];
  return `${chars.slice(0, 4).join("")}…${chars.slice(-2).join("")} (${chars.length} chars)`;
}
function redactText(text3) {
  return text3.replace(new RegExp(TOKEN_REGEX.source, "g"), REDACTED).replace(
    new RegExp(URL_CREDENTIALS, "g"),
    (match, _user, password) => isPlaceholder(password) ? match : match.replace(`:${password}@`, `:${REDACTED}@`)
  ).replace(
    /([?&])([^=&\s]+)=([^&\s]+)/g,
    (match, separator, key, value) => isSecretLikeName(key) && !isPlaceholder(value) ? `${separator}${key}=${REDACTED}` : match
  );
}
function redactArgs(args) {
  return args.map((arg, index) => {
    const assignment = FLAG_ASSIGNMENT.exec(arg);
    if (assignment && isSecretLikeName(assignment[1]) && !isPlaceholder(assignment[2])) {
      return `${assignment[1]}=${REDACTED}`;
    }
    const previous = index > 0 ? args[index - 1] : "";
    if (BARE_FLAG.test(previous) && isSecretLikeName(previous) && !isPlaceholder(arg) && !BARE_FLAG.test(arg)) {
      return REDACTED;
    }
    return redactText(arg);
  });
}
function stringOf(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function stringsOf(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function serverMaps(root) {
  if (!isDict(root)) return [];
  const candidates = [root.mcpServers, root.servers, root.mcp_servers, isDict(root.mcp) ? root.mcp.servers : void 0];
  return candidates.filter(isDict);
}
function toServerRef(name, entry, configPath, agent) {
  const command = stringOf(entry.command);
  const url2 = stringOf(entry.url) ?? stringOf(entry.serverUrl) ?? stringOf(entry.httpUrl);
  const type = stringOf(entry.type)?.toLowerCase() ?? stringOf(entry.transport)?.toLowerCase();
  let transport = "unknown";
  if (url2) transport = "http";
  else if (command) transport = "stdio";
  else if (type === "stdio") transport = "stdio";
  else if (type === "http" || type === "sse" || type === "streamable-http" || type === "streamable_http") transport = "http";
  const env = /* @__PURE__ */ new Set([...isDict(entry.env) ? Object.keys(entry.env) : [], ...stringsOf(entry.env_vars)]);
  const ref = { name, configPath, agent, transport, env: [...env].sort(compare2) };
  if (command) {
    const full = [redactText(command), ...redactArgs(stringsOf(entry.args))].join(" ");
    ref.command = full.length > MAX_COMMAND_LENGTH ? `${full.slice(0, MAX_COMMAND_LENGTH)}…` : full;
  }
  if (url2) ref.url = redactText(url2);
  return ref;
}
function parseMcpServers(path, content) {
  try {
    const configPath = repoPath(path);
    const doc = isToml(configPath) ? parseToml(content) : parseJsonc2(content);
    if (!doc) return [];
    const agent = classifyAgentConfig(configPath)?.agent ?? (isToml(configPath) ? "Codex" : "MCP");
    const servers = /* @__PURE__ */ new Map();
    for (const map2 of serverMaps(doc.value)) {
      for (const [name, entry] of Object.entries(map2)) {
        if (isDict(entry) && !servers.has(name)) servers.set(name, toServerRef(name, entry, configPath, agent));
      }
    }
    return [...servers.values()].sort((a, b) => compare2(a.name, b.name));
  } catch {
    return [];
  }
}
function isBroadClaudeRule(rule) {
  const text3 = rule.trim();
  if (!text3 || WILDCARD_ONLY.test(text3)) return true;
  if (text3.startsWith("mcp__")) {
    const rest = text3.slice(5);
    const separator = rest.indexOf("__");
    return separator < 0 || WILDCARD_ONLY.test(rest.slice(separator + 2)) || rest.startsWith("*");
  }
  const call = /^([A-Za-z_]\w*)\(([\s\S]*)\)$/.exec(text3);
  const tool = call ? call[1] : text3;
  const argument = call ? call[2].trim() : null;
  if (argument !== null && (argument === "" || WILDCARD_ONLY.test(argument))) return true;
  if (tool === "Bash") return argument === null || DANGEROUS_BASH.test(argument);
  if (tool === "WebFetch") return argument === null || /^domain:\s*\*$/.test(argument);
  if (WRITE_TOOLS.has(tool)) return argument === null;
  return false;
}
function claudePermissions(path, agent, root) {
  if (!isDict(root)) return [];
  const grants = [];
  const permissions = isDict(root.permissions) ? root.permissions : newDict();
  for (const effect of CLAUDE_EFFECTS) {
    for (const rule of stringsOf(permissions[effect])) {
      grants.push({ path, agent, effect, rule, broad: effect === "allow" && isBroadClaudeRule(rule) });
    }
  }
  if (permissions.defaultMode === "bypassPermissions") {
    grants.push({ path, agent, effect: "allow", rule: "defaultMode: bypassPermissions", broad: true });
  }
  if (root.enableAllProjectMcpServers === true) {
    grants.push({ path, agent, effect: "allow", rule: "enableAllProjectMcpServers: true", broad: true });
  }
  return grants;
}
function codexPermissions(path, agent, root) {
  if (!isDict(root)) return [];
  const grants = [];
  const scan = (table2, prefix) => {
    if (table2.approval_policy === "never") {
      grants.push({ path, agent, effect: "allow", rule: `${prefix}approval_policy = "never"`, broad: true });
    }
    if (table2.sandbox_mode === "danger-full-access") {
      grants.push({ path, agent, effect: "allow", rule: `${prefix}sandbox_mode = "danger-full-access"`, broad: true });
    }
  };
  scan(root, "");
  if (isDict(root.profiles)) {
    for (const name of Object.keys(root.profiles).sort(compare2)) {
      const profile = root.profiles[name];
      if (isDict(profile)) scan(profile, `profiles.${name}.`);
    }
  }
  return grants;
}
function stripYamlComment(line) {
  let quote2 = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote2) {
      if (char === quote2) quote2 = "";
    } else if (char === '"' || char === "'") {
      quote2 = char;
    } else if (char === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}
function yamlLines(content) {
  const lines = [];
  for (const raw of content.split(/\r?\n/)) {
    const text3 = stripYamlComment(raw).replace(/\s+$/, "");
    if (!text3.trim()) continue;
    lines.push({ indent: text3.length - text3.trimStart().length, text: text3.trim() });
  }
  return lines;
}
function yamlListItems(lines) {
  const items = [];
  let current = null;
  let dashIndent = -1;
  for (const line of lines) {
    if (line.text.startsWith("- ") || line.text === "-") {
      if (current === null || line.indent <= dashIndent) {
        current = [line];
        dashIndent = line.indent;
        items.push(current);
        continue;
      }
    } else if (current !== null && line.indent <= dashIndent) {
      current = null;
      continue;
    }
    current?.push(line);
  }
  return items;
}
function workflowPermissions(path, agent, content) {
  const lines = yamlLines(content);
  const rules = /* @__PURE__ */ new Set();
  let inJobs = false;
  let jobIndent = -1;
  let job = "";
  for (const line of lines) {
    if (line.indent === 0) {
      inJobs = /^jobs\s*:$/.test(line.text);
      jobIndent = -1;
      job = "";
    } else if (inJobs) {
      if (jobIndent < 0) jobIndent = line.indent;
      if (line.indent === jobIndent) job = /^["']?([^"':]+)["']?\s*:/.exec(line.text)?.[1] ?? "";
    }
    if (WRITE_ALL.test(line.text)) {
      rules.add(job && line.indent > 0 ? `permissions: write-all (job: ${job})` : "permissions: write-all (workflow)");
    }
  }
  const prTarget = lines.some((line) => PR_TARGET_INLINE.test(line.text) || PR_TARGET_ITEM.test(line.text));
  if (prTarget) {
    for (const step of yamlListItems(lines)) {
      if (!step.some((line) => CHECKOUT_STEP.test(line.text))) continue;
      for (const line of step) {
        const head = PR_HEAD_REF.exec(line.text);
        if (head) {
          const expression = head[1].startsWith("refs/pull/") ? "refs/pull/<number>" : head[1];
          rules.add(`pull_request_target + actions/checkout of the PR head (ref: ${expression}) runs untrusted code with repository secrets`);
        }
      }
    }
  }
  return [...rules].map((rule) => ({ path, agent, effect: "allow", rule, broad: true }));
}
function parsePermissions(path, content) {
  try {
    const normalized = repoPath(path);
    const config2 = classifyAgentConfig(normalized);
    const type = config2?.type;
    if (type === "workflow" || !config2 && isYaml(normalized)) {
      return workflowPermissions(normalized, config2?.agent ?? "GitHub Actions", content);
    }
    if (type === "codex-config" || !config2 && isToml(normalized)) {
      return codexPermissions(normalized, config2?.agent ?? "Codex", parseToml(content).value);
    }
    if (type === "claude-settings" || !config2 && /\.json[c5]?$/i.test(normalized)) {
      return claudePermissions(normalized, config2?.agent ?? "Claude Code", parseJsonc2(content)?.value);
    }
    return [];
  } catch {
    return [];
  }
}
function tokenHits(content) {
  const hits = [];
  const regex = new RegExp(TOKEN_REGEX.source, "g");
  let match;
  while ((match = regex.exec(content)) !== null) {
    const format = TOKEN_FORMATS[match.slice(1).findIndex((group) => group !== void 0)];
    const secret = match[0];
    if (format.marker) {
      hits.push({ start: match.index, kind: format.kind, secret, preview: `${secret} (key block)` });
    } else if (shannonEntropy(secret) >= MIN_TOKEN_ENTROPY && !/EXAMPLE/i.test(secret)) {
      hits.push({ start: match.index, kind: format.kind, secret, preview: redactedPreview(secret) });
    }
  }
  return hits;
}
function urlCredentialHits(content) {
  const hits = [];
  const regex = new RegExp(URL_CREDENTIALS, "g");
  let match;
  while ((match = regex.exec(content)) !== null) {
    const user = match[1];
    const password = match[2];
    if (isPlaceholder(password) || password === user || WEAK_PASSWORDS.has(password.toLowerCase())) continue;
    const start = match.index + match[0].length - password.length - 1;
    hits.push({ start, kind: "url-credentials", secret: password, preview: redactedPreview(password) });
  }
  return hits;
}
function queryParamHits(content) {
  const hits = [];
  const regex = new RegExp(QUERY_PARAM, "g");
  let match;
  while ((match = regex.exec(content)) !== null) {
    const value = match[2];
    if (!isSecretLikeName(match[1]) || value.length < MIN_LITERAL_LENGTH || isPlaceholder(value)) continue;
    if (shannonEntropy(value) < MIN_LITERAL_ENTROPY) continue;
    const start = match.index + match[0].length - value.length;
    hits.push({ start, kind: "high-entropy-secret", secret: value, preview: redactedPreview(value) });
  }
  return hits;
}
function leafKeyAndValue(leaf, previous) {
  const key = leaf.path[leaf.path.length - 1];
  if (key === void 0) return null;
  if (!/^\d+$/.test(key)) return { key, value: leaf.value };
  const assignment = FLAG_ASSIGNMENT.exec(leaf.value);
  if (assignment) return { key: assignment[1], value: assignment[2] };
  const sameArray = previous !== void 0 && previous.path.length === leaf.path.length && previous.path.slice(0, -1).join("\0") === leaf.path.slice(0, -1).join("\0");
  if (sameArray && BARE_FLAG.test(previous.value)) return { key: previous.value, value: leaf.value };
  return null;
}
function literalHits(leaves, skip) {
  const hits = [];
  leaves.forEach((leaf, index) => {
    if (skip.has(leaf)) return;
    const entry = leafKeyAndValue(leaf, leaves[index - 1]);
    if (!entry || !isSecretLikeName(entry.key) || /_?env(?:_?var)?s?$/i.test(entry.key)) return;
    const value = entry.value.trim().replace(/^(?:bearer|basic|token)\s+/i, "");
    if (value.length < MIN_LITERAL_LENGTH || isPlaceholder(value) || isReferenceValue(value)) return;
    if (shannonEntropy(value) < MIN_LITERAL_ENTROPY) return;
    hits.push({
      start: leaf.start,
      kind: "high-entropy-secret",
      secret: value,
      preview: redactedPreview(value),
      location: leaf.path.join(".")
    });
  });
  return hits;
}
function detectInlineSecrets(path, content) {
  if (!content) return [];
  try {
    const normalized = repoPath(path);
    const leaves = parseConfig(normalized, content)?.leaves ?? [];
    const leafAt = (offset) => leaves.find((leaf) => offset >= leaf.start && offset < leaf.end);
    const formatHits = [...tokenHits(content), ...urlCredentialHits(content), ...queryParamHits(content)];
    const generic = literalHits(leaves, new Set(formatHits.map((hit) => leafAt(hit.start))));
    const seen = /* @__PURE__ */ new Set();
    const secrets = [];
    for (const hit of [...formatHits, ...generic]) {
      const line = lineAt(content, hit.start);
      const key = `${line}\0${hit.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dotted = hit.location ?? leafAt(hit.start)?.path.join(".");
      secrets.push({ path: normalized, line, location: dotted || `line ${line}`, preview: hit.preview, kind: hit.kind });
    }
    return secrets.sort((a, b) => a.line - b.line || compare2(a.kind, b.kind));
  } catch {
    return [];
  }
}
function hasKeyBody(content, from) {
  const window = content.slice(from, from + 600).replace(/\\n|\\r|["'`+,\s]/g, "");
  return /^[A-Za-z0-9+/=]{150,}/.test(window);
}
function detectKnownTokens(path, content) {
  if (!content) return [];
  try {
    const normalized = repoPath(path);
    const seen = /* @__PURE__ */ new Set();
    const secrets = [];
    for (const hit of tokenHits(content)) {
      if (hit.kind === "private-key" && !hasKeyBody(content, hit.start + hit.secret.length)) continue;
      const line = lineAt(content, hit.start);
      const key = `${line}\0${hit.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      secrets.push({ path: normalized, line, location: `line ${line}`, preview: hit.preview, kind: hit.kind });
    }
    return secrets;
  } catch {
    return [];
  }
}
function envAccess(graph, membership) {
  const byName = /* @__PURE__ */ new Map();
  for (const [path, facts] of graph.facts) {
    for (const ref of facts.envRefs) {
      const file2 = ref.file || path;
      const entry = byName.get(ref.name) ?? { secretLike: false, readers: /* @__PURE__ */ new Set(), files: /* @__PURE__ */ new Set() };
      entry.secretLike = entry.secretLike || ref.secretLike || isSecretLikeName(ref.name);
      entry.readers.add(membership?.fileToComponent.get(file2) ?? file2);
      entry.files.add(file2);
      byName.set(ref.name, entry);
    }
  }
  return [...byName.entries()].map(([name, entry]) => ({
    name,
    secretLike: entry.secretLike,
    readers: [...entry.readers].sort(compare2),
    files: [...entry.files].sort(compare2)
  })).sort((a, b) => compare2(a.name, b.name));
}
function uniqueBy(items, keyOf) {
  const seen = /* @__PURE__ */ new Map();
  for (const item of items) if (!seen.has(keyOf(item))) seen.set(keyOf(item), item);
  return [...seen.keys()].sort(compare2).map((key) => seen.get(key));
}
function analyzeReach(files, graph, membership) {
  const configs = [];
  const mcpServers = [];
  const inlineSecrets = [];
  const permissions = [];
  for (const file2 of files) {
    const config2 = classifyAgentConfig(file2.path);
    if (!config2) {
      if (file2.content !== null) inlineSecrets.push(...detectKnownTokens(file2.path, file2.content));
      continue;
    }
    configs.push(config2);
    if (file2.content === null) continue;
    if (config2.type === "mcp" || config2.type === "codex-config" || config2.type === "gemini-settings" || config2.type === "claude-settings") {
      mcpServers.push(...parseMcpServers(config2.path, file2.content));
    }
    if (config2.type === "claude-settings" || config2.type === "codex-config" || config2.type === "workflow") {
      permissions.push(...parsePermissions(config2.path, file2.content));
    }
    inlineSecrets.push(...detectInlineSecrets(config2.path, file2.content));
  }
  const pad = (line) => String(line).padStart(9, "0");
  return {
    configs: uniqueBy(configs, (config2) => config2.path),
    mcpServers: uniqueBy(mcpServers, (server) => `${server.configPath}\0${server.name}`),
    inlineSecrets: uniqueBy(inlineSecrets, (secret) => `${secret.path}\0${pad(secret.line)}\0${secret.kind}`),
    permissions: uniqueBy(permissions, (grant) => `${grant.path}\0${grant.effect}\0${grant.rule}`),
    envAccess: envAccess(graph, membership)
  };
}
var CONFIG_RULES, AGENT_CONFIG_GLOBS, MAX_DEPTH, ParseError, JSON_ESCAPES, NOT_ALNUM_BEFORE, TOKEN_FORMATS, TOKEN_REGEX, URL_CREDENTIALS, WEAK_PASSWORDS, MIN_TOKEN_ENTROPY, MIN_LITERAL_LENGTH, MIN_LITERAL_ENTROPY, PLACEHOLDER_WHOLE, REDACTED, FLAG_ASSIGNMENT, BARE_FLAG, MAX_COMMAND_LENGTH, DANGEROUS_COMMANDS, DANGEROUS_BASH, WRITE_TOOLS, WILDCARD_ONLY, CLAUDE_EFFECTS, WRITE_ALL, PR_TARGET_INLINE, PR_TARGET_ITEM, CHECKOUT_STEP, PR_HEAD_REF, QUERY_PARAM;
var init_reach = __esm({
  "src/blueprint/reach.ts"() {
    "use strict";
    init_env();
    init_glob();
    init_paths();
    CONFIG_RULES = [
      { glob: "**/.cursor/mcp.json", type: "mcp", agent: "Cursor" },
      { glob: "**/.vscode/mcp.json", type: "mcp", agent: "VS Code / Copilot" },
      { glob: "**/.windsurf/mcp_config.json", type: "mcp", agent: "Windsurf" },
      { glob: "**/.mcp.json", type: "mcp", agent: "Claude Code" },
      { glob: "**/mcp.json", type: "mcp", agent: "MCP" },
      { glob: "**/.claude/settings.json", type: "claude-settings", agent: "Claude Code" },
      { glob: "**/.claude/settings.local.json", type: "claude-settings", agent: "Claude Code" },
      { glob: "**/.codex/config.toml", type: "codex-config", agent: "Codex" },
      { glob: "**/.gemini/settings.json", type: "gemini-settings", agent: "Gemini CLI" },
      { glob: "**/.cursorrules", type: "cursor-rules", agent: "Cursor" },
      { glob: "**/.cursor/rules/**", type: "cursor-rules", agent: "Cursor" },
      { glob: "**/AGENTS.md", type: "instructions", agent: "AGENTS.md" },
      { glob: "**/agents.md", type: "instructions", agent: "AGENTS.md" },
      { glob: "**/CLAUDE.md", type: "instructions", agent: "Claude Code" },
      { glob: "**/claude.md", type: "instructions", agent: "Claude Code" },
      { glob: "**/GEMINI.md", type: "instructions", agent: "Gemini CLI" },
      { glob: "**/gemini.md", type: "instructions", agent: "Gemini CLI" },
      { glob: "**/.github/copilot-instructions.md", type: "instructions", agent: "GitHub Copilot" },
      { glob: "**/.github/workflows/*.yml", type: "workflow", agent: "GitHub Actions" },
      { glob: "**/.github/workflows/*.yaml", type: "workflow", agent: "GitHub Actions" }
    ];
    AGENT_CONFIG_GLOBS = CONFIG_RULES.map((rule) => rule.glob);
    MAX_DEPTH = 64;
    ParseError = class extends Error {
    };
    JSON_ESCAPES = { n: "\n", t: "	", r: "\r", b: "\b", f: "\f" };
    NOT_ALNUM_BEFORE = "(?<![A-Za-z0-9])";
    TOKEN_FORMATS = [
      { kind: "github-fine-grained-pat", source: `${NOT_ALNUM_BEFORE}github_pat_[A-Za-z0-9_]{82}` },
      { kind: "github-token", source: `${NOT_ALNUM_BEFORE}gh[pousr]_[A-Za-z0-9]{36,255}` },
      { kind: "anthropic-api-key", source: "(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,}" },
      { kind: "openai-api-key", source: "(?<![A-Za-z0-9_-])sk-(?!ant-)[A-Za-z0-9_-]{32,}" },
      { kind: "slack-token", source: `${NOT_ALNUM_BEFORE}xox[abposr]-[A-Za-z0-9-]{10,}` },
      { kind: "aws-access-key-id", source: "(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])" },
      { kind: "google-api-key", source: `${NOT_ALNUM_BEFORE}AIza[0-9A-Za-z_-]{35}` },
      { kind: "gitlab-token", source: `${NOT_ALNUM_BEFORE}glpat-[A-Za-z0-9_-]{20,}` },
      { kind: "npm-token", source: `${NOT_ALNUM_BEFORE}npm_[A-Za-z0-9]{36}` },
      { kind: "huggingface-token", source: `${NOT_ALNUM_BEFORE}hf_[A-Za-z0-9]{34}` },
      { kind: "stripe-live-key", source: `${NOT_ALNUM_BEFORE}[sr]k_live_[A-Za-z0-9]{16,}` },
      { kind: "sendgrid-api-key", source: `${NOT_ALNUM_BEFORE}SG\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}` },
      { kind: "private-key", source: "-----BEGIN [A-Z ]*PRIVATE KEY-----", marker: true },
      {
        kind: "jwt",
        source: `${NOT_ALNUM_BEFORE}eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}`
      }
    ];
    TOKEN_REGEX = new RegExp(TOKEN_FORMATS.map((format) => `(${format.source})`).join("|"), "g");
    URL_CREDENTIALS = "[A-Za-z][A-Za-z0-9+.-]*://([^\\s/:@\"'`]*):([^\\s/@\"'`]+)@";
    WEAK_PASSWORDS = /* @__PURE__ */ new Set(["password", "pass", "passwd", "secret", "postgres", "root", "admin", "user", "example"]);
    MIN_TOKEN_ENTROPY = 2.5;
    MIN_LITERAL_LENGTH = 16;
    MIN_LITERAL_ENTROPY = 3.5;
    PLACEHOLDER_WHOLE = [
      /^\$\{[^}]*\}$/,
      /^\$[A-Za-z_]\w*$/,
      /^\{env:[^}]+\}$/i,
      /^<[^>]*>$/,
      /^\[[^\]]*\]$/,
      /^%\w+%$/,
      /^(?:your|my|insert|replace|put|enter|add|example|sample|dummy|placeholder|changeme|change[-_ ]?me|todo|redacted|none|null|undefined)(?![a-z0-9])/i,
      /^x{3,}/i,
      /^[*.xX\-_ ]+$/
    ];
    REDACTED = "[redacted]";
    FLAG_ASSIGNMENT = /^(-{0,2}[A-Za-z][\w.-]*)=([\s\S]+)$/;
    BARE_FLAG = /^--?[A-Za-z][\w.-]*$/;
    MAX_COMMAND_LENGTH = 300;
    DANGEROUS_COMMANDS = "sudo|curl|wget|rm|bash|sh|zsh|eval|ssh|powershell|pwsh";
    DANGEROUS_BASH = new RegExp(`^(?:${DANGEROUS_COMMANDS})(?:\\s+-[\\w-]+)*\\s*(?::?\\*)?$`);
    WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
    WILDCARD_ONLY = /^[*/.:\s]*\*[*/.:\s]*$/;
    CLAUDE_EFFECTS = ["allow", "deny", "ask"];
    WRITE_ALL = /^permissions\s*:\s*["']?write-all["']?$/;
    PR_TARGET_INLINE = /^["']?on["']?\s*:.*\bpull_request_target\b/;
    PR_TARGET_ITEM = /^(?:-\s*)?pull_request_target\s*:?(?:\s*\{.*\}|\s*\[.*\])?$/;
    CHECKOUT_STEP = /^(?:-\s*)?uses\s*:\s*["']?actions\/checkout@/;
    PR_HEAD_REF = /^ref\s*:.*(github\.event\.pull_request\.head\.(?:sha|ref)|github\.head_ref|refs\/pull\/\$\{\{\s*github\.event\.(?:pull_request\.)?number\s*\}\}\/(?:head|merge))/;
    QUERY_PARAM = "[?&]([A-Za-z][\\w.-]*)=([^&\\s\"'`#]+)";
  }
});

// src/blueprint/diff.ts
function pushCodePoint(bytes, codePoint) {
  if (codePoint < 128) bytes.push(codePoint);
  else if (codePoint < 2048) bytes.push(192 | codePoint >> 6, 128 | codePoint & 63);
  else if (codePoint < 65536) {
    bytes.push(224 | codePoint >> 12, 128 | codePoint >> 6 & 63, 128 | codePoint & 63);
  } else {
    bytes.push(
      240 | codePoint >> 18,
      128 | codePoint >> 12 & 63,
      128 | codePoint >> 6 & 63,
      128 | codePoint & 63
    );
  }
}
function decodeUtf8(bytes) {
  let result = "";
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index];
    let needed = 0;
    let codePoint = lead;
    if (lead >= 240 && lead < 248) {
      needed = 3;
      codePoint = lead & 7;
    } else if (lead >= 224 && lead < 240) {
      needed = 2;
      codePoint = lead & 15;
    } else if (lead >= 192 && lead < 224) {
      needed = 1;
      codePoint = lead & 31;
    }
    let valid = lead < 128 || needed > 0;
    for (let offset = 1; valid && offset <= needed; offset += 1) {
      const next = bytes[index + offset];
      if (next === void 0 || (next & 192) !== 128) valid = false;
      else codePoint = codePoint << 6 | next & 63;
    }
    if (!valid || codePoint > 1114111) {
      result += "�";
      index += 1;
      continue;
    }
    result += String.fromCodePoint(codePoint);
    index += needed + 1;
  }
  return result;
}
function readQuoted2(text3, start) {
  if (text3[start] !== '"') return null;
  const bytes = [];
  let index = start + 1;
  while (index < text3.length) {
    const char = text3[index];
    if (char === '"') return { value: decodeUtf8(bytes), end: index + 1 };
    if (char === "\\") {
      const next = text3[index + 1];
      if (next === void 0) return null;
      const octal = /^[0-7]{1,3}/.exec(text3.slice(index + 1, index + 4));
      if (octal) {
        bytes.push(parseInt(octal[0], 8) & 255);
        index += 1 + octal[0].length;
        continue;
      }
      const simple = SIMPLE_ESCAPES[next];
      if (simple !== void 0) bytes.push(simple);
      else pushCodePoint(bytes, next.codePointAt(0) ?? 63);
      index += 2;
      continue;
    }
    const codePoint = text3.codePointAt(index) ?? 63;
    pushCodePoint(bytes, codePoint);
    index += codePoint > 65535 ? 2 : 1;
  }
  return null;
}
function unquotePath(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"')) {
    const quoted2 = readQuoted2(trimmed, 0);
    if (quoted2) return quoted2.value;
  }
  return trimmed;
}
function stripPrefix(path) {
  return path.replace(PREFIX, "");
}
function headerPath(body) {
  let path;
  if (body.startsWith('"')) {
    path = unquotePath(body);
  } else {
    const tab = body.indexOf("	");
    path = tab >= 0 ? body.slice(0, tab) : body;
    path = path.replace(/\r$/, "");
  }
  if (path === "/dev/null") return null;
  return stripPrefix(path);
}
function gitHeaderPaths(rest) {
  if (rest.startsWith('"')) {
    const first = readQuoted2(rest, 0);
    if (!first) return null;
    const remainder = rest.slice(first.end).trim();
    return { oldPath: stripPrefix(first.value), newPath: stripPrefix(unquotePath(remainder)) };
  }
  if (rest.endsWith('"')) {
    const open2 = rest.indexOf(' "');
    if (open2 > 0) {
      return { oldPath: stripPrefix(rest.slice(0, open2)), newPath: stripPrefix(unquotePath(rest.slice(open2 + 1))) };
    }
  }
  for (let index = rest.indexOf(" "); index >= 0; index = rest.indexOf(" ", index + 1)) {
    const left = rest.slice(0, index);
    const right = rest.slice(index + 1);
    if (PREFIX.test(left) && PREFIX.test(right) && stripPrefix(left) === stripPrefix(right)) {
      return { oldPath: stripPrefix(left), newPath: stripPrefix(right) };
    }
  }
  const split = rest.indexOf(" b/");
  if (split > 0) return { oldPath: stripPrefix(rest.slice(0, split)), newPath: stripPrefix(rest.slice(split + 1)) };
  return null;
}
function newDraft() {
  return {
    oldPath: null,
    newPath: null,
    isNew: false,
    isDeleted: false,
    isRename: false,
    binary: false,
    sawFileHeader: false,
    added: [],
    removed: []
  };
}
function finishDraft(draft) {
  const path = draft.isDeleted ? draft.oldPath ?? draft.newPath : draft.newPath ?? draft.oldPath;
  if (!path) return null;
  let status = "modified";
  if (draft.isNew) status = "added";
  else if (draft.isDeleted) status = "deleted";
  else if (draft.isRename || draft.oldPath !== null && draft.newPath !== null && draft.oldPath !== draft.newPath) {
    status = "renamed";
  }
  const file2 = { path, status, added: draft.added, removed: draft.removed };
  if (status === "renamed" && draft.oldPath && draft.oldPath !== path) file2.previousPath = draft.oldPath;
  if (draft.binary) file2.binary = true;
  return file2;
}
function parseUnifiedDiff(text3) {
  const files = [];
  const lines = text3.split("\n");
  let draft = null;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  const flush = () => {
    if (draft) {
      const file2 = finishDraft(draft);
      if (file2) files.push(file2);
    }
    draft = null;
    oldRemaining = 0;
    newRemaining = 0;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (draft && (oldRemaining > 0 || newRemaining > 0)) {
      const marker = raw[0];
      if (marker === "\\") continue;
      const content = raw.slice(1).replace(/\r$/, "");
      if (marker === "+" && newRemaining > 0) {
        draft.added.push({ line: newLine, text: content });
        newLine += 1;
        newRemaining -= 1;
        continue;
      }
      if (marker === "-" && oldRemaining > 0) {
        draft.removed.push({ line: oldLine, text: content });
        oldLine += 1;
        oldRemaining -= 1;
        continue;
      }
      if (marker === " " || marker === void 0 || raw === "\r") {
        oldLine += 1;
        newLine += 1;
        oldRemaining = Math.max(0, oldRemaining - 1);
        newRemaining = Math.max(0, newRemaining - 1);
        continue;
      }
      oldRemaining = 0;
      newRemaining = 0;
    }
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("diff --git ")) {
      flush();
      draft = newDraft();
      const paths = gitHeaderPaths(line.slice("diff --git ".length));
      if (paths) {
        draft.oldPath = paths.oldPath;
        draft.newPath = paths.newPath;
      }
      continue;
    }
    if (line.startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ")) {
      if (!draft || draft.sawFileHeader) {
        flush();
        draft = newDraft();
      }
      const target = draft;
      target.sawFileHeader = true;
      const oldPath = headerPath(line.slice(4));
      const newPath = headerPath((lines[index + 1] ?? "").replace(/\r$/, "").slice(4));
      if (oldPath === null) target.isNew = true;
      else target.oldPath = oldPath;
      if (newPath === null) target.isDeleted = true;
      else target.newPath = newPath;
      index += 1;
      continue;
    }
    if (!draft) continue;
    const current = draft;
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      oldRemaining = hunk[2] === void 0 ? 1 : Number(hunk[2]);
      newLine = Number(hunk[3]);
      newRemaining = hunk[4] === void 0 ? 1 : Number(hunk[4]);
      continue;
    }
    if (line.startsWith("new file mode")) current.isNew = true;
    else if (line.startsWith("deleted file mode")) current.isDeleted = true;
    else if (line.startsWith("rename from ")) {
      current.isRename = true;
      current.oldPath = unquotePath(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) {
      current.isRename = true;
      current.newPath = unquotePath(line.slice("rename to ".length));
    } else if (line.startsWith("copy from ")) {
      current.isNew = true;
      current.oldPath = null;
    } else if (line.startsWith("copy to ")) {
      current.newPath = unquotePath(line.slice("copy to ".length));
    } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.binary = true;
    }
  }
  flush();
  return files;
}
function fileAdded(path, content) {
  const lines = content.length === 0 ? [] : content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return {
    path,
    status: "added",
    added: lines.map((text3, index) => ({ line: index + 1, text: text3.replace(/\r$/, "") })),
    removed: []
  };
}
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function categoryFor(paths) {
  for (const definition of DEFAULT_TRIPWIRES) {
    const matcher = compileGlob(definition.glob);
    if (paths.some((path) => matcher.test(path))) return definition.category;
  }
  return "contract";
}
function withRenameNote(reason, change, matchedCurrent) {
  if (matchedCurrent || !change.previousPath) return reason;
  return `${reason} (moved from ${change.previousPath})`;
}
function matchTripwires(changes, options) {
  const hits = [];
  const seen = /* @__PURE__ */ new Set();
  const ordered = [...changes].sort((left, right) => compareText(left.path, right.path));
  for (const change of ordered) {
    const candidates = change.previousPath ? [change.path, change.previousPath] : [change.path];
    const add = (source, hit) => {
      const key = `${change.path}\0${source}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push(hit);
    };
    if (options.defaults) {
      for (const definition of DEFAULT_TRIPWIRES) {
        const matcher = compileGlob(definition.glob);
        if (!candidates.some((path) => matcher.test(path))) continue;
        add("default", {
          path: change.path,
          category: definition.category,
          reason: withRenameNote(definition.reason, change, matcher.test(change.path)),
          severity: "warning"
        });
        break;
      }
    }
    if (options.extra?.length && candidates.some((path) => matchesAny(path, options.extra))) {
      add("extra", {
        path: change.path,
        category: categoryFor(candidates),
        reason: withRenameNote("Protected by blueprint policy", change, matchesAny(change.path, options.extra)),
        severity: "warning"
      });
    }
    for (const rule of options.protectRules ?? []) {
      if (!candidates.some((path) => matchesAny(path, rule.paths))) continue;
      add(`rule:${rule.id}`, {
        path: change.path,
        category: categoryFor(candidates),
        reason: withRenameNote(
          rule.reason?.trim() || `Protected by blueprint rule ${rule.id}`,
          change,
          matchesAny(change.path, rule.paths)
        ),
        ruleId: rule.id,
        severity: rule.severity ?? "warning"
      });
    }
  }
  return hits;
}
function isSnapshotFile(path) {
  return matchesAny(path, SNAPSHOT_PATTERNS);
}
function isTestFile(path) {
  return matchesAny(path, TEST_PATTERNS) && !isSnapshotFile(path);
}
function isCiFile(path) {
  return matchesAny(path, CI_PATTERNS);
}
function isShellLike(path) {
  return SHELL_EXTENSIONS.has(extname(path)) || matchesAny(path, HOOK_PATTERNS);
}
function isVerificationFile(path) {
  if (isTestFile(path) || isCiFile(path) || matchesAny(path, RUNNER_CONFIG_PATTERNS)) return true;
  if (matchesAny(path, HOOK_PATTERNS)) return true;
  return SHELL_EXTENSIONS.has(extname(path)) && /(test|spec|ci|lint|check|verify)/i.test(basename(path));
}
function codeOnly(path, text3) {
  if (!CODE_EXTENSIONS.has(extname(path).toLowerCase())) return text3;
  return text3.replace(STRING_LITERAL, (match) => match.length <= 2 ? match : `${match[0]}${" ".repeat(match.length - 2)}${match[match.length - 1]}`);
}
function excerpt(text3, max = 80) {
  const trimmed = text3.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
function ciCommand(text3) {
  let body = text3.trim().replace(/^-\s+/, "");
  if (!body || body.startsWith("#")) return null;
  const key = /^([\w.-]+):(?:\s+(.*))?$/.exec(body);
  if (key) {
    if (!COMMAND_KEYS.has(key[1])) return null;
    body = (key[2] ?? "").trim();
  }
  body = body.replace(/^["']|["']$/g, "").trim();
  return body && !/^[|>][+-]?$/.test(body) ? body : null;
}
function commandClasses(command) {
  return COMMAND_CLASSES.filter((entry) => entry.pattern.test(command)).map((entry) => entry.kind);
}
function thresholdOf(text3) {
  const match = THRESHOLD_PATTERN.exec(text3);
  if (!match) return null;
  return { key: match[1].toLowerCase().replace(/-/g, "_"), value: Number(match[2]) };
}
function scriptOf(text3) {
  const match = SCRIPT_PATTERN.exec(text3);
  return match ? { name: match[1], command: match[2] } : null;
}
function detectDeletedTest(change) {
  if (change.status === "deleted" && isTestFile(change.path)) {
    return [{ path: change.path, signal: "test-file-deleted", severity: "warning", message: "Test file deleted" }];
  }
  const leavesRunner = (from, to) => isTestFile(from) && !isTestFile(to) || matchesAny(from, NAMED_TEST_PATTERNS) && !matchesAny(to, NAMED_TEST_PATTERNS);
  if (change.status === "renamed" && change.previousPath && leavesRunner(change.previousPath, change.path)) {
    return [
      {
        path: change.path,
        signal: "test-file-deleted",
        severity: "warning",
        message: `Test file ${change.previousPath} was renamed to a path test runners do not pick up`
      }
    ];
  }
  return [];
}
function detectTestLineSignals(change) {
  const signals = [];
  for (const { line, text: text3 } of change.added) {
    const code = codeOnly(change.path, text3);
    if (SKIP_PATTERNS.some((pattern2) => pattern2.test(code))) {
      signals.push({
        path: change.path,
        line,
        signal: "test-skipped",
        severity: "warning",
        message: `Test skipped or disabled: ${excerpt(text3)}`
      });
    }
    if (FOCUS_PATTERNS.some((pattern2) => pattern2.test(code))) {
      signals.push({
        path: change.path,
        line,
        signal: "test-focused",
        severity: "warning",
        message: `Focused test silently skips every other test: ${excerpt(text3)}`
      });
    }
    if (TRIVIAL_PATTERNS.some((pattern2) => pattern2.test(code))) {
      signals.push({
        path: change.path,
        line,
        signal: "assertion-trivialized",
        severity: "warning",
        message: `Assertion cannot fail: ${excerpt(text3)}`
      });
    }
  }
  return signals;
}
function isAssertion(text3) {
  if (COMMENTED_LINE.test(text3)) return false;
  return ASSERTION_PATTERN.test(text3) && !TRIVIAL_PATTERNS.some((pattern2) => pattern2.test(text3));
}
function detectRemovedAssertions(change) {
  if (change.status !== "modified" && change.status !== "renamed") return [];
  const assertion = (entry) => isAssertion(codeOnly(change.path, entry.text));
  const removed = change.removed.filter(assertion);
  if (removed.length === 0) return [];
  const added = change.added.filter(assertion).length;
  const otherAdded = change.added.some((entry) => entry.text.trim() && !assertion(entry));
  const otherRemoved = change.removed.some((entry) => entry.text.trim() && !assertion(entry));
  const strippedOnly = added === 0 && (otherAdded || !otherRemoved);
  if (removed.length - added < 3 && !strippedOnly) return [];
  const noun = removed.length === 1 ? "assertion" : "assertions";
  return [
    {
      path: change.path,
      line: removed[0].line,
      signal: "assertions-removed",
      severity: "warning",
      message: added === 0 ? `${removed.length} ${noun} removed and none added` : `${removed.length} ${noun} removed, only ${added} added`
    }
  ];
}
function shellExitFakesSuccess(text3, hook) {
  if (!SHELL_EXIT_PATTERN.test(text3) || COMMENTED_LINE.test(text3)) return false;
  if (/\|\|\s*exit\s+0\b/.test(text3)) return true;
  if (hook && /^\s*exit\s+0\s*(?:#.*)?$/.test(text3)) return true;
  const command = text3.replace(SHELL_EXIT_PATTERN, " ");
  if (/\bif\b|\bthen\b|\bfi\b|\belse\b/.test(text3)) return false;
  return commandClasses(command).some((kind) => kind === "test" || kind === "lint" || kind === "typecheck" || kind === "check");
}
function detectExitZero(change) {
  const isPackageJson = basename(change.path) === "package.json";
  if (!isPackageJson && !isVerificationFile(change.path)) return [];
  const shell = isCiFile(change.path) || isShellLike(change.path) || matchesAny(change.path, HOOK_PATTERNS);
  const signals = [];
  for (const { line, text: text3 } of change.added) {
    if (isPackageJson) {
      if (!scriptOf(text3) || !SHELL_EXIT_PATTERN.test(text3)) continue;
    } else if (!EXIT_PATTERNS.some((pattern2) => pattern2.test(codeOnly(change.path, text3))) && !(shell && shellExitFakesSuccess(text3, matchesAny(change.path, HOOK_PATTERNS)))) {
      continue;
    }
    signals.push({
      path: change.path,
      line,
      signal: "exit-zero",
      severity: "error",
      message: `Forced success exit can fake a passing run: ${excerpt(text3)}`
    });
  }
  return signals;
}
function detectSuppressions(change) {
  if (DOC_EXTENSIONS.has(extname(change.path).toLowerCase())) return [];
  const found = [];
  for (const { line, text: text3 } of change.added) {
    const match = SUPPRESSION_PATTERNS.find((entry) => entry.pattern.test(codeOnly(change.path, text3)));
    if (match) found.push({ line, label: match.label, text: text3 });
  }
  if (found.length === 0) return [];
  if (found.length >= 3) {
    return [
      {
        path: change.path,
        line: found[0].line,
        signal: "suppression-added",
        severity: "warning",
        message: `${found.length} check suppressions added (lines ${found.map((entry) => entry.line).join(", ")})`
      }
    ];
  }
  return found.map((entry) => ({
    path: change.path,
    line: entry.line,
    signal: "suppression-added",
    severity: "info",
    message: `Check suppression added (${entry.label}): ${excerpt(entry.text)}`
  }));
}
function detectTestExclusion(change) {
  const signals = [];
  for (const { line, text: text3 } of change.added) {
    if (COMMENTED_LINE.test(text3) || !TEST_EXCLUSION_PATTERNS.some((pattern2) => pattern2.test(text3))) continue;
    signals.push({
      path: change.path,
      line,
      signal: "tests-excluded",
      severity: "warning",
      message: `Test runner now excludes tests: ${excerpt(text3)}`
    });
  }
  return signals;
}
function detectCiWeakening(change) {
  const signals = [];
  for (const { line, text: text3 } of change.added) {
    if (text3.trim().startsWith("#")) continue;
    const match = CI_WEAKENING_PATTERNS.find((entry) => entry.pattern.test(text3));
    if (match) {
      signals.push({
        path: change.path,
        line,
        signal: "ci-weakened",
        severity: "warning",
        message: `CI weakened: ${match.label}`
      });
    }
  }
  const addsPrTrigger = change.added.some((entry) => PR_TRIGGER.test(entry.text));
  for (const { line, text: text3 } of change.removed) {
    if (!PR_TRIGGER.test(text3) || addsPrTrigger) continue;
    signals.push({
      path: change.path,
      line,
      signal: "ci-weakened",
      severity: "warning",
      message: "CI no longer runs on pull requests (pull_request trigger removed)"
    });
  }
  const lost = [];
  const addedClasses = /* @__PURE__ */ new Set();
  for (const { text: text3 } of change.added) {
    const command = ciCommand(text3);
    if (command) for (const kind of commandClasses(command)) addedClasses.add(kind);
  }
  for (const { line, text: text3 } of change.removed) {
    const command = ciCommand(text3);
    if (!command) continue;
    const classes = commandClasses(command);
    if (classes.length === 0 || classes.some((kind) => addedClasses.has(kind))) continue;
    lost.push({ line, command });
  }
  if (change.status === "deleted" && lost.length > 0) {
    signals.push({
      path: change.path,
      signal: "ci-weakened",
      severity: "warning",
      message: `CI file deleted; it ran ${lost.map((entry) => `"${excerpt(entry.command, 40)}"`).slice(0, 3).join(", ")}${lost.length > 3 ? ` and ${lost.length - 3} more` : ""}`
    });
    return signals;
  }
  for (const entry of lost) {
    signals.push({
      path: change.path,
      line: entry.line,
      signal: "ci-weakened",
      severity: "warning",
      message: `CI no longer runs "${excerpt(entry.command, 60)}"`
    });
  }
  return signals;
}
function detectCoverageLowered(change) {
  const addedByKey = /* @__PURE__ */ new Map();
  for (const { line, text: text3 } of change.added) {
    const threshold = thresholdOf(text3);
    if (!threshold) continue;
    const list = addedByKey.get(threshold.key) ?? [];
    list.push({ line, value: threshold.value });
    addedByKey.set(threshold.key, list);
  }
  const signals = [];
  const cursor = /* @__PURE__ */ new Map();
  for (const { text: text3 } of change.removed) {
    const threshold = thresholdOf(text3);
    if (!threshold) continue;
    const position = cursor.get(threshold.key) ?? 0;
    cursor.set(threshold.key, position + 1);
    const counterpart = addedByKey.get(threshold.key)?.[position];
    if (!counterpart) {
      if (!addedByKey.has(threshold.key) && threshold.value > 0) {
        signals.push({
          path: change.path,
          line: change.removed.find((entry) => thresholdOf(entry.text)?.key === threshold.key)?.line,
          signal: "coverage-threshold-removed",
          severity: "warning",
          message: `Coverage threshold "${threshold.key}" (${threshold.value}) removed`
        });
      }
      continue;
    }
    if (counterpart.value >= threshold.value) continue;
    signals.push({
      path: change.path,
      line: counterpart.line,
      signal: "coverage-threshold-lowered",
      severity: "warning",
      message: `Coverage threshold "${threshold.key}" lowered from ${threshold.value} to ${counterpart.value}`
    });
  }
  return signals;
}
function detectScriptChanges(change) {
  const scripts = /* @__PURE__ */ new Map();
  for (const entry of change.removed) {
    const script = scriptOf(entry.text);
    if (!script || scripts.has(script.name)) continue;
    scripts.set(script.name, { removed: entry, before: script.command });
  }
  for (const entry of change.added) {
    const script = scriptOf(entry.text);
    if (!script) continue;
    const existing = scripts.get(script.name) ?? {};
    if (existing.added) continue;
    scripts.set(script.name, { ...existing, added: entry, after: script.command });
  }
  const signals = [];
  for (const [name, entry] of scripts) {
    if (entry.before !== void 0 && entry.before === entry.after) continue;
    if (entry.before === void 0) continue;
    let message;
    if (entry.before !== void 0 && entry.after !== void 0) {
      message = `Script "${name}" changed from ${excerpt(entry.before, 60)} to ${excerpt(entry.after, 60)}`;
    } else if (entry.after !== void 0) {
      message = `Script "${name}" added: ${excerpt(entry.after, 60)}`;
    } else {
      message = `Script "${name}" removed (was ${excerpt(entry.before ?? "", 60)})`;
    }
    signals.push({
      path: change.path,
      line: entry.added?.line ?? entry.removed?.line,
      signal: "test-script-changed",
      severity: "warning",
      message
    });
  }
  return signals;
}
function detectSnapshotChurn(changes) {
  const snapshots = changes.filter((change) => (change.status === "modified" || change.status === "deleted") && isSnapshotFile(change.path)).map((change) => change.path).sort(compareText);
  if (snapshots.length < 5) return [];
  return [
    {
      path: snapshots[0],
      signal: "snapshots-mass-updated",
      severity: "info",
      message: `${snapshots.length} snapshot files modified or deleted; expected output may have been regenerated to match new behavior`
    }
  ];
}
function detectTestSpecialCasing(change) {
  if (!CODE_EXTENSIONS.has(extname(change.path).toLowerCase()) || isVerificationFile(change.path)) return [];
  if (matchesAny(change.path, RUNNER_CONFIG_PATTERNS)) return [];
  const signals = [];
  for (const { line, text: text3 } of change.added) {
    const masked = codeOnly(change.path, text3);
    const inCode = TEST_DETECTION_PATTERNS.some((pattern2) => {
      const match = pattern2.exec(text3);
      return match !== null && masked[match.index] === text3[match.index] && masked[match.index] !== " ";
    });
    if (!inCode) continue;
    signals.push({
      path: change.path,
      line,
      signal: "test-special-casing",
      severity: "warning",
      message: `Production code now behaves differently under tests: ${excerpt(text3)}`
    });
  }
  return signals;
}
function detectVerificationWeakening(changes) {
  const signals = [];
  for (const change of changes) {
    signals.push(...detectDeletedTest(change));
    if (change.binary) continue;
    const testFile = isTestFile(change.path) || basename(change.path) === "conftest.py";
    if (testFile) {
      signals.push(...detectTestLineSignals(change));
      signals.push(...detectRemovedAssertions(change));
    } else {
      signals.push(...detectTestSpecialCasing(change));
    }
    signals.push(...detectExitZero(change));
    signals.push(...detectSuppressions(change));
    if (isCiFile(change.path)) signals.push(...detectCiWeakening(change));
    if (matchesAny(change.path, RUNNER_CONFIG_PATTERNS)) signals.push(...detectTestExclusion(change));
    if (matchesAny(change.path, COVERAGE_CONFIG_PATTERNS)) signals.push(...detectCoverageLowered(change));
    if (basename(change.path) === "package.json") signals.push(...detectScriptChanges(change));
  }
  signals.push(...detectSnapshotChurn(changes));
  return signals.sort(
    (left, right) => compareText(left.path, right.path) || (left.line ?? 0) - (right.line ?? 0) || compareText(left.signal, right.signal) || compareText(left.message, right.message)
  );
}
var SIMPLE_ESCAPES, PREFIX, HUNK_HEADER, SNAPSHOT_PATTERNS, CI_PATTERNS, HOOK_PATTERNS, RUNNER_CONFIG_PATTERNS, COVERAGE_CONFIG_PATTERNS, SHELL_EXTENSIONS, DOC_EXTENSIONS, CODE_EXTENSIONS, STRING_LITERAL, SKIP_PATTERNS, FOCUS_PATTERNS, ASSERTION_PATTERN, LITERAL, TRIVIAL_PATTERNS, EXIT_PATTERNS, SHELL_EXIT_PATTERN, SUPPRESSION_PATTERNS, CI_WEAKENING_PATTERNS, COMMAND_CLASSES, COMMAND_KEYS, THRESHOLD_PATTERN, SCRIPT_PATTERN, NAMED_TEST_PATTERNS, COMMENTED_LINE, PR_TRIGGER, TEST_EXCLUSION_PATTERNS, TEST_DETECTION_PATTERNS;
var init_diff = __esm({
  "src/blueprint/diff.ts"() {
    "use strict";
    init_constants();
    init_glob();
    init_paths();
    SIMPLE_ESCAPES = {
      a: 7,
      b: 8,
      t: 9,
      n: 10,
      v: 11,
      f: 12,
      r: 13,
      '"': 34,
      "\\": 92
    };
    PREFIX = /^[abciow]\//;
    HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
    SNAPSHOT_PATTERNS = ["**/__snapshots__/**", "*.snap"];
    CI_PATTERNS = [".github/workflows/**", ".gitlab-ci.yml", ".circleci/**", "azure-pipelines.yml", "Jenkinsfile"];
    HOOK_PATTERNS = [".husky/**", ".git-hooks/**", ".githooks/**"];
    RUNNER_CONFIG_PATTERNS = [
      "{jest,vitest,playwright,cypress,karma,wdio}.config.*",
      "{jest,vitest}.{setup,workspace}.*",
      ".mocharc*",
      "conftest.py",
      "pytest.ini",
      "tox.ini",
      "noxfile.py"
    ];
    COVERAGE_CONFIG_PATTERNS = [
      "{jest,vitest}.config.*",
      "package.json",
      "pyproject.toml",
      "setup.cfg",
      "tox.ini",
      "pytest.ini",
      ".coveragerc",
      "{codecov,.codecov}.{yml,yaml}",
      ".nycrc*",
      ".c8rc*"
    ];
    SHELL_EXTENSIONS = /* @__PURE__ */ new Set([".sh", ".bash", ".zsh"]);
    DOC_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
    CODE_EXTENSIONS = /* @__PURE__ */ new Set([
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".py",
      ".go",
      ".java",
      ".kt",
      ".kts",
      ".rs",
      ".rb",
      ".php",
      ".cs",
      ".swift",
      ".c",
      ".cc",
      ".cpp",
      ".h",
      ".hpp",
      ".scala"
    ]);
    STRING_LITERAL = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g;
    SKIP_PATTERNS = [
      /\.skip\s*\(/,
      /\b(?:it|test|describe|context|suite)\.skip\b/,
      /\.skipIf\s*\(/,
      /\b(?:xit|xdescribe|xtest|xcontext|xspecify)\s*\(/,
      /@pytest\.mark\.(?:skip|skipif|xfail)\b/,
      /@unittest\.(?:skip|skipIf|skipUnless|expectedFailure)\b/,
      /\bt\.Skip(?:f|Now)?\s*\(/,
      /@Disabled\b/,
      /@Ignore\b/,
      /#\[ignore\b/
    ];
    FOCUS_PATTERNS = [/\.only\s*\(/, /\b(?:fit|fdescribe|fcontext)\s*\(/];
    ASSERTION_PATTERN = /\bexpect\s*\(|\bassert\w*|\bshould\.|\.should\b|\.to(?:Be|Equal|StrictEqual|Have|Match|Throw|Contain)\w*\s*\(|\brequire\.[A-Z]\w*\s*\(|\bt\.(?:Error|Fatal)f?\s*\(/;
    LITERAL = String.raw`(?:true|false|null|undefined|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')`;
    TRIVIAL_PATTERNS = [
      new RegExp(String.raw`\bexpect\s*\(\s*${LITERAL}\s*\)\s*\.(?:not\.)?to\w+\s*\(`),
      /^\s*assert\s+(?:True|1|not\s+False)\s*(?:,|#|$)/,
      /^\s*assert\s+(\w+|"[^"]*"|'[^']*')\s*==\s*\1\s*(?:,|#|$)/,
      /\bassert(?:True|_true|\.ok|\.isTrue)?\s*\(\s*(?:true|True|1)\s*[,)]/,
      /\bassert(?:Equals?|_equal|\.equal|\.strictEqual|\.deepEqual|_eq!)\s*\(\s*(\w+|"[^"]*"|'[^']*')\s*,\s*\1\s*[,)]/,
      /\bassert\.(?:True|Equal)\s*\(\s*t\s*,\s*true\s*[,)]/
    ];
    EXIT_PATTERNS = [
      /\bprocess\.exit\s*\(\s*0\s*\)/,
      /\bsys\.exit\s*\(\s*0\s*\)/,
      /\bos\._?exit\s*\(\s*0\s*\)/,
      /\bos\.Exit\s*\(\s*0\s*\)/
    ];
    SHELL_EXIT_PATTERN = /(?:^|[\s;&|("'`])exit\s+0\b/;
    SUPPRESSION_PATTERNS = [
      { pattern: /@ts-(?:ignore|nocheck|expect-error)\b/, label: "TypeScript check suppressed" },
      { pattern: /\beslint-disable\b/, label: "ESLint rule disabled" },
      { pattern: /\bbiome-ignore\b/, label: "Biome rule ignored" },
      { pattern: /#\s*type:\s*ignore/, label: "type check ignored" },
      { pattern: /#\s*noqa\b/, label: "lint check suppressed (noqa)" },
      { pattern: /#\s*pylint:\s*disable/, label: "pylint check disabled" },
      { pattern: /#\s*pragma:\s*no cover/, label: "excluded from coverage" },
      { pattern: /\/\/\s*nolint\b/, label: "lint check suppressed (nolint)" },
      { pattern: /#!?\[allow\(/, label: "Rust lint allowed" },
      { pattern: /@SuppressWarnings\b/, label: "warnings suppressed" },
      { pattern: /\bistanbul ignore\b/, label: "excluded from coverage" },
      { pattern: /\b(?:c8|v8) ignore\b/, label: "excluded from coverage" }
    ];
    CI_WEAKENING_PATTERNS = [
      { pattern: /\bcontinue-on-error:\s*true\b/, label: "step failures are ignored (continue-on-error: true)" },
      { pattern: /\ballow_failure:\s*true\b/, label: "job failures are allowed (allow_failure: true)" },
      { pattern: /\|\|\s*(?:true\b|:(?:\s|$))/, label: "command failure is swallowed (|| true)" },
      { pattern: /--no-verify\b/, label: "hooks are bypassed (--no-verify)" },
      { pattern: /^\s*-?\s*if:\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/, label: "step or job is disabled (if: false)" },
      { pattern: /--passWithNoTests\b/, label: "an empty test run passes (--passWithNoTests)" },
      { pattern: /--bail[=\s]0\b/, label: "test bail-out is disabled (--bail=0)" }
    ];
    COMMAND_CLASSES = [
      { kind: "test", pattern: /\b(?:tests?|vitest|jest|pytest|mocha|playwright|cypress|unittest|rspec|phpunit)\b/i },
      { kind: "lint", pattern: /\b(?:lint|eslint|ruff|clippy|vet|flake8|pylint|golangci-lint|biome|rubocop)\b/i },
      { kind: "typecheck", pattern: /\b(?:typecheck|type-check|tsc|mypy|pyright)\b/i },
      { kind: "build", pattern: /\bbuild\b/i },
      { kind: "check", pattern: /\bcheck\b/i }
    ];
    COMMAND_KEYS = /* @__PURE__ */ new Set(["run", "script", "command", "cmd", "sh", "bash"]);
    THRESHOLD_PATTERN = /(?:^|[^\w-])["']?(coverageThreshold|thresholds?|statements|branches|functions|lines|fail[_-]under|min[_-]coverage|minimum|target)["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i;
    SCRIPT_PATTERN = /^\s*"(test|test:[^"]*|lint|typecheck|check|ci)"\s*:\s*(.*?),?\s*$/;
    NAMED_TEST_PATTERNS = [
      "**/*.test.*",
      "**/*.spec.*",
      "**/*_test.go",
      "**/test_*.py",
      "**/*_test.py",
      "**/*Test.java",
      "**/*Tests.java",
      "**/*Test.kt",
      "**/*Tests.cs",
      "**/*_spec.rb"
    ];
    COMMENTED_LINE = /^\s*(?:\/\/|#|\/\*|\*|--|<!--)/;
    PR_TRIGGER = /^\s*(?:-\s*)?(?:pull_request|merge_request|merge_group)\s*:?\s*(?:#.*)?$|^\s*on\s*:\s*\[?[^\]#]*\bpull_request\b/;
    TEST_EXCLUSION_PATTERNS = [
      /\b(?:exclude|testPathIgnorePatterns|modulePathIgnorePatterns|testIgnore|ignorePatterns)\s*[:=]/,
      /--(?:ignore|deselect|exclude)\b/,
      /\bnorecursedirs\b|\baddopts\b[^\n]*(?:--ignore|-k\s+["']?not\b)/
    ];
    TEST_DETECTION_PATTERNS = [
      /\bprocess\.env\.(?:VITEST|VITEST_WORKER_ID|JEST_WORKER_ID|MOCHA_WORKER_ID|PYTEST_CURRENT_TEST)\b/,
      /\bprocess\.env(?:\.NODE_ENV|\[\s*["'`]NODE_ENV["'`]\s*\])\s*[!=]==?\s*["'`]test["'`]/,
      /["'`]test["'`]\s*[!=]==?\s*process\.env(?:\.NODE_ENV|\[\s*["'`]NODE_ENV["'`]\s*\])/,
      /["']pytest["']\s+in\s+sys\.modules/,
      /\b(?:os\.environ(?:\.get)?|getenv)\s*[([]\s*["']PYTEST_CURRENT_TEST["']/,
      /\btesting\.Testing\s*\(\s*\)/,
      /\bRails\.env\.test\?/,
      // In-source testing blocks are legitimate; returning early from one is not.
      /\bimport\.meta\.vitest\b[^\n]*\breturn\b/,
      /\bimport\.meta\.env\.(?:MODE|NODE_ENV)\s*[!=]==?\s*["'`]test["'`]/
    ];
  }
});

// src/cli/git.ts
import { spawn } from "node:child_process";
import { resolve } from "node:path";
function runGit(cwd, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child2 = spawn("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...GIT_ENV },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const out = [];
    const err = [];
    child2.stdout.on("data", (chunk) => out.push(chunk));
    child2.stderr.on("data", (chunk) => err.push(chunk));
    child2.stdin.on("error", () => void 0);
    child2.on("error", (error51) => {
      if (error51.code === "ENOENT") reject(new GitError("git was not found on PATH", "Install git, or run rassam where git is available."));
      else reject(new GitError(`Could not run git: ${error51.message}`));
    });
    child2.on("close", (code) => {
      const result = { code: code ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8").trim() };
      if (result.code !== 0 && !options.allowFailure) {
        reject(new GitError(`git ${args[0]} failed (exit ${result.code})${result.stderr ? `: ${result.stderr}` : ""}`));
        return;
      }
      resolvePromise(result);
    });
    child2.stdin.end(options.input ?? "");
  });
}
async function gitText(cwd, args) {
  const result = await runGit(cwd, args, { allowFailure: true });
  return result.code === 0 ? result.stdout.toString("utf8").trim() : null;
}
function assertSafeRef(ref) {
  if (!ref || ref.startsWith("-") || /[\0\n\r]/.test(ref)) throw new GitError(`Invalid git ref "${ref}"`);
}
function splitNul(buffer) {
  return buffer.toString("utf8").split("\0").filter((entry) => entry.length > 0);
}
async function repoRoot(cwd) {
  const top = await gitText(cwd, ["rev-parse", "--show-toplevel"]);
  return top ? resolve(top) : null;
}
async function headSha(root) {
  return gitText(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
}
async function currentBranch(root) {
  return gitText(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
}
async function resolveRef2(root, ref) {
  assertSafeRef(ref);
  return gitText(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
}
async function isShallow(root) {
  return await gitText(root, ["rev-parse", "--is-shallow-repository"]) === "true";
}
async function userName(root) {
  return await gitText(root, ["config", "user.name"]) || null;
}
async function mergeBase(root, base, head = "HEAD") {
  assertSafeRef(base);
  assertSafeRef(head);
  if (!await resolveRef2(root, base)) {
    throw new GitError(`Base ref "${base}" does not exist in this repository`, `Fetch it first (git fetch origin ${base.replace(/^origin\//, "")}), or pass an existing ref with --base.`);
  }
  if (!await resolveRef2(root, head)) throw new GitError(`Ref "${head}" does not exist (does the repository have any commits?)`);
  const result = await runGit(root, ["merge-base", base, head], { allowFailure: true });
  const sha = result.stdout.toString("utf8").trim();
  if (result.code === 0 && sha) return sha;
  if (await isShallow(root)) {
    throw new GitError(
      `No merge-base between "${base}" and "${head}": this is a shallow clone`,
      "Fetch full history: git fetch --unshallow (in GitHub Actions: actions/checkout with fetch-depth: 0)."
    );
  }
  throw new GitError(`No merge-base between "${base}" and "${head}": the histories are unrelated`);
}
async function untrackedFiles(root) {
  const result = await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return splitNul(result.stdout);
}
async function listFiles(root) {
  const result = await runGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  return [...new Set(splitNul(result.stdout))];
}
async function untrackedChange(root, path) {
  const read = await readTextFile(resolve(root, path), !isEnvFile(path));
  if (read.missing) return null;
  if (read.content === null) return { path, status: "added", added: [], removed: [], binary: !isEnvFile(path) };
  return fileAdded(path, read.content);
}
async function diffAgainst(root, base) {
  assertSafeRef(base);
  const diff = await runGit(root, ["diff", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", "-M", "-U0", base, "--"]);
  const changes = parseUnifiedDiff(diff.stdout.toString("utf8"));
  const seen = new Set(changes.map((change) => change.path));
  const untracked = (await untrackedFiles(root)).filter((path) => !seen.has(path));
  const added = await mapLimit(untracked, 32, (path) => untrackedChange(root, path));
  for (const change of added) if (change) changes.push(change);
  return changes;
}
function parseCatFileBatch(output, count) {
  const entries2 = [];
  let offset = 0;
  while (entries2.length < count && offset < output.length) {
    const lineEnd = output.indexOf(10, offset);
    if (lineEnd < 0) break;
    const header = output.subarray(offset, lineEnd).toString("utf8");
    offset = lineEnd + 1;
    const match = /^[0-9a-f]{40,64} (\w+) (\d+)$/.exec(header);
    if (!match) {
      entries2.push({ type: "missing", body: null });
      continue;
    }
    const size = Number(match[2]);
    entries2.push({ type: match[1], body: output.subarray(offset, offset + size) });
    offset += size + 1;
  }
  while (entries2.length < count) entries2.push({ type: "missing", body: null });
  return entries2;
}
async function readFilesAtRef(root, ref, paths) {
  assertSafeRef(ref);
  const wanted = [...new Set(paths)].filter((path) => path && !/[\n\r\0]/.test(path) && !isEnvFile(path));
  const contents = /* @__PURE__ */ new Map();
  if (wanted.length === 0) return contents;
  const input = wanted.map((path) => `${ref}:${path}
`).join("");
  const result = await runGit(root, ["cat-file", "--batch"], { input });
  const entries2 = parseCatFileBatch(result.stdout, wanted.length);
  entries2.forEach((entry, index) => {
    if (entry.type !== "blob" || !entry.body) return;
    const text3 = decodeText(entry.body);
    if (text3 !== null) contents.set(wanted[index], text3);
  });
  return contents;
}
async function readFileAtRef(root, ref, path) {
  return (await readFilesAtRef(root, ref, [path])).get(path) ?? null;
}
async function commitsBetween(root, base, head = "HEAD") {
  assertSafeRef(base);
  assertSafeRef(head);
  const result = await runGit(root, ["log", "--format=%H%x00%an%x00%ae%x00%B%x1e", `${base}..${head}`]);
  const commits = [];
  for (const record2 of result.stdout.toString("utf8").split("")) {
    const [sha, authorName, authorEmail, message] = record2.replace(/^\s+/, "").split("\0");
    if (!sha || message === void 0) continue;
    commits.push({ sha, authorName: authorName ?? "", authorEmail: authorEmail ?? "", message: message.trimEnd() });
  }
  return commits;
}
async function defaultBaseRef(root) {
  const upstreamHead = await gitText(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const candidates = [upstreamHead, "origin/main", "origin/master", "main", "master"];
  for (const candidate of candidates) {
    if (candidate && await resolveRef2(root, candidate)) return candidate;
  }
  return null;
}
async function originUrl(root) {
  const url2 = await gitText(root, ["config", "--get", "remote.origin.url"]);
  return url2 ? url2.replace(/^(\w+:\/\/)[^@/]+@/, "$1") : null;
}
var GitError, GIT_ENV;
var init_git = __esm({
  "src/cli/git.ts"() {
    "use strict";
    init_diff();
    init_io();
    init_util();
    GitError = class extends CliError {
      constructor(message, hint) {
        super(message, { hint });
        this.name = "GitError";
      }
    };
    GIT_ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  }
});

// src/cli/fs-source.ts
import { readdir, readFile } from "node:fs/promises";
import { join as join2 } from "node:path";
function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}
function isManifestPath(path) {
  const base = baseName(path);
  return MANIFEST_NAMES.has(base) || /^tsconfig(\..+)?\.json$/.test(base);
}
function wantsContent(path) {
  if (isEnvFile(path)) return false;
  return languageOf(path) !== null || isAgentConfigPath(path) || isManifestPath(path);
}
async function walk(root, directory, found) {
  let entries2;
  try {
    entries2 = await readdir(join2(root, directory), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries2) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".git" || matchesAny(`${path}/x`, DEFAULT_IGNORE)) continue;
      await walk(root, path, found);
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
}
async function listWorkingTree(root) {
  const top = await repoRoot(root);
  if (top) return listFiles(root);
  const found = [];
  await walk(root, "", found);
  return found;
}
async function readBlueprintText(root) {
  try {
    return await readFile(join2(root, BLUEPRINT_PATH), "utf8");
  } catch {
    return null;
  }
}
async function loadWorkingTree(root, options = {}) {
  const extra = options.extraIgnore?.length ? [...options.extraIgnore] : void 0;
  const paths = (await listWorkingTree(root)).filter((path) => !isIgnoredPath(path, extra)).sort();
  const loaded = await mapLimit(paths, READ_CONCURRENCY, async (path) => {
    const read = await readTextFile(join2(root, path), wantsContent(path));
    if (read.missing) return null;
    return { path, content: read.content, size: read.size };
  });
  const files = loaded.filter((file2) => file2 !== null);
  return { files, blueprintText: await readBlueprintText(root) };
}
var READ_CONCURRENCY, MANIFEST_NAMES;
var init_fs_source = __esm({
  "src/cli/fs-source.ts"() {
    "use strict";
    init_constants();
    init_glob();
    init_imports();
    init_reach();
    init_schema();
    init_git();
    init_util();
    READ_CONCURRENCY = 32;
    MANIFEST_NAMES = /* @__PURE__ */ new Set(["package.json", "jsconfig.json", "go.mod", "Cargo.toml", "pyproject.toml", "setup.py", "setup.cfg"]);
  }
});

// src/cli/context.ts
import { resolve as resolve2 } from "node:path";
async function resolveRoot(io, rootFlag) {
  const start = resolve2(io.cwd, rootFlag ?? ".");
  const top = await repoRoot(start).catch(() => null);
  if (rootFlag) return { root: start, isGit: top !== null };
  return { root: top ?? start, isGit: top !== null };
}
async function loadContext(root, isGit) {
  const tree = await loadWorkingTree(root);
  const base = { root, isGit, files: tree.files, blueprintText: tree.blueprintText };
  if (tree.blueprintText === null) return { ...base, blueprint: null, blueprintState: "missing", blueprintIssues: [] };
  const parsed = parseBlueprintText(tree.blueprintText);
  if (!parsed.ok) return { ...base, blueprint: null, blueprintState: "invalid", blueprintIssues: parsed.issues };
  return { ...base, blueprint: parsed.blueprint, blueprintState: "ok", blueprintIssues: [] };
}
async function loadContextFor(io, rootFlag) {
  const { root, isGit } = await resolveRoot(io, rootFlag);
  return loadContext(root, isGit);
}
function formatIssues(issues, limit = 20) {
  const lines = issues.slice(0, limit).map((issue2) => `  ${issue2.path}: ${issue2.message}`);
  if (issues.length > limit) lines.push(`  … and ${issues.length - limit} more`);
  return lines.join("\n");
}
function assertBlueprintValid(context) {
  if (context.blueprintState !== "invalid") return;
  throw new CliError(`${BLUEPRINT_PATH} is invalid:
${formatIssues(context.blueprintIssues)}`, {
    hint: "Fix the file (rassam schema prints the JSON Schema), then run the command again."
  });
}
function requireBlueprint(context) {
  assertBlueprintValid(context);
  if (!context.blueprint) {
    throw new CliError(`No blueprint found at ${BLUEPRINT_PATH}`, { hint: "Create a draft with: rassam init" });
  }
  return context.blueprint;
}
var init_context = __esm({
  "src/cli/context.ts"() {
    "use strict";
    init_schema();
    init_fs_source();
    init_git();
    init_io();
  }
});

// src/cli/commands/init.ts
var init_exports = {};
__export(init_exports, {
  MCP_CONFIG_SNIPPET: () => MCP_CONFIG_SNIPPET,
  MCP_CONFIG_SNIPPET_LOCAL: () => MCP_CONFIG_SNIPPET_LOCAL,
  initCommand: () => initCommand
});
import { mkdir, writeFile } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, join as join3 } from "node:path";
function nextSteps(blueprint) {
  return [
    `Wrote ${BLUEPRINT_PATH}: ${blueprint.components.length} components, ${blueprint.dependencies.length} observed dependencies.`,
    "",
    "This is a draft derived from the code. It becomes a contract when you make it yours:",
    `  1. Open ${BLUEPRINT_PATH} and merge, split or rename components until they match how you think about the system.`,
    "  2. Write the intent of each component: purpose, responsibilities, boundaries. Agents cannot infer this from code.",
    "  3. Add rules (forbid, allow-only, layers, no-cycles, protect, secret-access) and give each a reason.",
    "  4. Run: rassam check",
    "  5. Sign what you have checked: rassam verify <id>",
    '  6. Gate pull requests: add the Rassam GitHub Action, which runs "rassam check --github --comment"',
    "     and judges every PR by the blueprint on its base branch.",
    "  7. Give coding agents the contract over MCP. Add to .mcp.json:",
    `       ${MCP_CONFIG_SNIPPET}`,
    "     or, with the bundled build in this repository (node action/dist/rassam.mjs mcp):",
    `       ${MCP_CONFIG_SNIPPET_LOCAL}`,
    ""
  ].join("\n");
}
async function initCommand(args, io) {
  const dryRun = booleanFlag(args, "dryRun");
  const context = await loadContextFor(io, stringFlag(args, "root"));
  if (context.blueprintState !== "missing" && !booleanFlag(args, "force") && !dryRun) {
    throw new CliError(`${BLUEPRINT_PATH} already exists`, { hint: "Use --force to replace it with a fresh draft, or --dry-run to preview one." });
  }
  const blueprint = deriveBlueprint(context.files, {
    name: stringFlag(args, "name") ?? detectSystemName(context.files) ?? basename2(context.root),
    repository: context.isGit ? await originUrl(context.root) ?? void 0 : void 0,
    commit: context.isGit ? await headSha(context.root) ?? void 0 : void 0,
    author: context.isGit ? await userName(context.root) ?? void 0 : void 0,
    now: (/* @__PURE__ */ new Date()).toISOString()
  });
  const text3 = serializeBlueprint(blueprint);
  if (dryRun) {
    io.stdout(text3);
    return EXIT_OK;
  }
  const target = join3(context.root, BLUEPRINT_PATH);
  await mkdir(dirname2(target), { recursive: true });
  await writeFile(target, text3, "utf8");
  io.stdout(nextSteps(blueprint));
  return EXIT_OK;
}
var MCP_CONFIG_SNIPPET, MCP_CONFIG_SNIPPET_LOCAL;
var init_init = __esm({
  "src/cli/commands/init.ts"() {
    "use strict";
    init_derive();
    init_schema();
    init_args();
    init_context();
    init_git();
    init_io();
    MCP_CONFIG_SNIPPET = '{"mcpServers":{"rassam":{"command":"npx","args":["rassam","mcp"]}}}';
    MCP_CONFIG_SNIPPET_LOCAL = '{"mcpServers":{"rassam":{"command":"node","args":["action/dist/rassam.mjs","mcp"]}}}';
  }
});

// src/blueprint/report.ts
function isFailing(finding, failOn) {
  if (failOn === "never" || !finding.isNew) return false;
  return SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[failOn];
}
function verdict(report, failOn = "error") {
  if (report.findings.some((finding) => isFailing(finding, failOn))) return "fail";
  if (report.findings.some((finding) => finding.isNew && finding.severity !== "info")) return "warn";
  return "pass";
}
function exitCodeFor(report, failOn) {
  return verdict(report, failOn) === "fail" ? 1 : 0;
}
function plural2(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
function percent(ratio) {
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
function oneLine(text3) {
  let out = "";
  for (const char of text3) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) out += " ";
    else if (code >= 32 && code !== 127) out += char;
  }
  return out.replace(/\s+/g, " ").trim();
}
function clip(text3, max) {
  return text3.length <= max ? text3 : `${text3.slice(0, max - 1).trimEnd()}…`;
}
function budgetOf(value) {
  return value === void 0 || !Number.isFinite(value) ? DEFAULT_BUDGET : Math.max(0, Math.floor(value));
}
function locationLabel(location) {
  return location.line === void 0 ? location.path : `${location.path}:${location.line}`;
}
function groupByKind(findings) {
  const groups = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const group = groups.get(finding.kind);
    if (group) group.push(finding);
    else groups.set(finding.kind, [finding]);
  }
  return [...groups.entries()];
}
function rangeLabel(report) {
  if (!report.base && !report.head) return null;
  if (!report.base) return `at ${report.head?.ref}`;
  return `${report.base.ref}…${report.head?.ref ?? "working tree"}`;
}
function capContractChanges(changes) {
  const sorted = sortedContractChanges(changes);
  const weakening = sorted.filter((change) => change.weakens);
  const other = sorted.filter((change) => !change.weakens);
  const room = Math.max(0, MAX_LISTED_CONTRACT_CHANGES - weakening.length);
  return { shown: [...weakening, ...other.slice(0, room)], hidden: other.slice(room) };
}
function kindCounts(changes) {
  const counts = /* @__PURE__ */ new Map();
  for (const change of changes) counts.set(change.kind, (counts.get(change.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(", ");
}
function sortedContractChanges(changes) {
  return [...changes.filter((change) => change.weakens), ...changes.filter((change) => !change.weakens)];
}
function hasImpact(impact) {
  return !!impact && (impact.touchedComponents.length > 0 || impact.dependents.length > 0);
}
function reachHighlights(reach) {
  const broad = reach?.permissions.filter((grant) => grant.broad && grant.effect === "allow") ?? [];
  const secrets = reach?.inlineSecrets ?? [];
  const servers = reach?.mcpServers ?? [];
  return { broad, secrets, servers, any: broad.length + secrets.length + servers.length > 0 };
}
function summaryParts(report) {
  const s = report.summary;
  return [
    `${plural2(s.errors, "error")}, ${plural2(s.warnings, "warning")}, ${plural2(s.infos, "info")}`,
    `${s.newFindings} new`,
    plural2(s.components, "component"),
    `${s.filesMapped}/${s.filesAnalyzed} files mapped (${s.filesUnmapped} unmapped)`,
    `${plural2(s.componentEdges, "component edge")} (${s.undeclaredEdges} undeclared)`,
    `${percent(s.humanAuthoredRatio)}% human-authored`
  ];
}
function painter(color) {
  return color ? (code, text3) => `\x1B[${code}m${text3}\x1B[0m` : (_code, text3) => text3;
}
function textLocations(locations) {
  if (locations.length === 0) return null;
  const shown = locations.slice(0, MAX_LOCATIONS).map((location) => oneLine(locationLabel(location)));
  const extra = locations.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` +${extra} more` : "");
}
function textFinding(finding, paint) {
  const severity = TEXT_SEVERITY[finding.severity];
  const lines = [
    `  ${paint(severity.color, `${severity.mark} ${finding.severity}`)} ${paint(ANSI.bold, oneLine(finding.title))} ${paint(ANSI.dim, `[${finding.kind}]`)}`
  ];
  const message = oneLine(finding.message);
  if (message) lines.push(`      ${clip(message, 300)}`);
  const locations = textLocations(finding.locations);
  if (locations) lines.push(`      ${paint(ANSI.dim, `at ${locations}`)}`);
  if (finding.reason) lines.push(`      reason: "${clip(oneLine(finding.reason), 300)}"`);
  return lines;
}
function textHeader(report, paint, failOn = "error") {
  const result = verdict(report, failOn);
  const style = TEXT_VERDICT[result];
  const parts = [paint(style.color, `${style.mark} ${result}`)];
  if (!report.blueprint.present) {
    parts.push(`no blueprint found at ${report.blueprint.path || BLUEPRINT_PATH}; run \`rassam init\` to create one`);
  } else {
    parts.push(oneLine(report.blueprint.system ?? "(unnamed system)"));
    if (!report.blueprint.valid) parts.push("blueprint is invalid");
  }
  parts.push(`${report.mode} mode`);
  const range = rangeLabel(report);
  if (range) parts.push(oneLine(range));
  return parts.join(" · ");
}
function textRemaining(rest, verbose, paint) {
  if (rest.length === 0) return [];
  const existing = rest.filter((finding) => !finding.isNew).length;
  const lines = ["", `Other findings (${rest.length}${existing > 0 ? `, ${existing} pre-existing` : ""})`];
  for (const [kind, group] of groupByKind(rest)) {
    lines.push(`  ${group.length} × ${kind}`);
    if (verbose) for (const finding of group) lines.push(...textFinding(finding, paint).map((line) => `  ${line}`));
  }
  if (!verbose) lines.push(paint(ANSI.dim, "  (use --verbose for details)"));
  return lines;
}
function textContractChanges(report, paint) {
  const changes = report.contractChanges ?? [];
  if (changes.length === 0) return [];
  const weakening = changes.filter((change) => change.weakens).length;
  const approval = report.approved ? "approved by a human" : weakening > 0 ? "NOT approved" : "not approved";
  const lines = ["", `Contract changes (${changes.length}, ${weakening} weakening, ${approval})`];
  const { shown, hidden } = capContractChanges(changes);
  for (const change of shown) {
    const mark = change.weakens ? paint(ANSI.yellow, "⚠") : " ";
    lines.push(`  ${mark} ${change.kind} ${oneLine(change.target)}: ${clip(oneLine(change.summary), 200)}`);
  }
  if (hidden.length) lines.push(`    …and ${hidden.length} more (${kindCounts(hidden)})`);
  return lines;
}
function textImpact(report) {
  if (!hasImpact(report.impact)) return [];
  const impact = report.impact;
  const lines = ["", `Blast radius (${plural2(impact.changedFiles.length, "changed file")})`];
  const touched = impact.touchedComponents.map((component) => `${oneLine(component.id)} (${plural2(component.files.length, "file")})`);
  lines.push(`  touched: ${touched.length ? touched.join(", ") : "none"}`);
  const dependents = impact.dependents.map((dependent) => `${oneLine(dependent.id)} (depth ${dependent.depth})`);
  lines.push(`  dependents: ${dependents.length ? dependents.join(", ") : "none"}`);
  return lines;
}
function agentActivityLine(report) {
  const activity = report.agentActivity;
  if (!activity) return null;
  const names = activity.agents.length ? ` (${activity.agents.map(oneLine).join(", ")})` : "";
  return `${activity.agentCommits}/${plural2(activity.commits, "commit")} by agents${names}`;
}
function textReach(report, paint) {
  const { broad, secrets, servers, any: any2 } = reachHighlights(report.reach);
  if (!any2) return [];
  const lines = ["", "Reach highlights"];
  if (secrets.length > 0) {
    lines.push(`  ${paint(ANSI.red, `inline secrets: ${secrets.length}`)}`);
    for (const secret of secrets.slice(0, DEFAULT_BUDGET)) {
      lines.push(`    ${paint(ANSI.dim, `${oneLine(secret.path)}:${secret.line}`)} ${oneLine(secret.location)} ${oneLine(secret.preview)}`);
    }
    if (secrets.length > DEFAULT_BUDGET) lines.push(`    +${secrets.length - DEFAULT_BUDGET} more`);
  }
  if (broad.length > 0) {
    lines.push(`  ${paint(ANSI.yellow, `broad permissions: ${broad.length}`)}`);
    for (const grant of broad.slice(0, DEFAULT_BUDGET)) {
      lines.push(`    ${paint(ANSI.dim, oneLine(grant.path))} ${oneLine(grant.agent)} allows ${oneLine(grant.rule)}`);
    }
    if (broad.length > DEFAULT_BUDGET) lines.push(`    +${broad.length - DEFAULT_BUDGET} more`);
  }
  if (servers.length > 0) {
    const names = servers.map((server) => `${oneLine(server.name)} (${server.transport}, ${oneLine(server.agent)})`);
    lines.push(`  MCP servers: ${servers.length}: ${names.join(", ")}`);
  }
  return lines;
}
function renderText(report, options = {}) {
  const paint = painter(options.color === true);
  const budget = budgetOf(options.budget);
  const fresh = report.findings.filter((finding) => finding.isNew);
  const top = fresh.slice(0, budget);
  const shown = new Set(top);
  const rest = report.findings.filter((finding) => !shown.has(finding));
  const lines = [textHeader(report, paint, options.failOn ?? "error"), summaryParts(report).join(" · "), ""];
  if (top.length === 0) {
    lines.push(fresh.length === 0 ? "Nothing new needs your attention." : `Needs your attention: ${plural2(fresh.length, "new finding")} (budget 0)`);
  } else {
    lines.push(paint(ANSI.bold, `Needs your attention (${top.length} of ${fresh.length} new)`));
    for (const finding of top) lines.push(...textFinding(finding, paint));
  }
  lines.push(...textRemaining(rest, options.verbose === true, paint));
  lines.push(...textContractChanges(report, paint));
  lines.push(...textImpact(report));
  const activity = agentActivityLine(report);
  if (activity) lines.push("", `Agent activity: ${activity}`);
  lines.push(...textReach(report, paint));
  return `${lines.join("\n")}
`;
}
function escapeMd(text3) {
  return oneLine(text3).replace(/\\/g, "\\\\").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([`*_|[\]~])/g, "\\$1").replace(/^([#+-])/, "\\$1").replace(/@(?=[A-Za-z0-9])/g, "@&#8203;");
}
function codeSpan(text3, inTable = false) {
  const clean = oneLine(text3) || " ";
  const longestRun = Math.max(0, ...(clean.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const pad = clean.startsWith("`") || clean.endsWith("`") ? " " : "";
  const span = `${fence}${pad}${clean}${pad}${fence}`;
  return inTable ? span.replace(/\|/g, "\\|") : span;
}
function encodePath(path) {
  return path.split("/").map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("/");
}
function mdLocation(location, link) {
  const label = codeSpan(locationLabel(location));
  if (!link.repoUrl || !link.headSha) return label;
  const base = `${link.repoUrl.replace(/\/+$/, "")}/blob/${encodeURIComponent(link.headSha)}/${encodePath(location.path)}`;
  if (location.line === void 0) return `[${label}](${base})`;
  const range = location.endLine !== void 0 && location.endLine > location.line ? `-L${location.endLine}` : "";
  return `[${label}](${base}#L${location.line}${range})`;
}
function mdLocations(locations, link) {
  if (locations.length === 0) return null;
  const shown = locations.slice(0, MAX_LOCATIONS).map((location) => mdLocation(location, link));
  const extra = locations.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` +${extra} more` : "");
}
function mdAttentionItem(finding, index, link) {
  const lines = [`${index + 1}. ${MD_SEVERITY[finding.severity]} · **${escapeMd(finding.title)}** (${codeSpan(finding.kind)})`];
  const message = escapeMd(clip(oneLine(finding.message), 600));
  if (message) lines.push(`   ${message}`);
  const locations = mdLocations(finding.locations, link);
  if (locations) lines.push(`   📍 ${locations}`);
  if (finding.reason) lines.push("", `   > ${escapeMd(clip(oneLine(finding.reason), 600))}`, "");
  return lines;
}
function mdDetailItem(finding, link, withKind) {
  const kind = withKind ? `${codeSpan(finding.kind)} ` : "";
  const message = escapeMd(clip(oneLine(finding.message), 300));
  const locations = mdLocations(finding.locations, link);
  return `- ${MD_SEVERITY[finding.severity]} ${kind}**${escapeMd(finding.title)}**${message ? `: ${message}` : ""}${locations ? ` · ${locations}` : ""}`;
}
function mdHeading(report, result) {
  const style = MD_VERDICT[result];
  if (!report.blueprint.present) return `## ${style.emoji} Rassam: no blueprint found`;
  const fresh = report.findings.filter((finding) => finding.isNew);
  const errors = fresh.filter((finding) => finding.severity === "error").length;
  const warnings = fresh.filter((finding) => finding.severity === "warning").length;
  const counts = [errors ? plural2(errors, "new error") : "", warnings ? plural2(warnings, "new warning") : ""].filter(Boolean).join(", ");
  return `## ${style.emoji} Rassam: ${style.text}${counts ? ` (${counts})` : ""}`;
}
function mdContext(report) {
  const parts = [];
  if (report.blueprint.present) {
    parts.push(`**${escapeMd(report.blueprint.system ?? "(unnamed system)")}**`);
    if (!report.blueprint.valid) parts.push("blueprint is **invalid**");
  } else {
    parts.push(`No blueprint at ${codeSpan(report.blueprint.path || BLUEPRINT_PATH)}. Run \`rassam init\` to create one.`);
  }
  parts.push(`${report.mode} mode`);
  if (report.base) parts.push(`${codeSpan(report.base.ref)}…${codeSpan(report.head?.ref ?? "working tree")}`);
  else if (report.head) parts.push(`at ${codeSpan(report.head.ref)}`);
  return parts.join(" · ");
}
function mdContractChanges(report) {
  const changes = report.contractChanges ?? [];
  if (changes.length === 0) return [];
  const weakening = changes.filter((change) => change.weakens).length;
  const lines = ["### Contract changes", "", "| | Change | Target | Summary |", "|---|---|---|---|"];
  const { shown, hidden } = capContractChanges(changes);
  for (const change of shown) {
    lines.push(`| ${change.weakens ? "⚠" : ""} | ${change.kind} | ${codeSpan(change.target, true)} | ${escapeMd(clip(oneLine(change.summary), 300))} |`);
  }
  if (hidden.length) lines.push(`| | … | | ${escapeMd(`and ${hidden.length} more: ${kindCounts(hidden)}`)} |`);
  lines.push("");
  if (weakening === 0) {
    lines.push("No change weakens the contract. Weakening changes require a human-approved label.");
  } else if (report.approved) {
    lines.push(`✅ **Approved:** ${plural2(weakening, "weakening change")} carried a human-approved label.`);
  } else {
    lines.push(`⚠ **Not approved:** ${plural2(weakening, "change")} weaken${weakening === 1 ? "s" : ""} the contract. Weakening changes require a human-approved label.`);
  }
  return lines;
}
function mdImpact(report) {
  if (!hasImpact(report.impact)) return [];
  const impact = report.impact;
  const touched = impact.touchedComponents.map((component) => `${codeSpan(component.id)} (${plural2(component.files.length, "file")})`);
  const dependents = impact.dependents.map((dependent) => `${codeSpan(dependent.id)} (depth ${dependent.depth})`);
  return [
    "### Blast radius",
    "",
    `- **Changed:** ${plural2(impact.changedFiles.length, "file")} in ${plural2(impact.touchedComponents.length, "component")}${touched.length ? `: ${touched.join(", ")}` : ""}`,
    `- **Dependents:** ${dependents.length ? dependents.join(", ") : "none"}`
  ];
}
function renderBlock(block, itemCount = block.items.length) {
  const items = block.items.slice(0, itemCount);
  const omitted = block.items.length - items.length;
  if (omitted > 0) items.push(`- …and ${omitted} more`);
  return `<details>
<summary>${block.summary}</summary>

${items.join("\n")}

</details>`;
}
function mdDetailBlocks(report, link) {
  const blocks = [];
  const fresh = report.findings.filter((finding) => finding.isNew);
  const existing = report.findings.filter((finding) => !finding.isNew);
  for (const [kind, group] of groupByKind(fresh)) {
    blocks.push({
      summary: `${KIND_INFO[kind].label} (${group.length}) · <code>${kind}</code>`,
      items: group.map((finding) => mdDetailItem(finding, link, false))
    });
  }
  const { broad, secrets, servers, any: any2 } = reachHighlights(report.reach);
  if (any2) {
    blocks.push({
      summary: `Agent reach: ${plural2(secrets.length, "inline secret")}, ${plural2(broad.length, "broad permission")}, ${plural2(servers.length, "MCP server")}`,
      items: [
        ...secrets.map((secret) => `- 🔴 inline secret ${mdLocation({ path: secret.path, line: secret.line }, link)} ${codeSpan(secret.location)} ${codeSpan(secret.preview)}`),
        ...broad.map((grant) => `- 🟡 broad permission ${codeSpan(grant.path)}: ${escapeMd(grant.agent)} allows ${codeSpan(grant.rule)}`),
        ...servers.map((server) => `- MCP server ${codeSpan(server.name)} (${server.transport}, ${escapeMd(server.agent)}) in ${codeSpan(server.configPath)}`)
      ]
    });
  }
  if (existing.length > 0) {
    blocks.push({
      summary: `Pre-existing findings (${existing.length}), not introduced by this change`,
      items: groupByKind(existing).flatMap(([, group]) => group.map((finding) => mdDetailItem(finding, link, true)))
    });
  }
  return blocks;
}
function mdFooter(report) {
  const s = report.summary;
  const stats = [
    plural2(s.components, "component"),
    `${s.filesMapped}/${s.filesAnalyzed} files mapped`,
    `${plural2(s.componentEdges, "edge")} (${s.undeclaredEdges} undeclared)`,
    `${percent(s.humanAuthoredRatio)}% human-authored`
  ];
  return `---
<sub>Blueprint: ${stats.join(" · ")} · Generated by Rassam ${escapeMd(report.tool.version)}</sub>`;
}
function fitBlocks(blocks, room) {
  const kept = [];
  let used = 0;
  for (const block of blocks) {
    const full = renderBlock(block);
    if (used + full.length + 2 <= room) {
      kept.push(full);
      used += full.length + 2;
      continue;
    }
    for (let count = block.items.length - 1; count >= 1; count -= 1) {
      const partial2 = renderBlock(block, count);
      if (used + partial2.length + 2 <= room) {
        kept.push(partial2);
        break;
      }
    }
    break;
  }
  return kept;
}
function cutAtLine(text3, max) {
  if (text3.length <= max) return text3;
  const cut = text3.slice(0, Math.max(0, max));
  const lastBreak = cut.lastIndexOf("\n");
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd();
}
function renderMarkdown(report, options = {}) {
  const link = { repoUrl: options.repoUrl, headSha: options.headSha };
  const budget = budgetOf(options.budget);
  const maxChars = Math.max(0, options.maxChars ?? DEFAULT_MAX_CHARS);
  const marker = options.marker ?? COMMENT_MARKER;
  const fresh = report.findings.filter((finding) => finding.isNew);
  const top = fresh.slice(0, budget);
  const sections = [
    [marker, mdHeading(report, verdict(report, options.failOn ?? "error")), "", mdContext(report), "", summaryParts(report).slice(0, 2).join(" · ")],
    ["### Needs your attention", ""]
  ];
  if (top.length === 0) {
    sections[1].push(fresh.length === 0 ? "Nothing new needs your attention." : `${plural2(fresh.length, "new finding")}; see the details below.`);
  } else {
    top.forEach((finding, index) => sections[1].push(...mdAttentionItem(finding, index, link)));
    if (fresh.length > top.length) sections[1].push("", `…and ${plural2(fresh.length - top.length, "more new finding")} in the details below.`);
  }
  const contract = mdContractChanges(report);
  if (contract.length) sections.push(contract);
  const impact = mdImpact(report);
  if (impact.length) sections.push(impact);
  const activity = agentActivityLine(report);
  if (activity) sections.push([`**Agent activity:** ${escapeMd(activity)}`]);
  const head = sections.map((section2) => section2.join("\n").trimEnd()).join("\n\n");
  const blocks = mdDetailBlocks(report, link);
  const footer = mdFooter(report);
  const assemble = (parts) => `${parts.join("\n\n")}
`;
  const full = assemble([head, ...blocks.map((block) => renderBlock(block)), footer]);
  if (full.length <= maxChars) return full;
  const fixed = TRUNCATION_NOTE.length + footer.length + 5;
  const kept = fitBlocks(blocks, maxChars - head.length - 2 - fixed);
  const fittedHead = cutAtLine(head, maxChars - fixed);
  const truncated = assemble([fittedHead, ...kept, TRUNCATION_NOTE, footer]);
  return truncated.length <= maxChars ? truncated : truncated.slice(0, maxChars);
}
function sarifLocation(location) {
  const physicalLocation = {
    artifactLocation: { uri: location.path.split("/").map(encodeURIComponent).join("/"), uriBaseId: "%SRCROOT%" }
  };
  if (location.line !== void 0 && location.line >= 1) {
    const region = { startLine: location.line };
    if (location.endLine !== void 0 && location.endLine >= location.line) region.endLine = location.endLine;
    physicalLocation.region = region;
  }
  return { physicalLocation };
}
function sarifMessage(finding) {
  const reason = finding.reason ? ` Reason: ${finding.reason}` : "";
  return `${finding.title} — ${finding.message}${reason}`;
}
function renderSarif(report) {
  const kinds = [...new Set(report.findings.map((finding) => finding.kind))];
  const ruleIndex = new Map(kinds.map((kind, index) => [kind, index]));
  const fallback = { path: report.blueprint.path || BLUEPRINT_PATH };
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Rassam",
            informationUri: "https://rassam.dev",
            version: report.tool.version,
            rules: kinds.map((kind) => ({
              id: kind,
              name: KIND_INFO[kind].label,
              shortDescription: { text: KIND_INFO[kind].label },
              fullDescription: { text: KIND_INFO[kind].help },
              help: { text: KIND_INFO[kind].help }
            }))
          }
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.kind,
          ruleIndex: ruleIndex.get(finding.kind),
          level: SARIF_LEVEL[finding.severity],
          message: { text: sarifMessage(finding) },
          locations: (finding.locations.length ? finding.locations : [fallback]).map(sarifLocation),
          partialFingerprints: { rassamFindingId: finding.id },
          baselineState: finding.isNew ? "new" : "unchanged",
          properties: { score: finding.score, isNew: finding.isNew, components: finding.components, blueprintRule: finding.ruleId }
        }))
      }
    ]
  };
}
function escapeCommandData(text3) {
  return text3.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeCommandProperty(text3) {
  return escapeCommandData(text3).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function annotation(finding) {
  const properties = [];
  const location = finding.locations[0];
  if (location) {
    properties.push(`file=${escapeCommandProperty(location.path)}`);
    if (location.line !== void 0) {
      properties.push(`line=${location.line}`);
      if (location.endLine !== void 0 && location.endLine >= location.line) properties.push(`endLine=${location.endLine}`);
    }
  }
  properties.push(`title=${escapeCommandProperty(finding.title)}`);
  const reason = finding.reason ? `
Reason: ${finding.reason}` : "";
  return `::${ANNOTATION_COMMAND[finding.severity]} ${properties.join(",")}::${escapeCommandData(`${finding.message}${reason}`)}`;
}
function renderGithubAnnotations(report, options = {}) {
  const onlyNew = options.onlyNew ?? true;
  const max = Math.max(0, Math.floor(options.max ?? DEFAULT_MAX_ANNOTATIONS));
  return report.findings.filter((finding) => !onlyNew || finding.isNew).slice().sort((a, b) => b.score - a.score).slice(0, max).map(annotation).join("\n");
}
function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}
`;
}
function graphNodes(view) {
  const keys = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  const nodes = [];
  const add = (id, name, external, flagged) => {
    if (keys.has(id)) return;
    const base = `c_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
    let key = base;
    for (let suffix = 2; used.has(key); suffix += 1) key = `${base}_${suffix}`;
    used.add(key);
    keys.set(id, key);
    nodes.push({ key, label: oneLine(name) || id, external, flagged });
  };
  for (const component of view.components) add(component.id, component.name, component.external === true, (component.findings ?? 0) > 0);
  for (const edge of view.edges) {
    add(edge.from, edge.from, false, false);
    add(edge.to, edge.to, false, false);
  }
  return { nodes, keyOf: (id) => keys.get(id) ?? "" };
}
function edgeLabel(status, count) {
  const times = count !== void 0 && count > 1 ? ` ×${count}` : "";
  if (status === "missing") return "declared, unused";
  if (status === "undeclared") return `undeclared${times}`;
  if (status === "forbidden") return `forbidden${times}`;
  return null;
}
function mermaidText(text3) {
  return text3.replace(/#/g, "#35;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
}
function renderMermaid(view) {
  const { nodes, keyOf } = graphNodes(view);
  const lines = ["flowchart LR"];
  for (const node of nodes) {
    const label = `"${mermaidText(node.label)}"`;
    lines.push(`  ${node.key}${node.external ? `[(${label})]` : `[${label}]`}`);
  }
  view.edges.forEach((edge) => {
    const label = edgeLabel(edge.status, edge.count);
    lines.push(`  ${keyOf(edge.from)} ${MERMAID_ARROW[edge.status]}${label ? `|"${mermaidText(label)}"|` : ""} ${keyOf(edge.to)}`);
  });
  view.edges.forEach((edge, index) => lines.push(`  linkStyle ${index} ${MERMAID_LINK_STYLE[edge.status]}`));
  const flagged = nodes.filter((node) => node.flagged);
  if (flagged.length > 0) {
    lines.push(`  classDef hasFindings stroke:${RED},stroke-width:3px`);
    lines.push(`  class ${flagged.map((node) => node.key).join(",")} hasFindings`);
  }
  return `${lines.join("\n")}
`;
}
function dotString(text3) {
  return `"${text3.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}
function renderDot(view) {
  const { nodes, keyOf } = graphNodes(view);
  const lines = ["digraph blueprint {", "  rankdir=LR;", '  node [shape=box, style=rounded, fontname="Helvetica"];', '  edge [fontname="Helvetica", fontsize=10];'];
  for (const node of nodes) {
    const attributes = [`label=${dotString(node.label)}`];
    if (node.external) attributes.push("shape=cylinder", "style=solid");
    if (node.flagged) attributes.push(`color="${RED}"`, "penwidth=2");
    lines.push(`  ${node.key} [${attributes.join(", ")}];`);
  }
  for (const edge of view.edges) {
    const label = edgeLabel(edge.status, edge.count);
    const attributes = DOT_EDGE_STYLE[edge.status] + (label ? `, label=${dotString(label)}` : "");
    lines.push(`  ${keyOf(edge.from)} -> ${keyOf(edge.to)} [${attributes}];`);
  }
  lines.push("}");
  return `${lines.join("\n")}
`;
}
var COMMENT_MARKER, DEFAULT_BUDGET, MAX_LOCATIONS, DEFAULT_MAX_CHARS, DEFAULT_MAX_ANNOTATIONS, TRUNCATION_NOTE, SEVERITY_RANK, KIND_INFO, MAX_LISTED_CONTRACT_CHANGES, ANSI, TEXT_SEVERITY, TEXT_VERDICT, MD_SEVERITY, MD_VERDICT, SARIF_LEVEL, ANNOTATION_COMMAND, GRAY, AMBER, RED, MERMAID_ARROW, MERMAID_LINK_STYLE, DOT_EDGE_STYLE;
var init_report = __esm({
  "src/blueprint/report.ts"() {
    "use strict";
    init_schema();
    COMMENT_MARKER = "<!-- rassam:blueprint-check -->";
    DEFAULT_BUDGET = 5;
    MAX_LOCATIONS = 3;
    DEFAULT_MAX_CHARS = 6e4;
    DEFAULT_MAX_ANNOTATIONS = 50;
    TRUNCATION_NOTE = "_Details were truncated to fit the comment size limit. Run `rassam check` locally for the full report._";
    SEVERITY_RANK = { info: 1, warning: 2, error: 3 };
    KIND_INFO = {
      "invalid-blueprint": {
        label: "Invalid blueprint",
        help: "The blueprint file is missing, unparsable or fails validation. Fix .rassam/blueprint.json so changes can be checked against it."
      },
      "forbidden-dependency": {
        label: "Forbidden dependency",
        help: "A dependency crosses a boundary that a forbid rule prohibits. Remove the import or change the rule with human approval."
      },
      "allow-only-violation": {
        label: "Allow-only violation",
        help: "A component depends on something outside the set its allow-only rule permits."
      },
      "layer-violation": {
        label: "Layer violation",
        help: "A lower layer depends on a higher layer. Layers may only depend on layers below them."
      },
      "dependency-cycle": {
        label: "Dependency cycle",
        help: "Components depend on each other in a cycle that a no-cycles rule prohibits."
      },
      "undeclared-dependency": {
        label: "Undeclared dependency",
        help: "The code has a cross-component dependency that the blueprint does not declare. Declare it or remove it."
      },
      "unmapped-file": {
        label: "Unmapped file",
        help: "A source file is not owned by any component. Add it to a component's paths or ignore it in the policy."
      },
      "empty-component": {
        label: "Empty component",
        help: "A component's globs match no files. Its paths are stale or the code was moved."
      },
      "protected-path": {
        label: "Protected path changed",
        help: "A tripwire path (tests, CI, lockfiles, agent permissions, the blueprint itself) changed and needs human review."
      },
      "verification-weakened": {
        label: "Verification weakened",
        help: "The change weakens checks: skipped or deleted tests, removed assertions, loosened CI."
      },
      "contract-weakened": {
        label: "Contract weakened",
        help: "The blueprint was changed in a way that loosens the contract agents are judged by. Requires human approval."
      },
      "contract-changed": {
        label: "Contract changed",
        help: "The blueprint changed. Review that the new contract reflects human intent."
      },
      "secret-access": {
        label: "Secret access",
        help: "A secret or environment variable is read by code that a secret-access rule does not allow."
      },
      "inline-secret": {
        label: "Inline secret",
        help: "A credential appears inline in an agent or tool configuration file. Move it to a secret store and rotate it."
      },
      "agent-permission-change": {
        label: "Agent permission change",
        help: "Agent permissions, MCP servers or agent instructions changed, altering what coding agents can reach."
      },
      "assurance-drift": {
        label: "Assurance drift",
        help: "A component's declared assurance level no longer matches the evidence in the repository."
      },
      "stale-verification": {
        label: "Stale verification",
        help: "A human sign-off predates changes to the code it covers and should be renewed."
      },
      "invariant-at-risk": {
        label: "Invariant at risk",
        help: "The change touches code or tests that an invariant depends on."
      },
      "invariant-failed": {
        label: "Invariant failed",
        help: "An invariant's check failed."
      }
    };
    MAX_LISTED_CONTRACT_CHANGES = 12;
    ANSI = { red: "31", yellow: "33", cyan: "36", green: "32", dim: "2", bold: "1" };
    TEXT_SEVERITY = {
      error: { mark: "✖", color: ANSI.red },
      warning: { mark: "▲", color: ANSI.yellow },
      info: { mark: "●", color: ANSI.cyan }
    };
    TEXT_VERDICT = {
      pass: { mark: "✔", color: ANSI.green },
      warn: { mark: "▲", color: ANSI.yellow },
      fail: { mark: "✖", color: ANSI.red }
    };
    MD_SEVERITY = { error: "🔴 error", warning: "🟡 warning", info: "🔵 info" };
    MD_VERDICT = {
      pass: { emoji: "✅", text: "Blueprint check passed" },
      warn: { emoji: "⚠️", text: "Blueprint check passed with warnings" },
      fail: { emoji: "❌", text: "Blueprint check failed" }
    };
    SARIF_LEVEL = { error: "error", warning: "warning", info: "note" };
    ANNOTATION_COMMAND = { error: "error", warning: "warning", info: "notice" };
    GRAY = "#9ca3af";
    AMBER = "#d97706";
    RED = "#dc2626";
    MERMAID_ARROW = { declared: "-->", undeclared: "-.->", forbidden: "==>", missing: "-.->" };
    MERMAID_LINK_STYLE = {
      declared: `stroke:${GRAY},stroke-width:1.5px`,
      undeclared: `stroke:${AMBER},stroke-width:2px,stroke-dasharray:6 4`,
      forbidden: `stroke:${RED},stroke-width:4px`,
      missing: `stroke:${GRAY},stroke-width:1.5px,stroke-dasharray:2 4`
    };
    DOT_EDGE_STYLE = {
      declared: `color="${GRAY}"`,
      undeclared: `color="${AMBER}", fontcolor="${AMBER}", style=dashed`,
      forbidden: `color="${RED}", fontcolor="${RED}", penwidth=3`,
      missing: `color="${GRAY}", fontcolor="${GRAY}", style=dotted`
    };
  }
});

// src/blueprint/agents.ts
function knownByIdentity(name, email3) {
  const trimmedName = name.trim();
  const trimmedEmail = email3.trim();
  for (const agent of KNOWN_AGENTS) {
    if (agent.identity.test(trimmedName) || trimmedEmail && agent.identity.test(trimmedEmail)) return agent.name;
  }
  return null;
}
function knownByLabel(label) {
  const trimmed = label.trim();
  return KNOWN_AGENTS.find((agent) => agent.label.test(trimmed))?.name ?? null;
}
function parseTrailers(message) {
  const trailers = [];
  for (const line of message.split(/\r?\n/).slice(1)) {
    const match = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*:\s*(\S.*)$/.exec(line);
    if (match) trailers.push({ key: match[1].toLowerCase(), value: match[2].trim() });
  }
  return trailers;
}
function splitIdentity(value) {
  const match = /^(.*?)\s*<([^>]*)>\s*$/.exec(value);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: value.trim(), email: "" };
}
function fromCoAuthor(value) {
  const { name, email: email3 } = splitIdentity(value);
  const known = knownByIdentity(name, email3) ?? knownByLabel(name);
  if (known) return known;
  if (/\[bot\]@/i.test(email3) || /\[bot\]$/i.test(name)) {
    const label = (name || email3.replace(/^\d+\+/, "").replace(/@.*$/, "")).replace(/\[bot\]$/i, "").trim();
    if (label && !NON_AGENT_BOTS.test(label)) return label;
  }
  return null;
}
function fromGenericTrailer(value) {
  const label = splitIdentity(value).name.split(":")[0].replace(/\s*\(.*\)\s*$/, "").trim();
  if (!label || NEGATIVE_VALUES.test(label)) return null;
  if (AFFIRMATIVE_VALUES.test(label)) return UNNAMED_AGENT;
  return knownByLabel(label) ?? label;
}
function fromTrailer(trailer) {
  if (trailer.key === "co-authored-by") return fromCoAuthor(trailer.value);
  if (GENERIC_TRAILERS.has(trailer.key)) return fromGenericTrailer(trailer.value);
  if (trailer.key.startsWith("codex-")) return "Codex";
  if (trailer.key.startsWith("amp-") || trailer.key.startsWith("ampcode-")) return "Amp";
  if (trailer.key.startsWith("claude-")) return "Claude";
  return null;
}
function agentsFromCommit(commit) {
  const agents = [];
  const add = (agent) => {
    if (agent && !agents.includes(agent)) agents.push(agent);
  };
  add(knownByIdentity(commit.authorName, commit.authorEmail));
  if (/generated with \[?claude code\b/i.test(commit.message)) add("Claude");
  if (/^aider:\s/i.test(commit.message)) add("Aider");
  for (const trailer of parseTrailers(commit.message)) add(fromTrailer(trailer));
  return agents;
}
function detectAgentActivity(commits) {
  const agents = /* @__PURE__ */ new Set();
  let agentCommits = 0;
  for (const commit of commits) {
    const found = agentsFromCommit(commit);
    if (found.length > 0) agentCommits += 1;
    for (const agent of found) agents.add(agent);
  }
  return {
    commits: commits.length,
    agentCommits,
    agents: [...agents].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  };
}
var KNOWN_AGENTS, NON_AGENT_BOTS, GENERIC_TRAILERS, NEGATIVE_VALUES, AFFIRMATIVE_VALUES, UNNAMED_AGENT;
var init_agents = __esm({
  "src/blueprint/agents.ts"() {
    "use strict";
    KNOWN_AGENTS = [
      {
        name: "Claude",
        identity: /noreply@anthropic\.com|^claude(?:[ -]code)?(?:\[bot\])?$|\bclaude\[bot\]/i,
        label: /^(?:anthropic\s+)?claude\b/i
      },
      {
        name: "GitHub Copilot",
        identity: /copilot-swe-agent|^(?:github\s+)?copilot(?:\[bot\])?$|\+copilot@users\.noreply\.github\.com|\bcopilot\[bot\]/i,
        label: /^(?:github\s+)?copilot\b/i
      },
      {
        name: "Devin",
        identity: /devin-ai-integration|^devin(?:\s+ai)?(?:\[bot\])?$/i,
        label: /^devin\b/i
      },
      {
        name: "Cursor",
        identity: /cursoragent|^cursor(?:\s+agent)?(?:\[bot\])?$/i,
        label: /^cursor\b/i
      },
      {
        name: "Codex",
        identity: /chatgpt-codex-connector|^(?:openai\s+)?codex(?:\[bot\])?$|\bcodex@openai\.com/i,
        label: /^(?:openai\s+)?codex\b/i
      },
      {
        name: "Jules",
        identity: /google-labs-jules/i,
        label: /^(?:google\s+)?jules\b/i
      },
      {
        name: "Gemini",
        identity: /gemini-code-assist|^gemini(?:[ -]cli)?(?:\[bot\])?$/i,
        label: /^(?:google\s+)?gemini\b/i
      },
      {
        name: "Aider",
        identity: /\(aider\)\s*$|^aider\b|@aider\.chat\b/i,
        label: /^aider\b/i
      },
      {
        name: "Amp",
        identity: /^amp(?:code)?(?:\[bot\])?$|\bamp@ampcode\.com/i,
        label: /^amp(?:code)?\b/i
      },
      {
        name: "Factory",
        identity: /factory-droid/i,
        label: /^factory(?:[ -]droid)?\b|^droid\b/i
      }
    ];
    NON_AGENT_BOTS = /^(?:dependabot|renovate|github-actions|web-flow|snyk-bot|greenkeeper|mergify|pre-commit-ci|allcontributors|codecov|semantic-release-bot|imgbot|stale|netlify|vercel|release-please|github-merge-queue|pull)\b/i;
    GENERIC_TRAILERS = /* @__PURE__ */ new Set(["generated-by", "assisted-by", "ai-assisted", "made-with", "generated-with", "ai-generated-by"]);
    NEGATIVE_VALUES = /^(?:no|none|false|n\/a|0)$/i;
    AFFIRMATIVE_VALUES = /^(?:yes|true|1)$/i;
    UNNAMED_AGENT = "AI assistant";
  }
});

// src/blueprint/blueprint-diff.ts
function compareText2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function quote(values) {
  return values.map((value) => `"${value}"`).join(", ");
}
function entries(selector) {
  if (selector === void 0) return [];
  return Array.isArray(selector) ? selector : [selector];
}
function setDiff(base, head) {
  const baseSet = new Set(base ?? []);
  const headSet = new Set(head ?? []);
  return {
    added: [...headSet].filter((value) => !baseSet.has(value)).sort(compareText2),
    removed: [...baseSet].filter((value) => !headSet.has(value)).sort(compareText2)
  };
}
function hasDiff(diff) {
  return diff.added.length > 0 || diff.removed.length > 0;
}
function describeSetDiff(diff) {
  const parts = [];
  if (diff.removed.length) parts.push(`removed ${quote(diff.removed)}`);
  if (diff.added.length) parts.push(`added ${quote(diff.added)}`);
  return parts.join(", ");
}
function selectorDiff(base, head) {
  const diff = setDiff(entries(base), entries(head));
  const widened = [];
  const narrowed = [];
  for (const entry of diff.added) (entry.startsWith("!") ? narrowed : widened).push(entry);
  for (const entry of diff.removed) (entry.startsWith("!") ? widened : narrowed).push(entry);
  return { widened: widened.sort(compareText2), narrowed: narrowed.sort(compareText2) };
}
function selectorWords(values, verbs) {
  const plain = values.filter((value) => !value.startsWith("!"));
  const exclusions = values.filter((value) => value.startsWith("!")).map((value) => value.slice(1));
  const parts = [];
  if (plain.length) parts.push(`${verbs.plain} ${quote(plain)}`);
  if (exclusions.length) parts.push(`${verbs.exclusion} ${quote(exclusions)}`);
  return parts;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record2 = value;
    return `{${Object.keys(record2).filter((key) => record2[key] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${stable(record2[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function byId(items) {
  const map2 = /* @__PURE__ */ new Map();
  for (const item of items) if (!map2.has(item.id)) map2.set(item.id, item);
  return map2;
}
function sortedKeys(...maps) {
  const keys = /* @__PURE__ */ new Set();
  for (const map2 of maps) for (const key of map2.keys()) keys.add(key);
  return [...keys].sort(compareText2);
}
function ruleSelectors2(rule) {
  switch (rule.kind) {
    case "forbid":
    case "allow-only":
      return [rule.from, rule.to];
    case "layers":
      return rule.layers;
    case "no-cycles":
      return rule.scope ? [rule.scope] : [];
    case "secret-access":
      return [rule.allow];
    case "protect":
      return [];
  }
}
function ruleReferences(blueprint) {
  const components = /* @__PURE__ */ new Set();
  const tagPatterns = /* @__PURE__ */ new Set();
  for (const rule of blueprint.rules) {
    for (const selector of ruleSelectors2(rule)) {
      for (const ref of selectorComponentRefs(selector)) components.add(ref);
      for (const raw of entries(selector)) {
        const entry = raw.startsWith("!") ? raw.slice(1) : raw;
        if (entry.startsWith("tag:")) tagPatterns.add(entry.slice("tag:".length));
      }
    }
  }
  return { components, tagPatterns: [...tagPatterns].sort(compareText2) };
}
function tagSelected(tag, refs) {
  return refs.tagPatterns.some((pattern2) => pattern2 === tag || compileGlob(`/${pattern2}`).test(tag));
}
function isReferenced(component, refs) {
  return refs.components.has(component.id) || (component.tags ?? []).some((tag) => tagSelected(tag, refs));
}
function diffLevel(field, base, head) {
  if (base === head) return [];
  const lowered = LEVEL_RANK[head] < LEVEL_RANK[base];
  return [
    {
      kind: lowered ? "policy-weakened" : "policy-changed",
      target: `policy.${field}`,
      summary: `Policy ${field} ${lowered ? "lowered" : "raised"} from "${base}" to "${head}"`,
      weakens: lowered
    }
  ];
}
function diffFlag(field, base, head, offMeaning) {
  if (base === head) return [];
  const disabled = base && !head;
  return [
    {
      kind: disabled ? "policy-weakened" : "policy-changed",
      target: `policy.${field}`,
      summary: disabled ? `Policy ${field} turned off: ${offMeaning}` : `Policy ${field} turned on`,
      weakens: disabled
    }
  ];
}
function diffPolicy(base, head) {
  const changes = [
    ...diffLevel("undeclaredDependencies", base.policy.undeclaredDependencies, head.policy.undeclaredDependencies),
    ...diffLevel("unmappedFiles", base.policy.unmappedFiles, head.policy.unmappedFiles),
    ...diffFlag(
      "includeTypeOnly",
      base.policy.includeTypeOnly,
      head.policy.includeTypeOnly,
      "type-only imports no longer count in rules"
    ),
    ...diffFlag(
      "tripwires.defaults",
      base.policy.tripwires.defaults,
      head.policy.tripwires.defaults,
      "built-in tripwires for tests, CI, lockfiles and agent permissions are disabled"
    )
  ];
  const tripwirePaths = setDiff(base.policy.tripwires.paths, head.policy.tripwires.paths);
  if (hasDiff(tripwirePaths)) {
    const weakens = tripwirePaths.removed.length > 0;
    changes.push({
      kind: weakens ? "policy-weakened" : "policy-changed",
      target: "policy.tripwires.paths",
      summary: weakens ? `Policy tripwires no longer protect ${quote(tripwirePaths.removed)}${tripwirePaths.added.length ? ` (added ${quote(tripwirePaths.added)})` : ""}` : `Policy tripwires now also protect ${quote(tripwirePaths.added)}`,
      weakens
    });
  }
  changes.push(
    ...diffFlag(
      "verificationHeuristics",
      base.policy.verificationHeuristics,
      head.policy.verificationHeuristics,
      "weakened verification (skipped tests, removed assertions) is no longer flagged"
    )
  );
  const ignore = setDiff(base.policy.ignore, head.policy.ignore);
  if (hasDiff(ignore)) {
    const weakens = ignore.added.length > 0;
    changes.push({
      kind: weakens ? "policy-weakened" : "policy-changed",
      target: "policy.ignore",
      summary: weakens ? `Policy ignore now hides ${quote(ignore.added)} from analysis${ignore.removed.length ? ` (removed ${quote(ignore.removed)})` : ""}` : `Policy ignore no longer hides ${quote(ignore.removed)}`,
      weakens
    });
  }
  return changes;
}
function diffComponent(base, head, refs) {
  const parts = [];
  let weakens = false;
  const referenced = isReferenced(base, refs);
  if (base.name !== head.name) parts.push(`name "${base.name}" → "${head.name}"`);
  if (base.kind !== head.kind) {
    parts.push(`kind "${base.kind}" → "${head.kind}"`);
    if (head.kind === "test" && base.kind !== "test") weakens = true;
  }
  if (Boolean(base.public) !== Boolean(head.public)) {
    parts.push(head.public ? "now public (open to every component)" : "no longer public");
    if (head.public) weakens = true;
  }
  const paths = setDiff(base.paths, head.paths);
  if (hasDiff(paths)) {
    parts.push(`paths (${describeSetDiff(paths)})`);
    if (referenced && paths.removed.length) weakens = true;
  }
  const exclude = setDiff(base.exclude, head.exclude);
  if (hasDiff(exclude)) {
    parts.push(`exclude (${describeSetDiff(exclude)})`);
    if (referenced && exclude.added.length) weakens = true;
  }
  if (base.priority !== head.priority) parts.push(`priority ${base.priority ?? "unset"} → ${head.priority ?? "unset"}`);
  const tags = setDiff(base.tags, head.tags);
  if (hasDiff(tags)) {
    parts.push(`tags (${describeSetDiff(tags)})`);
    if (tags.removed.some((tag) => tagSelected(tag, refs))) weakens = true;
  }
  const owners = setDiff(base.owners, head.owners);
  if (hasDiff(owners)) parts.push(`owners (${describeSetDiff(owners)})`);
  if ((base.intent ?? "") !== (head.intent ?? "")) parts.push("intent");
  if (base.assurance !== head.assurance) {
    const before = base.assurance ?? "unknown";
    const after = head.assurance ?? "unknown";
    if (before !== after) {
      parts.push(`assurance ${before} → ${after}`);
      if (before !== "unknown" && ASSURANCE_RANK[after] < ASSURANCE_RANK[before]) weakens = true;
    }
  }
  if (Boolean(base.external) !== Boolean(head.external)) {
    parts.push(head.external ? "now marked external" : "no longer marked external");
  }
  if (parts.length === 0) return null;
  return {
    kind: "component-changed",
    target: base.id,
    summary: `Component "${base.id}" changed: ${parts.join("; ")}`,
    weakens
  };
}
function diffComponents(base, head, refs) {
  const before = byId(base.components);
  const after = byId(head.components);
  const changes = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "component-added", target: id, summary: `Component "${id}" added`, weakens: false });
    } else if (old && !next) {
      const referenced = isReferenced(old, refs);
      changes.push({
        kind: "component-removed",
        target: id,
        summary: referenced ? `Component "${id}" removed while rules still reference it` : `Component "${id}" removed`,
        weakens: referenced
      });
    } else if (old && next) {
      const change = diffComponent(old, next, refs);
      if (change) changes.push(change);
    }
  }
  return changes;
}
function dependencyKey(dependency) {
  return `${dependency.from}->${dependency.to}`;
}
function dependencyMap(blueprint) {
  const map2 = /* @__PURE__ */ new Map();
  for (const dependency of blueprint.dependencies) {
    const key = dependencyKey(dependency);
    if (!map2.has(key)) map2.set(key, dependency);
  }
  return map2;
}
function diffDependencies(base, head) {
  const before = dependencyMap(base);
  const after = dependencyMap(head);
  const strict = base.policy.undeclaredDependencies === "error";
  const changes = [];
  for (const key of sortedKeys(before, after)) {
    const old = before.get(key);
    const next = after.get(key);
    if (!old && next) {
      changes.push({
        kind: "dependency-added",
        target: key,
        summary: strict ? `Dependency "${next.from}" → "${next.to}" declared; undeclared dependencies are errors, so this legalizes a new edge` : `Dependency "${next.from}" → "${next.to}" declared`,
        weakens: strict
      });
    } else if (old && !next) {
      changes.push({
        kind: "dependency-removed",
        target: key,
        summary: `Dependency "${old.from}" → "${old.to}" is no longer declared`,
        weakens: false
      });
    }
  }
  return changes;
}
function ruleSeverity(rule) {
  return rule.severity ?? DEFAULT_RULE_SEVERITY[rule.kind];
}
function includesTypeOnly(rule) {
  return "includeTypeOnly" in rule ? rule.includeTypeOnly ?? true : true;
}
function layerKey(layer) {
  return [...entries(layer)].sort(compareText2).join(" + ");
}
function diffSeverity(base, head, edits) {
  if (base === head) return;
  const lowered = SEVERITY_RANK2[head] < SEVERITY_RANK2[base];
  (lowered ? edits.weakened : edits.strengthened).push(
    `severity ${lowered ? "lowered" : "raised"} from "${base}" to "${head}"`
  );
}
function diffRuleBody(base, head, edits) {
  if (base.kind === "forbid" && head.kind === "forbid") {
    const from = selectorDiff(base.from, head.from);
    const to = selectorDiff(base.to, head.to);
    edits.weakened.push(
      ...selectorWords(from.narrowed, { plain: "no longer applies to", exclusion: "now exempts" }),
      ...selectorWords(to.narrowed, { plain: "no longer forbids", exclusion: "now permits" })
    );
    edits.strengthened.push(
      ...selectorWords(from.widened, { plain: "now also applies to", exclusion: "no longer exempts" }),
      ...selectorWords(to.widened, { plain: "now also forbids", exclusion: "no longer permits" })
    );
  } else if (base.kind === "allow-only" && head.kind === "allow-only") {
    const from = selectorDiff(base.from, head.from);
    const to = selectorDiff(base.to, head.to);
    edits.weakened.push(
      ...selectorWords(from.narrowed, { plain: "no longer restricts", exclusion: "now exempts" }),
      ...selectorWords(to.widened, { plain: "now also allows", exclusion: "no longer excludes" })
    );
    edits.strengthened.push(
      ...selectorWords(from.widened, { plain: "now also restricts", exclusion: "no longer exempts" }),
      ...selectorWords(to.narrowed, { plain: "no longer allows", exclusion: "now excludes" })
    );
  } else if (base.kind === "layers" && head.kind === "layers") {
    const before = base.layers.map(layerKey);
    const after = head.layers.map(layerKey);
    const removed = before.filter((layer) => !after.includes(layer));
    const added = after.filter((layer) => !before.includes(layer));
    const commonBefore = before.filter((layer) => after.includes(layer));
    const commonAfter = after.filter((layer) => before.includes(layer));
    if (removed.length) edits.weakened.push(`no longer has layer ${quote(removed)}`);
    if (commonBefore.join("\0") !== commonAfter.join("\0")) {
      edits.weakened.push(`layer order changed to ${after.join(" > ")}`);
    }
    if (added.length) edits.strengthened.push(`added layer ${quote(added)}`);
  } else if (base.kind === "protect" && head.kind === "protect") {
    const paths = setDiff(base.paths, head.paths);
    if (paths.removed.length) edits.weakened.push(`no longer protects ${quote(paths.removed)}`);
    if (paths.added.length) edits.strengthened.push(`now also protects ${quote(paths.added)}`);
  } else if (base.kind === "secret-access" && head.kind === "secret-access") {
    const allow = selectorDiff(base.allow, head.allow);
    const secrets = setDiff(base.secrets, head.secrets);
    edits.weakened.push(
      ...selectorWords(allow.widened, { plain: "now also lets", exclusion: "no longer excludes" }).map(
        (part) => part.startsWith("now also lets") ? `${part} read the secrets` : part
      )
    );
    if (secrets.removed.length) edits.weakened.push(`no longer guards ${quote(secrets.removed)}`);
    edits.strengthened.push(
      ...selectorWords(allow.narrowed, { plain: "no longer lets", exclusion: "now excludes" }).map(
        (part) => part.startsWith("no longer lets") ? `${part} read the secrets` : part
      )
    );
    if (secrets.added.length) edits.strengthened.push(`now also guards ${quote(secrets.added)}`);
  } else if (base.kind === "no-cycles" && head.kind === "no-cycles") {
    if (base.scope === void 0 && head.scope !== void 0) {
      edits.weakened.push(`now only checks cycles within ${quote(entries(head.scope))}`);
    } else if (base.scope !== void 0 && head.scope === void 0) {
      edits.strengthened.push("now checks cycles across every component");
    } else {
      const scope = selectorDiff(base.scope, head.scope);
      if (scope.narrowed.length) {
        edits.weakened.push(
          ...selectorWords(scope.narrowed, { plain: "scope no longer covers", exclusion: "scope now excludes" })
        );
      }
      if (scope.widened.length) {
        edits.strengthened.push(
          ...selectorWords(scope.widened, { plain: "scope now also covers", exclusion: "scope no longer excludes" })
        );
      }
    }
  }
}
function diffRule(base, head) {
  if (base.kind !== head.kind) {
    return {
      kind: "rule-changed",
      target: base.id,
      summary: `Rule "${base.id}" changed kind from "${base.kind}" to "${head.kind}"`,
      weakens: true
    };
  }
  const edits = { weakened: [], strengthened: [], neutral: [] };
  diffSeverity(ruleSeverity(base), ruleSeverity(head), edits);
  if (includesTypeOnly(base) !== includesTypeOnly(head)) {
    if (includesTypeOnly(base)) edits.weakened.push("no longer counts type-only imports");
    else edits.strengthened.push("now counts type-only imports");
  }
  diffRuleBody(base, head, edits);
  if ((base.reason ?? "") !== (head.reason ?? "")) edits.neutral.push("reason reworded");
  const parts = [...edits.weakened, ...edits.strengthened, ...edits.neutral];
  if (parts.length === 0) return null;
  const kind = edits.weakened.length ? "rule-weakened" : edits.strengthened.length ? "rule-strengthened" : "rule-changed";
  return { kind, target: base.id, summary: `Rule "${base.id}" ${parts.join("; ")}`, weakens: kind === "rule-weakened" };
}
function diffRules(base, head) {
  const before = byId(base.rules);
  const after = byId(head.rules);
  const changes = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "rule-added", target: id, summary: `Rule "${id}" (${next.kind}) added`, weakens: false });
    } else if (old && !next) {
      changes.push({ kind: "rule-removed", target: id, summary: `Rule "${id}" (${old.kind}) removed`, weakens: true });
    } else if (old && next) {
      const change = diffRule(old, next);
      if (change) changes.push(change);
    }
  }
  return changes;
}
function diffInvariant(base, head) {
  const weakened = [];
  const other = [];
  const beforeRun = base.check?.run;
  const afterRun = head.check?.run;
  if (beforeRun !== afterRun) {
    if (beforeRun === void 0) other.push("check command added");
    else weakened.push(afterRun === void 0 ? "check command removed" : "check command changed");
  }
  const tests = setDiff(base.check?.tests, head.check?.tests);
  if (tests.removed.length) weakened.push(`no longer checked by tests ${quote(tests.removed)}`);
  if (tests.added.length) other.push(`now also checked by tests ${quote(tests.added)}`);
  const beforeSeverity = base.severity ?? DEFAULT_INVARIANT_SEVERITY;
  const afterSeverity = head.severity ?? DEFAULT_INVARIANT_SEVERITY;
  if (beforeSeverity !== afterSeverity) {
    const lowered = SEVERITY_RANK2[afterSeverity] < SEVERITY_RANK2[beforeSeverity];
    (lowered ? weakened : other).push(
      `severity ${lowered ? "lowered" : "raised"} from "${beforeSeverity}" to "${afterSeverity}"`
    );
  }
  if (base.statement !== head.statement) other.push("statement reworded");
  const components = setDiff(base.components, head.components);
  if (hasDiff(components)) other.push(`components (${describeSetDiff(components)})`);
  const parts = [...weakened, ...other];
  if (parts.length === 0) return null;
  return {
    kind: "invariant-changed",
    target: base.id,
    summary: `Invariant "${base.id}" changed: ${parts.join("; ")}`,
    weakens: weakened.length > 0
  };
}
function diffInvariants(base, head) {
  const before = byId(base.invariants);
  const after = byId(head.invariants);
  const changes = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "invariant-added", target: id, summary: `Invariant "${id}" added`, weakens: false });
    } else if (old && !next) {
      changes.push({ kind: "invariant-removed", target: id, summary: `Invariant "${id}" removed`, weakens: true });
    } else if (old && next) {
      const change = diffInvariant(old, next);
      if (change) changes.push(change);
    }
  }
  return changes;
}
function diffDecision(base, head) {
  const parts = [];
  if (base.status !== head.status) parts.push(`status "${base.status}" → "${head.status}"`);
  if (base.title !== head.title) parts.push("title reworded");
  if (base.decision !== head.decision) parts.push("decision text changed");
  if (parts.length === 0) return null;
  return {
    kind: "decision-changed",
    target: base.id,
    summary: `Decision "${base.id}" changed: ${parts.join("; ")}`,
    weakens: false
  };
}
function diffDecisions(base, head) {
  const before = byId(base.decisions);
  const after = byId(head.decisions);
  const changes = [];
  for (const id of sortedKeys(before, after)) {
    const old = before.get(id);
    const next = after.get(id);
    if (!old && next) {
      changes.push({ kind: "decision-added", target: id, summary: `Decision "${id}" added`, weakens: false });
    } else if (old && !next) {
      changes.push({ kind: "decision-removed", target: id, summary: `Decision "${id}" removed`, weakens: false });
    } else if (old && next) {
      const change = diffDecision(old, next);
      if (change) changes.push(change);
    }
  }
  return changes;
}
function signer(stamp) {
  return `${stamp.by} at ${stamp.at}`;
}
function diffStamps(label, before, after) {
  const changes = [];
  for (const key of [...after.keys()].sort(compareText2)) {
    const old = before.get(key)?.verified;
    const next = after.get(key)?.verified;
    if (stable(old ?? null) === stable(next ?? null)) continue;
    let detail;
    if (!old && next) detail = `added (signed by ${signer(next)})`;
    else if (old && !next) detail = `removed (was signed by ${signer(old)})`;
    else if (old && next) detail = `changed (signed by ${signer(next)}; previously ${signer(old)})`;
    else continue;
    changes.push({
      kind: "verification-changed",
      target: `${label}:${key}`,
      summary: `Verification of ${label} "${key}" ${detail}`,
      weakens: false
    });
  }
  return changes;
}
function diffVerification(base, head) {
  return [
    ...diffStamps("component", byId(base.components), byId(head.components)),
    ...diffStamps("dependency", dependencyMap(base), dependencyMap(head)),
    ...diffStamps("rule", byId(base.rules), byId(head.rules)),
    ...diffStamps("invariant", byId(base.invariants), byId(head.invariants))
  ];
}
function sortedIds(items) {
  return [...byId(items).keys()].sort(compareText2);
}
function describeNewBlueprint(head) {
  const rules = byId(head.rules);
  return [
    ...sortedIds(head.components).map((id) => ({
      kind: "component-added",
      target: id,
      summary: `Component "${id}" added`,
      weakens: false
    })),
    ...[...dependencyMap(head).entries()].sort(([left], [right]) => compareText2(left, right)).map(([key, dependency]) => ({
      kind: "dependency-added",
      target: key,
      summary: `Dependency "${dependency.from}" → "${dependency.to}" declared`,
      weakens: false
    })),
    ...sortedIds(head.rules).map((id) => ({
      kind: "rule-added",
      target: id,
      summary: `Rule "${id}" (${rules.get(id)?.kind ?? "rule"}) added`,
      weakens: false
    })),
    ...sortedIds(head.invariants).map((id) => ({
      kind: "invariant-added",
      target: id,
      summary: `Invariant "${id}" added`,
      weakens: false
    })),
    ...sortedIds(head.decisions).map((id) => ({
      kind: "decision-added",
      target: id,
      summary: `Decision "${id}" added`,
      weakens: false
    }))
  ];
}
function diffBlueprints(base, head) {
  if (!base && !head) return [];
  if (base && !head) {
    return [{ kind: "policy-weakened", target: "blueprint", summary: "The blueprint was deleted", weakens: true }];
  }
  if (!base && head) return describeNewBlueprint(head);
  if (!base || !head) return [];
  const refs = ruleReferences(base);
  return [
    ...diffPolicy(base, head),
    ...diffComponents(base, head, refs),
    ...diffDependencies(base, head),
    ...diffRules(base, head),
    ...diffInvariants(base, head),
    ...diffDecisions(base, head),
    ...diffVerification(base, head)
  ];
}
var SEVERITY_RANK2, LEVEL_RANK, ASSURANCE_RANK, DEFAULT_RULE_SEVERITY, DEFAULT_INVARIANT_SEVERITY;
var init_blueprint_diff = __esm({
  "src/blueprint/blueprint-diff.ts"() {
    "use strict";
    init_glob();
    init_schema();
    SEVERITY_RANK2 = { info: 1, warning: 2, error: 3 };
    LEVEL_RANK = { off: 0, info: 1, warning: 2, error: 3 };
    ASSURANCE_RANK = {
      unknown: 0,
      untested: 1,
      tested: 2,
      "property-tested": 3,
      "formally-verified": 4
    };
    DEFAULT_RULE_SEVERITY = {
      forbid: "error",
      "allow-only": "error",
      layers: "error",
      "secret-access": "error",
      "no-cycles": "warning",
      protect: "warning"
    };
    DEFAULT_INVARIANT_SEVERITY = "error";
  }
});

// src/blueprint/impact.ts
function computeImpact(paths, blueprint, graph) {
  const changedFiles = uniqueSorted(paths);
  const touched = /* @__PURE__ */ new Map();
  for (const path of changedFiles) {
    const owner = graph.membership.fileToComponent.get(path) ?? componentForPath(path, blueprint);
    if (!owner) continue;
    const set2 = touched.get(owner) ?? /* @__PURE__ */ new Set();
    set2.add(path);
    touched.set(owner, set2);
  }
  const touchedComponents = [...touched.entries()].map(([id, files]) => ({ id, files: [...files].sort() })).sort((left, right) => right.files.length - left.files.length || left.id.localeCompare(right.id));
  return {
    changedFiles,
    touchedComponents,
    dependents: dependentsOf(touched.keys(), reverseAdjacency(graph))
  };
}
function dependentCounts(graph) {
  const reverse = reverseAdjacency(graph);
  const counts = /* @__PURE__ */ new Map();
  for (const id of graph.membership.componentFiles.keys()) {
    counts.set(id, dependentsOf([id], reverse).length);
  }
  return counts;
}
var init_impact = __esm({
  "src/blueprint/impact.ts"() {
    "use strict";
    init_graph();
    init_util3();
  }
});

// src/blueprint/selectors.ts
function selectorEntries(selector) {
  if (selector === void 0) return [];
  return Array.isArray(selector) ? [...selector] : [selector];
}
function packageMatcher(pattern2) {
  return compileGlob(`/${pattern2.replace(/^\/+/, "")}`);
}
function componentsWithTag(blueprint, tagPattern) {
  const matcher = compileGlob(`/${tagPattern}`);
  return blueprint.components.filter((component) => (component.tags ?? []).some((tag) => matcher.test(tag))).map((component) => component.id);
}
function resolveSelector(selector, blueprint) {
  const resolved = {
    all: false,
    components: /* @__PURE__ */ new Set(),
    paths: [],
    packages: [],
    excludeComponents: /* @__PURE__ */ new Set(),
    excludePaths: [],
    excludePackages: [],
    hasInternal: false,
    hasPackages: false,
    entries: selectorEntries(selector)
  };
  for (const raw of resolved.entries) {
    const negated = raw.startsWith("!");
    const entry = (negated ? raw.slice(1) : raw).trim();
    if (!entry) continue;
    if (entry === "*") {
      if (!negated) {
        resolved.all = true;
        resolved.hasInternal = true;
      }
      continue;
    }
    if (entry.startsWith("package:")) {
      const matcher = packageMatcher(entry.slice("package:".length));
      if (negated) resolved.excludePackages.push(matcher);
      else {
        resolved.packages.push(matcher);
        resolved.hasPackages = true;
      }
      continue;
    }
    if (entry.startsWith("path:")) {
      const matcher = compileGlob(entry.slice("path:".length));
      if (negated) resolved.excludePaths.push(matcher);
      else {
        resolved.paths.push(matcher);
        resolved.hasInternal = true;
      }
      continue;
    }
    const ids = entry.startsWith("tag:") ? componentsWithTag(blueprint, entry.slice("tag:".length)) : [entry.startsWith("component:") ? entry.slice("component:".length) : entry];
    for (const id of ids) {
      if (negated) resolved.excludeComponents.add(id);
      else resolved.components.add(id);
    }
    if (!negated) resolved.hasInternal = true;
  }
  return resolved;
}
function matchesFile(selector, path, componentId) {
  if (!selector.hasInternal) return false;
  if (componentId !== null && selector.excludeComponents.has(componentId)) return false;
  if (selector.excludePaths.some((matcher) => matcher.test(path))) return false;
  if (selector.all) return true;
  if (componentId !== null && selector.components.has(componentId)) return true;
  return selector.paths.some((matcher) => matcher.test(path));
}
function matchesComponent(selector, componentId) {
  if (selector.excludeComponents.has(componentId)) return false;
  return selector.all || selector.components.has(componentId);
}
function matchesPackage(selector, pkg) {
  if (!selector.hasPackages) return false;
  if (selector.excludePackages.some((matcher) => matcher.test(pkg))) return false;
  return selector.packages.some((matcher) => matcher.test(pkg));
}
function describeSelector(selector) {
  const entries2 = selectorEntries(selector);
  if (!entries2.length) return "nothing";
  const parts = entries2.map((entry) => {
    if (entry === "*") return "any file";
    if (entry === "!*") return "no file";
    const negated = entry.startsWith("!");
    const body = negated ? entry.slice(1) : entry;
    let text3;
    if (body.startsWith("package:")) text3 = `package ${body.slice(8)}`;
    else if (body.startsWith("path:")) text3 = `files matching ${body.slice(5)}`;
    else if (body.startsWith("tag:")) text3 = `components tagged ${body.slice(4)}`;
    else text3 = body.startsWith("component:") ? body.slice(10) : body;
    return negated ? `except ${text3}` : text3;
  });
  return parts.join(", ");
}
var init_selectors = __esm({
  "src/blueprint/selectors.ts"() {
    "use strict";
    init_glob();
  }
});

// src/blueprint/rules.ts
function ruleSeverity2(rule) {
  return rule.severity ?? DEFAULT_RULE_SEVERITY2[rule.kind];
}
function compileRules(blueprint) {
  const typeOnlyDefault = blueprint.policy.includeTypeOnly;
  return blueprint.rules.map((rule) => {
    switch (rule.kind) {
      case "forbid":
      case "allow-only":
        return {
          rule,
          from: resolveSelector(rule.from, blueprint),
          to: resolveSelector(rule.to, blueprint),
          includeTypeOnly: rule.includeTypeOnly ?? typeOnlyDefault
        };
      case "layers":
        return {
          rule,
          layers: rule.layers.map((layer) => resolveSelector(layer, blueprint)),
          includeTypeOnly: rule.includeTypeOnly ?? typeOnlyDefault
        };
      case "no-cycles":
        return {
          rule,
          scope: rule.scope ? resolveSelector(rule.scope, blueprint) : null,
          includeTypeOnly: rule.includeTypeOnly ?? typeOnlyDefault
        };
      case "secret-access":
        return {
          rule,
          allow: resolveSelector(rule.allow, blueprint),
          secrets: rule.secrets.map((pattern2) => compileGlob(`/${pattern2}`))
        };
      case "protect":
        return { rule };
    }
  });
}
function createLabeler(blueprint) {
  const names = new Map((blueprint?.components ?? []).map((component) => [component.id, component.name]));
  return {
    component: (id) => id ? names.get(id) ?? id : "unmapped code",
    file: (path) => path
  };
}
function layerIndex(layers, target) {
  return layers.findIndex((layer) => target.kind === "internal" ? matchesFile(layer, target.path, target.component) : matchesPackage(layer, target.pkg));
}
function edgeRuleHits(compiled, from, target, typeOnly, labels) {
  const hits = [];
  const targetLabel = target.kind === "internal" ? labels.component(target.component) : `package ${target.pkg}`;
  const fromLabel = labels.component(from.component);
  for (const entry of compiled) {
    const rule = entry.rule;
    if (rule.kind === "forbid" && "to" in entry) {
      if (typeOnly && !entry.includeTypeOnly) continue;
      if (!matchesFile(entry.from, from.path, from.component)) continue;
      const hit = target.kind === "internal" ? matchesFile(entry.to, target.path, target.component) : matchesPackage(entry.to, target.pkg);
      if (!hit) continue;
      hits.push({
        rule,
        kind: "forbidden-dependency",
        severity: ruleSeverity2(rule),
        title: `${fromLabel} must not depend on ${targetLabel}`,
        explanation: `Rule "${rule.id}" forbids ${describeSelector(rule.from)} → ${describeSelector(rule.to)}.`
      });
    } else if (rule.kind === "allow-only" && "to" in entry) {
      if (typeOnly && !entry.includeTypeOnly) continue;
      if (!matchesFile(entry.from, from.path, from.component)) continue;
      if (target.kind === "internal") {
        if (target.component !== null && target.component === from.component) continue;
        if (matchesFile(entry.to, target.path, target.component)) continue;
      } else {
        if (!entry.to.hasPackages) continue;
        if (matchesPackage(entry.to, target.pkg)) continue;
      }
      hits.push({
        rule,
        kind: "allow-only-violation",
        severity: ruleSeverity2(rule),
        title: `${fromLabel} may only depend on ${describeSelector(rule.to)}`,
        explanation: `Rule "${rule.id}" allows ${describeSelector(rule.from)} to depend only on ${describeSelector(rule.to)}; ${targetLabel} is outside that set.`
      });
    } else if (rule.kind === "layers" && "layers" in entry) {
      if (typeOnly && !entry.includeTypeOnly) continue;
      const fromLayer = layerIndex(entry.layers, { kind: "internal", path: from.path, component: from.component });
      const toLayer = layerIndex(entry.layers, target);
      if (fromLayer < 0 || toLayer < 0 || toLayer >= fromLayer) continue;
      hits.push({
        rule,
        kind: "layer-violation",
        severity: ruleSeverity2(rule),
        title: `Layer violation: ${describeSelector(rule.layers[fromLayer])} depends on ${describeSelector(rule.layers[toLayer])}`,
        explanation: `Rule "${rule.id}" orders layers top → bottom (${rule.layers.map((layer) => describeSelector(layer)).join(" → ")}); a lower layer must not depend on a higher one.`
      });
    }
  }
  return hits;
}
function evaluateRules(model, compiled = compileRules(model.blueprint)) {
  const { blueprint, fileGraph, membership, componentGraph } = model;
  const labels = createLabeler(blueprint);
  const violations = [];
  const perRule = /* @__PURE__ */ new Map();
  const push = (ruleId, violation) => {
    const count = perRule.get(ruleId) ?? 0;
    if (count >= MAX_FINDINGS_PER_RULE) return;
    perRule.set(ruleId, count + 1);
    violations.push(violation);
  };
  const edgeRules = compiled.filter((entry) => entry.rule.kind === "forbid" || entry.rule.kind === "allow-only" || entry.rule.kind === "layers");
  if (edgeRules.length) {
    const seen = /* @__PURE__ */ new Set();
    for (const edge of fileGraph.edges) {
      const fromComponent = membership.fileToComponent.get(edge.from) ?? null;
      const toComponent = membership.fileToComponent.get(edge.to) ?? null;
      for (const hit of edgeRuleHits(edgeRules, { path: edge.from, component: fromComponent }, { kind: "internal", path: edge.to, component: toComponent }, edge.typeOnly, labels)) {
        const id = fingerprint(hit.kind, hit.rule.id, edge.from, edge.to);
        if (seen.has(id)) continue;
        seen.add(id);
        push(hit.rule.id, {
          id,
          kind: hit.kind,
          severity: hit.severity,
          ruleId: hit.rule.id,
          title: hit.title,
          message: `${edge.from} imports ${edge.to}${edge.typeOnly ? " (type-only)" : ""}. ${hit.explanation}`,
          reason: hit.rule.reason,
          components: [fromComponent, toComponent].filter((value) => Boolean(value)),
          locations: [{ path: edge.from, line: edge.line }]
        });
      }
    }
    for (const ref of fileGraph.externals) {
      const fromComponent = membership.fileToComponent.get(ref.from) ?? null;
      for (const hit of edgeRuleHits(edgeRules, { path: ref.from, component: fromComponent }, { kind: "external", pkg: ref.pkg }, ref.typeOnly, labels)) {
        const id = fingerprint(hit.kind, hit.rule.id, ref.from, `pkg:${ref.pkg}`);
        if (seen.has(id)) continue;
        seen.add(id);
        push(hit.rule.id, {
          id,
          kind: hit.kind,
          severity: hit.severity,
          ruleId: hit.rule.id,
          title: hit.title,
          message: `${ref.from} imports package "${ref.pkg}". ${hit.explanation}`,
          reason: hit.rule.reason,
          components: fromComponent ? [fromComponent] : [],
          locations: [{ path: ref.from, line: ref.line }]
        });
      }
    }
  }
  for (const entry of compiled) {
    const rule = entry.rule;
    if (rule.kind === "no-cycles" && "scope" in entry) {
      const nodes = blueprint.components.filter((component) => !entry.scope || matchesComponent(entry.scope, component.id)).map((component) => component.id);
      const edges = componentGraph.edges.filter((edge) => entry.includeTypeOnly || !edge.typeOnly);
      for (const members of findCycles(nodes, edges)) {
        const path = cyclePath(members, edges);
        const locations = [];
        for (let index = 0; index + 1 < path.length && locations.length < 10; index += 1) {
          const edge = edges.find((candidate) => candidate.from === path[index] && candidate.to === path[index + 1]);
          const evidence = edge?.evidence.find((item) => entry.includeTypeOnly || !item.typeOnly) ?? edge?.evidence[0];
          if (evidence) locations.push({ path: evidence.from, line: evidence.line });
        }
        push(rule.id, {
          id: fingerprint("dependency-cycle", rule.id, members.join(",")),
          kind: "dependency-cycle",
          severity: ruleSeverity2(rule),
          ruleId: rule.id,
          title: `Dependency cycle: ${path.map((id) => labels.component(id)).join(" → ")}`,
          message: `${plural(members.length, "component")} depend on each other in a cycle. Break one edge to restore a clear direction of dependency.`,
          reason: rule.reason,
          components: members,
          locations
        });
      }
    } else if (rule.kind === "secret-access" && "secrets" in entry) {
      for (const [path, facts] of fileGraph.facts) {
        const component = membership.fileToComponent.get(path) ?? null;
        if (matchesFile(entry.allow, path, component)) continue;
        for (const ref of facts.envRefs) {
          if (!entry.secrets.some((matcher) => matcher.test(ref.name))) continue;
          push(rule.id, {
            id: fingerprint("secret-access", rule.id, path, ref.name),
            kind: "secret-access",
            severity: ruleSeverity2(rule),
            ruleId: rule.id,
            title: `${ref.name} may only be read by ${describeSelector(rule.allow)}`,
            message: `${path} reads ${ref.name} at line ${ref.line}, outside the components allowed to hold this secret.`,
            reason: rule.reason,
            components: component ? [component] : [],
            locations: [{ path, line: ref.line }]
          });
        }
      }
    }
  }
  return violations;
}
function evaluatePolicy(model) {
  const { blueprint, fileGraph, membership, componentGraph } = model;
  const labels = createLabeler(blueprint);
  const violations = [];
  const policy = blueprint.policy;
  const componentById = new Map(blueprint.components.map((component) => [component.id, component]));
  if (policy.undeclaredDependencies !== "off") {
    const declared = new Set(blueprint.dependencies.map((dependency) => `${dependency.from}\0${dependency.to}`));
    for (const edge of componentGraph.edges) {
      if (!policy.includeTypeOnly && edge.typeOnly) continue;
      if (declared.has(`${edge.from}\0${edge.to}`)) continue;
      if (componentById.get(edge.from)?.kind === "test") continue;
      if (componentById.get(edge.to)?.public) continue;
      violations.push({
        id: fingerprint("undeclared-dependency", edge.from, edge.to),
        kind: "undeclared-dependency",
        severity: policy.undeclaredDependencies,
        title: `Undeclared dependency: ${labels.component(edge.from)} → ${labels.component(edge.to)}`,
        message: `${plural(edge.count, "import")} from ${labels.component(edge.from)} into ${labels.component(edge.to)} ${edge.count === 1 ? "is" : "are"} not declared in the blueprint. Declare the dependency if it is intended, or remove it.`,
        components: [edge.from, edge.to],
        locations: edge.evidence.slice(0, 5).map((evidence) => ({ path: evidence.from, line: evidence.line }))
      });
    }
  }
  if (policy.unmappedFiles !== "off") {
    const unmappedSource = membership.unmapped.filter((path) => fileGraph.facts.has(path));
    if (unmappedSource.length) {
      violations.push({
        id: fingerprint("unmapped-file", "aggregate"),
        kind: "unmapped-file",
        severity: policy.unmappedFiles,
        title: `${plural(unmappedSource.length, "source file")} not claimed by any component`,
        message: `Add these paths to a component (or to policy.ignore) so rules can see them: ${unmappedSource.slice(0, 5).join(", ")}${unmappedSource.length > 5 ? ", …" : ""}`,
        components: [],
        locations: unmappedSource.slice(0, 50).map((path) => ({ path }))
      });
    }
  }
  for (const component of blueprint.components) {
    if (component.external || !component.paths.length) continue;
    const files = membership.componentFiles.get(component.id) ?? [];
    if (!files.length) {
      violations.push({
        id: fingerprint("empty-component", component.id),
        kind: "empty-component",
        severity: "warning",
        title: `Component "${component.name}" matches no files`,
        message: `None of its paths (${component.paths.join(", ")}) match a file. The globs may be stale after a move or rename.`,
        components: [component.id],
        locations: []
      });
      continue;
    }
    const declared = component.assurance;
    if (declared === "tested" || declared === "property-tested" || declared === "formally-verified") {
      const hasTests = (componentGraph.tests.get(component.id)?.length ?? 0) > 0 || files.some((path) => fileGraph.facts.get(path)?.isTest);
      if (!hasTests) {
        violations.push({
          id: fingerprint("assurance-drift", component.id),
          kind: "assurance-drift",
          severity: "warning",
          title: `"${component.name}" is declared ${declared} but no tests import it`,
          message: `The blueprint claims assurance level "${declared}", but no test file imports any of its ${plural(files.length, "file")}.`,
          components: [component.id],
          locations: [{ path: files[0] }]
        });
      }
    }
  }
  return violations;
}
var DEFAULT_RULE_SEVERITY2, MAX_FINDINGS_PER_RULE;
var init_rules = __esm({
  "src/blueprint/rules.ts"() {
    "use strict";
    init_graph();
    init_selectors();
    init_glob();
    init_util3();
    DEFAULT_RULE_SEVERITY2 = {
      forbid: "error",
      "allow-only": "error",
      layers: "error",
      "secret-access": "error",
      "no-cycles": "warning",
      protect: "warning"
    };
    MAX_FINDINGS_PER_RULE = 400;
  }
});

// src/blueprint/snapshot.ts
function filterFileGraph(graph, ignore) {
  if (!ignore.length) return graph;
  const keep = (path) => !isIgnoredPath(path, ignore);
  return {
    files: graph.files.filter(keep),
    facts: new Map([...graph.facts].filter(([path]) => keep(path))),
    edges: graph.edges.filter((edge) => keep(edge.from) && keep(edge.to)),
    externals: graph.externals.filter((ref) => keep(ref.from)),
    unresolved: graph.unresolved.filter((ref) => keep(ref.from))
  };
}
var init_snapshot = __esm({
  "src/blueprint/snapshot.ts"() {
    "use strict";
    init_imports();
  }
});

// src/blueprint/stats.ts
function isHumanFact(fact) {
  if (fact.verified) return true;
  return !fact.provenance || fact.provenance.source === "human";
}
function blueprintFacts(blueprint) {
  return [
    ...blueprint.components,
    ...blueprint.dependencies,
    ...blueprint.rules,
    ...blueprint.invariants,
    ...blueprint.decisions
  ];
}
function humanAuthoredRatio(blueprint) {
  if (!blueprint) return 0;
  const facts = blueprintFacts(blueprint);
  if (!facts.length) return 0;
  const human = facts.filter(isHumanFact).length;
  return Math.round(human / facts.length * 1e3) / 1e3;
}
function authorshipStats(blueprint) {
  const facts = blueprint ? blueprintFacts(blueprint) : [];
  return {
    total: facts.length,
    human: facts.filter(isHumanFact).length,
    derived: facts.filter((fact) => fact.provenance?.source === "derived" && !fact.verified).length,
    agent: facts.filter((fact) => fact.provenance?.source === "agent" && !fact.verified).length,
    verified: facts.filter((fact) => Boolean(fact.verified)).length,
    componentsWithIntent: blueprint?.components.filter((component) => Boolean(component.intent?.trim())).length ?? 0,
    components: blueprint?.components.length ?? 0,
    ratio: humanAuthoredRatio(blueprint)
  };
}
var init_stats = __esm({
  "src/blueprint/stats.ts"() {
    "use strict";
  }
});

// src/blueprint/check.ts
function buildSnapshotModel(files, blueprint, prebuilt) {
  const fileGraph = prebuilt ? filterFileGraph(prebuilt, blueprint.policy.ignore) : buildFileGraph(files, { ignore: blueprint.policy.ignore });
  const membership = assignComponents(fileGraph.files, blueprint);
  return { blueprint, fileGraph, membership, componentGraph: buildComponentGraph(fileGraph, membership) };
}
function reconstructBaseSnapshot(headFiles, changes, baseFiles = []) {
  const byPath = new Map(headFiles.map((file2) => [file2.path, file2]));
  const baseContent = new Map(baseFiles.map((file2) => [file2.path, file2]));
  for (const change of changes) {
    if (change.status === "added") {
      byPath.delete(change.path);
    } else if (change.status === "modified") {
      const base = baseContent.get(change.path);
      if (base) byPath.set(change.path, { path: change.path, content: base.content, size: base.size });
    } else if (change.status === "deleted") {
      const base = baseContent.get(change.path);
      byPath.set(change.path, { path: change.path, content: base?.content ?? null, size: base?.size });
    } else if (change.status === "renamed") {
      const base = change.previousPath && baseContent.get(change.previousPath) || baseContent.get(change.path);
      if (base) byPath.set(change.path, { path: change.path, content: base.content, size: base.size });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}
function scoreFinding(violation, isNew, dependents, agentAuthored) {
  const blast = 1 + Math.log2(1 + Math.max(0, ...violation.components.map((id) => dependents.get(id) ?? 0)));
  const agentBoost = agentAuthored && AGENT_SENSITIVE.has(violation.kind) ? 1.25 : 1;
  const score = SEVERITY_WEIGHT[violation.severity] * (isNew ? 1 : 0.15) * blast * (KIND_BOOST[violation.kind] ?? 1) * agentBoost;
  return Math.round(score * 10) / 10;
}
function changedPathSet(changes) {
  const set2 = /* @__PURE__ */ new Set();
  for (const change of changes) {
    set2.add(change.path);
    if (change.previousPath) set2.add(change.previousPath);
  }
  return set2;
}
function contractFindings(base, head, approved) {
  const changes = diffBlueprints(base, head);
  if (!changes.length) return [];
  const findings = [];
  for (const change of changes.filter((item) => item.weakens)) {
    findings.push({
      id: fingerprint("contract-weakened", change.kind, change.target, change.summary),
      kind: "contract-weakened",
      severity: approved ? "info" : "error",
      title: `Contract weakened: ${change.summary}`,
      message: approved ? "A human approved this contract change." : "This change loosens the rules agents are judged by. It needs explicit human approval (apply the approval label) before merge.",
      components: [],
      locations: [{ path: BLUEPRINT_PATH }]
    });
  }
  const other = changes.filter((item) => !item.weakens);
  if (other.length) {
    findings.push({
      id: fingerprint("contract-changed", other.map((item) => `${item.kind}:${item.target}`).join("|")),
      kind: "contract-changed",
      severity: "info",
      title: `Blueprint updated: ${plural(other.length, "change")}`,
      message: other.slice(0, 12).map((item) => item.summary).join("; ") + (other.length > 12 ? "; …" : ""),
      components: [],
      locations: [{ path: BLUEPRINT_PATH }]
    });
  }
  return findings;
}
function ruleReferencedComponents(blueprint) {
  const referenced = /* @__PURE__ */ new Set();
  const selectorsOf = (rule) => {
    switch (rule.kind) {
      case "forbid":
      case "allow-only":
        return [rule.from, rule.to];
      case "layers":
        return rule.layers;
      case "no-cycles":
        return rule.scope ? [rule.scope] : [];
      case "secret-access":
        return [rule.allow];
      case "protect":
        return [];
    }
  };
  for (const rule of blueprint.rules) {
    for (const selector of selectorsOf(rule)) {
      const resolved = resolveSelector(selector, blueprint);
      for (const component of blueprint.components) {
        if (resolved.components.has(component.id) || resolved.excludeComponents.has(component.id)) referenced.add(component.id);
      }
    }
  }
  return referenced;
}
function membershipMoves(base, head, files, approved) {
  const constrained = ruleReferencedComponents(base);
  if (!constrained.size) return [];
  const before = assignComponents(files, base).fileToComponent;
  const after = assignComponents(files, head).fileToComponent;
  const moves = /* @__PURE__ */ new Map();
  for (const path of files) {
    const from = before.get(path);
    if (!from || !constrained.has(from)) continue;
    const to = after.get(path) ?? "(unmapped)";
    if (to === from) continue;
    const key = `${from}\0${to}`;
    moves.set(key, [...moves.get(key) ?? [], path]);
  }
  const names = new Map([...base.components, ...head.components].map((component) => [component.id, component.name]));
  return [...moves.entries()].map(([key, paths]) => {
    const [from, to] = key.split("\0");
    const summary = `${plural(paths.length, "file")} moved out of "${names.get(from) ?? from}" (constrained by rules) into ${to === "(unmapped)" ? "no component" : `"${names.get(to) ?? to}"`}`;
    return {
      id: fingerprint("contract-weakened", "membership", from, to, paths.join("|")),
      kind: "contract-weakened",
      severity: approved ? "info" : "error",
      title: `Contract weakened: ${summary}`,
      message: approved ? "A human approved this contract change." : "Moving files out of a component removes them from the rules that constrain it. This needs explicit human approval before merge.",
      components: to === "(unmapped)" ? [from] : [from, to],
      locations: [{ path: BLUEPRINT_PATH }, ...paths.slice(0, 20).map((path) => ({ path }))]
    };
  });
}
function literalPrefix(glob) {
  const cut = glob.search(/[*?[{]/);
  const literal2 = (cut < 0 ? glob : glob.slice(0, cut)).replace(/^\.?\//, "");
  return literal2.slice(0, literal2.lastIndexOf("/") + 1);
}
function claimedPaths(base, head, alreadyReported, approved) {
  const constrained = ruleReferencedComponents(base);
  const baseById = new Map(base.components.map((component) => [component.id, component]));
  const findings = [];
  for (const component of head.components) {
    if (component.external || constrained.has(component.id)) continue;
    const before = baseById.get(component.id);
    const newGlobs = component.paths.filter((glob) => !before?.paths.includes(glob));
    for (const targetId of constrained) {
      const target = baseById.get(targetId);
      if (!target || target.id === component.id || alreadyReported.has(`${targetId}\0${component.id}`)) continue;
      const inside = newGlobs.filter((glob) => {
        const prefix = literalPrefix(glob);
        return target.paths.some((outer) => {
          const outerPrefix = literalPrefix(outer);
          return prefix.length > outerPrefix.length && prefix.startsWith(outerPrefix);
        });
      });
      if (!inside.length) continue;
      const coveredBySameRules = base.rules.every((rule) => {
        const headRule = head.rules.find((candidate) => candidate.id === rule.id);
        const selects = (blueprint, candidate, id) => {
          if (!candidate) return false;
          const selectors = candidate.kind === "forbid" || candidate.kind === "allow-only" ? [candidate.from, candidate.to] : candidate.kind === "layers" ? candidate.layers : candidate.kind === "secret-access" ? [candidate.allow] : candidate.kind === "no-cycles" && candidate.scope ? [candidate.scope] : [];
          return selectors.some((selector) => resolveSelector(selector, blueprint).components.has(id));
        };
        return !selects(base, rule, targetId) || selects(head, headRule, component.id);
      });
      if (coveredBySameRules) continue;
      findings.push({
        id: fingerprint("contract-weakened", "claim", component.id, targetId, inside.join("|")),
        kind: "contract-weakened",
        severity: approved ? "info" : "error",
        title: `Contract weakened: "${component.name}" claims ${inside.join(", ")} inside rule-constrained "${target.name}"`,
        message: approved ? "A human approved this contract change." : `Files under ${inside.join(", ")} would belong to "${component.name}" instead of "${target.name}" and escape the rules that constrain it. Add the new component to those rules, or get explicit human approval.`,
        components: [targetId, component.id],
        locations: [{ path: BLUEPRINT_PATH }]
      });
    }
  }
  return findings;
}
function tripwireFindings(changes, judge) {
  const protectRules = (judge?.rules ?? []).filter((rule) => rule.kind === "protect").map((rule) => ({ id: rule.id, paths: rule.paths, severity: rule.severity, reason: rule.reason }));
  const hits = matchTripwires(changes, {
    defaults: judge?.policy.tripwires.defaults ?? true,
    extra: judge?.policy.tripwires.paths,
    protectRules
  }).filter((hit) => !(hit.path === BLUEPRINT_PATH && !hit.ruleId)).map((hit) => {
    const change = changes.find((item) => item.path === hit.path);
    const committedEnv = hit.category === "secrets" && COMMITTED_ENV_FILE.test(hit.path) && !ENV_TEMPLATE.test(hit.path) && change?.status !== "deleted";
    return committedEnv ? { ...hit, severity: "error", reason: "An environment file was committed. It may hold live credentials: remove it from the repository, add it to .gitignore and rotate any keys it contained." } : hit;
  });
  const groups = /* @__PURE__ */ new Map();
  for (const hit of hits) {
    const key = `${hit.category}\0${hit.ruleId ?? ""}\0${hit.severity}`;
    groups.set(key, [...groups.get(key) ?? [], hit]);
  }
  const findings = [];
  for (const group of groups.values()) {
    const first = group[0];
    const kind = first.category === "agent-permissions" ? "agent-permission-change" : "protected-path";
    const paths = [...new Set(group.map((hit) => hit.path))].sort();
    const label = first.ruleId ? `rule "${first.ruleId}"` : `${first.category} tripwire`;
    findings.push({
      id: fingerprint(kind, first.category, first.ruleId, paths.join("|")),
      kind,
      severity: first.severity,
      ruleId: first.ruleId,
      title: paths.length === 1 ? `Protected path changed: ${paths[0]}` : `${plural(paths.length, "protected file")} changed (${label})`,
      message: first.reason,
      reason: first.ruleId ? first.reason : void 0,
      components: [],
      locations: paths.slice(0, 50).map((path) => ({ path }))
    });
  }
  return findings;
}
function weakeningFindings(changes) {
  return detectVerificationWeakening(changes).map((signal) => ({
    id: fingerprint("verification-weakened", signal.signal, signal.path, signal.line),
    kind: "verification-weakened",
    severity: signal.severity,
    title: `Verification weakened (${signal.signal}): ${signal.path}`,
    message: signal.message,
    components: [],
    locations: [{ path: signal.path, line: signal.line }]
  }));
}
function reachFindings(reach, changed) {
  const results = [];
  for (const secret of reach.inlineSecrets) {
    results.push({
      isNew: !changed || changed.has(secret.path),
      violation: {
        id: fingerprint("inline-secret", secret.path, secret.location, secret.kind),
        kind: "inline-secret",
        severity: "error",
        title: `Credential committed in ${isAgentConfigPath(secret.path) ? "agent configuration" : "the repository"}: ${secret.path}`,
        message: `${secret.kind} at ${secret.location} (${secret.preview}). Agents and anyone with read access can use it. Move it to an environment variable and rotate it.`,
        components: [],
        locations: [{ path: secret.path, line: secret.line }]
      }
    });
  }
  for (const grant of reach.permissions.filter((item) => item.broad && item.effect === "allow")) {
    const isNew = !changed || changed.has(grant.path);
    results.push({
      isNew,
      violation: {
        id: fingerprint("agent-permission-change", grant.path, grant.rule),
        kind: "agent-permission-change",
        severity: changed && isNew ? "warning" : "info",
        title: `Broad agent permission: ${grant.rule}`,
        message: `${grant.agent} is granted "${grant.rule}" in ${grant.path} without constraints. Broad grants are how agents reach production credentials and data.`,
        components: [],
        locations: [{ path: grant.path }]
      }
    });
  }
  return results;
}
function invariantFindings(judge, touched, changedPaths, results) {
  const findings = [];
  const resultById = new Map((results ?? []).map((result) => [result.id, result]));
  for (const invariant of judge.invariants) {
    const result = resultById.get(invariant.id);
    if (result && !result.ok) {
      findings.push({
        id: fingerprint("invariant-failed", invariant.id),
        kind: "invariant-failed",
        severity: invariant.severity ?? "error",
        title: `Invariant failed: ${invariant.statement}`,
        message: `Check \`${invariant.check?.run ?? "(none)"}\` failed. ${result.output.slice(-600)}`,
        components: invariant.components ?? [],
        locations: [{ path: BLUEPRINT_PATH }]
      });
      continue;
    }
    if (!changedPaths) continue;
    const touchesComponent = (invariant.components ?? []).some((id) => touched.has(id));
    const touchesTests = (invariant.check?.tests ?? []).length > 0 && [...changedPaths].some((path) => (invariant.check?.tests ?? []).some((pattern2) => compileGlob(pattern2).test(path)));
    if (touchesComponent || touchesTests) {
      findings.push({
        id: fingerprint("invariant-at-risk", invariant.id),
        kind: "invariant-at-risk",
        severity: "info",
        title: `Invariant in scope: ${invariant.statement}`,
        message: invariant.check?.run ? `This change touches code the invariant covers. Verify with \`${invariant.check.run}\`.` : "This change touches code the invariant covers. Confirm it still holds.",
        components: invariant.components ?? [],
        locations: [{ path: BLUEPRINT_PATH }]
      });
    }
  }
  return findings;
}
function runCheck(input) {
  const head = input.blueprint;
  const diffMode = Array.isArray(input.changes);
  const changes = input.changes ?? [];
  const judge = diffMode ? input.baseBlueprint ?? head : head;
  const changed = diffMode ? changedPathSet(changes) : null;
  const entries2 = [];
  const add = (violations, isNew = () => true) => {
    for (const violation of violations) entries2.push({ violation, isNew: isNew(violation) });
  };
  for (const issue2 of (input.blueprintIssues ?? []).slice(0, 20)) {
    add([{
      id: fingerprint("invalid-blueprint", issue2.path, issue2.message),
      kind: "invalid-blueprint",
      severity: "error",
      title: `Invalid blueprint at ${issue2.path}`,
      message: issue2.message,
      components: [],
      locations: [{ path: BLUEPRINT_PATH }]
    }]);
  }
  let model = null;
  if (judge) {
    model = buildSnapshotModel(input.files, judge, diffMode ? void 0 : input.fileGraph);
    const compiled = compileRules(judge);
    const headViolations = [...evaluateRules(model, compiled), ...evaluatePolicy(model)];
    if (diffMode) {
      const baseModel = buildSnapshotModel(reconstructBaseSnapshot(input.files, changes, input.baseFiles), judge);
      const baseViolations = [...evaluateRules(baseModel, compiled), ...evaluatePolicy(baseModel)];
      const baseIds = new Set(baseViolations.map((violation) => violation.id));
      const baseUnmapped = new Set(baseModel.membership.unmapped);
      const newUnmapped = model.membership.unmapped.filter((path) => model.fileGraph.facts.has(path) && !baseUnmapped.has(path));
      add(headViolations, (violation) => violation.kind !== "unmapped-file" && !baseIds.has(violation.id));
      if (newUnmapped.length && judge.policy.unmappedFiles !== "off") {
        add([{
          id: fingerprint("unmapped-file", "new", newUnmapped.join("|")),
          kind: "unmapped-file",
          severity: judge.policy.unmappedFiles,
          title: `${plural(newUnmapped.length, "new source file")} not claimed by any component`,
          message: "Add these paths to a component in the blueprint so its rules apply to them.",
          components: [],
          locations: newUnmapped.slice(0, 50).map((path) => ({ path }))
        }]);
      }
    } else {
      add(headViolations);
    }
  }
  const fileGraph = model?.fileGraph ?? input.fileGraph ?? buildFileGraph(input.files, {});
  const reach = input.reach ?? analyzeReach(input.files, fileGraph, model?.membership);
  for (const entry of reachFindings(reach, changed)) entries2.push(entry);
  let agentActivity;
  let impact;
  let contractChanges;
  if (diffMode) {
    if (input.commits?.length) agentActivity = detectAgentActivity(input.commits);
    add(tripwireFindings(changes, judge));
    if (judge?.policy.verificationHeuristics ?? true) add(weakeningFindings(changes));
    if (!input.blueprintIssues?.length && (input.baseBlueprint !== void 0 || head)) {
      const base = input.baseBlueprint ?? null;
      contractChanges = diffBlueprints(base, head);
      if (base || head) add(contractFindings(base, head, Boolean(input.approved)));
      if (base && head && model) {
        const moves = membershipMoves(base, head, model.fileGraph.files, Boolean(input.approved));
        add(moves);
        const reported = new Set(moves.map((move) => move.components.join("\0")));
        add(claimedPaths(base, head, reported, Boolean(input.approved)));
      }
    }
    if (model) {
      const changedPaths = [...changedPathSet(changes)];
      impact = computeImpact(changedPaths, judge, model.componentGraph);
      const touched = new Set(impact.touchedComponents.map((item) => item.id));
      for (const path of changedPaths) {
        const owner = componentForPath(path, judge);
        if (owner) touched.add(owner);
      }
      for (const component of judge.components) {
        if (!component.verified || !touched.has(component.id)) continue;
        add([{
          id: fingerprint("stale-verification", component.id, component.verified.commit, component.verified.at),
          kind: "stale-verification",
          severity: "info",
          title: `Sign-off on "${component.name}" is now stale`,
          message: `${component.verified.by} verified this component${component.verified.commit ? ` at ${component.verified.commit.slice(0, 10)}` : ""} on ${component.verified.at}. This change touches it; re-verify with \`rassam verify ${component.id}\`.`,
          components: [component.id],
          locations: [{ path: BLUEPRINT_PATH }]
        }]);
      }
      add(invariantFindings(judge, touched, changed, input.invariantResults));
    }
  } else if (judge && input.invariantResults?.length) {
    add(invariantFindings(judge, /* @__PURE__ */ new Set(), null, input.invariantResults));
  }
  const dependents = model ? dependentCounts(model.componentGraph) : /* @__PURE__ */ new Map();
  const agentAuthored = (agentActivity?.agentCommits ?? 0) > 0;
  const unique = /* @__PURE__ */ new Map();
  for (const { violation, isNew } of entries2) {
    if (unique.has(violation.id)) continue;
    unique.set(violation.id, { ...violation, isNew, score: scoreFinding(violation, isNew, dependents, agentAuthored) });
  }
  const severityRank = { error: 0, warning: 1, info: 2 };
  const findings = [...unique.values()].sort((left, right) => right.score - left.score || severityRank[left.severity] - severityRank[right.severity] || left.id.localeCompare(right.id));
  const membership = model?.membership;
  const declared = new Set((judge?.dependencies ?? []).map((dependency) => `${dependency.from}\0${dependency.to}`));
  const componentById = new Map((judge?.components ?? []).map((component) => [component.id, component]));
  const componentEdges = model?.componentGraph.edges ?? [];
  const undeclaredEdges = componentEdges.filter((edge) => !declared.has(`${edge.from}\0${edge.to}`) && !componentById.get(edge.to)?.public && componentById.get(edge.from)?.kind !== "test");
  return {
    tool: { name: ENGINE_NAME, version: ENGINE_VERSION },
    generatedAt: input.now ?? (/* @__PURE__ */ new Date()).toISOString(),
    mode: diffMode ? "diff" : "full",
    blueprint: {
      path: BLUEPRINT_PATH,
      present: Boolean(head) || Boolean(input.blueprintIssues?.length),
      valid: Boolean(head) && !input.blueprintIssues?.length,
      system: (head ?? judge)?.system.name
    },
    base: input.refs?.base,
    head: input.refs?.head,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      infos: findings.filter((finding) => finding.severity === "info").length,
      newFindings: findings.filter((finding) => finding.isNew).length,
      components: judge?.components.length ?? 0,
      filesAnalyzed: fileGraph.facts.size,
      filesMapped: membership ? [...membership.fileToComponent.keys()].filter((path) => fileGraph.facts.has(path)).length : 0,
      filesUnmapped: membership ? membership.unmapped.filter((path) => fileGraph.facts.has(path)).length : fileGraph.facts.size,
      componentEdges: componentEdges.length,
      undeclaredEdges: undeclaredEdges.length,
      humanAuthoredRatio: humanAuthoredRatio(head ?? judge)
    },
    findings,
    impact,
    contractChanges,
    agentActivity,
    reach,
    approved: diffMode ? Boolean(input.approved) : void 0
  };
}
var SEVERITY_WEIGHT, KIND_BOOST, AGENT_SENSITIVE, COMMITTED_ENV_FILE, ENV_TEMPLATE;
var init_check = __esm({
  "src/blueprint/check.ts"() {
    "use strict";
    init_agents();
    init_blueprint_diff();
    init_schema();
    init_constants();
    init_diff();
    init_glob();
    init_graph();
    init_impact();
    init_imports();
    init_reach();
    init_rules();
    init_selectors();
    init_snapshot();
    init_stats();
    init_util3();
    SEVERITY_WEIGHT = { error: 100, warning: 30, info: 5 };
    KIND_BOOST = {
      "contract-weakened": 1.6,
      "verification-weakened": 1.5,
      "inline-secret": 1.5,
      "invariant-failed": 1.4,
      "secret-access": 1.3,
      "agent-permission-change": 1.3,
      "forbidden-dependency": 1.2,
      "layer-violation": 1.1,
      "allow-only-violation": 1.1,
      "dependency-cycle": 1,
      "invalid-blueprint": 1.5
    };
    AGENT_SENSITIVE = /* @__PURE__ */ new Set([
      "verification-weakened",
      "protected-path",
      "contract-weakened",
      "agent-permission-change"
    ]);
    COMMITTED_ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
    ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/i;
  }
});

// src/cli/invariants.ts
import { spawn as spawn2 } from "node:child_process";
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawn2("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => void 0);
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
  }
}
function runShellCommand(command, options) {
  return new Promise((resolvePromise) => {
    const child2 = spawn2(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      env: { ...process.env, ...options.env, CI: process.env.CI ?? "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let captured = "";
    let timedOut = false;
    let settled = false;
    const collect = (chunk) => {
      captured += chunk.toString("utf8");
      if (captured.length > CAPTURE_LIMIT) captured = captured.slice(-CAPTURE_LIMIT / 2);
    };
    const finish = (ok, suffix = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok, output: tailBytes(`${captured}${suffix}`.trim(), OUTPUT_TAIL_BYTES) });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child2.pid);
      finish(false, `
[rassam] timed out after ${Math.round(options.timeoutMs / 1e3)}s`);
    }, options.timeoutMs);
    child2.stdout.on("data", collect);
    child2.stderr.on("data", collect);
    child2.on("error", (error51) => finish(false, `
[rassam] could not start: ${error51.message}`));
    child2.on("close", (code, signal) => {
      if (timedOut) return;
      finish(code === 0, code === 0 ? "" : `
[rassam] exited with ${signal ? `signal ${signal}` : `code ${code}`}`);
    });
  });
}
async function runInvariants(blueprint, options) {
  const results = [];
  for (const invariant of blueprint?.invariants ?? []) {
    const command = invariant.check?.run;
    if (!command) continue;
    options.onStart?.(invariant.id, command);
    const outcome = await runShellCommand(command, options);
    results.push({ id: invariant.id, ok: outcome.ok, output: outcome.output });
  }
  return results;
}
var OUTPUT_TAIL_BYTES, CAPTURE_LIMIT;
var init_invariants = __esm({
  "src/cli/invariants.ts"() {
    "use strict";
    init_util();
    OUTPUT_TAIL_BYTES = 4 * 1024;
    CAPTURE_LIMIT = 64 * 1024;
  }
});

// src/cli/gate.ts
function basePathsFor(changes) {
  const paths = /* @__PURE__ */ new Set();
  for (const change of changes) {
    if (change.status === "added") continue;
    const path = change.status === "renamed" ? change.previousPath ?? change.path : change.path;
    if (wantsContent(path)) paths.add(path);
  }
  return [...paths];
}
async function loadBaseBlueprint(root, sha) {
  const text3 = await readFileAtRef(root, sha, BLUEPRINT_PATH);
  if (text3 === null) return { blueprint: null, state: "missing" };
  const parsed = parseBlueprintText(text3);
  return parsed.ok ? { blueprint: parsed.blueprint, state: "ok" } : { blueprint: null, state: "invalid" };
}
async function headIdentity(root, override) {
  const sha = override?.sha ?? await headSha(root) ?? void 0;
  const ref = override?.ref ?? await currentBranch(root) ?? "HEAD";
  return { ref, sha };
}
async function diffInput(options, base) {
  const { context } = options;
  if (!context.isGit) {
    throw new CliError("Diff mode (--base) needs a git repository", { hint: "Run rassam check without --base to check the whole working tree." });
  }
  const sha = await mergeBase(context.root, base);
  const changes = await diffAgainst(context.root, sha);
  const baseContents = await readFilesAtRef(context.root, sha, basePathsFor(changes));
  const baseFiles = [...baseContents].map(([path, content]) => ({ path, content, size: Buffer.byteLength(content) }));
  const baseBlueprint = await loadBaseBlueprint(context.root, sha);
  const commits = await resolveRef2(context.root, "HEAD") ? await commitsBetween(context.root, sha, "HEAD") : [];
  if (baseBlueprint.state === "invalid") options.note?.(`The blueprint at the merge-base (${sha.slice(0, 12)}) is invalid; this change is judged without a base contract.`);
  return {
    sha,
    state: baseBlueprint.state,
    input: {
      baseBlueprint: baseBlueprint.blueprint,
      changes,
      baseFiles,
      commits,
      refs: { base: { ref: base, sha }, head: await headIdentity(context.root, options.head) }
    }
  };
}
async function runGate(options) {
  const { context } = options;
  const input = {
    files: context.files,
    blueprint: context.blueprint,
    blueprintIssues: context.blueprintState === "invalid" ? context.blueprintIssues : void 0,
    approved: options.approved
  };
  let result = { mode: "full" };
  if (options.base) {
    const diff = await diffInput(options, options.base);
    Object.assign(input, diff.input);
    result = { mode: "diff", mergeBase: diff.sha, baseBlueprint: diff.state };
  } else if (context.isGit) {
    input.refs = { head: await headIdentity(context.root, options.head) };
  }
  let invariantsRun = 0;
  if (options.runInvariants) {
    const contract = options.base ? input.baseBlueprint ?? null : context.blueprint;
    input.invariantResults = await runInvariants(contract, {
      cwd: context.root,
      timeoutMs: options.invariantTimeoutMs ?? DEFAULT_INVARIANT_TIMEOUT_MS,
      onStart: (id, command) => options.note?.(`Running invariant ${id}: ${command}`)
    });
    invariantsRun = input.invariantResults.length;
  }
  return { ...result, report: runCheck(input), invariantsRun };
}
var DEFAULT_INVARIANT_TIMEOUT_MS;
var init_gate = __esm({
  "src/cli/gate.ts"() {
    "use strict";
    init_check();
    init_schema();
    init_fs_source();
    init_git();
    init_io();
    init_invariants();
    DEFAULT_INVARIANT_TIMEOUT_MS = 3e5;
  }
});

// src/cli/github.ts
import { appendFile, readFile as readFile2 } from "node:fs/promises";
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
async function readEvent(path) {
  if (!path) return {};
  try {
    return asObject(JSON.parse(await readFile2(path, "utf8"))) ?? {};
  } catch {
    return {};
  }
}
function labelNames(value) {
  if (!Array.isArray(value)) return [];
  return value.map((label) => asString(asObject(label)?.name)).filter((name) => Boolean(name));
}
async function readGithubContext(env) {
  const event = await readEvent(env.GITHUB_EVENT_PATH);
  const pr = asObject(event.pull_request);
  const base = asObject(pr?.base);
  const head = asObject(pr?.head);
  const repo = asObject(event.repository);
  const repository = asString(repo?.full_name) ?? asString(env.GITHUB_REPOSITORY);
  const headRepo = asString(asObject(head?.repo)?.full_name);
  const server = (env.GITHUB_SERVER_URL ?? "https://github.com").replace(/\/+$/, "");
  const number4 = typeof pr?.number === "number" ? pr.number : typeof event.number === "number" && pr ? event.number : void 0;
  return {
    eventName: env.GITHUB_EVENT_NAME ?? "",
    isPullRequest: Boolean(pr),
    prNumber: number4,
    baseRef: asString(base?.ref) ?? asString(env.GITHUB_BASE_REF),
    baseSha: asString(base?.sha),
    headRef: asString(head?.ref) ?? asString(env.GITHUB_HEAD_REF),
    headSha: asString(head?.sha) ?? asString(env.GITHUB_SHA),
    labels: labelNames(pr?.labels),
    repository,
    repoHtmlUrl: asString(repo?.html_url) ?? (repository ? `${server}/${repository}` : void 0),
    isFork: Boolean(headRepo && repository && headRepo !== repository),
    apiUrl: (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, ""),
    token: asString(env.GITHUB_TOKEN),
    stepSummaryPath: asString(env.GITHUB_STEP_SUMMARY)
  };
}
function hasApprovalLabel(context, label) {
  const wanted = label.trim().toLowerCase();
  return wanted.length > 0 && context.labels.some((name) => name.trim().toLowerCase() === wanted);
}
function truncate(text3, limit, notice) {
  return text3.length <= limit ? text3 : `${text3.slice(0, limit - notice.length - 2)}

${notice}`;
}
async function writeStepSummary(context, markdown2) {
  if (!context.stepSummaryPath) return false;
  const body = truncate(markdown2, STEP_SUMMARY_LIMIT, "_Report truncated._");
  await appendFile(context.stepSummaryPath, body.endsWith("\n") ? body : `${body}
`, "utf8");
  return true;
}
async function api(context, deps, method, path, body) {
  const response = await deps.fetch(`${context.apiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${context.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rassam-blueprint",
      ...body === void 0 ? {} : { "Content-Type": "application/json" }
    },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GithubApiError(response.status, `GitHub API ${method} ${path} → ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return { data: await response.json().catch(() => null), link: response.headers.get("link") };
}
async function findStickyComment(context, deps, marker) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = `/repos/${context.repository}/issues/${context.prNumber}/comments?per_page=${PER_PAGE}&page=${page}`;
    const { data, link } = await api(context, deps, "GET", path);
    const comments = Array.isArray(data) ? data : [];
    for (const comment of comments) {
      const entry = asObject(comment);
      if (typeof entry?.id === "number" && typeof entry.body === "string" && entry.body.includes(marker)) return entry.id;
    }
    const hasNext = link ? /rel="next"/.test(link) : comments.length === PER_PAGE;
    if (!hasNext) break;
  }
  return null;
}
function skipReason(context, error51) {
  if (error51 instanceof GithubApiError && (error51.status === 403 || error51.status === 404 || error51.status === 401)) {
    const why = context.isFork ? "pull requests from forks get a read-only token" : 'the job needs "permissions: pull-requests: write"';
    return `GitHub refused the comment (${error51.status}): ${why}. The report is still in the job summary.`;
  }
  return `Could not post the PR comment: ${errorMessage(error51)}`;
}
async function upsertStickyComment(context, markdown2, marker, deps) {
  if (!context.token) return { action: "skipped", reason: "GITHUB_TOKEN is not set" };
  if (!context.repository || !context.prNumber) return { action: "skipped", reason: "not a pull request event" };
  const withMarker = markdown2.includes(marker) ? markdown2 : `${marker}
${markdown2}`;
  const body = truncate(withMarker, COMMENT_LIMIT, "_Report truncated; see the job summary for the full report._");
  try {
    const existing = await findStickyComment(context, deps, marker);
    const result = existing === null ? await api(context, deps, "POST", `/repos/${context.repository}/issues/${context.prNumber}/comments`, { body }) : await api(context, deps, "PATCH", `/repos/${context.repository}/issues/comments/${existing}`, { body });
    return { action: existing === null ? "created" : "updated", url: asString(asObject(result.data)?.html_url) };
  } catch (error51) {
    const reason = skipReason(context, error51);
    deps.warn(reason);
    return { action: "skipped", reason };
  }
}
var STEP_SUMMARY_LIMIT, COMMENT_LIMIT, GithubApiError, PER_PAGE, MAX_PAGES;
var init_github = __esm({
  "src/cli/github.ts"() {
    "use strict";
    init_util();
    STEP_SUMMARY_LIMIT = 1e6;
    COMMENT_LIMIT = 65e3;
    GithubApiError = class extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    };
    PER_PAGE = 100;
    MAX_PAGES = 30;
  }
});

// src/cli/commands/check.ts
var check_exports = {};
__export(check_exports, {
  checkCommand: () => checkCommand
});
import { mkdir as mkdir2, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname3, resolve as resolve3 } from "node:path";
function asText(value) {
  return ensureTrailingNewline(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}
function colorEnabled(args, io) {
  if (args.flags.color === false || stringFlag(args, "output")) return false;
  if (io.env.NO_COLOR !== void 0 && io.env.NO_COLOR !== "") return false;
  return io.isTTY;
}
async function writeOutput(io, file2, text3) {
  const target = resolve3(io.cwd, file2);
  await mkdir2(dirname3(target), { recursive: true });
  await writeFile2(target, text3, "utf8");
}
async function githubBaseRef(context, github, io) {
  if (!github.isPullRequest || !github.baseRef) return void 0;
  const remoteRef = `origin/${github.baseRef}`;
  if (!context.isGit) return remoteRef;
  if (await resolveRef2(context.root, remoteRef)) return remoteRef;
  const refspec = `+refs/heads/${github.baseRef}:refs/remotes/origin/${github.baseRef}`;
  const fetched = await runGit(context.root, ["fetch", "--no-tags", "origin", refspec], { allowFailure: true });
  if (fetched.code !== 0) io.stderr(`rassam: could not fetch ${remoteRef}: ${fetched.stderr.split("\n")[0]}
`);
  if (await resolveRef2(context.root, remoteRef)) return remoteRef;
  if (github.baseSha && await resolveRef2(context.root, github.baseSha)) return github.baseSha;
  return remoteRef;
}
function markdown(report, options) {
  const { budget, failOn, github } = options;
  return renderMarkdown(report, { budget, failOn, marker: COMMENT_MARKER, repoUrl: github?.repoHtmlUrl, headSha: report.head?.sha ?? github?.headSha });
}
function render(report, format, options) {
  switch (format) {
    case "json":
      return asText(renderJson(report));
    case "sarif":
      return asText(renderSarif(report));
    case "markdown":
      return asText(markdown(report, options));
    default:
      return asText(renderText(report, { color: options.color, budget: options.budget, verbose: options.verbose, failOn: options.failOn }));
  }
}
async function publishToGithub(report, github, args, io, options, annotationsToStderr) {
  const body = markdown(report, options);
  try {
    await writeStepSummary(github, body);
  } catch (error51) {
    io.stderr(`rassam: could not write the job summary: ${errorMessage(error51)}
`);
  }
  const annotations = renderGithubAnnotations(report, { onlyNew: true });
  if (annotations) (annotationsToStderr ? io.stderr : io.stdout)(ensureTrailingNewline(annotations));
  if (!booleanFlag(args, "comment")) return;
  if (!io.fetch) {
    io.stderr("rassam: fetch is unavailable; skipping the PR comment\n");
    return;
  }
  const result = await upsertStickyComment(github, body, COMMENT_MARKER, {
    fetch: io.fetch,
    warn: (message) => io.stderr(`::warning title=Rassam::${message.replace(/\r?\n/g, " ")}
`)
  });
  if (result.action !== "skipped") io.stderr(`rassam: PR comment ${result.action}${result.url ? `: ${result.url}` : ""}
`);
  else if (!github.token || !github.prNumber) io.stderr(`rassam: PR comment skipped: ${result.reason}
`);
}
function validatedNumbers(args) {
  const budget = numberFlag(args, "budget");
  if (budget !== void 0 && (!Number.isInteger(budget) || budget < 0)) throw new CliError("--budget expects a non-negative whole number");
  const timeoutSeconds = numberFlag(args, "invariantTimeout") ?? 300;
  if (timeoutSeconds <= 0) throw new CliError("--invariant-timeout expects a positive number of seconds");
  return { budget, timeoutSeconds };
}
async function checkCommand(args, io) {
  const format = stringFlag(args, "format") ?? "text";
  const failOn = stringFlag(args, "failOn") ?? "error";
  const output = stringFlag(args, "output");
  const { budget, timeoutSeconds } = validatedNumbers(args);
  const { root, isGit } = await resolveRoot(io, stringFlag(args, "root"));
  const context = await loadContext(root, isGit);
  const github = booleanFlag(args, "github") ? await readGithubContext(io.env) : void 0;
  const base = stringFlag(args, "base") ?? (github ? await githubBaseRef(context, github, io) : void 0);
  const label = stringFlag(args, "approveLabel") ?? "rassam:approved";
  const approved = booleanFlag(args, "approved") || Boolean(github && hasApprovalLabel(github, label));
  const gate = await runGate({
    context,
    base,
    approved,
    runInvariants: booleanFlag(args, "runInvariants"),
    invariantTimeoutMs: timeoutSeconds * 1e3,
    head: github?.isPullRequest ? { ref: github.headRef, sha: github.headSha } : void 0,
    note: (message) => io.stderr(`rassam: ${message}
`)
  });
  const { report } = gate;
  const options = { color: colorEnabled(args, io), budget, verbose: booleanFlag(args, "verbose"), failOn, github };
  const rendered = render(report, format, options);
  if (output) await writeOutput(io, output, rendered);
  else io.stdout(rendered);
  const sarifOutput = stringFlag(args, "sarifOutput");
  if (sarifOutput) await writeOutput(io, sarifOutput, asText(renderSarif(report)));
  if (github) await publishToGithub(report, github, args, io, options, !output && (format === "json" || format === "sarif"));
  if (context.blueprintState === "missing" && gate.mode === "full") {
    io.stderr(`rassam: no blueprint at ${BLUEPRINT_PATH}; nothing constrains this repository yet. Create a draft with: rassam init
`);
  }
  if (context.blueprintState === "invalid" && gate.mode === "full") {
    io.stderr(`rassam: ${BLUEPRINT_PATH} is invalid:
${formatIssues(context.blueprintIssues)}
`);
    return EXIT_USAGE;
  }
  return exitCodeFor(report, failOn);
}
var init_check2 = __esm({
  "src/cli/commands/check.ts"() {
    "use strict";
    init_report();
    init_schema();
    init_args();
    init_context();
    init_gate();
    init_git();
    init_github();
    init_io();
    init_util();
  }
});

// src/blueprint/workspace.ts
function summarizeRule(rule) {
  switch (rule.kind) {
    case "forbid":
      return `${describeSelector(rule.from)} must not depend on ${describeSelector(rule.to)}`;
    case "allow-only":
      return `${describeSelector(rule.from)} may only depend on ${describeSelector(rule.to)}`;
    case "layers":
      return `layers (top → bottom): ${rule.layers.map((layer) => describeSelector(layer)).join(" → ")}`;
    case "no-cycles":
      return `no dependency cycles${rule.scope ? ` within ${describeSelector(rule.scope)}` : ""}`;
    case "protect":
      return `changes to ${rule.paths.join(", ")} need human review`;
    case "secret-access":
      return `${rule.secrets.join(", ")} may only be read by ${describeSelector(rule.allow)}`;
  }
}
function toRuleSummary(rule) {
  return {
    id: rule.id,
    kind: rule.kind,
    severity: ruleSeverity2(rule),
    summary: summarizeRule(rule),
    reason: rule.reason,
    human: Boolean(rule.verified) || !rule.provenance || rule.provenance.source === "human"
  };
}
function ruleSelectors3(rule) {
  switch (rule.kind) {
    case "forbid":
    case "allow-only":
      return [rule.from, rule.to];
    case "layers":
      return rule.layers;
    case "no-cycles":
      return rule.scope ? [rule.scope] : [];
    case "secret-access":
      return [rule.allow];
    case "protect":
      return [];
  }
}
function ruleTouchesComponent(rule, blueprint, componentId) {
  return ruleSelectors3(rule).some((selector) => selectorComponentRefs(selector).includes(componentId) || matchesComponent(resolveSelector(selector, blueprint), componentId));
}
function firstLine(value) {
  const line = value?.split(/\r?\n/).map((part) => part.trim()).find(Boolean);
  return line ? line.length > 200 ? `${line.slice(0, 197)}…` : line : null;
}
function createWorkspace(files, blueprint, options = {}) {
  const model = blueprint ? buildSnapshotModel(files, blueprint, options.fileGraph) : null;
  const fileGraph = model?.fileGraph ?? options.fileGraph ?? buildFileGraph(files, {});
  const membership = model?.membership ?? assignComponents(fileGraph.files, null);
  const componentGraph = model?.componentGraph ?? buildComponentGraph(fileGraph, membership);
  const compiled = blueprint ? compileRules(blueprint) : [];
  const labels = createLabeler(blueprint);
  const fileSet = new Set(fileGraph.files);
  const componentById = new Map((blueprint?.components ?? []).map((component) => [component.id, component]));
  const declared = new Set((blueprint?.dependencies ?? []).map((dependency) => `${dependency.from}\0${dependency.to}`));
  const componentOf = (path) => {
    const normalized = repoPath(path);
    return membership.fileToComponent.get(normalized) ?? (blueprint ? assignComponents([normalized], blueprint).fileToComponent.get(normalized) ?? null : null);
  };
  const representative = (componentId) => membership.componentFiles.get(componentId)?.[0] ?? null;
  const observedNeighbors = (componentId) => ({
    dependsOn: componentGraph.edges.filter((edge) => edge.from === componentId),
    dependents: componentGraph.edges.filter((edge) => edge.to === componentId)
  });
  const invariantsFor = (componentId) => (blueprint?.invariants ?? []).filter((invariant) => componentId !== null && (invariant.components ?? []).includes(componentId)).map((invariant) => ({ id: invariant.id, statement: invariant.statement, check: invariant.check?.run }));
  const decisionsFor = (componentId) => (blueprint?.decisions ?? []).filter((decision) => componentId !== null && (decision.components ?? []).includes(componentId)).map((decision) => ({ id: decision.id, title: decision.title, status: decision.status }));
  const protectionFor = (path) => {
    const reasons = [];
    if (blueprint?.policy.tripwires.defaults ?? true) {
      const hit = DEFAULT_TRIPWIRES.find((tripwire) => compileGlob(tripwire.glob).test(path));
      if (hit) reasons.push(hit.reason);
    }
    for (const pattern2 of blueprint?.policy.tripwires.paths ?? []) {
      if (compileGlob(pattern2).test(path)) reasons.push(`Protected by blueprint policy (${pattern2}).`);
    }
    for (const rule of blueprint?.rules ?? []) {
      if (rule.kind === "protect" && rule.paths.some((pattern2) => compileGlob(pattern2).test(path))) {
        reasons.push(rule.reason ? `${rule.reason} (rule "${rule.id}")` : `Protected by rule "${rule.id}".`);
      }
    }
    return reasons;
  };
  const resolveTarget = (fromPath, target) => {
    const trimmed = target.trim();
    const asComponent = trimmed.startsWith("component:") ? trimmed.slice("component:".length) : trimmed;
    if (componentById.has(asComponent) && !fileSet.has(trimmed)) {
      const file2 = representative(asComponent);
      return { kind: "internal", path: file2 ?? asComponent, component: asComponent, exists: Boolean(file2) };
    }
    let candidate = null;
    if (trimmed.startsWith("./") || trimmed.startsWith("../")) candidate = join(dirname(fromPath), trimmed);
    else if (fileSet.has(repoPath(trimmed)) || /\//.test(trimmed) && /\.[A-Za-z0-9]+$/.test(trimmed) && !trimmed.startsWith("@")) candidate = repoPath(trimmed);
    else if (trimmed.startsWith("@/")) candidate = `src/${trimmed.slice(2)}`;
    if (candidate !== null) {
      const resolved = [candidate, ...RESOLVE_EXTENSIONS.map((ext) => `${candidate}${ext}`), ...RESOLVE_EXTENSIONS.map((ext) => `${candidate}/index${ext}`)].find((option) => fileSet.has(option));
      const finalPath = resolved ?? candidate;
      return { kind: "internal", path: finalPath, component: componentOf(finalPath), exists: Boolean(resolved) };
    }
    const language = languageOf(fromPath) ?? "typescript";
    return { kind: "external", pkg: normalizePackageName(trimmed, language) };
  };
  const checkDependency = (rawFrom, target) => {
    const fromPath = repoPath(rawFrom);
    const from = { path: fromPath, component: componentOf(fromPath) };
    const resolved = resolveTarget(fromPath, target);
    const hits = edgeRuleHits(compiled, from, resolved, false, labels);
    const undeclaredSeverity = blueprint?.policy.undeclaredDependencies ?? "off";
    const undeclared = resolved.kind === "internal" && from.component !== null && resolved.component !== null && from.component !== resolved.component && componentById.get(from.component)?.kind !== "test" && !componentById.get(resolved.component)?.public && !declared.has(`${from.component}\0${resolved.component}`) && undeclaredSeverity !== "off";
    const violations = hits.map((hit) => ({
      ruleId: hit.rule.id,
      kind: hit.kind,
      severity: hit.severity,
      title: hit.title,
      explanation: hit.explanation,
      reason: hit.rule.reason
    }));
    const targetDescription = resolved.kind === "internal" ? `${resolved.path} (${labels.component(resolved.component)})` : `package ${resolved.pkg}`;
    let note;
    if (!blueprint) note = "No blueprint found; nothing constrains this dependency. Run `rassam init` to create one.";
    else if (violations.length) note = `Not allowed: ${violations.map((violation) => violation.title).join("; ")}. Do not add this dependency. If the task truly requires it, call report_conflict or propose_change instead of working around the rule.`;
    else if (undeclared) note = `Allowed by the rules, but ${labels.component(from.component)} → ${labels.component(resolved.kind === "internal" ? resolved.component : null)} is not a declared dependency (policy: ${undeclaredSeverity}). Prefer existing declared paths; if this edge is intended, call propose_change to declare it.`;
    else note = `Allowed: ${fromPath} may depend on ${targetDescription}.`;
    return {
      allowed: violations.length === 0,
      from,
      target: resolved.kind === "internal" ? { kind: "internal", path: resolved.path, component: resolved.component, exists: Boolean(resolved.exists) } : { kind: "external", pkg: resolved.pkg },
      violations,
      undeclared,
      undeclaredSeverity,
      note
    };
  };
  const explainPath = (rawPath) => {
    const path = repoPath(rawPath);
    const componentId = componentOf(path);
    const component = componentId ? componentById.get(componentId) ?? null : null;
    const protectedReasons = protectionFor(path);
    const from = { path, component: componentId };
    const constraints = (blueprint?.rules ?? []).filter((rule) => {
      if (rule.kind === "protect") return rule.paths.some((pattern2) => compileGlob(pattern2).test(path));
      if (rule.kind === "secret-access") return true;
      if (rule.kind === "no-cycles") return !rule.scope || componentId !== null && ruleTouchesComponent(rule, blueprint, componentId);
      if (rule.kind === "layers") return rule.layers.some((layer) => {
        const selector2 = resolveSelector(layer, blueprint);
        return selector2.paths.some((matcher) => matcher.test(path)) || componentId !== null && matchesComponent(selector2, componentId);
      });
      const selector = resolveSelector(rule.from, blueprint);
      return selector.paths.some((matcher) => matcher.test(path)) || componentId !== null && matchesComponent(selector, componentId);
    }).map(toRuleSummary);
    const forbiddenComponents = [];
    const allowedComponents = [];
    let restricted = false;
    for (const other of blueprint?.components ?? []) {
      if (other.id === componentId) continue;
      const file2 = representative(other.id);
      if (!file2 && !other.external) continue;
      const hits = edgeRuleHits(compiled, from, { kind: "internal", path: file2 ?? other.id, component: other.id }, false, labels);
      if (hits.some((hit) => hit.kind === "allow-only-violation")) restricted = true;
      if (hits.length) forbiddenComponents.push(other.id);
      else allowedComponents.push(other.id);
    }
    const forbiddenPackages = uniqueSorted(compiled.flatMap((entry) => {
      if (entry.rule.kind !== "forbid" || !("to" in entry)) return [];
      if (!edgeRuleHits([entry], from, { kind: "external", pkg: "\0probe" }, false, labels).length && !entry.to.hasPackages) return [];
      const appliesHere = resolveSelector(entry.rule.from, blueprint);
      const applies = appliesHere.all || appliesHere.paths.some((matcher) => matcher.test(path)) || componentId !== null && matchesComponent(appliesHere, componentId);
      if (!applies) return [];
      return (Array.isArray(entry.rule.to) ? entry.rule.to : [entry.rule.to]).filter((value) => value.startsWith("package:")).map((value) => value.slice("package:".length));
    }));
    const neighbors = componentId ? observedNeighbors(componentId) : { dependsOn: [], dependents: [] };
    const guidanceParts = [];
    if (!blueprint) guidanceParts.push("No blueprint exists yet; run `rassam init`.");
    else if (!component) guidanceParts.push("No component owns this path. New code here is not covered by any rule; ask a human which component it belongs to, or propose a path mapping.");
    else {
      guidanceParts.push(`Owned by "${component.name}" (${component.kind}).`);
      if (component.intent) guidanceParts.push(`Intent: ${firstLine(component.intent)}`);
      if (forbiddenComponents.length) guidanceParts.push(`Must not depend on: ${forbiddenComponents.map((id) => labels.component(id)).join(", ")}.`);
      if (restricted) guidanceParts.push(`May only depend on: ${allowedComponents.map((id) => labels.component(id)).join(", ") || "nothing outside itself"}.`);
      if (forbiddenPackages.length) guidanceParts.push(`Forbidden packages: ${forbiddenPackages.join(", ")}.`);
    }
    if (protectedReasons.length) guidanceParts.push(`Protected: changes here need human review (${protectedReasons[0]}). Do not weaken tests or checks to make a task pass.`);
    return {
      path,
      exists: fileSet.has(path),
      component: component ? {
        id: component.id,
        name: component.name,
        kind: component.kind,
        description: component.description,
        intent: component.intent,
        owners: component.owners,
        assurance: component.assurance,
        verified: component.verified,
        external: component.external
      } : null,
      protected: protectedReasons.length > 0,
      protectedReasons,
      constraints,
      allowedComponents: restricted ? allowedComponents : null,
      forbiddenComponents,
      forbiddenPackages,
      invariants: invariantsFor(componentId),
      decisions: decisionsFor(componentId),
      dependsOn: neighbors.dependsOn.map((edge) => edge.to),
      dependents: neighbors.dependents.map((edge) => edge.from),
      guidance: guidanceParts.join(" ")
    };
  };
  const componentSummary = (id) => {
    const component = componentById.get(id);
    if (!component || !blueprint) return null;
    const files2 = membership.componentFiles.get(id) ?? [];
    const neighbors = observedNeighbors(id);
    const merge2 = (observed, declaredIds, side) => {
      const ids = uniqueSorted([...observed.map((edge) => edge[side]), ...declaredIds]);
      return ids.map((other) => {
        const edge = observed.find((candidate) => candidate[side] === other);
        return { id: other, declared: declaredIds.includes(other), observed: Boolean(edge), imports: edge?.count ?? 0 };
      });
    };
    const envByName = /* @__PURE__ */ new Map();
    for (const ref of componentGraph.env.get(id) ?? []) {
      const entry = envByName.get(ref.name) ?? { name: ref.name, secretLike: ref.secretLike, files: /* @__PURE__ */ new Set() };
      entry.files.add(ref.file);
      envByName.set(ref.name, entry);
    }
    return {
      component,
      files: files2,
      fileCount: files2.length,
      dependsOn: merge2(neighbors.dependsOn, blueprint.dependencies.filter((dependency) => dependency.from === id).map((dependency) => dependency.to), "to"),
      dependents: merge2(neighbors.dependents, blueprint.dependencies.filter((dependency) => dependency.to === id).map((dependency) => dependency.from), "from"),
      externals: componentGraph.externals.get(id) ?? [],
      env: [...envByName.values()].map((entry) => ({ name: entry.name, secretLike: entry.secretLike, files: [...entry.files].sort() })).sort((left, right) => left.name.localeCompare(right.name)),
      tests: componentGraph.tests.get(id) ?? [],
      rules: blueprint.rules.filter((rule) => ruleTouchesComponent(rule, blueprint, id)).map(toRuleSummary),
      invariants: invariantsFor(id),
      decisions: decisionsFor(id)
    };
  };
  const overview = () => ({
    system: blueprint?.system ?? null,
    components: (blueprint?.components ?? []).map((component) => ({
      id: component.id,
      name: component.name,
      kind: component.kind,
      external: Boolean(component.external),
      fileCount: membership.componentFiles.get(component.id)?.length ?? 0,
      intent: firstLine(component.intent),
      verified: Boolean(component.verified),
      assurance: component.assurance ?? "unknown"
    })),
    rules: (blueprint?.rules ?? []).map(toRuleSummary),
    invariants: blueprint?.invariants.length ?? 0,
    decisions: blueprint?.decisions.length ?? 0,
    dependencies: blueprint?.dependencies.length ?? 0,
    policy: blueprint?.policy ?? null,
    filesAnalyzed: fileGraph.facts.size,
    unmappedSourceFiles: membership.unmapped.filter((path) => fileGraph.facts.has(path)).length,
    authorship: authorshipStats(blueprint)
  });
  const graphView = () => {
    if (!blueprint || !model) return { components: [], edges: [] };
    const violations = evaluateRules(model, compiled);
    const forbiddenPairs = /* @__PURE__ */ new Set();
    const findingCounts = /* @__PURE__ */ new Map();
    for (const violation of violations) {
      if (violation.components.length >= 2) forbiddenPairs.add(`${violation.components[0]}\0${violation.components[1]}`);
      for (const id of violation.components) findingCounts.set(id, (findingCounts.get(id) ?? 0) + 1);
    }
    const edges = componentGraph.edges.map((edge) => {
      const key = `${edge.from}\0${edge.to}`;
      const open2 = declared.has(key) || Boolean(componentById.get(edge.to)?.public) || componentById.get(edge.from)?.kind === "test";
      const status = forbiddenPairs.has(key) ? "forbidden" : open2 ? "declared" : "undeclared";
      return { from: edge.from, to: edge.to, status, count: edge.count };
    });
    const observed = new Set(componentGraph.edges.map((edge) => `${edge.from}\0${edge.to}`));
    for (const dependency of blueprint.dependencies) {
      if (!observed.has(`${dependency.from}\0${dependency.to}`)) edges.push({ from: dependency.from, to: dependency.to, status: "missing" });
    }
    return {
      components: blueprint.components.map((component) => ({
        id: component.id,
        name: component.name,
        kind: component.kind,
        external: Boolean(component.external),
        findings: findingCounts.get(component.id) ?? 0
      })),
      edges
    };
  };
  return {
    blueprint,
    files,
    fileGraph,
    componentGraph,
    componentOf,
    explainPath,
    checkDependency,
    impact: (changed) => computeImpact(changed.map((path) => repoPath(path)), blueprint, componentGraph),
    componentSummary,
    overview,
    graphView,
    check: (extra = {}) => runCheck({ files, blueprint, fileGraph: options.fileGraph, reach: options.reach, ...extra })
  };
}
var RESOLVE_EXTENSIONS;
var init_workspace = __esm({
  "src/blueprint/workspace.ts"() {
    "use strict";
    init_check();
    init_constants();
    init_glob();
    init_graph();
    init_impact();
    init_imports();
    init_paths();
    init_rules();
    init_selectors();
    init_schema();
    init_stats();
    init_util3();
    RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".go", ".rs", ".java", ".kt"];
  }
});

// src/cli/format.ts
function renderJsonText(value) {
  return `${JSON.stringify(value ?? null, null, 2)}
`;
}
var init_format = __esm({
  "src/cli/format.ts"() {
    "use strict";
  }
});

// src/cli/repo-path.ts
import { isAbsolute, relative, resolve as resolve4 } from "node:path";
function toRepoPath(root, cwd, value) {
  const cleaned = value.trim().split("\\").join("/");
  const absolute = isAbsolute(cleaned) ? resolve4(cleaned) : resolve4(cwd, cleaned);
  const rel2 = relative(root, absolute);
  if (isAbsolute(rel2) || rel2 === ".." || rel2.startsWith("../") || rel2.startsWith("..\\")) return null;
  return rel2.split("\\").join("/");
}
var init_repo_path = __esm({
  "src/cli/repo-path.ts"() {
    "use strict";
  }
});

// src/cli/commands/query.ts
var query_exports = {};
__export(query_exports, {
  explainCommand: () => explainCommand,
  graphCommand: () => graphCommand,
  impactCommand: () => impactCommand,
  reachCommand: () => reachCommand,
  renderExplanation: () => renderExplanation,
  renderImpact: () => renderImpact,
  renderReach: () => renderReach
});
function workspaceOf(context) {
  return createWorkspace(context.files, context.blueprint);
}
function noteMissingBlueprint(context, io) {
  if (context.blueprintState === "missing") io.stderr(`rassam: no blueprint at ${BLUEPRINT_PATH}; showing observed structure only. Create a draft with: rassam init
`);
}
function repoPathArg(context, io, value) {
  const path = toRepoPath(context.root, io.cwd, value);
  if (path === null) throw new CliError(`"${value}" is outside the repository at ${context.root}`);
  return path;
}
function bullets(heading, items) {
  return items.length ? [`${heading}:`, ...items.map((item) => `  - ${item}`), ""] : [];
}
function ruleLine(rule) {
  const reason = rule.reason ? `
      why: ${rule.reason.replace(/\s+/g, " ").trim()}` : "";
  return `[${rule.severity}] ${rule.id} (${rule.kind}${rule.human ? ", human-authored" : ""}): ${rule.summary}${reason}`;
}
function indentBlock(text3, pad) {
  return text3.trim().split("\n").map((line) => `${pad}${line.trimEnd()}`);
}
function renderExplanation(explanation) {
  const { component } = explanation;
  const lines = [`${explanation.path}${explanation.exists ? "" : "  (not in the working tree)"}`, ""];
  if (component) {
    const signed = component.verified ? `verified by ${component.verified.by} on ${component.verified.at}` : "not verified by a human";
    lines.push(`Component: ${component.name} (${component.id}, ${component.kind})`, `  ${signed}${component.assurance ? ` · assurance: ${component.assurance}` : ""}`);
    if (component.owners?.length) lines.push(`  owners: ${component.owners.join(", ")}`);
    if (component.intent) lines.push("  intent:", ...indentBlock(component.intent, "    "));
    else if (component.description) lines.push(...indentBlock(component.description, "  "));
    else lines.push("  intent: not written yet");
    lines.push("");
  } else {
    lines.push("Component: none (no component claims this path)", "");
  }
  if (explanation.protected) lines.push(...bullets("Protected: changes here need human review", explanation.protectedReasons));
  lines.push(...bullets("Rules that constrain changes here", explanation.constraints.map(ruleLine)));
  if (explanation.allowedComponents) lines.push(...bullets("May depend only on", explanation.allowedComponents.length ? explanation.allowedComponents : ["(nothing outside its own component)"]));
  lines.push(...bullets("Must not depend on components", explanation.forbiddenComponents));
  lines.push(...bullets("Must not depend on packages", explanation.forbiddenPackages));
  lines.push(...bullets("Invariants to preserve", explanation.invariants.map((item) => `${item.id}: ${item.statement}${item.check ? ` (check: ${item.check})` : ""}`)));
  lines.push(...bullets("Decisions", explanation.decisions.map((item) => `${item.id} [${item.status}]: ${item.title}`)));
  lines.push(...bullets("Depends on", explanation.dependsOn));
  lines.push(...bullets("Depended on by", explanation.dependents));
  if (explanation.guidance) lines.push(explanation.guidance);
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}
async function explainCommand(args, io) {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  requireBlueprint(context);
  const explanation = workspaceOf(context).explainPath(repoPathArg(context, io, args.positionals[0]));
  io.stdout(stringFlag(args, "format") === "json" ? renderJsonText(explanation) : renderExplanation(explanation));
  return EXIT_OK;
}
function renderImpact(impact) {
  const lines = [];
  if (impact.touchedComponents.length === 0) lines.push("No component owns these paths.", "");
  for (const touched of impact.touchedComponents) {
    lines.push(`Touches ${touched.id}:`, ...touched.files.map((file2) => `  - ${file2}`), "");
  }
  if (impact.dependents.length) {
    lines.push("Components that depend on them (nearest first):");
    for (const dependent of impact.dependents) lines.push(`  - ${dependent.id}  (${dependent.depth === 1 ? "direct" : `${dependent.depth} steps away`})`);
  } else if (impact.touchedComponents.length) {
    lines.push("No other component depends on them.");
  }
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}
async function impactCommand(args, io) {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  requireBlueprint(context);
  const impact = workspaceOf(context).impact(args.positionals.map((value) => repoPathArg(context, io, value)));
  io.stdout(stringFlag(args, "format") === "json" ? renderJsonText(impact) : renderImpact(impact));
  return EXIT_OK;
}
async function graphCommand(args, io) {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  requireBlueprint(context);
  const view = workspaceOf(context).graphView();
  const format = stringFlag(args, "format");
  if (format === "json") io.stdout(renderJsonText(view));
  else io.stdout(ensureTrailingNewline(format === "dot" ? renderDot(view) : renderMermaid(view)));
  return EXIT_OK;
}
function renderReach(reach) {
  const lines = [];
  lines.push(...bullets("Agent configuration files", reach.configs.map((config2) => `${config2.path}  (${config2.agent}, ${config2.type})`)));
  lines.push(...bullets("MCP servers agents can call", reach.mcpServers.map((server) => {
    const where = server.transport === "http" ? server.url ?? "http" : server.command ?? server.transport;
    const env = server.env.length ? ` · receives env: ${server.env.join(", ")}` : "";
    return `${server.name}  (${server.agent}, ${where})${env} · ${server.configPath}`;
  })));
  lines.push(...bullets("Secrets written inline in agent configuration (move them to the environment)", reach.inlineSecrets.map((secret) => `${secret.path}:${secret.line}  ${secret.location}  ${secret.kind}  ${secret.preview}`)));
  const broad = reach.permissions.filter((grant) => grant.broad && grant.effect === "allow");
  lines.push(...bullets("Broad permission grants", broad.map((grant) => `${grant.rule}  (${grant.agent}, ${grant.path})`)));
  const other = reach.permissions.length - broad.length;
  if (other > 0) lines.push(`Other permission rules: ${other} (use --format json to list them)`, "");
  const secrets = reach.envAccess.filter((access) => access.secretLike);
  lines.push(...bullets("Secret-like environment variables and who reads them", secrets.map((access) => `${access.name}  ← ${access.readers.join(", ") || "(unmapped files)"}  (${access.files.length} file${access.files.length === 1 ? "" : "s"})`)));
  const plain = reach.envAccess.length - secrets.length;
  if (plain > 0) lines.push(`Other environment variables read: ${plain}`, "");
  if (lines.length === 0) lines.push("No agent configuration, MCP servers or environment access found.");
  return ensureTrailingNewline(lines.join("\n").trimEnd());
}
async function reachCommand(args, io) {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  assertBlueprintValid(context);
  noteMissingBlueprint(context, io);
  const reach = workspaceOf(context).check().reach ?? { configs: [], mcpServers: [], inlineSecrets: [], permissions: [], envAccess: [] };
  io.stdout(stringFlag(args, "format") === "json" ? renderJsonText(reach) : renderReach(reach));
  return EXIT_OK;
}
var init_query = __esm({
  "src/cli/commands/query.ts"() {
    "use strict";
    init_report();
    init_schema();
    init_workspace();
    init_args();
    init_context();
    init_format();
    init_io();
    init_repo_path();
  }
});

// src/blueprint/verify.ts
function stampVerification(blueprint, targetId, verification) {
  const next = blueprintSchema.parse(JSON.parse(JSON.stringify(blueprint)));
  const component = next.components.find((item) => item.id === targetId);
  if (component) {
    component.verified = verification;
    return { blueprint: next, target: component.name, kind: "component" };
  }
  const rule = next.rules.find((item) => item.id === targetId);
  if (rule) {
    rule.verified = verification;
    return { blueprint: next, target: rule.id, kind: "rule" };
  }
  const invariant = next.invariants.find((item) => item.id === targetId);
  if (invariant) {
    invariant.verified = verification;
    return { blueprint: next, target: invariant.statement, kind: "invariant" };
  }
  const arrow = targetId.indexOf("->");
  if (arrow > 0) {
    const from = targetId.slice(0, arrow).trim();
    const to = targetId.slice(arrow + 2).trim();
    const dependency = next.dependencies.find((item) => item.from === from && item.to === to);
    if (dependency) {
      dependency.verified = verification;
      return { blueprint: next, target: `${from} → ${to}`, kind: "dependency" };
    }
  }
  throw new Error(`No component, rule, invariant or dependency (from->to) with id "${targetId}" exists in the blueprint.`);
}
var init_verify = __esm({
  "src/blueprint/verify.ts"() {
    "use strict";
    init_schema();
  }
});

// src/cli/commands/verify.ts
var verify_exports = {};
__export(verify_exports, {
  verifyCommand: () => verifyCommand
});
import { writeFile as writeFile3 } from "node:fs/promises";
import { join as join4 } from "node:path";
async function verifyCommand(args, io) {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const by = stringFlag(args, "by")?.trim() || (context.isGit ? await userName(context.root) : null);
  if (!by) throw new CliError("Who is signing? git config user.name is not set", { hint: "Pass --by <name>." });
  const commit = context.isGit ? await headSha(context.root) : null;
  const note = stringFlag(args, "note")?.trim();
  const verification = { by, at: (/* @__PURE__ */ new Date()).toISOString(), ...commit ? { commit } : {}, ...note ? { note } : {} };
  let stamped;
  try {
    stamped = stampVerification(blueprint, args.positionals[0], verification);
  } catch (error51) {
    throw new CliError(errorMessage(error51), { hint: "Component, rule and invariant ids are listed in .rassam/blueprint.json; dependencies are addressed as from->to." });
  }
  await writeFile3(join4(context.root, BLUEPRINT_PATH), serializeBlueprint(stamped.blueprint), "utf8");
  io.stdout(
    [
      `Signed ${stamped.kind} ${args.positionals[0]}${stamped.target !== args.positionals[0] ? ` (${stamped.target})` : ""}`,
      `  by ${verification.by} at ${verification.at}${commit ? ` · commit ${commit.slice(0, 12)}` : ""}`,
      ...note ? [`  note: ${note}`] : [],
      "",
      `A sign-off says: "I checked this against the code at this commit." It is a change to ${BLUEPRINT_PATH},`,
      "so it is reviewed in the pull request like any other change. Commit it with your name on it.",
      ""
    ].join("\n")
  );
  return EXIT_OK;
}
var init_verify2 = __esm({
  "src/cli/commands/verify.ts"() {
    "use strict";
    init_schema();
    init_verify();
    init_args();
    init_context();
    init_git();
    init_io();
    init_util();
  }
});

// src/blueprint/sync.ts
function uniqueId2(base, used) {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) candidate = `${base}-${counter++}`;
  used.add(candidate);
  return candidate;
}
function syncBlueprint(existing, files, options = {}) {
  const provenance = {
    source: "derived",
    by: options.author ?? "rassam sync",
    at: options.now ?? (/* @__PURE__ */ new Date()).toISOString(),
    ...options.commit ? { commit: options.commit } : {}
  };
  const next = blueprintSchema.parse(JSON.parse(JSON.stringify(existing)));
  const addedComponents = [];
  const skippedFiles = [];
  const model = buildSnapshotModel(files, next);
  const ownedBefore = new Map(model.membership.fileToComponent);
  if (options.components !== false) {
    const unmapped = model.membership.unmapped.filter((path) => model.fileGraph.facts.has(path));
    if (unmapped.length) {
      const unmappedSet = new Set(unmapped);
      const draft = deriveBlueprint(files.filter((file2) => unmappedSet.has(file2.path)), { now: provenance.at });
      const used = new Set(next.components.map((component) => component.id));
      for (const proposed of draft.components) {
        const candidate = { ...proposed, id: uniqueId2(proposed.id, used), provenance };
        const trial = { ...next, components: [...next.components, candidate] };
        const assigned = assignComponents(model.fileGraph.files, trial).fileToComponent;
        const steals = [...ownedBefore].some(([path, owner]) => assigned.get(path) !== owner);
        if (steals) {
          const claimed2 = unmapped.filter((path) => assigned.get(path) === candidate.id);
          if (!claimed2.length) continue;
          candidate.paths = claimed2;
          delete candidate.priority;
        }
        const claimed = assignComponents(model.fileGraph.files, { ...next, components: [...next.components, candidate] }).fileToComponent;
        if (![...claimed.values()].includes(candidate.id)) continue;
        next.components.push(candidate);
        addedComponents.push(candidate);
      }
      const finalMembership = assignComponents(model.fileGraph.files, next).fileToComponent;
      skippedFiles.push(...unmapped.filter((path) => !finalMembership.has(path)));
    }
  }
  const addedDependencies = [];
  if (options.dependencies !== false) {
    const merged = buildSnapshotModel(files, next);
    const declared = new Set(next.dependencies.map((dependency) => `${dependency.from}\0${dependency.to}`));
    const byId2 = new Map(next.components.map((component) => [component.id, component]));
    for (const edge of merged.componentGraph.edges) {
      if (declared.has(`${edge.from}\0${edge.to}`)) continue;
      if (byId2.get(edge.from)?.kind === "test" || byId2.get(edge.to)?.public) continue;
      if (!next.policy.includeTypeOnly && edge.typeOnly) continue;
      const dependency = { from: edge.from, to: edge.to, kind: "imports", provenance };
      next.dependencies.push(dependency);
      addedDependencies.push(dependency);
    }
    next.dependencies.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
  }
  return { blueprint: blueprintSchema.parse(next), addedComponents, addedDependencies, skippedFiles: skippedFiles.sort() };
}
var init_sync = __esm({
  "src/blueprint/sync.ts"() {
    "use strict";
    init_check();
    init_derive();
    init_graph();
    init_schema();
  }
});

// src/cli/commands/sync.ts
var sync_exports = {};
__export(sync_exports, {
  syncCommand: () => syncCommand
});
import { writeFile as writeFile4 } from "node:fs/promises";
import { join as join5 } from "node:path";
async function syncCommand(args, io) {
  const context = await loadContextFor(io, stringFlag(args, "root"));
  const blueprint = requireBlueprint(context);
  const result = syncBlueprint(blueprint, context.files, {
    components: !booleanFlag(args, "noComponents"),
    dependencies: !booleanFlag(args, "noDependencies"),
    commit: context.isGit ? await headSha(context.root) ?? void 0 : void 0,
    author: context.isGit ? await userName(context.root) ?? void 0 : void 0
  });
  const write = booleanFlag(args, "write");
  if (stringFlag(args, "format") === "json") {
    io.stdout(`${JSON.stringify({
      written: write,
      addedComponents: result.addedComponents,
      addedDependencies: result.addedDependencies,
      skippedFiles: result.skippedFiles
    }, null, 2)}
`);
  } else {
    const lines = [];
    if (!result.addedComponents.length && !result.addedDependencies.length) {
      lines.push("The blueprint already covers the code: no unclaimed files, no undeclared dependencies.");
    } else {
      lines.push(write ? `Updated ${BLUEPRINT_PATH}:` : `Proposed additions (dry run; use --write to apply):`);
      for (const component of result.addedComponents) {
        lines.push(`  + component ${component.id} (${component.kind}): ${component.paths.join(", ")}`);
      }
      for (const dependency of result.addedDependencies) lines.push(`  + dependency ${dependency.from} -> ${dependency.to}`);
      lines.push("", 'Every addition is marked provenance "derived". Review them, write intent for new components,');
      lines.push("and sign what you accept with `rassam verify <id>`. Nothing you wrote was changed.");
    }
    if (result.skippedFiles.length) lines.push(`  (${result.skippedFiles.length} unclaimed files were left for you to place by hand)`);
    io.stdout(`${lines.join("\n")}
`);
  }
  if (write && (result.addedComponents.length || result.addedDependencies.length)) {
    await writeFile4(join5(context.root, BLUEPRINT_PATH), serializeBlueprint(result.blueprint), "utf8");
  }
  return EXIT_OK;
}
var init_sync2 = __esm({
  "src/cli/commands/sync.ts"() {
    "use strict";
    init_schema();
    init_sync();
    init_args();
    init_context();
    init_git();
    init_io();
  }
});

// src/cli/commands/proposals.ts
var proposals_exports = {};
__export(proposals_exports, {
  listEntries: () => listEntries,
  proposalsCommand: () => proposalsCommand
});
import { readdir as readdir2, readFile as readFile3 } from "node:fs/promises";
import { join as join6 } from "node:path";
import { resolve as resolve5 } from "node:path";
function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readEntry(root, directory, name, type) {
  const file2 = `${directory}/${name}`;
  const blank = { type, file: file2, title: name, author: null, date: null, status: null };
  try {
    const data = JSON.parse(await readFile3(join6(root, file2), "utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) return { ...blank, problem: "not a JSON object" };
    const record2 = data;
    return {
      type,
      file: file2,
      title: text(record2.title) ?? text(record2.summary) ?? name,
      author: text(record2.agent) ?? text(record2.author),
      date: text(record2.createdAt) ?? text(record2.date),
      status: text(record2.status)
    };
  } catch {
    return { ...blank, problem: "unreadable or invalid JSON" };
  }
}
async function listEntries(root) {
  const entries2 = [];
  const sources = [
    [BLUEPRINT_PROPOSALS_DIR, "proposal"],
    [BLUEPRINT_ESCALATIONS_DIR, "escalation"]
  ];
  for (const [directory, type] of sources) {
    const names = await readdir2(join6(root, directory)).catch(() => []);
    for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
      entries2.push(await readEntry(root, directory, name, type));
    }
  }
  return entries2;
}
function section(heading, entries2) {
  if (entries2.length === 0) return [];
  const lines = [`${heading} (${entries2.length})`];
  for (const entry of entries2) {
    const meta3 = [entry.author, entry.date, entry.status, entry.problem].filter(Boolean).join(" · ");
    lines.push(`  ${entry.title}`, `    ${meta3 ? `${meta3} · ` : ""}${entry.file}`);
  }
  return [...lines, ""];
}
async function proposalsCommand(args, io) {
  const rootFlag = stringFlag(args, "root");
  const start = resolve5(io.cwd, rootFlag ?? ".");
  const root = rootFlag ? start : await repoRoot(start).catch(() => null) ?? start;
  const entries2 = await listEntries(root);
  if (stringFlag(args, "format") === "json") {
    io.stdout(renderJsonText({ entries: entries2 }));
    return EXIT_OK;
  }
  if (entries2.length === 0) {
    io.stdout(`No proposals or escalations. Agents file them in ${BLUEPRINT_PROPOSALS_DIR}/ and ${BLUEPRINT_ESCALATIONS_DIR}/ through the MCP server.
`);
    return EXIT_OK;
  }
  const lines = [
    ...section("Escalations: an agent stopped because the task and the contract conflict", entries2.filter((entry) => entry.type === "escalation")),
    ...section("Proposals: changes to the blueprint that an agent suggests", entries2.filter((entry) => entry.type === "proposal")),
    "Review each file, apply what you agree with to the blueprint yourself, then delete the file."
  ];
  io.stdout(`${lines.join("\n")}
`);
  return EXIT_OK;
}
var init_proposals = __esm({
  "src/cli/commands/proposals.ts"() {
    "use strict";
    init_schema();
    init_args();
    init_format();
    init_git();
    init_io();
  }
});

// src/cli/commands/schema.ts
var schema_exports = {};
__export(schema_exports, {
  schemaCommand: () => schemaCommand
});
async function schemaCommand(_args, io) {
  io.stdout(`${JSON.stringify(blueprintJsonSchema(), null, 2)}
`);
  return EXIT_OK;
}
var init_schema2 = __esm({
  "src/cli/commands/schema.ts"() {
    "use strict";
    init_schema();
    init_io();
  }
});

// src/cli/mcp/protocol.ts
import { StringDecoder } from "node:string_decoder";
function isObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isId(value) {
  return typeof value === "string" || typeof value === "number" && Number.isFinite(value);
}
function errorResponse(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: data === void 0 ? { code, message } : { code, message, data } };
}
function typeMatches(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject2(value);
    default:
      return true;
  }
}
function validateProperty(name, schema, value) {
  if (!typeMatches(schema.type, value)) return `"${name}" must be ${schema.type === "array" ? "an array" : `a ${String(schema.type)}`}`;
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.trim().length < schema.minLength) return `"${name}" must not be empty`;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return `"${name}" is too long (max ${schema.maxLength} characters)`;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return `"${name}" needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}`;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return `"${name}" has too many items (max ${schema.maxItems})`;
    const items = isObject2(schema.items) ? schema.items : null;
    if (items && value.some((item) => !typeMatches(items.type, item))) return `"${name}" must be an array of ${String(items.type)}s`;
  }
  return null;
}
function validateToolInput(schema, args) {
  const properties = isObject2(schema.properties) ? schema.properties : {};
  const required2 = Array.isArray(schema.required) ? schema.required.filter((key) => typeof key === "string") : [];
  for (const key of required2) {
    if (args[key] === void 0 || args[key] === null) return `Missing required argument "${key}"`;
  }
  for (const [key, value] of Object.entries(args)) {
    const property = properties[key];
    if (!isObject2(property)) {
      if (schema.additionalProperties === false) {
        const known = Object.keys(properties);
        return `Unknown argument "${key}"${known.length ? ` (expected: ${known.join(", ")})` : " (this tool takes no arguments)"}`;
      }
      continue;
    }
    if (value === void 0 || value === null) continue;
    const problem = validateProperty(key, property, value);
    if (problem) return problem;
  }
  return null;
}
function createMcpHandler(options) {
  const log = options.log ?? (() => void 0);
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  const serverInfo = { name: options.name, title: options.title, version: options.version };
  const serverMeta = { [META_SERVER_INFO]: { name: options.name, version: options.version } };
  function listTools() {
    return {
      tools: options.tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations
      }))
    };
  }
  function toolFailure(message) {
    return { content: [{ type: "text", text: message }], isError: true };
  }
  async function callTool(params) {
    if (typeof params.name !== "string" || !params.name) throw new RpcError(ErrorCode.InvalidParams, "tools/call requires params.name");
    const tool = tools.get(params.name);
    if (!tool) throw new RpcError(ErrorCode.InvalidParams, `Unknown tool: ${params.name}`);
    const args = params.arguments ?? {};
    if (!isObject2(args)) return toolFailure(`Arguments for ${tool.name} must be a JSON object.`);
    const problem = validateToolInput(tool.inputSchema, args);
    if (problem) return toolFailure(`Invalid arguments for ${tool.name}: ${problem}.`);
    try {
      const outcome = await tool.handler(args);
      const text3 = outcome.text ?? JSON.stringify(outcome.structured, null, 2);
      return { content: [{ type: "text", text: text3 }], structuredContent: outcome.structured, isError: false };
    } catch (error51) {
      if (!(error51 instanceof ToolError)) log(`tool ${tool.name} failed: ${error51 instanceof Error ? error51.stack ?? error51.message : String(error51)}`);
      return toolFailure(error51 instanceof Error ? error51.message : String(error51));
    }
  }
  function initialize(params) {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    const legacy = LEGACY_PROTOCOL_VERSIONS;
    return {
      protocolVersion: legacy.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      instructions: options.instructions
    };
  }
  function discover() {
    return {
      supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      capabilities: { tools: {} },
      instructions: options.instructions,
      ttlMs: 6e4,
      cacheScope: "private"
    };
  }
  async function dispatch(method, params) {
    switch (method) {
      case "initialize":
        return initialize(params);
      case "ping":
        return {};
      case "server/discover":
        return discover();
      case "tools/list":
        return listTools();
      case "tools/call":
        return callTool(params);
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  }
  function carriedVersion(params) {
    return isObject2(params._meta) ? params._meta[META_PROTOCOL_VERSION] : void 0;
  }
  async function handleRequest(id, method, rawParams) {
    if (rawParams !== void 0 && !isObject2(rawParams)) return errorResponse(id, ErrorCode.InvalidParams, "params must be an object");
    const params = rawParams ?? {};
    const requested = carriedVersion(params);
    if (requested !== void 0 && method !== "server/discover" && !(typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested))) {
      return errorResponse(id, ErrorCode.UnsupportedProtocolVersion, `Unsupported protocol version: ${String(requested)}`, {
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested
      });
    }
    const modern = method === "server/discover" || requested === MODERN_PROTOCOL_VERSION;
    try {
      const result = await dispatch(method, params);
      if (!modern) return { jsonrpc: "2.0", id, result };
      const meta3 = isObject2(result._meta) ? { ...result._meta, ...serverMeta } : serverMeta;
      return { jsonrpc: "2.0", id, result: { resultType: "complete", ...result, _meta: meta3 } };
    } catch (error51) {
      if (error51 instanceof RpcError) return errorResponse(id, error51.code, error51.message, error51.data);
      log(`internal error in ${method}: ${error51 instanceof Error ? error51.stack ?? error51.message : String(error51)}`);
      return errorResponse(id, ErrorCode.InternalError, "Internal error");
    }
  }
  async function handleSingle(message) {
    if (!isObject2(message)) return errorResponse(null, ErrorCode.InvalidRequest, "Invalid request: expected a JSON-RPC object");
    const hasId = "id" in message && message.id !== void 0;
    const id = isId(message.id) ? message.id : null;
    if (typeof message.method !== "string") {
      if (message.jsonrpc === "2.0" && ("result" in message || "error" in message)) return null;
      return errorResponse(id, ErrorCode.InvalidRequest, "Invalid request: missing method");
    }
    if (message.jsonrpc !== "2.0") {
      return hasId ? errorResponse(id, ErrorCode.InvalidRequest, 'Invalid request: jsonrpc must be "2.0"') : null;
    }
    if (!hasId) return null;
    if (id === null) return errorResponse(null, ErrorCode.InvalidRequest, "Invalid request: id must be a string or number");
    return handleRequest(id, message.method, message.params);
  }
  async function handleMessage(message) {
    if (!Array.isArray(message)) return handleSingle(message);
    if (message.length === 0) return errorResponse(null, ErrorCode.InvalidRequest, "Invalid request: empty batch");
    const responses = [];
    for (const entry of message) {
      const response = await handleSingle(entry);
      if (response) responses.push(response);
    }
    return responses.length ? responses : null;
  }
  async function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return JSON.stringify(errorResponse(null, ErrorCode.ParseError, "Parse error: invalid JSON"));
    }
    try {
      const response = await handleMessage(message);
      return response === null ? null : JSON.stringify(response);
    } catch (error51) {
      log(`unexpected failure: ${error51 instanceof Error ? error51.stack ?? error51.message : String(error51)}`);
      return JSON.stringify(errorResponse(null, ErrorCode.InternalError, "Internal error"));
    }
  }
  return { handleLine, handleMessage };
}
function serveMcp(options, input, output) {
  const handler = createMcpHandler(options);
  const log = options.log ?? (() => void 0);
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let queue = Promise.resolve();
  let closed = false;
  function send(line) {
    if (closed) return;
    output.write(`${line}
`);
  }
  function enqueue(line) {
    queue = queue.then(() => handler.handleLine(line)).then((response) => {
      if (response !== null) send(response);
    }).catch((error51) => log(`failed to handle message: ${error51 instanceof Error ? error51.message : String(error51)}`));
  }
  function drain(final) {
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      enqueue(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (final && buffer.trim()) {
      enqueue(buffer);
      buffer = "";
    }
  }
  return new Promise((resolvePromise) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      buffer += decoder.end();
      drain(true);
      void queue.then(() => resolvePromise());
    };
    output.on("error", (error51) => {
      closed = true;
      if (error51.code !== "EPIPE") log(`output error: ${error51.message}`);
      finish();
    });
    input.on("data", (chunk) => {
      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
      drain(false);
    });
    input.on("end", finish);
    input.on("close", finish);
    input.on("error", (error51) => {
      log(`input error: ${error51.message}`);
      finish();
    });
  });
}
var MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSIONS, SUPPORTED_PROTOCOL_VERSIONS, META_PROTOCOL_VERSION, META_SERVER_INFO, ErrorCode, ToolError, RpcError;
var init_protocol = __esm({
  "src/cli/mcp/protocol.ts"() {
    "use strict";
    MODERN_PROTOCOL_VERSION = "2026-07-28";
    LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
    SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS];
    META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
    META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";
    ErrorCode = {
      ParseError: -32700,
      InvalidRequest: -32600,
      MethodNotFound: -32601,
      InvalidParams: -32602,
      InternalError: -32603,
      UnsupportedProtocolVersion: -32022
    };
    ToolError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "ToolError";
      }
    };
    RpcError = class extends Error {
      constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
      }
    };
  }
});

// src/cli/mcp/tools.ts
import { mkdir as mkdir3, stat as stat2, writeFile as writeFile5 } from "node:fs/promises";
import { join as join7 } from "node:path";
function objectSchema(properties, required2 = []) {
  return { type: "object", properties, required: required2, additionalProperties: false };
}
function text2(description, maxLength = 2e3) {
  return { type: "string", minLength: 1, maxLength, description };
}
function asJson(value) {
  return JSON.parse(JSON.stringify(value));
}
function compactFinding(finding) {
  return asJson({
    id: finding.id,
    kind: finding.kind,
    severity: finding.severity,
    ruleId: finding.ruleId,
    title: finding.title,
    message: finding.message,
    reason: finding.reason,
    components: finding.components,
    locations: finding.locations.slice(0, MAX_LOCATIONS2),
    moreLocations: Math.max(0, finding.locations.length - MAX_LOCATIONS2) || void 0,
    isNew: finding.isNew
  });
}
function nextStep(report, outcome, shown) {
  if (shown === 0) return "Nothing in this change conflicts with the blueprint.";
  if (outcome === "pass") return "The gate passes. Review the remaining findings and mention them to the user.";
  return "Fix the findings by changing your code, not the checks: do not edit the blueprint, weaken tests or skip CI to make this pass. If a finding cannot be fixed without breaking the task, call report_conflict and tell the user." + (report.contractChanges?.length ? " This change edits the contract itself; a human must approve that." : "");
}
function createTools(deps) {
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  let cache2 = null;
  async function cacheKey(isGit) {
    const info = await stat2(join7(deps.root, BLUEPRINT_PATH)).catch(() => null);
    const head = isGit ? await headSha(deps.root).catch(() => null) : null;
    return `${info ? `${info.mtimeMs}:${info.size}` : "none"}|${head ?? "nohead"}`;
  }
  async function snapshot() {
    const isGit = cache2 ? cache2.context.isGit : await repoRoot(deps.root).catch(() => null) !== null;
    const key = await cacheKey(isGit);
    if (cache2 && cache2.key === key && Date.now() - cache2.loadedAt < CACHE_TTL_MS) return cache2;
    const context = await loadContext(deps.root, isGit);
    cache2 = { key, loadedAt: Date.now(), context, workspace: createWorkspace(context.files, context.blueprint) };
    return cache2;
  }
  function invalidate() {
    cache2 = null;
  }
  function blueprintOf(snap) {
    if (snap.context.blueprintState === "invalid") {
      throw new ToolError(`${BLUEPRINT_PATH} is invalid, so the contract cannot be read. Tell the user; do not try to repair it yourself.
${formatIssues(snap.context.blueprintIssues, 10)}`);
    }
    if (!snap.context.blueprint) {
      throw new ToolError(`This repository has no blueprint at ${BLUEPRINT_PATH} yet. A human creates one with "rassam init"; until then there is no contract to check against.`);
    }
    return snap.context.blueprint;
  }
  function pathArg(value, name) {
    const path = toRepoPath(deps.root, deps.root, String(value));
    if (path === null || path === "") throw new ToolError(`"${name}" must be a path inside the repository (repository-relative, like src/lib/ai.ts).`);
    return path;
  }
  function targetArg(value) {
    const raw = String(value).trim();
    const looksLikePath = /^\.{0,2}[\\/]/.test(raw) || /^[A-Za-z]:[\\/]/.test(raw) || raw.includes("\\");
    return looksLikePath ? pathArg(raw, "target") : raw;
  }
  function componentArg(blueprint, value) {
    const id = String(value).trim();
    if (blueprint.components.some((component) => component.id === id)) return id;
    const ids = blueprint.components.map((component) => component.id);
    throw new ToolError(`Unknown component "${id}". Components: ${ids.slice(0, 60).join(", ")}${ids.length > 60 ? ", …" : ""}`);
  }
  async function writeNote(directory, title, fallback, record2) {
    const stamp = fileTimestamp(now());
    const slug = slugify(title, fallback);
    await mkdir3(join7(deps.root, directory), { recursive: true });
    for (let attempt = 1; attempt <= 50; attempt++) {
      const file2 = `${directory}/${stamp}-${slug}${attempt === 1 ? "" : `-${attempt}`}.json`;
      try {
        await writeFile5(join7(deps.root, file2), `${JSON.stringify(record2, null, 2)}
`, { encoding: "utf8", flag: "wx" });
        return file2;
      } catch (error51) {
        if (error51.code !== "EEXIST") throw new ToolError(`Could not write ${file2}: ${errorMessage(error51)}`);
      }
    }
    throw new ToolError(`Could not find a free file name in ${directory}`);
  }
  async function overview() {
    const snap = await snapshot();
    blueprintOf(snap);
    const summary = snap.workspace.overview();
    return {
      structured: asJson({
        ...summary,
        counts: {
          components: summary.components.length,
          rules: summary.rules.length,
          invariants: summary.invariants,
          decisions: summary.decisions,
          dependencies: summary.dependencies,
          filesAnalyzed: summary.filesAnalyzed,
          unmappedSourceFiles: summary.unmappedSourceFiles
        },
        humanAuthoredRatio: summary.authorship.ratio,
        howToUse: USAGE_HINT
      })
    };
  }
  async function explainPath(args) {
    const snap = await snapshot();
    blueprintOf(snap);
    return { structured: asJson(snap.workspace.explainPath(pathArg(args.path, "path"))) };
  }
  async function getComponent(args) {
    const snap = await snapshot();
    const id = componentArg(blueprintOf(snap), args.id);
    const summary = snap.workspace.componentSummary(id);
    if (!summary) throw new ToolError(`Unknown component "${id}".`);
    return { structured: asJson(summary) };
  }
  async function checkDependency(args) {
    const snap = await snapshot();
    blueprintOf(snap);
    const result = snap.workspace.checkDependency(pathArg(args.from_path, "from_path"), targetArg(args.target));
    return { structured: asJson(result) };
  }
  async function impact(args) {
    const snap = await snapshot();
    blueprintOf(snap);
    const paths = args.paths.map((value) => pathArg(value, "paths"));
    return { structured: asJson(snap.workspace.impact(paths)) };
  }
  async function checkChanges(args) {
    invalidate();
    const snap = await snapshot();
    const requested = typeof args.base === "string" && args.base.trim() ? args.base.trim() : void 0;
    if (requested && !snap.context.isGit) throw new ToolError("This directory is not a git repository, so there is no base to compare against. Call check_changes without a base.");
    const base = requested ?? (snap.context.isGit ? await defaultBaseRef(deps.root) ?? void 0 : void 0);
    let gate;
    try {
      gate = await runGate({ context: snap.context, base, note: deps.log });
    } catch (error51) {
      if (error51 instanceof CliError) throw new ToolError(`${error51.message}${error51.hint ? ` ${error51.hint}` : ""}`);
      throw error51;
    }
    const { report } = gate;
    const relevant = gate.mode === "diff" ? report.findings.filter((finding) => finding.isNew) : report.findings;
    const shown = relevant.slice(0, MAX_FINDINGS);
    const outcome = verdict(report, "error");
    return {
      structured: asJson({
        verdict: outcome,
        mode: gate.mode,
        base: report.base,
        judgedBy: gate.mode === "diff" ? `the blueprint at the merge-base (${gate.baseBlueprint})` : "the working tree blueprint",
        blueprint: report.blueprint,
        summary: report.summary,
        findings: shown.map(compactFinding),
        moreFindings: relevant.length - shown.length,
        preExistingFindings: report.findings.length - relevant.length,
        contractChanges: report.contractChanges,
        next: nextStep(report, outcome, shown.length)
      })
    };
  }
  async function listDecisions(args) {
    const snap = await snapshot();
    const blueprint = blueprintOf(snap);
    const component = args.component === void 0 || args.component === null ? void 0 : componentArg(blueprint, args.component);
    const decisions = blueprint.decisions.filter((decision) => !component || !decision.components?.length || decision.components.includes(component));
    return { structured: asJson({ component: component ?? null, count: decisions.length, decisions }) };
  }
  async function proposeChange(args) {
    const createdAt = now().toISOString();
    const record2 = asJson({
      title: String(args.title).trim(),
      rationale: args.rationale,
      changes: args.changes,
      agent: args.agent ?? "unknown agent",
      createdAt,
      status: "pending"
    });
    const file2 = await writeNote(BLUEPRINT_PROPOSALS_DIR, String(args.title), "proposal", record2);
    const note = `Proposal recorded for human review. ${BLUEPRINT_PATH} was not changed and you must not edit it: until a human accepts the proposal, the current contract still applies to your work.`;
    return { structured: { file: file2, status: "pending", createdAt, note }, text: `Wrote ${file2}. ${note}` };
  }
  async function reportConflict(args) {
    const createdAt = now().toISOString();
    const record2 = asJson({
      summary: String(args.summary).trim(),
      details: args.details,
      ruleId: args.rule_id,
      paths: args.paths,
      agent: args.agent ?? "unknown agent",
      createdAt,
      status: "open"
    });
    const file2 = await writeNote(BLUEPRINT_ESCALATIONS_DIR, String(args.summary), "conflict", record2);
    const instruction = "Conflict recorded. Stop work on the conflicting part of the task now. Do not weaken or delete tests, checks, CI or the blueprint to get around it. Tell the user what you found, which rule or invariant is involved, and what you would need from them to continue. You may finish parts of the task that do not conflict.";
    return { structured: { file: file2, status: "open", createdAt, instruction }, text: `Wrote ${file2}. ${instruction}` };
  }
  return [
    {
      name: "blueprint_overview",
      title: "Blueprint overview",
      description: "Start here. Returns the architecture contract of this repository: the system, its components (id, kind, file count, intent, human-verified?, assurance), every rule with severity and a one-line summary, counts, how much of the contract is human-authored, and how to use this server.",
      inputSchema: NO_ARGUMENTS,
      annotations: READ_ONLY,
      handler: overview
    },
    {
      name: "explain_path",
      title: "Explain a path",
      description: "Call this BEFORE editing or creating a file. Returns which component owns the path, its intent and owners, the rules that constrain changes there, what it may and may not depend on, the invariants and decisions to respect, and whether the path is protected (changes need human review).",
      inputSchema: objectSchema({ path: text2("Repository-relative path, e.g. src/lib/ai.ts") }, ["path"]),
      annotations: READ_ONLY,
      handler: explainPath
    },
    {
      name: "get_component",
      title: "Get a component",
      description: "Full summary of one component: definition and intent, files, what it depends on and what depends on it (declared and observed), external packages, environment variables it reads, tests, rules, invariants and decisions.",
      inputSchema: objectSchema({ id: text2("Component id from blueprint_overview", 80) }, ["id"]),
      annotations: READ_ONLY,
      handler: getComponent
    },
    {
      name: "check_dependency",
      title: "Check a dependency",
      description: 'Call this BEFORE adding an import. Answers "may code in from_path import target?" where target is a repository path or a package name. Returns allowed, the rules it would violate with their human-written reasons, and whether the dependency is undeclared.',
      inputSchema: objectSchema(
        {
          from_path: text2("Repository-relative path of the file that would contain the import"),
          target: text2('What it would import: a repository path (src/lib/db.ts) or a package name ("octokit", "node:fs")')
        },
        ["from_path", "target"]
      ),
      annotations: READ_ONLY,
      handler: checkDependency
    },
    {
      name: "impact",
      title: "Impact of a change",
      description: "Blast radius: which components the given paths belong to, and which components depend on them (transitively, nearest first). Use it to decide what to re-test and what to tell the user.",
      inputSchema: objectSchema(
        { paths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 500, description: "Repository-relative paths you changed or plan to change" } },
        ["paths"]
      ),
      annotations: READ_ONLY,
      handler: impact
    },
    {
      name: "check_changes",
      title: "Check my changes",
      description: "Call this BEFORE you finish or open a pull request. Runs the same gate as CI on the current working tree (uncommitted and untracked files included) and returns the verdict with the top findings, so you can fix them first. Compares against base (default: the repository's default branch) and judges by the blueprint at the merge-base; without a resolvable base it checks the whole tree.",
      inputSchema: objectSchema({ base: text2("Git ref the change will merge into, e.g. origin/main", 200) }),
      annotations: READ_ONLY,
      handler: checkChanges
    },
    {
      name: "list_decisions",
      title: "List decisions",
      description: "Architecture decision records from the blueprint (context, decision, consequences, status), optionally only those that apply to one component. Read them before proposing to change how something works.",
      inputSchema: objectSchema({ component: text2("Only decisions that apply to this component id", 80) }),
      annotations: READ_ONLY,
      handler: listDecisions
    },
    {
      name: "propose_change",
      title: "Propose a blueprint change",
      description: "Suggest a change to the contract for a human to review. Writes a file under .rassam/proposals/ and never edits .rassam/blueprint.json. The current contract keeps applying until a human accepts the proposal.",
      inputSchema: objectSchema(
        {
          title: text2("Short title of the proposed change", 200),
          rationale: text2("Why the contract should change", 8e3),
          changes: text2("The change itself: a precise description or a JSON patch of the blueprint", 5e4),
          agent: text2("Your name, e.g. Claude Code", 120)
        },
        ["title", "rationale", "changes"]
      ),
      annotations: WRITES_NOTE,
      handler: proposeChange
    },
    {
      name: "report_conflict",
      title: "Report a conflict and stop",
      description: "Use this when the task cannot be completed without breaking a rule or invariant, weakening a test or check, or editing the blueprint. This is the sanctioned way to stop: it records the conflict under .rassam/escalations/ for a human and tells you how to proceed. Stopping here is a correct outcome, not a failure.",
      inputSchema: objectSchema(
        {
          summary: text2("One sentence: what conflicts with what", 300),
          details: text2("What you tried, what the rule requires, and what would resolve it", 8e3),
          rule_id: text2("Id of the rule or invariant involved, if any", 80),
          paths: { type: "array", items: { type: "string" }, maxItems: 100, description: "Repository-relative paths involved" },
          agent: text2("Your name, e.g. Claude Code", 120)
        },
        ["summary"]
      ),
      annotations: WRITES_NOTE,
      handler: reportConflict
    }
  ];
}
var SERVER_INSTRUCTIONS, USAGE_HINT, READ_ONLY, WRITES_NOTE, NO_ARGUMENTS, CACHE_TTL_MS, MAX_FINDINGS, MAX_LOCATIONS2;
var init_tools = __esm({
  "src/cli/mcp/tools.ts"() {
    "use strict";
    init_report();
    init_schema();
    init_workspace();
    init_context();
    init_gate();
    init_git();
    init_io();
    init_repo_path();
    init_util();
    init_protocol();
    SERVER_INSTRUCTIONS = [
      "This repository has a human-owned architecture contract (.rassam/blueprint.json). Changes are checked against it in CI, judged by the base branch's copy, so editing the contract does not relax the rules for your change.",
      "Call explain_path before editing a file, check_dependency before adding an import, and check_changes before you finish.",
      "If the task cannot be done without breaking a rule, weakening a test or check, or editing the blueprint, stop and call report_conflict instead, then tell the user. Use propose_change to suggest a contract change for a human to review."
    ].join(" ");
    USAGE_HINT = "Before editing a file call explain_path. Before adding an import call check_dependency. Before finishing call check_changes. If the task conflicts with a rule, call report_conflict and stop instead of weakening tests, checks or the blueprint. Never edit .rassam/blueprint.json yourself: call propose_change.";
    READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    WRITES_NOTE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
    NO_ARGUMENTS = { type: "object", additionalProperties: false };
    CACHE_TTL_MS = 2e3;
    MAX_FINDINGS = 20;
    MAX_LOCATIONS2 = 5;
  }
});

// src/cli/commands/mcp.ts
var mcp_exports = {};
__export(mcp_exports, {
  mcpCommand: () => mcpCommand
});
async function mcpCommand(args, io) {
  if (!io.stdin || !io.stdoutStream) throw new CliError("rassam mcp needs stdin and stdout streams");
  const { root } = await resolveRoot(io, stringFlag(args, "root"));
  const log = (message) => io.stderr(`[rassam mcp] ${message}
`);
  const redirect = (...parts) => log(parts.map(String).join(" "));
  console.log = redirect;
  console.info = redirect;
  console.debug = redirect;
  log(`serving ${root} (rassam ${ENGINE_VERSION})`);
  await serveMcp(
    { name: "rassam", title: "Rassam Blueprint", version: ENGINE_VERSION, instructions: SERVER_INSTRUCTIONS, tools: createTools({ root, log }), log },
    io.stdin,
    io.stdoutStream
  );
  return EXIT_OK;
}
var init_mcp = __esm({
  "src/cli/commands/mcp.ts"() {
    "use strict";
    init_constants();
    init_args();
    init_context();
    init_io();
    init_protocol();
    init_tools();
  }
});

// src/cli/index.ts
init_io();

// src/cli/main.ts
init_constants();
init_args();
init_io();
init_util();
var LOADERS = {
  init: async () => (await Promise.resolve().then(() => (init_init(), init_exports))).initCommand,
  check: async () => (await Promise.resolve().then(() => (init_check2(), check_exports))).checkCommand,
  explain: async () => (await Promise.resolve().then(() => (init_query(), query_exports))).explainCommand,
  impact: async () => (await Promise.resolve().then(() => (init_query(), query_exports))).impactCommand,
  graph: async () => (await Promise.resolve().then(() => (init_query(), query_exports))).graphCommand,
  reach: async () => (await Promise.resolve().then(() => (init_query(), query_exports))).reachCommand,
  verify: async () => (await Promise.resolve().then(() => (init_verify2(), verify_exports))).verifyCommand,
  sync: async () => (await Promise.resolve().then(() => (init_sync2(), sync_exports))).syncCommand,
  proposals: async () => (await Promise.resolve().then(() => (init_proposals(), proposals_exports))).proposalsCommand,
  schema: async () => (await Promise.resolve().then(() => (init_schema2(), schema_exports))).schemaCommand,
  mcp: async () => (await Promise.resolve().then(() => (init_mcp(), mcp_exports))).mcpCommand
};
function reportError(error51, io) {
  if (error51 instanceof UsageError) {
    io.stderr(`rassam: ${error51.message}
`);
    io.stderr(error51.command ? `Run "rassam ${error51.command} --help" for usage.
` : 'Run "rassam --help" for usage.\n');
    return EXIT_USAGE;
  }
  if (error51 instanceof CliError) {
    io.stderr(`rassam: ${error51.message}
`);
    if (error51.hint) io.stderr(`  ${error51.hint}
`);
    return error51.exitCode;
  }
  io.stderr(`rassam: unexpected error: ${errorMessage(error51)}
`);
  if (io.env.RASSAM_DEBUG && error51 instanceof Error && error51.stack) io.stderr(`${error51.stack}
`);
  else io.stderr("  Set RASSAM_DEBUG=1 for a stack trace.\n");
  return EXIT_USAGE;
}
async function main(argv, io) {
  try {
    const args = parseArgs(argv);
    if (args.version && !args.command) {
      io.stdout(`${ENGINE_VERSION}
`);
      return EXIT_OK;
    }
    const spec = args.command ? findCommand(args.command) : void 0;
    if (!spec) {
      const help = generalHelp(ENGINE_VERSION);
      if (args.help) {
        io.stdout(help);
        return EXIT_OK;
      }
      io.stderr(help);
      return EXIT_USAGE;
    }
    if (args.help) {
      io.stdout(commandHelp(spec));
      return EXIT_OK;
    }
    if (args.version) {
      io.stdout(`${ENGINE_VERSION}
`);
      return EXIT_OK;
    }
    const handler = await LOADERS[spec.name]();
    return await handler(args, io);
  } catch (error51) {
    return reportError(error51, io);
  }
}

// src/cli/index.ts
function exit(code) {
  process.exitCode = code;
  process.stdout.write("", () => process.exit(code));
}
process.stdout.on("error", (error51) => {
  if (error51.code === "EPIPE") process.exit(process.exitCode ?? 0);
});
main(process.argv.slice(2), processIo()).then(exit, (error51) => {
  process.stderr.write(`rassam: ${error51 instanceof Error ? error51.stack ?? error51.message : String(error51)}
`);
  exit(2);
});
