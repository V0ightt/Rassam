import { describe, it, expect } from "vitest";

import {
  applyBlueprintEdits,
  blueprintEditSchema,
  BlueprintEditError,
  describeEdits,
  editDistance,
  resolveComponentRef,
  summarizeBlueprintDelta,
  type AppliedEdit,
  type BlueprintEditInput,
} from "./edits";
import { blueprintSchema, parseBlueprint, type Blueprint, type BlueprintInput } from "./schema";

const SIGNED = { by: "sara", at: "2026-01-01" };

function build(overrides: Partial<BlueprintInput> = {}): Blueprint {
  return blueprintSchema.parse({
    version: "0.1",
    system: { name: "Shop" },
    components: [
      { id: "ui", name: "Storefront UI", kind: "component", paths: ["src/ui/**", "src/pages/**"], verified: SIGNED },
      { id: "api", name: "API", kind: "api", paths: ["src/api/**"] },
      { id: "domain", name: "Domain", kind: "core", paths: ["src/domain/**"], provenance: { source: "derived" } },
      { id: "db", name: "Database", kind: "database", paths: ["src/db/**"] },
      { id: "payments", name: "Payments", kind: "service", paths: ["src/payments/**"] },
      { id: "payouts", name: "Payouts", kind: "service", paths: ["src/payouts/**"] },
      { id: "legacy", name: "Legacy", paths: ["src/legacy/**"] },
      { id: "cli", name: "CLI", kind: "client", paths: ["src/cli/**"] },
      { id: "stripe", name: "Stripe", kind: "external-api", external: true },
    ],
    dependencies: [
      { from: "ui", to: "api", verified: SIGNED },
      { from: "api", to: "domain" },
      { from: "domain", to: "db" },
      { from: "legacy", to: "db" },
    ],
    rules: [
      { id: "ui-no-db", kind: "forbid", from: "ui", to: ["db", "legacy"], verified: SIGNED },
      { id: "legacy-box", kind: "forbid", from: "component:legacy", to: "ui" },
      { id: "api-allow", kind: "allow-only", from: "api", to: ["domain", "legacy"], verified: SIGNED },
      { id: "stack", kind: "layers", layers: ["ui", "api", ["domain", "legacy"], "db"] },
      { id: "two-layers", kind: "layers", layers: ["legacy", "db"] },
      { id: "legacy-acyclic", kind: "no-cycles", scope: ["legacy"] },
      { id: "guard", kind: "protect", paths: [".github/**", "scripts/release.sh"] },
      { id: "db-secret", kind: "secret-access", secrets: ["DATABASE_URL", "DB_*"], allow: ["db", "!legacy"] },
    ],
    invariants: [
      { id: "money-integer", statement: "Money is stored in integer cents", components: ["payments", "legacy"] },
      { id: "legacy-frozen", statement: "Legacy gets no new features", components: ["legacy"] },
    ],
    decisions: [
      { id: "ADR-001", title: "Use MySQL", status: "superseded", decision: "MySQL", supersededBy: "ADR-002", components: ["legacy"] },
      { id: "ADR-002", title: "Use Postgres", status: "accepted", decision: "Postgres", components: ["db"] },
    ],
    ...overrides,
  });
}

function apply(edits: BlueprintEditInput[], blueprint: Blueprint = build()) {
  return applyBlueprintEdits(blueprint, edits);
}

function failure(edits: unknown[], blueprint: Blueprint = build()): BlueprintEditError {
  try {
    applyBlueprintEdits(blueprint, edits as BlueprintEditInput[]);
  } catch (error) {
    if (error instanceof BlueprintEditError) return error;
    throw error;
  }
  throw new Error("expected a BlueprintEditError");
}

const component = (blueprint: Blueprint, id: string) => blueprint.components.find((item) => item.id === id);
const rule = (blueprint: Blueprint, id: string) => blueprint.rules.find((item) => item.id === id);

