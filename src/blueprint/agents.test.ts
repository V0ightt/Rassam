import { describe, it, expect } from "vitest";

import { agentFromCommit, agentsFromCommit, detectAgentActivity } from "./agents";
import type { CommitInfo } from "./types";

let counter = 0;

function commit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  counter += 1;
  return {
    sha: `sha${counter}`,
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.com",
    message: "Fix parser edge case",
    ...overrides,
  };
}

function withTrailer(trailer: string): CommitInfo {
  return commit({ message: `Fix parser edge case\n\nLonger explanation.\n\n${trailer}` });
}

describe("agentFromCommit", () => {
  const cases: Array<[string, CommitInfo, string]> = [
    ["Claude co-author trailer", withTrailer("Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>"), "Claude"],
    ["Claude co-author by name only", withTrailer("co-authored-by: Claude <claude@example.com>"), "Claude"],
    ["Anthropic noreply co-author", withTrailer("Co-authored-by: Assistant <noreply@anthropic.com>"), "Claude"],
    ["Anthropic noreply author", commit({ authorName: "Claude", authorEmail: "noreply@anthropic.com" }), "Claude"],
    [
      "Claude Code footer",
      commit({ message: "Add feature\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" }),
      "Claude",
    ],
    [
      "Copilot coding agent author",
      commit({ authorName: "copilot-swe-agent[bot]", authorEmail: "198982749+Copilot@users.noreply.github.com" }),
      "GitHub Copilot",
    ],
    ["Copilot author", commit({ authorName: "Copilot", authorEmail: "copilot@github.com" }), "GitHub Copilot"],
    ["Copilot co-author", withTrailer("Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>"), "GitHub Copilot"],
    [
      "Devin author",
      commit({ authorName: "devin-ai-integration[bot]", authorEmail: "158243242+devin-ai-integration[bot]@users.noreply.github.com" }),
      "Devin",
    ],
    ["Cursor agent author", commit({ authorName: "Cursor Agent", authorEmail: "cursoragent@cursor.com" }), "Cursor"],
    ["cursoragent co-author", withTrailer("Co-authored-by: cursoragent <cursoragent@cursor.com>"), "Cursor"],
    ["Made-with Cursor", withTrailer("Made-with: Cursor"), "Cursor"],
    ["Cursor co-author", withTrailer("Co-authored-by: Cursor <agent@example.com>"), "Cursor"],
    [
      "Codex connector author",
      commit({ authorName: "chatgpt-codex-connector[bot]", authorEmail: "199175422+chatgpt-codex-connector[bot]@users.noreply.github.com" }),
      "Codex",
    ],
    ["Codex trailer", withTrailer("Codex-Session-Id: 0199a213-81c0-7800-8aa1-bbab2a035a53"), "Codex"],
    ["Codex co-author", withTrailer("Co-authored-by: Codex <codex@openai.com>"), "Codex"],
    [
      "Jules author",
      commit({ authorName: "google-labs-jules[bot]", authorEmail: "161369871+google-labs-jules[bot]@users.noreply.github.com" }),
      "Jules",
    ],
    [
      "Gemini code assist author",
      commit({ authorName: "gemini-code-assist[bot]", authorEmail: "176961590+gemini-code-assist[bot]@users.noreply.github.com" }),
      "Gemini",
    ],
    ["Gemini co-author", withTrailer("Co-authored-by: Gemini <gemini@google.com>"), "Gemini"],
    ["Aider author suffix", commit({ authorName: "Ada Lovelace (aider)" }), "Aider"],
    ["Aider co-author", withTrailer("Co-authored-by: aider (gpt-4o) <noreply@aider.chat>"), "Aider"],
    ["Aider subject prefix", commit({ message: "aider: Refactor the parser" }), "Aider"],
    ["Amp trailer", withTrailer("Amp-Thread-ID: https://ampcode.com/threads/T-123"), "Amp"],
    ["Amp co-author", withTrailer("Co-authored-by: Amp <amp@ampcode.com>"), "Amp"],
    [
      "Factory droid author",
      commit({ authorName: "factory-droid[bot]", authorEmail: "138933559+factory-droid[bot]@users.noreply.github.com" }),
      "Factory",
    ],
    ["Generated-by known agent", withTrailer("Generated-by: Claude Code"), "Claude"],
    ["Generated-by unknown agent", withTrailer("Generated-by: Windsurf"), "Windsurf"],
    ["Assisted-by kernel convention", withTrailer("Assisted-by: Claude:claude-opus-4"), "Claude"],
    ["Assisted-by unknown tool with model", withTrailer("Assisted-by: Sweep:sweep-v2 <sweep@example.com>"), "Sweep"],
    ["AI-Assisted named", withTrailer("AI-Assisted: GitHub Copilot"), "GitHub Copilot"],
    ["AI-Assisted yes", withTrailer("AI-Assisted: yes"), "AI assistant"],
    [
      "Generic bot co-author",
      withTrailer("Co-authored-by: sweep-ai[bot] <12345+sweep-ai[bot]@users.noreply.github.com>"),
      "sweep-ai",
    ],
  ];

  it.each(cases)("detects %s", (_label, input, expected) => {
    expect(agentFromCommit(input)).toBe(expected);
  });

  const humans: Array<[string, CommitInfo]> = [
    ["plain human commit", commit()],
    ["human co-author", withTrailer("Co-authored-by: Grace Hopper <grace@example.com>")],
    ["human named Claude", commit({ authorName: "Claude Shannon", authorEmail: "claude@bell-labs.example" })],
    ["human named Devin", commit({ authorName: "Devin Jones", authorEmail: "devin@example.com" })],
    ["dependabot author", commit({ authorName: "dependabot[bot]", authorEmail: "49699333+dependabot[bot]@users.noreply.github.com" })],
    ["dependabot co-author", withTrailer("Co-authored-by: dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>")],
    ["github-actions co-author", withTrailer("Co-authored-by: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>")],
    ["sign-off and review trailers", withTrailer("Signed-off-by: Ada Lovelace <ada@example.com>\nReviewed-by: Grace Hopper <grace@example.com>")],
    ["AI-Assisted no", withTrailer("AI-Assisted: no")],
    ["scope prefix that looks like a trailer", commit({ message: "codex-cli: fix flag parsing\n\namplify: unrelated body text" })],
    ["mentions of agents in prose", commit({ message: "Document how Claude and Cursor are configured\n\nSee docs/agents.md" })],
  ];

  it.each(humans)("does not flag %s", (_label, input) => {
    expect(agentFromCommit(input)).toBeNull();
    expect(agentsFromCommit(input)).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(agentFromCommit(withTrailer("CO-AUTHORED-BY: CLAUDE <NOREPLY@ANTHROPIC.COM>"))).toBe("Claude");
    expect(agentFromCommit(withTrailer("generated-by: cursor"))).toBe("Cursor");
    expect(agentFromCommit(commit({ authorName: "COPILOT-SWE-AGENT[bot]" }))).toBe("GitHub Copilot");
  });

  it("prefers the author identity and lists every agent once", () => {
    const mixed = commit({
      authorName: "Cursor Agent",
      authorEmail: "cursoragent@cursor.com",
      message: [
        "Implement feature",
        "",
        "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
        "",
        "Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>",
        "Co-authored-by: Cursor <cursoragent@cursor.com>",
        "Co-authored-by: Copilot <copilot@github.com>",
      ].join("\r\n"),
    });
    expect(agentFromCommit(mixed)).toBe("Cursor");
    expect(agentsFromCommit(mixed)).toEqual(["Cursor", "Claude", "GitHub Copilot"]);
  });
});

describe("detectAgentActivity", () => {
  it("returns zeros for no commits", () => {
    expect(detectAgentActivity([])).toEqual({ commits: 0, agentCommits: 0, agents: [] });
  });

  it("reports no agents for human-only history", () => {
    expect(detectAgentActivity([commit(), commit()])).toEqual({ commits: 2, agentCommits: 0, agents: [] });
  });

  it("counts each agent commit once and returns deduped, sorted agents", () => {
    const activity = detectAgentActivity([
      commit(),
      withTrailer("Co-authored-by: Cursor <cursoragent@cursor.com>\nCo-Authored-By: Claude <noreply@anthropic.com>"),
      withTrailer("Co-Authored-By: Claude <noreply@anthropic.com>"),
      commit({ authorName: "devin-ai-integration[bot]" }),
      commit({ authorName: "Ada Lovelace (aider)" }),
    ]);
    expect(activity).toEqual({ commits: 5, agentCommits: 4, agents: ["Aider", "Claude", "Cursor", "Devin"] });
  });
});
