export type LLMProviderId = "deepseek" | "openai" | "anthropic" | "google" | "ollama";

export interface GenerateStructureInput {
  prompt: string;
  system: string;
  temperature?: number;
  json?: boolean;
  model?: string;
}

export interface ChatInput {
  system: string;
  message: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMProvider {
  id: LLMProviderId;
  generateStructure(input: GenerateStructureInput): Promise<string>;
  chat(input: ChatInput): Promise<string>;
}
