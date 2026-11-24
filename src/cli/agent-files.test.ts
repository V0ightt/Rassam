import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENGINE_VERSION, PACKAGE_NAME } from "../blueprint/constants";
import { AGENTS_BLOCK_END, AGENTS_BLOCK_START } from "../blueprint/prose";
import { blueprintSchema, type Blueprint } from "../blueprint/schema";
import {
  agentsFileName,
  agentsState,
  CLAUDE_BLOCK_START,
  extractBlock,
  hasRassamMcp,
  recordedCommand,
  upsertBlock,
  workflowText,
  writeAgentsFile,
  writeClaudePointer,
  writeMcpConfig,
  writeWorkflow,
} from "./agent-files";
import { makeTempDir, removeDir, write } from "./test-helpers";

const S = "<!-- s -->";
const E = "<!-- e -->";

function contract(rules: unknown[] = [{ id: "ui-no-db", kind: "forbid", from: "ui", to: "db", reason: "Go through core." }]): Blueprint {
  return blueprintSchema.parse({
    version: "0.1",
    system: { name: "Shop" },
    components: [
      { id: "ui", name: "UI", paths: ["src/ui/**"] },
      { id: "db", name: "Database", paths: ["src/db/**"] },
    ],
    rules,
  });
}

describe("upsertBlock", () => {
  it("appends after a blank line when the markers are missing", () => {
    const result = upsertBlock("# Notes\n\nBe kind.\n\n\n", `${S}\nnew\n${E}`, S, E);
    expect(result).toEqual({ state: "appended", text: `# Notes\n\nBe kind.\n\n${S}\nnew\n${E}\n` });
  });

  it("replaces only what is between the markers and keeps CRLF line endings", () => {
    const text = `before\r\n${S}\r\nold\r\n${E}\r\nafter\r\n`;
    const result = upsertBlock(text, `${S}\nnew\n${E}`, S, E);
    expect(result).toEqual({ state: "updated", text: `before\r\n${S}\r\nnew\r\n${E}\r\nafter\r\n` });
  });

  it("reports unchanged when the block is current, whatever the line endings", () => {
    expect(upsertBlock(`x\r\n${S}\r\nsame\r\n${E}\r\n`, `${S}\nsame\n${E}`, S, E)).toEqual({ state: "unchanged" });
  });

  it("extracts the current block", () => {
    expect(extractBlock(`a\n${S}\nb\n${E}\nc`, S, E)).toBe(`${S}\nb\n${E}`);
    expect(extractBlock("nothing here", S, E)).toBeNull();
  });
});