describe("applyBlueprintEdits: every op produces a valid blueprint", () => {
  const cases: Array<{ name: string; edit: BlueprintEditInput; weakens: boolean; summary: RegExp; targets?: string[] }> = [
    { name: "add_component", edit: { op: "add_component", name: "Billing", paths: ["src/billing/**"] }, weakens: false, summary: /Added component "Billing" \(billing\) owning src\/billing\/\*\*/, targets: ["billing"] },
    { name: "add_component external", edit: { op: "add_component", name: "Stripe API", external: true }, weakens: false, summary: /Added external component "Stripe API" \(stripe-api\)\./ },
    { name: "update_component intent", edit: { op: "update_component", id: "payments", set: { intent: "Owns charging" } }, weakens: false, summary: /Updated component "Payments": intent set/ },
    { name: "update_component public", edit: { op: "update_component", id: "domain", set: { public: true } }, weakens: true, summary: /public → true/ },
    { name: "update_component drops a path", edit: { op: "update_component", id: "ui", set: { paths: ["src/ui/**"] } }, weakens: true, summary: /paths −src\/pages\/\*\*/ },
    { name: "update_component adds a path", edit: { op: "update_component", id: "api", set: { paths: ["src/api/**", "src/rpc/**"] } }, weakens: false, summary: /paths \+src\/rpc\/\*\*/ },
    { name: "update_component adds an exclude", edit: { op: "update_component", id: "api", set: { exclude: ["src/api/generated/**"] } }, weakens: true, summary: /exclude \+src\/api\/generated/ },
    { name: "remove_component", edit: { op: "remove_component", id: "legacy" }, weakens: true, summary: /Removed component "Legacy" \(legacy\); also removed 1 declared dependency/ },
    { name: "remove_component external and unreferenced", edit: { op: "remove_component", id: "stripe" }, weakens: false, summary: /^Removed component "Stripe" \(stripe\)\.$/ },
    { name: "rename_component", edit: { op: "rename_component", id: "ui", newId: "storefront", name: "Storefront" }, weakens: false, summary: /Renamed component "Storefront UI" to "Storefront" \(ui → storefront\); updated 3 rules/ },
    { name: "declare_dependency", edit: { op: "declare_dependency", from: "payments", to: "stripe", kind: "calls" }, weakens: false, summary: /Declared that "Payments" depends on "Stripe" \(calls\)/, targets: ["payments", "stripe", "payments->stripe"] },
    { name: "remove_dependency", edit: { op: "remove_dependency", from: "ui", to: "api" }, weakens: false, summary: /Removed the declared dependency "Storefront UI" → "API"/ },
    { name: "forbid_dependency", edit: { op: "forbid_dependency", from: "ui", to: "payments", reason: "Go through the API" }, weakens: false, summary: /Forbade "Storefront UI" from depending on "Payments" \(rule forbid-ui-payments\)/, targets: ["forbid-ui-payments", "ui", "payments"] },
    { name: "forbid_dependency package", edit: { op: "forbid_dependency", from: ["*", "!api"], to: "package:pg" }, weakens: false, summary: /Forbade everything except "API" from depending on package pg \(rule forbid-any-pg\)/ },
    { name: "allow_only", edit: { op: "allow_only", from: "domain", to: ["db", "package:node:*"] }, weakens: false, summary: /Restricted "Domain" to depend only on "Database" and package node:\* \(rule allow-only-domain\)/ },
    { name: "set_layers", edit: { op: "set_layers", layers: ["ui", "api", "db"] }, weakens: false, summary: /Set layers, top to bottom: "Storefront UI" → "API" → "Database" \(rule layers\)/ },
    { name: "forbid_cycles", edit: { op: "forbid_cycles" }, weakens: false, summary: /Forbade dependency cycles between components \(rule no-cycles\)/ },
    { name: "forbid_cycles scoped", edit: { op: "forbid_cycles", scope: ["api", "domain"] }, weakens: false, summary: /within "API" and "Domain" \(rule no-cycles-api-domain\)/ },
    { name: "protect_paths", edit: { op: "protect_paths", paths: ["src/security/**", "next.config.ts"] }, weakens: false, summary: /Protected src\/security\/\*\* and next\.config\.ts: changes there require human review \(rule protect-src-security\)/ },
    { name: "restrict_secret", edit: { op: "restrict_secret", secrets: ["STRIPE_*"], allow: "payments" }, weakens: false, summary: /Restricted STRIPE_\* so that only "Payments" may read them \(rule secret-stripe-payments\)/ },
    { name: "update_rule reason", edit: { op: "update_rule", id: "ui-no-db", set: { reason: "UI goes through the API" } }, weakens: false, summary: /Updated rule ui-no-db: reason set\.$/ },
    { name: "remove_rule", edit: { op: "remove_rule", id: "ui-no-db" }, weakens: true, summary: /Removed the forbid rule ui-no-db/ },
    { name: "add_invariant", edit: { op: "add_invariant", statement: "Totals never go negative", run: "npm test", components: ["payments"] }, weakens: false, summary: /Added invariant totals-never-go-negative: "Totals never go negative", checked by `npm test`/ },
    { name: "remove_invariant", edit: { op: "remove_invariant", id: "money-integer" }, weakens: true, summary: /Removed invariant money-integer/ },
    { name: "add_decision", edit: { op: "add_decision", title: "Use queues", decision: "Use SQS", context: "Spiky load" }, weakens: false, summary: /Recorded decision ADR-003 \(accepted\): "Use queues"/, targets: ["ADR-003"] },
    { name: "remove_decision", edit: { op: "remove_decision", id: "ADR-002" }, weakens: false, summary: /Removed decision ADR-002: "Use Postgres"; ADR-001 no longer points to it/ },
    { name: "set_policy tighten", edit: { op: "set_policy", undeclaredDependencies: "error", unmappedFiles: "warning" }, weakens: false, summary: /undeclared dependencies warning → error; unmapped files info → warning/ },
    { name: "set_policy loosen", edit: { op: "set_policy", undeclaredDependencies: "off" }, weakens: true, summary: /warning → off/ },
    { name: "set_policy ignore", edit: { op: "set_policy", ignoreAdd: ["fixtures/**"] }, weakens: true, summary: /now ignoring fixtures\/\*\*/ },
    { name: "set_policy heuristics off", edit: { op: "set_policy", verificationHeuristics: false, includeTypeOnly: false }, weakens: true, summary: /type-only imports ignored; verification heuristics off/ },
    { name: "set_policy tests only warn", edit: { op: "set_policy", verificationWeakening: "warn" }, weakens: true, summary: /weakened tests only warn/ },
    { name: "set_runtime", edit: { op: "set_runtime", id: "api", health: { url: "https://api.example.com/health", expectStatus: 200 }, deployment: { environment: "production" }, workflow: { file: ".github/workflows/deploy.yml" } }, weakens: false, summary: /Set runtime of "API": health check GET https:\/\/api\.example\.com\/health expecting 200; deployed to environment production; workflow \.github\/workflows\/deploy\.yml/ },
  ];

  it.each(cases)("$name", ({ edit, weakens, summary, targets }) => {
    const before = build();
    const snapshot = JSON.stringify(before);
    const result = applyBlueprintEdits(before, [edit]);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(parseBlueprint(JSON.parse(JSON.stringify(result.blueprint))).ok).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].index).toBe(0);
    expect(result.applied[0].op).toBe(edit.op);
    expect(result.applied[0].summary).toMatch(summary);
    expect(result.applied[0].weakens).toBe(weakens);
    for (const target of targets ?? []) expect(result.applied[0].targets).toContain(target);
    expect(result.blueprint).not.toBe(before);
  });

  it("covers every op in the schema", () => {
    const ops = blueprintEditSchema.options.map((option) => option.shape.op.value).sort();
    expect([...new Set(cases.map((item) => item.edit.op))].sort()).toEqual(ops);
    expect(ops).toHaveLength(20);
  });
});

