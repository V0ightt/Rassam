import { deriveBlueprint } from "@/blueprint/derive";
import { buildFileGraph } from "@/blueprint/imports";
import { analyzeReach } from "@/blueprint/reach";
import { parseBlueprintText, type Blueprint, type BlueprintIssue } from "@/blueprint/schema";
import { deserializeFileGraph, serializeFileGraph, type SerializedFileGraph } from "@/blueprint/snapshot";
import type { FileGraph, ReachReport, SourceFile } from "@/blueprint/types";

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

interface WorkerResponse {
  id: string;
  result?: LocalAnalysisResult;
  error?: string;
}

/**
 * Analyze in a Web Worker when available; fall back to the main thread
 * (tests, older browsers). Resolves with a deserialized graph.
 */
export function analyzeLocalSnapshotOffThread(
  request: LocalAnalysisRequest,
  signal?: AbortSignal,
): Promise<Omit<LocalAnalysisResult, "graph"> & { graph: FileGraph }> {
  const finish = (result: LocalAnalysisResult) => ({ ...result, graph: deserializeFileGraph(result.graph) });
  if (typeof Worker === "undefined") return Promise.resolve(finish(analyzeLocalSnapshot(request)));

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Analysis cancelled.", "AbortError"));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../workers/blueprint-analysis.worker.ts", import.meta.url));
    } catch {
      resolve(finish(analyzeLocalSnapshot(request)));
      return;
    }
    const id = crypto.randomUUID();
    const done = () => {
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      done();
      reject(new DOMException("Analysis cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => {
      done();
      // A worker that fails to boot (e.g. blocked by policy) should not block analysis.
      try {
        resolve(finish(analyzeLocalSnapshot(request)));
      } catch (error) {
        reject(error);
      }
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      done();
      if (event.data.error || !event.data.result) {
        reject(new Error(event.data.error || "Blueprint analysis returned no result."));
        return;
      }
      resolve(finish(event.data.result));
    };
    worker.postMessage({ id, ...request });
  });
}
