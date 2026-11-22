import { describe, expect, it } from "vitest";
import { diffArchitecture } from "./arch-diff";
import { blueprintSchema, type BlueprintInput } from "./schema";
import type { SourceFile } from "./types";
import { createWorkspace, type WorkspaceGraphView } from "./workspace";

const file = (path: string, content: string): SourceFile => ({ path, content });

function viewOf(files: SourceFile[], input: Partial<BlueprintInput>): WorkspaceGraphView {
  const blueprint = blueprintSchema.parse({ version: "0.1", system: { name: "Shop" }, components: [], ...input });
  return createWorkspace(files, blueprint).graphView();
}

const baseFiles = [
  file("src/ui/page.ts", 'import { handle } from "../api/handler";\nexport const page = handle;\n'),
  file("src/api/handler.ts", 'import { query } from "../db/client";\nexport const handle = query;\n'),
  file("src/db/client.ts", "export const query = 1;\n"),
];
const components = [
  { id: "ui", name: "UI", paths: ["src/ui/**"] },
  { id: "api", name: "API", paths: ["src/api/**"] },
  { id: "db", name: "Database", paths: ["src/db/**"] },
];
const dependencies = [
  { from: "ui", to: "api" },
  { from: "api", to: "db" },
];
const rules = [{ id: "ui-not-db", kind: "forbid" as const, from: "ui", to: "db" }];

describe("diffArchitecture", () => {
  const before = viewOf(baseFiles, { components, dependencies, rules });

  it("reports nothing without a baseline", () => {
    expect(diffArchitecture(null, before)).toEqual({
      components: { added: [], removed: [] },
      edges: { added: [], removed: [], statusChanged: [] },
      summary: "No previous architecture to compare",
      changed: false,
    });
  });

  it("reports no change for identical views", () => {
    const diff = diffArchitecture(before, viewOf(baseFiles, { components, dependencies, rules }));
    expect(diff.changed).toBe(false);
    expect(diff.summary).toBe("No architecture changes");
    expect(diff.edges).toEqual({ added: [], removed: [], statusChanged: [] });
  });

  it("finds added and removed components and dependencies", () => {
    const after = viewOf(
      [
        baseFiles[0],
        file("src/api/handler.ts", 'import { push } from "../queue/push";\nexport const handle = push;\n'),
        file("src/queue/push.ts", "export const push = 1;\n"),
        file("src/mail/send.ts", "export const send = 1;\n"),
      ],
      {
        components: [components[0], components[1], { id: "queue", name: "Queue", paths: ["src/queue/**"] }, { id: "mail", name: "Mail", paths: ["src/mail/**"] }],
        dependencies: [dependencies[0], { from: "api", to: "queue" }],
      },
    );
    const diff = diffArchitecture(before, after);
    expect(diff.components).toEqual({ added: ["mail", "queue"], removed: ["db"] });
    expect(diff.edges.added.map((edge) => `${edge.from}>${edge.to}:${edge.status}`)).toEqual(["api>queue:declared"]);
    expect(diff.edges.removed.map((edge) => `${edge.from}>${edge.to}:${edge.status}`)).toEqual(["api>db:declared"]);
    expect(diff.edges.statusChanged).toEqual([]);
    expect(diff.summary).toBe("2 components added, 1 component removed, 1 dependency added, 1 dependency removed");
    expect(diff.changed).toBe(true);
  });

  it("finds dependencies that changed status", () => {
    const after = viewOf(
      [file("src/ui/page.ts", 'import { handle } from "../api/handler";\nimport { query } from "../db/client";\nexport const page = [handle, query];\n'), baseFiles[2], file("src/api/handler.ts", "export const handle = 1;\n")],
      { components, dependencies: [dependencies[1]], rules },
    );
    const diff = diffArchitecture(before, after);
    expect(diff.components).toEqual({ added: [], removed: [] });
    expect(diff.edges.added).toMatchObject([{ from: "ui", to: "db", status: "forbidden" }]);
    expect(diff.edges.statusChanged).toEqual([
      { from: "api", to: "db", before: "declared", after: "missing" },
      { from: "ui", to: "api", before: "declared", after: "undeclared" },
    ]);
    expect(diff.summary).toBe("1 dependency added, 1 dependency became undeclared, 1 declared dependency no longer observed");
  });

  it("words status changes and plurals", () => {
    const view = (status: "declared" | "forbidden"): WorkspaceGraphView => ({
      components: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      edges: [{ from: "a", to: "b", status }, { from: "a", to: "c", status }],
    });
    expect(diffArchitecture(view("declared"), view("forbidden")).summary).toBe("2 dependencies became forbidden");
    expect(diffArchitecture(view("forbidden"), view("declared")).summary).toBe("2 dependencies became declared");
  });

  it("orders results deterministically whatever the input order", () => {
    const one: WorkspaceGraphView = { components: [{ id: "z", name: "Z" }], edges: [] };
    const two: WorkspaceGraphView = {
      components: [{ id: "m", name: "M" }, { id: "b", name: "B" }, { id: "z", name: "Z" }, { id: "a", name: "A" }],
      edges: [{ from: "m", to: "b", status: "declared" }, { from: "a", to: "z", status: "undeclared" }, { from: "a", to: "b", status: "declared" }, { from: "a", to: "b", status: "forbidden" }],
    };
    const shuffled: WorkspaceGraphView = { components: [...two.components].reverse(), edges: [two.edges[1], two.edges[2], two.edges[0]] };
    const diff = diffArchitecture(one, two);
    expect(diff.components.added).toEqual(["a", "b", "m"]);
    expect(diff.edges.added.map((edge) => `${edge.from}>${edge.to}`)).toEqual(["a>b", "a>z", "m>b"]);
    expect(diff.edges.added[0].status).toBe("declared");
    expect(diffArchitecture(one, shuffled)).toEqual(diff);
    expect(diffArchitecture(two, one).edges.removed.map((edge) => `${edge.from}>${edge.to}`)).toEqual(["a>b", "a>z", "m>b"]);
  });
});
