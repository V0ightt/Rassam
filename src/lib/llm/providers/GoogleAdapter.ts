import { OpenAICompatibleAdapter } from "./OpenAICompatibleAdapter";

export class GoogleAdapter extends OpenAICompatibleAdapter {
  public readonly id = "google" as const;

  constructor() {
    super({
      apiKey: process.env.GOOGLE_API_KEY || "",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: process.env.GOOGLE_MODEL || "gemini-1.5-flash",
    });
  }
}
