import { describe, it, expect } from "vitest";

import { diffBlueprints } from "./blueprint-diff";
import { blueprintSchema, type Blueprint, type BlueprintInput } from "./schema";
import type { BlueprintChange } from "./types";

type Rules = NonNullable<BlueprintInput["rules"]>;
type Components = BlueprintInput["components"];

const COMPONENTS: Components = [
  { id: "ui", name: "UI", kind: "ui", paths: ["src/components/**", "src/app/**"], tags: ["frontend"], assurance: "tested" },
  { id: "api", name: "API", kind: "api", paths: ["src/app/api/**"], tags: ["backend"] },
  { id: "database", name: "Database", kind: "database", paths: ["src/db/**"], tags: ["backend", "storage"] },
  { id: "cache", name: "Cache", kind: "database", paths: ["src/cache/**"] },
  { id: "docs", name: "Docs", paths: ["docs/**"], tags: ["prose"] },
];

const RULES: Rules = [
  { id: "ui-no-db", kind: "forbid", from: "ui", to: ["database", "cache"], reason: "UI goes through the API" },
  { id: "api-allow", kind: "allow-only", from: ["api"], to: ["database"] },
  { id: "layering", kind: "layers", layers: ["ui", "api", ["database", "cache"]] },
  { id: "acyclic", kind: "no-cycles" },
  { id: "guard-ci", kind: "protect", paths: [".github/**", "scripts/release.sh"] },
  { id: "db-secret", kind: "secret-access", secrets: ["DATABASE_URL", "DB_*"], allow: "database" },
  { id: "backend-pure", kind: "forbid", from: "tag:backend", to: "package:react" },
];

function build(overrides: Partial<BlueprintInput> = {}): Blueprint {
  return blueprintSchema.parse({
    version: "0.1",
    system: { name: "Shop" },
    components: COMPONENTS,
    dependencies: [
      { from: "ui", to: "api" },
      { from: "api", to: "database" },
    ],
    rules: RULES,
    invariants: [
      {
        id: "money-integer",
        statement: "Money is stored as integer cents",
        components: ["database"],
        check: { run: "npm test -- money", tests: ["src/db/money.test.ts", "src/db/round.test.ts"] },
      },
    ],
    decisions: [{ id: "adr-1", title: "Use Postgres", status: "accepted", decision: "We use Postgres." }],
    ...overrides,
  });
}

function withRule(id: string, patch: Record<string, unknown>): Blueprint {
  return build({ rules: RULES.map((rule) => (rule.id === id ? ({ ...rule, ...patch } as Rules[number]) : rule)) });
}

function withComponent(id: string, patch: Record<string, unknown>): Blueprint {
  return build({
    components: COMPONENTS.map((component) => (component.id === id ? ({ ...component, ...patch } as Components[number]) : component)),
  });
}

function withPolicy(policy: NonNullable<BlueprintInput["policy"]>): Blueprint {
  return build({ policy });
}

function only(changes: BlueprintChange[]): BlueprintChange {
  expect(changes).toHaveLength(1);
  return changes[0];
}

const base = build();

describe("diffBlueprints: presence", () => {
  it("returns nothing when both are missing or identical", () => {
    expect(diffBlueprints(null, null)).toEqual([]);
    expect(diffBlueprints(base, build())).toEqual([]);
  });

  it("reports deletion of the blueprint as a single weakening", () => {
    expect(diffBlueprints(base, null)).toEqual([
      { kind: "policy-weakened", target: "blueprint", summary: "The blueprint was deleted", weakens: true },
    ]);
  });

  it("lists everything as added for a new blueprint, never weakening", () => {
    const changes = diffBlueprints(null, base);
    expect(changes.every((change) => !change.weakens)).toBe(true);
    expect(changes.map((change) => `${change.kind}:${change.target}`)).toEqual([
      "component-added:api",
      "component-added:cache",
      "component-added:database",
      "component-added:docs",
      "component-added:ui",
      "dependency-added:api->database",
      "dependency-added:ui->api",
      "rule-added:acyclic",
      "rule-added:api-allow",
      "rule-added:backend-pure",
      "rule-added:db-secret",
      "rule-added:guard-ci",
      "rule-added:layering",
      "rule-added:ui-no-db",
      "invariant-added:money-integer",
      "decision-added:adr-1",
    ]);
  });
});

