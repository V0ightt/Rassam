import { describe, expect, it } from "vitest";

import { calmGraphView } from "./calm";
import { renderSystemDiagram } from "./diagram";
import { blueprintSchema, type BlueprintInput } from "./schema";
import type { SourceFile } from "./types";
import { createWorkspace, type WorkspaceGraphView } from "./workspace";

// One dependency cycle must read as one problem: stated once, drawn on its
// edges, and never counted on every card of the strongly connected component
// (the documenso trial: one warning painted 12 of 15 cards red).

const file = (path: string, imports: string[] = []): SourceFile => ({
  path,
  content: `${imports.map((target, index) => `import { v${index} } from "${target}";`).join("\n")}\nexport const value = 1;\n`,
});

// api ⇄ apps and apps ⇄ lib: one strongly connected component {api, apps, lib}.
// ui → lib is forbidden by a rule; ui → api is fine.
const files: SourceFile[] = [
  file("src/api/index.ts", ["../apps/index"]),
  file("src/apps/index.ts", ["../api/index", "../lib/index"]),
  file("src/lib/index.ts", ["../apps/index"]),
  file("src/ui/index.ts", ["../api/index", "../lib/index"]),
  file("src/tests/api.test.ts", ["../api/index"]),
];

const input: BlueprintInput = {
  version: "0.1",
  system: { name: "Docs" },
  components: [
    { id: "api", name: "Api", kind: "api", paths: ["src/api/**"] },
    { id: "apps", name: "Apps", paths: ["src/apps/**"] },
    { id: "lib", name: "Lib", paths: ["src/lib/**"] },
    { id: "ui", name: "UI", kind: "component", paths: ["src/ui/**"] },
    { id: "tests", name: "Tests", kind: "test", paths: ["src/tests/**"], priority: 10 },
  ],
  dependencies: [
    { from: "api", to: "apps" },
    { from: "apps", to: "api" },
    { from: "apps", to: "lib" },
    { from: "lib", to: "apps" },
    { from: "ui", to: "api" },
  ],
  rules: [
    { id: "no-cycles", kind: "no-cycles" },
    { id: "ui-not-lib", kind: "forbid", from: "ui", to: "lib" },
  ],
};

const viewOf = (blueprintInput: BlueprintInput): WorkspaceGraphView => createWorkspace(files, blueprintSchema.parse(blueprintInput)).graphView();
const edge = (view: WorkspaceGraphView, from: string, to: string) => view.edges.find((candidate) => candidate.from === from && candidate.to === to);
const card = (view: WorkspaceGraphView, id: string) => view.components.find((candidate) => candidate.id === id);

describe("graphView: dependency cycles", () => {
  const view = viewOf(input);

  it("reports the cycle once, as the concrete loop from the finding", () => {
    expect(view.cycles).toEqual([{ ruleId: "no-cycles", severity: "warning", path: ["api", "apps", "api"] }]);
    const check = createWorkspace(files, blueprintSchema.parse(input)).check();
    expect(check.findings.find((finding) => finding.kind === "dependency-cycle")?.title).toBe("Dependency cycle: Api → Apps → Api");
  });

  it("flags only the edges of that loop", () => {
    expect(view.edges.filter((candidate) => candidate.cycle).map((candidate) => `${candidate.from}>${candidate.to}`).sort()).toEqual(["api>apps", "apps>api"]);
    expect(edge(view, "apps", "lib")?.cycle).toBeUndefined();
  });

  it("does not count the cycle on the cards of its members", () => {
    expect(card(view, "api")).toMatchObject({ findings: 0 });
    expect(card(view, "apps")).toMatchObject({ findings: 0 });
    expect(card(view, "api")?.severity).toBeUndefined();
    // lib is the target of the forbidden ui → lib import, not of the cycle.
    expect(card(view, "lib")).toMatchObject({ findings: 1, severity: "error" });
    expect(card(view, "ui")).toMatchObject({ findings: 1, severity: "error" });
  });

  it("marks forbidden only the pair a dependency rule names, never a pair taken from a cycle", () => {
    expect(edge(view, "ui", "lib")?.status).toBe("forbidden");
    expect(edge(view, "api", "apps")?.status).toBe("declared");
    expect(view.edges.filter((candidate) => candidate.status === "forbidden")).toHaveLength(1);
  });

  it("shows a cycle found by two rules once, with the worse severity", () => {
    const twice = viewOf({ ...input, rules: [...input.rules!, { id: "core-acyclic", kind: "no-cycles", scope: ["api", "apps"], severity: "error" }] });
    expect(twice.cycles).toEqual([{ ruleId: "no-cycles", severity: "error", path: ["api", "apps", "api"] }]);
  });

  it("omits the new fields when there is nothing to report", () => {
    const acyclic = viewOf({ ...input, dependencies: [], rules: [] });
    expect(acyclic.cycles).toBeUndefined();
    expect(acyclic.edges.some((candidate) => "cycle" in candidate)).toBe(false);
    expect(acyclic.components.every((candidate) => candidate.findings === 0 && !("severity" in candidate))).toBe(true);
  });

  it("colours a card by the worst severity of its findings", () => {
    const warningOnly = viewOf({ ...input, rules: [{ id: "ui-not-lib", kind: "forbid", from: "ui", to: "lib", severity: "warning" }] });
    expect(card(warningOnly, "ui")).toMatchObject({ findings: 1, severity: "warning" });
  });
});

