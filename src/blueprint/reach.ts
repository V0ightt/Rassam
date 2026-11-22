// Agent reach: which agent configuration files exist, which MCP servers and
// permissions they grant, which secrets are pasted inline, and which
// components read which environment variables. Secret values never leave this
// module: outputs carry names, locations and redacted previews only.

import { isSecretLikeName } from "./env";
import { compileGlob } from "./glob";
import { repoPath } from "./paths";
import type {
  AgentConfigFile,
  ComponentMembership,
  FileGraph,
  InlineSecret,
  McpServerRef,
  PermissionGrant,
  ReachReport,
  SourceFile,
} from "./types";

// ── Agent config classification ───────────────────────────────

interface ConfigRule {
  glob: string;
  type: AgentConfigFile["type"];
  agent: string;
}

/** Ordered: the first matching rule wins, so specific locations come first. */
const CONFIG_RULES: readonly ConfigRule[] = [
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
  { glob: "**/.github/workflows/*.yaml", type: "workflow", agent: "GitHub Actions" },
];

export const AGENT_CONFIG_GLOBS: readonly string[] = CONFIG_RULES.map((rule) => rule.glob);

export function classifyAgentConfig(path: string): AgentConfigFile | null {
  const normalized = repoPath(path);
  if (!normalized) return null;
  const rule = CONFIG_RULES.find((candidate) => compileGlob(candidate.glob).test(normalized));
  return rule ? { path: normalized, type: rule.type, agent: rule.agent } : null;
}

export function isAgentConfigPath(path: string): boolean {
  return classifyAgentConfig(path) !== null;
}

// ── Small shared helpers ──────────────────────────────────────

type Dict = Record<string, unknown>;

/** A string value in a parsed config, with its key path and source span. */
interface Leaf {
  path: string[];
  value: string;
  start: number;
  end: number;
}

interface ParsedDoc {
  value: unknown;
  leaves: Leaf[];
}

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newDict(): Dict {
  return Object.create(null) as Dict;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let index = content.indexOf("\n"); index >= 0 && index < offset; index = content.indexOf("\n", index + 1)) {
    line += 1;
  }
  return line;
}

function isToml(path: string): boolean {
  return /\.toml$/i.test(path);
}

function isYaml(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}

// ── Tolerant JSON (comments, trailing commas, single quotes) ──

const MAX_DEPTH = 64;

class ParseError extends Error {}

interface Cursor {
  text: string;
  pos: number;
  leaves: Leaf[];
}

function skipJsonTrivia(cursor: Cursor): void {
  const { text } = cursor;
  while (cursor.pos < text.length) {
    const char = text[cursor.pos];
    if (char === " " || char === "\t" || char === "\n" || char === "\r" || char === "﻿") {
      cursor.pos += 1;
    } else if (char === "/" && text[cursor.pos + 1] === "/") {
      const newline = text.indexOf("\n", cursor.pos);
      cursor.pos = newline < 0 ? text.length : newline;
    } else if (char === "/" && text[cursor.pos + 1] === "*") {
      const close = text.indexOf("*/", cursor.pos + 2);
      cursor.pos = close < 0 ? text.length : close + 2;
    } else {
      return;
    }
  }
}

const JSON_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };

