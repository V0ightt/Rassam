import {
  analysisStreamEventSchema,
  repositoryAnalysisResultSchema,
  type AnalysisStage,
  type RepositoryAnalysisResult,
} from '@/lib/contracts';

export interface AnalysisProgressUpdate {
  stage: AnalysisStage;
  message: string;
  progress: number;
  completed?: number;
  total?: number;
}

export class AnalysisResponseError extends Error {
  constructor(
    message: string,
    public readonly code = 'ANALYSIS_FAILED',
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AnalysisResponseError';
  }
}

function errorFromPayload(payload: Record<string, unknown>): AnalysisResponseError {
  return new AnalysisResponseError(
    typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : 'Repository analysis failed.',
    typeof payload.code === 'string' ? payload.code : 'ANALYSIS_FAILED',
    payload.retryable === true,
  );
}

export async function consumeAnalysisResponse(
  response: Response,
  onProgress: (update: AnalysisProgressUpdate) => void,
): Promise<RepositoryAnalysisResult> {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let payload: Record<string, unknown> = {};
    try {
      const candidate = await response.json() as unknown;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        payload = candidate as Record<string, unknown>;
      }
    } catch {
      // The safe generic error below intentionally hides non-contract bodies.
    }
    throw errorFromPayload(payload);
  }

  if (!contentType.includes('application/x-ndjson')) {
    return repositoryAnalysisResultSchema.parse(await response.json());
  }
  if (!response.body) throw new AnalysisResponseError('Analysis returned no response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let expectedSequence = 1;
  let terminal: RepositoryAnalysisResult | null = null;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    if (terminal) throw new AnalysisResponseError('Analysis emitted data after its terminal event.', 'INVALID_STREAM');
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      throw new AnalysisResponseError('Analysis returned malformed stream data.', 'INVALID_STREAM');
    }
    const parsed = analysisStreamEventSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AnalysisResponseError('Analysis returned an invalid stream event.', 'INVALID_STREAM');
    }
    if (parsed.data.sequence !== expectedSequence) {
      throw new AnalysisResponseError('Analysis stream events arrived out of order.', 'INVALID_STREAM');
    }
    expectedSequence += 1;

    if (parsed.data.type === 'progress') {
      onProgress(parsed.data.payload);
      return;
    }
    if (parsed.data.type === 'error') throw errorFromPayload(parsed.data.payload);
    terminal = repositoryAnalysisResultSchema.parse(parsed.data.payload);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      processLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
    if (done) break;
  }
  if (buffer.trim()) processLine(buffer);
  if (!terminal) throw new AnalysisResponseError('Analysis ended before a terminal result.', 'INCOMPLETE_STREAM', true);
  return terminal;
}
