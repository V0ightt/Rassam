import { describe, it, expect } from "vitest";

import { applyBlueprintEdits, type BlueprintEdit } from "./edits";
import { INTENT_EXAMPLES, parseIntent, suggestIntents } from "./intent";
import { blueprintSchema, parseBlueprint, type Blueprint, type BlueprintInput } from "./schema";

function build(overrides: Partial<BlueprintInput> = {}): Blueprint {
  return blueprintSchema.parse({
    version: "0.1",
    system: { name: "Shop" },
    components: [
      { id: "ui", name: "Storefront UI", kind: "component", paths: ["src/ui/**"] },
      { id: "api", name: "API", kind: "api", paths: ["src/api/**"], intent: "HTTP routes" },
      { id: "domain", name: "Domain", kind: "core", paths: ["src/domain/**"], intent: "Business rules" },
      { id: "db", name: "Database", kind: "database", paths: ["src/db/**"], intent: "Persistence" },
      { id: "infra", name: "Infra", kind: "service", paths: ["src/infra/**"], intent: "Adapters" },
      { id: "util", name: "Util", kind: "utility", paths: ["src/util/**"], intent: "Helpers" },
      { id: "shared", name: "Shared", kind: "utility", paths: ["src/shared/**"], intent: "Contracts" },
      { id: "payments", name: "Payments", kind: "service", paths: ["src/payments/**"] },
      { id: "payouts", name: "Payouts", kind: "service", paths: ["src/payouts/**"] },
      { id: "legacy", name: "Legacy", paths: ["src/legacy/**", "src/old/**"], intent: "Frozen" },
      { id: "cli", name: "CLI", kind: "client", paths: ["src/cli/**"], intent: "Commands" },
      { id: "engine", name: "Rules engine", kind: "core", paths: ["src/engine/**"], intent: "Pure rules" },
      { id: "stripe", name: "Stripe", kind: "external-api", external: true, intent: "Card processor" },
    ],
    dependencies: [
      { from: "ui", to: "api" },
      { from: "api", to: "domain" },
      { from: "domain", to: "db" },
    ],
    rules: [
      { id: "ui-no-db", kind: "forbid", from: "ui", to: "db" },
      { id: "guard-ci", kind: "protect", paths: [".github/**"] },
    ],
    invariants: [{ id: "money-integer", statement: "Money is stored in integer cents" }],
    decisions: [
      { id: "ADR-001", title: "Use MySQL", status: "superseded", decision: "MySQL", supersededBy: "ADR-002" },
      { id: "ADR-002", title: "Use Postgres", status: "accepted", decision: "Postgres" },
    ],
    ...overrides,
  });
}

type Expected = Array<Record<string, unknown>>;

