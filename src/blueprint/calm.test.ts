import { describe, expect, it } from "vitest";

import { calmEdgeKey, calmGraphView } from "./calm";
import { blueprintSchema } from "./schema";
import type { WorkspaceGraphView } from "./workspace";

const blueprint = blueprintSchema.parse({
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "ui", name: "UI", paths: ["src/ui/**"] },
    { id: "api", name: "API", paths: ["src/api/**"] },
    { id: "db", name: "DB", paths: ["src/db/**"] },
    { id: "shared", name: "Shared", paths: ["src/shared/**"], public: true },
    { id: "tests", name: "Tests", kind: "test", paths: ["tests/**"] },
  ],
});

const view: WorkspaceGraphView = {
  components: [
    { id: "ui", name: "UI", kind: "component" },
    { id: "api", name: "API", kind: "api" },
    { id: "db", name: "DB", kind: "database" },
    { id: "shared", name: "Shared", kind: "utility" },
    { id: "tests", name: "Tests", kind: "test" },
  ],
  edges: [
    { from: "ui", to: "api", status: "declared" },
    { from: "api", to: "db", status: "declared" },
    { from: "ui", to: "db", status: "declared" },
    { from: "ui", to: "shared", status: "declared" },
    { from: "api", to: "shared", status: "declared" },
    { from: "tests", to: "ui", status: "declared" },
    { from: "tests", to: "db", status: "declared" },
  ],
};

const keys = (result: ReturnType<typeof calmGraphView>) => result.view.edges.map(calmEdgeKey).sort();

describe("calmGraphView", () => {
  it("hides tests, edges into shared components and implied dependencies", () => {
    const result = calmGraphView(view, blueprint);
    expect(result.view.components.map((component) => component.id)).toEqual(["ui", "api", "db", "shared"]);
    expect(keys(result)).toEqual(["api\u0000db", "ui\u0000api"]);
    expect(result.hidden).toEqual({ tests: 1, shared: 2, implied: 1 });
    expect([...result.sharedComponents]).toEqual(["shared"]);
    expect(result.note).toBe("Hidden for clarity: 1 test component, 2 edges into shared components, 1 implied dependency");
  });

  it("never hides what needs attention", () => {
    const risky: WorkspaceGraphView = {
      components: view.components.map((component) => (component.id === "tests" ? { ...component, findings: 1 } : component)),
      edges: view.edges.map((edge) => (edge.from === "ui" && edge.to === "db" ? { ...edge, status: "forbidden" as const } : edge.to === "shared" && edge.from === "ui" ? { ...edge, status: "undeclared" as const } : edge)),
    };
    const result = calmGraphView(risky, blueprint);
    expect(result.hiddenComponents.size).toBe(0);
    expect(keys(result)).toEqual(expect.arrayContaining(["ui\u0000db", "ui\u0000shared"]));
  });

  it("keeps pinned components and edges, and is a no-op without anything to hide", () => {
    const pinned = calmGraphView(view, blueprint, { keepComponents: new Set(["tests"]), keepEdges: new Set(["ui\u0000db"]) });
    expect(pinned.hiddenComponents.has("tests")).toBe(false);
    expect(keys(pinned)).toContain("ui\u0000db");
    const plain = calmGraphView({ components: view.components.slice(0, 2), edges: [view.edges[0]] }, blueprint);
    expect(plain.note).toBe("");
    expect(plain.view.edges).toHaveLength(1);
  });
});
