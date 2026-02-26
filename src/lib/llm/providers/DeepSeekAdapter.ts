import { OpenAICompatibleAdapter } from "./OpenAICompatibleAdapter";

export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  public readonly id = "deepseek" as const;

  constructor() {
    super({
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    });
  }
}