/** Reads a quoted string with backslash escapes; shared by JSON and TOML basic strings. */
function readQuoted(cursor: Cursor): string {
  const { text } = cursor;
  const quote = text[cursor.pos];
  let result = "";
  cursor.pos += 1;
  while (cursor.pos < text.length) {
    const char = text[cursor.pos];
    if (char === quote) {
      cursor.pos += 1;
      return result;
    }
    if (char === "\n") break;
    if (char === "\\") {
      const next = text[cursor.pos + 1];
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(cursor.pos + 2, cursor.pos + 6))) {
        result += String.fromCharCode(parseInt(text.slice(cursor.pos + 2, cursor.pos + 6), 16));
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

function readJsonValue(cursor: Cursor, path: string[], depth: number): unknown {
  if (depth > MAX_DEPTH) throw new ParseError("too deep");
  skipJsonTrivia(cursor);
  const { text } = cursor;
  const char = text[cursor.pos];
  if (char === undefined) throw new ParseError("unexpected end");

  if (char === "{") {
    cursor.pos += 1;
    const result = newDict();
    for (;;) {
      skipJsonTrivia(cursor);
      if (text[cursor.pos] === "}") {
        cursor.pos += 1;
        return result;
      }
      if (text[cursor.pos] !== "\"" && text[cursor.pos] !== "'") throw new ParseError("expected key");
      const key = readQuoted(cursor);
      skipJsonTrivia(cursor);
      if (text[cursor.pos] !== ":") throw new ParseError("expected ':'");
      cursor.pos += 1;
      result[key] = readJsonValue(cursor, [...path, key], depth + 1);
      skipJsonTrivia(cursor);
      if (text[cursor.pos] === ",") cursor.pos += 1;
      else if (text[cursor.pos] !== "}") throw new ParseError("expected ',' or '}'");
    }
  }

  if (char === "[") {
    cursor.pos += 1;
    const result: unknown[] = [];
    for (;;) {
      skipJsonTrivia(cursor);
      if (text[cursor.pos] === "]") {
        cursor.pos += 1;
        return result;
      }
      result.push(readJsonValue(cursor, [...path, String(result.length)], depth + 1));
      skipJsonTrivia(cursor);
      if (text[cursor.pos] === ",") cursor.pos += 1;
      else if (text[cursor.pos] !== "]") throw new ParseError("expected ',' or ']'");
    }
  }

  if (char === "\"" || char === "'") {
    const start = cursor.pos;
    const value = readQuoted(cursor);
    cursor.leaves.push({ path, value, start, end: cursor.pos });
    return value;
  }

  const bare = /^[-+.\w]+/.exec(text.slice(cursor.pos, cursor.pos + 64));
  if (!bare) throw new ParseError("unexpected character");
  cursor.pos += bare[0].length;
  if (bare[0] === "true") return true;
  if (bare[0] === "false") return false;
  if (bare[0] === "null") return null;
  const numeric = Number(bare[0]);
  if (Number.isNaN(numeric)) throw new ParseError("unexpected token");
  return numeric;
}

function parseJsonc(content: string): ParsedDoc | null {
  const cursor: Cursor = { text: content, pos: 0, leaves: [] };
  try {
    const value = readJsonValue(cursor, [], 0);
    skipJsonTrivia(cursor);
    if (cursor.pos < content.length) return null;
    return { value, leaves: cursor.leaves };
  } catch {
    return null;
  }
}

// ── Minimal TOML subset ───────────────────────────────────────
// Tables, dotted and quoted keys, basic/literal/multi-line strings, arrays,
// inline tables, booleans and numbers. Lines it cannot read are skipped.

function skipTomlSpace(cursor: Cursor, newlines: boolean): void {
  const { text } = cursor;
  while (cursor.pos < text.length) {
    const char = text[cursor.pos];
    if (char === " " || char === "\t" || char === "\r" || char === "﻿" || (newlines && char === "\n")) {
      cursor.pos += 1;
    } else if (char === "#") {
      const newline = text.indexOf("\n", cursor.pos);
      cursor.pos = newline < 0 ? text.length : newline;
    } else {
      return;
    }
  }
}

function readTomlLiteral(cursor: Cursor): string {
  const close = cursor.text.indexOf("'", cursor.pos + 1);
  const newline = cursor.text.indexOf("\n", cursor.pos);
  if (close < 0 || (newline >= 0 && newline < close)) throw new ParseError("unterminated string");
  const value = cursor.text.slice(cursor.pos + 1, close);
  cursor.pos = close + 1;
  return value;
}

function readTomlString(cursor: Cursor): string {
  const { text } = cursor;
  const quote = text[cursor.pos];
  const triple = quote.repeat(3);
  if (text.startsWith(triple, cursor.pos)) {
    const close = text.indexOf(triple, cursor.pos + 3);
    if (close < 0) throw new ParseError("unterminated string");
    const value = text.slice(cursor.pos + 3, close).replace(/^\r?\n/, "");
    cursor.pos = close + 3;
    return value;
  }
  return quote === "'" ? readTomlLiteral(cursor) : readQuoted(cursor);
}

function readTomlKey(cursor: Cursor): string[] {
  const { text } = cursor;
  const keys: string[] = [];
  for (;;) {
    skipTomlSpace(cursor, false);
    const char = text[cursor.pos];
    if (char === "\"" || char === "'") {
      keys.push(char === "'" ? readTomlLiteral(cursor) : readQuoted(cursor));
    } else {
      const bare = /^[A-Za-z0-9_-]+/.exec(text.slice(cursor.pos, cursor.pos + 200));
      if (!bare) throw new ParseError("expected key");
      keys.push(bare[0]);
      cursor.pos += bare[0].length;
    }
    skipTomlSpace(cursor, false);
    if (text[cursor.pos] !== ".") return keys;
    cursor.pos += 1;
  }
}

function tomlDescend(root: Dict, keys: readonly string[]): Dict {
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

function readTomlValue(cursor: Cursor, path: string[], depth: number): unknown {
  if (depth > MAX_DEPTH) throw new ParseError("too deep");
  const { text } = cursor;
  const char = text[cursor.pos];

  if (char === "\"" || char === "'") {
    const start = cursor.pos;
    const value = readTomlString(cursor);
    cursor.leaves.push({ path, value, start, end: cursor.pos });
    return value;
  }

  if (char === "[") {
    cursor.pos += 1;
    const result: unknown[] = [];
    for (;;) {
      skipTomlSpace(cursor, true);
      if (text[cursor.pos] === "]") {
        cursor.pos += 1;
        return result;
      }
      if (cursor.pos >= text.length) throw new ParseError("unterminated array");
      result.push(readTomlValue(cursor, [...path, String(result.length)], depth + 1));
      skipTomlSpace(cursor, true);
      if (text[cursor.pos] === ",") cursor.pos += 1;
      else if (text[cursor.pos] !== "]") throw new ParseError("expected ',' or ']'");
    }
  }

  if (char === "{") {
    cursor.pos += 1;
    const result = newDict();
    for (;;) {
      skipTomlSpace(cursor, true);
      if (text[cursor.pos] === "}") {
        cursor.pos += 1;
        return result;
      }
      if (cursor.pos >= text.length) throw new ParseError("unterminated table");
      const keys = readTomlKey(cursor);
      if (text[cursor.pos] !== "=") throw new ParseError("expected '='");
      cursor.pos += 1;
      skipTomlSpace(cursor, false);
      const last = keys[keys.length - 1];
      tomlDescend(result, keys.slice(0, -1))[last] = readTomlValue(cursor, [...path, ...keys], depth + 1);
      skipTomlSpace(cursor, true);
      if (text[cursor.pos] === ",") cursor.pos += 1;
      else if (text[cursor.pos] !== "}") throw new ParseError("expected ',' or '}'");
    }
  }

  const bare = /^[^\s,\]}#]+/.exec(text.slice(cursor.pos, cursor.pos + 200));
  if (!bare) throw new ParseError("expected value");
  cursor.pos += bare[0].length;
  if (bare[0] === "true") return true;
  if (bare[0] === "false") return false;
  const numeric = Number(bare[0].replace(/_/g, ""));
  return Number.isNaN(numeric) ? bare[0] : numeric;
}

function parseToml(content: string): ParsedDoc {
  const cursor: Cursor = { text: content, pos: 0, leaves: [] };
  const root = newDict();
  let tablePath: string[] = [];
  let table = root;

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
        table = tomlDescend(root, keys);
      } else {
        const keys = readTomlKey(cursor);
        if (content[cursor.pos] !== "=") throw new ParseError("expected '='");
        cursor.pos += 1;
        skipTomlSpace(cursor, false);
        const value = readTomlValue(cursor, [...tablePath, ...keys], 0);
        tomlDescend(table, keys.slice(0, -1))[keys[keys.length - 1]] = value;
      }
      skipTomlSpace(cursor, false);
      if (cursor.pos < content.length && content[cursor.pos] !== "\n") throw new ParseError("trailing characters");
    } catch {
      // Unsupported syntax: drop the line and carry on with the next one.
      cursor.leaves.length = leafCount;
      const newline = content.indexOf("\n", lineStart);
      cursor.pos = newline < 0 ? content.length : newline + 1;
    }
  }
  return { value: root, leaves: cursor.leaves };
}

