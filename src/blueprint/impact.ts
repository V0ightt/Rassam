import { componentForPath, dependentsOf, reverseAdjacency } from "./graph";
import type { Blueprint } from "./schema";
import type { ComponentGraph, ImpactReport } from "./types";
import { uniqueSorted } from "./util";

/**
 * Blast radius of a set of changed paths: which components they touch and
 * which components depend on those, transitively, nearest first.
 */
export function computeImpact(paths: readonly string[], blueprint: Blueprint | null, graph: ComponentGraph): ImpactReport {
  const changedFiles = uniqueSorted(paths);
  const touched = new Map<string, Set<string>>();
  for (const path of changedFiles) {
    const owner = graph.membership.fileToComponent.get(path) ?? componentForPath(path, blueprint);
    if (!owner) continue;
    const set = touched.get(owner) ?? new Set<string>();
    set.add(path);
    touched.set(owner, set);
  }
  const touchedComponents = [...touched.entries()]
    .map(([id, files]) => ({ id, files: [...files].sort() }))
    .sort((left, right) => right.files.length - left.files.length || left.id.localeCompare(right.id));
  return {
    changedFiles,
    touchedComponents,
    dependents: dependentsOf(touched.keys(), reverseAdjacency(graph)),
  };
}

/** component id → number of transitive dependents (used to weight findings). */
export function dependentCounts(graph: ComponentGraph): Map<string, number> {
  const reverse = reverseAdjacency(graph);
  const counts = new Map<string, number>();
  for (const id of graph.membership.componentFiles.keys()) {
    counts.set(id, dependentsOf([id], reverse).length);
  }
  return counts;
}
