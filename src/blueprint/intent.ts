// Deterministic natural-language commands for the blueprint: "forbid ui from
// importing db", "add a component Payments for src/payments", "remove rule
// ui-no-db". No model is involved; a model, when available, produces the same
// typed edits (see edits.ts). Every "ok" result has been dry-run against the
// blueprint, so its edits are known to apply cleanly.

import {
  applyBlueprintEdits,
  blueprintEditSchema,
  BlueprintEditError,
  nearestIds,
  resolveComponentRef,
  type BlueprintEdit,
  type BlueprintEditInput,
} from "./edits";
import type { Blueprint, Selector, Severity } from "./schema";
import { slugify, titleCase } from "./util";

export type IntentResult =
  | { status: "ok"; edits: BlueprintEdit[]; interpretation: string }
  | { status: "ambiguous"; message: string; options: Array<{ label: string; edits: BlueprintEdit[] }> }
  | { status: "unknown"; message: string; examples: string[] };

export const INTENT_EXAMPLES: string[] = [
  "forbid ui from importing db because the UI goes through the API",
  "domain may only depend on util and shared",
  "declare ui -> domain",
  "add a component Payments for src/payments/**",
  "rename ui to storefront",
  "set intent of payments to \"Owns charging, refunds and payouts\"",
  "make rule ui-no-db a warning",
  "protect src/security/** and next.config.ts",
  "only payments may read STRIPE_*",
  "layers: ui > domain > infra",
];

/** Minimal shape of a graph view (see `Workspace.graphView()`). */
export interface IntentGraphView {
  edges: ReadonlyArray<{ from: string; to: string; status: string }>;
}

// ── Reference resolution ──────────────────────────────────────

class AmbiguousReference extends Error {
  readonly key: string;
  readonly term: string;
  readonly candidates: string[];
  constructor(key: string, term: string, candidates: string[]) {
    super(`"${term}" is ambiguous`);
    this.key = key;
    this.term = term;
    this.candidates = candidates;
  }
}

class UnknownReference extends Error {
  readonly suggestions: string[];
  constructor(message: string, suggestions: string[] = []) {
    super(message);
    this.suggestions = suggestions;
  }
}

interface Context {
  blueprint: Blueprint;
  /** Choices already made for ambiguous terms (key → id). */
  choices: ReadonlyMap<string, string>;
}

type Handler = (command: string, context: Context) => BlueprintEditInput[] | null;

