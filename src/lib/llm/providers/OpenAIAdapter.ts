import OpenAI from "openai";
import { ChatInput, GenerateStructureInput, LLMProvider } from "../types";

function isMaxTokensUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("unsupported parameter") && message.includes("max_tokens");
}

function isTemperatureUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("unsupported") && message.includes("temperature");
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const typedPart = part as { type?: string; text?: string };
        if (typeof typedPart.text === "string") return typedPart.text;
        if (typedPart.type === "output_text") {
          return String((part as { text?: unknown }).text || "");
        }
        return "";
      })
      .join("\n")
      .trim();
    if (text) return text;
  }

  const refusal = (message as { refusal?: unknown }).refusal;
  if (typeof refusal === "string" && refusal.trim()) {
    return refusal.trim();
  }

  return "";
}

function extractResponsesText(response: unknown): string {
  if (!response || typeof response !== "object") return "";

  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const partText = (part as { text?: unknown }).text;
        return typeof partText === "string" ? partText : "";
      })
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

export class OpenAIAdapter implements LLMProvider {
  public readonly id = "openai" as const;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });
    this.model = process.env.OPENAI_MODEL || "gpt-5-nano";
  }

  async generateStructure(input: GenerateStructureInput): Promise<string> {
    const responseFormat = input.json ? ({ type: "json_object" } as const) : undefined;
    const model = input.model || this.model;
    const temperature = input.temperature ?? 0.3;

    let includeTemperature = true;
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          ...(includeTemperature ? { temperature } : {}),
          response_format: responseFormat,
        });

        const text = extractMessageText(response.choices[0]?.message);
        if (!text) {
          throw new Error("OpenAI returned an empty response");
        }
        return text;
      } catch (error) {
        lastError = error;
        if (includeTemperature && isTemperatureUnsupported(error)) {
          includeTemperature = false;
          continue;
        }
        throw error;
      }
    }

    if (lastError) throw lastError;
    return "";
  }

  async chat(input: ChatInput): Promise<string> {
    const model = input.model || this.model;
    const temperature = input.temperature ?? 0.7;
    const maxTokens = input.maxTokens ?? 2000;

    let includeTemperature = true;
    let useMaxCompletionTokens = false;
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.message },
          ],
          ...(includeTemperature ? { temperature } : {}),
          ...(useMaxCompletionTokens
            ? { max_completion_tokens: maxTokens }
            : { max_tokens: maxTokens }),
        });

        const text = extractMessageText(response.choices[0]?.message);
        if (text) {
          return text;
        }

        const fallbackResponse = await this.client.responses.create({
          model,
          input: [
            { role: "system", content: input.system },
            { role: "user", content: input.message },
          ],
          ...(includeTemperature ? { temperature } : {}),
          max_output_tokens: maxTokens,
        });

        const fallbackText = extractResponsesText(fallbackResponse);
        if (!fallbackText) {
          throw new Error("OpenAI returned an empty response");
        }

        return fallbackText;
      } catch (error) {
        lastError = error;

        let changed = false;
        if (!useMaxCompletionTokens && isMaxTokensUnsupported(error)) {
          useMaxCompletionTokens = true;
          changed = true;
        }
        if (includeTemperature && isTemperatureUnsupported(error)) {
          includeTemperature = false;
          changed = true;
        }

        if (!changed) {
          throw error;
        }
      }
    }

    if (lastError) throw lastError;
    return "";
  }

  async *chatStream(input: ChatInput): AsyncIterable<string> {
    const model = input.model || this.model;
    const temperature = input.temperature ?? 0.7;
    const maxTokens = input.maxTokens ?? 2000;

    const stream = await this.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.message },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
