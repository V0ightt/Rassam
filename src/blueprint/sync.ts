import { buildSnapshotModel } from "./check";
import { deriveBlueprint } from "./derive";
import { assignComponents } from "./graph";
import { blueprintSchema, type Blueprint, type BlueprintComponent, type BlueprintDependency, type Provenance } from "./schema";
import type { SourceFile } from "./types";

// Keeps a blueprint in step with the code without ever touching what people
// wrote. Hand-made diagrams die because they drift; `rassam sync` proposes
// the missing facts (components for unclaimed code, declarations for observed
// edges), marks every one of them `derived`, and leaves review to a human.

export interface SyncOptions {
  /** Propose components for source files no component claims (default true). */
  components?: boolean;
  /** Declare observed but undeclared dependencies (default true). */
  dependencies?: boolean;
  commit?: string;
  author?: string;
  now?: string;
}

export interface SyncResult {
  blueprint: Blueprint;
  addedComponents: BlueprintComponent[];
  addedDependencies: BlueprintDependency[];
  /** Unclaimed files that could not be given a component without moving owned files. */
  skippedFiles: string[];
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) candidate = `${base}-${counter++}`;
  used.add(candidate);
  return candidate;
}

export function syncBlueprint(existing: Blueprint, files: readonly SourceFile[], options: SyncOptions = {}): SyncResult {
  const provenance: Provenance = {
    source: "derived",
    by: options.author ?? "rassam sync",
    at: options.now ?? new Date().toISOString(),
    ...(options.commit ? { commit: options.commit } : {}),
  };
  const next: Blueprint = blueprintSchema.parse(JSON.parse(JSON.stringify(existing)));
  const addedComponents: BlueprintComponent[] = [];
  const skippedFiles: string[] = [];
  const model = buildSnapshotModel(files, next);
  const ownedBefore = new Map(model.membership.fileToComponent);

  if (options.components !== false) {
    const unmapped = model.membership.unmapped.filter((path) => model.fileGraph.facts.has(path));
    if (unmapped.length) {
      const unmappedSet = new Set(unmapped);
      const draft = deriveBlueprint(files.filter((file) => unmappedSet.has(file.path)), { now: provenance.at });
      const used = new Set(next.components.map((component) => component.id));
      for (const proposed of draft.components) {
        const candidate: BlueprintComponent = { ...proposed, id: uniqueId(proposed.id, used), provenance };
        const trial = { ...next, components: [...next.components, candidate] };
        const assigned = assignComponents(model.fileGraph.files, trial).fileToComponent;
        // Never move a file that a person already assigned to a component.
        const steals = [...ownedBefore].some(([path, owner]) => assigned.get(path) !== owner);
        if (steals) {
          const claimed = unmapped.filter((path) => assigned.get(path) === candidate.id);
          if (!claimed.length) continue;
          candidate.paths = claimed;
          delete candidate.priority;
        }
        const claimed = assignComponents(model.fileGraph.files, { ...next, components: [...next.components, candidate] })
          .fileToComponent;
        if (![...claimed.values()].includes(candidate.id)) continue;
        next.components.push(candidate);
        addedComponents.push(candidate);
      }
      const finalMembership = assignComponents(model.fileGraph.files, next).fileToComponent;
      skippedFiles.push(...unmapped.filter((path) => !finalMembership.has(path)));
    }
  }

  const addedDependencies: BlueprintDependency[] = [];
  if (options.dependencies !== false) {
    const merged = buildSnapshotModel(files, next);
    const declared = new Set(next.dependencies.map((dependency) => `${dependency.from}\u0000${dependency.to}`));
    const byId = new Map(next.components.map((component) => [component.id, component]));
    for (const edge of merged.componentGraph.edges) {
      if (declared.has(`${edge.from}\u0000${edge.to}`)) continue;
      if (byId.get(edge.from)?.kind === "test" || byId.get(edge.to)?.public) continue;
      if (!next.policy.includeTypeOnly && edge.typeOnly) continue;
      const dependency: BlueprintDependency = { from: edge.from, to: edge.to, kind: "imports", provenance };
      next.dependencies.push(dependency);
      addedDependencies.push(dependency);
    }
    next.dependencies.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
  }

  return { blueprint: blueprintSchema.parse(next), addedComponents, addedDependencies, skippedFiles: skippedFiles.sort() };
}
