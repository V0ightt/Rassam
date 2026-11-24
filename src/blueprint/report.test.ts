import { describe, it, expect } from "vitest";

import {
  COMMENT_MARKER,
  exitCodeFor,
  renderDot,
  renderGithubAnnotations,
  renderJson,
  renderMarkdown,
  renderMermaid,
  renderSarif,
  renderText,
  verdict,
} from "./report";
import type { GraphView } from "./report";
import type { CheckReport, CheckSummary, Finding } from "./types";

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[`);

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-1",
    kind: "forbidden-dependency",
    severity: "error",
    ruleId: "no-ui-to-db",
    title: "ui must not import db",
    message: "src/ui/page.tsx imports src/db/client.ts",
    reason: "The UI talks to the API only.",
    components: ["ui", "db"],
    locations: [{ path: "src/ui/page.tsx", line: 3, endLine: 4 }],
    isNew: true,
    score: 90,
    ...overrides,
  };
}

function summary(findings: Finding[], overrides: Partial<CheckSummary> = {}): CheckSummary {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    newFindings: findings.filter((f) => f.isNew).length,
    components: 4,
    filesAnalyzed: 42,
    filesMapped: 40,
    filesUnmapped: 2,
    componentEdges: 7,
    undeclaredEdges: 1,
    humanAuthoredRatio: 0.6,
    ...overrides,
  };
}

function report(findings: Finding[], overrides: Partial<CheckReport> = {}): CheckReport {
  return {
    tool: { name: "rassam", version: "0.4.0" },
    generatedAt: "2026-11-21T00:00:00.000Z",
    mode: "full",
    blueprint: { path: ".rassam/blueprint.json", present: true, valid: true, system: "Shop" },
    summary: summary(findings),
    findings,
    ...overrides,
  };
}

const errorNew = finding();
const warningNew = finding({
  id: "f-2",
  kind: "undeclared-dependency",
  severity: "warning",
  ruleId: undefined,
  reason: undefined,
  title: "api → billing is not declared",
  message: "2 imports from api to billing",
  components: ["api", "billing"],
  locations: [
    { path: "src/api/a.ts", line: 1 },
    { path: "src/api/b.ts", line: 2 },
    { path: "src/api/c.ts", line: 3 },
    { path: "src/api/d.ts", line: 4 },
    { path: "src/api/e.ts" },
  ],
  score: 50,
});
const infoNew = finding({
  id: "f-3",
  kind: "unmapped-file",
  severity: "info",
  ruleId: undefined,
  reason: undefined,
  title: "Unmapped file",
  message: "scripts/tool.ts belongs to no component",
  components: [],
  locations: [{ path: "scripts/tool.ts" }],
  score: 10,
});
const errorOld = finding({ id: "f-4", title: "old cycle", kind: "dependency-cycle", isNew: false, score: 5, reason: undefined });

function fullReport(): CheckReport {
  return report([errorNew, warningNew, infoNew]);
}

function diffReport(): CheckReport {
  return report([errorNew, warningNew, infoNew, errorOld], {
    mode: "diff",
    base: { ref: "main", sha: "aaa111" },
    head: { ref: "feature/x", sha: "bbb222" },
    contractChanges: [
      { kind: "component-added", target: "billing", summary: "New component billing", weakens: false },
      { kind: "rule-removed", target: "no-ui-to-db", summary: "Rule removed | was severity error", weakens: true },
    ],
    impact: {
      changedFiles: ["src/ui/page.tsx", "src/api/a.ts", ".rassam/blueprint.json"],
      touchedComponents: [
        { id: "ui", files: ["src/ui/page.tsx"] },
        { id: "api", files: ["src/api/a.ts"] },
      ],
      dependents: [
        { id: "web", depth: 1 },
        { id: "cli", depth: 2 },
      ],
    },
    agentActivity: { commits: 5, agentCommits: 3, agents: ["Claude", "GitHub Copilot"] },
    reach: {
      configs: [{ path: ".mcp.json", type: "mcp", agent: "Claude" }],
      mcpServers: [{ name: "github", configPath: ".mcp.json", agent: "Claude", transport: "stdio", command: "npx", env: ["GITHUB_TOKEN"] }],
      inlineSecrets: [{ path: ".mcp.json", line: 12, location: "mcpServers.github.env.GITHUB_TOKEN", preview: "ghp_…a1b2 (40 chars)", kind: "github-token" }],
      permissions: [
        { path: ".claude/settings.json", agent: "Claude", effect: "allow", rule: "Bash(*)", broad: true },
        { path: ".claude/settings.json", agent: "Claude", effect: "deny", rule: "Read(.env)", broad: false },
      ],
      envAccess: [],
    },
    approved: false,
  });
}

function noBlueprintReport(): CheckReport {
  const invalid = finding({
    id: "f-0",
    kind: "invalid-blueprint",
    title: "No blueprint",
    message: "No .rassam/blueprint.json found",
    reason: undefined,
    ruleId: undefined,
    components: [],
    locations: [],
  });
  return report([invalid], { blueprint: { path: ".rassam/blueprint.json", present: false, valid: false } });
}

describe("verdict and exitCodeFor", () => {
  it("fails on new errors by default", () => {
    expect(verdict(fullReport())).toBe("fail");
    expect(exitCodeFor(fullReport(), "error")).toBe(1);
  });

  it("warns when only new warnings remain below the threshold", () => {
    const r = report([warningNew, infoNew]);
    expect(verdict(r)).toBe("warn");
    expect(verdict(r, "error")).toBe("warn");
    expect(exitCodeFor(r, "error")).toBe(0);
    expect(verdict(r, "warning")).toBe("fail");
    expect(exitCodeFor(r, "warning")).toBe(1);
  });

  it("never fails with failOn never, but still warns", () => {
    expect(verdict(fullReport(), "never")).toBe("warn");
    expect(exitCodeFor(fullReport(), "never")).toBe(0);
  });

  it("ignores pre-existing findings", () => {
    const r = report([errorOld, finding({ id: "w", severity: "warning", isNew: false })]);
    expect(verdict(r)).toBe("pass");
    expect(verdict(r, "warning")).toBe("pass");
    expect(exitCodeFor(r, "warning")).toBe(0);
  });

  it("passes with info-only and empty reports", () => {
    expect(verdict(report([infoNew]), "warning")).toBe("pass");
    expect(verdict(report([]))).toBe("pass");
    expect(exitCodeFor(report([]), "error")).toBe(0);
  });
});

describe("renderText", () => {
  it("renders a header, summary and attention list without ANSI codes by default", () => {
    const text = renderText(fullReport());
    const lines = text.split("\n");
    expect(lines[0]).toBe("✖ fail · Shop · full mode");
    expect(lines[1]).toBe(
      "1 error, 1 warning, 1 info · 3 new · 4 components · 40/42 files mapped (2 unmapped) · 7 component edges (1 undeclared) · 60% human-authored",
    );
    expect(text).toContain("Needs your attention (3 of 3 new)");
    expect(text).toContain("src/ui/page.tsx:3");
    expect(text).toContain('reason: "The UI talks to the API only."');
    expect(text).not.toMatch(ANSI_PATTERN);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("caps locations at three with a +N more suffix", () => {
    const text = renderText(fullReport());
    expect(text).toContain("at src/api/a.ts:1, src/api/b.ts:2, src/api/c.ts:3 +2 more");
    expect(text).not.toContain("src/api/d.ts");
  });

  it("colors by severity only when color is on", () => {
    const text = renderText(fullReport(), { color: true });
    expect(text).toContain("\u001b[31m✖ error\u001b[0m");
    expect(text).toContain("\u001b[33m▲ warning\u001b[0m");
    expect(text).toContain("\u001b[36m● info\u001b[0m");
    expect(text).toContain("\u001b[2mat src/ui/page.tsx:3\u001b[0m");
    expect(renderText(fullReport(), { color: false })).not.toMatch(ANSI_PATTERN);
  });

  it("respects the budget and groups the rest by kind", () => {
    const text = renderText(diffReport(), { budget: 1 });
    expect(text).toContain("Needs your attention (1 of 3 new)");
    expect(text).toContain("Other findings (3, 1 pre-existing)");
    expect(text).toContain("1 × undeclared-dependency");
    expect(text).toContain("1 × dependency-cycle");
    expect(text).not.toContain("api → billing is not declared");
    expect(text).not.toContain("old cycle");
  });

  it("expands remaining findings when verbose", () => {
    const text = renderText(diffReport(), { budget: 1, verbose: true });
    expect(text).toContain("api → billing is not declared");
    expect(text).toContain("old cycle");
    expect(text).not.toContain("--verbose");
  });

  it("renders diff-mode sections", () => {
    const text = renderText(diffReport());
    expect(text.split("\n")[0]).toBe("✖ fail · Shop · diff mode · main…feature/x");
    expect(text).toContain("Contract changes (2, 1 weakening, NOT approved)");
    expect(text.indexOf("⚠ rule-removed")).toBeLessThan(text.indexOf("component-added billing"));
    expect(text).toContain("Blast radius (3 changed files)");
    expect(text).toContain("touched: ui (1 file), api (1 file)");
    expect(text).toContain("dependents: web (depth 1), cli (depth 2)");
    expect(text).toContain("Agent activity: 3/5 commits by agents (Claude, GitHub Copilot)");
    expect(text).toContain("inline secrets: 1");
    expect(text).toContain(".mcp.json:12 mcpServers.github.env.GITHUB_TOKEN ghp_…a1b2 (40 chars)");
    expect(text).toContain("broad permissions: 1");
    expect(text).toContain("MCP servers: 1: github (stdio, Claude)");
  });

  it("reports approval of contract changes", () => {
    expect(renderText({ ...diffReport(), approved: true })).toContain("1 weakening, approved by a human");
  });

  it("omits optional sections in full mode", () => {
    const text = renderText(fullReport());
    for (const section of ["Contract changes", "Blast radius", "Agent activity", "Reach highlights", "Other findings"]) {
      expect(text).not.toContain(section);
    }
  });

  it("tells the user to run rassam init when there is no blueprint", () => {
    const header = renderText(noBlueprintReport()).split("\n")[0];
    expect(header).toContain("no blueprint found at .rassam/blueprint.json");
    expect(header).toContain("rassam init");
  });

  it("handles empty findings", () => {
    const text = renderText(report([]));
    expect(text.split("\n")[0]).toBe("✔ pass · Shop · full mode");
    expect(text).toContain("Nothing new needs your attention.");
  });

  it("strips control characters from user-provided text", () => {
    const text = renderText(report([finding({ title: "evil\u001b[31m\ntitle" })]));
    expect(text).not.toMatch(ANSI_PATTERN);
    expect(text).toContain("evil[31m title");
  });
});

describe("renderMarkdown", () => {
  it("starts with the marker and a verdict heading", () => {
    const md = renderMarkdown(fullReport());
    expect(md.startsWith(`${COMMENT_MARKER}\n## ❌ Rassam: Blueprint check failed (1 new error, 1 new warning)`)).toBe(true);
    expect(md).toContain("### Needs your attention");
    expect(md).toContain("Generated by Rassam");
    expect(renderMarkdown(report([warningNew]))).toContain("## ⚠️ Rassam: Blueprint check passed with warnings");
    expect(renderMarkdown(report([]))).toContain("## ✅ Rassam: Blueprint check passed");
    expect(renderMarkdown(report([]))).toContain("Nothing new needs your attention.");
  });

  it("supports a custom marker", () => {
    expect(renderMarkdown(fullReport(), { marker: "<!-- custom -->" }).startsWith("<!-- custom -->\n")).toBe(true);
  });

  it("renders locations as inline code without repo context", () => {
    const md = renderMarkdown(fullReport());
    expect(md).toContain("📍 `src/ui/page.tsx:3`");
    expect(md).not.toContain("/blob/");
    expect(md).toContain("   > The UI talks to the API only.");
  });

  it("links locations when repoUrl and headSha are given", () => {
    const r = report([finding({ locations: [{ path: "src/my dir/a (1).ts", line: 7 }, { path: "src/b.ts" }] })]);
    const md = renderMarkdown(r, { repoUrl: "https://github.com/acme/shop/", headSha: "bbb222" });
    expect(md).toContain("[`src/my dir/a (1).ts:7`](https://github.com/acme/shop/blob/bbb222/src/my%20dir/a%20%281%29.ts#L7)");
    expect(md).toContain("[`src/b.ts`](https://github.com/acme/shop/blob/bbb222/src/b.ts)");
  });

  it("limits the attention list to the budget", () => {
    const md = renderMarkdown(fullReport(), { budget: 1 });
    const attention = md.slice(md.indexOf("### Needs your attention"), md.indexOf("<details>"));
    expect(attention).toContain("1. 🔴 error · **ui must not import db**");
    expect(attention).not.toContain("2. ");
    expect(attention).toContain("…and 2 more new findings in the details below.");
  });

  it("escapes markdown in user-provided text", () => {
    const r = report([
      finding({
        title: "a|b `code` <script>alert(1)</script> *bold* @octocat",
        message: "# not a heading <img src=x>",
        reason: "line one\nline two",
      }),
    ]);
    const md = renderMarkdown(r);
    expect(md).toContain("a\\|b \\`code\\` &lt;script&gt;alert(1)&lt;/script&gt; \\*bold\\* @&#8203;octocat");
    expect(md).toContain("   \\# not a heading &lt;img src=x&gt;");
    expect(md).toContain("   > line one line two");
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img");
    expect(md).not.toContain("@octocat");
  });

  it("keeps backticks in paths inside a code span", () => {
    const md = renderMarkdown(report([finding({ locations: [{ path: "src/we`ird.ts", line: 1 }] })]));
    expect(md).toContain("``src/we`ird.ts:1``");
  });

  it("renders contract changes with weakening first and an approval line", () => {
    const md = renderMarkdown(diffReport());
    expect(md).toContain("### Contract changes");
    expect(md).toContain("| ⚠ | rule-removed | no-ui-to-db | Rule removed \\| was severity error |");
    expect(md.indexOf("rule-removed")).toBeLessThan(md.indexOf("component-added"));
    expect(md).toContain("**Not approved:** 1 change weakens the contract. Weakening changes require a human-approved label.");
    expect(renderMarkdown({ ...diffReport(), approved: true })).toContain("✅ **Approved:** 1 weakening change");
    expect(md).toContain("`main`…`feature/x`");
  });

  it("renders blast radius and agent activity", () => {
    const md = renderMarkdown(diffReport());
    expect(md).toContain("### Blast radius");
    expect(md).toContain("- **Dependents:** `web` (depth 1), `cli` (depth 2)");
    expect(md).toContain("**Agent activity:** 3/5 commits by agents (Claude, GitHub Copilot)");
    const plain = renderMarkdown(fullReport());
    expect(plain).not.toContain("### Blast radius");
    expect(plain).not.toContain("### Contract changes");
    expect(plain).not.toContain("Agent activity");
  });

  it("groups findings by kind in details blocks and separates pre-existing ones", () => {
    const md = renderMarkdown(diffReport());
    expect(md).toContain("<summary>Forbidden dependency (1) · <code>forbidden-dependency</code></summary>");
    expect(md).toContain("<summary>Undeclared dependency (1) · <code>undeclared-dependency</code></summary>");
    expect(md).toContain("<summary>Pre-existing findings (1), not introduced by this change</summary>");
    const existing = md.slice(md.indexOf("<summary>Pre-existing"));
    expect(existing).toContain("**old cycle**");
    expect(md.slice(0, md.indexOf("<summary>Pre-existing"))).not.toContain("old cycle");
    expect(md.match(/<details>/g)?.length).toBe(md.match(/<\/details>/g)?.length);
    expect(md).toContain("<summary>Agent reach: 1 inline secret, 1 broad permission, 1 MCP server</summary>");
    expect(md).toContain("`ghp_…a1b2 (40 chars)`");
  });

  it("says so when there is no blueprint", () => {
    const md = renderMarkdown(noBlueprintReport());
    expect(md).toContain("Rassam: no blueprint found");
    expect(md).toContain("Run `rassam init` to create one.");
  });

  it("truncates details first under maxChars", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      finding({ id: `m-${i}`, title: `violation number ${i}`, kind: i % 2 ? "layer-violation" : "forbidden-dependency", score: 400 - i }),
    );
    const r = report(many);
    const full = renderMarkdown(r);
    expect(full.length).toBeGreaterThan(8000);
    const md = renderMarkdown(r, { maxChars: 8000 });
    expect(md.length).toBeLessThanOrEqual(8000);
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md).toContain("### Needs your attention");
    expect(md).toContain("**violation number 4**");
    expect(md).toContain("Details were truncated");
    expect(md).toContain("Generated by Rassam");
    expect(md).toMatch(/…and \d+ more/);
    expect(md.match(/<details>/g)?.length).toBe(md.match(/<\/details>/g)?.length);
    expect(full).not.toContain("Details were truncated");
  });

  it("never exceeds a very small maxChars", () => {
    expect(renderMarkdown(diffReport(), { maxChars: 300 }).length).toBeLessThanOrEqual(300);
  });
});