const PHRASES: Array<[string, Expected]> = [
  // ── forbid ──
  ["forbid ui from importing db", [{ op: "forbid_dependency", from: "ui", to: "db" }]],
  ["Forbid the UI from importing the database.", [{ op: "forbid_dependency", from: "ui", to: "db" }]],
  ["please forbid \"Storefront UI\" from importing payments!", [{ op: "forbid_dependency", from: "ui", to: "payments" }]],
  ["ui must not depend on infra", [{ op: "forbid_dependency", from: "ui", to: "infra" }]],
  ["block ui -> db", [{ op: "forbid_dependency", from: "ui", to: "db" }]],
  ["ban ui → infra", [{ op: "forbid_dependency", from: "ui", to: "infra" }]],
  ["nothing in src/ui may import src/db/**", [{ op: "forbid_dependency", from: "path:src/ui/**", to: "path:src/db/**" }]],
  ["ui can't use package openai", [{ op: "forbid_dependency", from: "ui", to: "package:openai" }]],
  ["ui must not import node:fs", [{ op: "forbid_dependency", from: "ui", to: "package:node:fs" }]],
  ["ui must not import @prisma/client", [{ op: "forbid_dependency", from: "ui", to: "package:@prisma/client" }]],
  ["the engine cannot use node built-ins", [{ op: "forbid_dependency", from: "engine", to: "package:node:*" }]],
  [
    "forbid ui from importing db because the UI goes through the API",
    [{ op: "forbid_dependency", from: "ui", to: "db", reason: "The UI goes through the API" }],
  ],
  ["prevent Storefront UI from using payments and payouts", [{ op: "forbid_dependency", from: "ui", to: ["payments", "payouts"] }]],
  ["the api should never call legacy", [{ op: "forbid_dependency", from: "api", to: "legacy" }]],
  ["don't let ui import infra", [{ op: "forbid_dependency", from: "ui", to: "infra" }]],
  ["keep domain away from infra", [{ op: "forbid_dependency", from: "domain", to: "infra" }]],
  ["ui cannot import db as a warning", [{ op: "forbid_dependency", from: "ui", to: "db", severity: "warning" }]],
  ["ui must not import domain, except type imports", [{ op: "forbid_dependency", from: "ui", to: "domain", includeTypeOnly: false }]],
  ["nobody may import package lodash", [{ op: "forbid_dependency", from: "*", to: "package:lodash" }]],
  ["only api may import db", [{ op: "forbid_dependency", from: ["*", "!api", "!db"], to: "db" }]],
  ["nothing except api may use db", [{ op: "forbid_dependency", from: ["*", "!api"], to: "db" }]],
  ["everything except api must not import db", [{ op: "forbid_dependency", from: ["*", "!api"], to: "db" }]],
  ["forbid components tagged runtime:browser from importing db", [{ op: "forbid_dependency", from: "tag:runtime:browser", to: "db" }]],
  ["ui is not allowed to reach into src/db/internal", [{ op: "forbid_dependency", from: "ui", to: "path:src/db/internal/**" }]],
  ["forbid dependency from cli to ui", [{ op: "forbid_dependency", from: "cli", to: "ui" }]],
  // ── allow-only ──
  ["domain may only depend on util and shared", [{ op: "allow_only", from: "domain", to: ["util", "shared"] }]],
  ["cli can only use the engine and node built-ins", [{ op: "allow_only", from: "cli", to: ["engine", "package:node:*"] }]],
  ["domain only imports util", [{ op: "allow_only", from: "domain", to: "util" }]],
  ["restrict api to domain and shared", [{ op: "allow_only", from: "api", to: ["domain", "shared"] }]],
  ["the engine must only import package zod", [{ op: "allow_only", from: "engine", to: "package:zod" }]],
  // ── declare / undeclare ──
  ["declare ui -> domain", [{ op: "declare_dependency", from: "ui", to: "domain" }]],
  ["ui depends on domain", [{ op: "declare_dependency", from: "ui", to: "domain" }]],
  ["allow ui to use domain", [{ op: "declare_dependency", from: "ui", to: "domain", kind: "uses" }]],
  ["payments calls stripe", [{ op: "declare_dependency", from: "payments", to: "stripe", kind: "calls" }]],
  [
    "declare that api depends on payments and payouts",
    [
      { op: "declare_dependency", from: "api", to: "payments" },
      { op: "declare_dependency", from: "api", to: "payouts" },
    ],
  ],
  ["ui -> shared", [{ op: "declare_dependency", from: "ui", to: "shared" }]],
  ["add a dependency from cli to engine", [{ op: "declare_dependency", from: "cli", to: "engine" }]],
  ["remove the dependency from ui to api", [{ op: "remove_dependency", from: "ui", to: "api" }]],
  ["undeclare api -> domain", [{ op: "remove_dependency", from: "api", to: "domain" }]],
  ["domain no longer depends on db", [{ op: "remove_dependency", from: "domain", to: "db" }]],
  // ── components ──
  ["add a component Billing for src/billing/**", [{ op: "add_component", name: "Billing", paths: ["src/billing/**"] }]],
  ["add a billing component for src/billing", [{ op: "add_component", name: "Billing", paths: ["src/billing/**"] }]],
  [
    "create component Search covering src/search, src/indexer/** and scripts/reindex.ts",
    [{ op: "add_component", name: "Search", paths: ["src/search/**", "src/indexer/**", "scripts/reindex.ts"] }],
  ],
  ["add component \"Order Desk\" owning src/orders/", [{ op: "add_component", name: "Order Desk", paths: ["src/orders/**"] }]],
  ["add a service component Notifications at src/notify", [{ op: "add_component", name: "Notifications", paths: ["src/notify/**"], kind: "service" }]],
  ["add external component Stripe API", [{ op: "add_component", name: "Stripe API", paths: [], external: true }]],
  ["remove component legacy", [{ op: "remove_component", id: "legacy" }]],
  ["delete the legacy component", [{ op: "remove_component", id: "legacy" }]],
  ["rename ui to storefront", [{ op: "rename_component", id: "ui", newId: "storefront", name: "Storefront" }]],
  ["rename component payouts to \"Seller Payouts\"", [{ op: "rename_component", id: "payouts", newId: "seller-payouts", name: "Seller Payouts" }]],
  ["move src/x/** to component api", [{ op: "update_component", id: "api", set: { paths: ["src/api/**", "src/x/**"] } }]],
  ["api also owns src/x/**", [{ op: "update_component", id: "api", set: { paths: ["src/api/**", "src/x/**"] } }]],
  [
    "move src/old/** to payments",
    [
      { op: "update_component", id: "legacy", set: { paths: ["src/legacy/**"] } },
      { op: "update_component", id: "payments", set: { paths: ["src/payments/**", "src/old/**"] } },
    ],
  ],
  ["remove src/old/** from legacy", [{ op: "update_component", id: "legacy", set: { paths: ["src/legacy/**"] } }]],
  [
    "set intent of payments to \"Owns charging; never stores card numbers\"",
    [{ op: "update_component", id: "payments", set: { intent: "Owns charging; never stores card numbers" } }],
  ],
  ["payments: owns charging and refunds", [{ op: "update_component", id: "payments", set: { intent: "owns charging and refunds" } }]],
  ["Payouts: must not import the ledger directly", [{ op: "update_component", id: "payouts", set: { intent: "must not import the ledger directly" } }]],
  ["set kind of payments to gateway", [{ op: "update_component", id: "payments", set: { kind: "gateway" } }]],
  ["make payouts a worker", [{ op: "update_component", id: "payouts", set: { kind: "worker" } }]],
  ["tag ui with runtime:browser", [{ op: "update_component", id: "ui", set: { tags: ["runtime:browser"] } }]],
  ["make shared public", [{ op: "update_component", id: "shared", set: { public: true } }]],
  ["util is public", [{ op: "update_component", id: "util", set: { public: true } }]],
  ["mark payments as tested", [{ op: "update_component", id: "payments", set: { assurance: "tested" } }]],
  ["payments is owned by @alice and @bob", [{ op: "update_component", id: "payments", set: { owners: ["@alice", "@bob"] } }]],
  // ── rules ──
  ["remove rule ui-no-db", [{ op: "remove_rule", id: "ui-no-db" }]],
  ["remove ui-no-db", [{ op: "remove_rule", id: "ui-no-db" }]],
  ["delete the guard-ci rule", [{ op: "remove_rule", id: "guard-ci" }]],
  ["make rule ui-no-db a warning", [{ op: "update_rule", id: "ui-no-db", set: { severity: "warning" } }]],
  ["set severity of ui-no-db to info", [{ op: "update_rule", id: "ui-no-db", set: { severity: "info" } }]],
  ["upgrade guard-ci to error", [{ op: "update_rule", id: "guard-ci", set: { severity: "error" } }]],
  ["no cycles", [{ op: "forbid_cycles" }]],
  ["forbid circular dependencies between domain and db", [{ op: "forbid_cycles", scope: ["domain", "db"] }]],
  ["protect src/security/** and next.config.ts", [{ op: "protect_paths", paths: ["src/security/**", "next.config.ts"] }]],
  ["require review for changes to src/auth", [{ op: "protect_paths", paths: ["src/auth/**"] }]],
  ["protect payments because money", [{ op: "protect_paths", paths: ["src/payments/**"], reason: "Money" }]],
  ["only payments may read STRIPE_*", [{ op: "restrict_secret", secrets: ["STRIPE_*"], allow: "payments" }]],
  ["restrict STRIPE_SECRET_KEY to payments", [{ op: "restrict_secret", secrets: ["STRIPE_SECRET_KEY"], allow: "payments" }]],
  ["only db and infra can access DATABASE_URL, DB_PASSWORD", [{ op: "restrict_secret", secrets: ["DATABASE_URL", "DB_PASSWORD"], allow: ["db", "infra"] }]],
  ["layers: ui > domain > infra", [{ op: "set_layers", layers: ["ui", "domain", "infra"] }]],
  ["layers: ui → api → domain then db", [{ op: "set_layers", layers: ["ui", "api", "domain", "db"] }]],
  ["ui above api above db", [{ op: "set_layers", layers: ["ui", "api", "db"] }]],
  ["set layers ui -> api -> domain and legacy -> db", [{ op: "set_layers", layers: ["ui", "api", ["domain", "legacy"], "db"] }]],
  // ── invariants / decisions ──
  [
    "add invariant: totals never go negative (check: npm test)",
    [{ op: "add_invariant", statement: "Totals never go negative", run: "npm test" }],
  ],
  ["invariant: every order has an owner", [{ op: "add_invariant", statement: "Every order has an owner" }]],
  ["remove invariant money-integer", [{ op: "remove_invariant", id: "money-integer" }]],
  [
    "record decision: use Postgres because we need transactions",
    [{ op: "add_decision", title: "Use Postgres", decision: "Use Postgres", context: "We need transactions" }],
  ],
  ["add decision: ship weekly", [{ op: "add_decision", title: "Ship weekly", decision: "Ship weekly" }]],
  ["remove decision adr-002", [{ op: "remove_decision", id: "ADR-002" }]],
  // ── policy ──
  ["ignore fixtures/**", [{ op: "set_policy", ignoreAdd: ["fixtures/**"] }]],
  ["ignore vendor and dist/", [{ op: "set_policy", ignoreAdd: ["vendor/**", "dist/**"] }]],
  ["treat undeclared dependencies as errors", [{ op: "set_policy", undeclaredDependencies: "error" }]],
  ["turn off unmapped file warnings", [{ op: "set_policy", unmappedFiles: "off" }]],
  ["treat unmapped files as warnings", [{ op: "set_policy", unmappedFiles: "warning" }]],
  ["ignore type-only imports", [{ op: "set_policy", includeTypeOnly: false }]],
  ["disable verification heuristics", [{ op: "set_policy", verificationHeuristics: false }]],
  // ── runtime ──
  ["monitor api at https://api.example.com/health", [{ op: "set_runtime", id: "api", health: { url: "https://api.example.com/health" } }]],
  [
    "monitor api at https://api.example.com/health expecting 204",
    [{ op: "set_runtime", id: "api", health: { url: "https://api.example.com/health", expectStatus: 204 } }],
  ],
  ["payments is deployed to environment production", [{ op: "set_runtime", id: "payments", deployment: { environment: "production" } }]],
  ["api is deployed by deploy.yml", [{ op: "set_runtime", id: "api", workflow: { file: ".github/workflows/deploy.yml" } }]],
];

