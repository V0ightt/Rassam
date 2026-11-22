// Extraction of environment-variable reads across languages. Regex based and
// best effort: comments are blanked first (offsets preserved) so that line
// numbers stay exact and commented-out code is ignored.

import type { EnvRef, Language } from "./types";

// ── Secret-like names ─────────────────────────────────────────

const SECRET_WORDS = new RegExp(
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
    "_PWD(?:_|$)",
  ].join("|"),
);

/** Words that stay secret even behind a "public" prefix such as NEXT_PUBLIC_. */
const CLEARLY_SECRET = /SECRET|PASSWORD|PASSWD|PRIVATE_?KEY|CREDENTIAL|DATABASE_?URL|CONNECTION_?STRING|SIGNING/;

const PUBLIC_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;

/** LLM token budgets (MAX_TOKENS, TOKEN_LIMIT) are counts, not credentials. */
const TOKEN_COUNT = /(?:^|_)(?:MAX|MIN|NUM|TOTAL|INPUT|OUTPUT|CONTEXT)_(?:[A-Z0-9]+_)*TOKENS?(?:_|$)|TOKENS?_(?:LIMIT|COUNT|BUDGET|PER)(?:_|$)/;

function normalizeName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-.\s]+/g, "_")
    .toUpperCase();
}

export function isSecretLikeName(name: string): boolean {
  const normalized = normalizeName(name);
  if (PUBLIC_PREFIX.test(normalized)) {
    return CLEARLY_SECRET.test(normalized.replace(PUBLIC_PREFIX, ""));
  }
  const candidate = TOKEN_COUNT.test(normalized) ? normalized.replace(/TOKENS?/g, "") : normalized;
  return SECRET_WORDS.test(candidate);
}

// ── Comment blanking ──────────────────────────────────────────

interface CommentStyle {
  /** Line-comment markers. */
  line: readonly string[];
  /** C-style block comments. */
  block: boolean;
  /** Characters that open a string literal. */
  quotes: string;
  /** Triple-quoted strings (Python, Kotlin, Java text blocks, Swift). */
  triple: boolean;
  /** Rust: `'` starts a char literal or a lifetime, never a string. */
  rustChars: boolean;
}

const C_STYLE: CommentStyle = { line: ["//"], block: true, quotes: "\"'", triple: false, rustChars: false };
const JS_STYLE: CommentStyle = { ...C_STYLE, quotes: "\"'`" };
const TRIPLE_C_STYLE: CommentStyle = { ...C_STYLE, triple: true };
const HASH_STYLE: CommentStyle = { line: ["#"], block: false, quotes: "\"'", triple: false, rustChars: false };

const COMMENT_STYLES: Record<Language, CommentStyle> = {
  typescript: JS_STYLE,
  javascript: JS_STYLE,
  python: { ...HASH_STYLE, triple: true },
  go: JS_STYLE,
  java: TRIPLE_C_STYLE,
  kotlin: TRIPLE_C_STYLE,
  rust: { ...C_STYLE, quotes: "\"", rustChars: true },
  c: C_STYLE,
  cpp: C_STYLE,
  ruby: HASH_STYLE,
  csharp: C_STYLE,
  php: { line: ["//", "#"], block: true, quotes: "\"'", triple: false, rustChars: false },
  swift: TRIPLE_C_STYLE,
};