describe("calm mode keeps cycles", () => {
  it("never hides an edge on a cycle, even a declared one implied by another path", () => {
    // a → b → c → a: every declared edge is implied by the other two, so calm mode would drop one.
    const loop: WorkspaceGraphView = {
      components: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "t", name: "T", kind: "test" }],
      edges: [
        { from: "a", to: "b", status: "declared", cycle: true },
        { from: "b", to: "c", status: "declared", cycle: true },
        { from: "c", to: "a", status: "declared", cycle: true },
        { from: "a", to: "c", status: "declared" },
        { from: "t", to: "a", status: "declared", cycle: true },
      ],
      cycles: [{ severity: "warning", path: ["a", "b", "c", "a"] }],
    };
    const calm = calmGraphView(loop, null);
    const keys = calm.view.edges.map((candidate) => `${candidate.from}>${candidate.to}`).sort();
    expect(keys).toEqual(expect.arrayContaining(["a>b", "b>c", "c>a", "t>a"]));
    expect(keys).not.toContain("a>c");
    expect(calm.hiddenComponents.has("t")).toBe(false);
    expect(calm.view.cycles).toEqual(loop.cycles);

    const svg = renderSystemDiagram({ title: "Loop", view: loop });
    expect(svg.match(/data-cycle="true"/g)).toHaveLength(4);
  });
});

describe("the system diagram with a cycle", () => {
  const view = viewOf(input);
  const svg = renderSystemDiagram({ title: "Docs", view, findings: { errors: 1, warnings: 1 } });
  const cardOf = (id: string) => new RegExp(`<g data-component="${id}"[^>]*>(.*?)</g>`).exec(svg)?.[1] ?? "";

  it("puts no badge on the members of the cycle", () => {
    expect(cardOf("api")).not.toContain("data-badge");
    expect(cardOf("apps")).not.toContain("data-badge");
    expect(cardOf("ui")).toContain('data-badge="violations" data-severity="error"');
  });

  it("states the cycle once in the header", () => {
    expect(svg.match(/data-cycle="summary"/g)).toHaveLength(1);
    expect(svg).toContain('data-cycle="summary"><tspan font-weight="600" fill="#7d4e00">Dependency cycle:</tspan> Api → Apps → Api</text>');
  });

  it("draws cycle edges in the warning colour with a dash-dot line and a label", () => {
    const cycleEdges = [...svg.matchAll(/<path data-edge="declared" data-cycle="true"[^>]*>/g)].map((match) => match[0]);
    expect(cycleEdges).toHaveLength(2);
    for (const drawn of cycleEdges) {
      expect(drawn).toContain('stroke="#a87400"');
      expect(drawn).toContain('stroke-dasharray="9 3 2 3"');
      expect(drawn).toMatch(/marker-end="url\(#rs[a-z0-9]+-arrow-cycle\)"/);
    }
    expect(svg).toMatch(/<marker id="rs[a-z0-9]+-arrow-cycle"/);
    expect(svg).toMatch(/data-edge-label="declared">cycle<\/text>/);
  });

  it("explains the cycle in the legend and in the text alternative", () => {
    expect(svg).toContain('<g data-legend="cycle">');
    expect(svg).toContain(">Dependency cycle</text>");
    const description = /<desc id="[^"]+">([^<]*)<\/desc>/.exec(svg)![1];
    expect(description).toContain("Dependency cycle: Api → Apps → Api");
    expect(description).toContain("2 on a dependency cycle");
    expect(description).not.toMatch(/Api \([^)]*violation/);
  });

  it("truncates a long cycle line to the room it has and stays deterministic", () => {
    const names = ["Customer notification service", "Outbound messaging orchestration", "Billing and invoicing", "Identity and access management"];
    const long: WorkspaceGraphView = {
      components: names.map((name, index) => ({ id: `c${index}`, name })),
      edges: names.map((_, index) => ({ from: `c${index}`, to: `c${(index + 1) % names.length}`, status: "declared" as const, cycle: true as const })),
      cycles: [{ severity: "warning", path: ["c0", "c1", "c2", "c3", "c0"] }, { severity: "error", path: ["c1", "c2", "c1"] }],
    };
    const drawn = renderSystemDiagram({ title: "Long <&>", view: long }, { direction: "TB" });
    const line = /data-cycle="summary"><tspan font-weight="600" fill="([^"]+)">([^<]+)<\/tspan> ([^<]+)<\/text>/.exec(drawn)!;
    expect(line[1]).toBe("#a40e26");
    expect(line[2]).toBe("2 dependency cycles:");
    expect(line[3].endsWith("…")).toBe(true);
    expect(renderSystemDiagram({ title: "Long <&>", view: long }, { direction: "TB" })).toBe(drawn);
  });

  it("draws a warning badge as an outlined amber pill, and labels it in the legend", () => {
    const warned: WorkspaceGraphView = { ...view, components: view.components.map((component) => (component.id === "ui" ? { ...component, severity: "warning" as const } : component.id === "lib" ? { ...component, findings: 0, severity: undefined } : component)) };
    const drawn = renderSystemDiagram({ title: "Docs", view: warned });
    const ui = new RegExp('<g data-component="ui"[^>]*>(.*?)</g>').exec(drawn)![1];
    expect(ui).toMatch(/<rect data-badge="violations" data-severity="warning"[^>]*fill="#a87400" fill-opacity="0.14" stroke="#a87400"\/>/);
    expect(ui).toContain('fill="#7d4e00"');
    expect(drawn).toContain('<g data-legend="warnings">');
    expect(drawn).not.toContain('<g data-legend="violations">');
    // A view from an older producer has no severity: its badge stays a solid error pill.
    const legacy = renderSystemDiagram({ title: "Docs", view: { components: [{ id: "x", name: "X", findings: 2 }], edges: [] } });
    expect(legacy).toContain('data-badge="violations" data-severity="error"');
  });
});
