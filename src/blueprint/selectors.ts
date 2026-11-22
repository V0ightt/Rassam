import { compileGlob, type GlobMatcher } from "./glob";
import type { Blueprint, Selector } from "./schema";

// Selector grammar (see schema.ts):
//   "*" | "<id>" | "component:<id>" | "tag:<glob>" | "path:<glob>" | "package:<glob>" | "!<selector>"

export interface ResolvedSelector {
  /** "*" — every internal file. */
  all: boolean;
  components: Set<string>;
  paths: GlobMatcher[];
  packages: GlobMatcher[];
  excludeComponents: Set<string>;
  excludePaths: GlobMatcher[];
  excludePackages: GlobMatcher[];
  hasInternal: boolean;
  hasPackages: boolean;
  /** Original selector entries, for messages. */
  entries: string[];
}

export function selectorEntries(selector: Selector | undefined): string[] {
  if (selector === undefined) return [];
  return Array.isArray(selector) ? [...selector] : [selector];
}

/** Packages are always matched anchored ("react" must not match "github.com/x/react"). */
function packageMatcher(pattern: string): GlobMatcher {
  return compileGlob(`/${pattern.replace(/^\/+/, "")}`);
}

function componentsWithTag(blueprint: Blueprint, tagPattern: string): string[] {
  const matcher = compileGlob(`/${tagPattern}`);
  return blueprint.components
    .filter((component) => (component.tags ?? []).some((tag) => matcher.test(tag)))
    .map((component) => component.id);
}

export function resolveSelector(selector: Selector | undefined, blueprint: Blueprint): ResolvedSelector {
  const resolved: ResolvedSelector = {
    all: false,
    components: new Set(),
    paths: [],
    packages: [],
    excludeComponents: new Set(),
    excludePaths: [],
    excludePackages: [],
    hasInternal: false,
    hasPackages: false,
    entries: selectorEntries(selector),
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
    const ids = entry.startsWith("tag:")
      ? componentsWithTag(blueprint, entry.slice("tag:".length))
      : [entry.startsWith("component:") ? entry.slice("component:".length) : entry];
    for (const id of ids) {
      if (negated) resolved.excludeComponents.add(id);
      else resolved.components.add(id);
    }
    if (!negated) resolved.hasInternal = true;
  }
  return resolved;
}

/** Does an internal file (owned by `componentId`, or unmapped) fall in the selector? */
export function matchesFile(selector: ResolvedSelector, path: string, componentId: string | null): boolean {
  if (!selector.hasInternal) return false;
  if (componentId !== null && selector.excludeComponents.has(componentId)) return false;
  if (selector.excludePaths.some((matcher) => matcher.test(path))) return false;
  if (selector.all) return true;
  if (componentId !== null && selector.components.has(componentId)) return true;
  return selector.paths.some((matcher) => matcher.test(path));
}

/** Does a whole component fall in the selector? Path entries are ignored here. */
export function matchesComponent(selector: ResolvedSelector, componentId: string): boolean {
  if (selector.excludeComponents.has(componentId)) return false;
  return selector.all || selector.components.has(componentId);
}

export function matchesPackage(selector: ResolvedSelector, pkg: string): boolean {
  if (!selector.hasPackages) return false;
  if (selector.excludePackages.some((matcher) => matcher.test(pkg))) return false;
  return selector.packages.some((matcher) => matcher.test(pkg));
}

export function describeSelector(selector: Selector | undefined): string {
  const entries = selectorEntries(selector);
  if (!entries.length) return "nothing";
  const parts = entries.map((entry) => {
    if (entry === "*") return "any file";
    if (entry === "!*") return "no file";
    const negated = entry.startsWith("!");
    const body = negated ? entry.slice(1) : entry;
    let text: string;
    if (body.startsWith("package:")) text = `package ${body.slice(8)}`;
    else if (body.startsWith("path:")) text = `files matching ${body.slice(5)}`;
    else if (body.startsWith("tag:")) text = `components tagged ${body.slice(4)}`;
    else text = body.startsWith("component:") ? body.slice(10) : body;
    return negated ? `except ${text}` : text;
  });
  return parts.join(", ");
}