describe("diffBlueprints: policy", () => {
  it("flags lowered levels as weakened and raised levels as changed", () => {
    const lowered = diffBlueprints(withPolicy({ undeclaredDependencies: "error", unmappedFiles: "warning" }), withPolicy({ undeclaredDependencies: "info", unmappedFiles: "off" }));
    expect(lowered).toEqual([
      {
        kind: "policy-weakened",
        target: "policy.undeclaredDependencies",
        summary: 'Policy undeclaredDependencies lowered from "error" to "info"',
        weakens: true,
      },
      {
        kind: "policy-weakened",
        target: "policy.unmappedFiles",
        summary: 'Policy unmappedFiles lowered from "warning" to "off"',
        weakens: true,
      },
    ]);
    const raised = diffBlueprints(base, withPolicy({ undeclaredDependencies: "error", unmappedFiles: "warning" }));
    expect(raised.map((change) => [change.kind, change.weakens])).toEqual([
      ["policy-changed", false],
      ["policy-changed", false],
    ]);
  });

  it.each([
    ["includeTypeOnly", { includeTypeOnly: false }],
    ["tripwires.defaults", { tripwires: { defaults: false } }],
    ["verificationHeuristics", { verificationHeuristics: false }],
  ] as const)("flags %s turned off, and turned on as a plain change", (field, policy) => {
    const off = only(diffBlueprints(base, withPolicy(policy)));
    expect(off).toMatchObject({ kind: "policy-weakened", target: `policy.${field}`, weakens: true });
    const on = only(diffBlueprints(withPolicy(policy), base));
    expect(on).toMatchObject({ kind: "policy-changed", target: `policy.${field}`, weakens: false });
  });

  it("flags verificationWeakening lowered to warn, explicitly or from the default", () => {
    const warn = withPolicy({ verificationWeakening: "warn" });
    const explicit = withPolicy({ verificationWeakening: "require-approval" });
    const lowered = {
      kind: "policy-weakened",
      target: "policy.verificationWeakening",
      summary: 'Policy verificationWeakening lowered from "require-approval" to "warn": skipped, deleted or gutted tests no longer need a human approval',
      weakens: true,
    };
    expect(only(diffBlueprints(explicit, warn))).toEqual(lowered);
    // The base omits the field: its default, require-approval, is what the change is judged by.
    expect(only(diffBlueprints(base, warn))).toEqual(lowered);
    expect(only(diffBlueprints(warn, explicit))).toMatchObject({ kind: "policy-changed", target: "policy.verificationWeakening", weakens: false });
    // Writing the default out, or dropping it again, changes nothing.
    expect(diffBlueprints(base, explicit)).toEqual([]);
    expect(diffBlueprints(explicit, base)).toEqual([]);
    // Dropping an explicit "warn" restores the default: a tightening, not a weakening.
    expect(only(diffBlueprints(warn, base))).toMatchObject({ kind: "policy-changed", weakens: false });
  });

  it("flags removed tripwire paths; added ones are a plain change", () => {
    const two = withPolicy({ tripwires: { defaults: true, paths: ["infra/**", "migrations/**"] } });
    const one = withPolicy({ tripwires: { defaults: true, paths: ["infra/**"] } });
    expect(only(diffBlueprints(two, one))).toEqual({
      kind: "policy-weakened",
      target: "policy.tripwires.paths",
      summary: 'Policy tripwires no longer protect "migrations/**"',
      weakens: true,
    });
    expect(only(diffBlueprints(one, two))).toMatchObject({ kind: "policy-changed", weakens: false });
    expect(only(diffBlueprints(two, base))).toMatchObject({ kind: "policy-weakened", weakens: true });
  });

  it("flags added ignore globs; removed ones are a plain change", () => {
    const hidden = withPolicy({ ignore: ["src/legacy/**"] });
    expect(only(diffBlueprints(base, hidden))).toEqual({
      kind: "policy-weakened",
      target: "policy.ignore",
      summary: 'Policy ignore now hides "src/legacy/**" from analysis',
      weakens: true,
    });
    expect(only(diffBlueprints(hidden, base))).toMatchObject({ kind: "policy-changed", target: "policy.ignore", weakens: false });
  });

  it("emits one change per field in a fixed order", () => {
    const head = withPolicy({
      undeclaredDependencies: "off",
      unmappedFiles: "off",
      includeTypeOnly: false,
      tripwires: { defaults: false },
      verificationHeuristics: false,
      verificationWeakening: "warn",
      ignore: ["**/*.gen.ts"],
    });
    const changes = diffBlueprints(base, head);
    expect(changes.map((change) => change.target)).toEqual([
      "policy.undeclaredDependencies",
      "policy.unmappedFiles",
      "policy.includeTypeOnly",
      "policy.tripwires.defaults",
      "policy.verificationHeuristics",
      "policy.verificationWeakening",
      "policy.ignore",
    ]);
    expect(changes.every((change) => change.kind === "policy-weakened" && change.weakens)).toBe(true);
  });
});