function parseConfig(path: string, content: string): ParsedDoc | null {
  if (isToml(path)) return parseToml(content);
  if (isYaml(path) || /\.(?:md|mdc|txt)$/i.test(path)) return null;
  return parseJsonc(content);
}

// ── Secret formats, placeholders and redaction ────────────────

interface TokenFormat {
  kind: string;
  source: string;
  /** Fixed, non-secret marker text: skip the entropy sanity check. */
  marker?: boolean;
}

const NOT_ALNUM_BEFORE = "(?<![A-Za-z0-9])";

const TOKEN_FORMATS: readonly TokenFormat[] = [
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
    source: `${NOT_ALNUM_BEFORE}eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}`,
  },
];

const TOKEN_REGEX = new RegExp(TOKEN_FORMATS.map((format) => `(${format.source})`).join("|"), "g");

/** `scheme://user:password@host` — group 1 is the user, group 2 the password. */
const URL_CREDENTIALS = "[A-Za-z][A-Za-z0-9+.-]*://([^\\s/:@\"'`]*):([^\\s/@\"'`]+)@";

const WEAK_PASSWORDS = new Set(["password", "pass", "passwd", "secret", "postgres", "root", "admin", "user", "example"]);

const MIN_TOKEN_ENTROPY = 2.5;
const MIN_LITERAL_LENGTH = 16;
const MIN_LITERAL_ENTROPY = 3.5;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  const length = [...value].length;
  let entropy = 0;
  for (const count of counts.values()) {
    const share = count / length;
    entropy -= share * Math.log2(share);
  }
  return entropy;
}

