// The live system design: `rassam render`, `rassam status`, `rassam do` and
// the two MCP tools that read them, against a small temporary git repository.

import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSystemStatus } from "../blueprint/status";
import { booleanFlag, numberFlag, parseArgs, stringFlag } from "./args";
import { captureIo } from "./io";
import type { CapturedIo, Io } from "./io";
import { parseRepoUrl } from "./live";
import { main } from "./main";
import { createMcpHandler } from "./mcp/protocol";
import { combineSignals, safeHealthUrl } from "./probe";
import { README_END, README_START, renderReadmeBlock, updateReadme } from "./readme";
import { commitAll, git, initRepo, makeTempDir, removeDir, write } from "./test-helpers";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BLUEPRINT = {
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "ui", name: "UI", kind: "frontend", paths: ["src/ui/**"], intent: "Renders pages.\nNever talks to storage directly.", runtime: { health: { url: "https://shop.example/health?probe=1" } } },
    { id: "core-api", name: "Core API", kind: "service", paths: ["src/core/**"], intent: "Owns orders | and <access> checks." },
    { id: "core-db", name: "Core DB", kind: "database", paths: ["src/db/**"], provenance: { source: "derived" } },
  ],
  dependencies: [
    { from: "ui", to: "core-api" },
    { from: "core-api", to: "core-db" },
  ],
  rules: [{ id: "ui-no-db", kind: "forbid", from: "ui", to: "core-db", reason: "Pages go through the API." }],
};

const T1 = new Date("2026-11-21T10:15:30.000Z");
const T2 = new Date("2026-11-21T10:20:00.000Z");

async function run(root: string, argv: string[], overrides: Partial<Io> = {}): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo({ cwd: root, now: () => T1, ...overrides });
  const code = await main(argv, io);
  return { code, io };
}

async function seed(root: string, blueprint: unknown = BLUEPRINT): Promise<void> {
  await initRepo(root);
  await write(root, "package.json", '{"name":"shop","version":"1.0.0"}\n');
  await write(root, "src/ui/page.ts", 'import { listOrders } from "../core/service";\n\nexport const page = listOrders;\n');
  await write(root, "src/core/service.ts", 'import { store } from "../db/store";\n\nexport function listOrders(): string[] {\n  return store.orders;\n}\n');
  await write(root, "src/db/store.ts", 'export const store = { orders: ["a", "b"] };\n');
  await write(root, ".rassam/blueprint.json", `${JSON.stringify(blueprint, null, 2)}\n`);
}

const readJson = async (root: string, path: string): Promise<Json> => JSON.parse(await readFile(join(root, path), "utf8")) as Json;

describe("arguments of the live commands", () => {
  it("parses render with defaults and an optional --readme value", () => {
    const plain = parseArgs(["render"]);
    expect(stringFlag(plain, "out")).toBe(".rassam/live");
    expect(stringFlag(plain, "theme")).toBe("both");
    expect(stringFlag(plain, "detail")).toBe("calm");
    expect(stringFlag(plain, "format")).toBe("svg");
    expect(numberFlag(plain, "statusMaxAge")).toBe(60);
    expect(plain.flags.readme).toBeUndefined();
    expect(booleanFlag(plain, "stamp")).toBe(false);

    expect(parseArgs(["render", "--readme"]).flags.readme).toBe(true);
    const beforeFlag = parseArgs(["render", "--readme", "--stamp", "--base", "HEAD~1"]);
    expect(beforeFlag.flags.readme).toBe(true);
    expect(booleanFlag(beforeFlag, "stamp")).toBe(true);
    expect(stringFlag(beforeFlag, "base")).toBe("HEAD~1");
    expect(parseArgs(["render", "--readme", "docs/README.md"]).flags.readme).toBe("docs/README.md");
    expect(parseArgs(["render", "--readme=docs/README.md", "--image-base", ".rassam/live", "--link=https://x.test"]).flags).toMatchObject({ readme: "docs/README.md", imageBase: ".rassam/live", link: "https://x.test" });
    expect(() => parseArgs(["render", "--theme", "sepia"])).toThrow(/light, dark, both/);
    expect(() => parseArgs(["render", "extra"])).toThrow(/no positional/);
  });

  it("parses status and do", () => {
    const status = parseArgs(["status", "--write", "--github", "--timeout", "250", "--fail-on-down"]);
    expect(status.flags).toMatchObject({ write: true, github: true, timeout: 250, failOnDown: true, format: "text" });
    expect(numberFlag(parseArgs(["status"]), "timeout")).toBe(5000);

    const instruction = parseArgs(["do", "forbid ui from importing db", "--write", "--allow-weakening", "--choose", "2"]);
    expect(instruction.positionals).toEqual(["forbid ui from importing db"]);
    expect(instruction.flags).toMatchObject({ write: true, allowWeakening: true, choose: 2 });
    expect(parseArgs(["do", "forbid", "ui", "from", "importing", "db"]).positionals).toHaveLength(5);
    expect(() => parseArgs(["do"])).toThrow(/expects <instruction/);
  });
});