describe("diffBlueprints: components", () => {
  it("reports added components", () => {
    const head = build({ components: [...COMPONENTS, { id: "queue", name: "Queue", paths: ["src/queue/**"] }] });
    expect(only(diffBlueprints(base, head))).toEqual({
      kind: "component-added",
      target: "queue",
      summary: 'Component "queue" added',
      weakens: false,
    });
  });

  it("flags removal of a component that a base rule references by id", () => {
    const head = build({
      components: COMPONENTS.filter((component) => component.id !== "cache"),
      rules: RULES.map((rule) => {
        if (rule.id === "ui-no-db") return { ...rule, to: ["database", "cache"].filter((entry) => entry !== "cache") } as Rules[number];
        if (rule.id === "layering") return { ...rule, layers: ["ui", "api", "database"] } as Rules[number];
        return rule;
      }),
    });
    const removal = diffBlueprints(base, head).find((change) => change.kind === "component-removed");
    expect(removal).toMatchObject({ target: "cache", weakens: true });
  });

  it("does not flag removal of an unreferenced component", () => {
    const head = build({ components: COMPONENTS.filter((component) => component.id !== "docs") });
    expect(only(diffBlueprints(base, head))).toEqual({
      kind: "component-removed",
      target: "docs",
      summary: 'Component "docs" removed',
      weakens: false,
    });
  });

  it("flags removal of a component selected by tag", () => {
    const tagOnly = build({
      components: [...COMPONENTS, { id: "worker", name: "Worker", paths: ["src/worker/**"], tags: ["backend"] }],
    });
    expect(only(diffBlueprints(tagOnly, base))).toMatchObject({ kind: "component-removed", target: "worker", weakens: true });
  });

  it("lists every changed field without weakening for cosmetic edits", () => {
    const head = withComponent("docs", {
      name: "Documentation",
      kind: "content",
      priority: 5,
      owners: ["@writers"],
      intent: "Explains the system",
      external: true,
      paths: ["docs/**", "README.md"],
    });
    const change = only(diffBlueprints(base, head));
    expect(change).toMatchObject({ kind: "component-changed", target: "docs", weakens: false });
    for (const word of ["name", "kind", "priority", "owners", "intent", "external", "paths"]) {
      expect(change.summary).toContain(word);
    }
    expect(change.summary).toContain('added "README.md"');
  });

  it("flags removed paths and added excludes only on rule-referenced components", () => {
    expect(only(diffBlueprints(base, withComponent("ui", { paths: ["src/components/**"] })))).toMatchObject({
      kind: "component-changed",
      weakens: true,
      summary: 'Component "ui" changed: paths (removed "src/app/**")',
    });
    expect(only(diffBlueprints(base, withComponent("ui", { exclude: ["src/components/legacy/**"] })))).toMatchObject({ weakens: true });
    expect(only(diffBlueprints(base, withComponent("docs", { paths: ["docs/guide/**"] })))).toMatchObject({ weakens: false });
    expect(only(diffBlueprints(base, withComponent("docs", { exclude: ["docs/internal/**"] })))).toMatchObject({ weakens: false });
    expect(only(diffBlueprints(base, withComponent("ui", { paths: ["src/components/**", "src/app/**", "src/ui/**"] })))).toMatchObject({
      weakens: false,
    });
  });

  it("flags removed tags only when a base rule selects them", () => {
    expect(only(diffBlueprints(base, withComponent("database", { tags: ["storage"] })))).toMatchObject({ weakens: true });
    expect(only(diffBlueprints(base, withComponent("database", { tags: ["backend"] })))).toMatchObject({ weakens: false });
    expect(only(diffBlueprints(base, withComponent("docs", { tags: [] })))).toMatchObject({ weakens: false });
  });

  it("flags lowered assurance from a known level only", () => {
    expect(only(diffBlueprints(base, withComponent("ui", { assurance: "untested" })))).toMatchObject({
      weakens: true,
      summary: 'Component "ui" changed: assurance tested → untested',
    });
    expect(only(diffBlueprints(base, withComponent("ui", { assurance: undefined })))).toMatchObject({ weakens: true });
    expect(only(diffBlueprints(base, withComponent("ui", { assurance: "formally-verified" })))).toMatchObject({ weakens: false });
    const unknown = withComponent("api", { assurance: "unknown" });
    expect(diffBlueprints(base, unknown)).toEqual([]);
    expect(only(diffBlueprints(unknown, withComponent("api", { assurance: "tested" })))).toMatchObject({ weakens: false });
  });
});