describe("components", () => {
  it("derives a unique id from the name and stamps provenance", () => {
    const { blueprint } = applyBlueprintEdits(build(), [
      { op: "add_component", name: "Payments!", paths: ["src/pay2/**"], kind: "service", tags: ["money"], owners: ["@fin"], intent: "Second payments path" },
    ], { provenance: { source: "agent", by: "claude" }, now: "2026-11-22T10:00:00Z" });
    const added = component(blueprint, "payments-2");
    expect(added).toMatchObject({ name: "Payments!", kind: "service", tags: ["money"], owners: ["@fin"], intent: "Second payments path" });
    expect(added?.provenance).toEqual({ source: "agent", by: "claude", at: "2026-11-22T10:00:00Z" });
    expect(added?.verified).toBeUndefined();
  });

  it("defaults provenance to human without inventing a timestamp", () => {
    const { blueprint } = apply([{ op: "add_component", name: "Billing", paths: ["src/billing/**"] }, { op: "forbid_dependency", from: "billing", to: "db" }, { op: "declare_dependency", from: "billing", to: "api" }]);
    expect(component(blueprint, "billing")?.provenance).toEqual({ source: "human" });
    expect(rule(blueprint, "forbid-billing-db")?.provenance).toEqual({ source: "human" });
    expect(blueprint.dependencies.find((item) => item.from === "billing")?.provenance).toEqual({ source: "human" });
  });

  it("leaves the provenance of existing facts alone", () => {
    const { blueprint } = apply([{ op: "update_component", id: "domain", set: { intent: "Business rules" } }]);
    expect(component(blueprint, "domain")?.provenance).toEqual({ source: "derived" });
  });

  it("clears optional fields with null", () => {
    const start = apply([{ op: "update_component", id: "api", set: { tags: ["a"], description: "d", priority: 5, assurance: "tested" } }]).blueprint;
    const { blueprint } = apply([{ op: "update_component", id: "api", set: { tags: null, description: null, priority: null, assurance: null } }], start);
    expect(component(blueprint, "api")).toEqual(component(build(), "api"));
  });

  it("removes the verified stamp when paths or kind change, and says so", () => {
    for (const set of [{ paths: ["src/ui/**", "src/pages/**", "src/widgets/**"] }, { kind: "route" }, { exclude: ["src/ui/gen/**"] }]) {
      const { blueprint, applied } = apply([{ op: "update_component", id: "ui", set }]);
      expect(component(blueprint, "ui")?.verified).toBeUndefined();
      expect(applied[0].summary).toMatch(/Removed the verified stamp by sara because what it covers changed/);
    }
  });

  it("keeps the verified stamp for cosmetic changes", () => {
    const { blueprint, applied } = apply([{ op: "update_component", id: "ui", set: { intent: "Renders the shop", name: "Shop UI", tags: ["web"], owners: ["@web"] } }]);
    expect(component(blueprint, "ui")?.verified).toEqual(SIGNED);
    expect(applied[0].summary).not.toMatch(/verified/);
    expect(applied[0].weakens).toBe(false);
  });

  it("rename rewrites every reference and keeps stamps", () => {
    const { blueprint, applied } = apply([{ op: "rename_component", id: "legacy", newId: "old-shop", name: "Old shop" }]);
    expect(JSON.stringify(blueprint)).not.toMatch(/"legacy"|component:legacy|!legacy/);
    expect(component(blueprint, "old-shop")?.name).toBe("Old shop");
    expect(blueprint.dependencies).toContainEqual({ from: "old-shop", to: "db" });
    expect(rule(blueprint, "ui-no-db")).toMatchObject({ to: ["db", "old-shop"], verified: SIGNED });
    expect(rule(blueprint, "legacy-box")).toMatchObject({ from: "component:old-shop" });
    expect(rule(blueprint, "stack")).toMatchObject({ layers: ["ui", "api", ["domain", "old-shop"], "db"] });
    expect(rule(blueprint, "legacy-acyclic")).toMatchObject({ scope: ["old-shop"] });
    expect(rule(blueprint, "db-secret")).toMatchObject({ allow: ["db", "!old-shop"] });
    expect(blueprint.invariants.map((item) => item.components)).toEqual([["payments", "old-shop"], ["old-shop"]]);
    expect(blueprint.decisions[0].components).toEqual(["old-shop"]);
    expect(applied[0].targets).toEqual(expect.arrayContaining(["legacy", "old-shop", "ui-no-db", "stack", "money-integer", "ADR-001"]));
  });

  it("rename with only a name keeps the id", () => {
    const { blueprint, applied } = apply([{ op: "rename_component", id: "ui", name: "Shop front" }]);
    expect(component(blueprint, "ui")?.name).toBe("Shop front");
    expect(applied[0].summary).toBe("Renamed component \"Storefront UI\" to \"Shop front\".");
  });

  it("remove strips the component from rules, invariants and decisions", () => {
    const { blueprint, applied } = apply([{ op: "remove_component", id: "legacy" }]);
    expect(component(blueprint, "legacy")).toBeUndefined();
    expect(blueprint.dependencies.some((item) => item.from === "legacy" || item.to === "legacy")).toBe(false);
    // stripped
    expect(rule(blueprint, "ui-no-db")).toMatchObject({ to: ["db"] });
    expect(rule(blueprint, "api-allow")).toMatchObject({ to: ["domain"] });
    expect(rule(blueprint, "stack")).toMatchObject({ layers: ["ui", "api", ["domain"], "db"] });
    expect(rule(blueprint, "db-secret")).toMatchObject({ allow: ["db"] });
    // nothing left to constrain → removed and reported
    expect(rule(blueprint, "legacy-box")).toBeUndefined();
    expect(rule(blueprint, "two-layers")).toBeUndefined();
    expect(rule(blueprint, "legacy-acyclic")).toBeUndefined();
    expect(applied[0].summary).toMatch(/removed rules legacy-box, two-layers and legacy-acyclic \(nothing left to constrain\)/);
    expect(applied[0].summary).toMatch(/stripped it from rules ui-no-db, api-allow, stack and db-secret/);
    // a verified rule whose meaning changed loses its stamp
    expect(rule(blueprint, "ui-no-db")?.verified).toBeUndefined();
    expect(applied[0].summary).toMatch(/cleared the verified stamp on ui-no-db and api-allow/);
    expect(blueprint.invariants.map((item) => item.components)).toEqual([["payments"], undefined]);
    expect(blueprint.decisions[0].components).toBeUndefined();
    expect(applied[0].targets).toEqual(expect.arrayContaining(["legacy", "legacy-box", "ui-no-db", "money-integer", "legacy-frozen", "ADR-001"]));
    expect(applied[0].weakens).toBe(true);
  });
});

