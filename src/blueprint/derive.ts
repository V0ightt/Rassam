import { BLUEPRINT_SCHEMA_URL, BLUEPRINT_VERSION, blueprintSchema, type Blueprint, type BlueprintComponent, type BlueprintRule, type Provenance } from "./schema";
import { TEST_PATTERNS } from "./constants";
import { compileGlob } from "./glob";
import { assignComponents, buildComponentGraph } from "./graph";
import { buildFileGraph } from "./imports";
import * as paths from "./paths";
import type { SourceFile } from "./types";
import { slugify, titleCase } from "./util";

// Drafts a blueprint from the observed structure of a repository. Everything
// it writes is marked `provenance.source = "derived"`: a starting point for a
// human to correct, not a contract. The facts that matter (intent, rules,
// invariants) are deliberately left for people to write.

export interface DeriveOptions {
  name?: string;
  repository?: string;
  commit?: string;
  now?: string;
  author?: string;
  /** Target maximum number of source files per component before splitting. */
  maxFilesPerComponent?: number;
  /** Upper bound on derived components, not counting the tests component (default 20). */
  maxComponents?: number;
}

const KIND_BY_SEGMENT: Record<string, string> = {
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
  scripts: "utility",
  tools: "utility",
  docs: "documentation",
  doc: "documentation",
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
  proxy: "proxy",
};

const PROVENANCE_SOURCE = "derived" as const;

/** A folder with fewer source files than this is folded into its parent's leftovers instead of drawn on its own. */
const MIN_FOLDER_FILES = 2;
/** At most this many components come out of one folder; past it only substantial children stay separate. */
const MAX_CHILDREN = 10;
/** Size-based splitting stops at this folder depth. */
const MAX_SPLIT_DEPTH = 6;
/** Folders that hold one concern however many subfolders they have: never split per child. */
const NO_SPLIT = new Set(["benchmarks", "benchmark", "bench", "examples", "example", "demo", "demos", "docs", "doc", "scripts", "e2e", "fixtures", "__fixtures__", "testdata", "migrations"]);
/** `src/main/java` and friends, at the repository root or inside a module of a multi-module build. */
const JVM_SOURCE_ROOT = /(?:^|\/)src\/main\/(?:java|kotlin|scala)$/;

/** Files at the repository root that configure tools rather than make up the product. */
const CONFIG_FILE_PATTERNS: readonly RegExp[] = [
  /\.config\.[cm]?[jt]sx?$/i,
  /^\.[\w.-]+rc\.[cm]?[jt]s$/i,
  /\.conf\.[cm]?[jt]s$/i,
  /^(?:gulpfile|gruntfile|jakefile|dangerfile)\.[cm]?[jt]s$/i,
  /^(?:webpack|rollup|vite|vitest|jest|babel|playwright|cypress|tailwind|postcss|esbuild|tsup|eslint|prettier|commitlint|lint-staged|stylelint)\.[\w.-]+\.[cm]?[jt]s$/i,
  /^(?:setupTests|setup-tests|test-setup|global-?setup|global-?teardown)\.[cm]?[jt]sx?$/i,
  /\.(?:setup|workspace|preset)\.[cm]?[jt]sx?$/i,
  /^(?:setup|conf|noxfile|fabfile|tasks|dodo|manage|conftest)\.py$/i,
  /^build\.rs$/i,
  /^magefile\.go$/i,
];

function isConfigFile(path: string): boolean {
  const base = paths.basename(path);
  return CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(base));
}

function kindFor(directory: string): string {
  const segments = directory.split("/").filter(Boolean).reverse();
  for (const segment of segments) {
    const kind = KIND_BY_SEGMENT[segment.toLowerCase()];
    if (kind) return kind;
  }
  return "core";
}

function directoryOfFile(path: string): string {
  const dir = paths.dirname(path);
  return dir === "." ? "" : dir;
}

/** Segment-wise ordinal comparison, so a folder sorts right before its own subfolders; `null` sorts after every name. */
function compareSegments(left: ReadonlyArray<string | null>, right: ReadonlyArray<string | null>): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