describe("diffBlueprints: dependencies", () => {
  const extra = [
    { from: "ui", to: "api" },
    { from: "api", to: "database" },
    { from: "api", to: "cache" },
  ];

  it("reports added and removed declared edges", () => {
    expect(only(diffBlueprints(base, build({ dependencies: extra })))).toEqual({
      kind: "dependency-added",
      target: "api->cache",
      summary: 'Dependency "api" → "cache" declared',
      weakens: false,
    });
    expect(only(diffBlueprints(build({ dependencies: extra }), base))).toMatchObject({
      kind: "dependency-removed",
      target: "api->cache",
      weakens: false,
    });
  });

  it("treats a new edge as weakening when undeclared dependencies were errors in the base", () => {
    const strict = { undeclaredDependencies: "error" } as const;
    const change = only(diffBlueprints(build({ policy: strict }), build({ policy: strict, dependencies: extra })));
    expect(change).toMatchObject({ kind: "dependency-added", weakens: true });
  });

  it("ignores edits to an existing edge's label", () => {
    const relabeled = build({ dependencies: [{ from: "ui", to: "api", label: "fetch" }, { from: "api", to: "database" }] });
    expect(diffBlueprints(base, relabeled)).toEqual([]);
  });
});

describe("diffBlueprints: rules", () => {
  it("reports added and removed rules", () => {
    const without = build({ rules: RULES.filter((rule) => rule.id !== "acyclic") });
    expect(only(diffBlueprints(base, without))).toEqual({
      kind: "rule-removed",
      target: "acyclic",
      summary: 'Rule "acyclic" (no-cycles) removed',
      weakens: true,
    });
    expect(only(diffBlueprints(without, base))).toMatchObject({ kind: "rule-added", target: "acyclic", weakens: false });
  });

  it("flags a changed kind", () => {
    const head = build({
      rules: RULES.map((rule) => (rule.id === "ui-no-db" ? { id: "ui-no-db", kind: "allow-only", from: "ui", to: ["database", "cache"] } : rule)),
    });
    expect(only(diffBlueprints(base, head))).toMatchObject({ kind: "rule-changed", target: "ui-no-db", weakens: true });
  });

  it("compares severity against per-kind defaults", () => {
    expect(only(diffBlueprints(base, withRule("ui-no-db", { severity: "warning" })))).toEqual({
      kind: "rule-weakened",
      target: "ui-no-db",
      summary: 'Rule "ui-no-db" severity lowered from "error" to "warning"',
      weakens: true,
    });
    expect(diffBlueprints(base, withRule("ui-no-db", { severity: "error" }))).toEqual([]);
    expect(diffBlueprints(base, withRule("acyclic", { severity: "warning" }))).toEqual([]);
    expect(diffBlueprints(base, withRule("guard-ci", { severity: "warning" }))).toEqual([]);
    expect(only(diffBlueprints(base, withRule("acyclic", { severity: "error" })))).toMatchObject({ kind: "rule-strengthened", weakens: false });
    expect(only(diffBlueprints(base, withRule("guard-ci", { severity: "info" })))).toMatchObject({ kind: "rule-weakened", weakens: true });
    expect(only(diffBlueprints(base, withRule("db-secret", { severity: "info" })))).toMatchObject({ kind: "rule-weakened" });
  });

  it("treats an unset includeTypeOnly as true", () => {
    expect(only(diffBlueprints(base, withRule("ui-no-db", { includeTypeOnly: false })))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "ui-no-db" no longer counts type-only imports',
    });
    expect(diffBlueprints(base, withRule("ui-no-db", { includeTypeOnly: true }))).toEqual([]);
    expect(only(diffBlueprints(withRule("layering", { includeTypeOnly: false }), base))).toMatchObject({ kind: "rule-strengthened" });
  });

  it("forbid: removed entries weaken, added entries strengthen", () => {
    expect(only(diffBlueprints(base, withRule("ui-no-db", { to: "cache" })))).toEqual({
      kind: "rule-weakened",
      target: "ui-no-db",
      summary: 'Rule "ui-no-db" no longer forbids "database"',
      weakens: true,
    });
    expect(only(diffBlueprints(base, withRule("ui-no-db", { to: ["database", "cache", "api"] })))).toMatchObject({
      kind: "rule-strengthened",
      weakens: false,
    });
    expect(only(diffBlueprints(withRule("ui-no-db", { from: ["ui", "api"] }), base))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "ui-no-db" no longer applies to "api"',
    });
  });

  it("forbid: an added exclusion weakens and both kinds of edit yield rule-weakened", () => {
    expect(only(diffBlueprints(base, withRule("ui-no-db", { to: ["database", "cache", "!path:src/cache/types.ts"] })))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "ui-no-db" now permits "path:src/cache/types.ts"',
    });
    const mixed = only(diffBlueprints(base, withRule("ui-no-db", { from: ["ui", "docs"], to: ["cache"] })));
    expect(mixed).toMatchObject({ kind: "rule-weakened", weakens: true });
    expect(mixed.summary).toContain('no longer forbids "database"');
    expect(mixed.summary).toContain('now also applies to "docs"');
  });

  it("normalizes string and array selectors", () => {
    expect(diffBlueprints(base, withRule("ui-no-db", { from: ["ui"], to: ["cache", "database"] }))).toEqual([]);
    expect(diffBlueprints(base, withRule("api-allow", { from: "api", to: "database" }))).toEqual([]);
    expect(diffBlueprints(base, withRule("db-secret", { allow: ["database"] }))).toEqual([]);
    expect(diffBlueprints(base, withRule("layering", { layers: [["ui"], "api", ["cache", "database"]] }))).toEqual([]);
  });

  it("allow-only: additions to `to` and removals from `from` weaken", () => {
    expect(only(diffBlueprints(base, withRule("api-allow", { to: ["database", "cache"] })))).toEqual({
      kind: "rule-weakened",
      target: "api-allow",
      summary: 'Rule "api-allow" now also allows "cache"',
      weakens: true,
    });
    const wide = withRule("api-allow", { from: ["api", "ui"] });
    expect(only(diffBlueprints(wide, base))).toMatchObject({ kind: "rule-weakened", summary: 'Rule "api-allow" no longer restricts "ui"' });
    expect(only(diffBlueprints(base, wide))).toMatchObject({ kind: "rule-strengthened", weakens: false });
    expect(only(diffBlueprints(withRule("api-allow", { to: ["database", "cache"] }), base))).toMatchObject({ kind: "rule-strengthened" });
  });

  it("layers: removal or reordering weakens, an extra layer strengthens", () => {
    expect(only(diffBlueprints(base, withRule("layering", { layers: ["ui", ["database", "cache"]] })))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "layering" no longer has layer "api"',
    });
    const reordered = only(diffBlueprints(base, withRule("layering", { layers: ["api", "ui", ["database", "cache"]] })));
    expect(reordered).toMatchObject({ kind: "rule-weakened", weakens: true });
    expect(reordered.summary).toContain("layer order changed");
    expect(only(diffBlueprints(base, withRule("layering", { layers: ["docs", "ui", "api", ["database", "cache"]] })))).toMatchObject({
      kind: "rule-strengthened",
    });
  });

  it("protect: removed paths weaken, added paths strengthen", () => {
    expect(only(diffBlueprints(base, withRule("guard-ci", { paths: [".github/**"] })))).toEqual({
      kind: "rule-weakened",
      target: "guard-ci",
      summary: 'Rule "guard-ci" no longer protects "scripts/release.sh"',
      weakens: true,
    });
    expect(only(diffBlueprints(base, withRule("guard-ci", { paths: [".github/**", "scripts/release.sh", "infra/**"] })))).toMatchObject({
      kind: "rule-strengthened",
    });
  });

  it("secret-access: more readers or fewer secrets weaken", () => {
    expect(only(diffBlueprints(base, withRule("db-secret", { allow: ["database", "ui"] })))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "db-secret" now also lets "ui" read the secrets',
    });
    expect(only(diffBlueprints(base, withRule("db-secret", { secrets: ["DATABASE_URL"] })))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "db-secret" no longer guards "DB_*"',
    });
    expect(only(diffBlueprints(base, withRule("db-secret", { secrets: ["DATABASE_URL", "DB_*", "REDIS_URL"] })))).toMatchObject({
      kind: "rule-strengthened",
    });
    expect(only(diffBlueprints(withRule("db-secret", { allow: ["database", "ui"] }), base))).toMatchObject({ kind: "rule-strengthened" });
  });

  it("no-cycles: a new or narrower scope weakens, dropping it strengthens", () => {
    const scoped = withRule("acyclic", { scope: ["ui", "api"] });
    expect(only(diffBlueprints(base, scoped))).toMatchObject({ kind: "rule-weakened", weakens: true });
    expect(only(diffBlueprints(scoped, base))).toMatchObject({ kind: "rule-strengthened", weakens: false });
    expect(only(diffBlueprints(scoped, withRule("acyclic", { scope: "ui" })))).toMatchObject({
      kind: "rule-weakened",
      summary: 'Rule "acyclic" scope no longer covers "api"',
    });
    expect(only(diffBlueprints(scoped, withRule("acyclic", { scope: ["ui", "api", "database"] })))).toMatchObject({ kind: "rule-strengthened" });
  });

  it("reports a reworded reason as a plain change", () => {
    expect(only(diffBlueprints(base, withRule("ui-no-db", { reason: "Because." })))).toMatchObject({ kind: "rule-changed", weakens: false });
  });
});

