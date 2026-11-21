import { analyzeLocalSnapshot, type LocalAnalysisRequest } from '@/lib/blueprint-client/analysis';

// Runs import analysis, reach analysis and draft derivation for a local
// folder off the main thread, so large repositories do not freeze the canvas.

self.onmessage = (event: MessageEvent<LocalAnalysisRequest & { id: string }>) => {
  const { id, ...request } = event.data;
  try {
    self.postMessage({ id, result: analyzeLocalSnapshot(request) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Blueprint analysis failed.' });
  }
};
