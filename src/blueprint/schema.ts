import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Rassam Blueprint v0.1 — an open, versioned, human-owned
// architecture contract that lives in the repository at
// `.rassam/blueprint.json`. Agents read it before acting, the
// gate checks every change against it, humans author and sign it.
// Spec: docs/blueprint-spec.md
// ─────────────────────────────────────────────────────────────

export const BLUEPRINT_VERSION = "0.1";
export const BLUEPRINT_DIR = ".rassam";
export const BLUEPRINT_PATH = ".rassam/blueprint.json";
export const BLUEPRINT_LAYOUT_PATH = ".rassam/layout.json";
export const BLUEPRINT_PROPOSALS_DIR = ".rassam/proposals";
export const BLUEPRINT_ESCALATIONS_DIR = ".rassam/escalations";
/** Where the project lives. Used wherever a report or generated file links back to Rassam. */
export const PROJECT_URL = "https://github.com/V0ightt/Rassam";
/** A URL that resolves, so editors can fetch the schema for completion and validation. */
export const BLUEPRINT_SCHEMA_URL = "https://raw.githubusercontent.com/V0ightt/Rassam/main/schema/blueprint-0.1.schema.json";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const blueprintIdSchema = z
  .string()
  .regex(idPattern, "IDs use letters, digits, '.', '_', ':' or '-' and start with a letter or digit (max 80 chars)");

const shortText = z.string().trim().min(1).max(200);
const longText = z.string().max(8_000);
const globSchema = z.string().trim().min(1).max(400);
/** ISO-8601 date or date-time. Kept loose so hand-edited files stay valid. */
const timestampSchema = z.string().trim().min(4).max(40);

export const severitySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof severitySchema>;

/**
 * Who asserted a fact. `human` facts are the scarce asset: intent that a model
 * cannot infer from code. `derived` facts come from static analysis, `agent`
 * facts were proposed by a coding agent and accepted into the file.
 */
export const provenanceSchema = z
  .object({
    source: z.enum(["human", "derived", "agent"]),
    by: z.string().trim().max(200).optional(),
    at: timestampSchema.optional(),
    commit: z.string().trim().max(64).optional(),
    note: z.string().max(1_000).optional(),
  })
  .strict();
export type Provenance = z.infer<typeof provenanceSchema>;

/** A human sign-off: "I checked this against the code at this commit." */
export const verificationSchema = z
  .object({
    by: shortText,
    at: timestampSchema,
    commit: z.string().trim().max(64).optional(),
    note: z.string().max(1_000).optional(),
  })
  .strict();
export type Verification = z.infer<typeof verificationSchema>;

export const assuranceSchema = z.enum([
  "unknown",
  "untested",
  "tested",
  "property-tested",
  "formally-verified",
]);
export type Assurance = z.infer<typeof assuranceSchema>;

export const componentKindSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, "kind is a lowercase slug such as api, service, database or external-api");

/**
 * Where a component runs, so its live state can be probed. Each source is
 * optional: an HTTP health check, a deployment environment or a CI workflow.
 */
export const componentRuntimeSchema = z
  .object({
    health: z
      .object({
        url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i,"health.url is an http(s) URL"),
        method: z.enum(["GET", "HEAD"]).optional(),
        /** Exact status to expect; any 2xx counts as healthy when omitted. */
        expectStatus: z.number().int().min(100).max(599).optional(),
        timeoutMs: z.number().int().min(100).max(30_000).optional(),
      })
      .strict()
      .optional(),
    deployment: z.object({ environment: z.string().trim().min(1).max(100) }).strict().optional(),
    workflow: z.object({ file: z.string().trim().min(1).max(200) }).strict().optional(),
  })
  .strict();
export type ComponentRuntime = z.infer<typeof componentRuntimeSchema>;

export const componentSchema = z
  .object({
    id: blueprintIdSchema,
    name: shortText,
    kind: componentKindSchema.default("default"),
    description: z.string().max(2_000).optional(),
    /** Human-authored purpose, responsibilities and boundaries. */
    intent: longText.optional(),
    /** Globs (repo-relative) for the files this component owns. Empty for external systems. */
    paths: z.array(globSchema).max(200).default([]),
    exclude: z.array(globSchema).max(200).optional(),
    /** Resolves overlaps between components: higher wins, then glob specificity. */
    priority: z.number().int().min(-100).max(100).optional(),
    /** True for systems outside the repository (SaaS APIs, databases, queues). */
    external: z.boolean().optional(),
    /** Any component may depend on this one without declaring it (contracts, types, utilities). Rules still apply. */
    public: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    owners: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    assurance: assuranceSchema.optional(),
    /** Where this component runs (health check, deployment, workflow) for live status. */
    runtime: componentRuntimeSchema.optional(),
    provenance: provenanceSchema.optional(),
    verified: verificationSchema.optional(),
  })
  .strict();
