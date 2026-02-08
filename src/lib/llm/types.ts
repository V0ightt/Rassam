export type LLMProviderId = "deepseek" | "openai" | "anthropic" | "google" | "ollama";

export interface GenerateStructureInput {
  prompt: string;
  system: string;
  temperature?: number;
  json?: boolean;
}

export interface ChatInput {
  system: string;
  message: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  id: LLMProviderId;
  generateStructure(input: GenerateStructureInput): Promise<string>;
  chat(input: ChatInput): Promise<string>;
}
