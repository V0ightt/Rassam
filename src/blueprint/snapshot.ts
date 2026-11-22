import { isIgnoredPath } from "./imports";
import type { EnvRef, ExternalRef, FileEdge, FileFacts, FileGraph, Language } from "./types";

// A compact, JSON-safe form of the observed file graph. The server (or a local
// folder scan) computes it once from file contents; the canvas can then
// re-evaluate any edited blueprint instantly without the contents.

export interface SerializedFileGraph {
  version: 1;
  files: string[];
  facts: Array<{ path: string; language: Language | null; isTest: boolean; envRefs: EnvRef[] }>;
  edges: FileEdge[];
  externals: ExternalRef[];
  unresolved: FileGraph["unresolved"];
}

export function serializeFileGraph(graph: FileGraph): SerializedFileGraph {
  return {
    version: 1,
    files: [...graph.files],
    facts: [...graph.facts.values()].map((facts) => ({
      path: facts.path,
      language: facts.language,
      isTest: facts.isTest,
      envRefs: facts.envRefs,
    })),
    edges: graph.edges,
    externals: graph.externals,
    unresolved: graph.unresolved,
  };
}

export function deserializeFileGraph(serialized: SerializedFileGraph): FileGraph {
  const facts = new Map<string, FileFacts>();
  for (const entry of serialized.facts) {
    facts.set(entry.path, { path: entry.path, language: entry.language, isTest: entry.isTest, imports: [], envRefs: entry.envRefs ?? [] });
  }
  return {
    files: [...serialized.files],
    facts,
    edges: [...serialized.edges],
    externals: [...serialized.externals],
    unresolved: [...(serialized.unresolved ?? [])],
  };
}

/** Drop paths matched by blueprint `policy.ignore` from a prebuilt graph. */
export function filterFileGraph(graph: FileGraph, ignore: readonly string[]): FileGraph {
  if (!ignore.length) return graph;
  const keep = (path: string) => !isIgnoredPath(path, ignore);
  return {
    files: graph.files.filter(keep),
    facts: new Map([...graph.facts].filter(([path]) => keep(path))),
    edges: graph.edges.filter((edge) => keep(edge.from) && keep(edge.to)),
    externals: graph.externals.filter((ref) => keep(ref.from)),
    unresolved: graph.unresolved.filter((ref) => keep(ref.from)),
  };
}