const segmentsOf = (directory: string): string[] => (directory ? directory.split("/") : []);
const comparePaths = (left: string, right: string): number => compareSegments(segmentsOf(left), segmentsOf(right));

// ── The folder tree of production source files ────────────────

interface DirectoryTree {
  count(dir: string): number;
  direct(dir: string): string[];
  children(dir: string): string[];
  directories(): string[];
  filesUnder(dir: string): string[];
}

function buildTree(sourceFiles: readonly string[]): DirectoryTree {
  const counts = new Map<string, number>();
  const direct = new Map<string, string[]>();
  const children = new Map<string, Set<string>>();
  for (const file of sourceFiles) {
    const dir = directoryOfFile(file);
    const own = direct.get(dir);
    if (own) own.push(file);
    else direct.set(dir, [file]);
    counts.set("", (counts.get("") ?? 0) + 1);
    let current = dir;
    while (current) {
      counts.set(current, (counts.get(current) ?? 0) + 1);
      const parent = directoryOfFile(current);
      const set = children.get(parent) ?? new Set<string>();
      set.add(current);
      children.set(parent, set);
      current = parent;
    }
  }
  const sorted = new Map([...children].map(([dir, set]) => [dir, [...set].sort(comparePaths)]));
  return {
    count: (dir) => counts.get(dir) ?? 0,
    direct: (dir) => direct.get(dir) ?? [],
    children: (dir) => sorted.get(dir) ?? [],
    directories: () => [...counts.keys()].sort(comparePaths),
    filesUnder: (dir) => sourceFiles.filter((file) => paths.isWithin(file, dir)),
  };
}

// ── Clusters ──────────────────────────────────────────────────

interface Cluster {
  directory: string;
  /** "whole": everything under `directory`. "rest": its own files plus the small folders folded into it. */
  shape: "whole" | "rest";
  /** Child folders folded into a "rest" cluster. */
  merged: string[];
  size: number;
}

interface Clustering {
  tree: DirectoryTree;
  clusters: Cluster[];
  /** Base package directories of JVM source roots (`src/main/java/org/acme/app`) → the module path in front of `src/main/…`. */
  jvmBases: Map<string, string>;
}

/**
 * Split the source tree into components.
 *
 * The root is always split into its top-level folders. Then the largest folder
 * over `maxFiles` is split into its children, again and again, while the
 * total stays within `maxComponents`: big folders are refined first, and a
 * small library never explodes into one component per sibling folder.
 *  - A split must produce at least two substantial pieces (`minSplit` files),
 *    otherwise the folder stays whole (eight 5-file adapters are one "Adapters").
 *  - One folder yields at most MAX_CHILDREN pieces; past that, only children
 *    with `minSplit` files stay separate and the rest join "<Folder> (other)".
 *  - Folders like `benchmarks`, `examples`, `docs` and `scripts` are never split.
 *  - Standard JVM layouts are split by the subpackages of their base package
 *    (`src/main/java/org/acme/app/{owner,vet}`), whatever their size.
 */