describe("diffBlueprints: invariants", () => {
  const invariant = { id: "money-integer", statement: "Money is stored as integer cents", components: ["database"] };
  const check = { run: "npm test -- money", tests: ["src/db/money.test.ts", "src/db/round.test.ts"] };
  const withInvariant = (patch: Record<string, unknown>): Blueprint => build({ invariants: [{ ...invariant, check, ...patch }] });

  it("reports added and removed invariants", () => {
    const none = build({ invariants: [] });
    expect(only(diffBlueprints(base, none))).toEqual({
      kind: "invariant-removed",
      target: "money-integer",
      summary: 'Invariant "money-integer" removed',
      weakens: true,
    });
    expect(only(diffBlueprints(none, base))).toMatchObject({ kind: "invariant-added", weakens: false });
  });

  it("flags a removed or changed check command and removed tests", () => {
    expect(only(diffBlueprints(base, withInvariant({ check: { tests: check.tests } })))).toMatchObject({
      kind: "invariant-changed",
      weakens: true,
      summary: 'Invariant "money-integer" changed: check command removed',
    });
    expect(only(diffBlueprints(base, withInvariant({ check: { ...check, run: "true" } })))).toMatchObject({ weakens: true });
    expect(only(diffBlueprints(base, withInvariant({ check: undefined })))).toMatchObject({ weakens: true });
    expect(only(diffBlueprints(base, withInvariant({ check: { run: check.run, tests: ["src/db/money.test.ts"] } })))).toMatchObject({
      weakens: true,
      summary: 'Invariant "money-integer" changed: no longer checked by tests "src/db/round.test.ts"',
    });
  });

  it("flags lowered severity", () => {
    expect(only(diffBlueprints(withInvariant({ severity: "error" }), withInvariant({ severity: "info" })))).toMatchObject({
      kind: "invariant-changed",
      weakens: true,
    });
    expect(only(diffBlueprints(withInvariant({ severity: "info" }), withInvariant({ severity: "warning" })))).toMatchObject({ weakens: false });
  });

  it("does not flag rewording, component edits or added checks", () => {
    expect(only(diffBlueprints(base, withInvariant({ statement: "All money is integer cents" })))).toMatchObject({
      kind: "invariant-changed",
      weakens: false,
    });
    expect(only(diffBlueprints(base, withInvariant({ components: ["database", "api"] })))).toMatchObject({ weakens: false });
    expect(only(diffBlueprints(withInvariant({ check: undefined }), base))).toMatchObject({ weakens: false });
  });
});

