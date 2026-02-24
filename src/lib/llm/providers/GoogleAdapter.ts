import OpenAI from "openai";
import { ChatInput, GenerateStructureInput, LLMProvider } from "../types";

export class GoogleAdapter implements LLMProvider {
  public readonly id = "google" as const;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.GOOGLE_API_KEY || "sk-placeholder",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    this.model = process.env.GOOGLE_MODEL || "gemini-1.5-flash";
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
    const response = await this.client.chat.completions.create({
      model: input.model || this.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.message },
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2000,
    });

    return response.choices[0]?.message?.content || "";
  }
}
