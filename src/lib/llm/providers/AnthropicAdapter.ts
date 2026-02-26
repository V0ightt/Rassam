import { ChatInput, GenerateStructureInput, LLMProvider } from "../types";

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export class AnthropicAdapter implements LLMProvider {
  public readonly id = "anthropic" as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
    this.model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    this.baseUrl = "https://api.anthropic.com/v1/messages";
  }

  async generateStructure(input: GenerateStructureInput): Promise<string> {
    return this.sendMessage([
      { role: "user", content: input.prompt },
    ], input.system, input.temperature ?? 0.3, input.json ? 2000 : 1200, input.model);
  }

  async chat(input: ChatInput): Promise<string> {
    return this.sendMessage([
      { role: "user", content: input.message },
    ], input.system, input.temperature ?? 0.7, input.maxTokens ?? 2000, input.model);
  }

  async *chatStream(input: ChatInput): AsyncIterable<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model || this.model,
        system: input.system,
        messages: [{ role: "user" as const, content: input.message }],
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Anthropic");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const event = JSON.parse(payload);
            if (event.type === "content_block_delta" && event.delta?.text) {
              yield event.delta.text;
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async sendMessage(
    messages: AnthropicMessage[],
    system: string,
    temperature: number,
    maxTokens: number,
    model?: string
  ): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || this.model,
        system,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = Array.isArray(data?.content) ? data.content[0]?.text : data?.content;
    return typeof content === "string" ? content : "";
  }
}
