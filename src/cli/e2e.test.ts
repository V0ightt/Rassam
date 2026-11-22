// End-to-end: the real CLI and MCP tools against a small temporary git repository.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureIo } from "./io";
import type { CapturedIo, Io } from "./io";
import { main } from "./main";
import { createMcpHandler } from "./mcp/protocol";
import { commitAll, git, initRepo, makeTempDir, removeDir, write } from "./test-helpers";


type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BLUEPRINT = {
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "ui", name: "UI", kind: "ui", paths: ["src/ui/**"], intent: "Renders pages.\nNever talks to storage directly.", owners: ["@frontend"] },
    { id: "core", name: "Core", kind: "service", paths: ["src/core/**"] },
    { id: "db", name: "Database access", kind: "database", paths: ["src/db/**"] },
  ],
  dependencies: [
    { from: "ui", to: "core" },
    { from: "core", to: "db" },
  ],
  rules: [
    { id: "ui-no-db", kind: "forbid", from: "ui", to: "db", reason: "Pages go through core so access checks cannot be skipped.", provenance: { source: "human", by: "Test Human" } },
  ],
  invariants: [{ id: "orders-balanced", statement: "Order totals equal the sum of their lines.", components: ["core"], check: { run: 'node -e "console.log(\'invariant ok\')"' } }],
  decisions: [{ id: "adr-1", title: "Core owns access checks", status: "accepted", components: ["core"], decision: "All reads go through core." }],
};

async function run(root: string, argv: string[], overrides: Partial<Io> = {}): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo({ cwd: root, ...overrides });
  const code = await main(argv, io);
  return { code, io };
}

async function seed(root: string): Promise<void> {
  await initRepo(root);
  await write(root, "package.json", '{"name":"shop","version":"1.0.0"}\n');
  await write(root, "src/ui/page.ts", 'import { listOrders } from "../core/service";\n\nexport function page(): string {\n  return listOrders().join(",");\n}\n');
  await write(root, "src/core/service.ts", 'import { store } from "../db/store";\n\nexport function listOrders(): string[] {\n  return store.orders;\n}\n');
  await write(root, "src/db/store.ts", "export const store = { orders: [\"a\", \"b\"], url: process.env.DATABASE_URL };\n");
}