describe("rules", () => {
  it("makes generated rule ids unique and honours explicit ids", () => {
    const { blueprint } = apply([
      { op: "forbid_dependency", from: "ui", to: "payments" },
      { op: "forbid_dependency", from: "ui", to: "payments", includeTypeOnly: false, severity: "warning" },
      { op: "forbid_dependency", from: "path:src/ui/**", to: "package:openai", id: "ui-no-llm" },
    ]);
    expect(rule(blueprint, "forbid-ui-payments")).toMatchObject({ kind: "forbid", from: "ui", to: "payments" });
    expect(rule(blueprint, "forbid-ui-payments-2")).toMatchObject({ includeTypeOnly: false, severity: "warning" });
    expect(rule(blueprint, "ui-no-llm")).toMatchObject({ from: "path:src/ui/**", to: "package:openai" });
  });

  const updates: Array<{ name: string; id: string; set: Record<string, unknown>; weakens: boolean; unverified?: boolean }> = [
    { name: "lower severity", id: "ui-no-db", set: { severity: "warning" }, weakens: true, unverified: true },
    { name: "raise severity", id: "guard", set: { severity: "error" }, weakens: false },
    { name: "lower default severity of a protect rule", id: "guard", set: { severity: "info" }, weakens: true },
    { name: "drop a forbid target", id: "ui-no-db", set: { to: "db" }, weakens: true, unverified: true },
    { name: "add a forbid target", id: "ui-no-db", set: { to: ["db", "legacy", "payments"] }, weakens: false, unverified: true },
    { name: "narrow a forbid source with an exclusion", id: "legacy-box", set: { from: ["legacy", "!path:src/legacy/x/**"] }, weakens: true },
    { name: "ignore type-only imports", id: "ui-no-db", set: { includeTypeOnly: false }, weakens: true, unverified: true },
    { name: "widen an allow-only target", id: "api-allow", set: { to: ["domain", "legacy", "db"] }, weakens: true, unverified: true },
    { name: "tighten an allow-only target", id: "api-allow", set: { to: ["domain"] }, weakens: false, unverified: true },
    { name: "remove a layer", id: "stack", set: { layers: ["ui", "api", "db"] }, weakens: true },
    { name: "insert a layer", id: "two-layers", set: { layers: ["legacy", "domain", "db"] }, weakens: false },
    { name: "unprotect a path", id: "guard", set: { paths: [".github/**"] }, weakens: true },
    { name: "protect one more path", id: "guard", set: { paths: [".github/**", "scripts/release.sh", "Dockerfile"] }, weakens: false },
    { name: "let another component read a secret", id: "db-secret", set: { allow: ["db", "api"] }, weakens: true },
    { name: "cover fewer secrets", id: "db-secret", set: { secrets: ["DATABASE_URL"] }, weakens: true },
    { name: "widen a cycle scope to everything", id: "legacy-acyclic", set: { scope: null }, weakens: false },
    { name: "narrow a cycle scope", id: "legacy-acyclic", set: { scope: ["db"] }, weakens: true },
    { name: "reword the reason", id: "api-allow", set: { reason: "API owns orchestration" }, weakens: false, unverified: false },
  ];

  it.each(updates)("update_rule: $name", ({ id, set, weakens, unverified }) => {
    const before = build();
    const { blueprint, applied } = applyBlueprintEdits(before, [{ op: "update_rule", id, set } as BlueprintEditInput]);
    expect(applied[0].weakens).toBe(weakens);
    expect(applied[0].targets).toEqual([id]);
    expect(rule(blueprint, id)).toMatchObject(Object.fromEntries(Object.entries(set).filter(([, value]) => value !== null)));
    if (unverified !== undefined) {
      expect(rule(blueprint, id)?.verified === undefined).toBe(unverified);
      expect(/Removed the verified stamp by sara because what it enforces changed/.test(applied[0].summary)).toBe(unverified);
    }
  });

  it("update_rule rejects fields the rule kind does not have", () => {
    const error = failure([{ op: "update_rule", id: "guard", set: { from: "ui" } }]);
    expect(error.message).toMatch(/Rule "guard" is a protect rule and has no "from" field\. It accepts severity, reason and paths/);
    expect(error.suggestions).toEqual(["severity", "reason", "paths"]);
    expect(failure([{ op: "update_rule", id: "ui-no-db", set: { layers: ["ui", "db"] } }]).message).toMatch(/no "layers" field/);
    expect(failure([{ op: "update_rule", id: "db-secret", set: { scope: "db" } }]).message).toMatch(/no "scope" field/);
  });

  it("refuses a second global no-cycles rule", () => {
    const once = apply([{ op: "forbid_cycles" }]).blueprint;
    expect(failure([{ op: "forbid_cycles" }], once).message).toMatch(/Rule "no-cycles" already forbids dependency cycles/);
  });
});