describe("parseIntent: phrasings", () => {
  it("covers at least 60 phrasings", () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(PHRASES.map(([text]) => text)).size).toBe(PHRASES.length);
  });

  it.each(PHRASES)("%s", (text, expected) => {
    const blueprint = build();
    const snapshot = JSON.stringify(blueprint);
    const result = parseIntent(text, blueprint);
    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") return;
    expect(result.edits).toEqual(expected);
    expect(result.interpretation.length).toBeGreaterThan(10);
    const applied = applyBlueprintEdits(blueprint, result.edits);
    expect(parseBlueprint(JSON.parse(JSON.stringify(applied.blueprint))).ok).toBe(true);
    expect(result.interpretation).toBe(applied.applied.map((item) => item.summary).join(" "));
    expect(JSON.stringify(blueprint)).toBe(snapshot);
  });

  it("every published example parses against a matching blueprint", () => {
    expect(INTENT_EXAMPLES).toHaveLength(10);
    for (const example of INTENT_EXAMPLES) {
      const blueprint = build({
        components: [...build().components.filter((item) => item.id !== "payments"), { id: "payments", name: "Billing core", kind: "service", paths: ["src/pay/**"] }],
      });
      expect(parseIntent(example, blueprint), example).toMatchObject({ status: "ok" });
    }
  });
});

