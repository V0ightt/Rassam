import { describe, expect, it } from "vitest";

import { runCheck } from "./check";
import { deriveBlueprint } from "./derive";
import { fileAdded } from "./diff";
import { assignComponents, findCycles } from "./graph";
import { buildFileGraph } from "./imports";
import { blueprintSchema, parseBlueprint, serializeBlueprint, parseBlueprintText, type Blueprint, type BlueprintInput } from "./schema";
import { deserializeFileGraph, serializeFileGraph } from "./snapshot";
import { humanAuthoredRatio } from "./stats";
import type { ChangedFile, Finding, SourceFile } from "./types";
import { stampVerification } from "./verify";
import { createWorkspace } from "./workspace";

const files: SourceFile[] = [
  { path: "package.json", content: JSON.stringify({ name: "shop" }) },
  { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }) },
  {
    path: "src/ui/Cart.tsx",
    content: [
      'import { total } from "@/domain/pricing";',
      'import { db } from "@/infra/db";',
      "export const Cart = () => total(db.items);",
    ].join("\n"),
  },
  {
    path: "src/ui/Header.tsx",
    content: ['import React from "react";', 'import { readFileSync } from "fs";', "export const Header = () => readFileSync;"].join("\n"),
  },
  {
    path: "src/ui/Checkout.tsx",
    content: ['import { total } from "../domain/pricing";', "const key = process.env.STRIPE_SECRET_KEY;", "export const Checkout = () => total([key]);"].join("\n"),
  },
  {
    path: "src/domain/pricing.ts",
    content: ['import { format } from "../util/format";', "export const total = (items: unknown[]) => format(items.length);"].join("\n"),
  },
  { path: "src/domain/orders.ts", content: ['import { db } from "../infra/db";', "export const orders = db;"].join("\n") },
  {
    path: "src/infra/db.ts",
    content: [
      'import { total } from "../domain/pricing";',
      "const url = process.env.DATABASE_URL;",
      "export const db = { items: [], url, total };",
    ].join("\n"),
  },
  { path: "src/util/format.ts", content: "export const format = (value: number) => String(value);" },
  { path: "src/payments/stripe.ts", content: "export const key = process.env.STRIPE_SECRET_KEY;" },
  { path: "src/domain/pricing.test.ts", content: ['import { total } from "./pricing";', "test('x', () => expect(total([])).toBe('0'));"].join("\n") },
  { path: "scripts/seed.ts", content: "export const seed = 1;" },
  { path: "README.md", content: null },
];

const blueprintInput: BlueprintInput = {
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "ui", name: "Storefront UI", kind: "component", paths: ["src/ui/**"], intent: "Renders the shop. Never touches storage directly." },
    { id: "domain", name: "Domain", kind: "core", paths: ["src/domain/**"], assurance: "tested" },
    { id: "infra", name: "Infrastructure", kind: "database", paths: ["src/infra/**"] },
    { id: "util", name: "Utilities", kind: "utility", paths: ["src/util/**"] },
    { id: "payments", name: "Payments", kind: "service", paths: ["src/payments/**"], assurance: "tested" },
    { id: "tests", name: "Tests", kind: "test", paths: ["**/*.test.ts"], priority: 10 },
    { id: "legacy", name: "Legacy", kind: "core", paths: ["src/legacy/**"] },
    { id: "stripe-api", name: "Stripe API", kind: "external-api", external: true },
  ],
  dependencies: [
    { from: "ui", to: "domain" },
    { from: "domain", to: "util" },
    { from: "domain", to: "infra" },
  ],
  rules: [
    { id: "ui-no-infra", kind: "forbid", from: "ui", to: "infra", reason: "The UI reaches data only through the domain layer." },
    { id: "ui-no-node", kind: "forbid", from: "ui", to: "package:node:*", reason: "UI code runs in the browser." },
    { id: "layering", kind: "layers", layers: ["ui", "domain", "infra"] },
    { id: "no-cycles", kind: "no-cycles" },
    { id: "stripe-secret", kind: "secret-access", secrets: ["STRIPE_*"], allow: "payments", reason: "Only payments may hold the Stripe key." },
  ],
  invariants: [{ id: "totals", statement: "Totals never go negative", components: ["domain"], check: { run: "npm test" } }],
};
const blueprint: Blueprint = blueprintSchema.parse(blueprintInput);

const byKind = (findings: Finding[], kind: Finding["kind"]) => findings.filter((finding) => finding.kind === kind);

