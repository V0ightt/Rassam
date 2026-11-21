import { describe, it, expect } from "vitest";

import {
  AGENT_CONFIG_GLOBS,
  analyzeReach,
  classifyAgentConfig,
  detectInlineSecrets,
  detectKnownTokens,
  isAgentConfigPath,
  parseMcpServers,
  parsePermissions,
} from "./reach";
import { matchesAny } from "./glob";
import type { ComponentMembership, EnvRef, FileFacts, FileGraph, SourceFile } from "./types";

// Fake credentials are assembled at runtime so that no token-shaped literal
// lives in the repository (secret scanners would rightly flag it).
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function fake(length: number, seed = 7, alphabet = ALPHABET): string {
  let state = seed * 2654435761;
  let out = "";
  for (let index = 0; index < length; index += 1) {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    out += alphabet[((mixed ^ (mixed >>> 14)) >>> 0) % alphabet.length];
  }
  return out;
}
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const FAKE = {
  github: `ghp_${fake(36, 1)}`,
  githubOauth: `gho_${fake(36, 2)}`,
  githubPat: `github_pat_${fake(22, 3)}_${fake(59, 4)}`,
  anthropic: `sk-ant-api03-${fake(40, 5)}`,
  openaiProject: `sk-proj-${fake(48, 6)}`,
  openai: `sk-${fake(48, 7)}`,
  slack: `xoxb-${fake(12, 8, "0123456789")}-${fake(24, 9)}`,
  aws: `AKIA${fake(16, 10, UPPER)}`,
  google: `AIza${fake(35, 11)}`,
  gitlab: `glpat-${fake(20, 12)}`,
  npm: `npm_${fake(36, 13)}`,
  huggingface: `hf_${fake(34, 14)}`,
  stripe: `sk_live_${fake(24, 15)}`,
  sendgrid: `SG.${fake(22, 16)}.${fake(43, 17)}`,
  jwt: `eyJ${fake(20, 18)}.eyJ${fake(30, 19)}.${fake(43, 20)}`,
  literal: fake(40, 21),
  password: fake(18, 22),
};

const emptyGraph = (): FileGraph => ({ files: [], facts: new Map(), edges: [], externals: [], unresolved: [] });

function expectNoLeak(result: unknown, secrets: readonly string[] = Object.values(FAKE)): void {
  const serialized = JSON.stringify(result);
  for (const secret of secrets) expect(serialized.includes(secret)).toBe(false);
}

describe("classifyAgentConfig", () => {
  it.each([
    [".mcp.json", "mcp", "Claude Code"],
    ["mcp.json", "mcp", "MCP"],
    [".cursor/mcp.json", "mcp", "Cursor"],
    [".vscode/mcp.json", "mcp", "VS Code / Copilot"],
    [".windsurf/mcp_config.json", "mcp", "Windsurf"],
    [".claude/settings.json", "claude-settings", "Claude Code"],
    [".claude/settings.local.json", "claude-settings", "Claude Code"],
    [".codex/config.toml", "codex-config", "Codex"],
    [".gemini/settings.json", "gemini-settings", "Gemini CLI"],
    [".cursorrules", "cursor-rules", "Cursor"],
    [".cursor/rules/backend.mdc", "cursor-rules", "Cursor"],
    [".cursor/rules/nested/deep.md", "cursor-rules", "Cursor"],
    ["AGENTS.md", "instructions", "AGENTS.md"],
    ["agents.md", "instructions", "AGENTS.md"],
    ["CLAUDE.md", "instructions", "Claude Code"],
    ["GEMINI.md", "instructions", "Gemini CLI"],
    [".github/copilot-instructions.md", "instructions", "GitHub Copilot"],
    [".github/workflows/ci.yml", "workflow", "GitHub Actions"],
    [".github/workflows/release.yaml", "workflow", "GitHub Actions"],
    ["packages/x/AGENTS.md", "instructions", "AGENTS.md"],
    ["packages/x/.mcp.json", "mcp", "Claude Code"],
    ["apps/web/.cursor/mcp.json", "mcp", "Cursor"],
    ["apps/web/.claude/settings.json", "claude-settings", "Claude Code"],
  ])("%s → %s (%s)", (path, type, agent) => {
    expect(classifyAgentConfig(path)).toEqual({ path, type, agent });
    expect(isAgentConfigPath(path)).toBe(true);
    expect(matchesAny(path, AGENT_CONFIG_GLOBS)).toBe(true);
  });

  it.each([
    "src/index.ts",
    "package.json",
    "docs/AGENTS.md.bak",
    "src/mcp.json.ts",
    ".claude/commands/review.md",
    ".github/workflows/README.md",
    ".github/workflows/nested/ci.yml",
    "settings.json",
    "config.toml",
    "",
  ])("ignores %s", (path) => {
    expect(classifyAgentConfig(path)).toBeNull();
    expect(isAgentConfigPath(path)).toBe(false);
  });

  it("normalizes Windows separators and leading ./", () => {
    expect(classifyAgentConfig(".\\.cursor\\mcp.json")).toEqual({ path: ".cursor/mcp.json", type: "mcp", agent: "Cursor" });
    expect(classifyAgentConfig("./CLAUDE.md")?.path).toBe("CLAUDE.md");
  });
});

