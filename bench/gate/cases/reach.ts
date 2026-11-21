// Agent reach: the change widens what coding agents (or CI) can touch.

import { AGENT_COMMITS, file, pseudoRandomToken, replace, scenario } from "../fixture";
import type { BenchCase } from "../types";

// A fake credential, built at runtime so no token-shaped literal is committed.
// A repeated-character token is deliberately not flagged by the engine
// (entropy check), so the body is pseudo-random.
const FAKE_GITHUB_TOKEN = `${"ghp"}_${pseudoRandomToken(36)}`;

export const reachCases: BenchCase[] = [
  scenario({
    id: "reach-mcp-inline-token",
    category: "reach",
    description: "An MCP config is committed with an inline GitHub token",
    source: "GitGuardian 2026: secrets in MCP configs",
    commits: AGENT_COMMITS,
    head: {
      ".mcp.json": file([
        "{",
        '  "mcpServers": {',
        '    "github": {',
        '      "command": "npx",',
        '      "args": ["-y", "@modelcontextprotocol/server-github"],',
        `      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${FAKE_GITHUB_TOKEN}" }`,
        "    }",
        "  }",
        "}",
      ]),
    },
    expected: [{ kind: "inline-secret", path: ".mcp.json", minSeverity: "error" }],
    tolerated: ["agent-permission-change"],
  }),
  scenario({
    id: "reach-claude-bash-wildcard",
    category: "reach",
    description: "Bash(*) is granted in .claude/settings.json",
    source: "Replit/PocketOS incidents: over-privileged credentials and unconstrained shell access",
    commits: AGENT_COMMITS,
    head: {
      ".claude/settings.json": file(["{", '  "permissions": {', '    "allow": ["Bash(*)"]', "  }", "}"]),
    },
    expected: [{ kind: "agent-permission-change", signal: "Bash(*)", path: ".claude/settings.json", minSeverity: "warning" }],
    tolerated: ["agent-permission-change"],
  }),
  scenario({
    id: "reach-claude-bypass-permissions",
    category: "reach",
    description: "Claude Code is switched to bypassPermissions mode",
    source: "Replit/PocketOS incidents: agents acting without an approval step",
    base: {
      ".claude/settings.json": file(["{", '  "permissions": {', '    "allow": ["Bash(npm test)"]', "  }", "}"]),
    },
    head: {
      ".claude/settings.json": file([
        "{",
        '  "permissions": {',
        '    "allow": ["Bash(npm test)"],',
        '    "defaultMode": "bypassPermissions"',
        "  }",
        "}",
      ]),
    },
    expected: [{ kind: "agent-permission-change", signal: "bypassPermissions", path: ".claude/settings.json", minSeverity: "warning" }],
    tolerated: ["agent-permission-change"],
  }),
  scenario({
    id: "reach-codex-full-access",
    category: "reach",
    description: "Codex is configured to never ask and to run without a sandbox",
    source: "Replit/PocketOS incidents: agents acting without an approval step",
    head: {
      ".codex/config.toml": file(['approval_policy = "never"', 'sandbox_mode = "danger-full-access"']),
    },
    expected: [
      { kind: "agent-permission-change", signal: "approval_policy", path: ".codex/config.toml", minSeverity: "warning" },
      { kind: "agent-permission-change", signal: "danger-full-access", path: ".codex/config.toml", minSeverity: "warning" },
    ],
    tolerated: ["agent-permission-change"],
  }),
  scenario({
    id: "reach-pull-request-target",
    category: "reach",
    description: "A workflow on pull_request_target checks out and runs the PR head",
    source: "GitHub Security Lab: pwn requests (pull_request_target with checkout of untrusted code)",
    head: {
      ".github/workflows/preview.yml": file([
        "name: Preview",
        "on:",
        "  pull_request_target:",
        "jobs:",
        "  preview:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "        with:",
        "          ref: ${{ github.event.pull_request.head.sha }}",
        "      - run: npm ci && npm run build",
        "        env:",
        "          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}",
      ]),
    },
    expected: [{ kind: "agent-permission-change", signal: "pull_request_target", path: ".github/workflows/preview.yml", minSeverity: "warning" }],
    tolerated: ["protected-path"],
  }),
  scenario({
    id: "reach-workflow-write-all",
    category: "reach",
    description: "The CI workflow's token is widened from contents: read to write-all",
    source: "Replit/PocketOS incidents: over-privileged credentials",
    head: {
      ".github/workflows/ci.yml": replace("permissions:\n  contents: read\n", "permissions: write-all\n"),
    },
    expected: [{ kind: "agent-permission-change", signal: "write-all", path: ".github/workflows/ci.yml", minSeverity: "warning" }],
    tolerated: ["protected-path"],
  }),
  scenario({
    id: "reach-claude-local-settings",
    category: "reach",
    description: "Broad WebFetch and Write grants are committed in .claude/settings.local.json",
    source: "Replit/PocketOS incidents: over-privileged credentials and unconstrained shell access",
    head: {
      ".claude/settings.local.json": file(["{", '  "permissions": {', '    "allow": ["WebFetch", "Write"]', "  }", "}"]),
    },
    expected: [
      { kind: "agent-permission-change", signal: "WebFetch", path: ".claude/settings.local.json", minSeverity: "warning" },
      { kind: "agent-permission-change", signal: "Write", path: ".claude/settings.local.json", minSeverity: "warning" },
    ],
    tolerated: ["agent-permission-change"],
  }),
  scenario({
    id: "reach-mcp-url-credentials",
    category: "reach",
    description: "A Cursor MCP config embeds database credentials in a connection URL",
    source: "GitGuardian 2026: secrets in MCP configs",
    head: {
      ".cursor/mcp.json": file([
        "{",
        '  "mcpServers": {',
        '    "postgres": {',
        '      "command": "npx",',
        `      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgres://shop_admin:${pseudoRandomToken(20, 7)}@db.internal.example:5432/shop"]`,
        "    }",
        "  }",
        "}",
      ]),
    },
    expected: [{ kind: "inline-secret", path: ".cursor/mcp.json", minSeverity: "error" }],
    tolerated: ["agent-permission-change"],
  }),
  scenario({
    id: "reach-env-file-committed",
    category: "reach",
    description: "A .env file with a live-looking API key is committed",
    source: "GitGuardian 2026: secrets sprawl in AI-assisted commits",
    head: { ".env": file([`STRIPE_SECRET_KEY=${"sk"}_${"live"}_${pseudoRandomToken(24, 11)}`]) },
    expected: [{ kind: "inline-secret", path: ".env", minSeverity: "error" }],
    tolerated: ["protected-path"],
  }),
  scenario({
    id: "reach-secret-in-source",
    category: "reach",
    description: "A live-looking API key is hardcoded in application source",
    source: "GitGuardian 2026: secrets sprawl in AI-assisted commits",
    head: {
      "src/payments/stripe.ts": replace(
        "  const key = process.env.STRIPE_SECRET_KEY;",
        `  const key = process.env.STRIPE_SECRET_KEY ?? "${"sk"}_${"live"}_${pseudoRandomToken(24, 13)}";`,
      ),
    },
    expected: [{ kind: "inline-secret", path: "src/payments/stripe.ts", minSeverity: "error" }],
  }),
];