const PLACEHOLDER_WHOLE = [
  /^\$\{[^}]*\}$/,
  /^\$[A-Za-z_]\w*$/,
  /^\{env:[^}]+\}$/i,
  /^<[^>]*>$/,
  /^\[[^\]]*\]$/,
  /^%\w+%$/,
  /^(?:your|my|insert|replace|put|enter|add|example|sample|dummy|placeholder|changeme|change[-_ ]?me|todo|redacted|none|null|undefined)(?![a-z0-9])/i,
  /^x{3,}/i,
  /^[*.xX\-_ ]+$/,
];

function isPlaceholder(raw: string): boolean {
  const value = raw.trim().replace(/^(?:bearer|basic|token)\s+/i, "");
  if (!value) return true;
  if (value.includes("${") || value.includes("{{") || /\{env:/i.test(value) || /\$\(/.test(value)) return true;
  if (/example/i.test(value)) return true;
  return PLACEHOLDER_WHOLE.some((regex) => regex.test(value));
}

/** Values under a secret-like key that are references, not secrets. */
function isReferenceValue(value: string): boolean {
  const trimmed = value.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return true; // an env var name
  if (/^(?:\/|\.{1,2}\/|~\/|[A-Za-z]:[\\/])/.test(trimmed)) return true; // a file path
  if (/^[a-z][a-z0-9+.-]*:\/\/\S*$/i.test(trimmed)) return true; // a URL: covered by the URL rules
  return false;
}

function redactedPreview(secret: string): string {
  const chars = [...secret];
  return `${chars.slice(0, 4).join("")}…${chars.slice(-2).join("")} (${chars.length} chars)`;
}

const REDACTED = "[redacted]";

/** Removes anything that looks like a credential from text shown to users. */
function redactText(text: string): string {
  return text
    .replace(new RegExp(TOKEN_REGEX.source, "g"), REDACTED)
    .replace(new RegExp(URL_CREDENTIALS, "g"), (match: string, _user: string, password: string) =>
      isPlaceholder(password) ? match : match.replace(`:${password}@`, `:${REDACTED}@`),
    )
    .replace(/([?&])([^=&\s]+)=([^&\s]+)/g, (match: string, separator: string, key: string, value: string) =>
      isSecretLikeName(key) && !isPlaceholder(value) ? `${separator}${key}=${REDACTED}` : match,
    );
}

const FLAG_ASSIGNMENT = /^(-{0,2}[A-Za-z][\w.-]*)=([\s\S]+)$/;
const BARE_FLAG = /^--?[A-Za-z][\w.-]*$/;

function redactArgs(args: readonly string[]): string[] {
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

// ── MCP servers ───────────────────────────────────────────────

const MAX_COMMAND_LENGTH = 300;

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function serverMaps(root: unknown): Dict[] {
  if (!isDict(root)) return [];
  const candidates = [root.mcpServers, root.servers, root.mcp_servers, isDict(root.mcp) ? root.mcp.servers : undefined];
  return candidates.filter(isDict);
}

function toServerRef(name: string, entry: Dict, configPath: string, agent: string): McpServerRef {
  const command = stringOf(entry.command);
  const url = stringOf(entry.url) ?? stringOf(entry.serverUrl) ?? stringOf(entry.httpUrl);
  const type = stringOf(entry.type)?.toLowerCase() ?? stringOf(entry.transport)?.toLowerCase();
  let transport: McpServerRef["transport"] = "unknown";
  if (url) transport = "http";
  else if (command) transport = "stdio";
  else if (type === "stdio") transport = "stdio";
  else if (type === "http" || type === "sse" || type === "streamable-http" || type === "streamable_http") transport = "http";

  const env = new Set<string>([...(isDict(entry.env) ? Object.keys(entry.env) : []), ...stringsOf(entry.env_vars)]);
  const ref: McpServerRef = { name, configPath, agent, transport, env: [...env].sort(compare) };
  if (command) {
    const full = [redactText(command), ...redactArgs(stringsOf(entry.args))].join(" ");
    ref.command = full.length > MAX_COMMAND_LENGTH ? `${full.slice(0, MAX_COMMAND_LENGTH)}…` : full;
  }
  if (url) ref.url = redactText(url);
  return ref;
}

export function parseMcpServers(path: string, content: string): McpServerRef[] {
  try {
    const configPath = repoPath(path);
    const doc = isToml(configPath) ? parseToml(content) : parseJsonc(content);
    if (!doc) return [];
    const agent = classifyAgentConfig(configPath)?.agent ?? (isToml(configPath) ? "Codex" : "MCP");
    const servers = new Map<string, McpServerRef>();
    for (const map of serverMaps(doc.value)) {
      for (const [name, entry] of Object.entries(map)) {
        if (isDict(entry) && !servers.has(name)) servers.set(name, toServerRef(name, entry, configPath, agent));
      }
    }
    return [...servers.values()].sort((a, b) => compare(a.name, b.name));
  } catch {
    return [];
  }
}

// ── Permissions ───────────────────────────────────────────────

const DANGEROUS_COMMANDS = "sudo|curl|wget|rm|bash|sh|zsh|eval|ssh|powershell|pwsh";
const DANGEROUS_BASH = new RegExp(`^(?:${DANGEROUS_COMMANDS})(?:\\s+-[\\w-]+)*\\s*(?::?\\*)?$`);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const WILDCARD_ONLY = /^[*/.:\s]*\*[*/.:\s]*$/;

/** Heuristic: does this Claude Code permission rule grant unconstrained reach? */
function isBroadClaudeRule(rule: string): boolean {
  const text = rule.trim();
  if (!text || WILDCARD_ONLY.test(text)) return true;

  if (text.startsWith("mcp__")) {
    const rest = text.slice(5);
    const separator = rest.indexOf("__");
    return separator < 0 || WILDCARD_ONLY.test(rest.slice(separator + 2)) || rest.startsWith("*");
  }

  const call = /^([A-Za-z_]\w*)\(([\s\S]*)\)$/.exec(text);
  const tool = call ? call[1] : text;
  const argument = call ? call[2].trim() : null;

  if (argument !== null && (argument === "" || WILDCARD_ONLY.test(argument))) return true;
  if (tool === "Bash") return argument === null || DANGEROUS_BASH.test(argument);
  if (tool === "WebFetch") return argument === null || /^domain:\s*\*$/.test(argument);
  if (WRITE_TOOLS.has(tool)) return argument === null;
  return false;
}

const CLAUDE_EFFECTS: ReadonlyArray<PermissionGrant["effect"]> = ["allow", "deny", "ask"];

function claudePermissions(path: string, agent: string, root: unknown): PermissionGrant[] {
  if (!isDict(root)) return [];
  const grants: PermissionGrant[] = [];
  const permissions = isDict(root.permissions) ? root.permissions : newDict();
  for (const effect of CLAUDE_EFFECTS) {
    for (const rule of stringsOf(permissions[effect])) {
      // Only an allow rule extends reach; a broad deny or ask narrows it.
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

function codexPermissions(path: string, agent: string, root: unknown): PermissionGrant[] {
  if (!isDict(root)) return [];
  const grants: PermissionGrant[] = [];
  const scan = (table: Dict, prefix: string): void => {
    if (table.approval_policy === "never") {
      grants.push({ path, agent, effect: "allow", rule: `${prefix}approval_policy = "never"`, broad: true });
    }
    if (table.sandbox_mode === "danger-full-access") {
      grants.push({ path, agent, effect: "allow", rule: `${prefix}sandbox_mode = "danger-full-access"`, broad: true });
    }
  };
  scan(root, "");
  if (isDict(root.profiles)) {
    for (const name of Object.keys(root.profiles).sort(compare)) {
      const profile = root.profiles[name];
      if (isDict(profile)) scan(profile, `profiles.${name}.`);
    }
  }
  return grants;
}

interface YamlLine {
  indent: number;
  text: string;
}

/** Drops a trailing `# comment` that is outside quotes. */
function stripYamlComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function yamlLines(content: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const text = stripYamlComment(raw).replace(/\s+$/, "");
    if (!text.trim()) continue;
    lines.push({ indent: text.length - text.trimStart().length, text: text.trim() });
  }
  return lines;
}

const WRITE_ALL = /^permissions\s*:\s*["']?write-all["']?$/;
const PR_TARGET_INLINE = /^["']?on["']?\s*:.*\bpull_request_target\b/;
const PR_TARGET_ITEM = /^(?:-\s*)?pull_request_target\s*:?(?:\s*\{.*\}|\s*\[.*\])?$/;
const CHECKOUT_STEP = /^(?:-\s*)?uses\s*:\s*["']?actions\/checkout@/;
const PR_HEAD_REF =
  /^ref\s*:.*(github\.event\.pull_request\.head\.(?:sha|ref)|github\.head_ref|refs\/pull\/\$\{\{\s*github\.event\.(?:pull_request\.)?number\s*\}\}\/(?:head|merge))/;

/** Groups workflow lines into `- ...` list items (steps), by indentation. */
function yamlListItems(lines: readonly YamlLine[]): YamlLine[][] {
  const items: YamlLine[][] = [];
  let current: YamlLine[] | null = null;
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

function workflowPermissions(path: string, agent: string, content: string): PermissionGrant[] {
  const lines = yamlLines(content);
  const rules = new Set<string>();

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

  return [...rules].map((rule) => ({ path, agent, effect: "allow" as const, rule, broad: true }));
}

export function parsePermissions(path: string, content: string): PermissionGrant[] {
  try {
    const normalized = repoPath(path);
    const config = classifyAgentConfig(normalized);
    const type = config?.type;
    if (type === "workflow" || (!config && isYaml(normalized))) {
      return workflowPermissions(normalized, config?.agent ?? "GitHub Actions", content);
    }
    if (type === "codex-config" || (!config && isToml(normalized))) {
      return codexPermissions(normalized, config?.agent ?? "Codex", parseToml(content).value);
    }
    if (type === "claude-settings" || (!config && /\.json[c5]?$/i.test(normalized))) {
      return claudePermissions(normalized, config?.agent ?? "Claude Code", parseJsonc(content)?.value);
    }
    return [];
  } catch {
    return [];
  }
}

// ── Inline secrets ────────────────────────────────────────────

interface SecretHit {
  start: number;
  kind: string;
  secret: string;
  preview: string;
  location?: string;
}

function tokenHits(content: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const regex = new RegExp(TOKEN_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const format = TOKEN_FORMATS[match.slice(1).findIndex((group) => group !== undefined)];
    const secret = match[0];
    if (format.marker) {
      hits.push({ start: match.index, kind: format.kind, secret, preview: `${secret} (key block)` });
    } else if (shannonEntropy(secret) >= MIN_TOKEN_ENTROPY && !/EXAMPLE/i.test(secret)) {
      hits.push({ start: match.index, kind: format.kind, secret, preview: redactedPreview(secret) });
    }
  }
  return hits;
}

function urlCredentialHits(content: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const regex = new RegExp(URL_CREDENTIALS, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const user = match[1];
    const password = match[2];
    if (isPlaceholder(password) || password === user || WEAK_PASSWORDS.has(password.toLowerCase())) continue;
    const start = match.index + match[0].length - password.length - 1;
    hits.push({ start, kind: "url-credentials", secret: password, preview: redactedPreview(password) });
  }
  return hits;
}

const QUERY_PARAM = "[?&]([A-Za-z][\\w.-]*)=([^&\\s\"'`#]+)";

/** `?api_key=…` style credentials in URLs. */
function queryParamHits(content: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const regex = new RegExp(QUERY_PARAM, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const value = match[2];
    if (!isSecretLikeName(match[1]) || value.length < MIN_LITERAL_LENGTH || isPlaceholder(value)) continue;
    if (shannonEntropy(value) < MIN_LITERAL_ENTROPY) continue;
    const start = match.index + match[0].length - value.length;
    hits.push({ start, kind: "high-entropy-secret", secret: value, preview: redactedPreview(value) });
  }
  return hits;
}

/** The key a string leaf answers to: its map key, or the flag an argument belongs to. */
function leafKeyAndValue(leaf: Leaf, previous: Leaf | undefined): { key: string; value: string } | null {
  const key = leaf.path[leaf.path.length - 1];
  if (key === undefined) return null;
  if (!/^\d+$/.test(key)) return { key, value: leaf.value };

  const assignment = FLAG_ASSIGNMENT.exec(leaf.value);
  if (assignment) return { key: assignment[1], value: assignment[2] };
  const sameArray =
    previous !== undefined &&
    previous.path.length === leaf.path.length &&
    previous.path.slice(0, -1).join("\u0000") === leaf.path.slice(0, -1).join("\u0000");
  if (sameArray && BARE_FLAG.test(previous.value)) return { key: previous.value, value: leaf.value };
  return null;
}

function literalHits(leaves: readonly Leaf[], skip: ReadonlySet<Leaf | undefined>): SecretHit[] {
  const hits: SecretHit[] = [];
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
      location: leaf.path.join("."),
    });
  });
  return hits;
}

export function detectInlineSecrets(path: string, content: string): InlineSecret[] {
  if (!content) return [];
  try {
    const normalized = repoPath(path);
    const leaves = parseConfig(normalized, content)?.leaves ?? [];
    const leafAt = (offset: number): Leaf | undefined => leaves.find((leaf) => offset >= leaf.start && offset < leaf.end);

    const formatHits = [...tokenHits(content), ...urlCredentialHits(content), ...queryParamHits(content)];
    // A value already identified by its format is not reported again as a generic literal.
    const generic = literalHits(leaves, new Set(formatHits.map((hit) => leafAt(hit.start))));

    const seen = new Set<string>();
    const secrets: InlineSecret[] = [];
    for (const hit of [...formatHits, ...generic]) {
      const line = lineAt(content, hit.start);
      const key = `${line}\u0000${hit.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dotted = hit.location ?? leafAt(hit.start)?.path.join(".");
      secrets.push({ path: normalized, line, location: dotted || `line ${line}`, preview: hit.preview, kind: hit.kind });
    }
    return secrets.sort((a, b) => a.line - b.line || compare(a.kind, b.kind));
  } catch {
    return [];
  }
}

/** At least ~3 lines of base64 key material follow the BEGIN header. */
function hasKeyBody(content: string, from: number): boolean {
  const window = content.slice(from, from + 600).replace(/\\n|\\r|["'`+,\s]/g, "");
  return /^[A-Za-z0-9+/=]{150,}/.test(window);
}

/**
 * High-precision scan for credentials with a recognizable format (provider
 * token prefixes, private key blocks) in any committed text file. Generic
 * high-entropy literals are only considered inside agent configuration.
 */
export function detectKnownTokens(path: string, content: string): InlineSecret[] {
  if (!content) return [];
  try {
    const normalized = repoPath(path);
    const seen = new Set<string>();
    const secrets: InlineSecret[] = [];
    for (const hit of tokenHits(content)) {
      // A header string alone (common in tests and docs) is not a key.
      if (hit.kind === "private-key" && !hasKeyBody(content, hit.start + hit.secret.length)) continue;
      const line = lineAt(content, hit.start);
      const key = `${line}\u0000${hit.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      secrets.push({ path: normalized, line, location: `line ${line}`, preview: hit.preview, kind: hit.kind });
    }
    return secrets;
  } catch {
    return [];
  }
}

// ── Reach report ──────────────────────────────────────────────

function envAccess(graph: FileGraph, membership: ComponentMembership | undefined): ReachReport["envAccess"] {
  const byName = new Map<string, { secretLike: boolean; readers: Set<string>; files: Set<string> }>();
  for (const [path, facts] of graph.facts) {
    for (const ref of facts.envRefs) {
      const file = ref.file || path;
      const entry = byName.get(ref.name) ?? { secretLike: false, readers: new Set<string>(), files: new Set<string>() };
      entry.secretLike = entry.secretLike || ref.secretLike || isSecretLikeName(ref.name);
      entry.readers.add(membership?.fileToComponent.get(file) ?? file);
      entry.files.add(file);
      byName.set(ref.name, entry);
    }
  }
  return [...byName.entries()]
    .map(([name, entry]) => ({
      name,
      secretLike: entry.secretLike,
      readers: [...entry.readers].sort(compare),
      files: [...entry.files].sort(compare),
    }))
    .sort((a, b) => compare(a.name, b.name));
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(keyOf(item))) seen.set(keyOf(item), item);
  return [...seen.keys()].sort(compare).map((key) => seen.get(key) as T);
}

export function analyzeReach(
  files: readonly SourceFile[],
  graph: FileGraph,
  membership?: ComponentMembership,
): ReachReport {
  const configs: AgentConfigFile[] = [];
  const mcpServers: McpServerRef[] = [];
  const inlineSecrets: InlineSecret[] = [];
  const permissions: PermissionGrant[] = [];

  for (const file of files) {
    const config = classifyAgentConfig(file.path);
    if (!config) {
      if (file.content !== null) inlineSecrets.push(...detectKnownTokens(file.path, file.content));
      continue;
    }
    configs.push(config);
    if (file.content === null) continue;
    if (config.type === "mcp" || config.type === "codex-config" || config.type === "gemini-settings" || config.type === "claude-settings") {
      mcpServers.push(...parseMcpServers(config.path, file.content));
    }
    if (config.type === "claude-settings" || config.type === "codex-config" || config.type === "workflow") {
      permissions.push(...parsePermissions(config.path, file.content));
    }
    inlineSecrets.push(...detectInlineSecrets(config.path, file.content));
  }

  const pad = (line: number): string => String(line).padStart(9, "0");
  return {
    configs: uniqueBy(configs, (config) => config.path),
    mcpServers: uniqueBy(mcpServers, (server) => `${server.configPath}\u0000${server.name}`),
    inlineSecrets: uniqueBy(inlineSecrets, (secret) => `${secret.path}\u0000${pad(secret.line)}\u0000${secret.kind}`),
    permissions: uniqueBy(permissions, (grant) => `${grant.path}\u0000${grant.effect}\u0000${grant.rule}`),
    envAccess: envAccess(graph, membership),
  };
}