describe("rassam render", () => {
  let root: string;
  const FILES = ["badge-blueprint.svg", "badge-system.svg", "system-dark.svg", "system-light.svg", "system.json"];

  beforeAll(async () => {
    root = await makeTempDir("rassam-live-");
    await seed(root);
    await commitAll(root, "initial");
  });

  afterAll(async () => {
    await removeDir(root);
  });

  it("writes the diagrams, the badges and system.json", async () => {
    const { code, io } = await run(root, ["render"]);
    expect(io.errText()).toBe("");
    expect(code).toBe(0);
    expect((await readdir(join(root, ".rassam/live"))).sort()).toEqual(FILES);
    expect(io.text()).toContain("Shop: 3 components, 2 dependencies · blueprint passing · system no data");
    expect(io.text().match(/wrote {5}/g)).toHaveLength(5);

    const light = await readFile(join(root, ".rassam/live/system-light.svg"), "utf8");
    const dark = await readFile(join(root, ".rassam/live/system-dark.svg"), "utf8");
    expect(light).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(light).not.toBe(dark);
    expect(light).toContain('data-component="core-api"');
    expect(light).toContain('data-mark="derived"');
    expect(light).not.toMatch(/<script|foreignObject|href=/);
    // The commit is drawn, the time is not: the same commit always gives the same picture.
    expect(light).toContain(`>${(await git(root, "rev-parse", "HEAD")).slice(0, 7)}</text>`);
    expect(light).not.toContain("2026-11-21");
    expect(await readFile(join(root, ".rassam/live/badge-blueprint.svg"), "utf8")).toContain(">blueprint: passing</title>");
    expect(await readFile(join(root, ".rassam/live/badge-system.svg"), "utf8")).toContain(">system: no data</title>");

    const document = await readJson(root, ".rassam/live/system.json");
    expect(document).toMatchObject({ schemaVersion: 1, system: "Shop", generatedAt: "2026-11-21T10:15:30Z", verdict: "pass", status: null, base: null, diff: null });
    expect(document.commit).toBe(await git(root, "rev-parse", "HEAD"));
    expect(document.summary.errors).toBe(0);
    expect(document.graph.components.map((component: Json) => [component.id, component.files])).toEqual([["ui", 1], ["core-api", 1], ["core-db", 1]]);
    expect(document.graph.edges).toHaveLength(2);
  });

  it("is deterministic: a later run with nothing changed rewrites nothing", async () => {
    const before = await Promise.all(FILES.map((name) => readFile(join(root, ".rassam/live", name), "utf8")));
    const { code, io } = await run(root, ["render"], { now: () => T2 });
    expect(code).toBe(0);
    expect(io.text()).not.toContain("wrote  ");
    expect(io.text().match(/unchanged/g)).toHaveLength(5);
    expect(await Promise.all(FILES.map((name) => readFile(join(root, ".rassam/live", name), "utf8")))).toEqual(before);

    // A fresh directory at another time gives byte-identical pictures; only system.json carries the time.
    await run(root, ["render", "--out", "out/again"], { now: () => T2 });
    for (const [index, name] of FILES.entries()) {
      const again = await readFile(join(root, "out/again", name), "utf8");
      if (name === "system.json") expect(JSON.parse(again)).toEqual({ ...JSON.parse(before[index]), generatedAt: "2026-11-21T10:20:00Z" });
      else expect(again).toBe(before[index]);
    }
    await rm(join(root, "out"), { recursive: true });
  });

  it("--stamp draws the time, --theme limits the files, --detail and --format are honored", async () => {
    await run(root, ["render", "--out", "out/stamped", "--stamp", "--theme", "dark"]);
    expect((await readdir(join(root, "out/stamped"))).sort()).toEqual(FILES.filter((name) => name !== "system-light.svg"));
    expect(await readFile(join(root, "out/stamped/system-dark.svg"), "utf8")).toContain("2026-11-21 10:15 UTC");

    const json = await run(root, ["render", "--format", "json", "--out", "out/none"]);
    expect(JSON.parse(json.io.text())).toMatchObject({ schemaVersion: 1, system: "Shop" });
    const mermaid = await run(root, ["render", "--format", "mermaid", "--out", "out/none"]);
    expect(mermaid.io.text()).toMatch(/^flowchart LR/);
    expect(existsSync(join(root, "out/none"))).toBe(false);

    const full = await run(root, ["render", "--out", "out/full", "--detail", "full"]);
    expect(full.code).toBe(0);
    await rm(join(root, "out"), { recursive: true });
  });

  it("shows violations without failing, and fails only on configuration errors", async () => {
    await write(root, "src/ui/page.ts", 'import { store } from "../db/store";\n\nexport const page = store;\n');
    const { code, io } = await run(root, ["render", "--out", "out/broken"]);
    expect(code).toBe(0);
    expect(io.text()).toContain("blueprint failing");
    expect(await readFile(join(root, "out/broken/badge-blueprint.svg"), "utf8")).toContain(">blueprint: failing</title>");
    const svg = await readFile(join(root, "out/broken/system-light.svg"), "utf8");
    expect(svg).toContain('data-edge="forbidden"');
    expect(svg).toContain('data-badge="violations"');
    expect((await readJson(root, "out/broken/system.json")).verdict).toBe("fail");
    await git(root, "checkout", "--quiet", "--", "src/ui/page.ts");
    await rm(join(root, "out"), { recursive: true });

    const missing = await run(root, ["render", "--status", "nope.json"]);
    expect(missing.code).toBe(2);
    expect(missing.io.errText()).toContain("nope.json does not exist");
    const badBase = await run(root, ["render", "--base", "no-such-ref"]);
    expect(badBase.code).toBe(2);
  });

  it("overlays the status file and refuses to draw stale status as current", async () => {
    await write(root, ".rassam/status.json", `${JSON.stringify({ version: 1, checkedAt: "2026-11-21T10:10:00Z", components: { ui: { state: "up", source: "health-check" } } })}\n`);
    const fresh = await run(root, ["render", "--out", "out/status", "--stamp"]);
    expect(fresh.io.errText()).toBe("");
    expect(fresh.io.text()).toContain("system operational");
    const svg = await readFile(join(root, "out/status/system-light.svg"), "utf8");
    expect(svg).toContain('data-state="up"');
    // The stamp is the time of the probe, not the time of the drawing.
    expect(svg).toContain("2026-11-21 10:10 UTC");
    expect(await readFile(join(root, "out/status/badge-system.svg"), "utf8")).toContain(">system: operational</title>");
    expect((await readJson(root, "out/status/system.json")).status).toMatchObject({ checkedAt: "2026-11-21T10:10:00Z", stale: false, summary: { up: 1, monitored: 1, overall: "operational" } });

    const stale = await run(root, ["render", "--out", "out/stale"], { now: () => new Date("2026-11-21T12:00:00Z") });
    expect(stale.code).toBe(0);
    expect(stale.io.errText()).toContain("older than 60 minutes");
    const staleSvg = await readFile(join(root, "out/stale/system-light.svg"), "utf8");
    expect(staleSvg).not.toContain('data-state="up"');
    expect(staleSvg).toContain('data-state="unknown"');
    expect((await readJson(root, "out/stale/system.json")).status).toMatchObject({ stale: true, summary: { up: 0, unknown: 1 } });

    await write(root, ".rassam/status.json", "{ not json");
    const broken = await run(root, ["render", "--out", "out/stale"]);
    expect(broken.code).toBe(0);
    expect(broken.io.errText()).toContain("ignoring .rassam/status.json");
    await rm(join(root, ".rassam/status.json"));
    await rm(join(root, "out"), { recursive: true });
  });

  it("--base draws what the change did to the architecture", async () => {
    const next = {
      ...BLUEPRINT,
      components: [...BLUEPRINT.components, { id: "payments", name: "Payments", kind: "service", paths: ["src/payments/**"] }],
      dependencies: [...BLUEPRINT.dependencies, { from: "payments", to: "core-db" }],
    };
    await write(root, ".rassam/blueprint.json", `${JSON.stringify(next, null, 2)}\n`);
    await write(root, "src/payments/charge.ts", 'import { store } from "../db/store";\n\nexport const charge = store;\n');
    // Uncommitted work counts, like in the gate.
    const dirty = await run(root, ["render", "--out", "out/diff", "--base", "HEAD"]);
    expect(dirty.code).toBe(0);
    expect(dirty.io.text()).toContain("Since HEAD: 1 component added, 1 dependency added");
    await commitAll(root, "add payments");

    const { code, io } = await run(root, ["render", "--out", "out/diff", "--base", "HEAD~1"]);
    expect(code).toBe(0);
    expect(io.text()).toContain("Since HEAD~1: 1 component added, 1 dependency added");
    const document = await readJson(root, "out/diff/system.json");
    expect(document.base).toEqual({ ref: "HEAD~1", sha: await git(root, "rev-parse", "HEAD~1") });
    expect(document.diff).toMatchObject({ changed: true, components: { added: ["payments"], removed: [] } });
    expect(document.diff.edges.added).toEqual([{ from: "payments", to: "core-db", status: "declared", count: 1 }]);
    const svg = await readFile(join(root, "out/diff/system-light.svg"), "utf8");
    expect(svg).toContain('data-change="added"');
    expect(svg).toContain('data-diff="summary"');

    const same = await run(root, ["render", "--out", "out/diff", "--base", "HEAD"]);
    expect((await readJson(root, "out/diff/system.json")).diff).toMatchObject({ changed: false });
    expect(same.io.text()).toContain("Since HEAD: No architecture changes");
    await rm(join(root, "out"), { recursive: true });
  });

  it("--readme explains the markers, then fills and keeps the block idempotently", async () => {
    await write(root, "README.md", "# Shop\r\n\r\nA shop.\r\n");
    const without = await run(root, ["render", "--readme"]);
    expect(without.code).toBe(0);
    expect(without.io.text()).toContain("README.md has no Rassam block yet");
    expect(without.io.text()).toContain(README_START);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Shop\r\n\r\nA shop.\r\n");

    await write(root, "README.md", `# Shop\r\n\r\n${README_START}\r\n${README_END}\r\n\r\nA shop.\r\n`);
    await git(root, "remote", "add", "origin", "https://someone:secret@github.com/acme/shop.git");
    const first = await run(root, ["render", "--readme"]);
    expect(first.io.text()).toContain("updated    README.md");
    const text = await readFile(join(root, "README.md"), "utf8");
    expect(text.startsWith(`# Shop\r\n\r\n${README_START}\r\n`)).toBe(true);
    expect(text.endsWith(`${README_END}\r\n\r\nA shop.\r\n`)).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).not.toContain("secret");
    expect(text).toContain('<a href="https://github.com/acme/shop">');
    expect(text).toContain('<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/acme/shop/rassam-live/system-dark.svg">');
    expect(text).toContain('src="https://raw.githubusercontent.com/acme/shop/rassam-live/system-light.svg">');
    expect(text).toContain("rassam-live/badge-blueprint.svg");
    expect(text).toContain("rassam-live/badge-system.svg");
    expect(text).toContain("Updated on every push by");
    expect(text).toContain("status as of 2026-11-21 10:15 UTC");
    expect(text).toContain("<summary>Components (4)</summary>");
    expect(text).toContain("| UI | frontend | No data | Renders pages. |");
    expect(text).toContain("| Core API | service | — | Owns orders \\| and &lt;access&gt; checks. |");

    const second = await run(root, ["render", "--readme"], { now: () => T2 });
    expect(second.io.text()).toContain("unchanged  README.md");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe(text);

    const relative = await run(root, ["render", "--readme", "README.md", "--image-base", ".rassam/live/", "--link", "https://shop.example/design"], { now: () => T2 });
    expect(relative.io.text()).toContain("updated    README.md");
    const local = await readFile(join(root, "README.md"), "utf8");
    expect(local).toContain('srcset=".rassam/live/system-dark.svg"');
    expect(local).toContain('<a href="https://shop.example/design">');
    expect(local).toContain("status as of 2026-11-21 10:20 UTC");
    expect(local.match(/rassam:system:start/g)).toHaveLength(1);

    const missing = await run(root, ["render", "--readme", "docs/NOPE.md"]);
    expect(missing.code).toBe(2);
  });
});