describe("renderSarif", () => {
  type Sarif = {
    $schema: string;
    version: string;
    runs: Array<{
      tool: { driver: { name: string; informationUri: string; version: string; rules: Array<{ id: string; shortDescription: { text: string }; help: { text: string } }> } };
      results: Array<{
        ruleId: string;
        ruleIndex: number;
        level: string;
        message: { text: string };
        locations: Array<{ physicalLocation: { artifactLocation: { uri: string; uriBaseId: string }; region?: { startLine: number; endLine?: number } } }>;
        partialFingerprints: { rassamFindingId: string };
        baselineState: string;
        properties: { score: number; isNew: boolean; components: string[]; blueprintRule?: string };
      }>;
    }>;
  };

  const second = finding({ id: "f-5", title: "another", locations: [{ path: "src/my dir/a#b.ts", line: 9 }], score: 80 });
  const sarif = renderSarif(report([errorNew, second, warningNew, infoNew, errorOld, finding({ id: "f-6", locations: [] })])) as unknown as Sarif;
  const run = sarif.runs[0];

  it("has the SARIF 2.1.0 envelope and driver", () => {
    expect(sarif.$schema).toBe("https://json.schemastore.org/sarif-2.1.0.json");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(run.tool.driver).toMatchObject({ name: "Rassam", informationUri: "https://github.com/V0ightt/Rassam", version: "0.4.0" });
  });

  it("emits one rule per kind present", () => {
    expect(run.tool.driver.rules.map((rule) => rule.id)).toEqual([
      "forbidden-dependency",
      "undeclared-dependency",
      "unmapped-file",
      "dependency-cycle",
    ]);
    for (const rule of run.tool.driver.rules) {
      expect(rule.shortDescription.text.length).toBeGreaterThan(0);
      expect(rule.help.text.length).toBeGreaterThan(0);
    }
    for (const result of run.results) expect(run.tool.driver.rules[result.ruleIndex].id).toBe(result.ruleId);
  });

  it("maps levels, messages, fingerprints and baseline state", () => {
    expect(run.results.map((result) => result.level)).toEqual(["error", "error", "warning", "note", "error", "error"]);
    expect(run.results[0].message.text).toBe(
      "ui must not import db — src/ui/page.tsx imports src/db/client.ts Reason: The UI talks to the API only.",
    );
    expect(run.results[2].message.text).toBe("api → billing is not declared — 2 imports from api to billing");
    expect(run.results[0].partialFingerprints).toEqual({ rassamFindingId: "f-1" });
    expect(run.results[0].baselineState).toBe("new");
    expect(run.results[4].baselineState).toBe("unchanged");
    expect(run.results[0].properties).toEqual({ score: 90, isNew: true, components: ["ui", "db"], blueprintRule: "no-ui-to-db" });
  });

  it("writes regions and URI-encoded artifact locations", () => {
    expect(run.results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: "src/ui/page.tsx", uriBaseId: "%SRCROOT%" },
      region: { startLine: 3, endLine: 4 },
    });
    expect(run.results[1].locations[0].physicalLocation.artifactLocation.uri).toBe("src/my%20dir/a%23b.ts");
    expect(run.results[1].locations[0].physicalLocation.region).toEqual({ startLine: 9 });
    expect(run.results[3].locations[0].physicalLocation.region).toBeUndefined();
    expect(run.results[2].locations).toHaveLength(5);
  });

  it("points findings without locations at the blueprint", () => {
    expect(run.results[5].locations).toEqual([
      { physicalLocation: { artifactLocation: { uri: ".rassam/blueprint.json", uriBaseId: "%SRCROOT%" } } },
    ]);
  });

  it("is JSON-serializable and handles empty reports", () => {
    expect(() => JSON.stringify(sarif)).not.toThrow();
    const empty = renderSarif(report([])) as unknown as Sarif;
    expect(empty.runs[0].results).toEqual([]);
    expect(empty.runs[0].tool.driver.rules).toEqual([]);
  });
});