export type BlueprintComponent = z.infer<typeof componentSchema>;

export const dependencyKindSchema = z.enum(["imports", "calls", "reads", "writes", "sends", "receives", "uses"]);

/** An intended (declared) relationship between two components. */
export const dependencySchema = z
  .object({
    from: blueprintIdSchema,
    to: blueprintIdSchema,
    kind: dependencyKindSchema.optional(),
    label: z.string().trim().max(120).optional(),
    reason: z.string().max(2_000).optional(),
    provenance: provenanceSchema.optional(),
    verified: verificationSchema.optional(),
  })
  .strict();
export type BlueprintDependency = z.infer<typeof dependencySchema>;

/**
 * Selectors name sets of files or packages:
 *   "*"                 every internal file
 *   "<id>"              files of component <id> (same as "component:<id>")
 *   "component:<id>"    files of a component
 *   "tag:<tag>"         files of components carrying <tag> (tags may contain ':')
 *   "path:<glob>"       files matching a glob
 *   "package:<glob>"    external packages (e.g. "package:node:*", "package:octokit")
 *   "!<selector>"       exclusion (only inside an array)
 */
export const selectorSchema = z.union([
  z.string().trim().min(1).max(400),
  z.array(z.string().trim().min(1).max(400)).min(1).max(100),
]);
export type Selector = z.infer<typeof selectorSchema>;

const ruleBase = {
  id: blueprintIdSchema,
  severity: severitySchema.optional(),
  reason: z.string().max(2_000).optional(),
  provenance: provenanceSchema.optional(),
  verified: verificationSchema.optional(),
};

/** No dependency may go from `from` to `to`. */
export const forbidRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal("forbid"),
    from: selectorSchema,
    to: selectorSchema,
    /** Count `import type` edges too (default true). */
    includeTypeOnly: z.boolean().optional(),
  })
  .strict();

/** `from` may only depend on itself and `to`. Externals are restricted only when `to` lists a package selector. */
export const allowOnlyRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal("allow-only"),
    from: selectorSchema,
    to: selectorSchema,
    includeTypeOnly: z.boolean().optional(),
  })
  .strict();

/** Ordered top → bottom. A layer may depend on layers below it, never above. */
export const layersRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal("layers"),
    layers: z.array(selectorSchema).min(2).max(20),
    includeTypeOnly: z.boolean().optional(),
  })
  .strict();

/** No dependency cycles between components (optionally within a scope). */
export const noCyclesRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal("no-cycles"),
    scope: selectorSchema.optional(),
    includeTypeOnly: z.boolean().optional(),
  })
  .strict();

/** Changes to these paths always require human review (tripwires). */
export const protectRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal("protect"),
    paths: z.array(globSchema).min(1).max(200),
  })
  .strict();

/** Environment variables / secrets matching `secrets` may only be read by `allow`. */
export const secretAccessRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal("secret-access"),
    secrets: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
    allow: selectorSchema,
  })
  .strict();

export const ruleSchema = z.discriminatedUnion("kind", [
  forbidRuleSchema,
  allowOnlyRuleSchema,
  layersRuleSchema,
  noCyclesRuleSchema,
  protectRuleSchema,
  secretAccessRuleSchema,
]);
export type BlueprintRule = z.infer<typeof ruleSchema>;
export type RuleKind = BlueprintRule["kind"];

export const invariantSchema = z
  .object({
    id: blueprintIdSchema,
    statement: z.string().trim().min(1).max(2_000),
    components: z.array(blueprintIdSchema).max(100).optional(),
    check: z
      .object({
        /** Shell command run by `rassam check --run-invariants` (read from the base blueprint only). */
        run: z.string().trim().min(1).max(1_000).optional(),
        /** Test files that exercise this invariant. */
        tests: z.array(globSchema).max(100).optional(),
      })
      .strict()
      .optional(),
    severity: severitySchema.optional(),
    provenance: provenanceSchema.optional(),
    verified: verificationSchema.optional(),
  })
  .strict();
