import type { FlowEdge, FlowNode } from '@/types';

interface LayoutWorkerResponse {
  id: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  error?: string;
}

export function layoutGraphInWorker(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: 'TB' | 'LR',
  signal?: AbortSignal,
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Layout cancelled.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/layout.worker.ts', import.meta.url));
    const id = crypto.randomUUID();
    const finish = () => {
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
    };
    const cancel = () => {
      finish();
      reject(new DOMException('Layout cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => {
      finish();
      reject(new Error('The layout worker failed.'));
    };
    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      if (event.data.id !== id) return;
      finish();
      if (event.data.error || !event.data.nodes || !event.data.edges) {
        reject(new Error(event.data.error || 'The layout worker returned an invalid graph.'));
        return;
      }
      resolve({ nodes: event.data.nodes, edges: event.data.edges });
    };
    worker.postMessage({ id, nodes, edges, direction });
  });
}