function unquote(text: string): string {
  return text.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

function cleanTerm(text: string): string {
  return unquote(text)
    .replace(/^(?:the|our|my|a|an)\s+/i, "")
    .trim();
}

function quoted(items: readonly string[]): string {
  const parts = items.map((item) => `"${item}"`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

function component(context: Context, raw: string): string {
  const term = cleanTerm(raw);
  const key = `component:${term.toLowerCase()}`;
  const chosen = context.choices.get(key);
  if (chosen) return chosen;
  const resolved = resolveComponentRef(context.blueprint, term);
  if ("id" in resolved) return resolved.id;
  if (resolved.candidates.length) throw new AmbiguousReference(key, term, resolved.candidates);
  const suggestions = nearestIds(term, context.blueprint.components.map((item) => item.id));
  throw new UnknownReference(
    `I don't know a component called "${term}".${suggestions.length ? ` Did you mean ${quoted(suggestions)}?` : ""} For an npm package say "package ${term}", for files give a path such as src/${slugify(term)}/**.`,
    suggestions,
  );
}

function ruleRef(context: Context, raw: string): string {
  const term = cleanTerm(raw).replace(/^rule\s+/i, "");
  const key = `rule:${term.toLowerCase()}`;
  const chosen = context.choices.get(key);
  if (chosen) return chosen;
  const ids = context.blueprint.rules.map((rule) => rule.id);
  const lower = term.toLowerCase();
  const exact = ids.find((id) => id === term) ?? ids.find((id) => id.toLowerCase() === lower) ?? ids.find((id) => id.toLowerCase() === slugify(term, 80));
  if (exact) return exact;
  const partial = ids.filter((id) => id.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new AmbiguousReference(key, term, partial);
  // Rule ids are exact identifiers and relaxing a rule is consequential: typos are suggested, never guessed.
  const suggestions = nearestIds(term, ids);
  throw new UnknownReference(`There is no rule called "${term}".${suggestions.length ? ` Did you mean ${quoted(suggestions)}?` : ""}`, suggestions);
}

function exactComponent(blueprint: Blueprint, text: string): string | null {
  const lower = cleanTerm(text).toLowerCase();
  const found = blueprint.components.find((item) => item.id.toLowerCase() === lower || item.name.toLowerCase() === lower);
  return found ? found.id : null;
}

// ── Paths, lists and selectors ────────────────────────────────

const DOT_DIRECTORIES = new Set([".github", ".rassam", ".vscode", ".husky", ".circleci", ".claude", ".cursor", ".config", ".devcontainer", ".storybook"]);
const BARE_FILES = /^(?:Dockerfile|Makefile|LICENSE|README|CODEOWNERS|Procfile|Gemfile|Rakefile)(?:\.[\w.-]+)?$/;

function isPathLike(text: string): boolean {
  if (!text || /\s/.test(text) || /^https?:/i.test(text) || /^(?:node|package|tag|component):/i.test(text) || text.startsWith("@")) return false;
  if (/[/*]/.test(text)) return true;
  if (text.startsWith(".") && text.length > 1) return true;
  if (BARE_FILES.test(text)) return true;
  return /^[\w-][\w.-]*\.[A-Za-z0-9]{1,5}$/.test(text) && !/^node\.js$/i.test(text);
}

/** "src/payments" → "src/payments/**"; files and globs are kept as written. */
function toGlob(text: string): string {
  const path = unquote(text).replace(/^path:/, "").replace(/^\.\//, "").replace(/\\/g, "/");
  if (path.endsWith("/")) return `${path}**`;
  if (path.includes("*")) return path;
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (BARE_FILES.test(last)) return path;
  if (last.startsWith(".")) return DOT_DIRECTORIES.has(last) ? `${path}/**` : path;
  if (last.includes(".")) return path;
  return `${path}/**`;
}

function splitList(text: string): string[] {
  return text
    .split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or|plus)\s+|\s*&\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function terms(context: Context, text: string): string[] {
  const whole = cleanTerm(text);
  if (/[,&]|\s(?:and|or|plus)\s/i.test(whole) && exactComponent(context.blueprint, whole)) return [whole];
  return splitList(whole);
}

function pathList(context: Context, text: string): string[] {
  const globs: string[] = [];
  for (const raw of terms(context, text)) {
    const term = cleanTerm(raw).replace(/^(?:files?|everything|anything|code)\s+(?:in|under|inside|matching|at)\s+/i, "");
    if (isPathLike(term) || term.startsWith("path:")) {
      globs.push(toGlob(term));
      continue;
    }
    const owner = context.blueprint.components.find((item) => item.id === component(context, term));
    if (!owner || owner.paths.length === 0) throw new UnknownReference(`"${term}" owns no files. Give a path such as src/${slugify(term)}/**.`);
    globs.push(...owner.paths);
  }
  return [...new Set(globs)];
}

const EVERYTHING = /^(?:\*|anything|everything|any(?:\s+(?:file|code|component|module))?|all(?:\s+(?:code|files|components|modules))?|every(?:one|body|\s+component|\s+file)|anyone|anybody|nothing|nobody|no\s+one|(?:anything|everything|everyone)\s+else|the\s+rest)$/i;

function selectorEntry(context: Context, raw: string): string {
  const term = cleanTerm(raw);
  if (EVERYTHING.test(term)) return "*";
  if (/^(?:path|package|tag):\S+$/i.test(term)) return term;
  if (/^component:/i.test(term)) return component(context, term.slice("component:".length));
  const known = exactComponent(context.blueprint, term);
  if (known) return known;
  if (/^node(?:\.js)?(?:'s)?(?:\s+(?:built-?ins?|builtins|core(?:\s+modules)?|standard\s+library|stdlib|modules|apis?))?$/i.test(term)) return "package:node:*";
  if (/^node:[\w/*.-]+$/i.test(term)) return `package:${term}`;
  if (/^@[\w.-]+\/[\w.*-]+$/.test(term)) return `package:${term}`;
  let match = /^(?:the\s+)?(?:npm\s+)?(?:packages?|librar(?:y|ies)|modules?|dependency|sdk)\s+(\S+)$/i.exec(term);
  if (match) return `package:${unquote(match[1])}`;
  match = /^(\S+)\s+(?:package|library|sdk|npm\s+package)$/i.exec(term);
  if (match) return `package:${unquote(match[1])}`;
  match = /^(?:components?|anything|everything|files|code)\s+tagged\s+(?:with\s+|as\s+)?(\S+)$/i.exec(term);
  if (match) return `tag:${unquote(match[1])}`;
  match = /^(?:files?|code|anything|everything|modules?)\s+(?:in|under|inside|within|matching|at)\s+(.+)$/i.exec(term);
  const body = match ? cleanTerm(match[1]) : term;
  if (isPathLike(body)) return `path:${toGlob(body)}`;
  return component(context, body);
}

function selector(context: Context, text: string): Selector {
  const cleaned = cleanTerm(text);
  const exception = /^(.*?)(?:,\s*|\s+|^)(?:except(?:\s+for)?|but\s+not|other\s+than|excluding|apart\s+from|besides)\s+(.+)$/i.exec(cleaned);
  const base = exception ? exception[1].trim() : cleaned;
  const entries = base ? terms(context, base).map((part) => selectorEntry(context, part)) : ["*"];
  if (exception) for (const part of terms(context, exception[2])) entries.push(`!${selectorEntry(context, part)}`);
  const unique = [...new Set(entries)];
  return unique.length === 1 ? unique[0] : unique;
}

function entriesOf(value: Selector): string[] {
  return Array.isArray(value) ? value : [value];
}

// ── Shared grammar ────────────────────────────────────────────

const VERB =
  "(?:depend(?:s|ing)?\\s+on|import(?:s|ing)?(?:\\s+from)?|us(?:e|es|ing)|call(?:s|ing)?|referenc(?:e|es|ing)|touch(?:es|ing)?|access(?:es|ing)?|reach(?:es|ing)?(?:\\s+into)?|talk(?:s|ing)?\\s+to|know(?:s|ing)?\\s+about|read(?:s|ing)?(?:\\s+from)?|writ(?:e|es|ing)(?:\\s+to)?|requir(?:e|es|ing)|load(?:s|ing)?|pull(?:s|ing)?\\s+in)";
const NEGATION =
  "(?:must\\s+not|must\\s+never|mustn't|may\\s+not|may\\s+never|cannot|can\\s+not|can't|cant|can\\s+never|should\\s+not|shouldn't|should\\s+never|shall\\s+not|(?:is|are)\\s+not\\s+allowed\\s+to|(?:isn't|aren't)\\s+allowed\\s+to|(?:is|are)\\s+forbidden\\s+(?:to|from)|(?:is|are)\\s+never\\s+allowed\\s+to|does\\s+not|doesn't|do\\s+not|don't|never)";
const MAY = "(?:may|can|should|must|shall|is\\s+allowed\\s+to|are\\s+allowed\\s+to|gets?\\s+to)";
const FORBID = "(?:forbid|block|ban|disallow|prevent|deny|prohibit|stop|bar)";
const ARROW = "(?:-+>|→|=>|⟶)";
const REMOVE = "(?:remove|delete|drop|get\\s+rid\\s+of|retire)";

function re(source: string): RegExp {
  return new RegExp(source, "i");
}

interface Suffix {
  body: string;
  reason?: string;
  severity?: Severity;
  includeTypeOnly?: boolean;
}

/** Peel "because …", "as a warning" and "except type imports" off the end of a command. */
function suffix(command: string): Suffix {
  const result: Suffix = { body: command };
  const because = /^(.*?)(?:,|\s+-+|\s+—)?\s+(?:because|since)\s+(.+)$/i.exec(result.body);
  if (because) {
    result.body = because[1].trim();
    result.reason = sentence(because[2]);
  }
  const typeOnly = /^(.*?)(?:,|\s)\s*\(?(?:except|but|excluding|ignoring|not\s+counting)\s+(?:for\s+)?type(?:-only|\s+only)?\s+imports?(?:\s+are\s+(?:fine|ok|okay|allowed))?\)?$/i.exec(result.body);
  if (typeOnly) {
    result.body = typeOnly[1].trim();
    result.includeTypeOnly = false;
  }
  const severity = /^(.*?)(?:,\s*|\s+)\(?(?:as|with\s+severity|severity:?)\s+(?:an?\s+)?(error|warning|info)\)?$/i.exec(result.body);
  if (severity) {
    result.body = severity[1].trim();
    result.severity = severity[2].toLowerCase() as Severity;
  }
  return result;
}

function sentence(text: string): string {
  const trimmed = unquote(text).trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed;
}

function ruleOptions(parts: Suffix): { reason?: string; severity?: Severity } {
  return { ...(parts.reason ? { reason: parts.reason } : {}), ...(parts.severity ? { severity: parts.severity } : {}) };
}

function forbidEdit(from: Selector, to: Selector, parts: Suffix): BlueprintEditInput[] {
  return [
    {
      op: "forbid_dependency",
      from,
      to,
      ...ruleOptions(parts),
      ...(parts.includeTypeOnly !== undefined ? { includeTypeOnly: parts.includeTypeOnly } : {}),
    },
  ];
}

function isSecretName(text: string): boolean {
  return /^[A-Z0-9_*]+$/.test(text) && /[A-Z]/.test(text);
}

function secretNames(text: string): string[] | null {
  const body = cleanTerm(text).replace(/^(?:the\s+)?(?:secrets?|env(?:ironment)?\s+var(?:iable)?s?|keys?)\s+/i, "");
  const names = splitList(body).map(unquote);
  return names.length && names.every(isSecretName) ? names : null;
}

// ── Handlers, most specific first ─────────────────────────────

const invariantHandler: Handler = (command) => {
  const match = /^(?:(?:add|record|new|create|define)\s+)?(?:an?\s+|the\s+)?invariant\s*(?::|-|—|that)?\s*(.+)$/i.exec(command);
  if (!match) return null;
  let statement = match[1].trim();
  let run: string | undefined;
  let tests: string[] | undefined;
  const check = /^(.*?)[\s,;]*\(?\s*(?:check(?:ed)?(?:\s+(?:with|by))?|run|verify(?:\s+with)?|verified\s+by)\s*[:=]?\s*`?([^`)]+?)`?\s*\)?$/i.exec(statement);
  if (check && /[:=`(]|\b(?:with|by)\b/i.test(statement.slice(check[1].length))) {
    statement = check[1].trim();
    run = check[2].trim();
  }
  const tested = /^(.*?)[\s,;]*\(?\s*tests?\s*[:=]\s*([^)]+?)\s*\)?$/i.exec(statement);
  if (tested) {
    statement = tested[1].trim();
    tests = splitList(tested[2]).map(toGlob);
  }
  statement = sentence(statement.replace(/[.\s]+$/, ""));
  if (!statement) return null;
  return [{ op: "add_invariant", statement, ...(run ? { run } : {}), ...(tests?.length ? { tests } : {}) }];
};

const decisionHandler: Handler = (command) => {
  const match = /^(?:(?:record|add|log|note|new|document|write\s+down)\s+)?(?:an?\s+|the\s+)?(?:decision|adr)\s*(?::|-|—|that|to)?\s*(.+)$/i.exec(command);
  if (!match) return null;
  const body = match[1].trim();
  const because = /^(.*?)(?:,)?\s+because\s+(.+)$/i.exec(body);
  const decision = sentence((because ? because[1] : body).replace(/[.\s]+$/, ""));
  if (!decision) return null;
  return [{ op: "add_decision", title: decision.slice(0, 300), decision, ...(because ? { context: sentence(because[2]) } : {}) }];
};

const layersHandler: Handler = (command, context) => {
  const parts = suffix(command);
  let body: string | null = null;
  const labelled = /^(?:(?:set|define|enforce|add|use)\s+)?(?:the\s+)?layers?(?:\s+(?:are|order|rule))?\s*(?::|=|-)?\s*(.+)$/i.exec(parts.body);
  if (labelled) body = labelled[1];
  else if (/\s(?:above|on\s+top\s+of)\s/i.test(parts.body)) body = parts.body.replace(/\s+(?:is|are|sits?|lives?|goes)\s+(?=above|on\s+top\s+of)/gi, " ");
  if (body === null) return null;
  const arrows = /\s*(?:>+|→|-+>|=>|⟶)\s*|\s+(?:then|above|over|on\s+top\s+of|before)\s+/i;
  let layers = body.split(arrows).map((part) => part.trim()).filter(Boolean);
  if (layers.length < 2) layers = body.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (layers.length < 2) return null;
  return [{ op: "set_layers", layers: layers.map((layer) => selector(context, layer)), ...(parts.reason ? { reason: parts.reason } : {}) }];
};

const cyclesHandler: Handler = (command, context) => {
  const parts = suffix(command);
  const match = re(
    `^(?:(?:no|${FORBID}|avoid)\\s+)(?:dependency\\s+|import\\s+|component\\s+)?(?:cycles|cyclic\\s+(?:dependencies|imports)|circular\\s+(?:dependencies|imports|deps))(?:\\s+(?:in|within|inside|between|among|across)\\s+(.+))?$`,
  ).exec(parts.body);
  if (!match) return null;
  const scopeText = match[1] && !/^(?:components|the\s+components|anything|everything|the\s+codebase|the\s+system)$/i.test(match[1].trim()) ? match[1] : null;
  return [{ op: "forbid_cycles", ...(scopeText ? { scope: selector(context, scopeText) } : {}), ...(parts.reason ? { reason: parts.reason } : {}) }];
};

const protectHandler: Handler = (command, context) => {
  const parts = suffix(command);
  const match =
    /^(?:protect|guard|lock(?:\s+down)?|freeze)\s+(.+)$/i.exec(parts.body) ??
    /^require\s+(?:a\s+)?(?:human\s+)?(?:review|approval|sign-?off)\s+(?:for|of|on|before)\s+(?:any\s+)?(?:changes?\s+(?:to|in)\s+|changing\s+|editing\s+)?(.+)$/i.exec(parts.body);
  if (!match) return null;
  return [{ op: "protect_paths", paths: pathList(context, match[1]), ...ruleOptions(parts) }];
};

const secretHandler: Handler = (command, context) => {
  const parts = suffix(command);
  let match = re(`^only\\s+(.+?)\\s+${MAY}\\s+(?:read|access|use|see|load|touch)\\s+(.+)$`).exec(parts.body);
  if (match) {
    const names = secretNames(match[2]);
    if (!names) return null;
    return [{ op: "restrict_secret", secrets: names, allow: selector(context, match[1]), ...(parts.reason ? { reason: parts.reason } : {}) }];
  }
  match = /^(?:restrict|limit|confine|scope)\s+(.+?)\s+to\s+(.+)$/i.exec(parts.body);
  if (match) {
    const names = secretNames(match[1]);
    if (!names) return null;
    return [{ op: "restrict_secret", secrets: names, allow: selector(context, match[2]), ...(parts.reason ? { reason: parts.reason } : {}) }];
  }
  match = /^(.+?)\s+(?:is|are)\s+only\s+(?:readable|accessible|visible|available)\s+(?:by|to|in|from)\s+(.+)$/i.exec(parts.body);
  if (match) {
    const names = secretNames(match[1]);
    if (!names) return null;
    return [{ op: "restrict_secret", secrets: names, allow: selector(context, match[2]), ...(parts.reason ? { reason: parts.reason } : {}) }];
  }
  return null;
};

const allowOnlyHandler: Handler = (command, context) => {
  const parts = suffix(command);
  const match =
    re(`^(.+?)\\s+${MAY}\\s+only\\s+(?:ever\\s+)?${VERB}\\s+(.+)$`).exec(parts.body) ??
    re(`^(.+?)\\s+only\\s+(?:ever\\s+)?${VERB}\\s+(.+)$`).exec(parts.body) ??
    re(`^(.+?)\\s+${MAY}\\s+${VERB}\\s+only\\s+(.+)$`).exec(parts.body) ??
    re(`^(?:restrict|limit)\\s+(.+?)\\s+to\\s+(?:only\\s+)?(?:${VERB}\\s+)?(.+)$`).exec(parts.body);
  if (!match) return null;
  if (/^only\b/i.test(match[1])) return null;
  return [{ op: "allow_only", from: selector(context, match[1]), to: selector(context, match[2]), ...ruleOptions(parts) }];
};

const forbidHandler: Handler = (command, context) => {
  const parts = suffix(command);
  const body = parts.body;

  // "nothing in src/ui may import src/db/**", "nothing except api may use db", "nobody may import package x"
  let match = re(
    `^(?:nothing|nobody|no\\s+one|no\\s+(?:code|files?|component|module)s?)(?:\\s+(?:in|inside|under|within|from)\\s+(.+?))?(?:\\s+(?:except|but|other\\s+than|besides)\\s+(.+?))?\\s+${MAY}\\s+(?:ever\\s+)?${VERB}\\s+(.+)$`,
  ).exec(body);
  if (match) {
    const from = [...entriesOf(match[1] ? selector(context, match[1]) : "*")];
    if (match[2]) for (const part of terms(context, match[2])) from.push(`!${selectorEntry(context, part)}`);
    return forbidEdit(from.length === 1 ? from[0] : from, selector(context, match[3]), parts);
  }

  // "only api may import db" → everything except api (and db itself) is forbidden.
  match = re(`^only\\s+(.+?)\\s+${MAY}\\s+${VERB}\\s+(.+)$`).exec(body);
  if (match) {
    const to = selector(context, match[2]);
    const exempt = [...terms(context, match[1]).map((part) => selectorEntry(context, part)), ...entriesOf(to).filter((entry) => !/^(?:\*|!|path:|package:|tag:)/.test(entry))];
    return forbidEdit(["*", ...new Set(exempt.map((entry) => `!${entry}`))], to, parts);
  }

  match =
    re(`^${FORBID}\\s+(?:the\\s+)?(?:dependency|dependencies|imports?|edge|arrow)\\s+(?:from\\s+)?(.+?)\\s+(?:to|on|${ARROW})\\s+(.+)$`).exec(body) ??
    re(`^${FORBID}\\s+(.+?)\\s*${ARROW}\\s*(.+)$`).exec(body) ??
    re(`^${FORBID}\\s+(.+?)\\s+(?:from\\s+|to\\s+)?${VERB}\\s+(.+)$`).exec(body) ??
    re(`^(?:don't|do\\s+not|never)\\s+(?:let|allow|permit)\\s+(.+?)\\s+(?:to\\s+)?${VERB}\\s+(.+)$`).exec(body) ??
    re(`^(?:keep|isolate)\\s+(.+?)\\s+(?:away\\s+from|out\\s+of|free\\s+of|independent\\s+of|from)\\s+(.+)$`).exec(body) ??
    re(`^(.+?)\\s+${NEGATION}\\s+(?:ever\\s+|directly\\s+)?${VERB}\\s+(.+)$`).exec(body) ??
    re(`^(.+?)\\s*(?:-/->|-x->|!->|-\\|->|↛)\\s*(.+)$`).exec(body);
  if (!match) return null;
  return forbidEdit(selector(context, match[1]), selector(context, match[2]), parts);
};

const removeDependencyHandler: Handler = (command, context) => {
  const match =
    re(`^(?:${REMOVE}|undeclare|retract)\\s+(?:the\\s+)?(?:declared\\s+)?(?:dependency|edge|link|arrow)\\s+(?:from\\s+|of\\s+)?(.+?)\\s*(?:\\s(?:to|on)\\s|${ARROW})\\s*(.+)$`).exec(command) ??
    re(`^(?:undeclare|retract)\\s+(?:that\\s+)?(.+?)\\s*(?:${ARROW}|\\s(?:to|depends\\s+on|uses|imports)\\s)\\s*(.+)$`).exec(command) ??
    re(`^(.+?)\\s+(?:no\\s+longer|doesn't\\s+need\\s+to|should\\s+stop)\\s+${VERB}\\s+(.+)$`).exec(command);
  if (!match) return null;
  return [{ op: "remove_dependency", from: component(context, match[1]), to: component(context, match[2]) }];
};

function dependencyKind(verb: string | undefined): "calls" | "reads" | "writes" | "uses" | "imports" | "sends" | undefined {
  const lower = (verb ?? "").toLowerCase();
  if (/^call|^talk/.test(lower)) return "calls";
  if (/^read/.test(lower)) return "reads";
  if (/^writ/.test(lower)) return "writes";
  if (/^us/.test(lower)) return "uses";
  if (/^import/.test(lower)) return "imports";
  return undefined;
}

const declareHandler: Handler = (command, context) => {
  const parts = suffix(command);
  const body = parts.body;
  if (/^(?:only|nothing|nobody|no\s)/i.test(body)) return null;
  const verbGroup = `(${VERB})`;
  let from: string | undefined;
  let to: string | undefined;
  let verb: string | undefined;
  let generic = false;
  let match =
    re(`^(?:declare|allow|permit|add|record)\\s+(?:that\\s+)?(?:an?\\s+|the\\s+)?(?:dependency\\s+|edge\\s+|arrow\\s+)?(?:from\\s+)?(.+?)\\s*${ARROW}\\s*(.+)$`).exec(body) ??
    re(`^(?:declare|add|record)\\s+(?:an?\\s+|the\\s+)?(?:dependency|edge|arrow)\\s+(?:from\\s+)?(.+?)\\s+(?:to|on)\\s+(.+)$`).exec(body);
  if (match) [, from, to] = match;
  if (!match) {
    match =
      re(`^(?:declare|record|note)\\s+(?:that\\s+)?(.+?)\\s+${verbGroup}\\s+(.+)$`).exec(body) ??
      re(`^(?:allow|let|permit)\\s+(.+?)\\s+(?:to\\s+)?${verbGroup}\\s+(.+)$`).exec(body) ??
      re(`^(.+?)\\s+(?:${MAY}\\s+|is\\s+allowed\\s+to\\s+|needs\\s+to\\s+|needs\\s+)?${verbGroup}\\s+(.+)$`).exec(body);
    if (match) [, from, verb, to] = match;
    generic = Boolean(match) && !/^(?:declare|record|note|allow|let|permit)\s/i.test(body);
  }
  if (!match) {
    match = re(`^(.+?)\\s*${ARROW}\\s*(.+)$`).exec(body);
    if (match) [, from, to] = match;
    generic = true;
  }
  if (!from || !to) return null;
  // A bare "X uses Y" only counts when X is recognisably a component.
  if (generic) {
    const first = resolveComponentRef(context.blueprint, cleanTerm(terms(context, from)[0] ?? ""));
    if (!("id" in first) && first.candidates.length === 0) return null;
  }
  const kind = dependencyKind(verb);
  const edits: BlueprintEditInput[] = [];
  for (const source of terms(context, from)) {
    for (const target of terms(context, to)) {
      edits.push({
        op: "declare_dependency",
        from: component(context, source),
        to: component(context, target),
        ...(kind ? { kind } : {}),
        ...(parts.reason ? { reason: parts.reason } : {}),
      });
    }
  }
  return edits;
};

const PATH_PREPOSITION = "(?:for|at|covering|owning|in|under|from|over|with\\s+paths?|that\\s+owns|which\\s+owns)";

const addComponentHandler: Handler = (command, context) => {
  const match = /^(?:add|create|define|new|register|introduce)\s+(?:an?\s+|the\s+)?(?:new\s+)?(.*?)\bcomponent\b\s*(.*)$/i.exec(command);
  if (!match) return null;
  let before = match[1].trim();
  if (/\b(?:to|from|dependency|edge|arrow|rule|invariant|decision|intent|tag)\b|[/*]/i.test(before)) return null;
  let after = match[2].trim().replace(/^(?:called|named)\s+/i, "");
  const external = /\bexternal\b/i.test(before);
  before = before.replace(/\bexternal\b/i, "").trim();
  let kind: string | undefined;
  const kindSuffix = /^(.*?)(?:,\s*|\s+)\(?(?:of\s+kind|kind:?|as\s+an?)\s+([a-z][a-z0-9-]*)\)?$/i.exec(after);
  if (kindSuffix) {
    after = kindSuffix[1].trim();
    kind = kindSuffix[2].toLowerCase();
  }
  let name: string;
  let pathText = "";
  const startsWithPaths = re(`^${PATH_PREPOSITION}\\s+(.+)$`).exec(after);
  if (before && (!after || startsWithPaths)) {
    name = before;
    pathText = startsWithPaths ? startsWithPaths[1] : "";
  } else {
    if (before) kind = kind ?? slugify(before, 40);
    const quotedName = /^["'`]([^"'`]+)["'`]\s*(.*)$/.exec(after);
    const split = quotedName ? null : re(`^(.+?)\\s+${PATH_PREPOSITION}\\s+(.+)$`).exec(after);
    if (quotedName) {
      name = quotedName[1];
      pathText = quotedName[2].replace(re(`^${PATH_PREPOSITION}\\s+`), "");
    } else if (split) {
      name = split[1];
      pathText = split[2];
    } else {
      name = after;
    }
  }
  name = unquote(name);
  if (!name) return null;
  if (!/[A-Z]/.test(name)) name = titleCase(name);
  const paths = pathText ? splitList(pathText).map(toGlob) : [];
  if (!external && paths.length === 0) {
    throw new UnknownReference(`Which files does "${name}" own? Say: add a component ${name} for src/${slugify(name)}/** (or: add external component ${name}).`);
  }
  if (context.blueprint.components.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    throw new UnknownReference(`A component called "${name}" already exists.`);
  }
  return [{ op: "add_component", name, paths, ...(kind ? { kind } : {}), ...(external ? { external: true } : {}) }];
};

const removeHandler: Handler = (command, context) => {
  let match = re(`^${REMOVE}\\s+(?:the\\s+)?rule\\s+(.+)$`).exec(command) ?? re(`^${REMOVE}\\s+(?:the\\s+)?(.+?)\\s+rule$`).exec(command);
  if (match) return [{ op: "remove_rule", id: ruleRef(context, match[1]) }];
  match = re(`^${REMOVE}\\s+(?:the\\s+)?component\\s+(.+)$`).exec(command) ?? re(`^${REMOVE}\\s+(?:the\\s+)?(.+?)\\s+component$`).exec(command);
  if (match) return [{ op: "remove_component", id: component(context, match[1]) }];
  match = re(`^${REMOVE}\\s+(?:the\\s+)?(invariant|decision|adr)\\s+(.+)$`).exec(command);
  if (match) {
    const isInvariant = match[1].toLowerCase() === "invariant";
    const ids = (isInvariant ? context.blueprint.invariants : context.blueprint.decisions).map((item) => item.id);
    const wanted = unquote(match[2]);
    const id = ids.find((item) => item.toLowerCase() === wanted.toLowerCase()) ?? ids.find((item) => item.toLowerCase() === slugify(wanted, 80));
    if (!id) {
      const suggestions = nearestIds(wanted, ids);
      throw new UnknownReference(`There is no ${isInvariant ? "invariant" : "decision"} "${wanted}".${suggestions.length ? ` Did you mean ${quoted(suggestions)}?` : ""}`, suggestions);
    }
    return [isInvariant ? { op: "remove_invariant", id } : { op: "remove_decision", id }];
  }
  match = re(`^${REMOVE}\\s+(.+?)\\s+from\\s+(?:the\\s+)?(?:component\\s+)?(.+)$`).exec(command);
  if (match && splitList(match[1]).every((part) => isPathLike(unquote(part)))) {
    const ownerId = component(context, match[2]);
    const owner = context.blueprint.components.find((item) => item.id === ownerId);
    if (!owner) return null;
    const globs = splitList(match[1]).map(toGlob);
    const missing = globs.filter((glob) => !owner.paths.includes(glob));
    if (missing.length) throw new UnknownReference(`"${owner.name}" does not own ${missing.join(", ")}. It owns ${owner.paths.join(", ") || "no paths"}.`, owner.paths);
    return [{ op: "update_component", id: owner.id, set: { paths: owner.paths.filter((path) => !globs.includes(path)) } }];
  }
  match = re(`^${REMOVE}\\s+(?:the\\s+)?(.+)$`).exec(command);
  if (!match) return null;
  const wanted = unquote(match[1]);
  const lower = wanted.toLowerCase();
  const rule = context.blueprint.rules.find((item) => item.id.toLowerCase() === lower);
  if (rule) return [{ op: "remove_rule", id: rule.id }];
  const invariant = context.blueprint.invariants.find((item) => item.id.toLowerCase() === lower);
  if (invariant) return [{ op: "remove_invariant", id: invariant.id }];
  const decision = context.blueprint.decisions.find((item) => item.id.toLowerCase() === lower);
  if (decision) return [{ op: "remove_decision", id: decision.id }];
  return [{ op: "remove_component", id: component(context, wanted) }];
};

const renameHandler: Handler = (command, context) => {
  const match = re(`^rename\\s+(?:the\\s+)?(?:component\\s+)?(.+?)\\s+(?:to|as|into|${ARROW})\\s+(.+)$`).exec(command);
  if (!match) return null;
  const id = component(context, match[1]);
  const wanted = unquote(match[2]);
  if (!wanted) return null;
  const newId = slugify(wanted, 80);
  const name = /[A-Z]/.test(wanted) ? wanted : titleCase(wanted);
  return [{ op: "rename_component", id, ...(newId !== id ? { newId } : {}), name }];
};

const pathsHandler: Handler = (command, context) => {
  const allPaths = (text: string) => splitList(text).every((part) => isPathLike(unquote(part)));
  let pathsText: string | undefined;
  let ownerText: string | undefined;
  let match =
    /^(?:move|assign|give|add|map)\s+(.+?)\s+(?:to|into|under)\s+(?:the\s+)?(?:component\s+)?(.+)$/i.exec(command) ??
    /^(.+?)\s+(?:belongs?|belong)\s+(?:to|in)\s+(?:the\s+)?(?:component\s+)?(.+)$/i.exec(command);
  if (match && allPaths(match[1])) [, pathsText, ownerText] = match;
  if (!pathsText) {
    match = /^(.+?)\s+(?:also\s+|now\s+)?(?:owns|covers|includes|contains)\s+(.+)$/i.exec(command);
    if (match && allPaths(match[2])) [, ownerText, pathsText] = match;
  }
  if (!pathsText || !ownerText) return null;
  const owner = context.blueprint.components.find((item) => item.id === component(context, ownerText));
  if (!owner) return null;
  const globs = splitList(pathsText).map(toGlob);
  const fresh = globs.filter((glob) => !owner.paths.includes(glob));
  if (!fresh.length) throw new UnknownReference(`"${owner.name}" already owns ${globs.join(", ")}.`);
  const edits: BlueprintEditInput[] = [];
  // A move takes the same glob away from whoever listed it before.
  for (const other of context.blueprint.components) {
    if (other.id === owner.id || !other.paths.some((path) => fresh.includes(path))) continue;
    const rest = other.paths.filter((path) => !fresh.includes(path));
    if (rest.length || other.external) edits.push({ op: "update_component", id: other.id, set: { paths: rest } });
  }
  edits.push({ op: "update_component", id: owner.id, set: { paths: [...owner.paths, ...fresh] } });
  return edits;
};

const ASSURANCE = "untested|tested|property-tested|property\\s+tested|formally-verified|formally\\s+verified";

const componentFieldHandler: Handler = (command, context) => {
  let match = /^(?:(?:set|change|update|write|make)\s+)?(?:the\s+)?(intent|description|purpose)\s+(?:of|for)\s+(.+?)\s*(?:\s(?:to|as|is)\s|:|=)\s*(.+)$/i.exec(command);
  if (match) {
    const text = unquote(match[3]);
    if (!text) return null;
    const field = match[1].toLowerCase() === "description" ? "description" : "intent";
    return [{ op: "update_component", id: component(context, match[2]), set: { [field]: text } }];
  }
  match = /^(?:write|add|set)\s+(?:an?\s+|the\s+)?intent\s+(?:of|for)\s+(.+)$/i.exec(command);
  if (match) {
    const id = component(context, match[1]);
    throw new UnknownReference(`What is ${id} for? Say: set intent of ${id} to "what it owns, what it must never do".`);
  }
  match = /^describe\s+(.+?)\s+as\s+(.+)$/i.exec(command);
  if (match) return [{ op: "update_component", id: component(context, match[1]), set: { description: unquote(match[2]) } }];

  match = /^(?:set|change|update)\s+(?:the\s+)?kind\s+(?:of|for)\s+(.+?)\s+(?:to|as|=)\s+(?:an?\s+)?(.+)$/i.exec(command);
  if (match) return [{ op: "update_component", id: component(context, match[1]), set: { kind: slugify(unquote(match[2]), 40) } }];

  match = /^(?:tag|label)\s+(.+?)\s+(?:with|as)\s+(.+)$/i.exec(command);
  if (match) {
    const ownerId = component(context, match[1]);
    const owner = context.blueprint.components.find((item) => item.id === ownerId);
    if (!owner) return null;
    const tags = match[2].split(/\s*,\s*|\s+and\s+|\s+/).map(unquote).filter(Boolean);
    return [{ op: "update_component", id: owner.id, set: { tags: [...new Set([...(owner.tags ?? []), ...tags])] } }];
  }
  match = /^(?:untag|remove\s+(?:the\s+)?tag)\s+(\S+)\s+from\s+(.+)$/i.exec(command);
  if (match) {
    const ownerId = component(context, match[2]);
    const owner = context.blueprint.components.find((item) => item.id === ownerId);
    if (!owner) return null;
    const tag = unquote(match[1]);
    if (!owner.tags?.includes(tag)) throw new UnknownReference(`"${owner.name}" is not tagged ${tag}.`, owner.tags ?? []);
    const rest = owner.tags.filter((item) => item !== tag);
    return [{ op: "update_component", id: owner.id, set: { tags: rest.length ? rest : null } }];
  }

  match = /^(.+?)\s+(?:is|are)\s+owned\s+by\s+(.+)$/i.exec(command) ?? /^(?:set\s+)?(?:the\s+)?owners?\s+(?:of|for)\s+(.+?)\s*(?:\s(?:to|is|are)\s|:|=)\s*(.+)$/i.exec(command);
  if (match) return [{ op: "update_component", id: component(context, match[1]), set: { owners: splitList(match[2]).map(unquote) } }];

  match =
    re(`^(?:make|mark|set|flag)\\s+(.+?)\\s+(?:as\\s+|to\\s+)?(public|private|external|internal|${ASSURANCE})$`).exec(command) ??
    re(`^(.+?)\\s+(?:is|are|should\\s+be)\\s+(public|private|external|internal|${ASSURANCE})$`).exec(command);
  if (match) {
    const id = component(context, match[1]);
    const word = match[2].toLowerCase().replace(/\s+/g, "-");
    if (word === "public" || word === "private") return [{ op: "update_component", id, set: { public: word === "public" } }];
    if (word === "external" || word === "internal") return [{ op: "update_component", id, set: { external: word === "external" } }];
    return [{ op: "update_component", id, set: { assurance: word as "untested" | "tested" | "property-tested" | "formally-verified" } }];
  }
  return null;
};

const severityHandler: Handler = (command, context) => {
  const match =
    /^(?:set|change)\s+(?:the\s+)?severity\s+(?:of|for)\s+(?:the\s+)?(?:rule\s+)?(.+?)\s+(?:to|as|=)\s+(?:an?\s+)?(error|warning|warn|info)$/i.exec(command) ??
    /^(?:make|set|turn|change|downgrade|upgrade|demote|promote|lower|raise)\s+(?:the\s+)?(?:rule\s+)?(.+?)\s+(?:(?:in)?to|as)?\s*(?:an?\s+)?(error|warning|warn|info)(?:\s+only)?$/i.exec(command);
  if (!match) return null;
  const severity = (match[2].toLowerCase() === "warn" ? "warning" : match[2].toLowerCase()) as Severity;
  return [{ op: "update_rule", id: ruleRef(context, match[1].replace(/\s+rule$/i, "")), set: { severity } }];
};

const kindHandler: Handler = (command, context) => {
  const match = /^make\s+(.+?)\s+an?\s+([a-z][a-z0-9-]*)$/i.exec(command);
  if (!match) return null;
  return [{ op: "update_component", id: component(context, match[1]), set: { kind: match[2].toLowerCase() } }];
};

const policyHandler: Handler = (command) => {
  const levelOf = (word: string) => word.toLowerCase().replace(/s$/, "").replace(/^warn$/, "warning");
  let match = /^(?:treat|report|flag|make|show|count)\s+(undeclared|unmapped)\s+\w+\s+(?:as\s+)?(?:an?\s+)?(errors?|warnings?|warn|infos?|off)$/i.exec(command);
  if (match) {
    const level = levelOf(match[2]);
    if (match[1].toLowerCase() === "undeclared") return [{ op: "set_policy", undeclaredDependencies: level as "off" | "info" | "warning" | "error" }];
    if (level === "error") throw new UnknownReference("Unmapped files can be reported as warning, info or off, not as errors.", ["treat unmapped files as warnings"]);
    return [{ op: "set_policy", unmappedFiles: level as "off" | "info" | "warning" }];
  }
  match = /^(turn\s+off|disable|silence|mute|switch\s+off|stop|turn\s+on|enable|switch\s+on)\s+(?:the\s+)?(?:reporting\s+|warnings?\s+(?:for|about)\s+|checks?\s+(?:for|on)\s+)?(undeclared|unmapped|verification)\b.*$/i.exec(command);
  if (match) {
    const on = /on|enable/i.test(match[1]) && !/off/i.test(match[1]);
    const subject = match[2].toLowerCase();
    if (subject === "verification") return [{ op: "set_policy", verificationHeuristics: on }];
    if (subject === "undeclared") return [{ op: "set_policy", undeclaredDependencies: on ? "warning" : "off" }];
    return [{ op: "set_policy", unmappedFiles: on ? "warning" : "off" }];
  }
  match = /^(ignore|skip|exclude|don't\s+count|do\s+not\s+count|count|include)\s+type(?:-only|\s+only)?\s+imports?$/i.exec(command);
  if (match) return [{ op: "set_policy", includeTypeOnly: /^(?:count|include)$/i.test(match[1]) }];
  match = /^(?:stop\s+ignoring|unignore|no\s+longer\s+ignore|analy[sz]e)\s+(.+)$/i.exec(command);
  if (match) return [{ op: "set_policy", ignoreRemove: splitList(match[1]).map(toGlob) }];
  match = /^(?:ignore|exclude|skip)\s+(.+)$/i.exec(command);
  if (match) return [{ op: "set_policy", ignoreAdd: splitList(match[1].replace(/^(?:everything|anything|files?)\s+(?:in|under|matching)\s+/i, "")).map(toGlob) }];
  return null;
};

const runtimeHandler: Handler = (command, context) => {
  let match =
    /^(?:monitor|watch|probe|ping|health-?\s?check)\s+(.+?)\s+(?:at|on|via|with|using)\s+(https?:\/\/\S+?)(?:\s+(?:expecting|expect|and\s+expect)\s+(?:status\s+)?(\d{3}))?$/i.exec(command) ??
    /^(?:the\s+)?(.+?)(?:'s)?\s+health\s*(?:check|url|endpoint)?\s*(?:\s(?:is|at)\s|=|:\s)\s*(https?:\/\/\S+?)(?:\s+(?:expecting|expect)\s+(?:status\s+)?(\d{3}))?$/i.exec(command);
  if (match) {
    return [{ op: "set_runtime", id: component(context, match[1]), health: { url: match[2], ...(match[3] ? { expectStatus: Number(match[3]) } : {}) } }];
  }
  match = /^(?:stop\s+monitoring|unmonitor|stop\s+watching)\s+(.+)$/i.exec(command);
  if (match) return [{ op: "set_runtime", id: component(context, match[1]), health: null }];
  match = /^(.+?)\s+(?:is\s+|gets\s+|are\s+)?(?:deployed|deploys|runs|ships|released|lives)\s+(?:to|in|on)\s+(?:the\s+)?(?:environment\s+|env\s+)?["']?([\w.-]+)["']?(?:\s+environment|\s+env)?$/i.exec(command);
  if (match) return [{ op: "set_runtime", id: component(context, match[1]), deployment: { environment: match[2] } }];
  match = /^(.+?)\s+(?:is\s+)?(?:built|deployed|released|tested|shipped|run)\s+by\s+(?:the\s+)?(?:workflow\s+)?(\S+\.ya?ml)(?:\s+workflow)?$/i.exec(command);
  if (match) {
    const file = match[2].includes("/") ? match[2] : `.github/workflows/${match[2]}`;
    return [{ op: "set_runtime", id: component(context, match[1]), workflow: { file } }];
  }
  return null;
};

/** "payments: owns charging and refunds" — only when the prefix names exactly one component. */
const colonIntentHandler: Handler = (command, context) => {
  const match = /^([^:"]{1,80}):\s+(.+)$/.exec(command);
  if (!match) return null;
  const resolved = resolveComponentRef(context.blueprint, match[1]);
  if (!("id" in resolved)) return null;
  const text = unquote(match[2]);
  return text ? [{ op: "update_component", id: resolved.id, set: { intent: text } }] : null;
};

const HANDLERS: Handler[] = [
  invariantHandler,
  decisionHandler,
  layersHandler,
  colonIntentHandler,
  cyclesHandler,
  runtimeHandler,
  addComponentHandler,
  removeDependencyHandler,
  removeHandler,
  renameHandler,
  severityHandler,
  componentFieldHandler,
  policyHandler,
  protectHandler,
  secretHandler,
  allowOnlyHandler,
  forbidHandler,
  pathsHandler,
  kindHandler,
  declareHandler,
];

// ── Driver ────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .replace(/[“”„‟]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\r/g, "");
}

/** Split on newlines, ";" and " and then " outside quotes. */
function splitCommands(text: string): string[] {
  const commands: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "\"" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n" || char === ";") {
      commands.push(current);
      current = "";
      continue;
    }
    const rest = text.slice(index);
    const joiner = /^(?:,\s*|\s+)(?:and\s+then|then\s+also|and\s+also)\s+/i.exec(rest) ?? /^\.\s+(?=[A-Z])/.exec(rest);
    // "2. Make shared public" is a numbered item, not two sentences.
    if (joiner && !(joiner[0].startsWith(".") && /^\s*\d*$/.test(current))) {
      commands.push(current);
      current = "";
      index += joiner[0].length - 1;
      continue;
    }
    current += char;
  }
  commands.push(current);
  return commands
    .map((command) =>
      command
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
        .replace(/^(?:please|pls|rassam[,:]?|hey[,:]?|ok[,:]?|now|also|and|then|can\s+you|could\s+you|i\s+want\s+to|i'd\s+like\s+to|let's|we\s+should|we\s+need\s+to)\s+/i, "")
        .replace(/^(?:please)\s+/i, "")
        .replace(/[\s.!?]+$/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

interface Branch {
  blueprint: Blueprint;
  edits: BlueprintEdit[];
  summaries: string[];
}

type CommandOutcome =
  | { ok: true; branches: Branch[]; ambiguity?: { term: string; candidates: string[] } }
  | { ok: false; message: string };

const MAX_BRANCHES = 12;

function runCommand(command: string, branch: Branch, choices: ReadonlyMap<string, string>, depth = 0): CommandOutcome {
  const context: Context = { blueprint: branch.blueprint, choices };
  let firstFailure: string | null = null;
  for (const handler of HANDLERS) {
    let produced: BlueprintEditInput[] | null;
    try {
      produced = handler(command, context);
    } catch (error) {
      if (error instanceof AmbiguousReference) {
        if (depth >= 3) return { ok: false, message: `"${error.term}" is ambiguous; name the component by id.` };
        const branches: Branch[] = [];
        let lastFailure = "";
        for (const candidate of error.candidates.slice(0, MAX_BRANCHES)) {
          const outcome = runCommand(command, branch, new Map([...choices, [error.key, candidate]]), depth + 1);
          if (outcome.ok) branches.push(...outcome.branches);
          else lastFailure = outcome.message;
        }
        if (!branches.length) return { ok: false, message: lastFailure || `"${error.term}" is ambiguous.` };
        return { ok: true, branches: branches.slice(0, MAX_BRANCHES), ambiguity: { term: error.term, candidates: error.candidates } };
      }
      if (error instanceof UnknownReference) {
        firstFailure ??= error.message;
        continue;
      }
      throw error;
    }
    if (!produced || !produced.length) continue;
    const edits: BlueprintEdit[] = [];
    let invalid = false;
    for (const edit of produced) {
      const parsed = blueprintEditSchema.safeParse(edit);
      if (!parsed.success) {
        firstFailure ??= `I understood "${command}" but could not build a valid change: ${parsed.error.issues[0]?.message ?? "invalid value"}.`;
        invalid = true;
        break;
      }
      edits.push(parsed.data);
    }
    if (invalid) continue;
    try {
      const result = applyBlueprintEdits(branch.blueprint, edits);
      return {
        ok: true,
        branches: [
          {
            blueprint: result.blueprint,
            edits: [...branch.edits, ...edits],
            summaries: [...branch.summaries, ...result.applied.map((item) => item.summary)],
          },
        ],
      };
    } catch (error) {
      if (error instanceof BlueprintEditError) return { ok: false, message: error.message };
      throw error;
    }
  }
  return { ok: false, message: firstFailure ?? `I could not understand "${command}".` };
}

/**
 * Turn plain English into typed blueprint edits. Deterministic, no model.
 * Later commands see the effect of earlier ones, so "add a component Payments
 * for src/payments; payments must not import db" works in one go.
 */
export function parseIntent(text: string, blueprint: Blueprint): IntentResult {
  const commands = splitCommands(normalize(text ?? ""));
  if (!commands.length) {
    return { status: "unknown", message: "Tell me what to change in the blueprint.", examples: INTENT_EXAMPLES };
  }
  let branches: Branch[] = [{ blueprint, edits: [], summaries: [] }];
  const ambiguities: Array<{ term: string; candidates: string[] }> = [];
  for (const command of commands) {
    const next: Branch[] = [];
    let failure: string | null = null;
    let ambiguity: { term: string; candidates: string[] } | undefined;
    for (const branch of branches) {
      const outcome = runCommand(command, branch, new Map());
      if (!outcome.ok) {
        failure = outcome.message;
        continue;
      }
      next.push(...outcome.branches);
      if (outcome.branches.length > 1) ambiguity = outcome.ambiguity;
    }
    if (!next.length) {
      return { status: "unknown", message: failure ?? `I could not understand "${command}".`, examples: INTENT_EXAMPLES };
    }
    if (ambiguity) ambiguities.push(ambiguity);
    branches = next.slice(0, MAX_BRANCHES);
  }
  if (branches.length === 1) {
    return { status: "ok", edits: branches[0].edits, interpretation: branches[0].summaries.join(" ") };
  }
  const nameOf = (id: string) => blueprint.components.find((item) => item.id === id)?.name ?? id;
  const message = ambiguities
    .map((item) => `"${item.term}" could mean ${quoted(item.candidates.map(nameOf))}.`)
    .concat("Which one did you mean?")
    .join(" ");
  return {
    status: "ambiguous",
    message,
    options: branches.map((branch) => ({ label: branch.summaries.join(" "), edits: branch.edits })),
  };
}

/** Contextual command suggestions: every string parses with `parseIntent` unless it asks the person for text. */
export function suggestIntents(blueprint: Blueprint, graphView?: IntentGraphView): string[] {
  const suggestions: string[] = [];
  const ids = new Set(blueprint.components.map((item) => item.id));
  const edges = (graphView?.edges ?? []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  for (const edge of edges.filter((item) => item.status === "undeclared").slice(0, 3)) {
    suggestions.push(`declare ${edge.from} -> ${edge.to}`, `forbid ${edge.from} -> ${edge.to}`);
  }
  for (const edge of edges.filter((item) => item.status === "missing").slice(0, 2)) {
    suggestions.push(`remove the dependency from ${edge.from} to ${edge.to}`);
  }
  for (const item of blueprint.components.filter((candidate) => !candidate.intent?.trim()).slice(0, 3)) {
    suggestions.push(`write intent for ${item.id}`);
  }
  if (blueprint.components.length > 1 && !blueprint.rules.some((rule) => rule.kind === "no-cycles")) suggestions.push("no cycles");
  if (!blueprint.rules.some((rule) => rule.kind === "forbid" || rule.kind === "allow-only" || rule.kind === "layers")) {
    const front = blueprint.components.find((item) => ["component", "route", "client", "ui", "frontend"].includes(item.kind));
    const store = blueprint.components.find((item) => ["database", "storage", "db"].includes(item.kind));
    if (front && store && front.id !== store.id) suggestions.push(`forbid ${front.id} from importing ${store.id}`);
  }
  if (!blueprint.rules.some((rule) => rule.kind === "protect")) {
    const sensitive = blueprint.components.find((item) => /auth|security|secret|payment|billing/i.test(`${item.id} ${item.name}`) && item.paths.length > 0);
    if (sensitive) suggestions.push(`protect ${sensitive.paths[0]}`);
  }
  if (!blueprint.components.length) suggestions.push("add a component API for src/api/**");
  return [...new Set(suggestions)].slice(0, 10);
}