function clusterFiles(sourceFiles: readonly string[], maxFiles: number, maxComponents: number): Clustering {
  const tree = buildTree(sourceFiles);
  const minSplit = Math.max(4, Math.round(maxFiles / 4));

  // A folder that only wraps another (packages/x → packages/x/src) stands for the folder where that chain ends.
  const unwrap = (dir: string): string => {
    let target = dir;
    while (!tree.direct(target).length && tree.children(target).length === 1) target = tree.children(target)[0];
    return target;
  };
  // Size alone would leave a small repository as one component, with nothing to
  // put a rule between. Where its folders name layers (src/web, src/api, src/db),
  // each folder becomes a component however few files it holds.
  const smallRepository = sourceFiles.length <= maxFiles;
  const layered = (dir: string): boolean => smallRepository
    && tree.children(dir).filter((sub) => Object.hasOwn(KIND_BY_SEGMENT, paths.basename(sub).toLowerCase())).length >= 2;

  const jvmBases = new Map<string, string>();
  const jvmChain = new Set<string>();
  for (const dir of tree.directories()) {
    const match = JVM_SOURCE_ROOT.exec(dir);
    if (!match) continue;
    let base = dir;
    while (!tree.direct(base).length && tree.children(base).length === 1) base = tree.children(base)[0];
    if (tree.children(base).length < 2) continue;
    jvmBases.set(base, dir.slice(0, match.index));
    for (let current = base; ; current = directoryOfFile(current)) {
      jvmChain.add(current);
      if (!current) break;
    }
  }

  const whole = (dir: string): Cluster => ({ directory: dir, shape: "whole", merged: [], size: tree.count(dir) });
  const split = (dir: string, cap: number, keepSmall = false): Cluster[] => {
    const subs = tree.children(dir);
    let own = subs.filter((sub) => subs.length === 1 || keepSmall || tree.count(sub) >= MIN_FOLDER_FILES || jvmChain.has(sub));
    if (own.length > cap) {
      const keep = new Set(
        own
          .filter((sub) => tree.count(sub) >= minSplit || jvmChain.has(sub))
          .sort((left, right) => tree.count(right) - tree.count(left) || comparePaths(left, right))
          .slice(0, Math.max(1, cap - 1)),
      );
      own = own.filter((sub) => keep.has(sub));
    }
    const merged = subs.filter((sub) => !own.includes(sub));
    const pieces = own.map(whole);
    const directCount = tree.direct(dir).length;
    if (!directCount && merged.length === 1) pieces.push(whole(merged[0]));
    else if (directCount || merged.length) {
      pieces.push({ directory: dir, shape: "rest", merged, size: directCount + merged.reduce((sum, sub) => sum + tree.count(sub), 0) });
    }
    return pieces;
  };

  let clusters = split("", Math.max(2, Math.min(MAX_CHILDREN, maxComponents)), layered(""));
  const settled = new Set<string>();
  const splittable = (cluster: Cluster): boolean => {
    if (cluster.shape !== "whole" || settled.has(cluster.directory) || !tree.children(cluster.directory).length) return false;
    if (jvmChain.has(cluster.directory)) return true;
    return (cluster.size > maxFiles || layered(unwrap(cluster.directory)))
      && segmentsOf(cluster.directory).length < MAX_SPLIT_DEPTH
      && !NO_SPLIT.has(paths.basename(cluster.directory).toLowerCase());
  };
  for (;;) {
    const next = clusters
      .filter(splittable)
      .sort((left, right) => (
        Number(jvmChain.has(right.directory)) - Number(jvmChain.has(left.directory))
        || right.size - left.size
        || comparePaths(left.directory, right.directory)
      ))[0];
    if (!next) break;
    settled.add(next.directory);
    let pieces: Cluster[];
    if (jvmChain.has(next.directory)) {
      // Walk down the JVM chain one folder at a time, whatever the size.
      pieces = split(next.directory, MAX_CHILDREN);
      if (!(pieces.length >= 2 || (pieces.length === 1 && pieces[0].shape === "whole"))) continue;
    } else {
      // A folder that only wraps another (packages/x → packages/x/src) is split where that chain ends, or not at all.
      const target = unwrap(next.directory);
      if (segmentsOf(target).length >= MAX_SPLIT_DEPTH || NO_SPLIT.has(paths.basename(target).toLowerCase())) continue;
      const byLayer = layered(target);
      pieces = split(target, MAX_CHILDREN, byLayer);
      if (pieces.length < 2 || (!byLayer && pieces.filter((piece) => piece.size >= minSplit).length < 2)) continue;
    }
    if (clusters.length - 1 + pieces.length > maxComponents) continue;
    clusters = clusters.flatMap((cluster) => (cluster === next ? pieces : [cluster]));
  }

  // Folders before their leftovers, the repository root last.
  const orderKey = (cluster: Cluster): Array<string | null> => (cluster.shape === "whole" ? segmentsOf(cluster.directory) : [...segmentsOf(cluster.directory), null]);
  clusters.sort((left, right) => compareSegments(orderKey(left), orderKey(right)));
  return { tree, clusters: clusters.filter((cluster) => cluster.size > 0), jvmBases };
}