describe("invariants, decisions, policy, runtime", () => {
  it("numbers decisions after the highest ADR and uses now for the date", () => {
    const { blueprint } = applyBlueprintEdits(build(), [
      { op: "add_decision", title: "A", decision: "a" },
      { op: "add_decision", title: "B", decision: "b", status: "proposed", date: "2025-05-05", components: ["db"] },
    ], { now: "2026-11-22T10:00:00Z" });
    expect(blueprint.decisions.slice(2)).toMatchObject([
      { id: "ADR-003", status: "accepted", date: "2026-11-22", provenance: { source: "human", at: "2026-11-22T10:00:00Z" } },
      { id: "ADR-004", status: "proposed", date: "2025-05-05", components: ["db"] },
    ]);
    expect(apply([{ op: "add_decision", title: "First", decision: "x" }], build({ decisions: [] })).blueprint.decisions[0].id).toBe("ADR-001");
  });

  it("stores invariant checks", () => {
    const { blueprint } = apply([{ op: "add_invariant", statement: "Orders have owners", tests: ["src/orders/*.test.ts"], severity: "warning" }]);
    expect(blueprint.invariants[2]).toEqual({
      id: "orders-have-owners",
      statement: "Orders have owners",
      check: { tests: ["src/orders/*.test.ts"] },
      severity: "warning",
      provenance: { source: "human" },
    });
  });

  it("edits the ignore list both ways", () => {
    const ignoring = apply([{ op: "set_policy", ignoreAdd: ["fixtures/**", "vendor/**", "fixtures/**"] }]).blueprint;
    expect(ignoring.policy.ignore).toEqual(["fixtures/**", "vendor/**"]);
    const { blueprint, applied } = apply([{ op: "set_policy", ignoreRemove: ["vendor/**"] }], ignoring);
    expect(blueprint.policy.ignore).toEqual(["fixtures/**"]);
    expect(applied[0].weakens).toBe(false);
    expect(failure([{ op: "set_policy", ignoreRemove: ["nope/**"] }], ignoring).message).toMatch(/nope\/\*\* is not in the ignore list/);
  });

  it("writes and clears runtime as a plain object", () => {
    const first = apply([{ op: "set_runtime", id: "api", health: { url: "https://api.example.com/health", method: "HEAD" }, deployment: { environment: "prod" } }]).blueprint;
    expect((component(first, "api") as Record<string, unknown>).runtime).toEqual({
      health: { url: "https://api.example.com/health", method: "HEAD" },
      deployment: { environment: "prod" },
    });
    const second = apply([{ op: "set_runtime", id: "api", health: null }], first).blueprint;
    expect((component(second, "api") as Record<string, unknown>).runtime).toEqual({ deployment: { environment: "prod" } });
    const third = apply([{ op: "set_runtime", id: "api", deployment: null }], second).blueprint;
    expect("runtime" in (component(third, "api") as object)).toBe(false);
  });
});

