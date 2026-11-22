// Isomorphic POSIX path helpers. The blueprint engine runs in Node (CLI, MCP,
// CI gate) and in the browser (canvas), so it must not import `node:path`.

export function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

export function normalize(value: string): string {
  const input = toPosix(value);
  const absolute = input.startsWith("/");
  const parts: string[] = [];
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

export function join(...segments: string[]): string {
  return normalize(segments.filter((segment) => segment.length > 0).join("/"));
}

export function dirname(value: string): string {
  const normalized = toPosix(value).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}

export function basename(value: string, extension?: string): string {
  const normalized = toPosix(value).replace(/\/+$/, "");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (extension && base.endsWith(extension) && base !== extension) return base.slice(0, -extension.length);
  return base;
}

export function extname(value: string): string {
  const base = basename(value);
  const index = base.lastIndexOf(".");
  return index <= 0 ? "" : base.slice(index);
}

/** Repository-relative path with no leading `./` and forward slashes. */
export function repoPath(value: string): string {
  const normalized = normalize(value);
  return normalized === "." ? "" : normalized.replace(/^\.\//, "");
}

/** Every ancestor directory of a repository path, nearest first, ending with "". */
export function ancestors(filePath: string): string[] {
  const result: string[] = [];
  let current = dirname(filePath);
  while (current !== "." && current !== "/" && current !== "") {
    result.push(current);
    current = dirname(current);
  }
  result.push("");
  return result;
}

export function isWithin(filePath: string, directory: string): boolean {
  if (!directory) return true;
  return filePath === directory || filePath.startsWith(`${directory}/`);
}
