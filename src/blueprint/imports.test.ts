import { describe, expect, it } from "vitest";

import { MAX_ANALYZED_FILE_BYTES } from "./constants";
import {
  buildFileGraph,
  createResolveContext,
  extractImports,
  isIgnoredPath,
  isTestPath,
  languageOf,
  normalizePackageName,
  resolveImport,
} from "./imports";
import type { FileGraph, ImportKind, Language, RawImport, ResolvedImport, SourceFile } from "./types";

type Repo = Record<string, string | null>;

function repo(files: Repo): SourceFile[] {
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

function graphOf(files: Repo, ignore?: string[]): FileGraph {
  return buildFileGraph(repo(files), ignore ? { ignore } : undefined);
}

function edgesOf(graph: FileGraph, from?: string): string[] {
  return graph.edges.filter((edge) => !from || edge.from === from).map((edge) => `${edge.from} -> ${edge.to}`);
}

function externalsOf(graph: FileGraph, from?: string): string[] {
  return graph.externals.filter((ref) => !from || ref.from === from).map((ref) => ref.pkg);
}

function unresolvedOf(graph: FileGraph): string[] {
  return graph.unresolved.map((entry) => `${entry.from}: ${entry.specifier}`);
}

function specs(path: string, content: string): string[] {
  return extractImports(path, content).map((item) => item.specifier);
}

function raw(specifier: string, kind: ImportKind = "static"): RawImport {
  return { specifier, line: 1, kind, typeOnly: false };
}

function resolveIn(files: Repo, from: string, specifier: string, kind: ImportKind = "static"): ResolvedImport {
  return resolveImport(from, raw(specifier, kind), createResolveContext(repo(files)));
}

const lines = (...text: string[]): string => text.join("\n");

describe("languageOf", () => {
  const cases: Array<[string, Language | null]> = [
    ["a.ts", "typescript"],
    ["a.tsx", "typescript"],
    ["a.mts", "typescript"],
    ["a.cts", "typescript"],
    ["types/a.d.ts", "typescript"],
    ["a.js", "javascript"],
    ["a.jsx", "javascript"],
    ["a.mjs", "javascript"],
    ["a.cjs", "javascript"],
    ["pkg/a.py", "python"],
    ["a.go", "go"],
    ["A.java", "java"],
    ["A.kt", "kotlin"],
    ["build.gradle.kts", "kotlin"],
    ["a.rs", "rust"],
    ["a.c", "c"],
    ["a.h", "c"],
    ["a.cc", "cpp"],
    ["a.cpp", "cpp"],
    ["a.cxx", "cpp"],
    ["a.hpp", "cpp"],
    ["a.hh", "cpp"],
    ["a.hxx", "cpp"],
    ["a.rb", "ruby"],
    ["A.cs", "csharp"],
    ["a.php", "php"],
    ["A.swift", "swift"],
    ["A.TS", "typescript"],
    ["README.md", null],
    ["Makefile", null],
    [".gitignore", null],
    ["package.json", null],
  ];
  it.each(cases)("%s → %s", (path, expected) => {
    expect(languageOf(path)).toBe(expected);
  });
});

describe("isTestPath / isIgnoredPath", () => {
  it.each([
    ["src/a.test.ts", true],
    ["src/a.spec.tsx", true],
    ["pkg/a_test.go", true],
    ["tests/test_api.py", true],
    ["src/__tests__/a.ts", true],
    ["src/main/java/FooTest.java", true],
    ["src/a.ts", false],
    ["src/testing.ts", false],
  ])("isTestPath(%s) = %s", (path, expected) => {
    expect(isTestPath(path)).toBe(expected);
  });

  it.each([
    ["node_modules/react/index.js", true],
    ["packages/a/node_modules/x/index.js", true],
    ["dist/main.js", true],
    ["src/types/api.d.ts", true],
    ["public/app.min.js", true],
    ["target/debug/build.rs", true],
    ["src/a.ts", false],
    ["README.md", false],
  ])("isIgnoredPath(%s) = %s", (path, expected) => {
    expect(isIgnoredPath(path)).toBe(expected);
  });

  it("applies extra ignore globs", () => {
    expect(isIgnoredPath("src/generated/api.ts")).toBe(false);
    expect(isIgnoredPath("src/generated/api.ts", ["src/generated/**"])).toBe(true);
    expect(isIgnoredPath("src/a.gen.ts", ["*.gen.ts"])).toBe(true);
  });
});

describe("JS/TS extraction", () => {
  const cases: Array<[string, string, Array<Partial<RawImport>>]> = [
    ["default import", `import x from "m";`, [{ specifier: "m", kind: "static", typeOnly: false, line: 1 }]],
    ["named import", `import { a, b as c } from 'm';`, [{ specifier: "m", kind: "static", typeOnly: false }]],
    ["namespace import", `import * as ns from "m";`, [{ specifier: "m", kind: "static" }]],
    ["default + named", `import x, { y } from "m";`, [{ specifier: "m", kind: "static", typeOnly: false }]],
    ["default + namespace", `import x, * as ns from "m";`, [{ specifier: "m", kind: "static" }]],
    ["no whitespace", `import{a}from"m";`, [{ specifier: "m", kind: "static" }]],
    ["import type", `import type { T } from "m";`, [{ specifier: "m", kind: "static", typeOnly: true }]],
    ["import type default", `import type T from "m";`, [{ specifier: "m", typeOnly: true }]],
    ["import type namespace", `import type * as T from "m";`, [{ specifier: "m", typeOnly: true }]],
    ["default binding named type", `import type from "m";`, [{ specifier: "m", typeOnly: false }]],
    ["default named type + named", `import type, { a } from "m";`, [{ specifier: "m", typeOnly: false }]],
    ["all inline types", `import { type A, type B } from "m";`, [{ specifier: "m", typeOnly: true }]],
    ["mixed inline types", `import { type A, b } from "m";`, [{ specifier: "m", typeOnly: false }]],
    ["inline types with default", `import x, { type A } from "m";`, [{ specifier: "m", typeOnly: false }]],
    ["binding named type", `import { type } from "m";`, [{ specifier: "m", typeOnly: false }]],
    ["binding type renamed", `import { type as t } from "m";`, [{ specifier: "m", typeOnly: false }]],
    ["side effect", `import "m";`, [{ specifier: "m", kind: "side-effect", typeOnly: false }]],
    ["side effect css", `import './styles.css'`, [{ specifier: "./styles.css", kind: "side-effect" }]],
    ["export star", `export * from "m";`, [{ specifier: "m", kind: "reexport", typeOnly: false }]],
    ["export star as", `export * as ns from "m";`, [{ specifier: "m", kind: "reexport" }]],
    ["export named", `export { a, b as c } from "m";`, [{ specifier: "m", kind: "reexport", typeOnly: false }]],
    ["export type", `export type { T } from "m";`, [{ specifier: "m", kind: "reexport", typeOnly: true }]],
    ["export type star", `export type * from "m";`, [{ specifier: "m", kind: "reexport", typeOnly: true }]],
    ["export inline type", `export { type A } from "m";`, [{ specifier: "m", kind: "reexport", typeOnly: true }]],
    ["require", `const x = require("m");`, [{ specifier: "m", kind: "require" }]],
    ["require in call", `foo(require('m'), 1);`, [{ specifier: "m", kind: "require" }]],
    ["spread require", `const all = [...require("m")];`, [{ specifier: "m", kind: "require" }]],
    ["dynamic import", `const x = await import("m");`, [{ specifier: "m", kind: "dynamic" }]],
    ["dynamic import template", "const x = import(`m`);", [{ specifier: "m", kind: "dynamic" }]],
    ["dynamic import with options", `import("./data.json", { with: { type: "json" } });`, [{ specifier: "./data.json", kind: "dynamic" }]],
    ["import equals require", `import fs = require("fs");`, [{ specifier: "fs", kind: "require" }]],
    ["two on one line", `import a from "a"; import b from "b";`, [{ specifier: "a" }, { specifier: "b" }]],
  ];

  it.each(cases)("%s", (_name, source, expected) => {
    const found = extractImports("src/file.ts", source);
    expect(found).toHaveLength(expected.length);
    expected.forEach((partial, index) => expect(found[index]).toMatchObject(partial));
  });

  const ignored: Array<[string, string]> = [
    ["line comment", `// import x from "m";`],
    ["block comment", `/* import x from "m"; */`],
    ["multi-line block comment", lines("/**", ' * import x from "m";', ' * require("m")', " */")],
    ["double-quoted string", `const s = "import x from 'm'";`],
    ["single-quoted string", `const s = 'require("m")';`],
    ["template literal", lines("const s = `", 'import x from "m";', 'require("m")', "`;")],
    ["dynamic import of expression", `import(name);`],
    ["dynamic import with substitution", "import(`./locales/${lang}.json`);"],
    ["dynamic import of concatenation", `import("./a" + b);`],
    ["require of expression", `require(name);`],
    ["member named import", `loader.import("m"); obj?.require("m");`],
    ["import.meta", `const u = import.meta.url; const from = "m";`],
    ["identifier containing require", `my_require("m"); $require("m"); requireAll("m");`],
    ["export without from", lines(`export { a, b };`, `const from = "m";`)],
    ["regex literal", `const re = /require("m")/;`],
    ["import text mid-line", `log("x"); const label = <p>import x from "m"</p>;`],
  ];

  it.each(ignored)("ignores %s", (_name, source) => {
    expect(extractImports("src/file.tsx", source)).toEqual([]);
  });

  it("keeps exact line numbers across comments, strings and multi-line lists", () => {
    const source = lines(
      "/*", //                                   1
      ' * import bogus from "bogus";', //         2
      " */", //                                  3
      'import a from "a"; // import c from "c"', // 4
      "import {", //                             5
      "  b1, // first", //                       6
      "  b2,", //                                7
      '} from "b";', //                          8
      "const text = `", //                       9
      'import t from "template";', //            10
      "`;", //                                   11
      'const url = "http://example.com"; const d = require("d");', // 12
      "", //                                     13
      "export {", //                             14
      "  e,", //                                 15
      '} from "e";', //                          16
      "async function load() {", //              17
      '  return import("f");', //                18
      "}", //                                    19
    );
    expect(extractImports("src/a.ts", source).map((item) => [item.specifier, item.line, item.kind])).toEqual([
      ["a", 4, "static"],
      ["b", 5, "static"],
      ["d", 12, "require"],
      ["e", 14, "reexport"],
      ["f", 18, "dynamic"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const source = ['import a from "a";', "// note", 'import b from "b";'].join("\r\n");
    expect(extractImports("a.ts", source).map((item) => [item.specifier, item.line])).toEqual([
      ["a", 1],
      ["b", 3],
    ]);
  });

  it("does not treat // inside strings, templates or regexes as comments", () => {
    const source = lines(
      'const a = "http://x"; import("one");',
      "const b = `http://y`; import('two');",
      "const c = /\\/\\//.test(s); import(\"three\");",
      "const d = x / 2; // import('never')",
      "const e = 'it\\'s // fine'; require(\"four\");",
    );
    expect(specs("a.js", source)).toEqual(["one", "two", "three", "four"]);
  });

  it("scans code inside template substitutions but not the template text", () => {
    const source = "const s = `a ${require(\"inner\")} import x from \"no\" ${`nested ${require('deep')}`} // not a comment`;\nimport(\"after\");";
    expect(specs("a.js", source)).toEqual(["inner", "deep", "after"]);
  });

  it("treats division as division", () => {
    const source = lines("const r = a / b; const s = c / d;", 'const m = require("m");', "const t = (a + b) / 2 / 3;", 'import("n");');
    expect(specs("a.js", source)).toEqual(["m", "n"]);
  });

  it("survives JSX with apostrophes, slashes and closing tags", () => {
    const source = lines(
      'import React from "react";',
      "export function A() {",
      "  return <div><p>Don't</p><a href=\"/x\">a / b</a></div>;",
      "}",
      'import B from "./B";',
    );
    expect(specs("a.tsx", source)).toEqual(["react", "./B"]);
  });

  it("skips a hashbang line", () => {
    expect(specs("cli.mjs", lines("#!/usr/bin/env node", 'import a from "a";'))).toEqual(["a"]);
  });

  it("returns nothing for structural-only languages and unknown files", () => {
    expect(extractImports("A.cs", "using System;")).toEqual([]);
    expect(extractImports("a.php", "<?php use Foo\\Bar;")).toEqual([]);
    expect(extractImports("A.swift", "import Foundation")).toEqual([]);
    expect(extractImports("README.md", 'import x from "m"')).toEqual([]);
  });
});

describe("JS/TS resolution", () => {
  it("resolves relative specifiers with extensions and index files", () => {
    const files: Repo = {
      "src/a.ts": "",
      "src/b.tsx": "",
      "src/c.js": "",
      "src/dir/index.ts": "",
      "src/data.json": "",
      "src/styles.css": null,
      "src/both.ts": "",
      "src/both/index.ts": "",
      "index.ts": "",
    };
    const cases: Array<[string, string, string | null]> = [
      ["src/a.ts", "./b", "src/b.tsx"],
      ["src/a.ts", "./c", "src/c.js"],
      ["src/a.ts", "./dir", "src/dir/index.ts"],
      ["src/a.ts", "./dir/", "src/dir/index.ts"],
      ["src/a.ts", "./dir/index", "src/dir/index.ts"],
      ["src/a.ts", "./data.json", "src/data.json"],
      ["src/a.ts", "./data", "src/data.json"],
      ["src/a.ts", "./styles.css", "src/styles.css"],
      ["src/a.ts", "./styles.css?inline", "src/styles.css"],
      ["src/a.ts", "./both", "src/both.ts"],
      ["src/dir/index.ts", "..", null],
      ["src/dir/index.ts", "../a", "src/a.ts"],
      ["src/dir/index.ts", "../../index", "index.ts"],
      ["src/a.ts", "..", "index.ts"],
      ["src/a.ts", "./missing", null],
      ["src/a.ts", "../../outside", null],
    ];
    for (const [from, specifier, target] of cases) {
      expect(resolveIn(files, from, specifier), `${from} ${specifier}`).toEqual(
        target ? { kind: "internal", target } : { kind: "unresolved" },
      );
    }
  });

  it("maps ESM-style .js specifiers to TypeScript sources", () => {
    const files: Repo = { "src/a.ts": "", "src/foo.ts": "", "src/bar.tsx": "", "src/m.mts": "", "src/c.cts": "", "src/real.js": "", "src/real.ts": "" };
    expect(resolveIn(files, "src/a.ts", "./foo.js")).toEqual({ kind: "internal", target: "src/foo.ts" });
    expect(resolveIn(files, "src/a.ts", "./bar.js")).toEqual({ kind: "internal", target: "src/bar.tsx" });
    expect(resolveIn(files, "src/a.ts", "./bar.jsx")).toEqual({ kind: "internal", target: "src/bar.tsx" });
    expect(resolveIn(files, "src/a.ts", "./m.mjs")).toEqual({ kind: "internal", target: "src/m.mts" });
    expect(resolveIn(files, "src/a.ts", "./c.cjs")).toEqual({ kind: "internal", target: "src/c.cts" });
    expect(resolveIn(files, "src/a.ts", "./real.js")).toEqual({ kind: "internal", target: "src/real.js" });
    expect(resolveIn(files, "src/a.ts", "./gone.js")).toEqual({ kind: "unresolved" });
  });

  it("applies tsconfig paths with comments, trailing commas and baseUrl", () => {
    const files: Repo = {
      "tsconfig.json": lines(
        "{",
        "  // aliases",
        '  "compilerOptions": {',
        '    "baseUrl": ".", /* root */',
        '    "paths": {',
        '      "@app/*": ["src/app/*"],',
        '      "@app/special/*": ["src/special/*"],',
        '      "config": ["src/config/index.ts"],',
        '      "@multi/*": ["missing/*", "src/fallback/*"],',
        '      "url//x": ["src/app/home.ts"],',
        "    },",
        "  },",
        "}",
      ),
      "src/main.ts": "",
      "src/app/home.ts": "",
      "src/app/special/x.ts": "",
      "src/special/x.ts": "",
      "src/config/index.ts": "",
      "src/fallback/thing.ts": "",
      "lib/util.ts": "",
    };
    const cases: Array<[string, ResolvedImport]> = [
      ["@app/home", { kind: "internal", target: "src/app/home.ts" }],
      ["@app/special/x", { kind: "internal", target: "src/special/x.ts" }],
      ["config", { kind: "internal", target: "src/config/index.ts" }],
      ["@multi/thing", { kind: "internal", target: "src/fallback/thing.ts" }],
      ["url//x", { kind: "internal", target: "src/app/home.ts" }],
      ["lib/util", { kind: "internal", target: "lib/util.ts" }],
      ["@app/nope", { kind: "unresolved" }],
      ["config/extra", { kind: "external", pkg: "config" }],
      ["react", { kind: "external", pkg: "react" }],
    ];
    for (const [specifier, expected] of cases) {
      expect(resolveIn(files, "src/main.ts", specifier), specifier).toEqual(expected);
    }
  });

  it("follows relative extends chains and resolves paths against the defining config", () => {
    const files: Repo = {
      "config/tsconfig.base.json": '{ "compilerOptions": { "paths": { "@shared/*": ["../shared/*"] } } }',
      "config/tsconfig.mid.json": '{ "extends": "./tsconfig.base" }',
      "apps/web/tsconfig.json": '{ "extends": "../../config/tsconfig.mid.json", "compilerOptions": { "strict": true } }',
      "apps/web/src/page.ts": "",
      "shared/util.ts": "",
    };
    expect(resolveIn(files, "apps/web/src/page.ts", "@shared/util")).toEqual({ kind: "internal", target: "shared/util.ts" });
  });

  it("lets a child config override inherited paths and inherit baseUrl", () => {
    const files: Repo = {
      "tsconfig.base.json": '{ "compilerOptions": { "baseUrl": "./src", "paths": { "@x/*": ["old/*"] } } }',
      "tsconfig.json": '{ "extends": "./tsconfig.base.json", "compilerOptions": { "paths": { "@x/*": ["new/*"] } } }',
      "src/old/a.ts": "",
      "src/new/a.ts": "",
      "src/main.ts": "",
    };
    expect(resolveIn(files, "src/main.ts", "@x/a")).toEqual({ kind: "internal", target: "src/new/a.ts" });
    expect(resolveIn(files, "src/main.ts", "old/a")).toEqual({ kind: "internal", target: "src/old/a.ts" });
  });

  it("stops following extends after five levels and ignores package extends", () => {
    const files: Repo = { "src/a.ts": "", "src/target.ts": "", "tsconfig.json": '{ "extends": "./t1.json" }' };
    for (let level = 1; level <= 6; level += 1) {
      files[`t${level}.json`] = level === 6 ? '{ "compilerOptions": { "paths": { "@deep": ["src/target.ts"] } } }' : `{ "extends": "./t${level + 1}.json" }`;
    }
    expect(resolveIn(files, "src/a.ts", "@deep")).toEqual({ kind: "external", pkg: "@deep" });
    files["t5.json"] = '{ "compilerOptions": { "paths": { "@deep": ["src/target.ts"] } } }';
    expect(resolveIn(files, "src/a.ts", "@deep")).toEqual({ kind: "internal", target: "src/target.ts" });
    expect(resolveIn({ "tsconfig.json": '{ "extends": "@tsconfig/node20/tsconfig.json" }', "src/a.ts": "" }, "src/a.ts", "x")).toEqual({
      kind: "external",
      pkg: "x",
    });
  });

  it("survives extends cycles and malformed configs", () => {
    const cyclic: Repo = { "tsconfig.json": '{ "extends": "./other.json" }', "other.json": '{ "extends": "./tsconfig.json" }', "a.ts": "" };
    expect(resolveIn(cyclic, "a.ts", "left-pad")).toEqual({ kind: "external", pkg: "left-pad" });
    const broken: Repo = { "tsconfig.json": "{ not json", "a.ts": "", "src/x.ts": "" };
    expect(resolveIn(broken, "a.ts", "@/x")).toEqual({ kind: "internal", target: "src/x.ts" });
  });

  it("uses the nearest tsconfig or jsconfig walking up from the importing file", () => {
    const files: Repo = {
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@lib/*": ["root-lib/*"] } } }',
      "packages/a/tsconfig.json": '{ "compilerOptions": { "paths": { "@lib/*": ["./lib/*"] } } }',
      "packages/b/jsconfig.json": '{ "compilerOptions": { "baseUrl": "src" } }',
      "root-lib/x.ts": "",
      "packages/a/lib/x.ts": "",
      "packages/a/src/deep/file.ts": "",
      "packages/b/src/file.js": "",
      "packages/b/src/widgets/w.js": "",
      "tools/script.ts": "",
    };
    expect(resolveIn(files, "packages/a/src/deep/file.ts", "@lib/x")).toEqual({ kind: "internal", target: "packages/a/lib/x.ts" });
    expect(resolveIn(files, "tools/script.ts", "@lib/x")).toEqual({ kind: "internal", target: "root-lib/x.ts" });
    expect(resolveIn(files, "packages/b/src/file.js", "widgets/w")).toEqual({ kind: "internal", target: "packages/b/src/widgets/w.js" });
    expect(resolveIn(files, "packages/b/src/file.js", "@lib/x")).toEqual({ kind: "external", pkg: "@lib/x" });
  });

  it("reads aliases from a referenced project in solution-style configs", () => {
    const files: Repo = {
      "tsconfig.json": '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.app.json" }] }',
      "tsconfig.node.json": '{ "compilerOptions": { "composite": true } }',
      "tsconfig.app.json": '{ "compilerOptions": { "paths": { "$lib/*": ["./app/lib/*"] } } }',
      "app/lib/x.ts": "",
      "app/main.ts": "",
    };
    expect(resolveIn(files, "app/main.ts", "$lib/x")).toEqual({ kind: "internal", target: "app/lib/x.ts" });
  });

  it("does not treat catch-all or node_modules aliases as ownership claims", () => {
    const files: Repo = {
      "tsconfig.json": '{ "compilerOptions": { "paths": { "*": ["types/*"], "jquery": ["node_modules/jquery/dist/jquery"] } } }',
      "types/local.ts": "",
      "a.ts": "",
    };
    expect(resolveIn(files, "a.ts", "local")).toEqual({ kind: "internal", target: "types/local.ts" });
    expect(resolveIn(files, "a.ts", "lodash")).toEqual({ kind: "external", pkg: "lodash" });
    expect(resolveIn(files, "a.ts", "jquery")).toEqual({ kind: "external", pkg: "jquery" });
  });

  it("falls back to @/ and ~/ conventions only when the target exists", () => {
    const files: Repo = {
      "src/lib/ai.ts": "",
      "src/app/page.tsx": "",
      "utils/helper.ts": "",
      "apps/web/src/local.ts": "",
      "apps/web/src/page.ts": "",
    };
    expect(resolveIn(files, "src/app/page.tsx", "@/lib/ai")).toEqual({ kind: "internal", target: "src/lib/ai.ts" });
    expect(resolveIn(files, "src/app/page.tsx", "~/lib/ai")).toEqual({ kind: "internal", target: "src/lib/ai.ts" });
    expect(resolveIn(files, "src/app/page.tsx", "~/utils/helper")).toEqual({ kind: "internal", target: "utils/helper.ts" });
    expect(resolveIn(files, "apps/web/src/page.ts", "@/local")).toEqual({ kind: "internal", target: "apps/web/src/local.ts" });
    expect(resolveIn(files, "apps/web/src/page.ts", "@/lib/ai")).toEqual({ kind: "internal", target: "src/lib/ai.ts" });
    expect(resolveIn(files, "src/app/page.tsx", "@/missing")).toEqual({ kind: "unresolved" });
    expect(resolveIn(files, "src/app/page.tsx", "#internal/x")).toEqual({ kind: "unresolved" });
  });

  it("prefers a tsconfig alias over the @/ convention", () => {
    const files: Repo = {
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@/*": ["./app/*"] } } }',
      "app/x.ts": "",
      "src/x.ts": "",
      "a.ts": "",
    };
    expect(resolveIn(files, "a.ts", "@/x")).toEqual({ kind: "internal", target: "app/x.ts" });
  });

  it("resolves workspace packages through exports, entry fields and subpaths", () => {
    const files: Repo = {
      "package.json": '{ "name": "monorepo", "private": true }',
      "packages/core/package.json": JSON.stringify({ name: "@acme/core", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./testing": "./src/testing/index.ts", "./features/*": "./src/features/*.ts" } }),
      "packages/core/src/index.ts": "",
      "packages/core/src/testing/index.ts": "",
      "packages/core/src/features/login.ts": "",
      "packages/core/src/internal/secret.ts": "",
      "packages/ui/package.json": '{ "name": "@acme/ui", "main": "./lib/main.js", "source": "./src/main.tsx" }',
      "packages/ui/src/main.tsx": "",
      "packages/ui/src/button.tsx": "",
      "packages/ui/theme.ts": "",
      "packages/str/package.json": '{ "name": "@acme/str", "exports": "./entry.mjs" }',
      "packages/str/entry.mjs": "",
      "packages/bare/package.json": '{ "name": "bare-pkg" }',
      "packages/bare/index.js": "",
      "packages/cond/package.json": '{ "name": "cond", "exports": { "import": "./esm.mjs", "require": "./cjs.cjs" } }',
      "packages/cond/esm.mjs": "",
      "packages/cond/cjs.cjs": "",
      "packages/mainonly/package.json": '{ "name": "mainonly", "main": "dist/index.js" }',
      "packages/mainonly/src/index.ts": "",
      "packages/empty/package.json": '{ "name": "@acme/empty" }',
      "apps/web/app.ts": "",
    };
    const cases: Array<[string, ResolvedImport]> = [
      ["@acme/core", { kind: "internal", target: "packages/core/src/index.ts" }],
      ["@acme/core/testing", { kind: "internal", target: "packages/core/src/testing/index.ts" }],
      ["@acme/core/features/login", { kind: "internal", target: "packages/core/src/features/login.ts" }],
      ["@acme/core/internal/secret", { kind: "internal", target: "packages/core/src/internal/secret.ts" }],
      ["@acme/core/src/internal/secret", { kind: "internal", target: "packages/core/src/internal/secret.ts" }],
      ["@acme/ui", { kind: "internal", target: "packages/ui/src/main.tsx" }],
      ["@acme/ui/button", { kind: "internal", target: "packages/ui/src/button.tsx" }],
      ["@acme/ui/theme", { kind: "internal", target: "packages/ui/theme.ts" }],
      ["@acme/str", { kind: "internal", target: "packages/str/entry.mjs" }],
      ["bare-pkg", { kind: "internal", target: "packages/bare/index.js" }],
      ["cond", { kind: "internal", target: "packages/cond/esm.mjs" }],
      ["mainonly", { kind: "internal", target: "packages/mainonly/src/index.ts" }],
      ["@acme/empty", { kind: "unresolved" }],
      ["@acme/core/nope", { kind: "unresolved" }],
      ["@acme/other", { kind: "external", pkg: "@acme/other" }],
    ];
    for (const [specifier, expected] of cases) {
      expect(resolveIn(files, "apps/web/app.ts", specifier), specifier).toEqual(expected);
    }
  });

  it("classifies node builtins and external packages", () => {
    const cases: Array<[string, string]> = [
      ["fs", "node:fs"],
      ["fs/promises", "node:fs"],
      ["node:fs", "node:fs"],
      ["node:fs/promises", "node:fs"],
      ["node:test", "node:test"],
      ["node:sea", "node:sea"],
      ["path", "node:path"],
      ["child_process", "node:child_process"],
      ["stream/web", "node:stream"],
      ["react", "react"],
      ["react-dom/client", "react-dom"],
      ["lodash/fp/get", "lodash"],
      ["@scope/pkg", "@scope/pkg"],
      ["@scope/pkg/sub/path", "@scope/pkg"],
      ["fs-extra", "fs-extra"],
      ["pathe", "pathe"],
      ["npm:chalk@5/index.js", "chalk"],
      ["npm:@scope/pkg@1.2.3/sub", "@scope/pkg"],
      ["https://deno.land/std/path/mod.ts", "https://deno.land/std/path/mod.ts"],
      ["bun:test", "bun:test"],
      ["some-loader?raw", "some-loader"],
    ];
    for (const [specifier, pkg] of cases) {
      expect(normalizePackageName(specifier, "typescript"), specifier).toBe(pkg);
      expect(resolveIn({ "a.ts": "" }, "a.ts", specifier), specifier).toEqual({ kind: "external", pkg });
    }
  });
});

describe("Python", () => {
  it("extracts import statements", () => {
    const source = lines(
      "import a.b.c", //                 1
      "import a as b, c.d", //           2
      "from a.b import c, d as e", //    3
      "from a import (", //              4
      "    x,  # first", //              5
      "    y as z,", //                  6
      ")", //                            7
      "from . import x", //              8
      "from ..pkg.mod import y", //      9
      "from pkg import *", //            10
      "def f():", //                     11
      "    import lazy.mod", //          12
      "    from .sibling import thing", // 13
    );
    expect(extractImports("pkg/m.py", source).map((item) => [item.specifier, item.line])).toEqual([
      ["a.b.c", 1],
      ["a", 2],
      ["c.d", 2],
      ["a.b:c", 3],
      ["a.b:d", 3],
      ["a:x", 4],
      ["a:y", 4],
      [".:x", 8],
      ["..pkg.mod:y", 9],
      ["pkg", 10],
      ["lazy.mod", 12],
      [".sibling:thing", 13],
    ]);
  });

  it("ignores comments, strings and docstrings", () => {
    const source = lines(
      '"""Module docstring.', //         1
      "import fake_one", //              2
      "from fake import two", //         3
      '"""', //                          4
      "# import commented", //           5
      "x = 'import in_string'", //       6
      "y = '''", //                      7
      "import triple_single", //         8
      "'''", //                          9
      'z = "# not a comment"; w = 1', // 10
      "import real  # import trailing", // 11
      "def f():", //                     12
      '    r"""', //                     13
      "    from docs import example", // 14
      '    """', //                      15
      "    important = 1", //            16
      "    from_x = 2", //               17
    );
    expect(extractImports("m.py", source).map((item) => [item.specifier, item.line])).toEqual([["real", 11]]);
  });

  const layout: Repo = {
    "pyproject.toml": "[project]\nname = 'app'",
    "src/app/__init__.py": "",
    "src/app/main.py": "",
    "src/app/config.py": "",
    "src/app/core/__init__.py": "",
    "src/app/core/engine.py": "",
    "src/app/core/util.py": "",
    "src/app/core/sub/__init__.py": "",
    "src/app/core/sub/leaf.py": "",
    "toplevel.py": "",
    "services/api/setup.py": "",
    "services/api/apipkg/__init__.py": "",
    "services/api/apipkg/routes.py": "",
    "services/worker/pyproject.toml": "",
    "services/worker/src/workerpkg/__init__.py": "",
    "services/worker/src/workerpkg/jobs.py": "",
    "backend/server/main.py": "",
    "backend/server/handlers/users.py": "",
    "backend/common/db.py": "",
    "backend/common/logging.py": "",
    "scripts/run.py": "",
    "scripts/helpers.py": "",
    "docker/Dockerfile": null,
    "namespace_pkg/inner/mod.py": "",
  };

  const cases: Array<[string, string, string, ResolvedImport]> = [
    ["src layout module", "toplevel.py", "app.config", { kind: "internal", target: "src/app/config.py" }],
    ["package __init__", "toplevel.py", "app.core", { kind: "internal", target: "src/app/core/__init__.py" }],
    ["from pkg import submodule", "toplevel.py", "app.core:engine", { kind: "internal", target: "src/app/core/engine.py" }],
    ["from pkg import subpackage", "toplevel.py", "app.core:sub", { kind: "internal", target: "src/app/core/sub/__init__.py" }],
    ["from pkg import name", "toplevel.py", "app.core:SomeClass", { kind: "internal", target: "src/app/core/__init__.py" }],
    ["from module import name", "toplevel.py", "app.config:Settings", { kind: "internal", target: "src/app/config.py" }],
    ["root-level module", "src/app/main.py", "toplevel", { kind: "internal", target: "toplevel.py" }],
    ["from . import sibling", "src/app/core/engine.py", ".:util", { kind: "internal", target: "src/app/core/util.py" }],
    ["from . import name", "src/app/core/engine.py", ".:VERSION", { kind: "internal", target: "src/app/core/__init__.py" }],
    ["from .mod import name", "src/app/core/engine.py", ".util:helper", { kind: "internal", target: "src/app/core/util.py" }],
    ["from .. import module", "src/app/core/engine.py", "..:config", { kind: "internal", target: "src/app/config.py" }],
    ["from ..mod import name", "src/app/core/sub/leaf.py", "..util:helper", { kind: "internal", target: "src/app/core/util.py" }],
    ["from ...mod import name", "src/app/core/sub/leaf.py", "...config:Settings", { kind: "internal", target: "src/app/config.py" }],
    ["from .pkg import submodule", "src/app/main.py", ".core:engine", { kind: "internal", target: "src/app/core/engine.py" }],
    ["relative miss", "src/app/core/engine.py", ".missing:x", { kind: "unresolved" }],
    ["relative above root", "toplevel.py", "...x:y", { kind: "unresolved" }],
    ["setup.py root", "toplevel.py", "apipkg.routes", { kind: "internal", target: "services/api/apipkg/routes.py" }],
    ["pyproject src root", "toplevel.py", "workerpkg:jobs", { kind: "internal", target: "services/worker/src/workerpkg/jobs.py" }],
    ["ancestor as sys.path", "backend/server/handlers/users.py", "common.db", { kind: "internal", target: "backend/common/db.py" }],
    ["ancestor from-import", "backend/server/main.py", "common:db", { kind: "internal", target: "backend/common/db.py" }],
    ["script sibling", "scripts/run.py", "helpers", { kind: "internal", target: "scripts/helpers.py" }],
    ["stdlib not shadowed by ancestor", "backend/common/db.py", "logging", { kind: "external", pkg: "logging" }],
    ["explicit relative beats stdlib", "backend/common/db.py", ".:logging", { kind: "internal", target: "backend/common/logging.py" }],
    ["namespace package submodule", "toplevel.py", "namespace_pkg.inner:mod", { kind: "internal", target: "namespace_pkg/inner/mod.py" }],
    ["known package, missing module", "toplevel.py", "app.nope.deeper", { kind: "unresolved" }],
    ["external", "toplevel.py", "requests", { kind: "external", pkg: "requests" }],
    ["external dotted", "toplevel.py", "google.cloud.storage:Client", { kind: "external", pkg: "google" }],
    ["stdlib", "toplevel.py", "os.path:join", { kind: "external", pkg: "os" }],
    ["non-python directory is not a package", "toplevel.py", "docker", { kind: "external", pkg: "docker" }],
  ];

  it.each(cases)("resolves: %s", (_name, from, specifier, expected) => {
    expect(resolveIn(layout, from, specifier)).toEqual(expected);
  });

  it("builds edges once per imported file and line", () => {
    const graph = graphOf({
      "pkg/__init__.py": "",
      "pkg/a.py": lines("from . import b, c", "from .b import one, two", "import os, sys", "from os import path, sep"),
      "pkg/b.py": "",
      "pkg/c.py": "",
    });
    expect(graph.edges.map((edge) => [edge.to, edge.line])).toEqual([
      ["pkg/b.py", 1],
      ["pkg/c.py", 1],
      ["pkg/b.py", 2],
    ]);
    expect(graph.externals.map((ref) => [ref.pkg, ref.line])).toEqual([
      ["os", 3],
      ["sys", 3],
      ["os", 4],
    ]);
  });
});

describe("Go", () => {
  it("extracts single and grouped imports", () => {
    const source = lines(
      "package main", //                       1
      "", //                                   2
      'import "fmt"', //                       3
      'import alias "x/y"', //                 4
      "import (", //                           5
      '\t"os"', //                             6
      '\t// "commented/out"', //               7
      '\tlog "github.com/sirupsen/logrus"', // 8
      '\t_ "embed"', //                        9
      '\t. "math"', //                         10
      "\t`raw/path`", //                       11
      '\t/* "block" */ "net/http"', //         12
      ")", //                                  13
      "", //                                   14
      'var s = "import \\"nope\\""', //        15
      "func main() { fmt.Println(`", //        16
      'import "also/nope"', //                 17
      "`) }", //                               18
    );
    expect(extractImports("main.go", source).map((item) => [item.specifier, item.line])).toEqual([
      ["fmt", 3],
      ["x/y", 4],
      ["os", 6],
      ["github.com/sirupsen/logrus", 8],
      ["embed", 9],
      ["math", 10],
      ["raw/path", 11],
      ["net/http", 12],
    ]);
  });

  const files: Repo = {
    "go.mod": "module github.com/acme/app\n\ngo 1.22\n",
    "main.go": "",
    "internal/store/a_test.go": "",
    "internal/store/store.go": "",
    "internal/store/zeta.go": "",
    "internal/onlytests/x_test.go": "",
    "internal/empty/README.md": "",
    "tools/gen/go.mod": 'module "github.com/acme/app/tools/gen"\n',
    "tools/gen/gen.go": "",
    "tools/gen/emit/emit.go": "",
  };

  const cases: Array<[string, ResolvedImport]> = [
    ["github.com/acme/app/internal/store", { kind: "internal", target: "internal/store/store.go" }],
    ["github.com/acme/app", { kind: "internal", target: "main.go" }],
    ["github.com/acme/app/internal/onlytests", { kind: "internal", target: "internal/onlytests/x_test.go" }],
    ["github.com/acme/app/tools/gen", { kind: "internal", target: "tools/gen/gen.go" }],
    ["github.com/acme/app/tools/gen/emit", { kind: "internal", target: "tools/gen/emit/emit.go" }],
    ["github.com/acme/app/internal/empty", { kind: "unresolved" }],
    ["github.com/acme/app/missing", { kind: "unresolved" }],
    ["github.com/acme/application/x", { kind: "external", pkg: "github.com/acme/application" }],
    ["github.com/stretchr/testify/assert", { kind: "external", pkg: "github.com/stretchr/testify" }],
    ["golang.org/x/sync/errgroup", { kind: "external", pkg: "golang.org/x/sync" }],
    ["gopkg.in/yaml.v3", { kind: "external", pkg: "gopkg.in/yaml.v3" }],
    ["gopkg.in/natefinch/lumberjack.v2", { kind: "external", pkg: "gopkg.in/natefinch" }],
    ["fmt", { kind: "external", pkg: "go:fmt" }],
    ["net/http", { kind: "external", pkg: "go:net/http" }],
    ["encoding/json", { kind: "external", pkg: "go:encoding/json" }],
  ];

  it.each(cases)("resolves %s", (specifier, expected) => {
    expect(resolveIn(files, "main.go", specifier)).toEqual(expected);
  });
});

describe("Java / Kotlin", () => {
  it("extracts Java imports", () => {
    const source = lines(
      "/* import com.fake.Block; */", //         1
      "package com.acme.app;", //                2
      "", //                                     3
      "import com.acme.core.Engine;", //         4
      "import com.acme.core.*;", //              5
      "import static com.acme.core.Util.max;", // 6
      "import static com.acme.core.Util.*;", //  7
      "// import com.fake.Line;", //             8
      "import   java.util.List ;", //            9
      "class A { String s = \"import com.fake.Str;\"; String t = \"\"\"", // 10
      "import com.fake.TextBlock;", //           11
      '""";', //                                 12
      "}", //                                    13
    );
    expect(extractImports("A.java", source).map((item) => [item.specifier, item.line])).toEqual([
      ["com.acme.core.Engine", 4],
      ["com.acme.core.*", 5],
      ["com.acme.core.Util.max", 6],
      ["com.acme.core.Util.*", 7],
      ["java.util.List", 9],
    ]);
  });

  it("extracts Kotlin imports with aliases and nested comments", () => {
    const source = lines(
      "package com.acme.app", //                   1
      "/* outer /* inner */ import com.fake.A */", // 2
      "import com.acme.core.Engine", //            3
      "import com.acme.core.Engine as E", //       4
      "import com.acme.core.*", //                 5
      "import kotlinx.coroutines.launch", //       6
      "val c = 'x'; val q = '\"'", //              7
      "import com.acme.core.Later", //             8
    );
    expect(extractImports("A.kt", source).map((item) => [item.specifier, item.line])).toEqual([
      ["com.acme.core.Engine", 3],
      ["com.acme.core.Engine", 4],
      ["com.acme.core.*", 5],
      ["kotlinx.coroutines.launch", 6],
      ["com.acme.core.Later", 8],
    ]);
  });

  const files: Repo = {
    "src/main/java/com/acme/core/Engine.java": "package com.acme.core;\npublic class Engine { public static class Builder {} }",
    "src/main/java/com/acme/core/Util.java": "// header\npackage com.acme.core;\npublic final class Util { }\nclass Hidden {}",
    "src/main/java/com/acme/core/Alpha.java": "package com.acme.core;\nclass Alpha {}",
    "src/main/java/com/acme/app/Main.java": "package com.acme.app;\nclass Main {}",
    "src/main/kotlin/com/acme/kt/Helpers.kt": lines(
      "package com.acme.kt",
      "fun topLevel(x: Int): Int = x",
      "fun String.shout(): String = uppercase()",
      "val DEFAULT_NAME = \"x\"",
      "class Service {",
      "    fun method() {}",
      "}",
      "object Registry",
      "typealias Handler = (String) -> Unit",
    ),
    "src/main/kotlin/com/acme/kt/Other.kt": "package com.acme.kt\nclass Other",
    "Script.java": "class Script {}",
  };

  const cases: Array<[string, string, ResolvedImport]> = [
    ["FQN", "com.acme.core.Engine", { kind: "internal", target: "src/main/java/com/acme/core/Engine.java" }],
    ["wildcard → first file in package", "com.acme.core.*", { kind: "internal", target: "src/main/java/com/acme/core/Alpha.java" }],
    ["static member", "com.acme.core.Util.max", { kind: "internal", target: "src/main/java/com/acme/core/Util.java" }],
    ["static wildcard", "com.acme.core.Util.*", { kind: "internal", target: "src/main/java/com/acme/core/Util.java" }],
    ["inner class", "com.acme.core.Engine.Builder", { kind: "internal", target: "src/main/java/com/acme/core/Engine.java" }],
    ["inner class member", "com.acme.core.Engine.Builder.create", { kind: "internal", target: "src/main/java/com/acme/core/Engine.java" }],
    ["secondary class in file", "com.acme.core.Hidden", { kind: "internal", target: "src/main/java/com/acme/core/Util.java" }],
    ["kotlin class by stem", "com.acme.kt.Other", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Other.kt" }],
    ["kotlin class by declaration", "com.acme.kt.Service", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Helpers.kt" }],
    ["kotlin top-level function", "com.acme.kt.topLevel", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Helpers.kt" }],
    ["kotlin extension function", "com.acme.kt.shout", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Helpers.kt" }],
    ["kotlin top-level property", "com.acme.kt.DEFAULT_NAME", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Helpers.kt" }],
    ["kotlin object", "com.acme.kt.Registry", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Helpers.kt" }],
    ["kotlin typealias", "com.acme.kt.Handler", { kind: "internal", target: "src/main/kotlin/com/acme/kt/Helpers.kt" }],
    ["member functions are not top-level", "com.acme.kt.method", { kind: "unresolved" }],
    ["known package, unknown class", "com.acme.core.Generated", { kind: "unresolved" }],
    ["unknown subpackage of known prefix", "com.acme.other.Thing", { kind: "external", pkg: "com.acme" }],
    ["external", "org.springframework.boot.SpringApplication", { kind: "external", pkg: "org.springframework" }],
    ["external wildcard", "com.google.common.collect.*", { kind: "external", pkg: "com.google" }],
    ["jdk java", "java.util.List", { kind: "external", pkg: "jdk:java" }],
    ["jdk javax", "javax.inject.Inject", { kind: "external", pkg: "jdk:javax" }],
    ["kotlin stdlib", "kotlin.collections.List", { kind: "external", pkg: "kotlin:stdlib" }],
    ["kotlinx", "kotlinx.coroutines.launch", { kind: "external", pkg: "kotlinx.coroutines" }],
  ];

  it.each(cases)("resolves: %s", (_name, specifier, expected) => {
    expect(resolveIn(files, "src/main/java/com/acme/app/Main.java", specifier)).toEqual(expected);
  });

  it("builds a graph across Java and Kotlin", () => {
    const graph = graphOf({
      ...files,
      "src/main/kotlin/com/acme/kt/Use.kt": lines(
        "package com.acme.kt",
        "import com.acme.core.Engine as E",
        "import com.acme.app.Main",
        "import java.io.File",
        "import com.acme.kt.Use",
      ),
    });
    const from = "src/main/kotlin/com/acme/kt/Use.kt";
    expect(edgesOf(graph, from)).toEqual([
      `${from} -> src/main/java/com/acme/core/Engine.java`,
      `${from} -> src/main/java/com/acme/app/Main.java`,
    ]);
    expect(externalsOf(graph, from)).toEqual(["jdk:java"]);
  });
});

describe("Rust", () => {
  it("extracts use, mod and extern crate", () => {
    const source = lines(
      "// use crate::fake_line;", //                        1
      "/* use crate::fake_block; /* nested */ mod no; */", // 2
      "use crate::a::b;", //                                3
      "use crate::a::{b, c::d};", //                        4
      "use super::x;", //                                   5
      "use self::y::Z;", //                                 6
      "pub mod foo;", //                                    7
      "mod inline { pub fn f() {} }", //                    8
      "extern crate serde;", //                             9
      "pub(crate) use other_crate::x as renamed;", //       10
      "use std::{", //                                      11
      "    collections::{HashMap, HashSet},", //            12
      "    io::{self, Read},", //                           13
      "    fmt::*,", //                                     14
      "};", //                                              15
      "use Ordering::*;", //                                16
      'const S: &str = "use crate::in_string;";', //        17
      "fn f<'a>(x: &'a str) -> char { let c = '\"'; let r = r#\"use crate::raw; \"quoted\" \"#; 'x' }", // 18
      "#[cfg(test)]", //                                    19
      "mod tests;", //                                      20
      "use ::tokio::spawn;", //                             21
    );
    expect(extractImports("src/lib.rs", source).map((item) => [item.specifier, item.line, item.kind])).toEqual([
      ["crate::a::b", 3, "use"],
      ["crate::a::b", 4, "use"],
      ["crate::a::c::d", 4, "use"],
      ["super::x", 5, "use"],
      ["self::y::Z", 6, "use"],
      ["foo", 7, "mod"],
      ["serde", 9, "use"],
      ["other_crate::x", 10, "use"],
      ["std::collections::HashMap", 11, "use"],
      ["std::collections::HashSet", 11, "use"],
      ["std::io", 11, "use"],
      ["std::io::Read", 11, "use"],
      ["std::fmt", 11, "use"],
      ["tests", 20, "mod"],
      ["tokio::spawn", 21, "use"],
    ]);
  });

  const files: Repo = {
    "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n',
    "crates/app/Cargo.toml": '[package]\nname = "my-app"\nversion = "0.1.0"\n\n[dependencies]\nname = "decoy"\n',
    "crates/app/src/main.rs": "",
    "crates/app/src/lib.rs": "",
    "crates/app/src/config.rs": "",
    "crates/app/src/net/mod.rs": "",
    "crates/app/src/net/http.rs": "",
    "crates/app/src/net/http/client.rs": "",
    "crates/app/src/net/tcp/mod.rs": "",
    "crates/app/src/db.rs": "",
    "crates/app/src/db/pool.rs": "",
    "crates/app/tests/integration.rs": "",
    "crates/app/tests/common/mod.rs": "",
    "crates/core-utils/Cargo.toml": "[package]\nname='core-utils'\n",
    "crates/core-utils/src/lib.rs": "",
    "crates/core-utils/src/strings.rs": "",
    "crates/binonly/Cargo.toml": '[package]\nname = "binonly"\n',
    "crates/binonly/src/main.rs": "",
    "crates/binonly/src/cli.rs": "",
  };
  const app = "crates/app/src";

  const cases: Array<[string, string, string, ImportKind, ResolvedImport]> = [
    ["mod in lib.rs", `${app}/lib.rs`, "config", "mod", { kind: "internal", target: `${app}/config.rs` }],
    ["mod dir in lib.rs", `${app}/lib.rs`, "net", "mod", { kind: "internal", target: `${app}/net/mod.rs` }],
    ["mod in mod.rs", `${app}/net/mod.rs`, "http", "mod", { kind: "internal", target: `${app}/net/http.rs` }],
    ["mod dir in mod.rs", `${app}/net/mod.rs`, "tcp", "mod", { kind: "internal", target: `${app}/net/tcp/mod.rs` }],
    ["mod in non-mod file", `${app}/db.rs`, "pool", "mod", { kind: "internal", target: `${app}/db/pool.rs` }],
    ["mod in nested non-mod file", `${app}/net/http.rs`, "client", "mod", { kind: "internal", target: `${app}/net/http/client.rs` }],
    ["mod in main.rs", "crates/binonly/src/main.rs", "cli", "mod", { kind: "internal", target: "crates/binonly/src/cli.rs" }],
    ["mod in integration test root", "crates/app/tests/integration.rs", "common", "mod", { kind: "internal", target: "crates/app/tests/common/mod.rs" }],
    ["missing mod", `${app}/lib.rs`, "ghost", "mod", { kind: "unresolved" }],
    ["crate path to file", `${app}/net/http.rs`, "crate::config", "use", { kind: "internal", target: `${app}/config.rs` }],
    ["crate path to item in file", `${app}/net/http.rs`, "crate::config::Settings", "use", { kind: "internal", target: `${app}/config.rs` }],
    ["crate path longest match", `${app}/main.rs`, "crate::net::http::client::Client", "use", { kind: "internal", target: `${app}/net/http/client.rs` }],
    ["crate path to mod.rs", `${app}/main.rs`, "crate::net::Listener", "use", { kind: "internal", target: `${app}/net/mod.rs` }],
    ["crate path prefers file over mod.rs depth", `${app}/main.rs`, "crate::db::pool", "use", { kind: "internal", target: `${app}/db/pool.rs` }],
    ["crate root item", `${app}/config.rs`, "crate::Error", "use", { kind: "internal", target: `${app}/lib.rs` }],
    ["crate root item in bin crate", "crates/binonly/src/cli.rs", "crate::Args", "use", { kind: "internal", target: "crates/binonly/src/main.rs" }],
    ["super to sibling", `${app}/net/http.rs`, "super::tcp::Stream", "use", { kind: "internal", target: `${app}/net/tcp/mod.rs` }],
    ["super item → parent module file", `${app}/net/http.rs`, "super::Listener", "use", { kind: "internal", target: `${app}/net/mod.rs` }],
    ["super from mod.rs → crate root", `${app}/net/mod.rs`, "super::config::Settings", "use", { kind: "internal", target: `${app}/config.rs` }],
    ["super::super", `${app}/net/http/client.rs`, "super::super::tcp", "use", { kind: "internal", target: `${app}/net/tcp/mod.rs` }],
    ["super item → crate root", `${app}/config.rs`, "super::Error", "use", { kind: "internal", target: `${app}/lib.rs` }],
    ["self to child", `${app}/net/mod.rs`, "self::http::Client", "use", { kind: "internal", target: `${app}/net/http.rs` }],
    ["self to child of non-mod file", `${app}/db.rs`, "self::pool::Pool", "use", { kind: "internal", target: `${app}/db/pool.rs` }],
    ["self item → same file", `${app}/db.rs`, "self::Thing", "use", { kind: "internal", target: `${app}/db.rs` }],
    ["uniform path to child module", `${app}/lib.rs`, "config::Settings", "use", { kind: "internal", target: `${app}/config.rs` }],
    ["workspace crate root", `${app}/main.rs`, "core_utils::Thing", "use", { kind: "internal", target: "crates/core-utils/src/lib.rs" }],
    ["workspace crate bare", `${app}/main.rs`, "core_utils", "use", { kind: "internal", target: "crates/core-utils/src/lib.rs" }],
    ["workspace crate module", `${app}/main.rs`, "core_utils::strings::trim", "use", { kind: "internal", target: "crates/core-utils/src/strings.rs" }],
    ["own crate from main.rs", `${app}/main.rs`, "my_app::config::Settings", "use", { kind: "internal", target: `${app}/config.rs` }],
    ["own crate from integration test", "crates/app/tests/integration.rs", "my_app::run", "use", { kind: "internal", target: `${app}/lib.rs` }],
    ["std", `${app}/main.rs`, "std::collections::HashMap", "use", { kind: "external", pkg: "rust:std" }],
    ["core", `${app}/main.rs`, "core::fmt", "use", { kind: "external", pkg: "rust:std" }],
    ["alloc", `${app}/main.rs`, "alloc::vec::Vec", "use", { kind: "external", pkg: "rust:std" }],
    ["external crate", `${app}/main.rs`, "serde::Deserialize", "use", { kind: "external", pkg: "serde" }],
    ["dependency key is not a crate name", `${app}/main.rs`, "decoy::x", "use", { kind: "external", pkg: "decoy" }],
  ];

  it.each(cases)("resolves: %s", (_name, from, specifier, kind, expected) => {
    expect(resolveIn(files, from, specifier, kind)).toEqual(expected);
  });

  it("infers the crate from src/ when no Cargo.toml is present", () => {
    const bare: Repo = { "src/lib.rs": "", "src/a.rs": "", "src/b/mod.rs": "" };
    expect(resolveIn(bare, "src/b/mod.rs", "crate::a::Thing", "use")).toEqual({ kind: "internal", target: "src/a.rs" });
    expect(resolveIn({ "x/a.rs": "" }, "x/a.rs", "crate::b", "use")).toEqual({ kind: "unresolved" });
  });

  it("drops self-edges and dedupes leaves that land on one file", () => {
    const graph = graphOf({
      "Cargo.toml": '[package]\nname = "solo"\n',
      "src/lib.rs": lines("mod a;", "mod b;", "use crate::Local;", "use crate::a::{One, Two};", "use rand::Rng;", "mod missing;"),
      "src/a.rs": "use super::b::B;\nuse crate::a::Own;",
      "src/b.rs": "",
    });
    expect(graph.edges.map((edge) => [edge.from, edge.to, edge.line])).toEqual([
      ["src/a.rs", "src/b.rs", 1],
      ["src/lib.rs", "src/a.rs", 1],
      ["src/lib.rs", "src/b.rs", 2],
      ["src/lib.rs", "src/a.rs", 4],
    ]);
    expect(externalsOf(graph)).toEqual(["rand"]);
    expect(unresolvedOf(graph)).toEqual(["src/lib.rs: missing"]);
  });
});

describe("C / C++", () => {
  it("extracts includes", () => {
    const source = lines(
      '#include "x/y.h"', //                    1
      "#include <stdio.h>", //                  2
      '  #  include   "spaced.h"', //           3
      '// #include "commented.h"', //           4
      '/* #include "block.h" */', //            5
      '#include "trailing.h" // why', //        6
      "#include <sys/types.h> /* c */", //      7
      'const char *s = "#include \\"str.h\\"";', // 8
      "#include MACRO_HEADER", //               9
      "char q = '\"';", //                      10
      '#include "after_char.h"', //             11
    );
    expect(extractImports("src/a.c", source).map((item) => [item.specifier, item.line, item.kind])).toEqual([
      ["x/y.h", 1, "include"],
      ["<stdio.h>", 2, "include"],
      ["spaced.h", 3, "include"],
      ["trailing.h", 6, "include"],
      ["<sys/types.h>", 7, "include"],
      ["after_char.h", 11, "include"],
    ]);
  });

  const files: Repo = {
    "src/main.c": "",
    "src/util.h": "",
    "src/net/socket.h": "",
    "src/net/socket.c": "",
    "include/proj/api.h": "",
    "include/proj/types.hpp": "",
    "lib/a/common.h": "",
    "lib/b/common.h": "",
    "third/tmpl.ipp": "",
    "docs/api.h.md": "",
  };

  const cases: Array<[string, string, string, ResolvedImport]> = [
    ["sibling", "src/main.c", "util.h", { kind: "internal", target: "src/util.h" }],
    ["relative subdir", "src/main.c", "net/socket.h", { kind: "internal", target: "src/net/socket.h" }],
    ["relative parent", "src/net/socket.c", "../util.h", { kind: "internal", target: "src/util.h" }],
    ["unique suffix", "src/main.c", "proj/api.h", { kind: "internal", target: "include/proj/api.h" }],
    ["unique basename", "src/net/socket.c", "types.hpp", { kind: "internal", target: "include/proj/types.hpp" }],
    ["non-standard extension", "src/main.c", "tmpl.ipp", { kind: "internal", target: "third/tmpl.ipp" }],
    ["sibling wins over ambiguity", "lib/a/x.c", "common.h", { kind: "internal", target: "lib/a/common.h" }],
    ["ambiguous suffix", "src/main.c", "common.h", { kind: "unresolved" }],
    ["disambiguated suffix", "src/main.c", "b/common.h", { kind: "internal", target: "lib/b/common.h" }],
    ["partial segment is not a suffix", "src/main.c", "pi.h", { kind: "external", pkg: "c:pi.h" }],
    ["quoted, not in repo", "src/main.c", "gtest/gtest.h", { kind: "external", pkg: "c:gtest/gtest.h" }],
    ["angle system header", "src/main.c", "<stdio.h>", { kind: "external", pkg: "c:stdio.h" }],
    ["angle resolved by unique suffix", "src/main.c", "<proj/api.h>", { kind: "internal", target: "include/proj/api.h" }],
    ["angle ambiguous stays external", "src/main.c", "<common.h>", { kind: "external", pkg: "c:common.h" }],
    ["angle does not use sibling lookup", "lib/a/x.c", "<common.h>", { kind: "external", pkg: "c:common.h" }],
  ];

  it.each(cases)("resolves: %s", (_name, from, specifier, expected) => {
    expect(resolveIn(files, from, specifier, "include")).toEqual(expected);
  });
});

describe("Ruby", () => {
  it("extracts require and require_relative", () => {
    const source = lines(
      "require 'json'", //                 1
      'require_relative "helpers/util"', // 2
      "# require 'commented'", //          3
      "=begin", //                         4
      "require 'in_block_comment'", //     5
      "=end", //                          6
      "  require('set')", //               7
      "require_relative '../config'", //   8
      "require name", //                   9
      "x = 1; puts \"require 'nope'\"", // 10
    );
    expect(extractImports("lib/a.rb", source).map((item) => [item.specifier, item.line, item.kind])).toEqual([
      ["json", 1, "require"],
      ["./helpers/util", 2, "static"],
      ["set", 7, "require"],
      ["../config", 8, "static"],
    ]);
  });

  it("resolves relative files, lib/ and gems", () => {
    const graph = graphOf({
      "lib/app.rb": lines("require_relative 'app/models'", "require 'app/version'", "require 'active_support/all'", "require_relative 'nope'"),
      "lib/app/models.rb": "require_relative '../app'\nrequire 'engine_thing'",
      "lib/app/version.rb": "",
      "engines/billing/lib/engine_thing.rb": "",
      "engines/billing/app/x.rb": "require 'engine_thing'\nrequire 'json'",
    });
    expect(edgesOf(graph)).toEqual([
      "engines/billing/app/x.rb -> engines/billing/lib/engine_thing.rb",
      "lib/app.rb -> lib/app/models.rb",
      "lib/app.rb -> lib/app/version.rb",
      "lib/app/models.rb -> lib/app.rb",
    ]);
    expect(graph.externals.map((ref) => `${ref.from}: ${ref.pkg}`)).toEqual([
      "engines/billing/app/x.rb: json",
      "lib/app.rb: active_support",
      "lib/app/models.rb: engine_thing",
    ]);
    expect(unresolvedOf(graph)).toEqual(["lib/app.rb: ./nope"]);
  });
});

describe("normalizePackageName", () => {
  const cases: Array<[string, Language, string]> = [
    ["a.b:c", "python", "a"],
    ["numpy.linalg", "python", "numpy"],
    ["github.com/x/y/z", "go", "github.com/x/y"],
    ["github.com/x", "go", "github.com/x"],
    ["fmt", "go", "go:fmt"],
    ["org.junit.jupiter.api.Test", "java", "org.junit"],
    ["java.util.*", "java", "jdk:java"],
    ["kotlin.math.max", "kotlin", "kotlin:stdlib"],
    ["tokio::sync::Mutex", "rust", "tokio"],
    ["std::fmt", "rust", "rust:std"],
    ["<vector>", "cpp", "c:vector"],
    ["boost/asio.hpp", "cpp", "c:boost/asio.hpp"],
    ["rails/all", "ruby", "rails"],
    ["Foundation", "swift", "Foundation"],
  ];
  it.each(cases)("%s (%s) → %s", (specifier, language, expected) => {
    expect(normalizePackageName(specifier, language)).toBe(expected);
  });
});

describe("buildFileGraph", () => {
  const sample: Repo = {
    "README.md": "# docs",
    "package.json": '{ "name": "sample" }',
    "src/index.ts": lines(
      'import { helper } from "./lib/helper";', //   1
      'import type { Config } from "./types";', //   2
      'import React from "react";', //               3
      'import fs from "node:fs";', //                4
      'import "./missing";', //                      5
      'import { token } from "@/lib/env";', //       6
      'export * from "./index";', //                 7
    ),
    "src/lib/helper.ts": 'import { type Config } from "../types";\nimport path from "path";',
    "src/lib/env.ts": "export const token = process.env.GITHUB_TOKEN;",
    "src/types.ts": "export interface Config {}",
    "src/lib/helper.test.ts": 'import { helper } from "./helper";\nimport { it } from "vitest";',
    "node_modules/react/index.js": 'require("./cjs/react");',
    "dist/index.js": 'require("../src/index");',
    "src/gen.d.ts": 'import "./index";',
    "assets/logo.png": null,
    "src/broken.ts": null,
    "App.swift": "import Foundation",
  };

  it("lists every non-ignored file, sorted", () => {
    expect(graphOf(sample).files).toEqual([
      "App.swift",
      "README.md",
      "assets/logo.png",
      "package.json",
      "src/broken.ts",
      "src/index.ts",
      "src/lib/env.ts",
      "src/lib/helper.test.ts",
      "src/lib/helper.ts",
      "src/types.ts",
    ]);
  });

  it("records facts only for readable files with a known language", () => {
    const graph = graphOf(sample);
    expect([...graph.facts.keys()].sort()).toEqual([
      "App.swift",
      "src/index.ts",
      "src/lib/env.ts",
      "src/lib/helper.test.ts",
      "src/lib/helper.ts",
      "src/types.ts",
    ]);
    expect(graph.facts.get("src/index.ts")).toMatchObject({ path: "src/index.ts", language: "typescript", isTest: false });
    expect(graph.facts.get("src/index.ts")?.imports).toHaveLength(7);
    expect(graph.facts.get("src/lib/helper.test.ts")?.isTest).toBe(true);
    expect(graph.facts.get("App.swift")).toMatchObject({ language: "swift", imports: [], envRefs: [] });
    expect(graph.facts.get("src/lib/env.ts")?.envRefs.map((ref) => ref.name)).toEqual(["GITHUB_TOKEN"]);
  });

  it("produces sorted edges, externals and unresolved imports", () => {
    const graph = graphOf(sample);
    expect(graph.edges).toEqual([
      { from: "src/index.ts", to: "src/lib/helper.ts", line: 1, specifier: "./lib/helper", typeOnly: false },
      { from: "src/index.ts", to: "src/types.ts", line: 2, specifier: "./types", typeOnly: true },
      { from: "src/index.ts", to: "src/lib/env.ts", line: 6, specifier: "@/lib/env", typeOnly: false },
      { from: "src/lib/helper.test.ts", to: "src/lib/helper.ts", line: 1, specifier: "./helper", typeOnly: false },
      { from: "src/lib/helper.ts", to: "src/types.ts", line: 1, specifier: "../types", typeOnly: true },
    ]);
    expect(graph.externals).toEqual([
      { from: "src/index.ts", pkg: "react", line: 3, specifier: "react", typeOnly: false },
      { from: "src/index.ts", pkg: "node:fs", line: 4, specifier: "node:fs", typeOnly: false },
      { from: "src/lib/helper.test.ts", pkg: "vitest", line: 2, specifier: "vitest", typeOnly: false },
      { from: "src/lib/helper.ts", pkg: "node:path", line: 2, specifier: "path", typeOnly: false },
    ]);
    expect(graph.unresolved).toEqual([{ from: "src/index.ts", specifier: "./missing", line: 5 }]);
  });

  it("never resolves into ignored files", () => {
    const graph = graphOf({
      "src/a.ts": 'import "../dist/out";\nimport "../vendor/lib";\nimport "./gen";',
      "dist/out.js": "",
      "vendor/lib.js": "",
      "src/gen.ts": "",
    }, ["src/gen.ts"]);
    expect(graph.files).toEqual(["src/a.ts"]);
    expect(graph.edges).toEqual([]);
    expect(unresolvedOf(graph)).toEqual(["src/a.ts: ../dist/out", "src/a.ts: ../vendor/lib", "src/a.ts: ./gen"]);
  });

  it("dedupes per (from, to, line) and keeps typeOnly only when every duplicate is type-only", () => {
    const graph = graphOf({
      "a.ts": lines(
        'import type { A } from "./b"; import { b } from "./b";',
        'import type { A2 } from "./b"; import type { A3 } from "./b.js";',
        'import x from "react"; import type { FC } from "react";',
        'import type { X } from "react"; import type { Y } from "react/jsx-runtime";',
        'import "./b";',
        'import "./nope"; import "./nope";',
      ),
      "b.ts": "",
    });
    expect(graph.edges.map((edge) => [edge.to, edge.line, edge.typeOnly])).toEqual([
      ["b.ts", 1, false],
      ["b.ts", 2, true],
      ["b.ts", 5, false],
    ]);
    expect(graph.externals.map((ref) => [ref.pkg, ref.line, ref.typeOnly])).toEqual([
      ["react", 3, false],
      ["react", 4, true],
    ]);
    expect(graph.unresolved).toEqual([{ from: "a.ts", specifier: "./nope", line: 6 }]);
  });

  it("skips files over the size cap but still lists them and resolves to them", () => {
    const big = `import "./small";\n${"x".repeat(MAX_ANALYZED_FILE_BYTES)}`;
    const graph = buildFileGraph([
      { path: "big.ts", content: big },
      { path: "declared-big.ts", content: 'import "./small";', size: MAX_ANALYZED_FILE_BYTES + 1 },
      { path: "at-cap.ts", content: 'import "./small";', size: MAX_ANALYZED_FILE_BYTES },
      { path: "small.ts", content: 'import "./big";' },
    ]);
    expect(graph.files).toEqual(["at-cap.ts", "big.ts", "declared-big.ts", "small.ts"]);
    expect([...graph.facts.keys()].sort()).toEqual(["at-cap.ts", "small.ts"]);
    expect(edgesOf(graph)).toEqual(["at-cap.ts -> small.ts", "small.ts -> big.ts"]);
  });

  it("normalizes input paths and drops duplicates", () => {
    const graph = buildFileGraph([
      { path: "./src/a.ts", content: 'import "./b";' },
      { path: "src\\b.ts", content: "" },
      { path: "src/b.ts", content: 'import "./a";' },
    ]);
    expect(graph.files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(edgesOf(graph)).toEqual(["src/a.ts -> src/b.ts"]);
  });

  it("is independent of input order", () => {
    const entries = repo(sample);
    const forward = buildFileGraph(entries);
    const backward = buildFileGraph([...entries].reverse());
    const shape = (graph: FileGraph): unknown => ({
      files: graph.files,
      facts: [...graph.facts.entries()],
      edges: graph.edges,
      externals: graph.externals,
      unresolved: graph.unresolved,
    });
    expect(shape(backward)).toEqual(shape(forward));
    expect(shape(buildFileGraph(entries))).toEqual(shape(forward));
  });

  it("handles an empty snapshot", () => {
    const graph = buildFileGraph([]);
    expect(graph).toEqual({ files: [], facts: new Map(), edges: [], externals: [], unresolved: [] });
  });

  it("builds a mixed-language graph", () => {
    const graph = graphOf({
      "go.mod": "module example.com/mono\n",
      "cmd/main.go": 'package main\nimport (\n\t"fmt"\n\t"example.com/mono/pkg/store"\n)',
      "pkg/store/store.go": "package store",
      "py/pyproject.toml": "",
      "py/svc/__init__.py": "",
      "py/svc/api.py": "from svc import models\nimport flask",
      "py/svc/models.py": "",
      "native/a.cpp": '#include "a.hpp"\n#include <vector>',
      "native/a.hpp": "",
    });
    expect(edgesOf(graph)).toEqual([
      "cmd/main.go -> pkg/store/store.go",
      "native/a.cpp -> native/a.hpp",
      "py/svc/api.py -> py/svc/models.py",
    ]);
    expect(externalsOf(graph)).toEqual(["go:fmt", "c:vector", "flask"]);
    expect(graph.unresolved).toEqual([]);
  });

  it("builds a 5,000-file TypeScript repository quickly", () => {
    const total = 5000;
    const perDir = 50;
    const pathOf = (index: number): string => `src/mod${Math.floor(index / perDir)}/file${index}.ts`;
    const files: SourceFile[] = [
      { path: "tsconfig.json", content: '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }' },
      { path: "package.json", content: '{ "name": "big" }' },
    ];
    for (let index = 0; index < total; index += 1) {
      const next = (offset: number): number => (index + offset) % total;
      const relative = (target: number): string => {
        const sameDir = Math.floor(target / perDir) === Math.floor(index / perDir);
        return sameDir ? `./file${target}` : `../mod${Math.floor(target / perDir)}/file${target}`;
      };
      files.push({
        path: pathOf(index),
        content: lines(
          "// generated module",
          `import { value as a } from "${relative(next(1))}";`,
          `import type { T } from "${relative(next(7))}.js";`,
          `import { b } from "@/mod${Math.floor(next(53) / perDir)}/file${next(53)}";`,
          `import { c } from "${relative(next(501))}";`,
          'import React from "react";',
          'import { readFile } from "node:fs/promises";',
          "/* a block comment with import x from 'nope' */",
          "export type T = { id: number; label: string };",
          "export const value = `template ${a} // not a comment`;",
          `export async function load() { return import("${relative(next(2))}"); }`,
          "export function compute(x: number): number { return (x * 31 + 7) / 3; }",
        ),
      });
    }

    const started = performance.now();
    const graph = buildFileGraph(files);
    const elapsed = performance.now() - started;

    expect(graph.files).toHaveLength(total + 2);
    expect(graph.facts.size).toBe(total);
    expect(graph.edges).toHaveLength(total * 5);
    expect(graph.externals).toHaveLength(total * 2);
    expect(graph.unresolved).toEqual([]);
    expect(graph.edges.filter((edge) => edge.typeOnly)).toHaveLength(total);
    expect(elapsed).toBeLessThan(3000);
  });
});