describe("diffBlueprints: decisions", () => {
  const decision = { id: "adr-1", title: "Use Postgres", status: "accepted", decision: "We use Postgres." } as const;

  it("reports added, removed and changed decisions without weakening", () => {
    const none = build({ decisions: [] });
    expect(only(diffBlueprints(base, none))).toEqual({ kind: "decision-removed", target: "adr-1", summary: 'Decision "adr-1" removed', weakens: false });
    expect(only(diffBlueprints(none, base))).toMatchObject({ kind: "decision-added", weakens: false });
    const changed = only(
      diffBlueprints(base, build({ decisions: [{ ...decision, status: "deprecated", title: "Use SQLite", decision: "We use SQLite." }] })),
    );
    expect(changed).toMatchObject({ kind: "decision-changed", weakens: false });
    expect(changed.summary).toContain('status "accepted" → "deprecated"');
    expect(changed.summary).toContain("title");
    expect(changed.summary).toContain("decision text");
  });

  it("ignores fields outside status, title and decision", () => {
    expect(diffBlueprints(base, build({ decisions: [{ ...decision, context: "Background", date: "2026-01-01" }] }))).toEqual([]);
  });
});

describe("diffBlueprints: verification", () => {
  const stamp = { by: "ada", at: "2026-01-01" };

  it("reports stamps added, removed and changed on every kind of target", () => {
    const signed = build({
      components: COMPONENTS.map((component) => (component.id === "api" ? { ...component, verified: stamp } : component)),
      dependencies: [
        { from: "ui", to: "api", verified: stamp },
        { from: "api", to: "database" },
      ],
      rules: RULES.map((rule) => (rule.id === "acyclic" ? ({ ...rule, verified: stamp } as Rules[number]) : rule)),
      invariants: [
        {
          id: "money-integer",
          statement: "Money is stored as integer cents",
          components: ["database"],
          check: { run: "npm test -- money", tests: ["src/db/money.test.ts", "src/db/round.test.ts"] },
          verified: stamp,
        },
      ],
    });
    const added = diffBlueprints(base, signed);
    expect(added.map((change) => [change.kind, change.target, change.weakens])).toEqual([
      ["verification-changed", "component:api", false],
      ["verification-changed", "dependency:ui->api", false],
      ["verification-changed", "rule:acyclic", false],
      ["verification-changed", "invariant:money-integer", false],
    ]);
    expect(added[0].summary).toBe('Verification of component "api" added (signed by ada at 2026-01-01)');

    const removed = diffBlueprints(signed, base);
    expect(removed).toHaveLength(4);
    expect(removed[2].summary).toBe('Verification of rule "acyclic" removed (was signed by ada at 2026-01-01)');
  });

  it("reports a re-signed stamp with both signers", () => {
    const first = withComponent("api", { verified: stamp });
    const second = withComponent("api", { verified: { by: "grace", at: "2026-02-02", commit: "abc123" } });
    expect(only(diffBlueprints(first, second))).toEqual({
      kind: "verification-changed",
      target: "component:api",
      summary: 'Verification of component "api" changed (signed by grace at 2026-02-02; previously ada at 2026-01-01)',
      weakens: false,
    });
    expect(diffBlueprints(first, withComponent("api", { verified: { at: "2026-01-01", by: "ada" } }))).toEqual([]);
  });
});