describe("rassam CLI end to end", () => {
  let root: string;
  let baseSha: string;

  beforeAll(async () => {
    root = await makeTempDir("rassam-e2e-");
    await seed(root);
    await commitAll(root, "initial");
  });

  afterAll(async () => {
    await removeDir(root);
  });

  it("init derives a draft blueprint and prints next steps", async () => {
    const dry = await run(root, ["init", "--dry-run"]);
    expect(dry.code).toBe(0);
    expect(JSON.parse(dry.io.text()).system.name).toBe("shop");
    expect(existsSync(join(root, ".rassam/blueprint.json"))).toBe(false);

    const { code, io } = await run(root, ["init", "--name", "Shop"]);
    expect(code).toBe(0);
    expect(io.text()).toContain("Wrote .rassam/blueprint.json");
    expect(io.text()).toContain('{"mcpServers":{"rassam":{"command":"npx","args":["rassam","mcp"]}}}');
    expect(io.text()).toContain("action/dist/rassam.mjs");
    const draft = JSON.parse(await readFile(join(root, ".rassam/blueprint.json"), "utf8")) as Json;
    expect(draft.system.name).toBe("Shop");
    expect(draft.components.length).toBeGreaterThan(0);
    expect(draft.components[0].provenance.source).toBe("derived");
    expect(draft.components[0].provenance.by).toBe("Test Human");
  });

  it("init refuses to overwrite without --force", async () => {
    const refused = await run(root, ["init"]);
    expect(refused.code).toBe(2);
    expect(refused.io.errText()).toContain("already exists");
    expect((await run(root, ["init", "--force"])).code).toBe(0);
  });

  it("check passes on the freshly derived draft in every format", async () => {
    const text = await run(root, ["check"]);
    expect(text.code).toBe(0);
    expect(text.io.text()).not.toContain("\u001b[");

    const json = await run(root, ["check", "--format", "json"]);
    const report = JSON.parse(json.io.text()) as Json;
    expect(report).toMatchObject({ mode: "full", tool: { name: "rassam" }, blueprint: { present: true, valid: true } });

    const sarif = await run(root, ["check", "--format", "sarif", "--output", "out/report.sarif", "--sarif-output", "out/second.sarif"]);
    expect(sarif.code).toBe(0);
    expect(sarif.io.text()).toBe("");
    expect((JSON.parse(await readFile(join(root, "out/report.sarif"), "utf8")) as Json).version).toBe("2.1.0");
    expect(existsSync(join(root, "out/second.sarif"))).toBe(true);

    const markdown = await run(root, ["check", "--format", "markdown"]);
    expect(markdown.io.text()).toContain("<!-- rassam:blueprint-check -->");
  });

  it("check fails in full mode when a rule is violated, and --fail-on never overrides", async () => {
    await write(root, ".rassam/blueprint.json", `${JSON.stringify(BLUEPRINT, null, 2)}\n`);
    await write(root, ".gitignore", "out/\n");
    baseSha = await commitAll(root, "Adopt the blueprint");
    expect((await run(root, ["check"])).code).toBe(0);

    await git(root, "checkout", "--quiet", "-b", "feature");
    await write(root, "src/ui/page.ts", 'import { listOrders } from "../core/service";\nimport { store } from "../db/store";\n\nexport function page(): string {\n  return listOrders().concat(store.orders).join(",");\n}\n');
    const failing = await run(root, ["check", "--format", "json"]);
    expect(failing.code).toBe(1);
    const finding = (JSON.parse(failing.io.text()) as Json).findings.find((entry: Json) => entry.ruleId === "ui-no-db");
    expect(finding).toMatchObject({ kind: "forbidden-dependency", severity: "error" });
    expect(finding.locations[0]).toMatchObject({ path: "src/ui/page.ts", line: 2 });
    expect((await run(root, ["check", "--fail-on", "never"])).code).toBe(0);
  });

  it("diff mode judges the change by the base blueprint, even when the change deletes the rule", async () => {
    const weakened = { ...BLUEPRINT, rules: [] };
    await write(root, ".rassam/blueprint.json", `${JSON.stringify(weakened, null, 2)}\n`);
    await commitAll(root, "Let the page read the store\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    await write(root, "src/ui/extra.ts", 'import { store } from "../db/store";\nexport const count = store.orders.length;\n');

    // The head blueprint no longer has the rule, so full mode is green...
    expect((await run(root, ["check"])).code).toBe(0);

    // ...but the gate uses the contract at the merge-base.
    const { code, io } = await run(root, ["check", "--base", "main", "--format", "json"]);
    expect(code).toBe(1);
    const report = JSON.parse(io.text()) as Json;
    expect(report.mode).toBe("diff");
    expect(report.base).toMatchObject({ ref: "main", sha: baseSha });
    expect(report.head.ref).toBe("feature");
    const violations = report.findings.filter((entry: Json) => entry.ruleId === "ui-no-db" && entry.isNew);
    const paths = violations.flatMap((entry: Json) => entry.locations.map((location: Json) => location.path));
    expect(paths).toEqual(expect.arrayContaining(["src/ui/page.ts", "src/ui/extra.ts"]));
    expect(report.contractChanges.some((change: Json) => change.kind === "rule-removed" && change.weakens)).toBe(true);
    expect(report.agentActivity).toMatchObject({ commits: 1, agentCommits: 1 });
    expect(report.agentActivity.agents).toContain("Claude");
    expect(report.approved).not.toBe(true);

    const approved = JSON.parse((await run(root, ["check", "--base", "main", "--format", "json", "--approved"])).io.text()) as Json;
    expect(approved.approved).toBe(true);
  });

  it("explains bad refs and non-repositories with exit code 2", async () => {
    const badRef = await run(root, ["check", "--base", "origin/nope"]);
    expect(badRef.code).toBe(2);
    expect(badRef.io.errText()).toContain('Base ref "origin/nope" does not exist');

    const plain = await makeTempDir("rassam-plain-");
    try {
      await write(plain, "src/a.ts", "export const a = 1;\n");
      const noGit = await run(plain, ["check", "--base", "main"]);
      expect(noGit.code).toBe(2);
      expect(noGit.io.errText()).toContain("needs a git repository");
      const full = await run(plain, ["check"]);
      expect(full.code).toBe(0);
      expect(full.io.errText()).toContain("rassam init");
    } finally {
      await removeDir(plain);
    }
  });

  it("runs invariant commands from the base blueprint only", async () => {
    const hostile = { ...BLUEPRINT, rules: [], invariants: [{ id: "orders-balanced", statement: "x", check: { run: 'node -e "process.exit(7)"' } }] };
    await write(root, ".rassam/blueprint.json", `${JSON.stringify(hostile, null, 2)}\n`);
    const diff = await run(root, ["check", "--base", "main", "--run-invariants", "--format", "json", "--fail-on", "never"]);
    expect(diff.io.errText()).toContain("Running invariant orders-balanced: node -e \"console.log('invariant ok')\"");
    expect((JSON.parse(diff.io.text()) as Json).findings.some((entry: Json) => entry.kind === "invariant-failed")).toBe(false);

    // Full mode has no base: the working tree blueprint's command runs (and fails).
    const full = await run(root, ["check", "--run-invariants", "--format", "json"]);
    const failed = (JSON.parse(full.io.text()) as Json).findings.find((entry: Json) => entry.kind === "invariant-failed");
    expect(failed).toBeDefined();
    expect(JSON.stringify(failed)).toContain("exited with code 7");
    await write(root, ".rassam/blueprint.json", `${JSON.stringify({ ...BLUEPRINT, rules: [] }, null, 2)}\n`);
  });

  it("an invalid blueprint is a configuration error in full mode and a finding in diff mode", async () => {
    const original = await readFile(join(root, ".rassam/blueprint.json"), "utf8");
    await write(root, ".rassam/blueprint.json", '{"version":"0.1","system":{"name":"Shop"},"components":[{"id":"bad id"}]}\n');
    const full = await run(root, ["check"]);
    expect(full.code).toBe(2);
    expect(full.io.errText()).toContain(".rassam/blueprint.json is invalid");
    const explain = await run(root, ["explain", "src/ui/page.ts"]);
    expect(explain.code).toBe(2);

    const diff = await run(root, ["check", "--base", "main", "--format", "json"]);
    expect(diff.code).toBe(1);
    expect((JSON.parse(diff.io.text()) as Json).findings.some((entry: Json) => entry.kind === "invalid-blueprint")).toBe(true);
    await write(root, ".rassam/blueprint.json", original);
  });

  it("--github reads the PR event, writes the summary, prints annotations and posts one comment", async () => {
    const eventDir = await makeTempDir("rassam-gh-");
    try {
      await write(eventDir, "event.json", JSON.stringify({
        pull_request: { number: 7, base: { ref: "main", sha: baseSha }, head: { ref: "feature", sha: "f".repeat(40) }, labels: [{ name: "rassam:approved" }] },
        repository: { full_name: "acme/shop", html_url: "https://github.com/acme/shop" },
      }));
      // No "origin" remote here: the base ref falls back to the event's base sha.
      const calls: Array<{ method: string; url: string; body?: string }> = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", url, body: typeof init?.body === "string" ? init.body : undefined });
        return new Response(JSON.stringify(init?.method === "POST" ? { html_url: "https://github.com/acme/shop/pull/7#c1" } : []), { status: init?.method === "POST" ? 201 : 200 });
      }) as unknown as typeof fetch;
      const env = {
        GITHUB_EVENT_PATH: join(eventDir, "event.json"),
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_BASE_REF: "main",
        GITHUB_TOKEN: "test-token",
        GITHUB_API_URL: "https://api.github.test",
        GITHUB_STEP_SUMMARY: join(eventDir, "summary.md"),
      };
      const { code, io } = await run(root, ["check", "--github", "--comment"], { env, fetch: fetchImpl });
      expect(code).toBe(1);
      expect(io.text()).toMatch(/^::error file=src\/ui\/(page|extra)\.ts,line=\d+/m);
      expect(io.errText()).toContain("PR comment created");

      const summary = await readFile(join(eventDir, "summary.md"), "utf8");
      expect(summary).toContain("<!-- rassam:blueprint-check -->");
      expect(summary).toContain(`https://github.com/acme/shop/blob/${"f".repeat(40)}/src/ui/`);
      expect(calls.map((call) => call.method)).toEqual(["GET", "POST"]);
      expect(calls[1].url).toBe("https://api.github.test/repos/acme/shop/issues/7/comments");
      expect(JSON.parse(calls[1].body ?? "{}").body).toContain("<!-- rassam:blueprint-check -->");

      // JSON on stdout stays parseable: annotations move to stderr.
      const json = await run(root, ["check", "--github", "--format", "json"], { env: { ...env, GITHUB_TOKEN: undefined }, fetch: fetchImpl });
      const report = JSON.parse(json.io.text()) as Json;
      expect(report.mode).toBe("diff");
      expect(report.approved).toBe(true);
      expect(report.head.sha).toBe("f".repeat(40));
      expect(json.io.errText()).toContain("::error ");
    } finally {
      await removeDir(eventDir);
    }
  });

  it("explain, impact, graph and reach answer from the blueprint", async () => {
    await git(root, "checkout", "--quiet", "--", ".rassam/blueprint.json");
    await git(root, "checkout", "--quiet", "main", "--", ".rassam/blueprint.json");

    const explain = await run(join(root, "src"), ["explain", "ui/page.ts"]);
    expect(explain.code).toBe(0);
    expect(explain.io.text()).toContain("Component: UI (ui, ui)");
    expect(explain.io.text()).toContain("Never talks to storage directly.");
    expect(explain.io.text()).toContain("ui-no-db");
    expect(explain.io.text()).toContain("Pages go through core");
    const explained = JSON.parse((await run(root, ["explain", "src/ui/page.ts", "--format", "json"])).io.text()) as Json;
    expect(explained.component.id).toBe("ui");
    expect(explained.forbiddenComponents).toContain("db");
    expect((await run(root, ["explain", "../outside.ts"])).code).toBe(2);

    const impact = await run(root, ["impact", "src/db/store.ts"]);
    expect(impact.io.text()).toContain("Touches db:");
    expect(impact.io.text()).toMatch(/- core\s+\(direct\)/);
    const impactJson = JSON.parse((await run(root, ["impact", "src/db/store.ts", "--format=json"])).io.text()) as Json;
    expect(impactJson.dependents.map((entry: Json) => entry.id)).toEqual(expect.arrayContaining(["core", "ui"]));

    const mermaid = await run(root, ["graph"]);
    expect(mermaid.io.text()).toMatch(/^(flowchart|graph) /m);
    expect((await run(root, ["graph", "--format", "dot"])).io.text()).toContain("digraph");
    const graph = JSON.parse((await run(root, ["graph", "--format", "json"])).io.text()) as Json;
    expect(graph.components.map((component: Json) => component.id)).toEqual(["ui", "core", "db"]);
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: "ui", to: "db", status: "forbidden" }));

    await write(root, ".mcp.json", '{"mcpServers":{"rassam":{"command":"npx","args":["rassam","mcp"]}}}\n');
    const reach = await run(root, ["reach"]);
    expect(reach.code).toBe(0);
    expect(reach.io.text()).toContain(".mcp.json");
    expect(reach.io.text()).toContain("DATABASE_URL");
    const reachJson = JSON.parse((await run(root, ["reach", "--format", "json"])).io.text()) as Json;
    expect(reachJson.mcpServers.map((server: Json) => server.name)).toContain("rassam");
  });

  it("verify stamps a human sign-off into the blueprint", async () => {
    const { code, io } = await run(root, ["verify", "ui-no-db", "--note", "Read every page"]);
    expect(code).toBe(0);
    expect(io.text()).toContain("Signed rule ui-no-db");
    expect(io.text()).toContain("reviewed in the pull request");
    const saved = JSON.parse(await readFile(join(root, ".rassam/blueprint.json"), "utf8")) as Json;
    expect(saved.rules[0].verified).toMatchObject({ by: "Test Human", note: "Read every page", commit: await git(root, "rev-parse", "HEAD") });
    expect(Date.parse(saved.rules[0].verified.at)).not.toBeNaN();

    expect((await run(root, ["verify", "ui->core", "--by", "Ada"])).code).toBe(0);
    const again = JSON.parse(await readFile(join(root, ".rassam/blueprint.json"), "utf8")) as Json;
    expect(again.dependencies[0].verified.by).toBe("Ada");

    const unknown = await run(root, ["verify", "nope"]);
    expect(unknown.code).toBe(2);
    expect(unknown.io.errText()).toContain('"nope"');
  });

  describe("MCP tools", () => {
    let call: (name: string, args?: Json) => Promise<Json>;

    beforeAll(async () => {
      const { createTools, SERVER_INSTRUCTIONS } = await import("./mcp/tools");
      const tools = createTools({ root, now: () => new Date("2026-11-21T10:15:00.000Z") });
      const handler = createMcpHandler({ name: "rassam", title: "Rassam Blueprint", version: "0", instructions: SERVER_INSTRUCTIONS, tools });
      let id = 0;
      call = async (name, args = {}) => {
        const response = (await handler.handleMessage({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } })) as Json;
        expect(response.error).toBeUndefined();
        return response.result as Json;
      };
    });

    it("exposes eleven tools; only the two note-writing tools are not read-only", async () => {
      const { createTools, SERVER_INSTRUCTIONS } = await import("./mcp/tools");
      const tools = createTools({ root });
      expect(tools.map((tool) => tool.name)).toEqual(["blueprint_overview", "explain_path", "get_component", "check_dependency", "impact", "check_changes", "list_decisions", "architecture_diff", "system_status", "propose_change", "report_conflict"]);
      expect(tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name)).toEqual(["propose_change", "report_conflict"]);
      expect(tools.every((tool) => tool.annotations.destructiveHint === false && tool.inputSchema.type === "object")).toBe(true);
      for (const word of ["explain_path", "check_dependency", "check_changes", "report_conflict"]) expect(SERVER_INSTRUCTIONS).toContain(word);
    });

    it("blueprint_overview summarizes the contract", async () => {
      const result = await call("blueprint_overview");
      expect(result.isError).toBe(false);
      const overview = result.structuredContent as Json;
      expect(overview.system.name).toBe("Shop");
      expect(overview.components.find((component: Json) => component.id === "ui")).toMatchObject({ kind: "ui", fileCount: 2, intent: "Renders pages." });
      expect(overview.rules[0]).toMatchObject({ id: "ui-no-db", kind: "forbid", severity: "error" });
      expect(overview.counts).toMatchObject({ components: 3, rules: 1, invariants: 1, decisions: 1 });
      expect(overview.humanAuthoredRatio).toBeGreaterThan(0);
      expect(overview.howToUse).toContain("explain_path");
      expect(JSON.parse(result.content[0].text)).toEqual(overview);
    });

    it("explain_path and get_component describe ownership and constraints", async () => {
      const explained = (await call("explain_path", { path: "src\\ui\\page.ts" })).structuredContent as Json;
      expect(explained.component).toMatchObject({ id: "ui", owners: ["@frontend"] });
      expect(explained.constraints.map((rule: Json) => rule.id)).toContain("ui-no-db");
      const contract = (await call("explain_path", { path: ".rassam/blueprint.json" })).structuredContent as Json;
      expect(contract.protected).toBe(true);

      const component = (await call("get_component", { id: "core" })).structuredContent as Json;
      expect(component.files).toEqual(["src/core/service.ts"]);
      expect(component.decisions.map((decision: Json) => decision.id)).toEqual(["adr-1"]);

      const unknown = await call("get_component", { id: "nope" });
      expect(unknown.isError).toBe(true);
      expect(unknown.content[0].text).toContain("Components: ui, core, db");
      const outside = await call("explain_path", { path: "../../etc/passwd" });
      expect(outside.isError).toBe(true);
    });

    it("check_dependency answers before the import is written", async () => {
      const denied = (await call("check_dependency", { from_path: "src/ui/new.ts", target: "src/db/store.ts" })).structuredContent as Json;
      expect(denied.allowed).toBe(false);
      expect(denied.violations[0]).toMatchObject({ ruleId: "ui-no-db", reason: "Pages go through core so access checks cannot be skipped." });
      const allowed = (await call("check_dependency", { from_path: "src/ui/new.ts", target: "src/core/service.ts" })).structuredContent as Json;
      expect(allowed.allowed).toBe(true);
      const pkg = (await call("check_dependency", { from_path: "src/ui/new.ts", target: "@scope/pkg" })).structuredContent as Json;
      expect(pkg.target).toMatchObject({ kind: "external" });
    });

    it("impact and list_decisions", async () => {
      const impact = (await call("impact", { paths: ["src/db/store.ts"] })).structuredContent as Json;
      expect(impact.touchedComponents[0].id).toBe("db");
      expect((await call("impact", { paths: [] })).isError).toBe(true);

      const all = (await call("list_decisions")).structuredContent as Json;
      expect(all.count).toBe(1);
      expect(((await call("list_decisions", { component: "ui" })).structuredContent as Json).count).toBe(0);
      expect((await call("list_decisions", { component: "nope" })).isError).toBe(true);
    });

    it("check_changes runs the gate against the default branch", async () => {
      const result = await call("check_changes");
      expect(result.isError).toBe(false);
      const outcome = result.structuredContent as Json;
      expect(outcome).toMatchObject({ verdict: "fail", mode: "diff", base: { ref: "main" } });
      expect(outcome.findings.some((finding: Json) => finding.ruleId === "ui-no-db")).toBe(true);
      expect(outcome.findings.every((finding: Json) => finding.isNew)).toBe(true);
      expect(outcome.next).toContain("report_conflict");

      const bad = await call("check_changes", { base: "origin/nope" });
      expect(bad.isError).toBe(true);
      expect(bad.content[0].text).toContain("does not exist");
    });

    it("propose_change writes a proposal and never touches the blueprint", async () => {
      const before = await readFile(join(root, ".rassam/blueprint.json"), "utf8");
      const result = await call("propose_change", { title: "Allow UI → DB for reports!", rationale: "Reports need raw rows.", changes: "Remove rule ui-no-db for src/ui/reports/**", agent: "Claude Code" });
      expect(result.isError).toBe(false);
      const { file } = result.structuredContent as Json;
      expect(file).toBe(".rassam/proposals/20261121T101500Z-allow-ui-db-for-reports.json");
      expect(JSON.parse(await readFile(join(root, file), "utf8"))).toEqual({
        title: "Allow UI → DB for reports!",
        rationale: "Reports need raw rows.",
        changes: "Remove rule ui-no-db for src/ui/reports/**",
        agent: "Claude Code",
        createdAt: "2026-11-21T10:15:00.000Z",
        status: "pending",
      });
      expect(result.content[0].text).toContain("human");
      expect(await readFile(join(root, ".rassam/blueprint.json"), "utf8")).toBe(before);

      // Same title, same second: a new file, never an overwrite.
      const second = (await call("propose_change", { title: "Allow UI → DB for reports!", rationale: "r", changes: "c" })).structuredContent as Json;
      expect(second.file).toBe(".rassam/proposals/20261121T101500Z-allow-ui-db-for-reports-2.json");
      expect((await call("propose_change", { title: "x" })).isError).toBe(true);
    });

    it("report_conflict records an escalation and tells the agent to stop", async () => {
      const result = await call("report_conflict", { summary: "Task needs UI to read the DB", rule_id: "ui-no-db", paths: ["src/ui/page.ts"], details: "Asked to inline the query." });
      expect(result.isError).toBe(false);
      const outcome = result.structuredContent as Json;
      expect(outcome.file).toBe(".rassam/escalations/20261121T101500Z-task-needs-ui-to-read-the-db.json");
      expect(outcome.instruction).toMatch(/Stop work on the conflicting part/);
      expect(outcome.instruction).toMatch(/Do not weaken or delete tests/);
      expect(JSON.parse(await readFile(join(root, outcome.file), "utf8"))).toMatchObject({ summary: "Task needs UI to read the DB", ruleId: "ui-no-db", paths: ["src/ui/page.ts"], status: "open", agent: "unknown agent" });
      expect((await readdir(join(root, ".rassam/escalations"))).length).toBe(1);
    });

    it("rassam proposals lists what agents filed", async () => {
      const { code, io } = await run(root, ["proposals"]);
      expect(code).toBe(0);
      expect(io.text()).toContain("Escalations");
      expect(io.text()).toContain("Task needs UI to read the DB");
      expect(io.text()).toContain("Allow UI → DB for reports!");
      expect(io.text()).toContain("Claude Code · 2026-11-21T10:15:00.000Z · pending");
      const listed = JSON.parse((await run(root, ["proposals", "--format", "json"])).io.text()) as Json;
      expect(listed.entries.map((entry: Json) => entry.type).sort()).toEqual(["escalation", "proposal", "proposal"]);
    });

    it("tools report a missing blueprint as a tool error", async () => {
      const empty = await makeTempDir("rassam-empty-");
      try {
        const { createTools } = await import("./mcp/tools");
        const handler = createMcpHandler({ name: "rassam", title: "t", version: "0", instructions: "", tools: createTools({ root: empty }) });
        const response = (await handler.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "explain_path", arguments: { path: "a.ts" } } })) as Json;
        expect(response.result.isError).toBe(true);
        expect(response.result.content[0].text).toContain("rassam init");
        const check = (await handler.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "check_changes", arguments: {} } })) as Json;
        expect(check.result.structuredContent).toMatchObject({ mode: "full", verdict: "pass" });
      } finally {
        await removeDir(empty);
      }
    });
  });

  it("the real `rassam mcp` process keeps stdout pure and exits on stdin EOF", async () => {
    const tsx = join(__dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsx, join(__dirname, "index.ts"), "mcp", "--root", root], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "explain_path", arguments: { path: "src/ui/page.ts" } } },
      { jsonrpc: "2.0", id: 4, method: "server/discover" },
    ];
    child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`);
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    expect(code).toBe(0);
    const lines = Buffer.concat(out).toString("utf8").split("\n").filter(Boolean);
    const messages = lines.map((line) => JSON.parse(line) as Json);
    expect(messages.map((message) => message.id)).toEqual([1, 2, 3, 4]);
    expect(messages[0].result.serverInfo).toMatchObject({ name: "rassam", title: "Rassam Blueprint" });
    expect(messages[0].result.instructions).toContain("report_conflict");
    expect(messages[1].result.tools).toHaveLength(11);
    expect(messages[2].result.structuredContent.component.id).toBe("ui");
    expect(messages[3].result.resultType).toBe("complete");
    expect(Buffer.concat(err).toString("utf8")).toContain("[rassam mcp] serving");
  }, 30_000);
});