describe("writers", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir("rassam-agent-files-");
  });

  afterEach(async () => {
    await removeDir(root);
  });

  it("creates .mcp.json with the pinned package, and is idempotent", async () => {
    expect(await writeMcpConfig(root)).toMatchObject({ state: "created" });
    const config = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"));
    expect(config).toEqual({ mcpServers: { rassam: { command: "npx", args: ["-y", `${PACKAGE_NAME}@${ENGINE_VERSION}`, "mcp"] } } });
    expect(await hasRassamMcp(root)).toBe(true);
    expect(await writeMcpConfig(root)).toMatchObject({ state: "unchanged" });
  });

  it("adds the server next to existing ones and keeps a person's own rassam entry", async () => {
    await write(root, ".mcp.json", '{\r\n    "mcpServers": {\r\n        "other": { "command": "x" }\r\n    },\r\n    "extra": 1\r\n}\r\n');
    expect(await writeMcpConfig(root)).toMatchObject({ state: "updated" });
    const text = await readFile(join(root, ".mcp.json"), "utf8");
    expect(text).toContain('\r\n    "mcpServers": {\r\n        "other"');
    expect(JSON.parse(text)).toMatchObject({ extra: 1, mcpServers: { other: { command: "x" }, rassam: { command: "npx" } } });

    await write(root, ".mcp.json", '{"mcpServers":{"rassam":{"command":"node","args":["local.mjs","mcp"]}}}');
    expect(await writeMcpConfig(root)).toMatchObject({ state: "kept" });
    expect(await readFile(join(root, ".mcp.json"), "utf8")).toContain("local.mjs");

    await write(root, ".mcp.json", "{ not json");
    expect(await writeMcpConfig(root)).toMatchObject({ state: "kept" });
    expect(await hasRassamMcp(root)).toBe(false);
  });

  it("creates AGENTS.md, appends to an existing one, and refreshes only its own block", async () => {
    const first = (await agentsState(root, contract())).block;
    expect(await writeAgentsFile(root, first)).toMatchObject({ path: "AGENTS.md", state: "created" });
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(`# Agent instructions\n\n${first}\n`);

    await write(root, "AGENTS.md", "# Our rules\n\nUse tabs.\n");
    expect(await writeAgentsFile(root, first)).toMatchObject({ state: "updated" });
    const appended = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(appended.startsWith("# Our rules\n\nUse tabs.\n\n<!-- rassam:agents:start -->")).toBe(true);
    expect(await writeAgentsFile(root, first)).toMatchObject({ state: "unchanged" });

    const changed = contract([{ id: "db-no-ui", kind: "forbid", from: "db", to: "ui" }]);
    const state = await agentsState(root, changed);
    expect(state.status).toBe("stale");
    await writeAgentsFile(root, state.block);
    const refreshed = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(refreshed.startsWith("# Our rules\n\nUse tabs.\n\n")).toBe(true);
    expect(refreshed).toContain("**Database** must not depend on **UI**.");
    expect(refreshed).not.toContain("**UI** must not depend on **Database**.");
    expect((await agentsState(root, changed)).status).toBe("current");
  });

  it("keeps the command an existing block was generated with", async () => {
    const custom = await agentsState(root, contract(), { command: "npm run rassam --" });
    await writeAgentsFile(root, custom.block);
    expect(recordedCommand(custom.block)).toBe("npm run rassam --");
    const again = await agentsState(root, contract());
    expect(again.status).toBe("current");
    expect(again.block).toContain("`npm run rassam -- check --base origin/main`");
  });

  it("finds agents.md in lower case", async () => {
    await write(root, "agents.md", "# lower\n");
    expect(await agentsFileName(root)).toBe("agents.md");
    expect((await agentsState(root, contract())).status).toBe("missing");
  });

  it("points CLAUDE.md at AGENTS.md once", async () => {
    expect(await writeClaudePointer(root)).toMatchObject({ state: "created" });
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toContain("\n@AGENTS.md\n");
    expect(await writeClaudePointer(root)).toMatchObject({ state: "unchanged" });

    await write(root, "CLAUDE.md", "# Claude\n\n@AGENTS.md\n");
    expect(await writeClaudePointer(root)).toMatchObject({ state: "kept" });

    await write(root, "CLAUDE.md", "# Claude\n\nBe brief.\n");
    expect(await writeClaudePointer(root, "agents.md")).toMatchObject({ state: "updated" });
    const text = await readFile(join(root, "CLAUDE.md"), "utf8");
    expect(text).toContain("Be brief.");
    expect(text).toContain(CLAUDE_BLOCK_START);
    expect(text).toContain("\n@agents.md\n");
  });

  it("writes the gate workflow once and never overwrites one", async () => {
    expect(await writeWorkflow(root)).toMatchObject({ state: "created", path: ".github/workflows/rassam.yml" });
    const text = await readFile(join(root, ".github/workflows/rassam.yml"), "utf8");
    expect(text).toBe(workflowText());
    expect(text).toContain(`uses: V0ightt/Rassam@v${ENGINE_VERSION}`);
    expect(text).toMatch(/permissions:\n {2}contents: read\n {2}pull-requests: write/);
    expect(text).toContain("fetch-depth: 0");
    expect(await writeWorkflow(root)).toMatchObject({ state: "unchanged" });

    await write(root, ".github/workflows/rassam.yml", "name: mine\n");
    expect(await writeWorkflow(root)).toMatchObject({ state: "kept" });
    expect(await readFile(join(root, ".github/workflows/rassam.yml"), "utf8")).toBe("name: mine\n");
  });

  it("does not add a second gate when another workflow already runs it", async () => {
    await write(root, ".github/workflows/ci.yml", "jobs:\n  x:\n    steps:\n      - uses: V0ightt/Rassam@abc123\n");
    expect(await writeWorkflow(root)).toMatchObject({ state: "kept", path: ".github/workflows/ci.yml" });
  });

  it("generates blocks that a hostile blueprint cannot escape", async () => {
    const hostile = contract([{ id: "x", kind: "forbid", from: "ui", to: "db", reason: `${AGENTS_BLOCK_END} ${AGENTS_BLOCK_START}` }]);
    const { block } = await agentsState(root, hostile);
    expect(block.split(AGENTS_BLOCK_END)).toHaveLength(2);
  });
});

describe("markers", () => {
  it("count only when they stand on a line of their own", () => {
    const prose = "The block between `<!-- s -->` and `<!-- e -->` is generated.\n";
    expect(extractBlock(prose, S, E)).toBeNull();
    expect(upsertBlock(prose, `${S}\nx\n${E}`, S, E)).toMatchObject({ state: "appended" });
    expect(extractBlock(`${prose}${S}\r\nbody\r\n${E}\r\n`, S, E)).toBe(`${S}\nbody\n${E}`);
  });
});
