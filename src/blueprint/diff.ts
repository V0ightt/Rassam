// Turns a change (unified diff or untracked files) into review signals:
// tripwire hits on protected paths and heuristics that flag weakened
// verification (skipped tests, deleted assertions, faked exits, loosened CI).
// Documented reward hacks by coding agents attack the checks themselves, so
// these signals are computed from the diff alone and never from agent claims.

import { DEFAULT_TRIPWIRES, TEST_PATTERNS, type TripwireCategory } from "./constants";
import { compileGlob, matchesAny } from "./glob";
import { basename, dirname, extname, join } from "./paths";
import type { Severity } from "./schema";
import type { ChangedFile, ChangeStatus, DiffLine } from "./types";

// ── Unified diff parsing ──────────────────────────────────────

const SIMPLE_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

function pushCodePoint(bytes: number[], codePoint: number): void {
  if (codePoint < 0x80) bytes.push(codePoint);
  else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
  else if (codePoint < 0x10000) {
    bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
  } else {
    bytes.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  }
}

/** Minimal UTF-8 decoder (TextDecoder is avoided to stay host-independent). */
function decodeUtf8(bytes: readonly number[]): string {
  let result = "";
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index];
    let needed = 0;
    let codePoint = lead;
    if (lead >= 0xf0 && lead < 0xf8) {
      needed = 3;
      codePoint = lead & 0x07;
    } else if (lead >= 0xe0 && lead < 0xf0) {
      needed = 2;
      codePoint = lead & 0x0f;
    } else if (lead >= 0xc0 && lead < 0xe0) {
      needed = 1;
      codePoint = lead & 0x1f;
    }
    let valid = lead < 0x80 || needed > 0;
    for (let offset = 1; valid && offset <= needed; offset += 1) {
      const next = bytes[index + offset];
      if (next === undefined || (next & 0xc0) !== 0x80) valid = false;
      else codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (!valid || codePoint > 0x10ffff) {
      result += "�";
      index += 1;
      continue;
    }
    result += String.fromCodePoint(codePoint);
    index += needed + 1;
  }
  return result;
}

/**
 * Reads a git C-quoted string starting at `start` (which must be a `"`).
 * Returns the decoded value and the index just past the closing quote.
 */
function readQuoted(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '"') return null;
  const bytes: number[] = [];
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') return { value: decodeUtf8(bytes), end: index + 1 };
    if (char === "\\") {
      const next = text[index + 1];
      if (next === undefined) return null;
      const octal = /^[0-7]{1,3}/.exec(text.slice(index + 1, index + 4));
      if (octal) {
        bytes.push(parseInt(octal[0], 8) & 0xff);
        index += 1 + octal[0].length;
        continue;
      }
      const simple = SIMPLE_ESCAPES[next];
      if (simple !== undefined) bytes.push(simple);
      else pushCodePoint(bytes, next.codePointAt(0) ?? 0x3f);
      index += 2;
      continue;
    }
    const codePoint = text.codePointAt(index) ?? 0x3f;
    pushCodePoint(bytes, codePoint);
    index += codePoint > 0xffff ? 2 : 1;
  }
  return null;
}

/** Decodes a path token that may be C-quoted by git. */
function unquotePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"')) {
    const quoted = readQuoted(trimmed, 0);
    if (quoted) return quoted.value;
  }
  return trimmed;
}

/** git's source/destination prefixes, including the mnemonic ones. */
const PREFIX = /^[abciow]\//;

function stripPrefix(path: string): string {
  return path.replace(PREFIX, "");
}

/** Path from a `--- a/x` / `+++ b/x` line body; null for /dev/null. */
function headerPath(body: string): string | null {
  let path: string;
  if (body.startsWith('"')) {
    path = unquotePath(body);
  } else {
    // Non-git diffs append "\t<timestamp>"; git appends "\t" after paths with spaces.
    const tab = body.indexOf("\t");
    path = tab >= 0 ? body.slice(0, tab) : body;
    path = path.replace(/\r$/, "");
  }
  if (path === "/dev/null") return null;
  return stripPrefix(path);
}

