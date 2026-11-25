# Rassam

Rassam is an architecture contract for repositories that coding agents work in: a human-owned blueprint, `.rassam/blueprint.json`, that says which component owns each file, what may depend on what, and which rules every change must keep. This package is the `rassam` command-line tool and MCP server: it drafts the blueprint, checks changes against it, and answers an agent's questions before it edits.

## Three commands

Run them in the root of a git repository. Node.js 20 or newer; nothing else to install.

```bash
npx @v0ightt/rassam init    # draft .rassam/blueprint.json from the code that is there
npx @v0ightt/rassam check   # check the repository against the blueprint
npx @v0ightt/rassam mcp     # serve the blueprint to a coding agent over MCP (stdio)
```

`init` only records what static analysis can see. The intent, rules and invariants are yours to write. Add `--help` to any command for its options, or run `npx @v0ightt/rassam --help` for the full list.

To give an agent the MCP server, add it to `.mcp.json` (or your agent's MCP settings), pinned to a version so it does not change underneath you:

```json
{
  "mcpServers": {
    "rassam": { "command": "npx", "args": ["-y", "@v0ightt/rassam@0.4.1", "mcp"] }
  }
}
```

## Guard pull requests

The same gate runs as a GitHub Action. Pin it to a release:

```yaml
# .github/workflows/rassam.yml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  blueprint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: V0ightt/Rassam@v0.4.1
```

For the strongest pin, use the release's full commit SHA with the version in a comment (`uses: V0ightt/Rassam@<sha> # v0.4.1`).

## Learn more

- Getting started: https://github.com/V0ightt/Rassam/blob/main/docs/getting-started.md
- Blueprint format: https://github.com/V0ightt/Rassam/blob/main/docs/blueprint-spec.md
- Source, issues and releases: https://github.com/V0ightt/Rassam
