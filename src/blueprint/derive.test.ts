import { describe, expect, it } from "vitest";

import { runCheck } from "./check";
import { deriveBlueprint, detectSystemName } from "./derive";
import { assignComponents } from "./graph";
import { parseBlueprint, serializeBlueprint, type Blueprint } from "./schema";
import type { SourceFile } from "./types";

// Small synthetic repositories that mirror the shapes seen in the hands-on
// trial: a Go module with its package at the root (gin), a standard Java
// layout (spring-petclinic), a library with many small sibling folders
// (hono's adapters and benchmarks), and a folder with too many children.

const NOW = "2026-11-24T00:00:00.000Z";
const code = (path: string, content = "export const x = 1;\n"): SourceFile => ({ path, content });
const json = (path: string, value: unknown): SourceFile => ({ path, content: JSON.stringify(value) });
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

const derive = (files: SourceFile[], options: Parameters<typeof deriveBlueprint>[1] = {}) => deriveBlueprint(files, { now: NOW, ...options });
const component = (draft: Blueprint, id: string) => draft.components.find((candidate) => candidate.id === id);
const summary = (draft: Blueprint) => draft.components.map((candidate) => `${candidate.name}:${candidate.kind}`);

/** Production source files no component claims. */
function unmapped(draft: Blueprint, files: SourceFile[]): string[] {
  const membership = assignComponents(files.map((file) => file.path), draft);
  return membership.unmapped.filter((path) => /\.(ts|go|java|py|rs)$/.test(path));
}

describe("deriveBlueprint: the root package", () => {
  const gin: SourceFile[] = [
    { path: "go.mod", content: "module github.com/gin-gonic/gin\n\ngo 1.24\n" },
    { path: ".golangci.yml", content: "linters: {}\n" },
    ...["gin.go", "context.go", "tree.go", "routergroup.go", "utils.go"].map((name) => code(name, "package gin\n")),
    ...["gin_test.go", "context_test.go"].map((name) => code(name, "package gin\n")),
    ...range(4).map((index) => code(`binding/b${index}.go`, "package binding\n")),
    ...range(3).map((index) => code(`render/r${index}.go`, "package render\n")),
    code("ginS/gins.go", "package ginS\n"),
  ];

  it("names a Go package at the repository root after its module and treats it as code", () => {
    const draft = derive(gin);
    const root = component(draft, "gin");
    expect(root).toMatchObject({ name: "Gin", kind: "core" });
    expect(root?.paths).toEqual(["/*", "ginS/**"]);
    expect(draft.components.some((candidate) => candidate.kind === "config")).toBe(false);
    expect(summary(draft)).toEqual(["Binding:core", "Render:core", "Gin:core", "Tests:test"]);
    expect(unmapped(draft, gin)).toEqual([]);
  });

  it("keeps `config` for a root that only configures tools", () => {
    const files = [
      json("package.json", { name: "@acme/web" }),
      code("vite.config.ts"),
      code("eslint.config.mjs"),
      code(".lintstagedrc.js"),
      code("setupTests.ts"),
      ...range(3).map((index) => code(`src/a${index}.ts`)),
      ...range(3).map((index) => code(`lib/b${index}.ts`)),
    ];
    const draft = derive(files);
    expect(component(draft, "root")).toMatchObject({ name: "Root", kind: "config", paths: ["/*"] });
  });

  it("names Python and Rust root packages, and drops a Go major-version suffix", () => {
    const python = derive([
      { path: "pyproject.toml", content: '[build-system]\nrequires = ["flit"]\n\n[project]\nname = "tinylib"\n' },
      code("setup.py", "from setuptools import setup\n"),
      code("tinylib.py", "import os\n"),
      ...range(2).map((index) => code(`tools/t${index}.py`, "import os\n")),
    ]);
    expect(component(python, "tinylib")).toMatchObject({ name: "Tinylib", kind: "core", paths: ["/*"] });

    const rust = derive([
      { path: "Cargo.toml", content: '[package]\nname = "fastgrep"\nversion = "1.0.0"\n' },
      code("build.rs", "fn main() {}\n"),
      ...range(3).map((index) => code(`src/m${index}.rs`, "pub fn f() {}\n")),
      ...range(2).map((index) => code(`benches/b${index}.rs`, "fn main() {}\n")),
    ]);
    expect(component(rust, "fastgrep")).toMatchObject({ name: "Fastgrep", kind: "core", paths: ["src/**"] });
    expect(component(rust, "root")).toMatchObject({ kind: "config", paths: ["/*"] });

    expect(detectSystemName([{ path: "go.mod", content: "module example.com/acme/tool/v2\n" }])).toBe("tool");
  });

  it("names a src-layout Python package after the package, not `src`", () => {
    const draft = derive([
      { path: "pyproject.toml", content: '[project]\nname = "Flask"\n' },
      ...range(6).map((index) => code(`src/flask/m${index}.py`, "import os\n")),
      ...range(2).map((index) => code(`src/flask/json/j${index}.py`, "import os\n")),
      ...range(2).map((index) => code(`tests/test_${index}.py`, "import flask\n")),
    ]);
    expect(component(draft, "flask")).toMatchObject({ name: "Flask", kind: "core", paths: ["src/**"] });
  });
});