describe("README block", () => {
  it("replaces only what is between the markers", () => {
    const blueprint = { system: { name: "S" }, components: [{ id: "a", name: "A*", kind: "service", external: true, runtime: { health: { url: "https://a.test" } } }] } as never;
    const block = renderReadmeBlock({ blueprint, status: { version: 1, checkedAt: "x", components: { a: { state: "down", source: "health-check" } } }, imageBase: "img/", generatedAt: "2026-01-02T03:04:05Z", alt: 'A "quoted" <alt>' });
    expect(block.startsWith(README_START)).toBe(true);
    expect(block.endsWith(README_END)).toBe(true);
    expect(block).toContain('alt="A &quot;quoted&quot; &lt;alt&gt;" src="img/system-light.svg"');
    expect(block).not.toContain("  <a href");
    expect(block).toContain("| A\\* | external service | Down |  |");
    expect(updateReadme("no markers here", block)).toEqual({ state: "no-markers" });
    expect(updateReadme(`${README_END} before ${README_START}`, block)).toEqual({ state: "no-markers" });
    const updated = updateReadme(`top\n${README_START}\nold\n${README_END}\nbottom\n`, block);
    expect(updated).toEqual({ state: "updated", text: `top\n${block}\nbottom\n` });
    expect(updateReadme(`top\n${block.replace("2026-01-02 03:04 UTC", "1999-01-01 00:00 UTC")}\nbottom\n`, block)).toEqual({ state: "unchanged" });
  });

  it("reads owner and repository from common remote URLs", () => {
    expect(parseRepoUrl("https://github.com/acme/shop.git")).toEqual({ host: "github.com", owner: "acme", repo: "shop" });
    expect(parseRepoUrl("https://github.com/acme/shop")).toEqual({ host: "github.com", owner: "acme", repo: "shop" });
    expect(parseRepoUrl("git@github.com:acme/shop.git")).toEqual({ host: "github.com", owner: "acme", repo: "shop" });
    expect(parseRepoUrl("ssh://git@git.example.com:2222/acme/shop.io.git")).toEqual({ host: "git.example.com", owner: "acme", repo: "shop.io" });
    expect(parseRepoUrl("/srv/git/shop.git")).toBeNull();
    expect(parseRepoUrl("https://github.com/acme/shop/extra")).toBeNull();
    expect(parseRepoUrl(null)).toBeNull();
  });
});

