import { describe, expect, it } from "vitest";

import { bestMatch, compileGlob, matchesAny } from "./glob";
import { ancestors, basename, dirname, extname, join, normalize, repoPath } from "./paths";

describe("compileGlob", () => {
  const cases: Array<[string, string, boolean]> = [
    ["src/**", "src/a.ts", true],
    ["src/**", "src/a/b/c.ts", true],
    ["src/**", "srcx/a.ts", false],
    ["src/*", "src/a.ts", true],
    ["src/*", "src/a/b.ts", false],
    ["**/*.test.ts", "a.test.ts", true],
    ["**/*.test.ts", "src/deep/a.test.ts", true],
    ["*.test.*", "src/deep/a.test.tsx", true],
    ["*.ts", "src/a.ts", true],
    ["/*", "a.ts", true],
    ["/*", "src/a.ts", false],
    ["src/lib", "src/lib/a.ts", true],
    ["src/lib/", "src/lib/x/a.ts", true],
    ["src/**/index.ts", "src/index.ts", true],
    ["src/**/index.ts", "src/a/b/index.ts", true],
    ["{package-lock.json,yarn.lock}", "package-lock.json", true],
    ["{package-lock.json,yarn.lock}", "app/yarn.lock", true],
    ["src/{app,lib}/**", "src/lib/x.ts", true],
    ["src/{app,lib}/**", "src/hooks/x.ts", false],
    ["src/?.ts", "src/a.ts", true],
    ["src/?.ts", "src/ab.ts", false],
    ["src/[ab].ts", "src/b.ts", true],
    ["src/[!ab].ts", "src/b.ts", false],
    ["src/[!ab].ts", "src/c.ts", true],
    ["./src/**", "src/a.ts", true],
    ["**/.env*", ".env.local", true],
    ["**/.env*", "apps/web/.env", true],
    ["src/a.b.ts", "src/aXb.ts", false],
  ];
  it.each(cases)("%s matches %s → %s", (pattern, path, expected) => {
    expect(compileGlob(pattern).test(path)).toBe(expected);
  });

  it("ranks specificity by literal characters", () => {
    expect(compileGlob("src/lib/llm/**").specificity).toBeGreaterThan(compileGlob("src/lib/**").specificity);
    expect(compileGlob("**").specificity).toBe(0);
  });

  it("normalizes windows separators in paths", () => {
    expect(compileGlob("src/**").test("src\\a\\b.ts")).toBe(true);
  });

  it("matchesAny and bestMatch", () => {
    expect(matchesAny("src/a.ts", ["lib/**", "src/**"])).toBe(true);
    expect(matchesAny("src/a.ts", undefined)).toBe(false);
    expect(bestMatch("src/lib/a.ts", ["src/**", "src/lib/**"])).toBe(compileGlob("src/lib/**").specificity);
    expect(bestMatch("x.ts", ["src/**"])).toBe(-1);
  });
});

describe("paths", () => {
  it("normalizes and joins", () => {
    expect(normalize("a/./b/../c")).toBe("a/c");
    expect(normalize("../a")).toBe("../a");
    expect(join("src/lib", "../app", "page.tsx")).toBe("src/app/page.tsx");
    expect(repoPath("./src/a.ts")).toBe("src/a.ts");
    expect(repoPath(".")).toBe("");
  });

  it("splits names", () => {
    expect(dirname("src/lib/a.ts")).toBe("src/lib");
    expect(dirname("a.ts")).toBe(".");
    expect(basename("src/lib/a.ts")).toBe("a.ts");
    expect(basename("src/lib/a.ts", ".ts")).toBe("a");
    expect(extname("a.test.ts")).toBe(".ts");
    expect(extname(".gitignore")).toBe("");
    expect(ancestors("a/b/c.ts")).toEqual(["a/b", "a", ""]);
  });
});

describe("globstars inside braces", () => {
  it("treat each alternative like a whole pattern, at any depth", () => {
    const helpers = compileGlob("{**/tests/**,**/test/**,**/__mocks__/**}");
    for (const path of ["tests/setup.ts", "tests/helpers/db.ts", "pkg/tests/a/b.ts", "test/x.js", "src/__mocks__/fs.ts"]) {
      expect(helpers.test(path), path).toBe(true);
    }
    for (const path of ["src/testsuite.ts", "contests/a.ts", "src/test.ts"]) expect(helpers.test(path), path).toBe(false);
  });

  it("keeps ** inside a segment literal-bounded", () => {
    const infra = compileGlob("{Dockerfile,**/Dockerfile,**/*.tf}");
    for (const path of ["Dockerfile", "svc/api/Dockerfile", "main.tf", "infra/prod/main.tf"]) expect(infra.test(path), path).toBe(true);
    expect(infra.test("src/Dockerfile.md")).toBe(false);
    expect(compileGlob("src/{a,**/b}/x.ts").test("src/deep/er/b/x.ts")).toBe(true);
    expect(compileGlob("x{**}y").test("xay")).toBe(true);
    expect(compileGlob("x{**}y").test("xa/y")).toBe(false);
  });
});