describe("parseIntent: interpretation", () => {
  it("restates the change in a sentence that uses names", () => {
    const result = parseIntent("forbid ui from importing db because the UI goes through the API", build());
    expect(result).toMatchObject({
      status: "ok",
      interpretation: "Forbade \"Storefront UI\" from depending on \"Database\" (rule forbid-ui-db).",
    });
  });
});

describe("parseIntent: multiple commands", () => {
  it("splits on ';', newlines and 'and then', and lets later commands see earlier ones", () => {
    const text = "add a component Billing for src/billing; billing must not import db\nremove rule ui-no-db and then no cycles";
    const result = parseIntent(text, build());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.edits).toEqual([
      { op: "add_component", name: "Billing", paths: ["src/billing/**"] },
      { op: "forbid_dependency", from: "billing", to: "db" },
      { op: "remove_rule", id: "ui-no-db" },
      { op: "forbid_cycles" },
    ]);
    const { blueprint, applied } = applyBlueprintEdits(build(), result.edits);
    expect(applied).toHaveLength(4);
    expect(blueprint.rules.map((rule) => rule.id)).toEqual(["guard-ci", "forbid-billing-db", "no-cycles"]);
    expect(result.interpretation).toMatch(/^Added component "Billing".*Forbade "Billing".*Removed the forbid rule ui-no-db\. Forbade dependency cycles/);
  });

  it("handles bullets, numbering and sentences", () => {
    const result = parseIntent("- Forbid ui from importing infra.\n2. Make shared public.\nProtect src/auth. Ignore fixtures", build());
    expect(result.status === "ok" && result.edits.map((edit) => edit.op)).toEqual(["forbid_dependency", "update_component", "protect_paths", "set_policy"]);
  });

  it("does not split inside quotes", () => {
    const result = parseIntent("set intent of api to \"Validates input; and then calls the domain\"", build());
    expect(result.status === "ok" && result.edits).toEqual([{ op: "update_component", id: "api", set: { intent: "Validates input; and then calls the domain" } }]);
  });

  it("fails as a whole when one command is not understood", () => {
    const result = parseIntent("no cycles; frobnicate the widgets", build());
    expect(result).toMatchObject({ status: "unknown", message: "I could not understand \"frobnicate the widgets\"." });
  });
});