const RUST_CHAR = /^'(?:\\[^\n']+|[^'\\\n])'/;

/** End index (exclusive) of the string literal opening at `start`. */
function skipString(content: string, start: number, quote: string): number {
  const multiline = quote === "`";
  let index = start + 1;
  while (index < content.length) {
    const char = content[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (char === "\n" && !multiline) return index;
    index += 1;
  }
  return content.length;
}

/** Replaces comments with spaces, keeping newlines so offsets and lines hold. */
function blankComments(content: string, style: CommentStyle): string {
  const parts: string[] = [];
  let copied = 0;
  let index = 0;
  const blank = (start: number, end: number): void => {
    parts.push(content.slice(copied, start), content.slice(start, end).replace(/[^\n\r]/g, " "));
    copied = end;
  };

  while (index < content.length) {
    const char = content[index];
    if (style.triple && (char === "\"" || char === "'") && content.startsWith(char.repeat(3), index)) {
      const close = content.indexOf(char.repeat(3), index + 3);
      index = close < 0 ? content.length : close + 3;
      continue;
    }
    if (style.rustChars && char === "'") {
      const literal = RUST_CHAR.exec(content.slice(index, index + 12));
      index += literal ? literal[0].length : 1;
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

// ── Patterns ──────────────────────────────────────────────────

interface EnvPattern {
  regex: RegExp;
  /** Capture group holding the variable name. */
  group: number;
  /** Skip matches followed by `=` (writes such as `process.env.X = "y"`). */
  skipAssignment?: boolean;
  accept?: (name: string) => boolean;
}

const IDENT = "[A-Za-z_$][\\w$]*";
/** A quoted env var name: group n is the quote, group n+1 the name. */
const quoted = (quotes: string): string => `([${quotes}])([A-Za-z_][\\w.-]*)\\1`;
const Q = quoted("\"'");
const DQ = quoted("\"");

const pattern = (source: string, group: number, extra: Partial<EnvPattern> = {}): EnvPattern => ({
  regex: new RegExp(source, "g"),
  group,
  ...extra,
});

const JS_ENV_OBJECT = "(?:\\bprocess\\??\\.env|\\bimport\\.meta\\.env|\\bBun\\.env)";

const JS_PATTERNS: readonly EnvPattern[] = [
  pattern(`${JS_ENV_OBJECT}\\??\\.(${IDENT})`, 1, { skipAssignment: true }),
  pattern(`${JS_ENV_OBJECT}(?:\\?\\.)?\\[\\s*${quoted("\"'`")}\\s*\\]`, 2, { skipAssignment: true }),
  pattern(`\\bDeno\\.env\\.get\\(\\s*${quoted("\"'`")}`, 2),
];

const JS_DESTRUCTURING = new RegExp(
  "\\b(?:const|let|var)\\s*\\{([^{}]*)\\}\\s*=\\s*(?:process\\.env|import\\.meta\\.env|Bun\\.env)\\b(?!\\s*[.\\[])",
  "g",
);

/** CGI/server keys in PHP's $_SERVER that are request metadata, not environment. */
const PHP_SERVER_BUILTIN = /^(?:REQUEST_|HTTP_|SERVER_|REMOTE_|SCRIPT_|PHP_|REDIRECT_|CONTENT_|GATEWAY_|PATH_|ORIG_)|^(?:QUERY_STRING|DOCUMENT_ROOT|HTTPS|AUTH_TYPE|PATH)$/;

const PYTHON_PATTERNS: readonly EnvPattern[] = [
  pattern(`\\b(?:os\\.)?environ\\s*\\[\\s*${Q}\\s*\\]`, 2, { skipAssignment: true }),
  pattern(`\\b(?:os\\.)?environ\\.get\\(\\s*${Q}`, 2),
  pattern(`\\b(?:os\\.)?getenv\\(\\s*${Q}`, 2),
];

const JVM_PATTERNS: readonly EnvPattern[] = [
  pattern(`\\bSystem\\.getenv\\(\\s*${DQ}`, 2),
  pattern(`\\bSystem\\.getenv\\(\\s*\\)\\s*(?:\\[|\\.get\\()\\s*${DQ}`, 2),
];

const C_PATTERNS: readonly EnvPattern[] = [pattern(`\\b(?:secure_)?getenv\\(\\s*${DQ}`, 2)];

const PATTERNS: Record<Language, readonly EnvPattern[]> = {
  typescript: JS_PATTERNS,
  javascript: JS_PATTERNS,
  python: PYTHON_PATTERNS,
  go: [pattern(`\\bos\\.(?:Getenv|LookupEnv)\\(\\s*${quoted("\"`")}`, 2)],
  java: JVM_PATTERNS,
  kotlin: JVM_PATTERNS,
  rust: [
    pattern(`\\benv::(?:var|var_os)\\(\\s*${DQ}`, 2),
    pattern(`\\b(?:option_env|env)!\\(\\s*${DQ}`, 2),
  ],
  c: C_PATTERNS,
  cpp: C_PATTERNS,
  ruby: [
    pattern(`\\bENV\\s*\\[\\s*${Q}\\s*\\]`, 2, { skipAssignment: true }),
    pattern(`\\bENV\\.fetch[\\s(]\\s*${Q}`, 2),
  ],
  csharp: [pattern(`\\bEnvironment\\.GetEnvironmentVariable\\(\\s*${DQ}`, 2)],
  php: [
    pattern(`\\bgetenv\\(\\s*${Q}`, 2),
    pattern(`(?<![\\w>:$])env\\(\\s*${Q}`, 2),
    pattern(`\\$_ENV\\[\\s*${Q}\\s*\\]`, 2),
    pattern("\\$_SERVER\\[\\s*([\"'])([A-Z][A-Z0-9_]*)\\1\\s*\\]", 2, {
      accept: (name) => !PHP_SERVER_BUILTIN.test(name),
    }),
  ],
  swift: [pattern(`\\bProcessInfo\\.processInfo\\.environment\\[\\s*${DQ}\\s*\\]`, 2)],
};

const ASSIGNMENT = /^\s*=(?![=>])/;

// ── Extraction ────────────────────────────────────────────────

type Hit = { name: string; offset: number };

function collectPattern(text: string, entry: EnvPattern, hits: Hit[]): void {
  entry.regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = entry.regex.exec(text)) !== null) {
    const name = match[entry.group];
    if (!name) continue;
    if (entry.accept && !entry.accept(name)) continue;
    const end = match.index + match[0].length;
    if (entry.skipAssignment && ASSIGNMENT.test(text.slice(end, end + 16))) continue;
    hits.push({ name, offset: match.index + match[0].lastIndexOf(name) });
  }
}

/** Splits a destructuring body on top-level commas, keeping each piece's offset. */
function splitTopLevel(body: string): Array<{ text: string; start: number }> {
  const pieces: Array<{ text: string; start: number }> = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === "\"" || char === "'" || char === "`") {
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

const DESTRUCTURED_KEY = new RegExp(`^\\s*(?:(${IDENT})\\s*(?:[:=]|$)|(["'])([A-Za-z_][\\w.-]*)\\2\\s*:)`);

function collectDestructuring(text: string, hits: Hit[]): void {
  JS_DESTRUCTURING.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JS_DESTRUCTURING.exec(text)) !== null) {
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

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let index = content.indexOf("\n"); index >= 0; index = content.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function lineOf(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

export function extractEnvRefs(path: string, content: string, language: Language | null): EnvRef[] {
  if (!content) return [];
  const isJs = language === null || language === "typescript" || language === "javascript";
  const text = blankComments(content, language ? COMMENT_STYLES[language] : JS_STYLE);

  const hits: Hit[] = [];
  for (const entry of language ? PATTERNS[language] : JS_PATTERNS) collectPattern(text, entry, hits);
  if (isJs) collectDestructuring(text, hits);

  const starts = lineStarts(content);
  const seen = new Set<string>();
  const refs: EnvRef[] = [];
  for (const hit of hits) {
    const line = lineOf(starts, hit.offset);
    const key = `${line}\u0000${hit.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ file: path, name: hit.name, line, secretLike: isSecretLikeName(hit.name) });
  }
  return refs.sort((a, b) => a.line - b.line || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
