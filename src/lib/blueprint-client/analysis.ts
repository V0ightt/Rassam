import { deserializeFileGraph } from "@/blueprint/snapshot";
import type { FileGraph } from "@/blueprint/types";

import { analyzeLocalSnapshot, type LocalAnalysisRequest, type LocalAnalysisResult } from "./analysis-core";

export { analyzeLocalSnapshot, type LocalAnalysisRequest, type LocalAnalysisResult };

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