describe("renderGithubAnnotations", () => {
  it("emits one workflow command per new finding", () => {
    const lines = renderGithubAnnotations(diffReport()).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      "::error file=src/ui/page.tsx,line=3,endLine=4,title=ui must not import db::src/ui/page.tsx imports src/db/client.ts%0AReason: The UI talks to the API only.",
    );
    expect(lines[1]).toBe("::warning file=src/api/a.ts,line=1,title=api → billing is not declared::2 imports from api to billing");
    expect(lines[2]).toBe("::notice file=scripts/tool.ts,title=Unmapped file::scripts/tool.ts belongs to no component");
  });

  it("includes pre-existing findings when onlyNew is false", () => {
    expect(renderGithubAnnotations(diffReport(), { onlyNew: false }).split("\n")).toHaveLength(4);
  });

  it("escapes data and properties", () => {
    const r = report([
      finding({
        title: "100%: a, b\nc",
        message: "50% done\r\nnext::line",
        reason: undefined,
        locations: [{ path: "src/a,b:c%.ts", line: 2 }],
      }),
    ]);
    expect(renderGithubAnnotations(r)).toBe("::error file=src/a%2Cb%3Ac%25.ts,line=2,title=100%25%3A a%2C b%0Ac::50%25 done%0D%0Anext::line");
  });

  it("omits the file property without locations", () => {
    const r = report([finding({ locations: [], reason: undefined, title: "T", message: "M" })]);
    expect(renderGithubAnnotations(r)).toBe("::error title=T::M");
  });

  it("caps output at max, highest score first", () => {
    const many = Array.from({ length: 60 }, (_, i) => finding({ id: `a-${i}`, title: `t${i}`, score: i }));
    const lines = renderGithubAnnotations(report(many)).split("\n");
    expect(lines).toHaveLength(50);
    expect(lines[0]).toContain("title=t59::");
    expect(renderGithubAnnotations(report(many), { max: 2 }).split("\n")).toHaveLength(2);
    expect(renderGithubAnnotations(report([]))).toBe("");
  });
});