describe("parseMcpServers", () => {
  it("reads mcpServers with comments and trailing commas, exposing env names only", () => {
    const content = `{
  // project servers
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github",],
      "env": { "GITHUB_TOKEN": "${FAKE.github}", "API_URL": "https://api.github.com" },
    },
    /* remote */
    "docs": { "type": "http", "url": "https://mcp.example.com/mcp" },
    "empty": {},
    "typed": { "type": "sse" },
  },
}`;
    const servers = parseMcpServers(".mcp.json", content);
    expect(servers).toEqual([
      { name: "docs", configPath: ".mcp.json", agent: "Claude Code", transport: "http", url: "https://mcp.example.com/mcp", env: [] },
      { name: "empty", configPath: ".mcp.json", agent: "Claude Code", transport: "unknown", env: [] },
      {
        name: "github",
        configPath: ".mcp.json",
        agent: "Claude Code",
        transport: "stdio",
        command: "npx -y @modelcontextprotocol/server-github",
        env: ["API_URL", "GITHUB_TOKEN"],
      },
      { name: "typed", configPath: ".mcp.json", agent: "Claude Code", transport: "http", env: [] },
    ]);
    expectNoLeak(servers);
  });

  it("reads VS Code `servers` and labels the agent from the path", () => {
    const content = `{ "servers": { "pg": { "type": "stdio", "command": "uvx", "args": ["mcp-server-postgres"] } }, "inputs": [] }`;
    expect(parseMcpServers(".vscode/mcp.json", content)).toEqual([
      { name: "pg", configPath: ".vscode/mcp.json", agent: "VS Code / Copilot", transport: "stdio", command: "uvx mcp-server-postgres", env: [] },
    ]);
  });

  it("reads Cursor, Windsurf, Gemini and generic files", () => {
    const body = `{ "mcpServers": { "a": { "command": "node", "args": ["server.js"] } } }`;
    expect(parseMcpServers(".cursor/mcp.json", body)[0].agent).toBe("Cursor");
    expect(parseMcpServers(".windsurf/mcp_config.json", `{ "mcpServers": { "w": { "serverUrl": "https://w.example.com/sse" } } }`)).toEqual([
      { name: "w", configPath: ".windsurf/mcp_config.json", agent: "Windsurf", transport: "http", url: "https://w.example.com/sse", env: [] },
    ]);
    expect(parseMcpServers(".gemini/settings.json", `{ "theme": "dark", "mcpServers": { "g": { "httpUrl": "https://g.example.com" } } }`)[0]).toMatchObject({
      agent: "Gemini CLI",
      transport: "http",
    });
    expect(parseMcpServers("packages/x/mcp.json", `{ "mcp_servers": { "m": { "command": "m" } } }`)).toEqual([
      { name: "m", configPath: "packages/x/mcp.json", agent: "MCP", transport: "stdio", command: "m", env: [] },
    ]);
  });

  it("reads Codex TOML tables, env sub-tables and inline tables", () => {
    const content = [
      "# Codex configuration",
      "model = \"gpt-5\"            # trailing comment",
      "approval_policy = 'on-request'",
      "",
      "[mcp_servers.github]",
      "command = \"npx\"",
      "args = [\"-y\", \"@modelcontextprotocol/server-github\"]  # list",
      "startup_timeout_sec = 20",
      "enabled = true",
      "",
      "[mcp_servers.github.env]",
      `GITHUB_TOKEN = "${FAKE.github}"`,
      "LOG_LEVEL = 'debug'",
      "",
      "[mcp_servers.inline]",
      "command = 'uvx'",
      "args = [",
      "  \"mcp-server-fetch\",",
      "  \"--quiet\",",
      "]",
      `env = { API_KEY = "${FAKE.literal}", REGION = "eu" }`,
      "",
      "[mcp_servers.\"remote docs\"]",
      "url = \"https://docs.example.com/mcp\"",
      "bearer_token_env_var = \"DOCS_TOKEN\"",
      "",
      "[other]",
      "key = 1",
    ].join("\n");
    const servers = parseMcpServers(".codex/config.toml", content);
    expect(servers).toEqual([
      {
        name: "github",
        configPath: ".codex/config.toml",
        agent: "Codex",
        transport: "stdio",
        command: "npx -y @modelcontextprotocol/server-github",
        env: ["GITHUB_TOKEN", "LOG_LEVEL"],
      },
      {
        name: "inline",
        configPath: ".codex/config.toml",
        agent: "Codex",
        transport: "stdio",
        command: "uvx mcp-server-fetch --quiet",
        env: ["API_KEY", "REGION"],
      },
      { name: "remote docs", configPath: ".codex/config.toml", agent: "Codex", transport: "http", url: "https://docs.example.com/mcp", env: [] },
    ]);
    expectNoLeak(servers);
  });

  it("skips TOML lines it cannot read instead of failing", () => {
    const content = ["[mcp_servers.a]", "when = 1979-05-27T07:32:00Z", "broken = = =", "command = \"a\""].join("\n");
    expect(parseMcpServers(".codex/config.toml", content)).toMatchObject([{ name: "a", command: "a", transport: "stdio" }]);
  });

  it("redacts secrets passed as arguments or embedded in URLs", () => {
    const content = JSON.stringify({
      mcpServers: {
        pg: { command: "npx", args: ["server-postgres", `postgres://admin:${FAKE.password}@db.internal:5432/app`] },
        flags: { command: "srv", args: ["--api-key", FAKE.literal, `--token=${FAKE.github}`, "--port", "8080"] },
        remote: { url: `https://mcp.internal/sse?api_key=${FAKE.literal}&v=2` },
        placeholder: { command: "srv", args: ["--api-key", "${API_KEY}"] },
      },
    });
    const servers = parseMcpServers(".mcp.json", content);
    expect(servers.map((server) => server.command ?? server.url)).toEqual([
      "srv --api-key [redacted] --token=[redacted] --port 8080",
      "npx server-postgres postgres://admin:[redacted]@db.internal:5432/app",
      "srv --api-key ${API_KEY}",
      "https://mcp.internal/sse?api_key=[redacted]&v=2",
    ]);
    expectNoLeak(servers);
  });

  it("returns [] on parse failure or unexpected shapes and never throws", () => {
    expect(parseMcpServers(".mcp.json", "{ not json")).toEqual([]);
    expect(parseMcpServers(".mcp.json", "")).toEqual([]);
    expect(parseMcpServers(".mcp.json", "[1, 2]")).toEqual([]);
    expect(parseMcpServers(".mcp.json", `{ "mcpServers": ["a"] }`)).toEqual([]);
    expect(parseMcpServers(".mcp.json", `{ "mcpServers": { "a": "string" } }`)).toEqual([]);
    expect(parseMcpServers(".mcp.json", `{ "mcpServers": { "__proto__": { "command": "x" } } }`)).toHaveLength(1);
    expect(parseMcpServers(".codex/config.toml", "[[[[")).toEqual([]);
    expect(parseMcpServers(".mcp.json", "[".repeat(5000))).toEqual([]);
  });
});