describe("deriveBlueprint: standard JVM layouts", () => {
  const base = "src/main/java/org/springframework/samples/petclinic";
  const petclinic: SourceFile[] = [
    { path: "pom.xml", content: "<project/>" },
    code(`${base}/PetClinicApplication.java`, "package org.springframework.samples.petclinic;\n"),
    code(`${base}/package-info.java`, "package org.springframework.samples.petclinic;\n"),
    ...["BaseEntity", "NamedEntity", "Person"].map((name) => code(`${base}/model/${name}.java`, "package model;\n")),
    ...["Owner", "OwnerController", "OwnerRepository", "Pet", "Visit"].map((name) => code(`${base}/owner/${name}.java`, "package owner;\n")),
    ...["CacheConfiguration", "WelcomeController"].map((name) => code(`${base}/system/${name}.java`, "package system;\n")),
    ...["Vet", "VetController", "Vets"].map((name) => code(`${base}/vet/${name}.java`, "package vet;\n")),
    code("src/test/java/org/springframework/samples/petclinic/owner/OwnerControllerTests.java", "package owner;\n"),
    code("src/test/java/org/springframework/samples/petclinic/vet/VetSupport.java", "package vet;\n"),
  ];

  it("splits by the subpackages of the base package even when small", () => {
    const draft = derive(petclinic);
    expect(summary(draft)).toEqual(["Model:model", "Owner:core", "System:core", "Vet:core", "Petclinic:core", "Tests:test"]);
    expect(component(draft, "owner")?.paths).toEqual([`${base}/owner/**`]);
    expect(component(draft, "petclinic")?.paths).toEqual([`${base}/*`]);
    const membership = assignComponents(petclinic.map((file) => file.path), draft).fileToComponent;
    expect(membership.get("src/test/java/org/springframework/samples/petclinic/owner/OwnerControllerTests.java")).toBe("tests");
    expect(membership.get("src/test/java/org/springframework/samples/petclinic/vet/VetSupport.java")).toBe("tests");
    expect(unmapped(draft, petclinic)).toEqual([]);
  });

  it("names subpackages per module in a multi-module build", () => {
    const files = [
      ...["web/Controller", "web/Routes", "data/Repo", "data/Entity"].map((name) => code(`api/src/main/java/com/acme/api/${name}.java`, "package x;\n")),
      ...["jobs/Nightly", "jobs/Hourly", "io/Reader", "io/Writer"].map((name) => code(`worker/src/main/kotlin/com/acme/worker/${name}.kt`, "package x\n")),
    ];
    const names = derive(files).components.map((candidate) => candidate.name);
    expect(names).toEqual(["Api Data", "Api Web", "Worker Io", "Worker Jobs"]);
  });

  it("leaves a single-package JVM project alone", () => {
    const files = range(3).map((index) => code(`src/main/java/com/acme/tool/C${index}.java`, "package x;\n"));
    expect(derive(files).components).toHaveLength(1);
  });
});