describe("rassam status", () => {
  let root: string;
  const calls: Array<{ url: string; method: string; authorization: string | null }> = [];

  const RUNTIME_BLUEPRINT = {
    version: "0.1",
    system: { name: "Shop" },
    components: [
      { id: "ui", name: "UI", kind: "frontend", paths: ["src/ui/**"], runtime: { health: { url: "https://shop.example/health?probe=1" } } },
      { id: "core-api", name: "Core API", kind: "service", paths: ["src/core/**"], runtime: { health: { url: "https://api.example/healthz", method: "HEAD" } } },
      { id: "core-db", name: "Core DB", kind: "database", paths: ["src/db/**"], runtime: { health: { url: "https://db.example/ping" } } },
      { id: "slow", name: "Slow", kind: "service", external: true, runtime: { health: { url: "https://slow.example/", timeoutMs: 100 } } },
      { id: "offline", name: "Offline", kind: "service", external: true, runtime: { health: { url: "http://offline.example/" } } },
      { id: "teapot", name: "Teapot", kind: "service", external: true, runtime: { health: { url: "https://teapot.example/", expectStatus: 418 } } },
      { id: "secretive", name: "Secretive", kind: "service", external: true, runtime: { health: { url: "https://user:hunter2@secret.example/health" } } },
      { id: "site", name: "Site", kind: "frontend", external: true, runtime: { deployment: { environment: "production" } } },
      { id: "staging", name: "Staging", kind: "frontend", external: true, runtime: { deployment: { environment: "staging" } } },
      { id: "preview", name: "Preview", kind: "frontend", external: true, runtime: { deployment: { environment: "preview" } } },
      { id: "pipeline", name: "Pipeline", kind: "job", external: true, runtime: { workflow: { file: ".github/workflows/ci.yml" } } },
      { id: "nightly", name: "Nightly", kind: "job", external: true, runtime: { workflow: { file: "nightly.yml" } } },
      { id: "both", name: "Both", kind: "service", external: true, runtime: { health: { url: "https://shop.example/health" }, deployment: { environment: "staging" } } },
      { id: "plain", name: "Plain", kind: "library", external: true },
    ],
  };

  const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", authorization: headers.get("authorization") });
    if (url.startsWith("https://shop.example/health")) return new Response("BODY-MUST-NOT-LEAK", { status: 200 });
    if (url === "https://api.example/healthz") return new Response(null, { status: 503 });
    if (url === "https://db.example/ping") return new Response("BODY-MUST-NOT-LEAK", { status: 404 });
    if (url === "https://teapot.example/") return new Response(null, { status: 418 });
    if (url === "http://offline.example/") throw Object.assign(new TypeError("fetch failed: http://offline.example/ token=abc"), { cause: { code: "ECONNREFUSED" } });
    if (url === "https://slow.example/") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    const api = "https://api.github.test/repos/acme/shop";
    if (url === api) return json({ default_branch: "trunk" });
    if (url === `${api}/deployments?environment=production&per_page=1`) return json([{ id: 11, sha: "0123456789abcdef" }]);
    if (url === `${api}/deployments/11/statuses?per_page=1`) return json([{ state: "success" }]);
    if (url === `${api}/deployments?environment=staging&per_page=1`) return json([{ id: 12, sha: "fedcba9876543210" }]);
    if (url === `${api}/deployments/12/statuses?per_page=1`) return json([{ state: "failure" }]);
    if (url === `${api}/deployments?environment=preview&per_page=1`) return json([]);
    if (url === `${api}/actions/workflows/ci.yml/runs?per_page=1&exclude_pull_requests=true&branch=trunk`) return json({ workflow_runs: [{ status: "completed", conclusion: "success" }] });
    if (url === `${api}/actions/workflows/nightly.yml/runs?per_page=1&exclude_pull_requests=true&branch=trunk`) return json({ workflow_runs: [{ status: "in_progress", conclusion: null }] });
    return json({ message: "Not Found: BODY-MUST-NOT-LEAK" }, 404);
  }) as typeof fetch;

  const GITHUB_ENV = { GITHUB_TOKEN: "ghs_test_token", GITHUB_REPOSITORY: "acme/shop", GITHUB_API_URL: "https://api.github.test/" };

  beforeAll(async () => {
    root = await makeTempDir("rassam-status-");
    await seed(root, RUNTIME_BLUEPRINT);
    await commitAll(root, "initial");
  });

  afterAll(async () => {
    await removeDir(root);
  });

  it("probes health URLs, deployments and workflows; the worst signal wins", async () => {
    calls.length = 0;
    const { code, io } = await run(root, ["status", "--format", "json", "--write"], { fetch: fakeFetch, env: GITHUB_ENV });
    expect(io.errText()).toBe("Wrote .rassam/status.json\n");
    expect(code).toBe(0);
    const parsed = parseSystemStatus(io.text());
    expect(parsed.ok).toBe(true);
    const status = parsed.status!;
    expect(status.checkedAt).toBe("2026-11-21T10:15:30Z");
    expect(status.commit).toBe(await git(root, "rev-parse", "HEAD"));
    const state = (id: string): string => `${status.components[id].state}/${status.components[id].source}`;
    expect(Object.keys(status.components)).not.toContain("plain");
    expect(state("ui")).toBe("up/health-check");
    expect(state("core-api")).toBe("down/health-check");
    expect(state("core-db")).toBe("degraded/health-check");
    expect(state("slow")).toBe("down/health-check");
    expect(status.components.slow.detail).toBe("no answer within 100 ms");
    expect(state("offline")).toBe("down/health-check");
    expect(status.components.offline.detail).toBe("request failed (ECONNREFUSED)");
    expect(state("teapot")).toBe("up/health-check");
    expect(state("secretive")).toBe("unknown/health-check");
    expect(status.components.secretive.detail).toContain("contains credentials");
    expect(status.components.secretive.url).toBeUndefined();
    expect(state("site")).toBe("up/deployment");
    expect(status.components.site.detail).toBe("production: success at 0123456");
    expect(state("staging")).toBe("down/deployment");
    expect(state("preview")).toBe("unknown/deployment");
    expect(status.components.preview.detail).toBe("preview: no deployments yet");
    expect(state("pipeline")).toBe("up/workflow");
    expect(state("nightly")).toBe("degraded/workflow");
    expect(status.components.nightly.detail).toBe("nightly.yml: in progress");
    // Health is up, the deployment failed: the worse one decides.
    expect(state("both")).toBe("down/deployment");
    expect(status.components.both.detail).toMatch(/^HTTP 200 in \d+ ms; staging: failure at fedcba9$/);

    // Latency and a query-free URL are recorded; bodies, tokens and credentials are not.
    expect(status.components.ui.latencyMs).toBeGreaterThanOrEqual(0);
    expect(status.components.ui.url).toBe("https://shop.example/health");
    const written = await readFile(join(root, ".rassam/status.json"), "utf8");
    expect(written).toBe(io.text());
    for (const secret of ["BODY-MUST-NOT-LEAK", "hunter2", "ghs_test_token", "token=abc"]) expect(io.text() + io.errText()).not.toContain(secret);

    expect(calls.some((call) => new URL(call.url).hostname === "secret.example")).toBe(false);
    expect(calls.find((call) => call.url === "https://api.example/healthz")!.method).toBe("HEAD");
    expect(calls.find((call) => new URL(call.url).hostname === "shop.example")!.authorization).toBeNull();
    expect(calls.filter((call) => new URL(call.url).hostname === "api.github.test").every((call) => call.authorization === "Bearer ghs_test_token")).toBe(true);
    expect(calls.filter((call) => call.url === "https://api.github.test/repos/acme/shop")).toHaveLength(1);
  });

  it("prints a compact table and the overall line, and exits 1 only with --fail-on-down", async () => {
    const { code, io } = await run(root, ["status"], { fetch: fakeFetch, env: GITHUB_ENV });
    expect(code).toBe(0);
    const lines = io.text().split("\n");
    expect(lines[0]).toMatch(/^Component +State +Signal +Detail$/);
    expect(io.text()).toMatch(/Core API +DOWN +health check +HTTP 503 in \d+ ms/);
    expect(io.text()).toMatch(/Site +up +deployment +production: success at 0123456/);
    expect(io.text()).toContain("Overall: outage (4 up, 2 degraded, 5 down, 2 unknown of 13 monitored)");
    expect(io.text()).not.toContain("BODY-MUST-NOT-LEAK");

    expect((await run(root, ["status", "--fail-on-down"], { fetch: fakeFetch, env: GITHUB_ENV })).code).toBe(1);
    expect((await run(root, ["status", "--timeout", "5"], { fetch: fakeFetch })).code).toBe(2);
  });

  it("leaves GitHub signals unknown unless asked, and explains why", async () => {
    calls.length = 0;
    const { io } = await run(root, ["status", "--format", "json"], { fetch: fakeFetch });
    const status = parseSystemStatus(io.text()).status!;
    expect(status.components.site).toMatchObject({ state: "unknown", source: "deployment" });
    expect(status.components.site.detail).toContain("pass --github or set GITHUB_TOKEN");
    expect(status.components.pipeline.state).toBe("unknown");
    // The health check still counts when the deployment cannot be read.
    expect(status.components.both).toMatchObject({ state: "up", source: "health-check" });
    expect(calls.some((call) => call.url.includes("github"))).toBe(false);

    const noOrigin = await run(root, ["status", "--format", "json", "--github"], { fetch: fakeFetch });
    expect(parseSystemStatus(noOrigin.io.text()).status!.components.site.detail).toContain("no GitHub origin");
  });

  it("writes step outputs in Actions and skips gracefully when nothing declares runtime", async () => {
    const outputs = join(root, "outputs.txt");
    await write(root, "outputs.txt", "");
    await run(root, ["status"], { fetch: fakeFetch, env: { ...GITHUB_ENV, GITHUB_OUTPUT: outputs } });
    expect(await readFile(outputs, "utf8")).toBe("monitored=13\noverall=outage\n");

    const plain = await makeTempDir("rassam-status-none-");
    try {
      await seed(plain, { ...BLUEPRINT, components: BLUEPRINT.components.map((component) => ({ ...component, runtime: undefined })) });
      const plainOutputs = join(plain, "outputs.txt");
      await write(plain, "outputs.txt", "");
      const failing = (async () => {
        throw new Error("must not be called");
      }) as unknown as typeof fetch;
      const { code, io } = await run(plain, ["status", "--write", "--github"], { fetch: failing, env: { GITHUB_OUTPUT: plainOutputs } });
      expect(code).toBe(0);
      expect(io.text()).toContain("No component declares runtime");
      expect(existsSync(join(plain, ".rassam/status.json"))).toBe(false);
      expect(await readFile(plainOutputs, "utf8")).toBe("monitored=0\noverall=unknown\n");
    } finally {
      await removeDir(plain);
    }
  });

  it("only fetches http(s) URLs without credentials", () => {
    expect(safeHealthUrl("https://a.test/health?x=1#top")).toMatchObject({ ok: true, shown: "https://a.test/health" });
    expect(safeHealthUrl("http://a.test")).toMatchObject({ ok: true });
    expect(safeHealthUrl("https://user:pass@a.test/")).toMatchObject({ ok: false });
    expect(safeHealthUrl("https://token@a.test/")).toMatchObject({ ok: false });
    expect(safeHealthUrl("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(safeHealthUrl("ftp://a.test/")).toMatchObject({ ok: false });
    expect(safeHealthUrl("not a url")).toMatchObject({ ok: false });
  });

  it("combines signals by severity and never lets missing data hide a real state", () => {
    const at = "2026-01-01T00:00:00Z";
    expect(combineSignals([{ state: "unknown", source: "deployment", detail: "a" }, { state: "up", source: "health-check", detail: "b", latencyMs: 12, url: "https://a.test/" }], at)).toEqual({ state: "up", source: "health-check", detail: "a; b", latencyMs: 12, url: "https://a.test/", checkedAt: at });
    expect(combineSignals([{ state: "up", source: "health-check", detail: "" }, { state: "degraded", source: "workflow", detail: "w" }, { state: "down", source: "deployment", detail: "d" }], at)).toMatchObject({ state: "down", source: "deployment", detail: "w; d" });
    expect(combineSignals([{ state: "degraded", source: "workflow", detail: "x".repeat(400) }], at).detail).toHaveLength(300);
  });
});

