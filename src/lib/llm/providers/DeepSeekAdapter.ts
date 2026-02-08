import OpenAI from "openai";
import { ChatInput, GenerateStructureInput, LLMProvider } from "../types";

export class DeepSeekAdapter implements LLMProvider {
  public readonly id = "deepseek" as const;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || "sk-placeholder",
      baseURL: "https://api.deepseek.com",
    });
    this.model = process.env.DEEPSEEK_MODEL || "deepseek-reasoner";
  }

  async generateStructure(input: GenerateStructureInput): Promise<string> {
    const responseFormat = input.json ? ({ type: "json_object" } as const) : undefined;
    const response = await this.client.chat.completions.create({
      model: this.model,
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
      model: this.model,
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