/** Best-effort old/new paths from the `diff --git` line (needed when no ---/+++ follows). */
function gitHeaderPaths(rest: string): { oldPath: string; newPath: string } | null {
  if (rest.startsWith('"')) {
    const first = readQuoted(rest, 0);
    if (!first) return null;
    const remainder = rest.slice(first.end).trim();
    return { oldPath: stripPrefix(first.value), newPath: stripPrefix(unquotePath(remainder)) };
  }
  if (rest.endsWith('"')) {
    const open = rest.indexOf(' "');
    if (open > 0) {
      return { oldPath: stripPrefix(rest.slice(0, open)), newPath: stripPrefix(unquotePath(rest.slice(open + 1))) };
    }
  }
  // Unquoted paths may contain spaces. Without a rename both sides are equal,
  // so prefer the split that yields identical paths.
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

interface Draft {
  oldPath: string | null;
  newPath: string | null;
  isNew: boolean;
  isDeleted: boolean;
  isRename: boolean;
  binary: boolean;
  sawFileHeader: boolean;
  added: DiffLine[];
  removed: DiffLine[];
}

function newDraft(): Draft {
  return {
    oldPath: null,
    newPath: null,
    isNew: false,
    isDeleted: false,
    isRename: false,
    binary: false,
    sawFileHeader: false,
    added: [],
    removed: [],
  };
}

function finishDraft(draft: Draft): ChangedFile | null {
  const path = draft.isDeleted ? draft.oldPath ?? draft.newPath : draft.newPath ?? draft.oldPath;
  if (!path) return null;
  let status: ChangeStatus = "modified";
  if (draft.isNew) status = "added";
  else if (draft.isDeleted) status = "deleted";
  else if (draft.isRename || (draft.oldPath !== null && draft.newPath !== null && draft.oldPath !== draft.newPath)) {
    status = "renamed";
  }
  const file: ChangedFile = { path, status, added: draft.added, removed: draft.removed };
  if (status === "renamed" && draft.oldPath && draft.oldPath !== path) file.previousPath = draft.oldPath;
  if (draft.binary) file.binary = true;
  return file;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parses `git diff` output (any context size, with or without rename
 * detection) and plain `diff -u` output into per-file added/removed lines.
 */
export function parseUnifiedDiff(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const lines = text.split("\n");
  let draft: Draft | null = null;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;

  const flush = (): void => {
    if (draft) {
      const file = finishDraft(draft);
      if (file) files.push(file);
    }
    draft = null;
    oldRemaining = 0;
    newRemaining = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];

    // Inside a hunk every line is content, even ones that look like headers.
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
      if (marker === " " || marker === undefined || raw === "\r") {
        // Context line (some tools strip the leading space from blank ones).
        oldLine += 1;
        newLine += 1;
        oldRemaining = Math.max(0, oldRemaining - 1);
        newRemaining = Math.max(0, newRemaining - 1);
        continue;
      }
      // Malformed hunk: fall through and treat the line as a header.
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
      // A plain unified diff has no "diff --git" line: "---" starts a new file.
      if (!draft || draft.sawFileHeader) {
        flush();
        draft = newDraft();
      }
      const target: Draft = draft;
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
    const current: Draft = draft;

    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLine = Number(hunk[3]);
      newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
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
      // A copy leaves the source untouched: report the destination as added.
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

/** An untracked file: every line counts as added. */
export function fileAdded(path: string, content: string): ChangedFile {
  const lines = content.length === 0 ? [] : content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return {
    path,
    status: "added",
    added: lines.map((text, index) => ({ line: index + 1, text: text.replace(/\r$/, "") })),
    removed: [],
  };
}

// ── Tripwires ─────────────────────────────────────────────────

export interface TripwireHit {
  path: string;
  category: TripwireCategory;
  reason: string;
  ruleId?: string;
  severity: Severity;
}

export interface TripwireOptions {
  /** policy.tripwires.defaults */
  defaults: boolean;
  /** policy.tripwires.paths */
  extra?: readonly string[];
  protectRules?: ReadonlyArray<{ id: string; paths: readonly string[]; severity?: Severity; reason?: string }>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Category of the first built-in tripwire covering the path; "contract" for blueprint-only protections. */
function categoryFor(paths: readonly string[]): TripwireCategory {
  for (const definition of DEFAULT_TRIPWIRES) {
    const matcher = compileGlob(definition.glob);
    if (paths.some((path) => matcher.test(path))) return definition.category;
  }
  return "contract";
}

function withRenameNote(reason: string, change: ChangedFile, matchedCurrent: boolean): string {
  if (matchedCurrent || !change.previousPath) return reason;
  return `${reason} (moved from ${change.previousPath})`;
}

/**
 * Protected paths touched by a change. One hit per (path, source), where a
 * source is the built-in list, the policy's extra globs, or one protect rule.
 */
export function matchTripwires(changes: readonly ChangedFile[], options: TripwireOptions): TripwireHit[] {
  const hits: TripwireHit[] = [];
  const seen = new Set<string>();
  const ordered = [...changes].sort((left, right) => compareText(left.path, right.path));

  for (const change of ordered) {
    const candidates = change.previousPath ? [change.path, change.previousPath] : [change.path];
    const add = (source: string, hit: TripwireHit): void => {
      const key = `${change.path}\u0000${source}`;
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
          severity: "warning",
        });
        break;
      }
    }

    if (options.extra?.length && candidates.some((path) => matchesAny(path, options.extra))) {
      add("extra", {
        path: change.path,
        category: categoryFor(candidates),
        reason: withRenameNote("Protected by blueprint policy", change, matchesAny(change.path, options.extra)),
        severity: "warning",
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
          matchesAny(change.path, rule.paths),
        ),
        ruleId: rule.id,
        severity: rule.severity ?? "warning",
      });
    }
  }
  return hits;
}

// ── Verification-weakening heuristics ─────────────────────────

/**
 * Every verification-weakening signal and its strength, the one place the
 * split is defined. A strong signal removes or disables a check outright: a
 * skipped, focused, deleted or gutted test, a lowered or removed coverage
 * bar, a forced zero exit. Under `policy.verificationWeakening:
 * "require-approval"` (the default) a strong signal is an error until a human
 * approves the change with the approval label. Weak signals loosen
 * verification in ways that are routine often enough to stay warnings (or
 * info) for a reviewer.
 */
export const WEAKENING_SIGNALS = {
  "test-skipped": "strong",
  "test-focused": "strong",
  "assertions-removed": "strong",
  "assertion-trivialized": "strong",
  "test-file-deleted": "strong",
  "coverage-threshold-lowered": "strong",
  "coverage-threshold-removed": "strong",
  "exit-zero": "strong",
  "ci-weakened": "weak",
  "tests-excluded": "weak",
  "test-script-changed": "weak",
  "suppression-added": "weak",
  "test-special-casing": "weak",
  "snapshots-mass-updated": "weak",
} as const satisfies Record<string, "strong" | "weak">;

export type WeakeningSignalName = keyof typeof WEAKENING_SIGNALS;

/** Appended to a strong signal's message while it waits for a human. */
export const WEAKENING_NEEDS_APPROVAL =
  "This weakens the checks agents are graded by, so a human must approve it: apply the approval label (rassam:approved by default), or restore the check.";
/** Appended to a strong signal's message once a human approved the change. */
export const WEAKENING_APPROVED = "A human approved this change to the tests.";

export interface WeakeningSignal {
  path: string;
  line?: number;
  signal: WeakeningSignalName;
  /** Severity when no approval is required: the `"warn"` policy, and weak signals under any policy. */
  severity: Severity;
  /**
   * Needs a human approval under `policy.verificationWeakening:
   * "require-approval"`. Follows WEAKENING_SIGNALS, except that context can
   * clear it, never set it: a test file deleted together with the code it
   * tests, assertions removed together with the functions they called. Such
   * signals are still reported, at their usual severity.
   */
  strong: boolean;
  message: string;
}

/** What a detector returns; `strong` is filled in from WEAKENING_SIGNALS unless context cleared it. */
type RawSignal = Omit<WeakeningSignal, "strong"> & { strong?: false };

const SNAPSHOT_PATTERNS = ["**/__snapshots__/**", "*.snap"];
const CI_PATTERNS = [".github/workflows/**", ".gitlab-ci.yml", ".circleci/**", "azure-pipelines.yml", "Jenkinsfile"];
const HOOK_PATTERNS = [".husky/**", ".git-hooks/**", ".githooks/**"];
const RUNNER_CONFIG_PATTERNS = [
  "{jest,vitest,playwright,cypress,karma,wdio}.config.*",
  "{jest,vitest}.{setup,workspace}.*",
  ".mocharc*",
  "conftest.py",
  "pytest.ini",
  "tox.ini",
  "noxfile.py",
];
const COVERAGE_CONFIG_PATTERNS = [
  "{jest,vitest}.config.*",
  "package.json",
  "pyproject.toml",
  "setup.cfg",
  "tox.ini",
  "pytest.ini",
  ".coveragerc",
  "{codecov,.codecov}.{yml,yaml}",
  ".nycrc*",
  ".c8rc*",
];
const SHELL_EXTENSIONS = new Set([".sh", ".bash", ".zsh"]);
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);

