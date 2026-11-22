// Renders Rassam's own blueprint as the README system diagram, with a made-up
// runtime status, so the drawing can be judged by eye:
//
//   npx tsx scripts/preview-diagram.ts [output-directory]
//
// Not part of the build; the output goes to the temp directory by default.

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { diffArchitecture } from "../src/blueprint/arch-diff";
import { renderStatusBadge, renderSystemDiagram, type SystemDiagramInput } from "../src/blueprint/diagram";
import { parseBlueprintText } from "../src/blueprint/schema";
import { summarizeStatus, type SystemStatus } from "../src/blueprint/status";
import { createWorkspace, type WorkspaceGraphView } from "../src/blueprint/workspace";
import { loadWorkingTree } from "../src/cli/fs-source";

async function main(): Promise<void> {
  const root = process.cwd();
  const outputDir = path.resolve(process.argv[2] ?? path.join(tmpdir(), "rassam-preview"));
  const tree = await loadWorkingTree(root);
  if (!tree.blueprintText) throw new Error("No .rassam/blueprint.json in the working directory.");
  const parsed = parseBlueprintText(tree.blueprintText);
  if (!parsed.ok) throw new Error(`Invalid blueprint: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);

  // Pretend the first four components are deployed, to exercise the status overlay.
  const sample = parsed.blueprint.components.filter((component) => !component.external).slice(0, 5);
  const blueprint = {
    ...parsed.blueprint,
    components: parsed.blueprint.components.map((component) =>
      sample.includes(component) ? { ...component, runtime: { health: { url: `https://example.com/health/${component.id}` } } } : component,
    ),
  };
  const states = ["up", "up", "degraded", "down"] as const;
  const generatedAt = "2026-01-01T12:00:00Z";
  const status: SystemStatus = {
    version: 1,
    checkedAt: generatedAt,
    components: Object.fromEntries(sample.slice(0, 4).map((component, index) => [component.id, { state: states[index], source: "health-check" as const }])),
  };

  const workspace = createWorkspace(tree.files, blueprint);
  const view = workspace.graphView();
  const report = workspace.check();
  const fileCounts = Object.fromEntries([...workspace.componentGraph.membership.componentFiles].map(([id, files]) => [id, files.length]));

  // A pretend previous commit: one component and one dependency fewer, one component since removed.
  const dropped = view.components[view.components.length - 1]?.id;
  const before: WorkspaceGraphView = {
    components: [...view.components.filter((component) => component.id !== dropped), { id: "legacy-map", name: "Legacy map" }],
    edges: [...view.edges.filter((edge) => edge.from !== dropped && edge.to !== dropped).slice(1), { from: "legacy-map", to: view.components[0].id, status: "declared" }],
  };

  const input: SystemDiagramInput = {
    title: blueprint.system.name,
    subtitle: "System design, checked against the blueprint on every commit",
    view,
    blueprint,
    status,
    findings: { errors: report.summary.errors, warnings: report.summary.warnings },
    commit: "fb8a6850c0ffee",
    generatedAt,
    fileCounts,
  };

  mkdirSync(outputDir, { recursive: true });
  const outputs: Array<[string, string]> = [
    ["system-light.svg", renderSystemDiagram(input, { theme: "light" })],
    ["system-dark.svg", renderSystemDiagram(input, { theme: "dark" })],
    ["system-diff-light.svg", renderSystemDiagram({ ...input, diff: diffArchitecture(before, view) }, { theme: "light" })],
    ["system-tb-dark.svg", renderSystemDiagram(input, { theme: "dark", direction: "TB" })],
    ["badge-blueprint.svg", renderStatusBadge({ label: "blueprint", message: report.summary.errors ? "failing" : "passing", tone: report.summary.errors ? "error" : "ok" })],
    ["badge-system.svg", renderStatusBadge({ label: "system", message: summarizeStatus(status, blueprint).overall, tone: "error" }, { theme: "dark" })],
  ];
  for (const [name, svg] of outputs) {
    const file = path.join(outputDir, name);
    writeFileSync(file, svg, "utf8");
    const numbers = [...svg.matchAll(/(?:x|y|cx|cy|width|height)="(-?[\d.]+|NaN|Infinity)"/g)].map((match) => Number(match[1]));
    const bad = /NaN|Infinity|undefined/.test(svg) || numbers.some((value) => !Number.isFinite(value));
    process.stdout.write(`${file}  ${svg.length} bytes${bad ? "  (!) contains NaN/Infinity/undefined" : ""}\n`);
  }
  process.stdout.write(`${view.components.length} components, ${view.edges.length} edges, ${report.summary.errors} errors, ${report.summary.warnings} warnings\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