export type BlueprintInvariant = z.infer<typeof invariantSchema>;

export const decisionSchema = z
  .object({
    id: blueprintIdSchema,
    title: z.string().trim().min(1).max(300),
    status: z.enum(["proposed", "accepted", "superseded", "deprecated"]),
    date: timestampSchema.optional(),
    components: z.array(blueprintIdSchema).max(100).optional(),
    context: longText.optional(),
    decision: longText,
    consequences: longText.optional(),
    supersededBy: blueprintIdSchema.optional(),
    links: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    provenance: provenanceSchema.optional(),
  })
  .strict();
export type BlueprintDecision = z.infer<typeof decisionSchema>;

export const policySchema = z
  .object({
    /** How to treat observed cross-component dependencies that are not declared. */
    undeclaredDependencies: z.enum(["off", "info", "warning", "error"]).default("warning"),
    /** How to treat source files that no component claims. */
    unmappedFiles: z.enum(["off", "info", "warning"]).default("info"),
    /** Count `import type` edges in rules by default. */
    includeTypeOnly: z.boolean().default(true),
    /** Built-in tripwires for tests, CI, lockfiles, agent permissions and the blueprint itself. */
    tripwires: z
      .object({
        defaults: z.boolean().default(true),
        paths: z.array(globSchema).max(200).optional(),
      })
      .strict()
      .default({ defaults: true }),
    /** Heuristics that flag weakened verification (skipped tests, deleted assertions, ...). */
    verificationHeuristics: z.boolean().default(true),
    /** Globs excluded from analysis entirely (generated code, fixtures, vendored code). */
    ignore: z.array(globSchema).max(500).default([]),
  })
  .strict();
export type BlueprintPolicy = z.infer<typeof policySchema>;

export const blueprintSchema = z
  .object({
    $schema: z.string().max(500).optional(),
    version: z.literal(BLUEPRINT_VERSION),
    system: z
      .object({
        name: shortText,
        description: z.string().max(4_000).optional(),
        repository: z.string().trim().max(500).optional(),
      })
      .strict(),
    policy: policySchema.default(() => policySchema.parse({})),
    components: z.array(componentSchema).max(500),
    dependencies: z.array(dependencySchema).max(5_000).default([]),
    rules: z.array(ruleSchema).max(500).default([]),
    invariants: z.array(invariantSchema).max(500).default([]),
    decisions: z.array(decisionSchema).max(500).default([]),
  })
  .strict();

export type Blueprint = z.infer<typeof blueprintSchema>;
export type BlueprintInput = z.input<typeof blueprintSchema>;

export interface BlueprintIssue {
  path: string;
  message: string;
}

export type BlueprintParseResult =
  | { ok: true; blueprint: Blueprint; issues: BlueprintIssue[] }
  | { ok: false; issues: BlueprintIssue[] };

function issuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`))
    .join("")
    .replace(/^\./, "") || "(root)";
}

const RESERVED_SELECTOR_PREFIXES = ["component:", "tag:", "path:", "package:"];

/** Component IDs referenced by a selector (bare IDs and `component:` entries). */
export function selectorComponentRefs(selector: Selector | undefined): string[] {
  if (selector === undefined) return [];
  const entries = Array.isArray(selector) ? selector : [selector];
  const refs: string[] = [];
  for (const raw of entries) {
    const entry = raw.startsWith("!") ? raw.slice(1) : raw;
    if (entry === "*") continue;
    if (entry.startsWith("component:")) refs.push(entry.slice("component:".length));
    else if (!RESERVED_SELECTOR_PREFIXES.some((prefix) => entry.startsWith(prefix))) refs.push(entry);
  }
  return refs;
}

function ruleSelectors(rule: BlueprintRule): Selector[] {
  switch (rule.kind) {
    case "forbid":
    case "allow-only":
      return [rule.from, rule.to];
    case "layers":
      return rule.layers;
    case "no-cycles":
      return rule.scope ? [rule.scope] : [];
    case "secret-access":
      return [rule.allow];
    case "protect":
      return [];
  }
}

/** Referential integrity checks that a JSON schema cannot express. */
export function semanticIssues(blueprint: Blueprint): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  const componentIds = new Set<string>();
  blueprint.components.forEach((component, index) => {
    if (componentIds.has(component.id)) {
      issues.push({ path: `components[${index}].id`, message: `Duplicate component id "${component.id}"` });
    }
    componentIds.add(component.id);
    if (RESERVED_SELECTOR_PREFIXES.some((prefix) => component.id.startsWith(prefix)) || component.id === "*") {
      issues.push({ path: `components[${index}].id`, message: `Component id "${component.id}" collides with selector syntax (component:, tag:, path:, package:)` });
    }
    if (!component.external && component.paths.length === 0) {
      issues.push({ path: `components[${index}].paths`, message: `Component "${component.id}" owns no paths; mark it external or add globs` });
    }
  });

  blueprint.dependencies.forEach((dependency, index) => {
    for (const side of ["from", "to"] as const) {
      if (!componentIds.has(dependency[side])) {
        issues.push({ path: `dependencies[${index}].${side}`, message: `Unknown component "${dependency[side]}"` });
      }
    }
  });

  const ruleIds = new Set<string>();
  blueprint.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) issues.push({ path: `rules[${index}].id`, message: `Duplicate rule id "${rule.id}"` });
    ruleIds.add(rule.id);
    for (const selector of ruleSelectors(rule)) {
      for (const ref of selectorComponentRefs(selector)) {
        if (!componentIds.has(ref)) {
          issues.push({ path: `rules[${index}]`, message: `Rule "${rule.id}" references unknown component "${ref}"` });
        }
      }
    }
  });

  const invariantIds = new Set<string>();
  blueprint.invariants.forEach((invariant, index) => {
    if (invariantIds.has(invariant.id)) issues.push({ path: `invariants[${index}].id`, message: `Duplicate invariant id "${invariant.id}"` });
    invariantIds.add(invariant.id);
    for (const ref of invariant.components ?? []) {
      if (!componentIds.has(ref)) issues.push({ path: `invariants[${index}].components`, message: `Unknown component "${ref}"` });
    }
  });

  const decisionIds = new Set<string>();
  blueprint.decisions.forEach((decision, index) => {
    if (decisionIds.has(decision.id)) issues.push({ path: `decisions[${index}].id`, message: `Duplicate decision id "${decision.id}"` });
    decisionIds.add(decision.id);
    for (const ref of decision.components ?? []) {
      if (!componentIds.has(ref)) issues.push({ path: `decisions[${index}].components`, message: `Unknown component "${ref}"` });
    }
  });
  blueprint.decisions.forEach((decision, index) => {
    if (decision.supersededBy && !decisionIds.has(decision.supersededBy)) {
      issues.push({ path: `decisions[${index}].supersededBy`, message: `Unknown decision "${decision.supersededBy}"` });
    }
  });

  return issues;
}

/** Parse and validate an unknown value (already JSON-decoded). */
export function parseBlueprint(value: unknown): BlueprintParseResult {
  const result = blueprintSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({ path: issuePath(issue.path), message: issue.message })),
    };
  }
  const issues = semanticIssues(result.data);
  return issues.length ? { ok: false, issues } : { ok: true, blueprint: result.data, issues: [] };
}

/** Parse blueprint JSON text. */
export function parseBlueprintText(text: string): BlueprintParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: "(root)", message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }
  return parseBlueprint(value);
}

const TOP_LEVEL_ORDER = ["$schema", "version", "system", "policy", "components", "dependencies", "rules", "invariants", "decisions"];

/**
 * Deterministic, diff-friendly serialization: stable key order for the top
 * level, two-space indentation and a trailing newline. Empty optional arrays
 * are kept so humans see where to add facts.
 */
export function serializeBlueprint(blueprint: Blueprint): string {
  const ordered: Record<string, unknown> = {};
  const source = { $schema: BLUEPRINT_SCHEMA_URL, ...blueprint } as Record<string, unknown>;
  for (const key of TOP_LEVEL_ORDER) if (source[key] !== undefined) ordered[key] = source[key];
  for (const key of Object.keys(source)) if (!(key in ordered) && source[key] !== undefined) ordered[key] = source[key];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** JSON Schema (draft 2020-12) for editors and other tools. */
export function blueprintJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(blueprintSchema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
  return {
    $id: BLUEPRINT_SCHEMA_URL,
    title: "Rassam Blueprint",
    description: `A human-owned architecture contract for agent-built software. See ${PROJECT_URL}`,
    ...schema,
  };
}

export function emptyBlueprint(name: string): Blueprint {
  return blueprintSchema.parse({ version: BLUEPRINT_VERSION, system: { name }, components: [] });
}