function isSnapshotFile(path: string): boolean {
  return matchesAny(path, SNAPSHOT_PATTERNS);
}

function isTestFile(path: string): boolean {
  return matchesAny(path, TEST_PATTERNS) && !isSnapshotFile(path);
}

function isCiFile(path: string): boolean {
  return matchesAny(path, CI_PATTERNS);
}

function isShellLike(path: string): boolean {
  return SHELL_EXTENSIONS.has(extname(path)) || matchesAny(path, HOOK_PATTERNS);
}

/** Files where a forced zero exit status can fake a passing verification run. */
function isVerificationFile(path: string): boolean {
  if (isTestFile(path) || isCiFile(path) || matchesAny(path, RUNNER_CONFIG_PATTERNS)) return true;
  if (matchesAny(path, HOOK_PATTERNS)) return true;
  return SHELL_EXTENSIONS.has(extname(path)) && /(test|spec|ci|lint|check|verify)/i.test(basename(path));
}

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".java", ".kt", ".kts",
  ".rs", ".rb", ".php", ".cs", ".swift", ".c", ".cc", ".cpp", ".h", ".hpp", ".scala",
]);

const STRING_LITERAL = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g;

/**
 * Blank the contents of single-line string literals in source code, so that
 * fixture text inside strings (e.g. a test of these very heuristics) does not
 * trigger signals. Comments and code outside strings are kept.
 */
export function codeOnly(path: string, text: string): string {
  if (!CODE_EXTENSIONS.has(extname(path).toLowerCase())) return text;
  return text.replace(STRING_LITERAL, (match) => (
    match.length <= 2 ? match : `${match[0]}${" ".repeat(match.length - 2)}${match[match.length - 1]}`
  ));
}

function excerpt(text: string, max = 80): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

