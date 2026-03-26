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
}

export interface LLMProvider {
  id: LLMProviderId;
  generateStructure(input: GenerateStructureInput): Promise<string>;
  chat(input: ChatInput): Promise<string>;
  chatStream(input: ChatInput): AsyncIterable<string>;
}
