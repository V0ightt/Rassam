// Detects coding-agent authorship from commit metadata: author identity and
// message trailers. These are facts about the change, used to report how much
// of it was agent-written; they are never trusted as evidence of correctness.

import type { AgentActivity, CommitInfo } from "./types";

interface KnownAgent {
  name: string;
  /** Matches an author name or email (strict: humans share first names with agents). */
  identity: RegExp;
  /** Matches the start of a trailer value such as "Claude Opus 4" or "Cursor Agent". */
  label: RegExp;
}

const KNOWN_AGENTS: readonly KnownAgent[] = [
  {
    name: "Claude",
    identity: /noreply@anthropic\.com|^claude(?:[ -]code)?(?:\[bot\])?$|\bclaude\[bot\]/i,
    label: /^(?:anthropic\s+)?claude\b/i,
  },
  {
    name: "GitHub Copilot",
    identity: /copilot-swe-agent|^(?:github\s+)?copilot(?:\[bot\])?$|\+copilot@users\.noreply\.github\.com|\bcopilot\[bot\]/i,
    label: /^(?:github\s+)?copilot\b/i,
  },
  {
    name: "Devin",
    identity: /devin-ai-integration|^devin(?:\s+ai)?(?:\[bot\])?$/i,
    label: /^devin\b/i,
  },
  {
    name: "Cursor",
    identity: /cursoragent|^cursor(?:\s+agent)?(?:\[bot\])?$/i,
    label: /^cursor\b/i,
  },
  {
    name: "Codex",
    identity: /chatgpt-codex-connector|^(?:openai\s+)?codex(?:\[bot\])?$|\bcodex@openai\.com/i,
    label: /^(?:openai\s+)?codex\b/i,
  },
  {
    name: "Jules",
    identity: /google-labs-jules/i,
    label: /^(?:google\s+)?jules\b/i,
  },
  {
    name: "Gemini",
    identity: /gemini-code-assist|^gemini(?:[ -]cli)?(?:\[bot\])?$/i,
    label: /^(?:google\s+)?gemini\b/i,
  },
  {
    name: "Aider",
    identity: /\(aider\)\s*$|^aider\b|@aider\.chat\b/i,
    label: /^aider\b/i,
  },
  {
    name: "Amp",
    identity: /^amp(?:code)?(?:\[bot\])?$|\bamp@ampcode\.com/i,
    label: /^amp(?:code)?\b/i,
  },
  {
    name: "Factory",
    identity: /factory-droid/i,
    label: /^factory(?:[ -]droid)?\b|^droid\b/i,
  },
];

/** Automation that commits without being a coding agent. */
const NON_AGENT_BOTS =
  /^(?:dependabot|renovate|github-actions|web-flow|snyk-bot|greenkeeper|mergify|pre-commit-ci|allcontributors|codecov|semantic-release-bot|imgbot|stale|netlify|vercel|release-please|github-merge-queue|pull)\b/i;

const GENERIC_TRAILERS = new Set(["generated-by", "assisted-by", "ai-assisted", "made-with", "generated-with", "ai-generated-by"]);
const NEGATIVE_VALUES = /^(?:no|none|false|n\/a|0)$/i;
const AFFIRMATIVE_VALUES = /^(?:yes|true|1)$/i;
const UNNAMED_AGENT = "AI assistant";

function knownByIdentity(name: string, email: string): string | null {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  for (const agent of KNOWN_AGENTS) {
    if (agent.identity.test(trimmedName) || (trimmedEmail && agent.identity.test(trimmedEmail))) return agent.name;
  }
  return null;
}

function knownByLabel(label: string): string | null {
  const trimmed = label.trim();
  return KNOWN_AGENTS.find((agent) => agent.label.test(trimmed))?.name ?? null;
}

interface Trailer {
  key: string;
  value: string;
}

function parseTrailers(message: string): Trailer[] {
  const trailers: Trailer[] = [];
  // The subject line is skipped: "codex-cli: fix flag" is a scope prefix, not a trailer.
  for (const line of message.split(/\r?\n/).slice(1)) {
    const match = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*:\s*(\S.*)$/.exec(line);
    if (match) trailers.push({ key: match[1].toLowerCase(), value: match[2].trim() });
  }
  return trailers;
}

function splitIdentity(value: string): { name: string; email: string } {
  const match = /^(.*?)\s*<([^>]*)>\s*$/.exec(value);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: value.trim(), email: "" };
}

function fromCoAuthor(value: string): string | null {
  const { name, email } = splitIdentity(value);
  const known = knownByIdentity(name, email) ?? knownByLabel(name);
  if (known) return known;
  // Generic convention: any co-author with a bot address that is not plain automation.
  if (/\[bot\]@/i.test(email) || /\[bot\]$/i.test(name)) {
    const label = (name || email.replace(/^\d+\+/, "").replace(/@.*$/, "")).replace(/\[bot\]$/i, "").trim();
    if (label && !NON_AGENT_BOTS.test(label)) return label;
  }
  return null;
}

/** "Claude:claude-opus-4" → "Claude"; "Cursor <x@y>" → "Cursor". */
function fromGenericTrailer(value: string): string | null {
  const label = splitIdentity(value).name.split(":")[0].replace(/\s*\(.*\)\s*$/, "").trim();
  if (!label || NEGATIVE_VALUES.test(label)) return null;
  if (AFFIRMATIVE_VALUES.test(label)) return UNNAMED_AGENT;
  return knownByLabel(label) ?? label;
}

function fromTrailer(trailer: Trailer): string | null {
  if (trailer.key === "co-authored-by") return fromCoAuthor(trailer.value);
  if (GENERIC_TRAILERS.has(trailer.key)) return fromGenericTrailer(trailer.value);
  if (trailer.key.startsWith("codex-")) return "Codex";
  if (trailer.key.startsWith("amp-") || trailer.key.startsWith("ampcode-")) return "Amp";
  if (trailer.key.startsWith("claude-")) return "Claude";
  return null;
}

/** Every agent evidenced by a commit: author identity first, then trailers in order. */
export function agentsFromCommit(commit: CommitInfo): string[] {
  const agents: string[] = [];
  const add = (agent: string | null): void => {
    if (agent && !agents.includes(agent)) agents.push(agent);
  };
  add(knownByIdentity(commit.authorName, commit.authorEmail));
  if (/generated with \[?claude code\b/i.test(commit.message)) add("Claude");
  // Aider prefixes the subject of commits it authors.
  if (/^aider:\s/i.test(commit.message)) add("Aider");
  for (const trailer of parseTrailers(commit.message)) add(fromTrailer(trailer));
  return agents;
}

/** The primary agent behind a commit, or null when nothing indicates agent authorship. */
export function agentFromCommit(commit: CommitInfo): string | null {
  return agentsFromCommit(commit)[0] ?? null;
}

/** Summarizes agent authorship over a range of commits. A commit counts once even with several agents. */
export function detectAgentActivity(commits: readonly CommitInfo[]): AgentActivity {
  const agents = new Set<string>();
  let agentCommits = 0;
  for (const commit of commits) {
    const found = agentsFromCommit(commit);
    if (found.length > 0) agentCommits += 1;
    for (const agent of found) agents.add(agent);
  }
  return {
    commits: commits.length,
    agentCommits,
    agents: [...agents].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  };
}
