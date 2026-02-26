import { OpenAICompatibleAdapter } from "./OpenAICompatibleAdapter";

export class OllamaAdapter extends OpenAICompatibleAdapter {
  public readonly id = "ollama" as const;

  constructor() {
    super({
      apiKey: process.env.OLLAMA_API_KEY || "ollama",
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      model: process.env.OLLAMA_MODEL || "llama3.1",
    });
  }
}