describe("parsePermissions", () => {
  it("reads Claude allow/deny/ask rules and flags broad grants", () => {
    const content = `{
  // local settings
  "permissions": {
    "allow": [
      "Bash(npm run test:*)",
      "Bash",
      "Bash(*)",
      "Bash(:*)",
      "Bash(sudo:*)",
      "Bash(curl:*)",
      "Bash(rm:*)",
      "Bash(rm -rf:*)",
      "Bash(git status)",
      "WebFetch",
      "WebFetch(domain:example.com)",
      "Write",
      "Edit",
      "Edit(src/**)",
      "Edit(**)",
      "Read(./docs/**)",
      "mcp__github",
      "mcp__github__create_issue",
      "mcp__github__*",
      "*",
    ],
    "deny": ["Read(./.env)", "Bash"],
    "ask": ["Bash(git push:*)"],
  },
}`;
    const grants = parsePermissions(".claude/settings.json", content);
    const broad = (effect: string): string[] =>
      grants.filter((grant) => grant.effect === effect && grant.broad).map((grant) => grant.rule);
    expect(grants).toHaveLength(23);
    expect(grants.every((grant) => grant.path === ".claude/settings.json" && grant.agent === "Claude Code")).toBe(true);
    expect(broad("allow")).toEqual([
      "Bash",
      "Bash(*)",
      "Bash(:*)",
      "Bash(sudo:*)",
      "Bash(curl:*)",
      "Bash(rm:*)",
      "Bash(rm -rf:*)",
      "WebFetch",
      "Write",
      "Edit",
      "Edit(**)",
      "mcp__github",
      "mcp__github__*",
      "*",
    ]);
    expect(broad("deny")).toEqual([]);
    expect(broad("ask")).toEqual([]);
    expect(grants.filter((grant) => grant.effect === "deny").map((grant) => grant.rule)).toEqual(["Read(./.env)", "Bash"]);
    expect(grants.filter((grant) => grant.effect === "ask").map((grant) => grant.rule)).toEqual(["Bash(git push:*)"]);
  });

  it("reports bypassPermissions and auto-enabled project MCP servers", () => {
    const content = `{ "permissions": { "defaultMode": "bypassPermissions" }, "enableAllProjectMcpServers": true }`;
    expect(parsePermissions(".claude/settings.local.json", content)).toEqual([
      { path: ".claude/settings.local.json", agent: "Claude Code", effect: "allow", rule: "defaultMode: bypassPermissions", broad: true },
      { path: ".claude/settings.local.json", agent: "Claude Code", effect: "allow", rule: "enableAllProjectMcpServers: true", broad: true },
    ]);
    expect(parsePermissions(".claude/settings.json", `{ "permissions": { "defaultMode": "acceptEdits" } }`)).toEqual([]);
  });

  it("reads Codex approval and sandbox settings, including profiles", () => {
    const content = [
      "approval_policy = \"never\"",
      "sandbox_mode = \"danger-full-access\" # yolo",
      "",
      "[profiles.safe]",
      "approval_policy = \"on-request\"",
      "sandbox_mode = \"workspace-write\"",
      "",
      "[profiles.fast]",
      "approval_policy = 'never'",
    ].join("\n");
    expect(parsePermissions(".codex/config.toml", content)).toEqual([
      { path: ".codex/config.toml", agent: "Codex", effect: "allow", rule: "approval_policy = \"never\"", broad: true },
      { path: ".codex/config.toml", agent: "Codex", effect: "allow", rule: "sandbox_mode = \"danger-full-access\"", broad: true },
      { path: ".codex/config.toml", agent: "Codex", effect: "allow", rule: "profiles.fast.approval_policy = \"never\"", broad: true },
    ]);
    expect(parsePermissions(".codex/config.toml", "approval_policy = \"on-request\"\n# sandbox_mode = \"danger-full-access\"")).toEqual([]);
  });

  it("flags write-all at workflow and job level", () => {
    const content = [
      "name: CI",
      "on: [push]",
      "permissions: write-all",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    permissions: write-all # everything",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "  lint:",
      "    permissions:",
      "      contents: read",
      "    steps:",
      "      - run: echo \"permissions: write-all\"",
      "  # permissions: write-all",
    ].join("\n");
    expect(parsePermissions(".github/workflows/ci.yml", content)).toEqual([
      { path: ".github/workflows/ci.yml", agent: "GitHub Actions", effect: "allow", rule: "permissions: write-all (workflow)", broad: true },
      { path: ".github/workflows/ci.yml", agent: "GitHub Actions", effect: "allow", rule: "permissions: write-all (job: build)", broad: true },
    ]);
  });

  it("flags pull_request_target combined with a checkout of the PR head", () => {
    const workflow = (trigger: string[], ref: string): string =>
      [
        "name: PR",
        ...trigger,
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Checkout",
        "        uses: actions/checkout@v4",
        "        with:",
        `          ref: ${ref}`,
        "      - run: npm test",
      ].join("\r\n");

    const sha = parsePermissions(".github/workflows/pr.yml", workflow(["on:", "  pull_request_target:", "    types: [opened]"], "${{ github.event.pull_request.head.sha }}"));
    expect(sha).toHaveLength(1);
    expect(sha[0]).toMatchObject({ agent: "GitHub Actions", effect: "allow", broad: true });
    expect(sha[0].rule).toContain("pull_request_target");
    expect(sha[0].rule).toContain("github.event.pull_request.head.sha");

    const headRef = parsePermissions(".github/workflows/pr.yaml", workflow(["on: [push, pull_request_target]"], "${{ github.event.pull_request.head.ref }}"));
    expect(headRef[0].rule).toContain("github.event.pull_request.head.ref");

    expect(parsePermissions(".github/workflows/pr.yml", workflow(["on: pull_request_target"], "main"))).toEqual([]);
    expect(parsePermissions(".github/workflows/pr.yml", workflow(["on: pull_request"], "${{ github.event.pull_request.head.sha }}"))).toEqual([]);
    expect(
      parsePermissions(".github/workflows/pr.yml", workflow(["on: push", "# pull_request_target"], "${{ github.event.pull_request.head.sha }}")),
    ).toEqual([]);
  });

  it("does not attribute a ref from another step to the checkout", () => {
    const content = [
      "on: pull_request_target",
      "jobs:",
      "  a:",
      "    steps:",
      "    - uses: actions/checkout@v4",
      "    - uses: other/action@v1",
      "      with:",
      "        ref: ${{ github.event.pull_request.head.sha }}",
    ].join("\n");
    expect(parsePermissions(".github/workflows/a.yml", content)).toEqual([]);
  });

  it("returns [] for unrelated or broken files and never throws", () => {
    expect(parsePermissions(".claude/settings.json", "{ nope")).toEqual([]);
    expect(parsePermissions(".claude/settings.json", `{ "permissions": { "allow": "Bash" } }`)).toEqual([]);
    expect(parsePermissions(".claude/settings.json", "[]")).toEqual([]);
    expect(parsePermissions(".mcp.json", `{ "permissions": { "allow": ["Bash"] } }`)).toEqual([]);
    expect(parsePermissions("AGENTS.md", "permissions: write-all")).toEqual([]);
    expect(parsePermissions(".github/workflows/x.yml", "")).toEqual([]);
  });
});

