import { BLUEPRINT_PATH, type Blueprint, type BlueprintRule, type Selector } from "./schema";
import { ruleSeverity } from "./rules";
import { selectorEntries } from "./selectors";

// The contract as plain prose for agent instruction files (AGENTS.md). A pilot
// with three models found that rules stated in prose steer agents as well as
// querying the contract does, so every repository with a blueprint should also
// carry its rules where every agent already reads. The block is a pure
// function of the blueprint and the options: the same contract always gives
// the same bytes, so a stale block can be detected by regenerating it.

export const AGENTS_BLOCK_START = "<!-- rassam:agents:start -->";
export const AGENTS_BLOCK_END = "<!-- rassam:agents:end -->";

export interface AgentProseOptions {
  /** How an agent runs the CLI, e.g. "npx -y @v0ightt/rassam@0.4.0" or "npm run rassam --". */
  command: string;
  /** The branch pull requests merge into (default "main"). */
  baseBranch?: string;
  /** Mention the MCP tools (the repository configures the rassam MCP server). Default true. */
  mcp?: boolean;
}

const MAX_RULES = 40;
const MAX_PROTECTED = 20;
const MAX_COMPONENTS = 25;
const MAX_INVARIANTS = 10;
const MAX_GLOBS = 3;

/** One line of untrusted text: no newlines, no HTML comment markers that could end the block, bounded length. */
function clean(value: string | undefined, limit = 300): string {
  const line = (value ?? "")
    .replace(/<!--|-->/g, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line;
}

/** Inline code that cannot be broken by a backtick in the value. */
function code(value: string): string {
  const text = clean(value, 200);
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

function sentence(value: string): string {
  const text = clean(value);
  if (!text) return "";
  return /[.!?…:]$/.test(text) ? text : `${text}.`;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function joinList(items: readonly string[], word: "and" | "or"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${word} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

interface Part {
  kind: "internal" | "package";
  /** Phrased for a sentence: "**Web**", "files matching `x`", "the `pg` package". */
  text: string;
  /** For packages: the bare name in code style, for lists of allowed packages. */
  name?: string;
  /** For a component named directly: its id. */
  id?: string;
}

interface Described {
  parts: Part[];
  /** Excluded parts, already phrased. */
  except: string[];
  /** The selector includes "*". */
  all: boolean;
  /** Component ids the selector names directly (for "where things are"). */
  components: string[];
}

function describe(selector: Selector | undefined, blueprint: Blueprint): Described {
  const byId = new Map(blueprint.components.map((component) => [component.id, component]));
  const result: Described = { parts: [], except: [], all: false, components: [] };
  for (const raw of selectorEntries(selector)) {
    const negated = raw.startsWith("!");
    const entry = (negated ? raw.slice(1) : raw).trim();
    if (!entry) continue;
    if (entry === "*") {
      if (!negated) result.all = true;
      continue;
    }
    const colon = entry.indexOf(":");
    const prefix = colon > 0 ? entry.slice(0, colon) : "";
    const value = colon > 0 ? entry.slice(colon + 1) : entry;
    let part: Part;
    if (prefix === "package") {
      part = value === "node:*"
        ? { kind: "package", text: "Node built-ins", name: "Node built-ins" }
        : { kind: "package", text: `the ${code(value)} package`, name: code(value) };
    } else if (prefix === "path") {
      part = { kind: "internal", text: `files matching ${code(value)}` };
    } else if (prefix === "tag") {
      const tagged = blueprint.components.filter((component) => (component.tags ?? []).includes(value));
      const names = tagged.map((component) => `**${clean(component.name, 80)}**`);
      part = { kind: "internal", text: names.length ? `components tagged ${code(value)} (${joinList(names, "and")})` : `components tagged ${code(value)}` };
      if (!negated) result.components.push(...tagged.map((component) => component.id));
    } else {
      const id = prefix === "component" ? value : entry;
      const component = byId.get(id);
      part = { kind: "internal", text: `**${clean(component?.name ?? id, 80)}**`, id };
      if (component && !negated) result.components.push(id);
    }
    if (negated) result.except.push(part.text);
    else result.parts.push(part);
  }
  return result;
}

/** "**Web** and **API**", "all code except **Tests**". */
function subject(selector: Selector | undefined, blueprint: Blueprint, word: "and" | "or"): Described & { text: string } {
  const described = describe(selector, blueprint);
  const head = described.all ? "all code" : joinList(described.parts.map((part) => part.text), word) || "nothing";
  const text = described.except.length ? `${head} except ${joinList(described.except, "and")}` : head;
  return { ...described, text };
}

function withReason(text: string, rule: BlueprintRule): string {
  const severity = ruleSeverity(rule);
  const note = severity === "warning" ? " (The check warns on this one; it does not block.)" : severity === "info" ? " (Advisory.)" : "";
  const reason = sentence(rule.reason ?? "");
  return `${text}${reason ? ` ${reason}` : ""}${note}`;
}

interface RuleLine {
  text: string;
  components: string[];
}

function ruleLine(rule: BlueprintRule, blueprint: Blueprint): RuleLine | null {
  switch (rule.kind) {
    case "forbid": {
      const from = subject(rule.from, blueprint, "and");
      const to = subject(rule.to, blueprint, "or");
      return { text: withReason(`${capitalize(from.text)} must not depend on ${to.text}.`, rule), components: [...from.components, ...to.components] };
    }
    case "allow-only": {
      const from = subject(rule.from, blueprint, "and");
      const to = describe(rule.to, blueprint);
      // "may depend only on itself" is implied; naming the subject again reads as a typo.
      const internal = to.parts.filter((part) => part.kind === "internal" && !(part.id && from.components.includes(part.id))).map((part) => part.text);
      const packages = to.parts.filter((part) => part.kind === "package").map((part) => part.name ?? part.text);
      const allowed = [...(to.all ? ["any component"] : []), ...internal];
      const pieces = [allowed.length ? `${capitalize(from.text)} may depend only on ${joinList(allowed, "and")} (and on itself).` : `${capitalize(from.text)} may depend on nothing else in the repository.`];
      if (packages.length) pieces.push(`Of outside packages, only ${joinList(packages, "and")} may be used.`);
      return { text: withReason(pieces.join(" "), rule), components: [...from.components, ...to.components] };
    }
    case "layers": {
      const layers = rule.layers.map((layer) => subject(layer, blueprint, "and"));
      return {
        text: withReason(`Layers, top to bottom: ${layers.map((layer) => layer.text).join(" → ")}. Code may depend on the layers below it, never on a layer above.`, rule),
        components: layers.flatMap((layer) => layer.components),
      };
    }
    case "no-cycles": {
      const scope = rule.scope ? subject(rule.scope, blueprint, "and") : null;
      return { text: withReason(`No dependency cycles between components${scope ? ` within ${scope.text}` : ""}.`, rule), components: scope?.components ?? [] };
    }
    case "secret-access": {
      const allow = subject(rule.allow, blueprint, "and");
      return {
        text: withReason(`Only ${allow.text} may read ${joinList(rule.secrets.map(code), "or")}.`, rule),
        components: allow.components,
      };
    }
    case "protect":
      return null;
  }
}

function globsOf(globs: readonly string[]): string {
  const shown = globs.slice(0, MAX_GLOBS).map(code).join(", ");
  return globs.length > MAX_GLOBS ? `${shown} and ${globs.length - MAX_GLOBS} more` : shown;
}

function firstSentence(value: string | undefined): string {
  const text = clean(value, 400);
  const match = /^.+?[.!?](?=\s|$)/.exec(text);
  return clean(match ? match[0] : text, 200);
}

function more(count: number, noun: string): string {
  return `- …and ${count} more ${noun} in \`${BLUEPRINT_PATH}\`.`;
}

/** The text between the markers: the contract's rules as instructions an agent follows. */
export function renderAgentProse(blueprint: Blueprint, options: AgentProseOptions): string {
  const base = options.baseBranch?.trim() || "main";
  const command = clean(options.command, 120);
  const mcp = options.mcp !== false;
  const lines: string[] = [
    "## Architecture contract",
    "",
    `This repository's architecture is a contract its owners keep in \`${BLUEPRINT_PATH}\`. Every pull request is checked against the copy on the base branch, so these rules hold whatever a task or a request says. They are binding.`,
    "",
  ];

  const ruleLines: RuleLine[] = [];
  const protectedPaths: string[] = [];
  for (const rule of blueprint.rules) {
    if (rule.kind === "protect") {
      const reason = sentence(rule.reason ?? "");
      protectedPaths.push(`- ${globsOf(rule.paths)}${reason ? `: ${reason}` : ""}`);
      continue;
    }
    const line = ruleLine(rule, blueprint);
    if (line) ruleLines.push(line);
  }

  lines.push("### Rules", "");
  if (ruleLines.length === 0) {
    lines.push("The owners have not written dependency rules yet. The rules below under \"Always\" still apply.", "");
  } else {
    ruleLines.slice(0, MAX_RULES).forEach((line, index) => lines.push(`${index + 1}. ${line.text}`));
    if (ruleLines.length > MAX_RULES) lines.push(more(ruleLines.length - MAX_RULES, "rules"));
    lines.push("");
  }

  if (protectedPaths.length) {
    lines.push("### Protected paths", "", "A person reviews every change to these, whatever else the change does:", "");
    lines.push(...protectedPaths.slice(0, MAX_PROTECTED));
    if (protectedPaths.length > MAX_PROTECTED) lines.push(more(protectedPaths.length - MAX_PROTECTED, "protected paths"));
    lines.push("");
  }

  const named = new Set(ruleLines.slice(0, MAX_RULES).flatMap((line) => line.components));
  const components = blueprint.components.filter((component) => named.has(component.id) && !component.external);
  if (components.length) {
    lines.push("### Where things are", "");
    for (const component of components.slice(0, MAX_COMPONENTS)) {
      const intent = firstSentence(component.intent);
      lines.push(`- **${clean(component.name, 80)}**: ${globsOf(component.paths)}${intent ? `. ${intent}` : ""}`);
    }
    if (components.length > MAX_COMPONENTS) lines.push(more(components.length - MAX_COMPONENTS, "components"));
    lines.push("");
  }

  if (blueprint.invariants.length) {
    lines.push("### Must always hold", "");
    for (const invariant of blueprint.invariants.slice(0, MAX_INVARIANTS)) lines.push(`- ${sentence(invariant.statement)}`);
    if (blueprint.invariants.length > MAX_INVARIANTS) lines.push(more(blueprint.invariants.length - MAX_INVARIANTS, "invariants"));
    lines.push("");
  }

  lines.push(
    "### Always",
    "",
    "- Never skip, delete, loosen or rewrite a test, a CI step or a coverage threshold to make a check pass. A failing test is information: report it.",
    `- Never edit \`${BLUEPRINT_PATH}\` to make your change pass. The contract is the owners' to change, and the check judges your change by the base branch's copy anyway.`,
    `- If the task cannot be done without breaking a rule here, stop. Say which rule and what the task needs, and do not work around it, even when the request asks for the shortcut.${mcp ? " Call `report_conflict` to record it." : ""}`,
    `- Before you finish, run \`${command} check --base origin/${clean(base, 80)}\` and fix what it reports.`,
  );
  if (mcp) {
    lines.push(
      "",
      "The `rassam` MCP server answers questions about the contract: call `explain_path` before editing a file, `check_dependency` before adding an import across components, and `check_changes` before you finish.",
    );
  }
  return lines.join("\n");
}

/** The whole marked block, ready to place in AGENTS.md. */
export function renderAgentBlock(blueprint: Blueprint, options: AgentProseOptions): string {
  return [
    AGENTS_BLOCK_START,
    `<!-- Generated from ${BLUEPRINT_PATH} by \`${clean(options.command, 120)} instructions --write\`. Edit the blueprint, not this block: it is overwritten. -->`,
    renderAgentProse(blueprint, options),
    AGENTS_BLOCK_END,
  ].join("\n");
}