describe("parseIntent: ambiguity", () => {
  it("offers one option per candidate component", () => {
    const result = parseIntent("forbid frontend from importing db", build());
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.message).toBe("\"frontend\" could mean \"Storefront UI\" or \"CLI\". Which one did you mean?");
    expect(result.options.map((option) => option.edits)).toEqual([
      [{ op: "forbid_dependency", from: "ui", to: "db" }],
      [{ op: "forbid_dependency", from: "cli", to: "db" }],
    ]);
    expect(result.options[1].label).toBe("Forbade \"CLI\" from depending on \"Database\" (rule forbid-cli-db).");
    for (const option of result.options) expect(() => applyBlueprintEdits(build(), option.edits)).not.toThrow();
  });

  it("is ambiguous on a shared prefix", () => {
    const result = parseIntent("remove component pay", build());
    expect(result.status === "ambiguous" && result.options.map((option) => option.edits[0])).toEqual([
      { op: "remove_component", id: "payments" },
      { op: "remove_component", id: "payouts" },
    ]);
  });

  it("keeps unambiguous commands in every option", () => {
    const result = parseIntent("no cycles; pay depends on stripe", build());
    expect(result.status === "ambiguous" && result.options.map((option) => option.edits.map((edit: BlueprintEdit) => edit.op))).toEqual([
      ["forbid_cycles", "declare_dependency"],
      ["forbid_cycles", "declare_dependency"],
    ]);
  });

  it("asks about rules too", () => {
    const blueprint = applyBlueprintEdits(build(), [{ op: "forbid_dependency", from: "ui", to: "infra", id: "ui-no-infra" }]).blueprint;
    const result = parseIntent("remove rule ui-no", blueprint);
    expect(result.status === "ambiguous" && result.options.map((option) => option.edits[0])).toEqual([
      { op: "remove_rule", id: "ui-no-db" },
      { op: "remove_rule", id: "ui-no-infra" },
    ]);
  });
});

