import { describe, expect, it, vi } from "vitest";

import { reportLlmUsage } from "./usage";

describe("LLM usage reporting", () => {
  it("forwards only bounded aggregate usage metadata", () => {
    const listener = vi.fn();
    reportLlmUsage({ onUsage: listener }, {
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      finishReason: "end_turn",
    });

    expect(listener).toHaveBeenCalledWith({
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      finishReason: "end_turn",
    });
  });

  it("drops invalid values and cannot interrupt a provider", () => {
    const listener = vi.fn(() => {
      throw new Error("telemetry sink failed");
    });

    expect(() => reportLlmUsage({ onUsage: listener }, {
      inputTokens: -1,
      outputTokens: Number.NaN,
      finishReason: "source text must not fit here",
    })).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
