import OpenAI from "openai";
import { ChatInput, GenerateStructureInput, LLMProvider, LLMProviderId } from "../types";

/**
 * Base adapter for all OpenAI-compatible LLM providers (DeepSeek, Google, Ollama).
 * Subclasses only need to supply id, apiKey, baseURL, and default model.
 */
export abstract class OpenAICompatibleAdapter implements LLMProvider {
  public abstract readonly id: LLMProviderId;
  protected readonly client: OpenAI;
  protected readonly model: string;

  constructor(options: { apiKey: string; baseURL: string; model: string }) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.model = options.model;
  }

  async generateStructure(input: GenerateStructureInput): Promise<string> {
    const responseFormat = input.json ? ({ type: "json_object" } as const) : undefined;
    const response = await this.client.chat.completions.create({
      model: input.model || this.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      temperature: input.temperature ?? 0.3,
      response_format: responseFormat,
    });

    return response.choices[0]?.message?.content || "";
  }

  async chat(input: ChatInput): Promise<string> {
    const historyMessages = (input.history || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const response = await this.client.chat.completions.create({
      model: input.model || this.model,
      messages: [
        { role: "system", content: input.system },
        ...historyMessages,
        { role: "user", content: input.message },
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2000,
    });

    return response.choices[0]?.message?.content || "";
  }

  async *chatStream(input: ChatInput): AsyncIterable<string> {
    const historyMessages = (input.history || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const stream = await this.client.chat.completions.create({
      model: input.model || this.model,
      messages: [
        { role: "system", content: input.system },
        ...historyMessages,
        { role: "user", content: input.message },
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2000,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
