// A small, dependency-free glob matcher with gitignore-like semantics:
//   **      any number of path segments (including none)
//   *       any characters except "/"
//   ?       one character except "/"
//   {a,b}   alternation (nestable)
//   [abc]   character class, [!abc] negated
// Patterns without a "/" match against the basename anywhere in the tree
// (like .gitignore), e.g. "*.test.ts". Patterns ending in "/" match a
// directory and everything below it.

export interface GlobMatcher {
  pattern: string;
  /** Number of literal (non-wildcard) characters; used to rank specificity. */
  specificity: number;
  test(path: string): boolean;
}

const cache = new Map<string, GlobMatcher>();

function escapeRegex(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/** Index of the "}" that closes each "{" (unbalanced braces map to the pattern end). */
function braceCloses(pattern: string): Map<number, number> {
  const closes = new Map<number, number>();
  const open: number[] = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "\\") index += 1;
    else if (char === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close > index + 1) index = close;
    } else if (char === "{") open.push(index);
    else if (char === "}" && open.length) closes.set(open.pop() as number, index);
  }
  for (const index of open) closes.set(index, pattern.length);
  return closes;
}

function translate(pattern: string): string {
  let regex = "";
  let index = 0;
  let braceDepth = 0;
  const closes = braceCloses(pattern);
  // For each open brace: does it start a path segment, and does it end one?
  // "{**/tests/**,**/test/**}" must treat each alternative like a whole pattern.
  const braces: Array<{ start: boolean; end: boolean }> = [];
  const segmentStartAt = (position: number): boolean => {
    if (position === 0 || pattern[position - 1] === "/") return true;
    const previous = pattern[position - 1];
    return (previous === "{" || previous === ",") && braceDepth > 0 && braces[braces.length - 1].start;
  };
  const segmentEndAt = (position: number): boolean => {
    if (position === pattern.length || pattern[position] === "/") return true;
    return (pattern[position] === "," || pattern[position] === "}") && braceDepth > 0 && braces[braces.length - 1].end;
  };
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        const atSegmentStart = segmentStartAt(index);
        const atSegmentEnd = segmentEndAt(index + 2);
        if (atSegmentStart && atSegmentEnd) {
          if (pattern[index + 2] === "/") {
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
      const close = pattern.indexOf("]", index + 1);
      if (close > index + 1) {
        let body = pattern.slice(index + 1, close);
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
      const close = closes.get(index) ?? pattern.length;
      braces.push({ start: segmentStartAt(index), end: close >= pattern.length - 1 || pattern[close + 1] === "/" });
      braceDepth += 1;
      regex += "(?:";
      index += 1;
      continue;
    }
    if (char === "}" && braceDepth > 0) {
      braces.pop();
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
    if (char === "\\" && index + 1 < pattern.length) {
      regex += escapeRegex(pattern[index + 1]);
      index += 2;
      continue;
    }
    regex += escapeRegex(char);
    index += 1;
  }
  while (braceDepth > 0) {
    regex += ")";
    braceDepth -= 1;
  }
  return regex;
}

export function compileGlob(rawPattern: string): GlobMatcher {
  const cached = cache.get(rawPattern);
  if (cached) return cached;

  let pattern = rawPattern.trim().replace(/\\(?=[^*?[\]{}!\\])/g, "/");
  if (pattern.startsWith("./")) pattern = pattern.slice(2);
  const anchored = pattern.startsWith("/");
  if (anchored) pattern = pattern.slice(1);
  if (pattern.endsWith("/")) pattern = `${pattern}**`;
  const basenameOnly = !anchored && !pattern.includes("/");

  const body = translate(pattern);
  const regex = basenameOnly
    ? new RegExp(`^(?:.*/)?${body}$`)
    : new RegExp(`^${body}$`);
  // A directory pattern like "src/lib" should also match files below it.
  const directoryRegex = !/[*?[{]/.test(pattern) ? new RegExp(`^${body}/`) : null;

  const matcher: GlobMatcher = {
    pattern: rawPattern,
    specificity: pattern.replace(/\*\*|[*?]|\[[^\]]*]|[{},]/g, "").length,
    test(path: string): boolean {
      const candidate = path.replace(/\\/g, "/").replace(/^\.\//, "");
      return regex.test(candidate) || (directoryRegex !== null && directoryRegex.test(candidate));
    },
  };
  if (cache.size > 5000) cache.clear();
  cache.set(rawPattern, matcher);
  return matcher;
}

export function matchesAny(path: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => compileGlob(pattern).test(path));
}

/** Highest specificity among matching patterns, or -1 when none match. */
export function bestMatch(path: string, patterns: readonly string[] | undefined): number {
  let best = -1;
  for (const pattern of patterns ?? []) {
    const matcher = compileGlob(pattern);
    if (matcher.specificity > best && matcher.test(path)) best = matcher.specificity;
  }
  return best;
}
