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
  /** Upper bound on derived components. */
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

interface Cluster {
  key: string;
  globs: string[];
  files: string[];
  directory: string;
}

const PROVENANCE_SOURCE = "derived" as const;

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

/** Recursively split the directory tree into clusters of reasonable size. */
function clusterFiles(sourceFiles: string[], maxFiles: number): Cluster[] {
  const counts = new Map<string, number>();
  const direct = new Map<string, string[]>();
  const children = new Map<string, Set<string>>();
  for (const file of sourceFiles) {
    const dir = directoryOfFile(file);
    direct.set(dir, [...(direct.get(dir) ?? []), file]);
    let current = dir;
    counts.set("", (counts.get("") ?? 0) + 1);
    while (current) {
      counts.set(current, (counts.get(current) ?? 0) + 1);
      const parent = directoryOfFile(current);
      const set = children.get(parent) ?? new Set<string>();
      set.add(current);
      children.set(parent, set);
      current = parent;
    }
  }

  const filesUnder = (dir: string): string[] => sourceFiles.filter((file) => paths.isWithin(file, dir));
  const clusters: Cluster[] = [];

  const visit = (dir: string, depth: number): void => {
    const total = counts.get(dir) ?? 0;
    const subdirs = [...(children.get(dir) ?? [])].sort();
    const directFiles = direct.get(dir) ?? [];
    const mustSplit = dir === "" && subdirs.length > 0;
    if (!mustSplit && (total <= maxFiles || subdirs.length === 0 || depth >= 6)) {
      clusters.push({ key: dir || "root", globs: [dir ? `${dir}/**` : "/*"], files: dir ? filesUnder(dir) : directFiles, directory: dir });
      return;
    }
    // Pass-through: a single subdirectory and no files of its own.
    const small: string[] = [];
    for (const sub of subdirs) {
      if ((counts.get(sub) ?? 0) < 2 && subdirs.length > 1) small.push(sub);
      else visit(sub, depth + 1);
    }
    if (directFiles.length || small.length) {
      const globs = [...(directFiles.length ? [dir ? `${dir}/*` : "/*"] : []), ...small.map((sub) => `${sub}/**`)];
      const files = [...directFiles, ...small.flatMap((sub) => filesUnder(sub))];
      clusters.push({ key: dir ? `${dir}:root` : "root", globs, files, directory: dir });
    }
  };
  visit("", 0);
  return clusters.filter((cluster) => cluster.files.length > 0);
}

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

export function detectSystemName(files: readonly SourceFile[]): string | null {
  const pkg = readJson(files, "package.json");
  if (typeof pkg?.name === "string" && pkg.name.trim()) return pkg.name.trim();
  const text = (path: string) => files.find((file) => file.path === path)?.content ?? null;
  const goModule = text("go.mod")?.match(/^module\s+(\S+)/m)?.[1];
  if (goModule) return goModule.split("/").pop() ?? goModule;
  const cargo = text("Cargo.toml")?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (cargo) return cargo;
  const pyproject = text("pyproject.toml")?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (pyproject) return pyproject;
  return null;
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base || "component";
  let counter = 2;
  while (used.has(candidate)) candidate = `${base}-${counter++}`;
  used.add(candidate);
  return candidate;
}

function componentIdFor(directory: string, isRootCluster: boolean): string {
  const segments = directory.split("/").filter(Boolean).filter((segment) => !["src", "source", "packages", "apps"].includes(segment.toLowerCase()) || directory.split("/").length === 1);
  const tail = segments.slice(-2).join("-");
  const base = slugify(tail || directory || "root");
  return isRootCluster && directory ? `${base}-root` : base;
}

function componentName(directory: string, isRootCluster: boolean): string {
  const segments = directory.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Root";
  const parent = segments.length > 1 ? segments[segments.length - 2] : "";
  const base = parent && !["src", "app", "packages", "apps"].includes(parent) && segments.length > 2
    ? `${titleCase(parent)} ${titleCase(last)}`
    : titleCase(last);
  return isRootCluster && directory ? `${base} (top-level files)` : base;
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
  const maxComponents = options.maxComponents ?? 40;

  const graph = buildFileGraph(files);
  const sourceFiles = [...graph.facts.values()].map((facts) => facts.path).sort();
  const testFiles = sourceFiles.filter((path) => graph.facts.get(path)?.isTest);
  const productionFiles = sourceFiles.filter((path) => !graph.facts.get(path)?.isTest);

  let clusters = clusterFiles(productionFiles, maxFiles);
  let budget = maxFiles;
  while (clusters.length > maxComponents && budget < 5_000) {
    budget = Math.ceil(budget * 1.6);
    clusters = clusterFiles(productionFiles, budget);
  }

  const used = new Set<string>();
  const components: BlueprintComponent[] = clusters.map((cluster) => {
    const isRootCluster = cluster.key.endsWith(":root") || cluster.key === "root";
    return {
      id: uniqueId(componentIdFor(cluster.directory, isRootCluster && cluster.globs.some((glob) => glob.endsWith("/*"))), used),
      name: componentName(cluster.directory, isRootCluster && cluster.globs.some((glob) => glob.endsWith("/*"))),
      kind: cluster.directory ? kindFor(cluster.directory) : "config",
      description: `${cluster.files.length} source file${cluster.files.length === 1 ? "" : "s"} under ${cluster.directory || "the repository root"}`,
      paths: cluster.globs,
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