describe("schema", () => {
  it("parses, validates references and round-trips", () => {
    const result = parseBlueprint(blueprintInput);
    expect(result.ok).toBe(true);
    const text = serializeBlueprint(blueprint);
    expect(text.startsWith("{\n  \"$schema\"")).toBe(true);
    const again = parseBlueprintText(text);
    expect(again.ok && again.blueprint.components).toHaveLength(8);
  });

  it("reports unknown component references and duplicates", () => {
    const result = parseBlueprint({
      ...blueprintInput,
      components: [...(blueprintInput.components ?? []), { id: "ui", name: "Again", paths: ["x/**"] }],
      rules: [{ id: "r", kind: "forbid", from: "ghost", to: "ui" }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toMatch(/Duplicate component id "ui"/);
    expect(result.issues.map((issue) => issue.message).join("\n")).toMatch(/unknown component "ghost"/);
  });

  it("rejects unknown fields and invalid JSON", () => {
    expect(parseBlueprint({ ...blueprintInput, surprise: true }).ok).toBe(false);
    expect(parseBlueprintText("{ nope").ok).toBe(false);
  });
});

describe("component membership", () => {
  it("prefers priority, then specificity", () => {
    const membership = assignComponents(files.map((file) => file.path), blueprint);
    expect(membership.fileToComponent.get("src/domain/pricing.test.ts")).toBe("tests");
    expect(membership.fileToComponent.get("src/domain/pricing.ts")).toBe("domain");
    expect(membership.unmapped).toContain("scripts/seed.ts");
  });

  it("finds cycles", () => {
    expect(findCycles(["a", "b", "c"], [{ from: "a", to: "b" }, { from: "b", to: "a" }, { from: "b", to: "c" }])).toEqual([["a", "b"]]);
  });
});

describe("runCheck (full mode)", () => {
  const report = runCheck({ files, blueprint, now: "2026-11-21T00:00:00.000Z" });

  it("finds forbidden internal and package dependencies with evidence", () => {
    const forbidden = byKind(report.findings, "forbidden-dependency");
    const internal = forbidden.find((finding) => finding.ruleId === "ui-no-infra");
    expect(internal).toMatchObject({ severity: "error", reason: "The UI reaches data only through the domain layer." });
    expect(internal?.locations[0]).toEqual({ path: "src/ui/Cart.tsx", line: 2 });
    const pkg = forbidden.find((finding) => finding.ruleId === "ui-no-node");
    expect(pkg?.locations[0]).toEqual({ path: "src/ui/Header.tsx", line: 2 });
  });

  it("finds layer violations, cycles and secret access", () => {
    const layer = byKind(report.findings, "layer-violation");
    expect(layer.map((finding) => finding.locations[0].path)).toEqual(["src/infra/db.ts"]);
    const cycles = byKind(report.findings, "dependency-cycle");
    expect(cycles).toHaveLength(1);
    expect(cycles[0].components).toEqual(["domain", "infra"]);
    const secret = byKind(report.findings, "secret-access");
    expect(secret.map((finding) => finding.locations[0])).toEqual([{ path: "src/ui/Checkout.tsx", line: 2 }]);
  });

  it("applies policy: undeclared, unmapped, empty components, assurance drift", () => {
    const undeclared = byKind(report.findings, "undeclared-dependency").map((finding) => finding.components.join("->")).sort();
    expect(undeclared).toEqual(["infra->domain", "ui->infra"]);
    expect(byKind(report.findings, "unmapped-file")[0].locations).toEqual([{ path: "scripts/seed.ts" }]);
    expect(byKind(report.findings, "empty-component")[0].components).toEqual(["legacy"]);
    expect(byKind(report.findings, "assurance-drift").map((finding) => finding.components[0])).toEqual(["payments"]);
  });

  it("sorts by score and summarizes", () => {
    const scores = report.findings.map((finding) => finding.score);
    expect([...scores].sort((left, right) => right - left)).toEqual(scores);
    expect(report.findings[0].severity).toBe("error");
    expect(report.summary).toMatchObject({ components: 8, filesUnmapped: 1, newFindings: report.findings.length });
    expect(report.findings.every((finding) => finding.isNew)).toBe(true);
    expect(report.reach?.envAccess.map((entry) => entry.name)).toEqual(["DATABASE_URL", "STRIPE_SECRET_KEY"]);
  });

  it("produces stable fingerprints across runs", () => {
    const again = runCheck({ files, blueprint, now: "2026-11-21T00:00:00.000Z" });
    expect(again.findings.map((finding) => finding.id)).toEqual(report.findings.map((finding) => finding.id));
  });

  it("works from a serialized graph without file contents", () => {
    const graph = deserializeFileGraph(JSON.parse(JSON.stringify(serializeFileGraph(buildFileGraph(files)))));
    const fromGraph = runCheck({ files: [], blueprint, fileGraph: graph, reach: report.reach, now: "2026-11-21T00:00:00.000Z" });
    expect(fromGraph.findings.map((finding) => finding.id)).toEqual(report.findings.map((finding) => finding.id));
  });

  it("reports a missing blueprint", () => {
    const empty = runCheck({ files, blueprint: null });
    expect(empty.blueprint.present).toBe(false);
    expect(empty.summary.components).toBe(0);
  });
});

describe("runCheck (diff mode)", () => {
  const baseCheckout = 'import { total } from "../domain/pricing";\nexport const Checkout = () => total([]);';
  const changes: ChangedFile[] = [
    {
      path: "src/ui/Checkout.tsx",
      status: "modified",
      added: [{ line: 2, text: "const key = process.env.STRIPE_SECRET_KEY;" }],
      removed: [],
    },
    {
      path: "src/domain/pricing.test.ts",
      status: "modified",
      added: [{ line: 2, text: "test.skip('x', () => expect(total([])).toBe('0'));" }],
      removed: [{ line: 2, text: "test('x', () => expect(total([])).toBe('0'));" }],
    },
  ];
  const weakened = blueprintSchema.parse({ ...blueprintInput, rules: blueprintInput.rules!.filter((rule) => rule.id !== "ui-no-infra") });
  const report = runCheck({
    files,
    blueprint: weakened,
    baseBlueprint: blueprint,
    changes: [...changes, { path: ".rassam/blueprint.json", status: "modified", added: [], removed: [] }],
    baseFiles: [
      { path: "src/ui/Checkout.tsx", content: baseCheckout },
      { path: "src/domain/pricing.test.ts", content: files.find((file) => file.path === "src/domain/pricing.test.ts")!.content },
    ],
    commits: [{ sha: "a", authorName: "dev", authorEmail: "dev@example.com", message: "feat\n\nCo-Authored-By: Claude <noreply@anthropic.com>" }],
    refs: { base: { ref: "main" }, head: { ref: "feature" } },
  });

  it("separates new violations from pre-existing ones", () => {
    const secret = byKind(report.findings, "secret-access")[0];
    expect(secret.isNew).toBe(true);
    const cart = byKind(report.findings, "forbidden-dependency").find((finding) => finding.ruleId === "ui-no-infra");
    expect(cart?.isNew).toBe(false);
  });

  it("judges the change by the base blueprint and flags contract weakening", () => {
    expect(byKind(report.findings, "forbidden-dependency").some((finding) => finding.ruleId === "ui-no-infra")).toBe(true);
    const weakening = byKind(report.findings, "contract-weakened");
    expect(weakening).toHaveLength(1);
    expect(weakening[0]).toMatchObject({ severity: "error", isNew: true });
    expect(report.contractChanges?.some((change) => change.weakens)).toBe(true);
  });

  it("flags tripwires, weakened verification and agent authorship", () => {
    expect(byKind(report.findings, "protected-path").length).toBeGreaterThan(0);
    expect(byKind(report.findings, "verification-weakened").some((finding) => finding.title.includes("test-skipped"))).toBe(true);
    expect(report.agentActivity).toMatchObject({ agentCommits: 1, agents: ["Claude"] });
    expect(report.impact?.touchedComponents.map((item) => item.id).sort()).toEqual(["tests", "ui"]);
  });

  it("downgrades approved contract changes", () => {
    const approved = runCheck({ files, blueprint: weakened, baseBlueprint: blueprint, changes, baseFiles: [], approved: true });
    expect(byKind(approved.findings, "contract-weakened")[0].severity).toBe("info");
  });

  it("reports new unmapped files and invariants in scope", () => {
    const withNew = runCheck({
      files: [...files, { path: "scripts/migrate.ts", content: "export {};" }],
      blueprint,
      baseBlueprint: blueprint,
      changes: [fileAdded("scripts/migrate.ts", "export {};"), changes[1]],
    });
    const unmapped = byKind(withNew.findings, "unmapped-file");
    expect(unmapped.find((finding) => finding.isNew)?.locations).toEqual([{ path: "scripts/migrate.ts" }]);
    expect(byKind(withNew.findings, "invariant-at-risk")).toHaveLength(0);
    const touchingDomain = runCheck({
      files,
      blueprint,
      baseBlueprint: blueprint,
      changes: [{ path: "src/domain/pricing.ts", status: "modified", added: [{ line: 1, text: "//" }], removed: [] }],
    });
    expect(byKind(touchingDomain.findings, "invariant-at-risk")[0].title).toContain("Totals never go negative");
  });
});

describe("workspace queries", () => {
  const workspace = createWorkspace(files, blueprint);

  it("explains a path", () => {
    const explanation = workspace.explainPath("src/ui/Cart.tsx");
    expect(explanation.component?.id).toBe("ui");
    expect(explanation.forbiddenComponents).toContain("infra");
    expect(explanation.constraints.map((rule) => rule.id)).toEqual(expect.arrayContaining(["ui-no-infra", "layering", "stripe-secret"]));
    expect(explanation.guidance).toMatch(/Must not depend on: Infrastructure/);
    expect(workspace.explainPath("src/domain/pricing.test.ts").protected).toBe(true);
  });

  it("checks planned dependencies", () => {
    expect(workspace.checkDependency("src/ui/Header.tsx", "@/infra/db").allowed).toBe(false);
    expect(workspace.checkDependency("src/ui/Header.tsx", "fs")).toMatchObject({ allowed: false, target: { kind: "external", pkg: "node:fs" } });
    const declaredEdge = workspace.checkDependency("src/domain/orders.ts", "src/util/format.ts");
    expect(declaredEdge).toMatchObject({ allowed: true, undeclared: false });
    const undeclared = workspace.checkDependency("src/ui/Cart.tsx", "../util/format");
    expect(undeclared).toMatchObject({ allowed: true, undeclared: true });
    expect(workspace.checkDependency("src/ui/Cart.tsx", "infra").allowed).toBe(false);
  });

  it("computes impact and summaries", () => {
    const impact = workspace.impact(["src/util/format.ts"]);
    expect(impact.touchedComponents.map((item) => item.id)).toEqual(["util"]);
    expect(impact.dependents.map((item) => item.id)).toEqual(expect.arrayContaining(["domain", "ui", "infra"]));
    const summary = workspace.componentSummary("domain");
    expect(summary?.tests).toEqual(["src/domain/pricing.test.ts"]);
    expect(summary?.dependsOn.find((item) => item.id === "infra")).toMatchObject({ declared: true, observed: true });
    const overview = workspace.overview();
    expect(overview.components.find((item) => item.id === "ui")?.intent).toBe("Renders the shop. Never touches storage directly.");
    const view = workspace.graphView();
    expect(view.edges.find((edge) => edge.from === "ui" && edge.to === "infra")?.status).toBe("forbidden");
    expect(view.edges.find((edge) => edge.from === "ui" && edge.to === "domain")?.status).toBe("declared");
  });
});

describe("derive and verify", () => {
  it("derives a valid draft that passes its own check", () => {
    const draft = deriveBlueprint(files, { now: "2026-11-21T00:00:00.000Z", commit: "abc" });
    expect(parseBlueprint(JSON.parse(serializeBlueprint(draft))).ok).toBe(true);
    expect(draft.system.name).toBe("shop");
    expect(draft.components.some((component) => component.kind === "test" && component.priority === 10)).toBe(true);
    expect(draft.rules.some((rule) => rule.kind === "secret-access")).toBe(true);
    const report = runCheck({ files, blueprint: draft });
    const errors = report.findings.filter((finding) => finding.severity === "error" && finding.kind !== "secret-access");
    expect(errors).toEqual([]);
    expect(humanAuthoredRatio(draft)).toBe(0);
  });

  it("stamps human sign-offs", () => {
    const { blueprint: signed, kind } = stampVerification(blueprint, "ui-no-infra", { by: "Ada", at: "2026-11-21" });
    expect(kind).toBe("rule");
    expect(signed.rules.find((rule) => rule.id === "ui-no-infra")?.verified?.by).toBe("Ada");
    expect(blueprint.rules.find((rule) => rule.id === "ui-no-infra")?.verified).toBeUndefined();
    expect(stampVerification(blueprint, "ui->domain", { by: "Ada", at: "2026-11-21" }).kind).toBe("dependency");
    expect(() => stampVerification(blueprint, "nope", { by: "Ada", at: "x" })).toThrow(/No component/);
  });
});

describe("contract weakening through membership", () => {
  const changes: ChangedFile[] = [{ path: ".rassam/blueprint.json", status: "modified", added: [], removed: [] }];
  const judge = (head: Blueprint) => runCheck({ files, blueprint: head, baseBlueprint: blueprint, changes, baseFiles: [] });
  const weakening = (head: Blueprint) => byKind(judge(head).findings, "contract-weakened").map((finding) => finding.title);

  it("flags files that move out of a rule-constrained component", () => {
    const head = blueprintSchema.parse({
      ...blueprintInput,
      components: [...blueprintInput.components!, { id: "cart", name: "Cart", kind: "component", paths: ["src/ui/Cart.tsx"] }],
    });
    expect(weakening(head).some((title) => title.includes('moved out of "Storefront UI"') && title.includes('"Cart"'))).toBe(true);
  });

  it("flags a component that claims paths inside a constrained one before files exist", () => {
    const head = blueprintSchema.parse({
      ...blueprintInput,
      components: [...blueprintInput.components!, { id: "admin", name: "Admin", kind: "component", paths: ["src/ui/admin/**"], priority: 10 }],
    });
    expect(weakening(head).some((title) => title.includes("claims src/ui/admin/**"))).toBe(true);
  });

  it("does not flag the claim when the head rules cover the new component", () => {
    const head = blueprintSchema.parse({
      ...blueprintInput,
      components: [...blueprintInput.components!, { id: "admin", name: "Admin", kind: "component", paths: ["src/ui/admin/**"] }],
      rules: blueprintInput.rules!.map((rule) => {
        if (rule.kind === "forbid" || rule.kind === "allow-only") {
          const from = Array.isArray(rule.from) ? rule.from : [rule.from];
          return from.includes("ui") ? { ...rule, from: [...from, "admin"] } : rule;
        }
        if (rule.kind === "layers") return { ...rule, layers: rule.layers.map((layer) => (layer === "ui" ? ["ui", "admin"] : layer)) };
        return rule;
      }),
    });
    expect(weakening(head).filter((title) => title.includes("claims"))).toEqual([]);
  });

  it("flags making a component public or re-kinding it as test", () => {
    const publicInfra = blueprintSchema.parse({
      ...blueprintInput,
      components: blueprintInput.components!.map((component) => (component.id === "infra" ? { ...component, public: true } : component)),
    });
    expect(weakening(publicInfra).some((title) => title.includes("now public"))).toBe(true);
    const testDomain = blueprintSchema.parse({
      ...blueprintInput,
      components: blueprintInput.components!.map((component) => (component.id === "domain" ? { ...component, kind: "test" } : component)),
    });
    expect(weakening(testDomain).some((title) => title.includes('kind "core" → "test"'))).toBe(true);
  });
});

describe("syncBlueprint", () => {
  it("adds derived facts for uncovered code without touching human facts", async () => {
    const { syncBlueprint } = await import("./sync");
    const result = syncBlueprint(blueprint, files, { now: "2026-11-21T00:00:00.000Z" });
    expect(result.addedComponents.map((component) => component.paths)).toEqual([["scripts/**"]]);
    expect(result.addedComponents[0].provenance?.source).toBe("derived");
    expect(result.addedDependencies.map((dependency) => `${dependency.from}->${dependency.to}`).sort()).toEqual(["infra->domain", "ui->infra"]);
    for (const component of blueprint.components) {
      expect(result.blueprint.components.find((candidate) => candidate.id === component.id)).toEqual(component);
    }
    expect(result.blueprint.rules).toEqual(blueprint.rules);
    const before = assignComponents(files.map((file) => file.path), blueprint).fileToComponent;
    const after = assignComponents(files.map((file) => file.path), result.blueprint).fileToComponent;
    for (const [path, owner] of before) expect(after.get(path)).toBe(owner);
    const report = runCheck({ files, blueprint: result.blueprint });
    expect(byKind(report.findings, "undeclared-dependency")).toEqual([]);
    expect(byKind(report.findings, "unmapped-file")).toEqual([]);
  });
});

describe("future paths that change owner", () => {
  const changes: ChangedFile[] = [{ path: ".rassam/blueprint.json", status: "modified", added: [], removed: [] }];
  const withComponents = (extra: BlueprintInput["components"], patch?: (component: NonNullable<BlueprintInput["components"]>[number]) => NonNullable<BlueprintInput["components"]>[number]) =>
    blueprintSchema.parse({ ...blueprintInput, components: [...blueprintInput.components!.map((component) => (patch ? patch(component) : component)), ...(extra ?? [])] });
  const claims = (base: Blueprint, head: Blueprint) => byKind(
    runCheck({ files, blueprint: head, baseBlueprint: base, changes, baseFiles: [] }).findings,
    "contract-weakened",
  ).map((finding) => finding.title).filter((title) => title.includes("claims"));

  it("flags raising the priority of an existing overlapping component", () => {
    const base = withComponents([{ id: "legacy-ui", name: "Legacy UI", kind: "component", paths: ["src/**/*.legacy.tsx"], priority: -5 }]);
    const head = withComponents([{ id: "legacy-ui", name: "Legacy UI", kind: "component", paths: ["src/**/*.legacy.tsx"], priority: 50 }]);
    expect(claims(base, base)).toEqual([]);
    expect(claims(base, head).some((title) => title.includes('"Legacy UI" claims src/**/*.legacy.tsx inside rule-constrained "Storefront UI"'))).toBe(true);
  });

  it("flags a broad component that now outranks a constrained one", () => {
    const base = withComponents([{ id: "everything", name: "Everything", kind: "core", paths: ["src/**"], priority: -10 }]);
    const head = withComponents([{ id: "everything", name: "Everything", kind: "core", paths: ["src/**"], priority: 10 }]);
    // Existing files move too, so the gate reports the concrete move instead of a duplicate claim.
    const weakening = byKind(runCheck({ files, blueprint: head, baseBlueprint: base, changes, baseFiles: [] }).findings, "contract-weakened")
      .map((finding) => finding.title);
    expect(weakening.some((title) => title.includes('moved out of "Storefront UI"') && title.includes('"Everything"'))).toBe(true);
  });

  it("does not flag priority changes that move nothing", () => {
    const base = withComponents([{ id: "docs-site", name: "Docs", kind: "core", paths: ["website/**"] }]);
    const head = withComponents([{ id: "docs-site", name: "Docs", kind: "core", paths: ["website/**"], priority: 20 }]);
    expect(claims(base, head)).toEqual([]);
  });

  it("builds probe paths from globs", async () => {
    const { probePathFor } = await import("./check");
    expect(probePathFor("src/ui/**")).toBe("src/ui/x/rassam-probe.ts");
    expect(probePathFor("src/**/*.legacy.tsx")).toBe("src/x/x.legacy.tsx");
    expect(probePathFor("{lib,src}/a.ts")).toBe("lib/a.ts");
    expect(probePathFor("src/lib")).toBe("src/lib/rassam-probe.ts");
    expect(probePathFor("src/ui/Cart.tsx")).toBe("src/ui/Cart.tsx");
  });
});

describe("restructures that stay under the same rules", () => {
  it("does not flag files moving into a component the same rules select by tag", () => {
    const tagged = (input: BlueprintInput): Blueprint => blueprintSchema.parse(input);
    const base = tagged({
      version: "0.1",
      system: { name: "Shop" },
      components: [
        { id: "ui", name: "UI", paths: ["src/ui/**"], tags: ["runtime:browser"] },
        { id: "infra", name: "Infra", paths: ["src/infra/**"] },
      ],
      rules: [{ id: "browser-no-infra", kind: "forbid", from: "tag:runtime:browser", to: "infra" }],
    });
    const head = tagged({
      ...JSON.parse(JSON.stringify(base)),
      components: [
        ...base.components,
        { id: "cart", name: "Cart", paths: ["src/ui/Cart.tsx"], tags: ["runtime:browser"] },
      ],
    });
    const untagged = tagged({
      ...JSON.parse(JSON.stringify(base)),
      components: [...base.components, { id: "cart", name: "Cart", paths: ["src/ui/Cart.tsx"] }],
    });
    const changes: ChangedFile[] = [{ path: ".rassam/blueprint.json", status: "modified", added: [], removed: [] }];
    const moved = (blueprint: Blueprint) => byKind(runCheck({ files, blueprint, baseBlueprint: base, changes, baseFiles: [] }).findings, "contract-weakened")
      .filter((finding) => finding.title.includes("moved out of") || finding.title.includes("claims"));
    expect(moved(head)).toEqual([]);
    expect(moved(untagged)).toHaveLength(1);
  });
});
