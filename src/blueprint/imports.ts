// Observed, file-level dependency graph of a repository snapshot.
//
// Pipeline per file: mask comments and string bodies (offset-preserving, so
// line numbers stay exact) → extract import statements → resolve each one to a
// repository file, an external package, or "unresolved" (looked internal but
// nothing matched). Everything here is pure and isomorphic.
//
// Specifier encodings (RawImport.specifier):
//   JS/TS        the module specifier as written
//   Python       "a.b" for `import a.b`; "a.b:c" for `from a.b import c` (one
//                RawImport per imported name; "a.b" alone for `import *`).
//                Relative imports keep their dots: ".:x", "..pkg.mod:y".
//   Go           the import path
//   Java/Kotlin  the dotted name, wildcard kept ("a.b.*"); `static` is dropped
//                because resolution tries progressively shorter prefixes
//   Rust         "crate::a::b" (one per use-tree leaf, kind "use"); `mod foo;`
//                is specifier "foo" with kind "mod"
//   C/C++        `x/y.h` for quoted includes, `<x/y.h>` for angle includes
//   Ruby         "./x" for require_relative "x" (kind "static"), "x" for
//                require "x" (kind "require")
// C#, PHP and Swift are structural-only: they get facts but no imports.
//
// External package naming (ExternalRef.pkg):
//   JS/TS "react", "@scope/pkg", "node:fs" · Python top-level module · Go
//   "github.com/x/y" or "go:<path>" for the standard library · Java/Kotlin
//   first two segments, with "jdk:java", "jdk:javax", "kotlin:stdlib" for the
//   platform · Rust crate name, "rust:std" for std/core/alloc · C/C++
//   "c:<header>" · Ruby gem (first path segment).

import { DEFAULT_IGNORE, MAX_ANALYZED_FILE_BYTES, TEST_PATTERNS } from "./constants";
import { extractEnvRefs } from "./env";
import { matchesAny } from "./glob";
import { ancestors, basename, dirname, join as joinPath, toPosix } from "./paths";
import type {
  ExternalRef,
  FileEdge,
  FileFacts,
  FileGraph,
  ImportKind,
  Language,
  RawImport,
  ResolvedImport,
  SourceFile,
} from "./types";

// ── Language and path classification ──────────────────────────

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, Language>> = {
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
  swift: "swift",
};

export function languageOf(path: string): Language | null {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1).toLowerCase()] ?? null;
}

export function isTestPath(path: string): boolean {
  return matchesAny(path, TEST_PATTERNS);
}

export function isIgnoredPath(path: string, extraIgnore?: readonly string[]): boolean {
  return matchesAny(path, DEFAULT_IGNORE) || matchesAny(path, extraIgnore);
}

// ── Source masking ────────────────────────────────────────────

/** Replaces string bodies in masked text; never occurs in real source. */
const FILL = "\u0001";
const NOT_NEWLINE = /[^\r\n]/g;

interface Flavor {
  slashComments: boolean;
  nestedBlocks: boolean;
  hashComments: boolean;
  /** `'` starts a string ("string") or is a char literal / lifetime ("char"). */
  singleQuote: "string" | "char";
  tripleDouble: boolean;
  tripleSingle: boolean;
  backtick: "none" | "template" | "raw";
  regex: boolean;
  rustRaw: boolean;
}

const C_FLAVOR: Flavor = {
  slashComments: true,
  nestedBlocks: false,
  hashComments: false,
  singleQuote: "char",
  tripleDouble: false,
  tripleSingle: false,
  backtick: "none",
  regex: false,
  rustRaw: false,
};
const JS_FLAVOR: Flavor = { ...C_FLAVOR, singleQuote: "string", backtick: "template", regex: true };
const GO_FLAVOR: Flavor = { ...C_FLAVOR, backtick: "raw" };
const JAVA_FLAVOR: Flavor = { ...C_FLAVOR, tripleDouble: true };
const KOTLIN_FLAVOR: Flavor = { ...JAVA_FLAVOR, nestedBlocks: true };
const RUST_FLAVOR: Flavor = { ...C_FLAVOR, nestedBlocks: true, rustRaw: true };
const PYTHON_FLAVOR: Flavor = {
  ...C_FLAVOR,
  slashComments: false,
  hashComments: true,
  singleQuote: "string",
  tripleDouble: true,
  tripleSingle: true,
};

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await",
]);

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\w$]/.test(char);
}

/**
 * Returns `src` with comments blanked to spaces and string / template / regex
 * bodies replaced by FILL. Length, offsets and newlines are preserved, so a
 * match in the masked text can be read back from the original at the same
 * offsets.
 */
