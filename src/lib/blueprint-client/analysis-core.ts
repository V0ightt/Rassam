import { deriveBlueprint } from "@/blueprint/derive";
import { buildFileGraph } from "@/blueprint/imports";
import { analyzeReach } from "@/blueprint/reach";
import { parseBlueprintText, type Blueprint, type BlueprintIssue } from "@/blueprint/schema";
import { serializeFileGraph, type SerializedFileGraph } from "@/blueprint/snapshot";
import type { ReachReport, SourceFile } from "@/blueprint/types";

// Pure analysis shared by the Web Worker and the main-thread fallback. It must
// not reference the worker itself: a worker bundle that imports the module
// that spawns it makes the bundler recurse forever.

export interface LocalAnalysisRequest {
  name: string;
  files: SourceFile[];
  blueprintText: string | null;
}

export interface LocalAnalysisResult {
  graph: SerializedFileGraph;
  reach: ReachReport;
  blueprint: Blueprint | null;
  issues: BlueprintIssue[];
  draft: Blueprint | null;
}

/** Pure, synchronous analysis of a local snapshot (runs in a worker or inline). */
export function analyzeLocalSnapshot(request: LocalAnalysisRequest): LocalAnalysisResult {
  const graph = buildFileGraph(request.files);
  const reach = analyzeReach(request.files, graph);
  const parsed = request.blueprintText !== null ? parseBlueprintText(request.blueprintText) : null;
  return {
    graph: serializeFileGraph(graph),
    reach,
    blueprint: parsed?.ok ? parsed.blueprint : null,
    issues: parsed && !parsed.ok ? parsed.issues : [],
    draft: parsed?.ok ? null : deriveBlueprint(request.files, { name: request.name }),
  };
}