describe("errors, atomicity and purity", () => {
  const errors: Array<{ name: string; edits: unknown[]; index?: number; op?: string; message: RegExp; suggestions?: string[] }> = [
    { name: "unknown component", edits: [{ op: "update_component", id: "payment", set: { kind: "api" } }], op: "update_component", message: /There is no component "payment"\. Did you mean "payments"/, suggestions: ["payments"] },
    { name: "unknown component on remove", edits: [{ op: "remove_component", id: "legasy" }], message: /no component "legasy"/, suggestions: ["legacy"] },
    { name: "unknown rule", edits: [{ op: "remove_rule", id: "ui-no-bd" }], message: /There is no rule "ui-no-bd"\. Did you mean "ui-no-db"/, suggestions: ["ui-no-db"] },
    { name: "unknown selector component", edits: [{ op: "forbid_dependency", from: "ui", to: "databse" }], message: /"databse" in to is not a component/ },
    { name: "unknown layer component", edits: [{ op: "set_layers", layers: ["ui", ["api", "nope"]] }], message: /"nope" in layer 2 is not a component/ },
    { name: "duplicate component id", edits: [{ op: "add_component", id: "ui", name: "Other", paths: ["x/**"] }], message: /A component with id "ui" already exists/ },
    { name: "component without paths", edits: [{ op: "add_component", name: "Ghost" }], message: /needs at least one path glob, or mark it external/ },
    { name: "removing every path", edits: [{ op: "update_component", id: "api", set: { paths: [] } }], message: /would make the blueprint invalid: .*owns no paths/ },
    { name: "no-op update", edits: [{ op: "update_component", id: "api", set: { kind: "api" } }], message: /Nothing to change/ },
    { name: "empty rename", edits: [{ op: "rename_component", id: "ui" }], message: /needs a newId, a name, or both/ },
    { name: "rename collision", edits: [{ op: "rename_component", id: "ui", newId: "api" }], message: /a component with that id already exists/ },
    { name: "self dependency", edits: [{ op: "declare_dependency", from: "ui", to: "ui" }], message: /cannot declare a dependency on itself/ },
    { name: "duplicate dependency", edits: [{ op: "declare_dependency", from: "ui", to: "api" }], message: /"Storefront UI" → "API" is already declared/ },
    { name: "missing dependency", edits: [{ op: "remove_dependency", from: "ui", to: "db" }], message: /No dependency from "Storefront UI" to "Database" is declared/, suggestions: ["ui->api"] },
    { name: "duplicate rule id", edits: [{ op: "protect_paths", id: "guard", paths: ["x"] }], message: /A rule with id "guard" already exists/ },
    { name: "unknown invariant", edits: [{ op: "remove_invariant", id: "money-int" }], message: /no invariant "money-int"/, suggestions: ["money-integer"] },
    { name: "unknown decision", edits: [{ op: "remove_decision", id: "ADR-009" }], message: /no decision "ADR-009"/ },
    { name: "invariant about an unknown component", edits: [{ op: "add_invariant", statement: "x", components: ["nope"] }], message: /no component "nope"/ },
    { name: "empty policy", edits: [{ op: "set_policy" }], message: /Nothing to change: the policy/ },
    { name: "runtime with a bad url", edits: [{ op: "set_runtime", id: "api", health: { url: "ftp://x" } }], op: "set_runtime", message: /not a valid edit: health\.url/ },
    { name: "reserved component id", edits: [{ op: "add_component", id: "path:x", name: "X", paths: ["x/**"] }], message: /collides with selector syntax/ },
    { name: "unknown op", edits: [{ op: "forbid_dependancy", from: "ui", to: "db" }], op: "forbid_dependancy", message: /not a valid edit/, suggestions: ["forbid_dependency"] },
    { name: "unknown field (strict)", edits: [{ op: "remove_rule", id: "guard", force: true }], message: /not a valid edit/ },
    { name: "error index points at the failing edit", edits: [{ op: "forbid_cycles" }, { op: "remove_rule", id: "guard" }, { op: "remove_rule", id: "guard" }], index: 2, op: "remove_rule", message: /no rule "guard"/ },
  ];

  it.each(errors)("$name", ({ edits, index, op, message, suggestions }) => {
    const before = build();
    const snapshot = JSON.stringify(before);
    const error = failure(edits, before);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BlueprintEditError");
    expect(error.message).toMatch(message);
    expect(error.index).toBe(index ?? 0);
    if (op) expect(error.op).toBe(op);
    if (suggestions) expect(error.suggestions).toEqual(suggestions);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("is atomic: a late failure applies nothing", () => {
    const before = build();
    const snapshot = JSON.stringify(before);
    expect(() => applyBlueprintEdits(before, [{ op: "remove_rule", id: "guard" }, { op: "add_component", name: "Billing", paths: ["src/billing/**"] }, { op: "remove_rule", id: "missing" }])).toThrow(BlueprintEditError);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("never shares structure with its input or its edits", () => {
    const before = build();
    const paths = ["src/billing/**"];
    const { blueprint } = applyBlueprintEdits(before, [{ op: "add_component", name: "Billing", paths }]);
    paths.push("mutated");
    blueprint.components[0].paths.push("mutated");
    expect(component(blueprint, "billing")?.paths).toEqual(["src/billing/**"]);
    expect(before.components[0].paths).toEqual(["src/ui/**", "src/pages/**"]);
  });

  it("reports an invalid starting blueprint without blaming an edit", () => {
    const broken = build();
    broken.dependencies.push({ from: "ui", to: "ghost" });
    const error = failure([{ op: "forbid_cycles" }], broken);
    expect(error.index).toBe(-1);
    expect(error.issues?.[0].message).toMatch(/Unknown component "ghost"/);
  });

  it("applies edits in order, each seeing the previous one", () => {
    const { blueprint, applied } = apply([
      { op: "add_component", name: "Billing", paths: ["src/billing/**"] },
      { op: "rename_component", id: "billing", newId: "invoicing", name: "Invoicing" },
      { op: "forbid_dependency", from: "invoicing", to: "db" },
      { op: "remove_component", id: "invoicing" },
    ]);
    expect(applied.map((item) => item.index)).toEqual([0, 1, 2, 3]);
    expect(blueprint.rules.some((item) => item.id === "forbid-invoicing-db")).toBe(false);
    expect(blueprint.components.some((item) => item.id === "invoicing")).toBe(false);
  });

  it("does nothing for an empty list", () => {
    const before = build();
    const { blueprint, applied } = applyBlueprintEdits(before, []);
    expect(applied).toEqual([]);
    expect(blueprint).toEqual(before);
    expect(blueprint).not.toBe(before);
  });
});

describe("describeEdits and summarizeBlueprintDelta", () => {
  it("describes applied edits and counts the weakening ones", () => {
    const { applied } = apply([{ op: "forbid_cycles" }, { op: "remove_rule", id: "guard" }]);
    expect(describeEdits(applied)).toBe(
      ["1. Forbade dependency cycles between components (rule no-cycles).", "2. Removed the protect rule guard. [weakens the contract]", "2 changes, 1 of which weakens the contract."].join("\n"),
    );
    expect(describeEdits([])).toBe("No changes.");
    const one: AppliedEdit[] = [{ index: 0, op: "forbid_cycles", summary: "S.", targets: [], weakens: false }];
    expect(describeEdits(one)).toBe("1. S.\n1 change.");
  });

  it("summarizes a delta for previews", () => {
    const before = build();
    const { blueprint } = apply([
      { op: "add_component", name: "Billing", paths: ["src/billing/**"] },
      { op: "remove_component", id: "stripe" },
      { op: "update_component", id: "api", set: { intent: "Routes" } },
      { op: "forbid_dependency", from: "billing", to: "db" },
      { op: "remove_rule", id: "guard" },
      { op: "update_rule", id: "stack", set: { severity: "warning" } },
      { op: "declare_dependency", from: "billing", to: "api" },
      { op: "remove_dependency", from: "legacy", to: "db" },
      { op: "add_invariant", id: "inv", statement: "x" },
      { op: "remove_decision", id: "ADR-002" },
      { op: "set_policy", undeclaredDependencies: "error", ignoreAdd: ["fixtures/**"] },
    ], before);
    expect(summarizeBlueprintDelta(before, blueprint)).toEqual({
      componentsAdded: ["billing"],
      componentsRemoved: ["stripe"],
      componentsChanged: ["api"],
      rulesAdded: ["forbid-billing-db"],
      rulesRemoved: ["guard"],
      rulesChanged: ["stack"],
      dependenciesAdded: ["billing -> api"],
      dependenciesRemoved: ["legacy -> db"],
      other: [
        "invariant added: inv",
        "decision removed: ADR-002",
        "decision changed: ADR-001",
        "policy.undeclaredDependencies: warning → error",
        "policy.ignore added: fixtures/**",
      ],
    });
    const same = summarizeBlueprintDelta(before, before);
    expect(Object.values(same).every((items) => items.length === 0)).toBe(true);
  });
});

describe("resolveComponentRef", () => {
  const cases: Array<[string, { id: string } | { candidates: string[] }]> = [
    ["ui", { id: "ui" }],
    ["the UI", { id: "ui" }],
    ["Storefront UI", { id: "ui" }],
    ["storefront ui", { id: "ui" }],
    ["\"Storefront UI\"", { id: "ui" }],
    ["storefront-ui", { id: "ui" }],
    ["db", { id: "db" }],
    ["the database", { id: "db" }],
    ["storage", { id: "db" }],
    ["payments", { id: "payments" }],
    ["the payments component", { id: "payments" }],
    ["component legacy", { id: "legacy" }],
    ["frontend", { candidates: ["ui", "cli"] }],
    ["services", { candidates: ["payments", "payouts"] }],
    ["pay", { candidates: ["payments", "payouts"] }],
    ["store", { id: "ui" }],
    ["strip", { id: "stripe" }],
    ["legasy", { id: "legacy" }],
    ["paymints", { id: "payments" }],
    ["dom", { id: "domain" }],
    ["warehouse", { candidates: [] }],
    ["zz", { candidates: [] }],
    ["", { candidates: [] }],
  ];
  it.each(cases)("%s", (text, expected) => {
    expect(resolveComponentRef(build(), text)).toEqual(expected);
  });

  it("uses kind words only when no id or name matches", () => {
    const blueprint = build({
      components: [
        { id: "web", name: "Web app", kind: "route", paths: ["app/**"] },
        { id: "pg", name: "Postgres", kind: "database", paths: ["db/**"] },
        { id: "rest", name: "REST layer", kind: "api", paths: ["api/**"] },
        { id: "specs", name: "Specs", kind: "test", paths: ["test/**"] },
      ],
      dependencies: [],
      rules: [],
      invariants: [],
      decisions: [],
    });
    expect(resolveComponentRef(blueprint, "the UI")).toEqual({ id: "web" });
    expect(resolveComponentRef(blueprint, "db")).toEqual({ id: "pg" });
    expect(resolveComponentRef(blueprint, "the api")).toEqual({ id: "rest" });
    expect(resolveComponentRef(blueprint, "tests")).toEqual({ id: "specs" });
  });

  it("computes edit distance", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