describe("renderJson", () => {
  it("is pretty, stable and round-trips", () => {
    const r = diffReport();
    const json = renderJson(r);
    expect(json.endsWith("}\n")).toBe(true);
    expect(json).toContain('\n  "mode": "diff"');
    expect(JSON.parse(json)).toEqual(r);
    expect(renderJson(r)).toBe(json);
  });
});

describe("graph exports", () => {
  const view: GraphView = {
    components: [
      { id: "ui", name: 'Web "UI"', findings: 2 },
      { id: "api.v1", name: "API" },
      { id: "api-v1", name: "API legacy" },
      { id: "db", name: "Postgres", kind: "database", external: true },
    ],
    edges: [
      { from: "ui", to: "api.v1", status: "declared" },
      { from: "api.v1", to: "api-v1", status: "undeclared", count: 3 },
      { from: "ui", to: "db", status: "forbidden" },
      { from: "api.v1", to: "db", status: "missing" },
      { from: "ui", to: "ghost:svc", status: "declared" },
    ],
  };

  it("renders a mermaid flowchart with sanitized ids and escaped labels", () => {
    const lines = renderMermaid(view).trimEnd().split("\n");
    expect(lines[0]).toBe("flowchart LR");
    expect(lines).toContain('  c_ui["Web #quot;UI#quot;"]');
    expect(lines).toContain('  c_api_v1["API"]');
    expect(lines).toContain('  c_api_v1_2["API legacy"]');
    expect(lines).toContain('  c_db[("Postgres")]');
    expect(lines).toContain('  c_ghost_svc["ghost:svc"]');
  });

  it("styles mermaid edges by status", () => {
    const lines = renderMermaid(view).trimEnd().split("\n");
    expect(lines).toContain("  c_ui --> c_api_v1");
    expect(lines).toContain('  c_api_v1 -.->|"undeclared ×3"| c_api_v1_2');
    expect(lines).toContain('  c_ui ==>|"forbidden"| c_db');
    expect(lines).toContain('  c_api_v1 -.->|"declared, unused"| c_db');
    expect(lines).toContain("  linkStyle 0 stroke:#9ca3af,stroke-width:1.5px");
    expect(lines).toContain("  linkStyle 1 stroke:#d97706,stroke-width:2px,stroke-dasharray:6 4");
    expect(lines).toContain("  linkStyle 2 stroke:#dc2626,stroke-width:4px");
    expect(lines).toContain("  linkStyle 3 stroke:#9ca3af,stroke-width:1.5px,stroke-dasharray:2 4");
    expect(lines).toContain("  classDef hasFindings stroke:#dc2626,stroke-width:3px");
    expect(lines).toContain("  class c_ui hasFindings");
  });

  it("renders an equivalent graphviz digraph", () => {
    const dot = renderDot(view);
    expect(dot.startsWith("digraph blueprint {\n")).toBe(true);
    expect(dot.trimEnd().endsWith("}")).toBe(true);
    expect(dot).toContain('  c_ui [label="Web \\"UI\\"", color="#dc2626", penwidth=2];');
    expect(dot).toContain('  c_db [label="Postgres", shape=cylinder, style=solid];');
    expect(dot).toContain('  c_ui -> c_api_v1 [color="#9ca3af"];');
    expect(dot).toContain('  c_api_v1 -> c_api_v1_2 [color="#d97706", fontcolor="#d97706", style=dashed, label="undeclared ×3"];');
    expect(dot).toContain('  c_ui -> c_db [color="#dc2626", fontcolor="#dc2626", penwidth=3, label="forbidden"];');
    expect(dot).toContain('  c_api_v1 -> c_db [color="#9ca3af", fontcolor="#9ca3af", style=dotted, label="declared, unused"];');
  });

  it("handles an empty view", () => {
    expect(renderMermaid({ components: [], edges: [] })).toBe("flowchart LR\n");
    expect(renderDot({ components: [], edges: [] })).toContain("digraph blueprint {");
  });
});

describe("markdown table escaping", () => {
  it("escapes backslashes before pipes in contract change cells", () => {
    const md = renderMarkdown(report([], {
      mode: "diff",
      contractChanges: [{ kind: "component-changed", target: String.raw`a\|b`, summary: String.raw`path C:\x | y`, weakens: false }],
    }));
    const row = md.split("\n").find((line) => line.includes("component-changed")) ?? "";
    expect(row).toContain(String.raw`| a\\\|b |`);
    expect(row).toContain(String.raw`path C:\\x \| y`);
  });
});