function maskSource(src: string, flavor: Flavor): string {
  const n = src.length;
  let out = "";
  let copied = 0;
  let i = 0;
  let lastSig = -1;
  let lastWasLiteral = false;
  const templateDepth: number[] = [];

  const blank = (from: number, to: number, fill: string): void => {
    if (to <= from) return;
    out += src.slice(copied, from) + src.slice(from, to).replace(NOT_NEWLINE, fill);
    copied = to;
  };

  const endLiteral = (end: number): number => {
    lastSig = end - 1;
    lastWasLiteral = true;
    return end;
  };

  const scanQuoted = (start: number, quote: string): number => {
    let j = start + 1;
    while (j < n) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === quote || c === "\n") break;
      j += 1;
    }
    j = Math.min(j, n);
    blank(start + 1, j, FILL);
    return endLiteral(src[j] === quote ? j + 1 : j);
  };

  const scanDelimited = (bodyStart: number, close: string): number => {
    const found = src.indexOf(close, bodyStart);
    blank(bodyStart, found < 0 ? n : found, FILL);
    return endLiteral(found < 0 ? n : found + close.length);
  };

  /** Scans a template body from `bodyStart` to the closing backtick or the next `${`. */
  const scanTemplate = (bodyStart: number): number => {
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

  const regexAllowed = (): boolean => {
    if (lastSig < 0) return true;
    if (lastWasLiteral) return false;
    const prev = src[lastSig];
    if (isWordChar(prev)) {
      let start = lastSig;
      while (start > 0 && isWordChar(src[start - 1])) start -= 1;
      return REGEX_PRECEDING_KEYWORDS.has(src.slice(start, lastSig + 1));
    }
    // `<` excluded so JSX closing tags (`</div>`) are not read as regex starts.
    return !(prev === ")" || prev === "]" || prev === "}" || prev === "<");
  };

  /** Index just past the closing `/` of a regex literal starting at `start`, or -1. */
  const scanRegex = (start: number): number => {
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
        let end: number;
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
        if (src[r] === "r" && (!isWordChar(src[r - 1]) || (src[r - 1] === "b" && !isWordChar(src[r - 2])))) {
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
      // Char literal ('a', '\n', '\u{1F600}') versus Rust lifetime / stray apostrophe.
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
      } else if (src[i + 3] === "'" && src.charCodeAt(i + 1) >= 0xd800 && src.charCodeAt(i + 1) <= 0xdbff) {
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

/** Reads the string literal whose opening quote sits at `quoteIndex` of the masked text. */
function readString(masked: string, src: string, quoteIndex: number): { value: string; end: number } | null {
  const quote = masked[quoteIndex];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let j = quoteIndex + 1;
  while (masked[j] === FILL) j += 1;
  if (masked[j] !== quote || j === quoteIndex + 1) return null;
  return { value: src.slice(quoteIndex + 1, j), end: j + 1 };
}

function createLineLocator(text: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function makeImport(specifier: string, line: number, kind: ImportKind, typeOnly = false): RawImport {
  return { specifier, line, kind, typeOnly };
}

// ── Extraction: JavaScript / TypeScript ───────────────────────

const JS_KEYWORD = /(?<![\w$#])(import|export|require)(?![\w$])/g;
const JS_CALL_OPEN = /\s*\(\s*(?=["'`])/y;
const JS_SIDE_EFFECT = /\s*(?=["'])/y;
const JS_IMPORT_CLAUSE = /\s*(type\s+)?([\w$\s,{}*]+?)\s*from\s*(?=["'])/y;
const JS_EXPORT_CLAUSE = /\s*(type\s+)?(\*(?:\s*as\s+[\w$]+)?|\{[\w$\s,]*\})\s*from\s*(?=["'])/y;
const JS_CALL_CLOSE = /\s*[,)]/y;

function stickyMatch(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

/** True when the keyword at `at` begins a statement (first token on its line, or after `;`, `{`, `}`). */
function atStatementStart(masked: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && (masked[j] === " " || masked[j] === "\t" || masked[j] === "\r" || masked[j] === "﻿")) j -= 1;
  if (j < 0) return true;
  const prev = masked[j];
  return prev === "\n" || prev === ";" || prev === "{" || prev === "}";
}

/** `{ type A, type B }` with no default or namespace binding. */
function isInlineTypeOnly(clause: string): boolean {
  const trimmed = clause.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  const bindings = trimmed
    .slice(1, -1)
    .split(",")
    .map((binding) => binding.trim())
    .filter(Boolean);
  if (bindings.length === 0) return false;
  return bindings.every((binding) => /^type\s+\S/.test(binding) && !/^type\s+as\s+[\w$]+$/.test(binding));
}

function extractJs(content: string): RawImport[] {
  const masked = maskSource(content, JS_FLAVOR);
  const lineAt = createLineLocator(masked);
  const imports: RawImport[] = [];

  const stringAt = (index: number): { value: string; end: number } | null => readString(masked, content, index);

  JS_KEYWORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JS_KEYWORD.exec(masked)) !== null) {
    const at = match.index;
    const after = at + match[0].length;
    // Member access (`obj.import`, `a?.require`) is not a module reference; spread (`...require(x)`) is.
    if (masked[at - 1] === "." && masked[at - 2] !== ".") continue;
    const keyword = match[1];
    const line = lineAt(at);

    if (keyword === "require" || keyword === "import") {
      const call = stickyMatch(JS_CALL_OPEN, masked, after);
      if (call) {
        const literal = stringAt(JS_CALL_OPEN.lastIndex);
        if (literal && stickyMatch(JS_CALL_CLOSE, masked, literal.end)) {
          imports.push(makeImport(literal.value, line, keyword === "require" ? "require" : "dynamic"));
        }
        continue;
      }
      if (keyword === "require") continue;
    }

    if (!atStatementStart(masked, at)) continue;

    if (keyword === "import") {
      if (stickyMatch(JS_SIDE_EFFECT, masked, after)) {
        const literal = stringAt(JS_SIDE_EFFECT.lastIndex);
        if (literal) imports.push(makeImport(literal.value, line, "side-effect"));
        continue;
      }
      const clause = stickyMatch(JS_IMPORT_CLAUSE, masked, after);
      if (clause) {
        const literal = stringAt(JS_IMPORT_CLAUSE.lastIndex);
        if (literal) {
          const typeOnly = Boolean(clause[1]) || isInlineTypeOnly(clause[2]);
          imports.push(makeImport(literal.value, line, "static", typeOnly));
        }
      }
      continue;
    }

    const clause = stickyMatch(JS_EXPORT_CLAUSE, masked, after);
    if (clause) {
      const literal = stringAt(JS_EXPORT_CLAUSE.lastIndex);
      if (literal) {
        const typeOnly = Boolean(clause[1]) || isInlineTypeOnly(clause[2]);
        imports.push(makeImport(literal.value, line, "reexport", typeOnly));
      }
    }
  }
  return imports;
}

// ── Extraction: Python ────────────────────────────────────────

const PY_IMPORT = /^[ \t]*import[ \t]+([^\n;]+)/gm;
const PY_FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]*(\([^)]*\)|[^\n;]*)/gm;

function extractPython(content: string): RawImport[] {
  const masked = maskSource(content, PYTHON_FLAVOR);
  const lineAt = createLineLocator(masked);
  const found: Array<{ at: number; order: number; item: RawImport }> = [];
  let order = 0;

  const keywordOffset = (match: RegExpExecArray): number => match.index + match[0].search(/\S/);

  let match: RegExpExecArray | null;
  PY_IMPORT.lastIndex = 0;
  while ((match = PY_IMPORT.exec(masked)) !== null) {
    const at = keywordOffset(match);
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+/)[0];
      if (/^[A-Za-z_][\w.]*$/.test(name)) found.push({ at, order: order++, item: makeImport(name, lineAt(at), "static") });
    }
  }

  PY_FROM.lastIndex = 0;
  while ((match = PY_FROM.exec(masked)) !== null) {
    const moduleName = match[1];
    if (!moduleName || !/^\.*(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)?$/.test(moduleName)) continue;
    const at = keywordOffset(match);
    const line = lineAt(at);
    const names = match[2]
      .replace(/[()\\]/g, " ")
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter((name) => name === "*" || /^[A-Za-z_]\w*$/.test(name));
    for (const name of names) {
      const specifier = name === "*" ? moduleName : `${moduleName}:${name}`;
      found.push({ at, order: order++, item: makeImport(specifier, line, "static") });
    }
  }

  return found.sort((a, b) => a.at - b.at || a.order - b.order).map((entry) => entry.item);
}

// ── Extraction: Go ────────────────────────────────────────────

const GO_IMPORT = /^[ \t]*import[ \t]*(?:(\()|(?:[\w.]+[ \t]+)?(?=["`]))/gm;
const GO_GROUP_ENTRY = /["`]/g;

function extractGo(content: string): RawImport[] {
  const masked = maskSource(content, GO_FLAVOR);
  const lineAt = createLineLocator(masked);
  const imports: RawImport[] = [];
  GO_IMPORT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GO_IMPORT.exec(masked)) !== null) {
    const start = GO_IMPORT.lastIndex;
    if (!match[1]) {
      const literal = readString(masked, content, start);
      if (literal) imports.push(makeImport(literal.value, lineAt(start), "static"));
      continue;
    }
    const close = masked.indexOf(")", start);
    const end = close < 0 ? masked.length : close;
    GO_GROUP_ENTRY.lastIndex = start;
    let quote: RegExpExecArray | null;
    while ((quote = GO_GROUP_ENTRY.exec(masked)) !== null && quote.index < end) {
      const literal = readString(masked, content, quote.index);
      if (!literal) continue;
      imports.push(makeImport(literal.value, lineAt(quote.index), "static"));
      GO_GROUP_ENTRY.lastIndex = literal.end;
    }
    GO_IMPORT.lastIndex = end;
  }
  return imports;
}

// ── Extraction: Java / Kotlin ─────────────────────────────────

const JVM_IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\.\*)?)/gm;
const JVM_PACKAGE = /^[ \t]*package[ \t]+([A-Za-z_][\w.]*)/m;

function extractJvm(content: string, flavor: Flavor): RawImport[] {
  const masked = maskSource(content, flavor);
  const lineAt = createLineLocator(masked);
  const imports: RawImport[] = [];
  JVM_IMPORT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JVM_IMPORT.exec(masked)) !== null) {
    const specifier = match[1];
    const at = match.index + match[0].indexOf("import");
    if (specifier.includes(".")) imports.push(makeImport(specifier, lineAt(at), "static"));
  }
  return imports;
}

// ── Extraction: Rust ──────────────────────────────────────────

const RUST_STATEMENT = /(?<![\w#])(?:(use)\s+([^;{}]*(?:\{[^;]*\})?[^;{}]*);|(mod)\s+(\w+)\s*;|extern\s+(crate)\s+(\w+)[^;]*;)/g;

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function joinRustPath(prefix: string, rest: string): string {
  if (!prefix) return rest;
  return rest ? `${prefix}::${rest}` : prefix;
}

function expandUseTree(tree: string, prefix: string, out: string[]): void {
  const text = tree.trim().replace(/^::/, "");
  const open = text.indexOf("{");
  if (open < 0) {
    let path = text.replace(/\s+as\s+\w+$/, "").replace(/\s+/g, "");
    if (path === "self" && prefix) path = "";
    else if (path === "*") path = "";
    else path = path.replace(/::\*$/, "");
    const full = joinRustPath(prefix, path);
    if (/^\w+(?:::\w+)*$/.test(full)) out.push(full);
    return;
  }
  const head = text.slice(0, open).replace(/\s+/g, "").replace(/::$/, "");
  const close = text.lastIndexOf("}");
  const inner = text.slice(open + 1, close < 0 ? undefined : close);
  for (const part of splitTopLevel(inner)) {
    if (part.trim()) expandUseTree(part, joinRustPath(prefix, head), out);
  }
}

function extractRust(content: string): RawImport[] {
  const masked = maskSource(content, RUST_FLAVOR);
  const lineAt = createLineLocator(masked);
  const imports: RawImport[] = [];
  RUST_STATEMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RUST_STATEMENT.exec(masked)) !== null) {
    const line = lineAt(match.index);
    if (match[3]) {
      imports.push(makeImport(match[4], line, "mod"));
    } else if (match[5]) {
      imports.push(makeImport(match[6], line, "use"));
    } else {
      const leaves: string[] = [];
      expandUseTree(match[2], "", leaves);
      for (const leaf of new Set(leaves)) {
        // `use Ordering::*` / `use Shape::{Circle}` name a type in scope, not a module or crate.
        if (/^[A-Z]/.test(leaf)) continue;
        imports.push(makeImport(leaf, line, "use"));
      }
    }
  }
  return imports;
}

// ── Extraction: C / C++ and Ruby ──────────────────────────────

const C_INCLUDE = /^[ \t]*#[ \t]*(?:include|include_next|import)[ \t]*(?=["<])/gm;

function extractC(content: string): RawImport[] {
  const masked = maskSource(content, C_FLAVOR);
  const lineAt = createLineLocator(masked);
  const imports: RawImport[] = [];
  C_INCLUDE.lastIndex = 0;
  while (C_INCLUDE.exec(masked) !== null) {
    const open = C_INCLUDE.lastIndex;
    const line = lineAt(open);
    if (masked[open] === '"') {
      const literal = readString(masked, content, open);
      if (literal) imports.push(makeImport(literal.value, line, "include"));
      continue;
    }
    const close = masked.indexOf(">", open);
    const newline = masked.indexOf("\n", open);
    if (close > open + 1 && (newline < 0 || close < newline)) {
      imports.push(makeImport(`<${content.slice(open + 1, close).trim()}>`, line, "include"));
    }
  }
  return imports;
}

const RUBY_REQUIRE = /^\s*(require_relative|require)\s*\(?\s*(["'])([^"'#\n]+)\2/;

function extractRuby(content: string): RawImport[] {
  const imports: RawImport[] = [];
  let inBlockComment = false;
  content.split("\n").forEach((text, index) => {
    if (inBlockComment) {
      if (/^=end\b/.test(text)) inBlockComment = false;
      return;
    }
    if (/^=begin\b/.test(text)) {
      inBlockComment = true;
      return;
    }
    const match = RUBY_REQUIRE.exec(text);
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

export function extractImports(path: string, content: string): RawImport[] {
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

// ── Package name normalization ────────────────────────────────

const NODE_BUILTINS = new Set([
  "fs", "path", "os", "crypto", "http", "https", "url", "util", "stream", "events", "child_process",
  "worker_threads", "zlib", "net", "tls", "dns", "buffer", "assert", "readline", "process", "perf_hooks",
  "async_hooks", "cluster", "dgram", "inspector", "module", "querystring", "string_decoder", "timers", "tty",
  "v8", "vm", "wasi", "test", "sqlite", "constants", "diagnostics_channel", "http2", "punycode", "repl",
  "trace_events",
]);

function normalizeJsPackage(specifier: string): string {
  let spec = specifier.replace(/\?.*$/, "");
  if (spec.startsWith("node:")) return `node:${spec.slice(5).split("/")[0]}`;
  if (spec.startsWith("npm:")) spec = spec.slice(4).replace(/^(@?[^@]+)@[^/]*/, "$1");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return spec;
  const segments = spec.split("/");
  const name = spec.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  return NODE_BUILTINS.has(name) ? `node:${name}` : name;
}

function normalizeGoPackage(specifier: string): string {
  const segments = specifier.split("/");
  if (!segments[0].includes(".")) return `go:${specifier}`;
  return segments.slice(0, segments[0] === "gopkg.in" ? 2 : 3).join("/");
}

function normalizeJvmPackage(specifier: string): string {
  const segments = specifier.replace(/\.\*$/, "").split(".");
  if (segments[0] === "java" || segments[0] === "javax") return `jdk:${segments[0]}`;
  if (segments[0] === "kotlin") return "kotlin:stdlib";
  return segments.slice(0, 2).join(".");
}

export function normalizePackageName(specifier: string, language: Language): string {
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

// ── Resolve context ───────────────────────────────────────────

interface AliasPattern {
  prefix: string;
  suffix: string;
  wildcard: boolean;
  /** Repository-relative targets, `*` retained. */
  targets: string[];
}

interface TsAliases {
  baseDir: string | null;
  patterns: AliasPattern[];
}

interface TsConfigLayer {
  baseDir?: string;
  paths?: Record<string, string[]>;
  pathsDir: string;
}

interface WorkspacePackage {
  dir: string;
  manifest: Record<string, unknown>;
}

interface PythonIndex {
  roots: string[];
  rootSet: Set<string>;
  /** Directories that contain Python files, directly or below. */
  dirs: Set<string>;
}

interface GoIndex {
  /** Longest module path first. */
  modules: Array<{ path: string; dir: string }>;
  filesByDir: Map<string, string[]>;
}

interface JvmIndex {
  byStem: Map<string, string>;
  byDeclaration: Map<string, string>;
  firstInPackage: Map<string, string>;
}

interface RustCrate {
  dir: string;
  srcDir: string;
  root: string | null;
}

interface RustIndex {
  byName: Map<string, RustCrate>;
  byDir: Map<string, RustCrate>;
}

/** Indexes over one snapshot. Opaque to callers; build with createResolveContext. */
export interface ResolveContext {
  files: Set<string>;
  dirs: Set<string>;
  sorted: string[];
  contents: Map<string, string>;
  aliasesByConfig: Map<string, TsAliases | null>;
  aliasesByDir: Map<string, TsAliases | null>;
  packages?: Map<string, WorkspacePackage>;
  python?: PythonIndex;
  go?: GoIndex;
  jvm?: JvmIndex;
  rust?: RustIndex;
  cSuffixes?: Map<string, string[]>;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cleanPath(path: string): string {
  return toPosix(path).replace(/^(?:\.\/)+/, "");
}

/** Joins repository paths; "" is the repository root. Paths escaping the root keep a leading "..". */
function rel(...segments: string[]): string {
  const joined = joinPath(...segments);
  return joined === "." ? "" : joined;
}

function parentDir(path: string): string {
  const dir = dirname(path);
  return dir === "." ? "" : dir;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Callers should pass the files they want resolvable (buildFileGraph passes
 * the non-ignored set). Manifests (tsconfig.json, package.json, go.mod,
 * Cargo.toml, ...) are read from `content`; indexes are built lazily per
 * ecosystem.
 */
export function createResolveContext(files: readonly SourceFile[]): ResolveContext {
  const fileSet = new Set<string>();
  const dirs = new Set<string>([""]);
  const contents = new Map<string, string>();
  for (const file of files) {
    const path = cleanPath(file.path);
    fileSet.add(path);
    if (file.content !== null) contents.set(path, file.content);
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
    aliasesByConfig: new Map(),
    aliasesByDir: new Map(),
  };
}

// ── Resolution: JavaScript / TypeScript ───────────────────────

const JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const JS_EXTENSION_SWAPS: ReadonlyArray<[string, string[]]> = [
  [".d.ts", [".ts", ".tsx"]],
  [".d.mts", [".mts"]],
  [".d.cts", [".cts"]],
  [".js", [".ts", ".tsx"]],
  [".jsx", [".tsx"]],
  [".mjs", [".mts"]],
  [".cjs", [".cts"]],
];

function resolveJsFile(ctx: ResolveContext, base: string): string | null {
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

/** JSON with comments and trailing commas (tsconfig dialect). Returns null when unparseable. */
function parseJsonc(input: string): unknown {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const n = text.length;
  let out = "";
  let commaAt = -1;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      commaAt = -1;
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? n : nl;
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
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

function findConfigFile(ctx: ResolveContext, reference: string): string | null {
  for (const candidate of [reference, `${reference}.json`, rel(reference, "tsconfig.json")]) {
    if (candidate.endsWith(".json") && ctx.contents.has(candidate)) return candidate;
  }
  return null;
}

function loadConfigJson(ctx: ResolveContext, configPath: string): Record<string, unknown> | null {
  const text = ctx.contents.get(configPath);
  if (text === undefined) return null;
  const json = parseJsonc(text);
  return isRecord(json) ? json : null;
}

const MAX_EXTENDS_DEPTH = 5;

function loadConfigLayer(ctx: ResolveContext, configPath: string, depth: number): TsConfigLayer | null {
  const json = loadConfigJson(ctx, configPath);
  if (!json) return null;
  const dir = parentDir(configPath);
  const layer: TsConfigLayer = { pathsDir: dir };

  const parents = typeof json.extends === "string" ? [json.extends] : Array.isArray(json.extends) ? json.extends : [];
  for (const parent of parents) {
    if (typeof parent !== "string" || !parent.startsWith(".") || depth >= MAX_EXTENDS_DEPTH) continue;
    const parentPath = findConfigFile(ctx, rel(dir, parent));
    const inherited = parentPath ? loadConfigLayer(ctx, parentPath, depth + 1) : null;
    if (!inherited) continue;
    if (inherited.baseDir !== undefined) layer.baseDir = inherited.baseDir;
    if (inherited.paths) {
      layer.paths = inherited.paths;
      layer.pathsDir = inherited.pathsDir;
    }
  }

  const options = isRecord(json.compilerOptions) ? json.compilerOptions : {};
  if (typeof options.baseUrl === "string") layer.baseDir = rel(dir, options.baseUrl);
  if (isRecord(options.paths)) {
    const paths: Record<string, string[]> = {};
    for (const [pattern, targets] of Object.entries(options.paths)) {
      if (Array.isArray(targets)) paths[pattern] = targets.filter((target): target is string => typeof target === "string");
    }
    layer.paths = paths;
    layer.pathsDir = dir;
  }
  return layer;
}

function loadAliases(ctx: ResolveContext, configPath: string): TsAliases | null {
  const cached = ctx.aliasesByConfig.get(configPath);
  if (cached !== undefined) return cached;

  let layer = loadConfigLayer(ctx, configPath, 0);
  if (layer && !layer.paths && layer.baseDir === undefined) {
    // Solution-style config: aliases live in a referenced project (tsconfig.app.json).
    const json = loadConfigJson(ctx, configPath);
    const references = json && Array.isArray(json.references) ? json.references : [];
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

  let aliases: TsAliases | null = null;
  if (layer) {
    // As in tsc: `paths` targets are relative to baseUrl when one is in effect,
    // otherwise to the config file that defines `paths`.
    const pathsBase = layer.baseDir ?? layer.pathsDir;
    const patterns: AliasPattern[] = [];
    for (const [pattern, targets] of Object.entries(layer.paths ?? {})) {
      const star = pattern.indexOf("*");
      patterns.push({
        prefix: star < 0 ? pattern : pattern.slice(0, star),
        suffix: star < 0 ? "" : pattern.slice(star + 1),
        wildcard: star >= 0,
        targets: targets.map((target) => rel(pathsBase, target)),
      });
    }
    // Most specific first: exact patterns, then longest literal prefix.
    patterns.sort(
      (a, b) => Number(a.wildcard) - Number(b.wildcard) || b.prefix.length - a.prefix.length || compare(a.prefix, b.prefix),
    );
    aliases = { baseDir: layer.baseDir ?? null, patterns };
  }
  ctx.aliasesByConfig.set(configPath, aliases);
  return aliases;
}

function nearestAliases(ctx: ResolveContext, fromPath: string): TsAliases | null {
  const startDir = parentDir(fromPath);
  const cached = ctx.aliasesByDir.get(startDir);
  if (cached !== undefined) return cached;
  let result: TsAliases | null = null;
  for (const dir of ancestors(fromPath)) {
    const config = [rel(dir, "tsconfig.json"), rel(dir, "jsconfig.json")].find((path) => ctx.contents.has(path));
    if (config) {
      result = loadAliases(ctx, config);
      break;
    }
  }
  ctx.aliasesByDir.set(startDir, result);
  return result;
}

function workspacePackages(ctx: ResolveContext): Map<string, WorkspacePackage> {
  if (ctx.packages) return ctx.packages;
  const packages = new Map<string, WorkspacePackage>();
  for (const path of ctx.sorted) {
    if (!path.endsWith("package.json") || basename(path) !== "package.json") continue;
    const text = ctx.contents.get(path);
    if (text === undefined) continue;
    let manifest: unknown;
    try {
      manifest = JSON.parse(text);
    } catch {
      manifest = parseJsonc(text);
    }
    if (isRecord(manifest) && typeof manifest.name === "string" && manifest.name && !packages.has(manifest.name)) {
      packages.set(manifest.name, { dir: parentDir(path), manifest });
    }
  }
  ctx.packages = packages;
  return packages;
}

const EXPORT_CONDITIONS = ["source", "import", "default", "types", "require"];

function collectExportTargets(entry: unknown, out: string[], depth = 0): void {
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

function exportTargets(manifest: Record<string, unknown>, subpath: string): string[] {
  const out: string[] = [];
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
    const targets: string[] = [];
    collectExportTargets(exportsField[key], targets);
    out.push(...targets.map((target) => target.split("*").join(captured)));
  }
  return out;
}

function resolveWorkspaceImport(ctx: ResolveContext, pkg: WorkspacePackage, subpath: string): string | null {
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
    // Entry points usually name build output that is not in the snapshot.
    const source = cleanPath(candidate).replace(/^(?:dist|build|lib|out)\//, "src/");
    if (source !== cleanPath(candidate)) {
      const mapped = resolveJsFile(ctx, rel(pkg.dir, source));
      if (mapped) return mapped;
    }
  }
  return null;
}

function internal(target: string): ResolvedImport {
  return { kind: "internal", target };
}

const UNRESOLVED: ResolvedImport = { kind: "unresolved" };

function resolveJs(fromPath: string, specifier: string, ctx: ResolveContext): ResolvedImport {
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
    const pattern = aliases.patterns.find((candidate) =>
      candidate.wildcard
        ? spec.length >= candidate.prefix.length + candidate.suffix.length &&
          spec.startsWith(candidate.prefix) &&
          spec.endsWith(candidate.suffix)
        : spec === candidate.prefix,
    );
    if (pattern) {
      const captured = pattern.wildcard ? spec.slice(pattern.prefix.length, spec.length - pattern.suffix.length) : "";
      for (const target of pattern.targets) {
        const resolved = resolveJsFile(ctx, target.split("*").join(captured));
        if (resolved) return internal(resolved);
      }
      // A catch-all "*" pattern, or one that points into node_modules, says nothing about ownership.
      aliasMissed =
        (pattern.prefix.length > 0 || !pattern.wildcard) && !pattern.targets.every((target) => target.includes("node_modules"));
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

  // "#x" is a package.json `imports` alias: internal by definition, not resolved here.
  if (aliasMissed || spec.startsWith("#")) return UNRESOLVED;
  return { kind: "external", pkg: normalizeJsPackage(spec) };
}

// ── Resolution: Python ────────────────────────────────────────

// Names that an ancestor-directory match must not shadow (heuristic roots only).
const PYTHON_STDLIB = new Set([
  "abc", "argparse", "array", "ast", "asyncio", "base64", "bisect", "calendar", "collections", "concurrent",
  "contextlib", "copy", "csv", "ctypes", "dataclasses", "datetime", "decimal", "email", "enum", "errno",
  "functools", "glob", "hashlib", "heapq", "html", "http", "importlib", "inspect", "io", "itertools", "json",
  "logging", "math", "multiprocessing", "operator", "os", "pathlib", "pickle", "platform", "queue", "random",
  "re", "secrets", "select", "shutil", "signal", "socket", "sqlite3", "ssl", "statistics", "string", "struct",
  "subprocess", "sys", "tempfile", "test", "threading", "time", "tokenize", "traceback", "types", "typing",
  "unittest", "urllib", "uuid", "warnings", "weakref", "xml", "zipfile", "zlib",
]);

function pythonIndex(ctx: ResolveContext): PythonIndex {
  if (ctx.python) return ctx.python;
  const roots = ["", "src"];
  const dirs = new Set<string>();
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

function child(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

/** Module `base` (a path without extension), preferring the submodule `base/name`. */
function pythonModule(ctx: ResolveContext, base: string, name: string | null): string | null {
  const candidates: string[] = [];
  if (name) candidates.push(child(base, `${name}.py`), child(base, `${name}/__init__.py`));
  if (base) candidates.push(`${base}.py`);
  candidates.push(child(base, "__init__.py"));
  return candidates.find((candidate) => ctx.files.has(candidate)) ?? null;
}

function resolvePython(fromPath: string, specifier: string, ctx: ResolveContext): ResolvedImport {
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
  // Script-style layouts: the importing file's directory and its ancestors act as sys.path entries.
  if (!PYTHON_STDLIB.has(segments[0])) {
    for (const root of ancestors(fromPath)) {
      if (index.rootSet.has(root)) continue;
      const target = pythonModule(ctx, child(root, modulePath), name);
      if (target) return internal(target);
    }
  }
  // The top-level package lives in the repository but the module path does not exist.
  for (const root of index.roots) {
    const top = child(root, segments[0]);
    if (ctx.files.has(`${top}.py`) || index.dirs.has(top)) return UNRESOLVED;
  }
  return { kind: "external", pkg: segments[0] };
}

// ── Resolution: Go ────────────────────────────────────────────

function goIndex(ctx: ResolveContext): GoIndex {
  if (ctx.go) return ctx.go;
  const modules: GoIndex["modules"] = [];
  const filesByDir = new Map<string, string[]>();
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

function resolveGo(specifier: string, ctx: ResolveContext): ResolvedImport {
  const index = goIndex(ctx);
  const goModule = index.modules.find((candidate) => specifier === candidate.path || specifier.startsWith(`${candidate.path}/`));
  if (!goModule) return { kind: "external", pkg: normalizeGoPackage(specifier) };
  const dir = rel(goModule.dir, specifier.slice(goModule.path.length + 1));
  const files = index.filesByDir.get(dir);
  if (!files?.length) return UNRESOLVED;
  return internal(files.find((file) => !file.endsWith("_test.go")) ?? files[0]);
}

// ── Resolution: Java / Kotlin ─────────────────────────────────

const JVM_TYPE_DECLARATION = /\b(?:class|interface|enum|record|object|typealias)\s+([A-Za-z_]\w*)/g;
const KOTLIN_TOP_LEVEL = /^(?:[\w@]+[ \t]+)*(?:fun[ \t]+(?:<[^>\n]*>[ \t]*)?(?:[\w.<>?, ]+\.)?|va[lr][ \t]+(?:[\w.<>?, ]+\.)?)([A-Za-z_]\w*)/gm;

function jvmIndex(ctx: ResolveContext): JvmIndex {
  if (ctx.jvm) return ctx.jvm;
  const index: JvmIndex = { byStem: new Map(), byDeclaration: new Map(), firstInPackage: new Map() };
  const setOnce = (map: Map<string, string>, key: string, value: string): void => {
    if (!map.has(key)) map.set(key, value);
  };
  for (const path of ctx.sorted) {
    const isKotlin = path.endsWith(".kt") || path.endsWith(".kts");
    if (!isKotlin && !path.endsWith(".java")) continue;
    const content = ctx.contents.get(path);
    if (content === undefined) continue;
    const pkg = JVM_PACKAGE.exec(content)?.[1] ?? "";
    const qualify = (name: string): string => (pkg ? `${pkg}.${name}` : name);
    setOnce(index.firstInPackage, pkg, path);
    setOnce(index.byStem, qualify(basename(path).replace(/\.[^.]+$/, "")), path);
    for (const pattern of isKotlin ? [JVM_TYPE_DECLARATION, KOTLIN_TOP_LEVEL] : [JVM_TYPE_DECLARATION]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) setOnce(index.byDeclaration, qualify(match[1]), path);
    }
  }
  ctx.jvm = index;
  return index;
}

function resolveJvm(specifier: string, ctx: ResolveContext): ResolvedImport {
  const index = jvmIndex(ctx);
  const wildcard = specifier.endsWith(".*");
  const name = wildcard ? specifier.slice(0, -2) : specifier;
  if (wildcard) {
    const first = index.firstInPackage.get(name);
    if (first) return internal(first);
  }
  // Inner classes and static members: a.b.C.Inner.member → a.b.C.
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

// ── Resolution: Rust ──────────────────────────────────────────

function rustIndex(ctx: ResolveContext): RustIndex {
  if (ctx.rust) return ctx.rust;
  const index: RustIndex = { byName: new Map(), byDir: new Map() };
  for (const path of ctx.sorted) {
    if (basename(path) !== "Cargo.toml") continue;
    const section = /^\[package\][^\n]*\n([^]*?)(?=^\[|(?![^]))/m.exec(ctx.contents.get(path) ?? "");
    const name = section ? /^[ \t]*name[ \t]*=[ \t]*["']([^"']+)["']/m.exec(section[1])?.[1] : undefined;
    if (!name) continue;
    const dir = parentDir(path);
    const srcDir = rel(dir, "src");
    const root = [child(srcDir, "lib.rs"), child(srcDir, "main.rs")].find((candidate) => ctx.files.has(candidate)) ?? null;
    const crate: RustCrate = { dir, srcDir, root };
    index.byDir.set(dir, crate);
    const key = name.replace(/-/g, "_");
    if (!index.byName.has(key)) index.byName.set(key, crate);
  }
  ctx.rust = index;
  return index;
}

function rustCrateOf(ctx: ResolveContext, fromPath: string): RustCrate | null {
  const index = rustIndex(ctx);
  const dirs = ancestors(fromPath);
  for (const dir of dirs) {
    const crate = index.byDir.get(dir);
    if (crate) return crate;
  }
  // No manifest in the snapshot: infer the crate from a conventional src/ root.
  for (const dir of dirs) {
    const srcDir = rel(dir, "src");
    const root = [child(srcDir, "lib.rs"), child(srcDir, "main.rs")].find((candidate) => ctx.files.has(candidate));
    if (root) return { dir, srcDir, root };
  }
  return null;
}

/** Directory holding the child modules of the module defined by `filePath`. */
function rustModuleDir(filePath: string): string {
  const base = basename(filePath);
  const dir = parentDir(filePath);
  if (base === "mod.rs" || base === "lib.rs" || base === "main.rs") return dir;
  return child(dir, base.replace(/\.rs$/, ""));
}

function rustWithin(ctx: ResolveContext, dir: string, segments: string[], fallback: string | null): ResolvedImport {
  for (let length = segments.length; length >= 1; length -= 1) {
    const base = child(dir, segments.slice(0, length).join("/"));
    if (ctx.files.has(`${base}.rs`)) return internal(`${base}.rs`);
    if (ctx.files.has(`${base}/mod.rs`)) return internal(`${base}/mod.rs`);
  }
  return fallback ? internal(fallback) : UNRESOLVED;
}

/** The file that defines the module whose children live in `dir`. */
function rustModuleFile(ctx: ResolveContext, dir: string): string | null {
  const candidates = [`${dir}.rs`, child(dir, "mod.rs"), child(dir, "lib.rs"), child(dir, "main.rs")];
  return candidates.find((candidate) => candidate !== ".rs" && ctx.files.has(candidate)) ?? null;
}

function resolveRust(fromPath: string, raw: RawImport, ctx: ResolveContext): ResolvedImport {
  const ownDir = rustModuleDir(fromPath);
  if (raw.kind === "mod") {
    const fileDir = parentDir(fromPath);
    // The second pair covers crate roots outside src/ (tests/*.rs, examples/*.rs, src/bin/*.rs).
    const candidates = [
      child(ownDir, `${raw.specifier}.rs`),
      child(ownDir, `${raw.specifier}/mod.rs`),
      child(fileDir, `${raw.specifier}.rs`),
      child(fileDir, `${raw.specifier}/mod.rs`),
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
  // 2018 uniform paths: `use sibling::Item` where `sibling` is a child module of this file.
  if (ctx.files.has(child(ownDir, `${head}.rs`)) || ctx.files.has(child(ownDir, `${head}/mod.rs`))) {
    return rustWithin(ctx, ownDir, segments, null);
  }
  return { kind: "external", pkg: normalizePackageName(raw.specifier, "rust") };
}

// ── Resolution: C / C++ and Ruby ──────────────────────────────

const C_FAMILY_EXTRA = /\.(?:inc|inl|ipp|tpp|def)$/;

function cSuffixIndex(ctx: ResolveContext): Map<string, string[]> {
  if (ctx.cSuffixes) return ctx.cSuffixes;
  const suffixes = new Map<string, string[]>();
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

function resolveC(fromPath: string, specifier: string, ctx: ResolveContext): ResolvedImport {
  const angle = specifier.startsWith("<");
  const header = angle ? specifier.slice(1, -1) : specifier;
  if (!angle) {
    const sibling = rel(parentDir(fromPath), header);
    if (!sibling.startsWith("..") && ctx.files.has(sibling)) return internal(sibling);
  }
  const suffix = header.split("/").filter((segment) => segment && segment !== "." && segment !== "..").join("/");
  const matches = suffix ? cSuffixIndex(ctx).get(suffix) ?? [] : [];
  if (matches.length === 1) return internal(matches[0]);
  // Several candidates for a quoted include: internal, but not attributable to one file.
  if (matches.length > 1 && !angle) return UNRESOLVED;
  return { kind: "external", pkg: `c:${header}` };
}

function resolveRuby(fromPath: string, raw: RawImport, ctx: ResolveContext): ResolvedImport {
  const withExtension = (path: string): string => (path.endsWith(".rb") ? path : `${path}.rb`);
  if (raw.kind !== "require") {
    const target = withExtension(rel(parentDir(fromPath), raw.specifier));
    return ctx.files.has(target) ? internal(target) : UNRESOLVED;
  }
  if (raw.specifier.startsWith(".")) {
    const target = withExtension(rel(raw.specifier));
    return ctx.files.has(target) ? internal(target) : UNRESOLVED;
  }
  const file = withExtension(raw.specifier);
  for (const dir of ["", ...ancestors(fromPath)]) {
    const target = rel(dir, "lib", file);
    if (ctx.files.has(target)) return internal(target);
  }
  return { kind: "external", pkg: normalizePackageName(raw.specifier, "ruby") };
}

export function resolveImport(fromPath: string, raw: RawImport, ctx: ResolveContext): ResolvedImport {
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

// ── Graph assembly ────────────────────────────────────────────

export function buildFileGraph(files: readonly SourceFile[], options?: { ignore?: readonly string[] }): FileGraph {
  const kept = new Map<string, SourceFile>();
  for (const file of files) {
    const path = cleanPath(file.path);
    if (!path || kept.has(path) || isIgnoredPath(path, options?.ignore)) continue;
    kept.set(path, file.path === path ? file : { ...file, path });
  }
  const paths = [...kept.keys()].sort(compare);
  const ctx = createResolveContext([...kept.values()]);

  const facts = new Map<string, FileFacts>();
  const edges = new Map<string, FileEdge>();
  const externals = new Map<string, ExternalRef>();
  const unresolved = new Map<string, { from: string; specifier: string; line: number }>();

  for (const path of paths) {
    const file = kept.get(path);
    const language = languageOf(path);
    if (!file || language === null || file.content === null) continue;
    if ((file.size ?? 0) > MAX_ANALYZED_FILE_BYTES || file.content.length > MAX_ANALYZED_FILE_BYTES) continue;

    const imports = extractImports(path, file.content);
    facts.set(path, {
      path,
      language,
      isTest: isTestPath(path),
      imports,
      envRefs: extractEnvRefs(path, file.content, language),
    });

    for (const raw of imports) {
      const resolved = resolveImport(path, raw, ctx);
      if (resolved.kind === "internal") {
        if (resolved.target === path) continue;
        const key = `${path}\u0000${resolved.target}\u0000${raw.line}`;
        const existing = edges.get(key);
        // Merged duplicates stay type-only only when every one of them is.
        if (existing) existing.typeOnly = existing.typeOnly && raw.typeOnly;
        else edges.set(key, { from: path, to: resolved.target, line: raw.line, specifier: raw.specifier, typeOnly: raw.typeOnly });
      } else if (resolved.kind === "external") {
        const key = `${path}\u0000${resolved.pkg}\u0000${raw.line}`;
        const existing = externals.get(key);
        if (existing) existing.typeOnly = existing.typeOnly && raw.typeOnly;
        else externals.set(key, { from: path, pkg: resolved.pkg, line: raw.line, specifier: raw.specifier, typeOnly: raw.typeOnly });
      } else {
        const key = `${path}\u0000${raw.specifier}\u0000${raw.line}`;
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
      (a, b) => compare(a.from, b.from) || a.line - b.line || compare(a.specifier, b.specifier),
    ),
  };
}