describe("deriveBlueprint: libraries with many small folders", () => {
  const adapters = ["aws-lambda", "bun", "cloudflare-pages", "cloudflare-workers", "deno", "lambda-edge", "netlify", "node", "service-worker", "vercel", "fastly", "azure", "alibaba", "nextjs", "workerd"];
  const hono: SourceFile[] = [
    json("package.json", { name: "hono" }),
    code("vite.config.ts"),
    code("vitest.config.ts"),
    ...adapters.flatMap((name) => ["index.ts", "handler.ts", "conninfo.ts"].map((file) => code(`adapters/${name}/src/${file}`))),
    ...adapters.map((name) => code(`adapters/${name}/src/handler.test.ts`)),
    ...["jsx", "routers", "fetch", "query-param", "utils"].flatMap((name) => range(10).map((index) => code(`benchmarks/${name}/b${index}.ts`))),
    ...["hono.ts", "context.ts", "compose.ts"].map((name) => code(`src/${name}`)),
    ...range(16).map((index) => code(`src/router/r${index}.ts`)),
    ...range(14).map((index) => code(`src/middleware/m${index}.ts`)),
    ...range(12).map((index) => code(`src/helper/h${index}.ts`)),
    ...range(11).map((index) => code(`src/jsx/j${index}.ts`)),
    ...range(3).map((index) => code(`src/client/c${index}.ts`)),
    code("src/request/request.ts"),
    code("src/hono.test.ts"),
  ];

  it("keeps fifteen small sibling adapters together and never splits benchmarks", () => {
    const draft = derive(hono);
    expect(component(draft, "adapters")).toMatchObject({ name: "Adapters", paths: ["adapters/**"] });
    expect(component(draft, "benchmarks")).toMatchObject({ name: "Benchmarks", paths: ["benchmarks/**"] });
    expect(draft.components.filter((candidate) => candidate.paths.some((path) => path.startsWith("adapters/") || path.startsWith("benchmarks/")))).toHaveLength(2);
    expect(summary(draft)).toEqual([
      "Adapters:core",
      "Benchmarks:core",
      "Client:client",
      "Helper:core",
      "Jsx:core",
      "Middleware:middleware",
      "Router:core",
      "Hono (other):core",
      "Root:config",
      "Tests:test",
    ]);
    expect(component(draft, "hono-other")?.paths).toEqual(["src/*", "src/request/**"]);
    expect(unmapped(draft, hono)).toEqual([]);
  });

  it("past ten children keeps the substantial ones and gathers the rest under '(other)' with explicit globs", () => {
    const dir = "packages/app/components";
    const sizes: Array<[string, number]> = [["Dialog", 30], ["Menu", 15], ["Stats", 12], ["Picker", 11], ...range(10).map((index): [string, number] => [`Small${index}`, 3])];
    const files = [
      ...sizes.flatMap(([name, size]) => range(size).map((index) => code(`${dir}/${name}/f${index}.tsx`))),
      ...range(20).map((index) => code(`${dir}/Top${index}.tsx`)),
      ...range(12).map((index) => code(`packages/app/data/d${index}.ts`)),
      ...range(12).map((index) => code(`packages/core/c${index}.ts`)),
    ];
    const draft = derive(files);
    const others = draft.components.find((candidate) => candidate.name === "Components (other)");
    expect(others?.paths).toEqual([`${dir}/*`, ...range(10).map((index) => `${dir}/Small${index}/**`)]);
    expect(draft.components.map((candidate) => candidate.name)).toEqual(expect.arrayContaining(["Components Dialog", "Components Menu", "Components Stats", "Components Picker"]));
    expect(draft.components.filter((candidate) => candidate.paths.some((path) => path.startsWith(`${dir}/`)))).toHaveLength(5);
    expect(unmapped(draft, files)).toEqual([]);
  });

  it("stays within the component budget, refining the largest folders first", () => {
    const files = ["alpha", "beta", "gamma", "delta"].flatMap((pkg, order) => (
      ["api", "db", "ui", "jobs"].flatMap((area) => range(12 + order).map((index) => code(`packages/${pkg}/${area}/f${index}.ts`)))
    ));
    const draft = derive(files, { maxComponents: 8 });
    expect(draft.components.length).toBeLessThanOrEqual(8);
    // The largest package is split first; splitting the next would overflow the budget, so the rest stay whole.
    expect(draft.components.map((candidate) => candidate.id)).toEqual(["alpha", "beta", "delta-api", "delta-db", "delta-jobs", "delta-ui", "gamma"]);
    expect(unmapped(draft, files)).toEqual([]);
  });
});