function clusterGlobs(cluster: Cluster, tree: DirectoryTree): string[] {
  const dir = cluster.directory;
  if (cluster.shape === "whole") return [dir ? `${dir}/**` : "/*"];
  return [...(tree.direct(dir).length ? [dir ? `${dir}/*` : "/*"] : []), ...cluster.merged.map((sub) => `${sub}/**`)];
}

function clusterSourceFiles(cluster: Cluster, tree: DirectoryTree): string[] {
  if (cluster.shape === "whole") return tree.filesUnder(cluster.directory);
  return [...tree.direct(cluster.directory), ...cluster.merged.flatMap((sub) => tree.filesUnder(sub))];
}

// ── Names ─────────────────────────────────────────────────────

function readJson(files: readonly SourceFile[], path: string): Record<string, unknown> | null {
  const file = files.find((candidate) => candidate.path === path);
  if (!file?.content) return null;
  try {
    const value = JSON.parse(file.content) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const fileText = (files: readonly SourceFile[], path: string): string | null => files.find((file) => file.path === path)?.content ?? null;

/** "github.com/gin-gonic/gin" → "gin"; "example.com/tool/v2" → "tool". */
function goModuleName(goMod: string | null): string | null {
  const modulePath = goMod?.match(/^module\s+(\S+)/m)?.[1];
  if (!modulePath) return null;
  const segments = modulePath.split("/").filter(Boolean);
  if (segments.length > 1 && /^v\d+$/.test(segments[segments.length - 1])) segments.pop();
  return segments[segments.length - 1] ?? modulePath;
}

/** `key = "value"` inside one `[section]` of a TOML file. */
function tomlValue(text: string | null, section: string, key: string): string | null {
  if (!text) return null;
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) {
      inside = header[1].trim() === section;
      continue;
    }
    if (!inside) continue;
    const value = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`).exec(line)?.[1];
    if (value) return value;
  }
  return null;
}

export function detectSystemName(files: readonly SourceFile[]): string | null {
  const pkg = readJson(files, "package.json");
  if (typeof pkg?.name === "string" && pkg.name.trim()) return pkg.name.trim();
  const goModule = goModuleName(fileText(files, "go.mod"));
  if (goModule) return goModule;
  const cargo = fileText(files, "Cargo.toml")?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (cargo) return cargo;
  const pyproject = fileText(files, "pyproject.toml")?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (pyproject) return pyproject;
  return null;
}

/** The package that root-level code belongs to, in the language of that code. */
function rootPackageName(files: readonly SourceFile[], rootCode: readonly string[]): string | null {
  const extensions = new Set(rootCode.map((path) => paths.extname(path).toLowerCase()));
  if (extensions.has(".go")) {
    const name = goModuleName(fileText(files, "go.mod"));
    if (name) return name;
  }
  if (extensions.has(".rs")) {
    const name = tomlValue(fileText(files, "Cargo.toml"), "package", "name");
    if (name) return name;
  }
  if (extensions.has(".py")) {
    const pyproject = fileText(files, "pyproject.toml");
    const name = tomlValue(pyproject, "project", "name")
      ?? tomlValue(pyproject, "tool.poetry", "name")
      ?? fileText(files, "setup.py")?.match(/\bname\s*=\s*["']([^"']+)["']/)?.[1]
      ?? null;
    if (name) return name;
  }
  return detectSystemName(files)?.replace(/^@[^/]+\//, "") ?? null;
}

/** The package whose sources live in the top-level `src`; null for a workspace root, whose `src` is not one package. */
function srcPackageName(files: readonly SourceFile[]): string | null {
  const cargo = fileText(files, "Cargo.toml");
  if (cargo && /^\s*\[package\]/m.test(cargo)) return tomlValue(cargo, "package", "name");
  const pyproject = fileText(files, "pyproject.toml");
  const python = tomlValue(pyproject, "project", "name") ?? tomlValue(pyproject, "tool.poetry", "name");
  if (python) return python;
  const pkg = readJson(files, "package.json");
  if (pkg && !pkg.workspaces && typeof pkg.name === "string" && pkg.name.trim()) return pkg.name.trim().replace(/^@[^/]+\//, "");
  return null;
}

/** "gin" → "Gin", "socket.io" → "Socket Io": a package name has no file extension to drop. */
const packageTitle = (name: string): string => titleCase(name.replace(/\./g, "-"));

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base || "component";
  let counter = 2;
  while (used.has(candidate)) candidate = `${base}-${counter++}`;
  used.add(candidate);
  return candidate;
}

function componentIdFor(directory: string): string {
  const segments = directory.split("/").filter(Boolean).filter((segment) => !["src", "source", "packages", "apps"].includes(segment.toLowerCase()) || directory.split("/").length === 1);
  const tail = segments.slice(-2).join("-");
  return slugify(tail || directory || "root");
}

function componentName(directory: string): string {
  const segments = directory.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Root";
  const parent = segments.length > 1 ? segments[segments.length - 2] : "";
  return parent && !["src", "app", "packages", "apps"].includes(parent) && segments.length > 2
    ? `${titleCase(parent)} ${titleCase(last)}`
    : titleCase(last);
}

interface ClusterIdentity {
  id: string;
  name: string;
  kind: string;
}

interface NamingContext {
  tree: DirectoryTree;
  jvmBases: Map<string, string>;
  /** Root-level files that are code rather than tool configuration. */
  rootCode: string[];
  rootPackage: string | null;
  /** The package whose sources live in the top-level `src` (a single-package repository). */
  srcPackage: string | null;
}

/** `src` holding one package and nothing else (Python's src layout) is named after that package. */
function displayDirectory(dir: string, tree: DirectoryTree): string {
  if (!/^(?:src|source)$/i.test(paths.basename(dir))) return dir;
  let current = dir;
  while (!tree.direct(current).length && tree.children(current).length === 1) current = tree.children(current)[0];
  return current;
}

/** A JVM base package or one of its subpackages, named after the package (with the module in multi-module builds). */
function jvmName(dir: string, context: NamingContext): string | null {
  const modulePath = context.jvmBases.get(dir) ?? context.jvmBases.get(directoryOfFile(dir));
  if (modulePath === undefined) return null;
  const moduleName = modulePath ? paths.basename(modulePath) : "";
  return [moduleName ? titleCase(moduleName) : "", titleCase(paths.basename(dir))].filter(Boolean).join(" ");
}

function identify(cluster: Cluster, context: NamingContext): ClusterIdentity {
  const dir = cluster.directory;
  if (cluster.shape === "whole") {
    const jvm = jvmName(dir, context);
    if (jvm) return { id: slugify(jvm), name: jvm, kind: kindFor(dir) };
    const shown = displayDirectory(dir, context.tree);
    if (shown === "src" && context.srcPackage) return { id: slugify(context.srcPackage), name: packageTitle(context.srcPackage), kind: "core" };
    return { id: componentIdFor(shown), name: componentName(shown), kind: kindFor(shown) };
  }
  if (!dir) {
    // Root-level code is the root package (a Go module, a Python or Rust package), not configuration.
    if (!context.rootCode.length) return { id: "root", name: "Root", kind: "config" };
    const name = context.rootPackage ? packageTitle(context.rootPackage) : "Root";
    return { id: context.rootPackage ? slugify(context.rootPackage) : "root", name, kind: "core" };
  }
  const merged = cluster.merged.length > 0;
  const jvm = context.jvmBases.has(dir) ? jvmName(dir, context) : null;
  if (jvm) return { id: slugify(merged ? `${jvm} other` : jvm), name: merged ? `${jvm} (other)` : jvm, kind: kindFor(dir) };
  const pkg = dir === "src" && context.srcPackage ? context.srcPackage : null;
  const baseName = pkg ? packageTitle(pkg) : componentName(dir);
  const baseId = pkg ? slugify(pkg) : componentIdFor(dir);
  return {
    id: `${baseId}-${merged ? "other" : "root"}`,
    name: `${baseName} (${merged ? "other" : "top-level files"})`,
    kind: kindFor(dir),
  };
}

export function deriveBlueprint(files: readonly SourceFile[], options: DeriveOptions = {}): Blueprint {
  const now = options.now ?? new Date().toISOString();
  const provenance: Provenance = {
    source: PROVENANCE_SOURCE,
    by: options.author ?? "rassam init",
    at: now,
    ...(options.commit ? { commit: options.commit } : {}),
  };
  const maxFiles = options.maxFilesPerComponent ?? 40;
  const maxComponents = options.maxComponents ?? 20;

  const graph = buildFileGraph(files);
  const sourceFiles = [...graph.facts.values()].map((facts) => facts.path).sort();
  const testFiles = sourceFiles.filter((path) => graph.facts.get(path)?.isTest);
  const productionFiles = sourceFiles.filter((path) => !graph.facts.get(path)?.isTest);

  const { tree, clusters, jvmBases } = clusterFiles(productionFiles, maxFiles, maxComponents);
  const rootCode = tree.direct("").filter((path) => !isConfigFile(path));
  const context: NamingContext = {
    tree,
    jvmBases,
    rootCode,
    rootPackage: rootCode.length ? rootPackageName(files, rootCode) : null,
    srcPackage: tree.count("src") ? srcPackageName(files) : null,
  };

  const used = new Set<string>();
  const components: BlueprintComponent[] = clusters.map((cluster) => {
    const identity = identify(cluster, context);
    const count = clusterSourceFiles(cluster, tree).length;
    return {
      id: uniqueId(identity.id, used),
      name: identity.name,
      kind: identity.kind,
      description: `${count} source file${count === 1 ? "" : "s"} under ${cluster.directory || "the repository root"}`,
      paths: clusterGlobs(cluster, tree),
      provenance,
    };
  });

  if (testFiles.length) {
    const testGlobs = TEST_PATTERNS.filter((pattern) => testFiles.some((file) => compileGlob(pattern).test(file)));
    components.push({
      id: uniqueId("tests", used),
      name: "Tests",
      kind: "test",
      description: `${testFiles.length} test file${testFiles.length === 1 ? "" : "s"}`,
      paths: testGlobs,
      priority: 10,
      provenance,
    });
  }

  const draft = blueprintSchema.parse({
    $schema: BLUEPRINT_SCHEMA_URL,
    version: BLUEPRINT_VERSION,
    system: {
      name: options.name ?? detectSystemName(files) ?? "repository",
      ...(options.repository ? { repository: options.repository } : {}),
      description: "Draft generated by `rassam init`. Replace derived facts with human-authored intent, rules and invariants.",
    },
    components,
  });

  const membership = assignComponents(graph.files, draft);
  const componentGraph = buildComponentGraph(graph, membership);
  const testsId = components.find((component) => component.kind === "test")?.id;

  draft.dependencies = componentGraph.edges
    .filter((edge) => edge.from !== testsId)
    .map((edge) => ({ from: edge.from, to: edge.to, kind: "imports" as const, provenance }));

  const rules: BlueprintRule[] = [
    {
      id: "no-component-cycles",
      kind: "no-cycles",
      severity: "warning",
      reason: "Cycles erase the direction of dependency, so no component can change safely in isolation.",
      provenance,
    },
  ];
  if (testsId) {
    rules.push({
      id: "tests-are-leaves",
      kind: "forbid",
      from: ["*", `!${testsId}`],
      to: testsId,
      severity: "error",
      reason: "Production code must never depend on test code.",
      provenance,
    });
  }

  // Secrets read by only a few components: propose that only they may read them.
  const readers = new Map<string, Set<string>>();
  for (const [componentId, refs] of componentGraph.env) {
    for (const ref of refs) {
      if (!ref.secretLike || componentId === testsId) continue;
      const set = readers.get(ref.name) ?? new Set<string>();
      set.add(componentId);
      readers.set(ref.name, set);
    }
  }
  for (const [name, set] of [...readers.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (set.size > 3) continue;
    rules.push({
      id: `secret-${slugify(name, 60)}`,
      kind: "secret-access",
      secrets: [name],
      // Tests legitimately set and read environment variables.
      allow: [...[...set].sort(), ...(testsId ? [testsId] : [])],
      severity: "error",
      reason: `Only the components that read ${name} today may hold it. Review before accepting.`,
      provenance,
    });
  }
  draft.rules = rules;
  return draft;
}