describe("detectInlineSecrets", () => {
  it("flags a token in an MCP env block with a dotted location and redacted preview", () => {
    const content = [
      "{",
      "  \"mcpServers\": {",
      "    \"github\": {",
      "      \"command\": \"npx\",",
      "      \"env\": {",
      `        "GITHUB_TOKEN": "${FAKE.github}"`,
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const secrets = detectInlineSecrets(".mcp.json", content);
    expect(secrets).toEqual([
      {
        path: ".mcp.json",
        line: 6,
        location: "mcpServers.github.env.GITHUB_TOKEN",
        preview: `ghp_…${FAKE.github.slice(-2)} (40 chars)`,
        kind: "github-token",
      },
    ]);
    expectNoLeak(secrets);
  });

  it.each([
    ["github-token", FAKE.githubOauth],
    ["github-fine-grained-pat", FAKE.githubPat],
    ["anthropic-api-key", FAKE.anthropic],
    ["openai-api-key", FAKE.openaiProject],
    ["openai-api-key", FAKE.openai],
    ["slack-token", FAKE.slack],
    ["aws-access-key-id", FAKE.aws],
    ["google-api-key", FAKE.google],
    ["gitlab-token", FAKE.gitlab],
    ["npm-token", FAKE.npm],
    ["huggingface-token", FAKE.huggingface],
    ["stripe-live-key", FAKE.stripe],
    ["sendgrid-api-key", FAKE.sendgrid],
    ["jwt", FAKE.jwt],
  ])("detects the %s format in plain text", (kind, token) => {
    const content = ["# Agent notes", "", `Use this one: ${token} for the API.`].join("\n");
    const secrets = detectInlineSecrets("AGENTS.md", content);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ path: "AGENTS.md", line: 3, location: "line 3", kind });
    expect(secrets[0].preview).toBe(`${token.slice(0, 4)}…${token.slice(-2)} (${token.length} chars)`);
    expect(JSON.stringify(secrets).includes(token)).toBe(false);
  });

  it("detects private key blocks without echoing key material", () => {
    const body = fake(64, 30);
    const content = ["{", `  "key": "-----BEGIN RSA PRIVATE KEY-----\\n${body}\\n-----END RSA PRIVATE KEY-----"`, "}"].join("\n");
    const secrets = detectInlineSecrets(".gemini/settings.json", content);
    expect(secrets).toEqual([
      { path: ".gemini/settings.json", line: 2, location: "key", preview: "-----BEGIN RSA PRIVATE KEY----- (key block)", kind: "private-key" },
    ]);
    expect(JSON.stringify(secrets).includes(body)).toBe(false);
    expect(detectInlineSecrets("CLAUDE.md", "-----BEGIN OPENSSH PRIVATE KEY-----")[0]).toMatchObject({ kind: "private-key", line: 1, location: "line 1" });
    expect(detectInlineSecrets("CLAUDE.md", "-----BEGIN PUBLIC KEY-----")).toEqual([]);
  });

  it("flags high-entropy literals under secret-like env and header keys", () => {
    const content = `{
  "mcpServers": {
    "internal": {
      "url": "https://mcp.internal/sse",
      "headers": { "Authorization": "Bearer ${FAKE.literal}" },
      "env": {
        "ACME_API_KEY": "${fake(32, 40)}",
        "LOG_LEVEL": "${fake(32, 41)}"
      }
    }
  }
}`;
    const secrets = detectInlineSecrets(".cursor/mcp.json", content);
    expect(secrets.map((secret) => [secret.line, secret.location, secret.kind])).toEqual([
      [5, "mcpServers.internal.headers.Authorization", "high-entropy-secret"],
      [7, "mcpServers.internal.env.ACME_API_KEY", "high-entropy-secret"],
    ]);
    expect(secrets[0].preview).toBe(`${FAKE.literal.slice(0, 4)}…${FAKE.literal.slice(-2)} (40 chars)`);
    expectNoLeak(secrets, [FAKE.literal, fake(32, 40)]);
  });

  it("does not flag placeholders, references, short or low-entropy values", () => {
    const content = JSON.stringify(
      {
        mcpServers: {
          s: {
            env: {
              A_TOKEN: "",
              B_TOKEN: "${GITHUB_TOKEN}",
              C_TOKEN: "$GITHUB_TOKEN",
              D_TOKEN: "${env:GITHUB_TOKEN}",
              E_TOKEN: "{env:GITHUB_TOKEN}",
              F_TOKEN: "<your-github-token-goes-here>",
              G_TOKEN: "your-github-personal-access-token",
              H_TOKEN: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              I_TOKEN: "changeme",
              J_TOKEN: "short1A2b",
              K_TOKEN: "aaaaaaaabbbbbbbbaaaaaaaabbbbbbbb",
              L_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
              M_TOKEN: "GITHUB_PERSONAL_ACCESS_TOKEN",
              GOOGLE_APPLICATION_CREDENTIALS: "/home/dev/keys/service-account-9f8e7d.json",
              AUTH_URL: "https://auth.internal.acme.dev/oauth2/v1/authorize",
              N_TOKEN: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
              DATABASE_URL: "postgres://app:${DB_PASSWORD}@db:5432/app",
              LOCAL_DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
            },
            headers: { Authorization: "Bearer ${API_TOKEN}" },
          },
        },
      },
      null,
      2,
    );
    expect(detectInlineSecrets(".mcp.json", content)).toEqual([]);
  });

  it("flags Codex TOML env values and credentials in connection URLs", () => {
    const content = [
      "[mcp_servers.pg]",
      "command = \"npx\"",
      `args = ["server-postgres", "postgres://admin:${FAKE.password}@db.internal:5432/app"]`,
      "bearer_token_env_var = \"A_RATHER_LONG_ENV_NAME_1\"",
      "",
      "[mcp_servers.pg.env]",
      `PG_PASSWORD = '${FAKE.literal}'`,
      `inline = { API_KEY = "${FAKE.openai}" }`,
    ].join("\n");
    const secrets = detectInlineSecrets(".codex/config.toml", content);
    expect(secrets.map((secret) => [secret.line, secret.location, secret.kind])).toEqual([
      [3, "mcp_servers.pg.args.1", "url-credentials"],
      [7, "mcp_servers.pg.env.PG_PASSWORD", "high-entropy-secret"],
      [8, "mcp_servers.pg.env.inline.API_KEY", "openai-api-key"],
    ]);
    expectNoLeak(secrets);
  });

  it("flags secrets passed as command-line arguments", () => {
    const content = JSON.stringify({ mcpServers: { s: { command: "srv", args: ["--api-key", FAKE.literal, `--auth-token=${fake(30, 50)}`, "--name", fake(30, 51)] } } });
    const secrets = detectInlineSecrets(".mcp.json", content);
    expect(secrets.map((secret) => secret.location)).toEqual(["mcpServers.s.args.1"]);
    // Both arguments sit on line 1 of the minified file: deduped per (path, line, kind).
    expect(detectInlineSecrets(".mcp.json", JSON.stringify(JSON.parse(content), null, 2)).map((secret) => secret.location)).toEqual([
      "mcpServers.s.args.1",
      "mcpServers.s.args.2",
    ]);
    expectNoLeak(secrets, [FAKE.literal, fake(30, 50)]);
  });

  it("flags credentials in URL query strings", () => {
    const content = `{
  "mcpServers": {
    "r": { "url": "https://mcp.internal/sse?api_key=${FAKE.literal}&v=2" },
    "p": { "url": "https://mcp.internal/sse?api_key=\${API_KEY}&page=${fake(30, 60)}" }
  }
}`;
    const secrets = detectInlineSecrets(".mcp.json", content);
    expect(secrets.map((secret) => [secret.line, secret.location, secret.kind])).toEqual([[3, "mcpServers.r.url", "high-entropy-secret"]]);
    expectNoLeak(secrets);
  });

  it("scans workflows and still finds tokens when JSON does not parse", () => {
    const workflow = ["env:", `  NPM_TOKEN: ${FAKE.npm}`, "  SAFE: ${{ secrets.NPM_TOKEN }}"].join("\n");
    expect(detectInlineSecrets(".github/workflows/release.yml", workflow)).toMatchObject([{ line: 2, location: "line 2", kind: "npm-token" }]);
    const broken = `{ "mcpServers": { "a": { "env": { "T": "${FAKE.gitlab}" }`;
    expect(detectInlineSecrets(".mcp.json", broken)).toMatchObject([{ line: 1, location: "line 1", kind: "gitlab-token" }]);
  });

  it("dedupes per line and kind, and returns [] for clean or empty content", () => {
    const content = `tokens: ${FAKE.github} ${FAKE.githubOauth}\nagain: ${FAKE.github}`;
    expect(detectInlineSecrets("CLAUDE.md", content).map((secret) => [secret.line, secret.kind])).toEqual([
      [1, "github-token"],
      [2, "github-token"],
    ]);
    expect(detectInlineSecrets("CLAUDE.md", "")).toEqual([]);
    expect(detectInlineSecrets("CLAUDE.md", "# Rules\nUse `npm test`. Never commit AKIAIOSFODNN7EXAMPLE-style keys.")).toEqual([]);
  });
});

