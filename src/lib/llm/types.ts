export type LLMProviderId = "deepseek" | "openai" | "anthropic" | "google" | "ollama";

export interface GenerateStructureInput {
  prompt: string;
  system: string;
  temperature?: number;
  json?: boolean;
  model?: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  system: string;
  message: string;
  history?: ChatHistoryMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  structuredOutput?: { type: 'json_object' };
  /** AbortSignal to cancel the request when the client disconnects */
  signal?: AbortSignal;
  /** Aggregate provider metadata only. The callback must never receive prompt or response text. */
  onUsage?: (metadata: LLMUsageMetadata) => void;
}

export interface LLMUsageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  finishReason?: string;
}

export interface LLMProvider {
  id: LLMProviderId;
  generateStructure(input: GenerateStructureInput): Promise<string>;
  chat(input: ChatInput): Promise<string>;
  chatStream(input: ChatInput): AsyncIterable<string>;
}