describe("deriveBlueprint: small repositories", () => {
  const ids = (draft: Blueprint) => draft.components.map((candidate) => candidate.id);

  it("splits a small repository into the layers its folders name, one file each", () => {
    const files = [
      json("package.json", { name: "shop" }),
      code("src/web/page.js", "import { getOrders } from '../api/orders.js';\n"),
      code("src/api/orders.js", "import { query } from '../db/client.js';\n"),
      code("src/db/client.js"),
    ];
    const draft = derive(files);
    expect(ids(draft)).toEqual(["api", "db", "web"]);
    expect(component(draft, "web")?.paths).toEqual(["src/web/**"]);
    expect(component(draft, "db")?.kind).toBe("database");
    expect(unmapped(draft, files)).toEqual([]);
  });

  it("splits layers at the repository root, and keeps siblings that are not named like a layer", () => {
    const rootLayers = [code("web/a.ts"), code("api/b.ts"), code("db/c.ts")];
    expect(ids(derive(rootLayers))).toEqual(["api", "db", "web"]);

    const orbit = ["web", "api", "domain", "auth", "billing", "storage"].map((name) => code(`src/${name}/${name}.ts`));
    const draft = derive(orbit);
    expect(ids(draft)).toEqual(["api", "auth", "billing", "domain", "storage", "web"]);
    expect(unmapped(draft, orbit)).toEqual([]);
  });

  it("counts web, frontend, backend and storage as layers", () => {
    expect(ids(derive([code("src/web/page.ts"), code("src/api/orders.ts")]))).toEqual(["api", "web"]);
    expect(ids(derive([code("frontend/app.ts"), code("backend/server.ts")]))).toEqual(["backend", "frontend"]);
    expect(ids(derive([code("src/web/page.ts"), code("src/storage/db.ts")]))).toEqual(["storage", "web"]);
  });

  it("leaves a small repository whole when no folder names a layer", () => {
    const files = [code("src/foo/a.ts"), code("src/bar/b.ts"), code("src/baz/c.ts")];
    expect(derive(files).components.filter((candidate) => candidate.kind !== "test")).toHaveLength(1);
  });

  it("does not split small layered folders inside a larger repository", () => {
    const files = [
      ...range(40).map((index) => code(`packages/big/f${index}.ts`)),
      ...range(12).map((index) => code(`packages/small/f${index}.ts`)),
      code("packages/feature/ui/a.tsx"),
      code("packages/feature/api/b.ts"),
      code("packages/feature/db/c.ts"),
    ];
    const draft = derive(files);
    expect(component(draft, "feature")?.paths).toEqual(["packages/feature/**"]);
    expect(draft.components.filter((candidate) => candidate.paths.some((path) => /^packages\/feature\/(?:ui|api|db)\//.test(path)))).toEqual([]);
    expect(unmapped(draft, files)).toEqual([]);
  });
});

describe("deriveBlueprint: invariants of a draft", () => {
  const files: SourceFile[] = [
    json("package.json", { name: "shop" }),
    code("src/ui/Cart.ts", 'import { total } from "../domain/pricing";\nexport const Cart = total;\n'),
    code("src/ui/Header.ts", "export const Header = 1;\n"),
    code("src/domain/pricing.ts", 'import { db } from "../infra/db";\nexport const total = db;\n'),
    code("src/domain/orders.ts", 'import { total } from "./pricing";\nexport const orders = total;\n'),
    code("src/infra/db.ts", "export const db = process.env.PORT;\n"),
    code("src/infra/cache.ts", "export const cache = 1;\n"),
    code("src/domain/pricing.test.ts", 'import { total } from "./pricing";\nexport const t = total;\n'),
  ];

  it("is deterministic, whatever the file order", () => {
    const once = serializeBlueprint(derive(files));
    expect(serializeBlueprint(derive([...files].reverse()))).toBe(once);
    expect(serializeBlueprint(derive(files))).toBe(once);
  });

  it("marks every fact as derived and drafts the standard rules", () => {
    const draft = derive(files, { commit: "abc" });
    expect(parseBlueprint(JSON.parse(serializeBlueprint(draft))).ok).toBe(true);
    for (const fact of [...draft.components, ...draft.dependencies, ...draft.rules]) expect(fact.provenance?.source).toBe("derived");
    expect(draft.rules.map((rule) => rule.id)).toEqual(["no-component-cycles", "tests-are-leaves"]);
    // A small repository is split where its folders name layers (ui, domain).
    expect(draft.components.map((candidate) => candidate.id)).toEqual(["domain", "infra", "ui", "tests"]);
    expect(draft.dependencies.map((dependency) => `${dependency.from}->${dependency.to}`)).toEqual(expect.arrayContaining(["ui->domain", "domain->infra"]));
    const report = runCheck({ files, blueprint: draft });
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("drafts secret-access rules for secrets read by few components", () => {
    const withSecret = [...files, code("src/infra/keys.ts", "export const key = process.env.STRIPE_SECRET_KEY;\n")];
    const draft = derive(withSecret);
    const rule = draft.rules.find((candidate) => candidate.kind === "secret-access");
    expect(rule).toMatchObject({ id: "secret-stripe-secret-key", secrets: ["STRIPE_SECRET_KEY"] });
  });
});
