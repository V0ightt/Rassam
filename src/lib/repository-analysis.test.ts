import assert from "node:assert/strict";
import { test } from "vitest";

import { ApiError } from "./api-error";
import type { RepoNode } from "./github";
import { analyzeRepositoryDeterministically } from "./repository-analysis";

function blob(path: string, character: string, size = 100): RepoNode {
  return {
    path,
    type: "blob",
    sha: character.repeat(40),
    url: `https://api.github.test/blobs/${character}`,
    size,
  };
}

test("deterministic analysis creates only evidence-backed import relationships", () => {
  const files = [
    blob("src/app/page.tsx", "a"),
    blob("src/components/Button.tsx", "b"),
    blob("src/lib/unused.ts", "c"),
    blob("scripts/tool.py", "d"),
    blob("README.md", "e"),
    blob("package-lock.json", "f"),
    blob("public/logo.png", "1"),
    blob("notes.weird", "2"),
  ];
  const result = analyzeRepositoryDeterministically(files, [
    {
      path: "src/app/page.tsx",
      blobSha: "a".repeat(40),
      content: 'import Button from "@/components/Button";\nexport default function Page() { return Button; }',
    },
    {
      path: "src/components/Button.tsx",
      blobSha: "b".repeat(40),
      content: "export function Button() { return null; }",
    },
    {
      path: "src/lib/unused.ts",
      blobSha: "c".repeat(40),
      content: "export const unused = true;",
    },
  ]);

  const knownPaths = new Set(files.map((file) => file.path));
  assert.ok(result.nodes.length >= 4);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].data.evidence[0].path, "src/app/page.tsx");
  assert.equal(result.edges[0].data.evidence[0].startLine, 1);
  assert.ok(result.nodes.every((node) => node.data.files.every((path) => knownPaths.has(path))));
  assert.ok(result.edges.every((edge) => result.nodes.some((node) => node.id === edge.source)));
  assert.ok(result.edges.every((edge) => result.nodes.some((node) => node.id === edge.target)));
  assert.equal(result.coverage.discovered, files.length);
  assert.equal(Object.values(result.coverage.counts).reduce((sum, count) => sum + count, 0), files.length);
  assert.equal(result.coverage.counts.analyzed, 4);
  assert.equal(result.coverage.counts.ignored, 3);
  assert.equal(result.coverage.counts.unsupported, 1);
});

test("structural-only languages produce an honest non-empty map", () => {
  const result = analyzeRepositoryDeterministically([
    blob("cmd/server/main.go", "a"),
    blob("internal/auth/service.go", "b"),
  ], []);

  assert.ok(result.nodes.length > 0);
  assert.equal(result.edges.length, 0);
  assert.equal(result.coverage.counts.analyzed, 2);
  assert.ok(result.nodes.every((node) => node.data.analysisLevel === "structural"));
  assert.match(result.warnings.join(" "), /structural-only/i);
});

test("supported repositories cannot silently succeed with an empty graph", () => {
  assert.throws(
    () => analyzeRepositoryDeterministically([blob("src/index.ts", "a")], []),
    (error: unknown) => error instanceof ApiError && error.code === "ANALYSIS_FAILED",
  );
});

test("source content with a mismatched blob SHA is never attributed to the pinned revision", () => {
  assert.throws(
    () => analyzeRepositoryDeterministically(
      [blob("src/index.ts", "a")],
      [{ path: "src/index.ts", blobSha: "b".repeat(40), content: "export const value = true;" }],
    ),
    (error: unknown) => error instanceof ApiError && error.code === "ANALYSIS_FAILED",
  );
});

test("unresolved imports never become speculative edges", () => {
  const result = analyzeRepositoryDeterministically(
    [blob("src/index.ts", "a")],
    [{
      path: "src/index.ts",
      blobSha: "a".repeat(40),
      content: 'import missing from "./does-not-exist";\nimport React from "react";\nexport { missing };',
    }],
  );

  assert.equal(result.edges.length, 0);
  assert.deepEqual(result.nodes[0].data.dependencies, ["react"]);
});

test("multiline static imports retain the first evidence line", () => {
  const result = analyzeRepositoryDeterministically(
    [blob("src/app/page.tsx", "a"), blob("src/components/Button.tsx", "b")],
    [
      {
        path: "src/app/page.tsx",
        blobSha: "a".repeat(40),
        content: 'import {\n  Button,\n} from "@/components/Button";\nexport default Button;',
      },
      {
        path: "src/components/Button.tsx",
        blobSha: "b".repeat(40),
        content: "export const Button = true;",
      },
    ],
  );

  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].data.evidence[0].startLine, 1);
});

test("tsconfig path aliases resolve only to files present in the pinned tree", () => {
  const result = analyzeRepositoryDeterministically(
    [
      blob("tsconfig.json", "c"),
      blob("src/app/page.tsx", "a"),
      blob("src/ui/Button.tsx", "b"),
    ],
    [
      {
        path: "tsconfig.json",
        blobSha: "c".repeat(40),
        content: '{\n // alias fixture\n "compilerOptions": { "baseUrl": ".", "paths": { "#ui/*": ["src/ui/*",], }, },\n}',
      },
      {
        path: "src/app/page.tsx",
        blobSha: "a".repeat(40),
        content: 'import { Button } from "#ui/Button";\nexport default Button;',
      },
      {
        path: "src/ui/Button.tsx",
        blobSha: "b".repeat(40),
        content: "export const Button = true;",
      },
    ],
  );

  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].data.evidence[0].path, "src/app/page.tsx");
});