describe("rassam do", () => {
  let root: string;
  const saved = (): Promise<Json> => readJson(root, ".rassam/blueprint.json");

  beforeAll(async () => {
    root = await makeTempDir("rassam-do-");
    await seed(root);
    await commitAll(root, "initial");
  });

  afterAll(async () => {
    await removeDir(root);
  });

  it("is a dry run by default: it shows the interpretation and changes nothing", async () => {
    const before = await readFile(join(root, ".rassam/blueprint.json"), "utf8");
    const { code, io } = await run(root, ["do", "forbid core-db from importing ui because storage never renders"]);
    expect(code).toBe(0);
    expect(io.text()).toContain('Understood as: Forbade "Core DB" from depending on "UI"');
    expect(io.text()).toMatch(/1\. .+\n1 change\./);
    expect(io.text()).toContain("Dry run: .rassam/blueprint.json was not changed. Add --write to save.");
    expect(await readFile(join(root, ".rassam/blueprint.json"), "utf8")).toBe(before);
  });

  it("--write saves the change as written by the git user", async () => {
    const { code, io } = await run(root, ["do", "forbid core-db from importing ui because storage never renders", "--write"]);
    expect(code).toBe(0);
    expect(io.text()).toContain("Saved to .rassam/blueprint.json, recorded as written by Test Human.");
    const rule = (await saved()).rules.find((item: Json) => item.id === "forbid-core-db-ui");
    expect(rule).toMatchObject({ kind: "forbid", from: "core-db", to: "ui", reason: "Storage never renders", provenance: { source: "human", by: "Test Human", at: "2026-11-21T10:15:30.000Z" } });
    expect((await run(root, ["check"])).code).toBe(0);

    const named = await run(root, ["do", "add", "a", "component", "Payments", "for", "src/payments/**", "--write", "--by", "Layla", "--format", "json"]);
    expect(named.code).toBe(0);
    expect(JSON.parse(named.io.text())).toMatchObject({ status: "ok", written: true, weakens: false });
    expect((await saved()).components.find((item: Json) => item.id === "payments").provenance).toMatchObject({ source: "human", by: "Layla" });
  });

  it("lists the options of an ambiguous instruction and exits 2", async () => {
    const before = await readFile(join(root, ".rassam/blueprint.json"), "utf8");
    const { code, io } = await run(root, ["do", "forbid payments from importing core", "--write"]);
    expect(code).toBe(2);
    expect(io.errText()).toContain('"core" could mean "Core API" or "Core DB"');
    expect(io.errText()).toMatch(/ {2}1\. Forbade "Payments" from depending on "Core API"/);
    expect(io.errText()).toMatch(/ {2}2\. Forbade "Payments" from depending on "Core DB"/);
    expect(io.errText()).toContain("--choose <n>");
    expect(await readFile(join(root, ".rassam/blueprint.json"), "utf8")).toBe(before);

    expect((await run(root, ["do", "forbid payments from importing core", "--choose", "9"])).code).toBe(2);
    const chosen = await run(root, ["do", "forbid payments from importing core", "--choose", "1", "--write"]);
    expect(chosen.code).toBe(0);
    expect((await saved()).rules.some((item: Json) => item.from === "payments" && item.to === "core-api")).toBe(true);
  });

  it("answers an instruction it does not understand with examples and exits 2", async () => {
    const { code, io } = await run(root, ["do", "make it faster"]);
    expect(code).toBe(2);
    expect(io.errText()).toContain('I could not understand "make it faster"');
    expect(io.errText()).toContain('rassam do "forbid ui from importing db');
    const asJson = await run(root, ["do", "make it faster", "--format", "json"]);
    expect(asJson.code).toBe(2);
    expect(JSON.parse(asJson.io.text()).status).toBe("unknown");
  });

  it("refuses to weaken the contract without --allow-weakening", async () => {
    const before = await readFile(join(root, ".rassam/blueprint.json"), "utf8");
    const { code, io } = await run(root, ["do", "remove rule ui-no-db", "--write"]);
    expect(code).toBe(2);
    expect(io.errText()).toContain("[weakens the contract]");
    expect(io.errText()).toContain("Refused: this change loosens the contract");
    expect(io.errText()).toContain("--allow-weakening");
    expect(io.errText()).toContain("approval label");
    expect(await readFile(join(root, ".rassam/blueprint.json"), "utf8")).toBe(before);

    const dry = await run(root, ["do", "remove rule ui-no-db", "--allow-weakening"]);
    expect(dry.code).toBe(0);
    expect(dry.io.text()).toContain("Dry run");
    expect(await readFile(join(root, ".rassam/blueprint.json"), "utf8")).toBe(before);

    const allowed = await run(root, ["do", "remove rule ui-no-db", "--write", "--allow-weakening"]);
    expect(allowed.code).toBe(0);
    expect(allowed.io.text()).toContain("the pull request needs the approval label before CI passes");
    expect((await saved()).rules.some((item: Json) => item.id === "ui-no-db")).toBe(false);
    // The gate still sees the weakening: the flag only lets the edit into the file.
    const gate = await run(root, ["check", "--base", "HEAD", "--format", "json"]);
    expect(gate.code).toBe(1);
    expect(JSON.parse(gate.io.text()).findings.some((finding: Json) => finding.kind === "contract-weakened")).toBe(true);
  });
});