describe("diffBlueprints: ordering", () => {
  it("orders sections policy → components → dependencies → rules → invariants → decisions → verification, by id within", () => {
    const head = build({
      policy: { ignore: ["gen/**"] },
      components: [
        ...COMPONENTS.filter((component) => component.id !== "docs").map((component) =>
          component.id === "api" ? { ...component, verified: { by: "ada", at: "2026-01-01" } } : component,
        ),
        { id: "zeta", name: "Zeta", paths: ["z/**"] },
        { id: "alpha", name: "Alpha", paths: ["a/**"] },
      ],
      dependencies: [
        { from: "ui", to: "api" },
        { from: "alpha", to: "zeta" },
      ],
      rules: [...RULES.filter((rule) => rule.id !== "guard-ci"), { id: "a-new", kind: "no-cycles", scope: "ui" }],
      invariants: [],
      decisions: [],
    });
    expect(diffBlueprints(base, head).map((change) => `${change.kind}:${change.target}`)).toEqual([
      "policy-weakened:policy.ignore",
      "component-added:alpha",
      "component-removed:docs",
      "component-added:zeta",
      "dependency-added:alpha->zeta",
      "dependency-removed:api->database",
      "rule-added:a-new",
      "rule-removed:guard-ci",
      "invariant-removed:money-integer",
      "decision-removed:adr-1",
      "verification-changed:component:api",
    ]);
  });
});