describe("parseIntent: unknown input", () => {
  const cases: Array<[string, RegExp]> = [
    ["", /Tell me what to change/],
    ["   \n ; ", /Tell me what to change/],
    ["hello there", /could not understand "hello there"/],
    ["what does ui import", /could not understand/],
    ["forbid ui from importing warehouse", /don't know a component called "warehouse".*package warehouse/],
    ["remove rule nope", /no rule called "nope"/],
    ["remove rule ui-no-bd", /Did you mean "ui-no-db"/],
    ["add a component Ghost", /Which files does "Ghost" own\?/],
    ["add a component Payments for src/p2", /already exists/],
    ["declare ui -> api", /already declared/],
    ["remove the dependency from ui to db", /No dependency from "Storefront UI" to "Database"/],
    ["write intent for payments", /set intent of payments to/],
    ["treat unmapped files as errors", /warning, info or off/],
    ["make stripe external", /Nothing to change/],
    ["remove src/legacy/** and src/old/** from legacy", /owns no paths/],
    ["monitor api at ftp://example.com", /could not understand/],
  ];
  it.each(cases)("%j", (text, message) => {
    const result = parseIntent(text, build());
    expect(result.status).toBe("unknown");
    if (result.status !== "unknown") return;
    expect(result.message).toMatch(message);
    expect(result.examples).toEqual(INTENT_EXAMPLES);
  });
});

describe("suggestIntents", () => {
  it("suggests from undeclared edges, missing intent and missing rules", () => {
    const blueprint = build({ rules: [] });
    const suggestions = suggestIntents(blueprint, {
      edges: [
        { from: "ui", to: "api", status: "declared" },
        { from: "ui", to: "db", status: "undeclared" },
        { from: "domain", to: "db", status: "missing" },
        { from: "ghost", to: "db", status: "undeclared" },
      ],
    });
    expect(suggestions).toEqual([
      "declare ui -> db",
      "forbid ui -> db",
      "remove the dependency from domain to db",
      "write intent for ui",
      "write intent for payments",
      "write intent for payouts",
      "no cycles",
      "forbid ui from importing db",
      "protect src/payments/**",
    ]);
    for (const suggestion of suggestions.filter((item) => !item.startsWith("write intent"))) {
      expect(parseIntent(suggestion, blueprint), suggestion).toMatchObject({ status: "ok" });
    }
  });

  it("works without a graph and on an empty blueprint", () => {
    expect(suggestIntents(build())).toEqual(["write intent for ui", "write intent for payments", "write intent for payouts", "no cycles", "forbid ui from importing db"].filter((item) => item !== "forbid ui from importing db"));
    const empty = blueprintSchema.parse({ version: "0.1", system: { name: "New" }, components: [] });
    expect(suggestIntents(empty)).toEqual(["add a component API for src/api/**"]);
    expect(parseIntent(suggestIntents(empty)[0], empty)).toMatchObject({ status: "ok" });
  });
});