describe("MCP tools for the live system", () => {
  let root: string;
  let clock = T1;
  let call: (name: string, args?: Json) => Promise<Json>;

  beforeAll(async () => {
    root = await makeTempDir("rassam-live-mcp-");
    await seed(root);
    await commitAll(root, "initial");
    const { createTools, SERVER_INSTRUCTIONS } = await import("./mcp/tools");
    expect(SERVER_INSTRUCTIONS).toContain("architecture_diff");
    expect(SERVER_INSTRUCTIONS).toContain("system_status");
    const tools = createTools({ root, now: () => clock });
    for (const name of ["system_status", "architecture_diff"]) expect(tools.find((tool) => tool.name === name)!.annotations.readOnlyHint).toBe(true);
    const handler = createMcpHandler({ name: "rassam", title: "Rassam Blueprint", version: "0", instructions: SERVER_INSTRUCTIONS, tools });
    let id = 0;
    call = async (name, args = {}) => {
      const response = (await handler.handleMessage({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } })) as Json;
      expect(response.error).toBeUndefined();
      return response.result as Json;
    };
  });

  afterAll(async () => {
    await removeDir(root);
  });

  it("system_status reports missing, fresh, stale and invalid status", async () => {
    const missing = await call("system_status");
    expect(missing.isError).toBeFalsy();
    expect(missing.structuredContent).toMatchObject({ available: false, monitored: 1, components: [{ id: "ui", state: "unknown" }] });
    expect(missing.structuredContent.note).toContain("rassam status --write");

    await write(root, ".rassam/status.json", `${JSON.stringify({ version: 1, checkedAt: "2026-11-21T10:05:30Z", commit: "abc", components: { ui: { state: "up", source: "health-check", detail: "HTTP 200 in 80 ms", latencyMs: 80 } } })}\n`);
    const fresh = await call("system_status");
    expect(fresh.structuredContent).toMatchObject({
      available: true,
      checkedAt: "2026-11-21T10:05:30Z",
      ageMinutes: 10,
      stale: false,
      monitored: 1,
      summary: { up: 1, down: 0, monitored: 1, overall: "operational" },
      components: [{ id: "ui", name: "UI", state: "up", source: "health-check", latencyMs: 80 }],
    });

    clock = new Date("2026-11-21T12:05:30.000Z");
    const stale = await call("system_status");
    expect(stale.structuredContent).toMatchObject({ available: true, stale: true, ageMinutes: 120 });
    expect(stale.structuredContent.note).toContain("treat every state as unknown");
    clock = T1;

    await write(root, ".rassam/status.json", "{}");
    const invalid = await call("system_status");
    expect(invalid.structuredContent).toMatchObject({ available: false });
    expect(invalid.structuredContent.note).toContain("not a valid status file");
    await rm(join(root, ".rassam/status.json"));
  });

  it("architecture_diff tells what the working tree changed structurally", async () => {
    const unchanged = await call("architecture_diff", { base: "HEAD" });
    expect(unchanged.structuredContent).toMatchObject({ comparable: true, changed: false, summary: "No architecture changes since HEAD." });

    // An undeclared, forbidden dependency and a brand-new component, none of it committed.
    await write(root, "src/ui/page.ts", 'import { store } from "../db/store";\n\nexport const page = store;\n');
    const next = { ...BLUEPRINT, components: [...BLUEPRINT.components, { id: "payments", name: "Payments", kind: "service", paths: ["src/payments/**"] }] };
    await write(root, ".rassam/blueprint.json", `${JSON.stringify(next, null, 2)}\n`);
    await write(root, "src/payments/charge.ts", 'import { listOrders } from "../core/service";\n\nexport const charge = listOrders;\n');

    const result = await call("architecture_diff", { base: "HEAD" });
    const diff = result.structuredContent;
    expect(diff.base).toEqual({ ref: "HEAD", sha: await git(root, "rev-parse", "HEAD") });
    expect(diff).toMatchObject({ comparable: true, changed: true, components: { added: ["payments"], removed: [] } });
    expect(diff.edges.added).toEqual([
      { from: "payments", to: "core-api", status: "undeclared", count: 1 },
      { from: "ui", to: "core-db", status: "forbidden", count: 1 },
    ]);
    expect(diff.edges.removed).toEqual([]);
    expect(diff.edges.statusChanged).toEqual([{ from: "ui", to: "core-api", before: "declared", after: "missing" }]);
    expect(diff.summary).toBe("Since HEAD: 1 component added, 2 dependencies added, 1 declared dependency no longer observed.");

    // Without a base it compares with the default branch.
    const byDefault = await call("architecture_diff");
    expect(byDefault.structuredContent.base.ref).toBe("main");
    expect(byDefault.structuredContent.changed).toBe(true);

    const bad = await call("architecture_diff", { base: "no-such-ref" });
    expect(bad.isError).toBe(true);
  });

  it("architecture_diff says so when the base has no blueprint", async () => {
    const bare = await makeTempDir("rassam-live-mcp-bare-");
    try {
      await initRepo(bare);
      await write(bare, "src/a.ts", "export const a = 1;\n");
      await commitAll(bare, "no blueprint yet");
      await write(bare, ".rassam/blueprint.json", `${JSON.stringify({ version: "0.1", system: { name: "Bare" }, components: [{ id: "a", name: "A", paths: ["src/**"] }] })}\n`);
      const { createTools, SERVER_INSTRUCTIONS } = await import("./mcp/tools");
      const handler = createMcpHandler({ name: "rassam", title: "Rassam Blueprint", version: "0", instructions: SERVER_INSTRUCTIONS, tools: createTools({ root: bare }) });
      const response = (await handler.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "architecture_diff", arguments: { base: "HEAD" } } })) as Json;
      expect(response.result.structuredContent).toMatchObject({ comparable: false, changed: false });
      expect(response.result.structuredContent.summary).toContain("missing");
    } finally {
      await removeDir(bare);
    }
  });
});