const SKIP_PATTERNS: readonly RegExp[] = [
  /\.skip\s*\(/,
  /\b(?:it|test|describe|context|suite)\.skip\b/,
  /\.skipIf\s*\(/,
  // node:test options, wherever they sit in the object: test('name', { skip: true }, fn)
  // or { timeout: 500, todo: 'reason' }. The span before the object may not cross a
  // closing parenthesis or an arrow, so object literals inside a test body are left alone.
  // A bare `it.todo('later')` placeholder has no body to lose and is not flagged.
  /\b(?:it|test|describe|suite)\s*\((?:(?!=>)[^)])*\{[^}]*\b(?:skip|todo)\s*:(?!\s*false\b)/,
  /\b(?:t|ctx)\.todo\s*\(/,
  /\b(?:it|test|describe)\.fixme\b/,
  /\b(?:xit|xdescribe|xtest|xcontext|xspecify)\s*\(/,
  /@pytest\.mark\.(?:skip|skipif|xfail)\b/,
  /@unittest\.(?:skip|skipIf|skipUnless|expectedFailure)\b/,
  /\bt\.Skip(?:f|Now)?\s*\(/,
  /@Disabled\b/,
  /@Ignore\b/,
  /#\[ignore\b/,
];

/** A test call whose options object is still open at the end of the line: `test('name', {`. */
const TEST_OPTIONS_OPEN = /\b(?:it|test|describe|suite)\s*\((?:(?!=>)[^)])*\{[^}]*$/;
/** A `skip:` or `todo:` property on a line of its own. Only meaningful inside such an options object. */
const SKIP_OPTION_LINE = /^\s*(?:skip|todo)\s*:(?!\s*false\b)/;

const FOCUS_PATTERNS: readonly RegExp[] = [/\.only\s*\(/, /\b(?:fit|fdescribe|fcontext)\s*\(/];

const ASSERTION_PATTERN =
  /\bexpect\s*\(|\bassert\w*|\bshould\.|\.should\b|\.to(?:Be|Equal|StrictEqual|Have|Match|Throw|Contain)\w*\s*\(|\brequire\.[A-Z]\w*\s*\(|\bt\.(?:Error|Fatal)f?\s*\(/;

const LITERAL = String.raw`(?:true|false|null|undefined|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')`;
const TRIVIAL_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\bexpect\s*\(\s*${LITERAL}\s*\)\s*\.(?:not\.)?to\w+\s*\(`),
  // A value compared with itself: expect(value).toBe(value).
  /\bexpect\s*\(\s*([A-Za-z_$][\w$.]*)\s*\)\s*\.to(?:Be|Equal|StrictEqual)\s*\(\s*\1\s*\)/,
  /^\s*assert\s+(?:True|1|not\s+False)\s*(?:,|#|$)/,
  /^\s*assert\s+(\w+|"[^"]*"|'[^']*')\s*==\s*\1\s*(?:,|#|$)/,
  /\bassert(?:True|_true|\.ok|\.isTrue)?\s*\(\s*(?:true|True|1)\s*[,)]/,
  /\bassert(?:Equals?|_equal|\.equal|\.strictEqual|\.deepEqual|_eq!)\s*\(\s*(\w+|"[^"]*"|'[^']*')\s*,\s*\1\s*[,)]/,
  /\bassert\.(?:True|Equal)\s*\(\s*t\s*,\s*true\s*[,)]/,
];

const EXIT_PATTERNS: readonly RegExp[] = [
  /\bprocess\.exit\s*\(\s*0\s*\)/,
  /\bsys\.exit\s*\(\s*0\s*\)/,
  /\bos\._?exit\s*\(\s*0\s*\)/,
  /\bos\.Exit\s*\(\s*0\s*\)/,
];
const SHELL_EXIT_PATTERN = /(?:^|[\s;&|("'`])exit\s+0\b/;

const SUPPRESSION_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
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
  { pattern: /\b(?:c8|v8) ignore\b/, label: "excluded from coverage" },
];

const CI_WEAKENING_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcontinue-on-error:\s*true\b/, label: "step failures are ignored (continue-on-error: true)" },
  { pattern: /\ballow_failure:\s*true\b/, label: "job failures are allowed (allow_failure: true)" },
  { pattern: /\|\|\s*(?:true\b|:(?:\s|$))/, label: "command failure is swallowed (|| true)" },
  { pattern: /--no-verify\b/, label: "hooks are bypassed (--no-verify)" },
  { pattern: /^\s*-?\s*if:\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/, label: "step or job is disabled (if: false)" },
  { pattern: /--passWithNoTests\b/, label: "an empty test run passes (--passWithNoTests)" },
  { pattern: /--bail[=\s]0\b/, label: "test bail-out is disabled (--bail=0)" },
];

type CommandClass = "test" | "lint" | "typecheck" | "build" | "check";

const COMMAND_CLASSES: ReadonlyArray<{ kind: CommandClass; pattern: RegExp }> = [
  { kind: "test", pattern: /\b(?:tests?|vitest|jest|pytest|mocha|playwright|cypress|unittest|rspec|phpunit)\b/i },
  { kind: "lint", pattern: /\b(?:lint|eslint|ruff|clippy|vet|flake8|pylint|golangci-lint|biome|rubocop)\b/i },
  { kind: "typecheck", pattern: /\b(?:typecheck|type-check|tsc|mypy|pyright)\b/i },
  { kind: "build", pattern: /\bbuild\b/i },
  { kind: "check", pattern: /\bcheck\b/i },
];

const COMMAND_KEYS = new Set(["run", "script", "command", "cmd", "sh", "bash"]);

/** The shell command on a CI line, or null for comments and non-command YAML keys. */
function ciCommand(text: string): string | null {
  let body = text.trim().replace(/^-\s+/, "");
  if (!body || body.startsWith("#")) return null;
  const key = /^([\w.-]+):(?:\s+(.*))?$/.exec(body);
  if (key) {
    if (!COMMAND_KEYS.has(key[1])) return null;
    body = (key[2] ?? "").trim();
  }
  body = body.replace(/^["']|["']$/g, "").trim();
  return body && !/^[|>][+-]?$/.test(body) ? body : null;
}

function commandClasses(command: string): CommandClass[] {
  return COMMAND_CLASSES.filter((entry) => entry.pattern.test(command)).map((entry) => entry.kind);
}

const THRESHOLD_PATTERN =
  /(?:^|[^\w-])["']?(coverageThreshold|thresholds?|statements|branches|functions|lines|fail[_-]under|min[_-]coverage|minimum|target)["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i;

function thresholdOf(text: string): { key: string; value: number } | null {
  const match = THRESHOLD_PATTERN.exec(text);
  if (!match) return null;
  return { key: match[1].toLowerCase().replace(/-/g, "_"), value: Number(match[2]) };
}

const SCRIPT_PATTERN = /^\s*"(test|test:[^"]*|lint|typecheck|check|ci)"\s*:\s*(.*?),?\s*$/;

function scriptOf(text: string): { name: string; command: string } | null {
  const match = SCRIPT_PATTERN.exec(text);
  return match ? { name: match[1], command: match[2] } : null;
}

/** Test conventions that depend on the file name, not the directory. */
const NAMED_TEST_PATTERNS: readonly string[] = [
  "**/*.test.*", "**/*.spec.*", "**/*_test.go", "**/test_*.py", "**/*_test.py",
  "**/*Test.java", "**/*Tests.java", "**/*Test.kt", "**/*Tests.cs", "**/*_spec.rb",
];

// ── Context across the change ─────────────────────────────────
//
// A strong signal is downgraded, or not raised, only when the rest of the
// change shows that no verification was lost or that what it verified is
// gone too. Each rule below is evidence read from the same diff.

/** Assertion text as a key for matching moves: whitespace-insensitive, strings kept. */
function assertionKey(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function realAssertions(change: ChangedFile, lines: readonly DiffLine[]): DiffLine[] {
  return lines.filter((entry) => isAssertion(codeOnly(change.path, entry.text)));
}

/** Moving a test keeps it running only if the destination is picked up the same way. */
function staysInRunner(from: string, to: string): boolean {
  return isTestFile(to) && (!matchesAny(from, NAMED_TEST_PATTERNS) || matchesAny(to, NAMED_TEST_PATTERNS));
}

/**
 * Removed assertions that reappear verbatim in another test file of the same
 * change: tests moved between files or split out of one. A file can only
 * lend the assertions it gained beyond its own removals, so one added line
 * never accounts for two removals and a file that lost its own assertions
 * cannot hide that by receiving someone else's.
 */
function planAssertionMoves(changes: readonly ChangedFile[]): Map<ChangedFile, Set<DiffLine>> {
  const files = changes
    .filter((change) => !change.binary && isTestFile(change.path))
    .sort((left, right) => compareText(left.path, right.path))
    .map((change) => ({ change, removed: realAssertions(change, change.removed), added: realAssertions(change, change.added) }));
  const spare = new Map<ChangedFile, number>();
  const pool = new Map<string, ChangedFile[]>();
  for (const file of files) {
    const surplus = file.added.length - file.removed.length;
    if (surplus <= 0) continue;
    spare.set(file.change, surplus);
    for (const entry of file.added) {
      const key = assertionKey(entry.text);
      pool.set(key, [...(pool.get(key) ?? []), file.change]);
    }
  }
  const moved = new Map<ChangedFile, Set<DiffLine>>();
  for (const file of files) {
    for (const entry of file.removed) {
      const owners = pool.get(assertionKey(entry.text));
      if (!owners) continue;
      const index = owners.findIndex((owner) => (
        owner !== file.change && (spare.get(owner) ?? 0) > 0 && staysInRunner(file.change.previousPath ?? file.change.path, owner.path)
      ));
      if (index < 0) continue;
      const [owner] = owners.splice(index, 1);
      spare.set(owner, (spare.get(owner) ?? 0) - 1);
      const set = moved.get(file.change) ?? new Set<DiffLine>();
      set.add(entry);
      moved.set(file.change, set);
    }
  }
  return moved;
}

const DEFINITION_PATTERNS: readonly RegExp[] = [
  /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/g,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>)/g,
  /\bclass\s+([A-Za-z_$][\w$]*)/g,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/g,
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[[(]/g,
  /\bfn\s+([A-Za-z_]\w*)\s*[<(]/g,
];

function definedNames(path: string, lines: readonly DiffLine[]): Set<string> {
  const names = new Set<string>();
  for (const { text } of lines) {
    const code = codeOnly(path, text);
    if (COMMENTED_LINE.test(code)) continue;
    for (const pattern of DEFINITION_PATTERNS) {
      for (const match of code.matchAll(pattern)) if (match[1].length >= 3) names.add(match[1]);
    }
  }
  return names;
}

interface ChangeContext {
  /** Removed assertion lines that moved verbatim to another runnable test file. */
  moved: Map<ChangedFile, Set<DiffLine>>;
  /**
   * Functions and classes whose definitions left non-test code and whose
   * names appear nowhere in the code the change adds (not redefined, not
   * wrapped, not called from new code).
   */
  removedDefinitions: Set<string>;
  /** Non-test source files deleted by the change. */
  deletedSources: string[];
}

function changeContext(changes: readonly ChangedFile[]): ChangeContext {
  const removed = new Set<string>();
  const mentioned = new Set<string>();
  const deletedSources: string[] = [];
  for (const change of changes) {
    if (change.binary || isTestFile(change.path) || !CODE_EXTENSIONS.has(extname(change.path).toLowerCase())) continue;
    if (change.status === "deleted") deletedSources.push(change.path);
    for (const name of definedNames(change.path, change.removed)) removed.add(name);
    for (const { text } of change.added) {
      for (const name of codeOnly(change.path, text).match(IDENTIFIER) ?? []) mentioned.add(name);
    }
  }
  return {
    moved: planAssertionMoves(changes),
    removedDefinitions: new Set([...removed].filter((name) => !mentioned.has(name))),
    deletedSources: deletedSources.sort(compareText),
  };
}

// `(?<![.\w$])` keeps method calls such as /pattern/.test(value) out.
const TEST_DECLARATION =
  /(?<![.\w$])(?:it|test|describe|context|suite|specify)(?:\.\w+)*\s*\(|^\s*(?:async\s+)?def\s+test\w*\s*\(|\bfunc\s+(?:Test|Benchmark|Fuzz)\w*\s*\(|@Test\b|#\[(?:\w+::)?test\]|\[(?:Fact|Theory|Test|TestMethod)\]/;

/** Does a deleted file hold tests, or only helpers, fixtures or data that tests use? */
function heldTests(change: ChangedFile): boolean {
  if (matchesAny(change.path, NAMED_TEST_PATTERNS)) return true;
  return change.removed.some(({ text }) => {
    const code = codeOnly(change.path, text);
    return !COMMENTED_LINE.test(code) && (isAssertion(code) || TEST_DECLARATION.test(code));
  });
}

const IMPORT_SPECIFIER = /\b(?:import|from|require|export)\b[^"'`]*?\(?\s*["'`]([^"'`\s]+)["'`]/g;
const PYTHON_IMPORT = /^\s*(?:from\s+(\.*[\w.]*)\s+import\b|import\s+([\w.]+))/;

function withoutExtension(path: string): string {
  const extension = extname(path);
  return extension ? path.slice(0, -extension.length) : path;
}

/**
 * Repository paths (without extension) a test file's import lines may refer
 * to. "*\/x/y" stands for a bare or aliased specifier that matches any path
 * ending in /x/y.
 */
function importTargets(change: ChangedFile): string[] {
  const directory = dirname(change.path);
  const python = extname(change.path).toLowerCase() === ".py";
  const targets: string[] = [];
  for (const { text } of change.removed) {
    if (!python) {
      for (const match of text.matchAll(IMPORT_SPECIFIER)) {
        const specifier = match[1];
        if (specifier.startsWith(".")) targets.push(withoutExtension(join(directory, specifier)));
        else targets.push(`*/${withoutExtension(specifier.replace(/^[@~#]\//, ""))}`);
      }
      continue;
    }
    const statement = PYTHON_IMPORT.exec(text);
    const dotted = statement?.[1] ?? statement?.[2];
    if (dotted) {
      const dots = /^\.*/.exec(dotted)?.[0].length ?? 0;
      const rest = dotted.slice(dots).replace(/\./g, "/");
      if (dots > 0) {
        const base = [...Array(dots - 1)].reduce<string>((current) => dirname(current), directory);
        if (rest) targets.push(join(base, rest));
      } else if (rest) {
        targets.push(join(directory, rest), `*/${rest}`);
      }
    }
  }
  return targets;
}

/** A test's subject from its file name: orders.test.ts, test_orders.py, orders_test.go and OrdersTest.java → orders. */
function testStem(path: string): string {
  return basename(path)
    .replace(/\.[^.]+$/, "")
    .replace(/[._-](?:test|spec)$/i, "")
    .replace(/(?<=[a-z0-9])Tests?$/, "")
    .replace(/^test_/i, "")
    .toLowerCase();
}

/** The deleted source file a deleted test file imported or sat next to, if any. */
function deletedSubject(change: ChangedFile, context: ChangeContext): string | null {
  if (context.deletedSources.length === 0) return null;
  const targets = importTargets(change);
  for (const source of context.deletedSources) {
    const bare = withoutExtension(source);
    const imported = targets.some((target) => {
      if (!target.startsWith("*/")) return bare === target || bare === `${target}/index`;
      const tail = target.slice(2);
      return bare === tail || bare.endsWith(`/${tail}`) || bare.endsWith(`/${tail}/index`);
    });
    const colocated = dirname(source) === dirname(change.path) && withoutExtension(basename(source)).toLowerCase() === testStem(change.path);
    if (imported || colocated) return source;
  }
  return null;
}

function detectDeletedTest(change: ChangedFile, context: ChangeContext): RawSignal[] {
  if (change.status === "deleted" && isTestFile(change.path)) {
    // Helpers, fixtures and data under a test directory verify nothing on their own;
    // the tests tripwire still surfaces their deletion for review.
    if (!heldTests(change)) return [];
    const subject = deletedSubject(change, context);
    if (subject) {
      return [{
        path: change.path,
        signal: "test-file-deleted",
        severity: "warning",
        strong: false,
        message: `Test file deleted together with ${subject}, the code it tests`,
      }];
    }
    // A test file split into others, or folded into one: every assertion still runs.
    const moved = context.moved.get(change)?.size ?? 0;
    const assertions = realAssertions(change, change.removed).length;
    if (assertions > 0 && moved === assertions) return [];
    return [{ path: change.path, signal: "test-file-deleted", severity: "warning", message: "Test file deleted" }];
  }
  // A runner picks tests up by file name (*.test.*, test_*.py, *_test.go, ...);
  // renaming tests/orders.test.ts to tests/orders.disabled.ts silently drops it.
  const leavesRunner = (from: string, to: string) => (
    (isTestFile(from) && !isTestFile(to)) || (matchesAny(from, NAMED_TEST_PATTERNS) && !matchesAny(to, NAMED_TEST_PATTERNS))
  );
  if (change.status === "renamed" && change.previousPath && leavesRunner(change.previousPath, change.path)) {
    return [
      {
        path: change.path,
        signal: "test-file-deleted",
        severity: "warning",
        message: `Test file ${change.previousPath} was renamed to a path test runners do not pick up`,
      },
    ];
  }
  return [];
}

function detectTestLineSignals(change: ChangedFile): RawSignal[] {
  const signals: RawSignal[] = [];
  // The next added line that would still be inside a test call's options object
  // opened on an earlier added line:
  //   test('name', {
  //     timeout: 500,
  //     skip: true,
  //   }, fn)
  // Outside such an object a `skip:` property is ordinary data (pagination, fixtures).
  let optionsLine = -1;
  for (const { line, text } of change.added) {
    const code = codeOnly(change.path, text);
    const insideOptions = line === optionsLine;
    optionsLine = (insideOptions && !code.includes("}")) || TEST_OPTIONS_OPEN.test(code) ? line + 1 : -1;
    if (SKIP_PATTERNS.some((pattern) => pattern.test(code)) || (insideOptions && SKIP_OPTION_LINE.test(code))) {
      signals.push({
        path: change.path,
        line,
        signal: "test-skipped",
        severity: "warning",
        message: `Test skipped or disabled: ${excerpt(text)}`,
      });
    }
    if (FOCUS_PATTERNS.some((pattern) => pattern.test(code))) {
      signals.push({
        path: change.path,
        line,
        signal: "test-focused",
        severity: "warning",
        message: `Focused test silently skips every other test: ${excerpt(text)}`,
      });
    }
    if (TRIVIAL_PATTERNS.some((pattern) => pattern.test(code))) {
      signals.push({
        path: change.path,
        line,
        signal: "assertion-trivialized",
        severity: "warning",
        message: `Assertion cannot fail: ${excerpt(text)}`,
      });
    }
  }
  return signals;
}

/** A real assertion: one that cannot fail does not count as verification. */
const COMMENTED_LINE = /^\s*(?:\/\/|#|\/\*|\*|--|<!--)/;

function isAssertion(text: string): boolean {
  // A commented-out assertion verifies nothing.
  if (COMMENTED_LINE.test(text)) return false;
  return ASSERTION_PATTERN.test(text) && !TRIVIAL_PATTERNS.some((pattern) => pattern.test(text));
}

function isTrivialAssertion(text: string): boolean {
  return !COMMENTED_LINE.test(text) && TRIVIAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** Test constructs that run one body over a table of cases. */
const PARAMETRIZED_PATTERNS: readonly RegExp[] = [
  /\b(?:it|test|describe|suite|bench)(?:\.\w+)*\.each\s*[(`]/,
  /@pytest\.mark\.parametrize\b/,
  /@ParameterizedTest\b|@(?:Csv|Value|Method)Source\b/,
  /\[(?:Theory|InlineData|TestCase)\b/,
  /#\[(?:rstest|case|test_case)\b/,
  /\bfor\s+_\s*,\s*\w+\s*:=\s*range\b/,
  /\bt\.Run\s*\(/,
];

const NUMBER_LITERAL = /(?<![\w$.])-?\d+(?:\.\d+)?(?![\w$])/g;
const COMMON_NUMBERS = new Set(["0", "1", "-1"]);
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/** Values a line checks: numbers in code and the contents of single-line, non-interpolated strings. */
function literalsOf(path: string, text: string): { numbers: string[]; strings: string[] } {
  const strings = [...text.matchAll(STRING_LITERAL)]
    .map((match) => match[0].slice(1, -1))
    .filter((value) => value.trim() !== "" && !value.includes("${"));
  const numbers = [...codeOnly(path, text).matchAll(NUMBER_LITERAL)].map((match) => match[0]);
  return { numbers, strings };
}

/**
 * Folding near-identical tests into one parametrized test (it.each,
 * pytest.mark.parametrize, a Go table) removes assertion lines but keeps
 * the cases. A removed assertion counts as folded into the table when the
 * change adds a parametrized test with a real assertion in the same file and
 * every value the removed assertion checked appears in the added lines.
 */
function foldedIntoTable(change: ChangedFile): ((entry: DiffLine) => boolean) | null {
  const addsTable = change.added.some((entry) => PARAMETRIZED_PATTERNS.some((pattern) => pattern.test(codeOnly(change.path, entry.text))));
  if (!addsTable || realAssertions(change, change.added).length === 0) return null;
  const numbers = new Set<string>();
  const strings = new Set<string>();
  for (const entry of change.added) {
    const literals = literalsOf(change.path, entry.text);
    for (const value of literals.numbers) numbers.add(value);
    for (const value of literals.strings) strings.add(value);
  }
  return (entry) => {
    const literals = literalsOf(change.path, entry.text);
    const distinctive = literals.strings.length > 0 || literals.numbers.some((value) => !COMMON_NUMBERS.has(value));
    return distinctive && literals.numbers.every((value) => numbers.has(value)) && literals.strings.every((value) => strings.has(value));
  };
}

/** Removed lines grouped into contiguous blocks of the old file (a deleted test, a deleted describe). */
function removedBlocks(lines: readonly DiffLine[]): DiffLine[][] {
  const blocks: DiffLine[][] = [];
  for (const entry of lines) {
    const last = blocks[blocks.length - 1];
    if (last && entry.line === last[last.length - 1].line + 1) last.push(entry);
    else blocks.push([entry]);
  }
  return blocks;
}

function detectRemovedAssertions(change: ChangedFile, context: ChangeContext): RawSignal[] {
  if (change.status !== "modified" && change.status !== "renamed") return [];
  const assertion = (entry: DiffLine) => isAssertion(codeOnly(change.path, entry.text));
  const moved = context.moved.get(change);
  const folded = foldedIntoTable(change);
  // Assertions that moved to another test file or into a parametrized table still run.
  const removed = change.removed.filter((entry) => assertion(entry) && !moved?.has(entry) && !folded?.(entry));
  if (removed.length === 0) return [];
  const added = change.added.filter(assertion).length;
  // An assertion replaced by one that cannot fail is reported once, as assertion-trivialized.
  const trivialized = change.added.filter((entry) => isTrivialAssertion(codeOnly(change.path, entry.text))).length;
  const otherAdded = change.added.some((entry) => entry.text.trim() && !assertion(entry));
  const otherRemoved = change.removed.some((entry) => entry.text.trim() && !assertion(entry));
  // "Stripped": the surrounding test body was kept or rewritten rather than deleted wholesale.
  const triggers = (count: number) => {
    const lost = count - trivialized;
    return lost > 0 && (lost - added >= 3 || (added === 0 && (otherAdded || !otherRemoved)));
  };
  if (!triggers(removed.length)) return [];

  // Test blocks deleted together with the functions they called (a feature removed
  // with its tests) still lose verification, but of code that no longer exists.
  const subjects = new Set<string>();
  const withCode = new Set<DiffLine>();
  if (context.removedDefinitions.size > 0) {
    for (const block of removedBlocks(change.removed)) {
      const names = block.flatMap((entry) => codeOnly(change.path, entry.text).match(IDENTIFIER) ?? [])
        .filter((name) => context.removedDefinitions.has(name));
      if (names.length === 0) continue;
      for (const name of names) subjects.add(name);
      for (const entry of block) withCode.add(entry);
    }
  }
  const strong = triggers(removed.filter((entry) => !withCode.has(entry)).length);

  const noun = removed.length === 1 ? "assertion" : "assertions";
  const counts = added === 0 ? `${removed.length} ${noun} removed and none added` : `${removed.length} ${noun} removed, only ${added} added`;
  const names = [...subjects].sort(compareText).slice(0, 3).join(", ");
  return [
    {
      path: change.path,
      line: removed[0].line,
      signal: "assertions-removed",
      severity: "warning",
      ...(strong ? {} : { strong: false as const }),
      message: strong ? counts : `${counts}, together with the code they tested (${names})`,
    },
  ];
}

/**
 * In shell and CI scripts `exit 0` is usually legitimate (an early return
 * from a guard, the end of a script). It fakes success when it swallows a
 * failure (`cmd || exit 0`) or short-circuits a verification command on the
 * same line (`exit 0; npm test`, `npm test; exit 0`).
 */
function shellExitFakesSuccess(text: string, hook: boolean): boolean {
  if (!SHELL_EXIT_PATTERN.test(text) || COMMENTED_LINE.test(text)) return false;
  if (/\|\|\s*exit\s+0\b/.test(text)) return true;
  // A bare `exit 0` in a git hook skips every check after it.
  if (hook && /^\s*exit\s+0\s*(?:#.*)?$/.test(text)) return true;
  const command = text.replace(SHELL_EXIT_PATTERN, " ");
  if (/\bif\b|\bthen\b|\bfi\b|\belse\b/.test(text)) return false;
  return commandClasses(command).some((kind) => kind === "test" || kind === "lint" || kind === "typecheck" || kind === "check");
}

function detectExitZero(change: ChangedFile): RawSignal[] {
  const isPackageJson = basename(change.path) === "package.json";
  if (!isPackageJson && !isVerificationFile(change.path)) return [];
  const shell = isCiFile(change.path) || isShellLike(change.path) || matchesAny(change.path, HOOK_PATTERNS);
  const signals: RawSignal[] = [];
  for (const { line, text } of change.added) {
    if (isPackageJson) {
      // Only verification scripts count, e.g. "test": "exit 0".
      if (!scriptOf(text) || !SHELL_EXIT_PATTERN.test(text)) continue;
    } else if (!EXIT_PATTERNS.some((pattern) => pattern.test(codeOnly(change.path, text))) && !(shell && shellExitFakesSuccess(text, matchesAny(change.path, HOOK_PATTERNS)))) {
      continue;
    }
    signals.push({
      path: change.path,
      line,
      signal: "exit-zero",
      severity: "error",
      message: `Forced success exit can fake a passing run: ${excerpt(text)}`,
    });
  }
  return signals;
}

function detectSuppressions(change: ChangedFile): RawSignal[] {
  if (DOC_EXTENSIONS.has(extname(change.path).toLowerCase())) return [];
  const found: Array<{ line: number; label: string; text: string }> = [];
  for (const { line, text } of change.added) {
    const match = SUPPRESSION_PATTERNS.find((entry) => entry.pattern.test(codeOnly(change.path, text)));
    if (match) found.push({ line, label: match.label, text });
  }
  if (found.length === 0) return [];
  if (found.length >= 3) {
    return [
      {
        path: change.path,
        line: found[0].line,
        signal: "suppression-added",
        severity: "warning",
        message: `${found.length} check suppressions added (lines ${found.map((entry) => entry.line).join(", ")})`,
      },
    ];
  }
  return found.map((entry) => ({
    path: change.path,
    line: entry.line,
    signal: "suppression-added",
    severity: "info" as const,
    message: `Check suppression added (${entry.label}): ${excerpt(entry.text)}`,
  }));
}

const PR_TRIGGER = /^\s*(?:-\s*)?(?:pull_request|merge_request|merge_group)\s*:?\s*(?:#.*)?$|^\s*on\s*:\s*\[?[^\]#]*\bpull_request\b/;

/** Added lines in test-runner configuration that exclude tests from the run. */
const TEST_EXCLUSION_PATTERNS: readonly RegExp[] = [
  /\b(?:exclude|testPathIgnorePatterns|modulePathIgnorePatterns|testIgnore|ignorePatterns)\s*[:=]/,
  /--(?:ignore|deselect|exclude)\b/,
  /\bnorecursedirs\b|\baddopts\b[^\n]*(?:--ignore|-k\s+["']?not\b)/,
];

function detectTestExclusion(change: ChangedFile): RawSignal[] {
  const signals: RawSignal[] = [];
  for (const { line, text } of change.added) {
    if (COMMENTED_LINE.test(text) || !TEST_EXCLUSION_PATTERNS.some((pattern) => pattern.test(text))) continue;
    signals.push({
      path: change.path,
      line,
      signal: "tests-excluded",
      severity: "warning",
      message: `Test runner now excludes tests: ${excerpt(text)}`,
    });
  }
  return signals;
}

function detectCiWeakening(change: ChangedFile): RawSignal[] {
  const signals: RawSignal[] = [];
  for (const { line, text } of change.added) {
    if (text.trim().startsWith("#")) continue;
    const match = CI_WEAKENING_PATTERNS.find((entry) => entry.pattern.test(text));
    if (match) {
      signals.push({
        path: change.path,
        line,
        signal: "ci-weakened",
        severity: "warning",
        message: `CI weakened: ${match.label}`,
      });
    }
  }

  // Dropping the pull_request trigger means changes merge without this workflow running.
  const addsPrTrigger = change.added.some((entry) => PR_TRIGGER.test(entry.text));
  for (const { line, text } of change.removed) {
    if (!PR_TRIGGER.test(text) || addsPrTrigger) continue;
    signals.push({
      path: change.path,
      line,
      signal: "ci-weakened",
      severity: "warning",
      message: "CI no longer runs on pull requests (pull_request trigger removed)",
    });
  }

  const lost: Array<{ line: number; command: string }> = [];
  const addedClasses = new Set<CommandClass>();
  for (const { text } of change.added) {
    const command = ciCommand(text);
    if (command) for (const kind of commandClasses(command)) addedClasses.add(kind);
  }
  for (const { line, text } of change.removed) {
    const command = ciCommand(text);
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
      message: `CI file deleted; it ran ${lost.map((entry) => `"${excerpt(entry.command, 40)}"`).slice(0, 3).join(", ")}${lost.length > 3 ? ` and ${lost.length - 3} more` : ""}`,
    });
    return signals;
  }
  for (const entry of lost) {
    signals.push({
      path: change.path,
      line: entry.line,
      signal: "ci-weakened",
      severity: "warning",
      message: `CI no longer runs "${excerpt(entry.command, 60)}"`,
    });
  }
  return signals;
}

function detectCoverageLowered(change: ChangedFile): RawSignal[] {
  const addedByKey = new Map<string, Array<{ line: number; value: number }>>();
  for (const { line, text } of change.added) {
    const threshold = thresholdOf(text);
    if (!threshold) continue;
    const list = addedByKey.get(threshold.key) ?? [];
    list.push({ line, value: threshold.value });
    addedByKey.set(threshold.key, list);
  }
  const signals: RawSignal[] = [];
  const cursor = new Map<string, number>();
  for (const { text } of change.removed) {
    const threshold = thresholdOf(text);
    if (!threshold) continue;
    // Pair the n-th removed occurrence of a key with the n-th added one.
    const position = cursor.get(threshold.key) ?? 0;
    cursor.set(threshold.key, position + 1);
    const counterpart = addedByKey.get(threshold.key)?.[position];
    if (!counterpart) {
      // The threshold disappeared without a replacement: nothing enforces coverage any more.
      if (!addedByKey.has(threshold.key) && threshold.value > 0) {
        signals.push({
          path: change.path,
          line: change.removed.find((entry) => thresholdOf(entry.text)?.key === threshold.key)?.line,
          signal: "coverage-threshold-removed",
          severity: "warning",
          message: `Coverage threshold "${threshold.key}" (${threshold.value}) removed`,
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
      message: `Coverage threshold "${threshold.key}" lowered from ${threshold.value} to ${counterpart.value}`,
    });
  }
  return signals;
}

function detectScriptChanges(change: ChangedFile): RawSignal[] {
  const scripts = new Map<string, { added?: DiffLine; removed?: DiffLine; before?: string; after?: string }>();
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
  const signals: RawSignal[] = [];
  for (const [name, entry] of scripts) {
    // A moved or re-indented line is not a change, and a new script weakens nothing.
    if (entry.before !== undefined && entry.before === entry.after) continue;
    if (entry.before === undefined) continue;
    let message: string;
    if (entry.before !== undefined && entry.after !== undefined) {
      message = `Script "${name}" changed from ${excerpt(entry.before, 60)} to ${excerpt(entry.after, 60)}`;
    } else if (entry.after !== undefined) {
      message = `Script "${name}" added: ${excerpt(entry.after, 60)}`;
    } else {
      message = `Script "${name}" removed (was ${excerpt(entry.before ?? "", 60)})`;
    }
    signals.push({
      path: change.path,
      line: entry.added?.line ?? entry.removed?.line,
      signal: "test-script-changed",
      severity: "warning",
      message,
    });
  }
  return signals;
}

function detectSnapshotChurn(changes: readonly ChangedFile[]): RawSignal[] {
  const snapshots = changes
    .filter((change) => (change.status === "modified" || change.status === "deleted") && isSnapshotFile(change.path))
    .map((change) => change.path)
    .sort(compareText);
  if (snapshots.length < 5) return [];
  return [
    {
      path: snapshots[0],
      signal: "snapshots-mass-updated",
      severity: "info",
      message: `${snapshots.length} snapshot files modified or deleted; expected output may have been regenerated to match new behavior`,
    },
  ];
}

/**
 * Production code that detects it is running under a test runner. Special-
 * casing tests is a documented reward hack (return the expected value only
 * when graded). Legitimate uses exist, so this is a warning for a human.
 */
const TEST_DETECTION_PATTERNS: readonly RegExp[] = [
  /\bprocess\.env\.(?:VITEST|VITEST_WORKER_ID|JEST_WORKER_ID|MOCHA_WORKER_ID|PYTEST_CURRENT_TEST)\b/,
  /\bprocess\.env(?:\.NODE_ENV|\[\s*["'`]NODE_ENV["'`]\s*\])\s*[!=]==?\s*["'`]test["'`]/,
  /["'`]test["'`]\s*[!=]==?\s*process\.env(?:\.NODE_ENV|\[\s*["'`]NODE_ENV["'`]\s*\])/,
  /["']pytest["']\s+in\s+sys\.modules/,
  /\b(?:os\.environ(?:\.get)?|getenv)\s*[([]\s*["']PYTEST_CURRENT_TEST["']/,
  /\btesting\.Testing\s*\(\s*\)/,
  /\bRails\.env\.test\?/,
  // In-source testing blocks are legitimate; returning early from one is not.
  /\bimport\.meta\.vitest\b[^\n]*\breturn\b/,
  /\bimport\.meta\.env\.(?:MODE|NODE_ENV)\s*[!=]==?\s*["'`]test["'`]/,
];

function detectTestSpecialCasing(change: ChangedFile): RawSignal[] {
  if (!CODE_EXTENSIONS.has(extname(change.path).toLowerCase()) || isVerificationFile(change.path)) return [];
  if (matchesAny(change.path, RUNNER_CONFIG_PATTERNS)) return [];
  const signals: RawSignal[] = [];
  for (const { line, text } of change.added) {
    // The match must start in code: fixtures that quote these patterns do not count.
    const masked = codeOnly(change.path, text);
    const inCode = TEST_DETECTION_PATTERNS.some((pattern) => {
      const match = pattern.exec(text);
      return match !== null && masked[match.index] === text[match.index] && masked[match.index] !== " ";
    });
    if (!inCode) continue;
    signals.push({
      path: change.path,
      line,
      signal: "test-special-casing",
      severity: "warning",
      message: `Production code now behaves differently under tests: ${excerpt(text)}`,
    });
  }
  return signals;
}

/**
 * Heuristics for changes that make verification easier to pass rather than
 * making the code correct. Signals are sorted by path, line, then signal.
 * Each carries `strong` (see WEAKENING_SIGNALS): whether, under
 * `policy.verificationWeakening: "require-approval"`, it needs a human.
 */
export function detectVerificationWeakening(changes: readonly ChangedFile[]): WeakeningSignal[] {
  const context = changeContext(changes);
  const signals: RawSignal[] = [];
  for (const change of changes) {
    signals.push(...detectDeletedTest(change, context));
    if (change.binary) continue;
    const testFile = isTestFile(change.path) || basename(change.path) === "conftest.py";
    if (testFile) {
      signals.push(...detectTestLineSignals(change));
      signals.push(...detectRemovedAssertions(change, context));
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
  return signals
    .map((signal): WeakeningSignal => ({ ...signal, strong: signal.strong !== false && WEAKENING_SIGNALS[signal.signal] === "strong" }))
    .sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        (left.line ?? 0) - (right.line ?? 0) ||
        compareText(left.signal, right.signal) ||
        compareText(left.message, right.message),
    );
}