describe("analyzeReach", () => {
  const ref = (file: string, name: string, line: number, secretLike: boolean): EnvRef => ({ file, name, line, secretLike });
  const facts = (path: string, envRefs: EnvRef[]): FileFacts => ({ path, language: "typescript", isTest: false, imports: [], envRefs });

  const graph: FileGraph = {
    ...emptyGraph(),
    files: ["src/lib/github.ts", "src/lib/ai.ts", "src/app/api/repo/route.ts", "scripts/seed.ts"],
    facts: new Map([
      ["src/lib/github.ts", facts("src/lib/github.ts", [ref("src/lib/github.ts", "GITHUB_TOKEN", 4, true)])],
      ["src/lib/ai.ts", facts("src/lib/ai.ts", [ref("src/lib/ai.ts", "OPENAI_API_KEY", 9, true), ref("src/lib/ai.ts", "NODE_ENV", 2, false)])],
      [
        "src/app/api/repo/route.ts",
        facts("src/app/api/repo/route.ts", [
          ref("src/app/api/repo/route.ts", "GITHUB_TOKEN", 12, true),
          ref("src/app/api/repo/route.ts", "GITHUB_TOKEN", 30, true),
          ref("src/app/api/repo/route.ts", "NODE_ENV", 3, false),
        ]),
      ],
      ["scripts/seed.ts", facts("scripts/seed.ts", [ref("scripts/seed.ts", "GITHUB_TOKEN", 1, true)])],
    ]),
  };

  const membership: ComponentMembership = {
    fileToComponent: new Map([
      ["src/lib/github.ts", "lib"],
      ["src/lib/ai.ts", "lib"],
      ["src/app/api/repo/route.ts", "api"],
    ]),
    componentFiles: new Map([
      ["lib", ["src/lib/ai.ts", "src/lib/github.ts"]],
      ["api", ["src/app/api/repo/route.ts"]],
    ]),
    unmapped: ["scripts/seed.ts"],
  };

  const files: SourceFile[] = [
    { path: "src/lib/github.ts", content: `const leaked = "${FAKE.gitlab}";` },
    { path: "packages/x/.mcp.json", content: `{ "mcpServers": { "zeta": { "command": "z" }, "alpha": { "url": "https://a.example.com" } } }` },
    {
      path: ".mcp.json",
      content: `{\n  "mcpServers": {\n    "github": { "command": "npx", "env": { "GITHUB_TOKEN": "${FAKE.github}" } }\n  }\n}`,
    },
    { path: ".claude/settings.json", content: `{ "permissions": { "allow": ["Bash", "Read(src/**)"], "deny": ["Read(./.env)"] } }` },
    { path: ".codex/config.toml", content: "sandbox_mode = \"danger-full-access\"\n[mcp_servers.fs]\ncommand = \"fs-server\"\n" },
    { path: ".github/workflows/ci.yml", content: "on: push\npermissions: write-all\njobs: {}\n" },
    { path: ".cursor/mcp.json", content: null },
    { path: "AGENTS.md", content: "# Agents\nBe careful.\n" },
    { path: "README.md", content: "# Readme" },
  ];

  it("maps configs, servers, permissions and secrets deterministically", () => {
    const report = analyzeReach(files, graph, membership);
    expect(report.configs).toEqual([
      { path: ".claude/settings.json", type: "claude-settings", agent: "Claude Code" },
      { path: ".codex/config.toml", type: "codex-config", agent: "Codex" },
      { path: ".cursor/mcp.json", type: "mcp", agent: "Cursor" },
      { path: ".github/workflows/ci.yml", type: "workflow", agent: "GitHub Actions" },
      { path: ".mcp.json", type: "mcp", agent: "Claude Code" },
      { path: "AGENTS.md", type: "instructions", agent: "AGENTS.md" },
      { path: "packages/x/.mcp.json", type: "mcp", agent: "Claude Code" },
    ]);
    expect(report.mcpServers.map((server) => [server.configPath, server.name, server.transport])).toEqual([
      [".codex/config.toml", "fs", "stdio"],
      [".mcp.json", "github", "stdio"],
      ["packages/x/.mcp.json", "alpha", "http"],
      ["packages/x/.mcp.json", "zeta", "stdio"],
    ]);
    expect(report.permissions.map((grant) => [grant.path, grant.effect, grant.rule, grant.broad])).toEqual([
      [".claude/settings.json", "allow", "Bash", true],
      [".claude/settings.json", "allow", "Read(src/**)", false],
      [".claude/settings.json", "deny", "Read(./.env)", false],
      [".codex/config.toml", "allow", "sandbox_mode = \"danger-full-access\"", true],
      [".github/workflows/ci.yml", "allow", "permissions: write-all (workflow)", true],
    ]);
    // Agent configs get the full scan; other files only the high-precision token formats.
    expect(report.inlineSecrets).toEqual([
      {
        path: ".mcp.json",
        line: 3,
        location: "mcpServers.github.env.GITHUB_TOKEN",
        preview: `ghp_…${FAKE.github.slice(-2)} (40 chars)`,
        kind: "github-token",
      },
      expect.objectContaining({ path: "src/lib/github.ts", line: 1, location: "line 1", kind: "gitlab-token" }),
    ]);
    expectNoLeak(report);
    expect(analyzeReach([...files].reverse(), graph, membership)).toEqual(report);
  });

  it("aggregates env access by component when membership is given", () => {
    expect(analyzeReach(files, graph, membership).envAccess).toEqual([
      {
        name: "GITHUB_TOKEN",
        secretLike: true,
        readers: ["api", "lib", "scripts/seed.ts"],
        files: ["scripts/seed.ts", "src/app/api/repo/route.ts", "src/lib/github.ts"],
      },
      { name: "NODE_ENV", secretLike: false, readers: ["api", "lib"], files: ["src/app/api/repo/route.ts", "src/lib/ai.ts"] },
      { name: "OPENAI_API_KEY", secretLike: true, readers: ["lib"], files: ["src/lib/ai.ts"] },
    ]);
  });

  it("falls back to file paths without membership", () => {
    const access = analyzeReach([], graph).envAccess;
    expect(access.map((entry) => entry.name)).toEqual(["GITHUB_TOKEN", "NODE_ENV", "OPENAI_API_KEY"]);
    expect(access[0].readers).toEqual(["scripts/seed.ts", "src/app/api/repo/route.ts", "src/lib/github.ts"]);
    expect(access[0].readers).toEqual(access[0].files);
  });

  it("returns an empty report for empty input", () => {
    expect(analyzeReach([], emptyGraph())).toEqual({ configs: [], mcpServers: [], inlineSecrets: [], permissions: [], envAccess: [] });
  });
});

describe("detectKnownTokens (non-config files)", () => {
  it("needs key material after a private key header", () => {
    const line = (index: number) => `MIIEpAIBAAKCAQEA${String(index).repeat(3)}pL2vB8nW4tY6uJ1hK5gF0dS3aE9cX2zV7bN4mQ8wR1tY5uI3oP6lK0jH2gF4dS7`;
    const real = ["-----BEGIN RSA PRIVATE KEY-----", ...[1, 2, 3, 4, 5].map(line), "-----END RSA PRIVATE KEY-----"].join("\n");
    expect(detectKnownTokens("deploy/key.pem", real).map((secret) => secret.kind)).toEqual(["private-key"]);
    expect(detectKnownTokens("src/a.test.ts", 'const header = "-----BEGIN RSA PRIVATE KEY-----";')).toEqual([]);
  });
});
