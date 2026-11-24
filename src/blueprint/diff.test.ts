import { describe, it, expect } from "vitest";

import { codeOnly, detectVerificationWeakening, fileAdded, matchTripwires, parseUnifiedDiff } from "./diff";
import type { ChangedFile, DiffLine } from "./types";

// Captured from `git diff --cached --no-color -M -U0` (git 2.44).
const GIT_DIFF_U0 = [
  "diff --git a/assets/logo.png b/assets/logo.png",
  "index d0463d4..fe4db0d 100644",
  "Binary files a/assets/logo.png and b/assets/logo.png differ",
  "diff --git a/src/a.ts b/src/a.ts",
  "index 4083766..cce669b 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -2 +2 @@ line1",
  "-line2",
  "+line2 changed",
  "@@ -9 +9 @@ line8",
  "-line9",
  "+line9 changed",
  "@@ -10,0 +11 @@ line10",
  "+line11",
  "diff --git a/src/added.ts b/src/added.ts",
  "new file mode 100644",
  "index 0000000..80ce8d9",
  "--- /dev/null",
  "+++ b/src/added.ts",
  "@@ -0,0 +1,2 @@",
  "+new1",
  "+new2",
  String.raw`diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"`,
  "index ce01362..94954ab 100644",
  String.raw`--- "a/src/caf\303\251.ts"`,
  String.raw`+++ "b/src/caf\303\251.ts"`,
  "@@ -1,0 +2 @@ hello",
  "+world",
  "diff --git a/src/deleted.ts b/src/deleted.ts",
  "deleted file mode 100644",
  "index 988cd72..0000000",
  "--- a/src/deleted.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-gone1",
  "-gone2",
  "diff --git a/src/empty.ts b/src/empty.ts",
  "new file mode 100644",
  "index 0000000..e69de29",
  "diff --git a/src/old-name.ts b/src/new-name.ts",
  "similarity index 50%",
  "rename from src/old-name.ts",
  "rename to src/new-name.ts",
  "index 109a021..439ac55 100644",
  "--- a/src/old-name.ts",
  "+++ b/src/new-name.ts",
  "@@ -2 +2 @@ export const x = 1;",
  "-export const y = 2;",
  "+export const y = 3;",
  "diff --git a/src/nonl.txt b/src/nonl.txt",
  "index 9ed40b4..4b602a3 100644",
  "--- a/src/nonl.txt",
  "+++ b/src/nonl.txt",
  "@@ -2 +2 @@ one",
  "-two",
  "\\ No newline at end of file",
  "+two changed",
  "\\ No newline at end of file",
  "diff --git a/src/q.sql b/src/q.sql",
  "index a3705a8..d4dc651 100644",
  "--- a/src/q.sql",
  "+++ b/src/q.sql",
  "@@ -1 +0,0 @@",
  "--- sql comment",
  "@@ -2,0 +2 @@ select 1;",
  "+++ plus",
  "diff --git a/src/with space.ts b/src/with space.ts",
  "index 7898192..6178079 100644",
  "--- a/src/with space.ts\t",
  "+++ b/src/with space.ts\t",
  "@@ -1 +1 @@",
  "-a",
  "+b",
  "",
].join("\n");

// Captured from `git diff --cached --no-color -M` (default 3 lines of context).
const GIT_DIFF_U3 = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 4083766..cce669b 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,10 +1,11 @@",
  " line1",
  "-line2",
  "+line2 changed",
  " line3",
  " line4",
  " line5",
  " line6",
  " line7",
  " line8",
  "-line9",
  "+line9 changed",
  " line10",
  "+line11",
  "diff --git a/src/q.sql b/src/q.sql",
  "index a3705a8..d4dc651 100644",
  "--- a/src/q.sql",
  "+++ b/src/q.sql",
  "@@ -1,2 +1,2 @@",
  "--- sql comment",
  " select 1;",
  "+++ plus",
  "",
].join("\n");

function byPath(files: ChangedFile[]): Map<string, ChangedFile> {
  return new Map(files.map((file) => [file.path, file]));
}

function numbered(texts: readonly string[], start = 1): DiffLine[] {
  return texts.map((text, index) => ({ line: start + index, text }));
}

function change(
  path: string,
  options: { status?: ChangedFile["status"]; added?: readonly string[]; removed?: readonly string[]; previousPath?: string } = {},
): ChangedFile {
  const file: ChangedFile = {
    path,
    status: options.status ?? "modified",
    added: numbered(options.added ?? [], 10),
    removed: numbered(options.removed ?? [], 10),
  };
  if (options.previousPath) file.previousPath = options.previousPath;
  return file;
}

function signalsOf(changes: ChangedFile[], signal: string) {
  return detectVerificationWeakening(changes).filter((entry) => entry.signal === signal);
}

describe("parseUnifiedDiff", () => {
  const files = parseUnifiedDiff(GIT_DIFF_U0);
  const map = byPath(files);

  it("lists every file in diff order", () => {
    expect(files.map((file) => file.path)).toEqual([
      "assets/logo.png",
      "src/a.ts",
      "src/added.ts",
      "src/café.ts",
      "src/deleted.ts",
      "src/empty.ts",
      "src/new-name.ts",
      "src/nonl.txt",
      "src/q.sql",
      "src/with space.ts",
    ]);
  });

  it("marks binary files", () => {
    expect(map.get("assets/logo.png")).toEqual({
      path: "assets/logo.png",
      status: "modified",
      added: [],
      removed: [],
      binary: true,
    });
    expect(map.get("src/a.ts")?.binary).toBeUndefined();
  });

  it("numbers added lines in the new file and removed lines in the old file across hunks", () => {
    const file = map.get("src/a.ts");
    expect(file?.status).toBe("modified");
    expect(file?.removed).toEqual([
      { line: 2, text: "line2" },
      { line: 9, text: "line9" },
    ]);
    expect(file?.added).toEqual([
      { line: 2, text: "line2 changed" },
      { line: 9, text: "line9 changed" },
      { line: 11, text: "line11" },
    ]);
  });

  it("parses new files", () => {
    expect(map.get("src/added.ts")).toEqual({
      path: "src/added.ts",
      status: "added",
      added: [
        { line: 1, text: "new1" },
        { line: 2, text: "new2" },
      ],
      removed: [],
    });
  });

  it("parses empty new files that have no ---/+++ header", () => {
    expect(map.get("src/empty.ts")).toEqual({ path: "src/empty.ts", status: "added", added: [], removed: [] });
  });

  it("parses deleted files using the old path", () => {
    expect(map.get("src/deleted.ts")).toEqual({
      path: "src/deleted.ts",
      status: "deleted",
      added: [],
      removed: [
        { line: 1, text: "gone1" },
        { line: 2, text: "gone2" },
      ],
    });
  });

  it("decodes quoted paths with octal UTF-8 escapes", () => {
    expect(map.get("src/café.ts")?.added).toEqual([{ line: 2, text: "world" }]);
  });

  it("keeps a rename with edits as renamed, with the previous path", () => {
    expect(map.get("src/new-name.ts")).toEqual({
      path: "src/new-name.ts",
      previousPath: "src/old-name.ts",
      status: "renamed",
      added: [{ line: 2, text: "export const y = 3;" }],
      removed: [{ line: 2, text: "export const y = 2;" }],
    });
  });

  it("ignores no-newline markers", () => {
    const file = map.get("src/nonl.txt");
    expect(file?.removed).toEqual([{ line: 2, text: "two" }]);
    expect(file?.added).toEqual([{ line: 2, text: "two changed" }]);
  });

  it("does not mistake content starting with -- or ++ for file headers", () => {
    const file = map.get("src/q.sql");
    expect(file?.removed).toEqual([{ line: 1, text: "-- sql comment" }]);
    expect(file?.added).toEqual([{ line: 2, text: "++ plus" }]);
  });

  it("handles paths with spaces and git's trailing tab", () => {
    const file = map.get("src/with space.ts");
    expect(file?.status).toBe("modified");
    expect(file?.added).toEqual([{ line: 1, text: "b" }]);
  });

  it("produces the same lines with context as with -U0", () => {
    const withContext = byPath(parseUnifiedDiff(GIT_DIFF_U3));
    expect(withContext.get("src/a.ts")).toEqual(map.get("src/a.ts"));
    expect(withContext.get("src/q.sql")).toEqual(map.get("src/q.sql"));
  });

  it("parses pure renames and binary additions/deletions", () => {
    const parsed = parseUnifiedDiff(
      [
        "diff --git a/docs/a b.md b/docs/c d.md",
        "similarity index 100%",
        "rename from docs/a b.md",
        "rename to docs/c d.md",
        "diff --git a/img/new.png b/img/new.png",
        "new file mode 100644",
        "index 0000000..fe4db0d",
        "Binary files /dev/null and b/img/new.png differ",
        "diff --git a/img/old.png b/img/old.png",
        "deleted file mode 100644",
        "index fe4db0d..0000000",
        "Binary files a/img/old.png and /dev/null differ",
        "diff --git a/run.sh b/run.sh",
        "old mode 100644",
        "new mode 100755",
      ].join("\n"),
    );
    expect(parsed).toEqual([
      { path: "docs/c d.md", previousPath: "docs/a b.md", status: "renamed", added: [], removed: [] },
      { path: "img/new.png", status: "added", added: [], removed: [], binary: true },
      { path: "img/old.png", status: "deleted", added: [], removed: [], binary: true },
      { path: "run.sh", status: "modified", added: [], removed: [] },
    ]);
  });

  it("decodes quoted renames with escaped quotes, backslashes and tabs", () => {
    const parsed = parseUnifiedDiff(
      [
        String.raw`diff --git "a/src/say \"hi\".ts" "b/src/tab\there\\x.ts"`,
        "similarity index 100%",
        String.raw`rename from "src/say \"hi\".ts"`,
        String.raw`rename to "src/tab\there\\x.ts"`,
        String.raw`diff --git "a/\346\227\245\346\234\254.txt" "b/\346\227\245\346\234\254.txt"`,
        "new file mode 100644",
        "index 0000000..e69de29",
        String.raw`diff --git "a/\360\237\230\200.md" "b/\360\237\230\200.md"`,
        "deleted file mode 100644",
        "index e69de29..0000000",
      ].join("\n"),
    );
    expect(parsed.map((file) => [file.status, file.path, file.previousPath])).toEqual([
      ["renamed", "src/tab\there\\x.ts", 'src/say "hi".ts'],
      ["added", "日本.txt", undefined],
      ["deleted", "😀.md", undefined],
    ]);
  });

  it("handles CRLF diffs and plain unified diffs without a git header", () => {
    const parsed = parseUnifiedDiff(
      ["--- a/one.txt\t2026-01-01 10:00:00", "+++ b/one.txt\t2026-01-02 10:00:00", "@@ -1,2 +1,2 @@", " keep", "-old", "+new", "--- a/two.txt", "+++ b/two.txt", "@@ -3 +3 @@", "-x", "+y", ""].join("\r\n"),
    );
    expect(parsed).toEqual([
      { path: "one.txt", status: "modified", added: [{ line: 2, text: "new" }], removed: [{ line: 2, text: "old" }] },
      { path: "two.txt", status: "modified", added: [{ line: 3, text: "y" }], removed: [{ line: 3, text: "x" }] },
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("not a diff\n")).toEqual([]);
  });
});

describe("fileAdded", () => {
  it("numbers every line as added", () => {
    expect(fileAdded("src/new.ts", "a\r\nb\n")).toEqual({
      path: "src/new.ts",
      status: "added",
      added: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
      ],
      removed: [],
    });
  });

  it("handles missing trailing newline and empty content", () => {
    expect(fileAdded("x", "only").added).toEqual([{ line: 1, text: "only" }]);
    expect(fileAdded("x", "").added).toEqual([]);
    expect(fileAdded("x", "a\n\n").added).toHaveLength(2);
  });
});

describe("matchTripwires", () => {
  const changes = [
    change("src/lib/ai.ts"),
    change("src/lib/ai.test.ts"),
    change(".github/workflows/ci.yml"),
    change("package-lock.json"),
    change(".rassam/blueprint.json"),
    change(".claude/settings.json"),
    change("apps/web/.env.local"),
    change("infra/main.tf"),
  ];

  it("matches the built-in tripwires as warnings, sorted by path", () => {
    const hits = matchTripwires(changes, { defaults: true });
    expect(hits.map((hit) => [hit.path, hit.category])).toEqual([
      [".claude/settings.json", "agent-permissions"],
      [".github/workflows/ci.yml", "ci"],
      [".rassam/blueprint.json", "contract"],
      ["apps/web/.env.local", "secrets"],
      ["infra/main.tf", "build"],
      ["package-lock.json", "dependencies"],
      ["src/lib/ai.test.ts", "tests"],
    ]);
    expect(hits.every((hit) => hit.severity === "warning" && hit.ruleId === undefined)).toBe(true);
    expect(hits[2].reason).toBe("The architecture contract itself changed.");
  });

  it("reports nothing when defaults are off and nothing else is configured", () => {
    expect(matchTripwires(changes, { defaults: false })).toEqual([]);
  });

  it("keeps only the first matching built-in tripwire per path", () => {
    const hits = matchTripwires([change("src/__tests__/a.test.ts")], { defaults: true });
    expect(hits).toHaveLength(1);
    expect(hits[0].category).toBe("tests");
  });

  it("matches extra policy globs", () => {
    const hits = matchTripwires(changes, { defaults: false, extra: ["src/lib/**", "infra/**"] });
    expect(hits).toEqual([
      { path: "infra/main.tf", category: "build", reason: "Protected by blueprint policy", severity: "warning" },
      { path: "src/lib/ai.test.ts", category: "tests", reason: "Protected by blueprint policy", severity: "warning" },
      { path: "src/lib/ai.ts", category: "contract", reason: "Protected by blueprint policy", severity: "warning" },
    ]);
  });

  it("matches protect rules with rule id, severity and reason", () => {
    const hits = matchTripwires(changes, {
      defaults: false,
      protectRules: [
        { id: "billing", paths: ["src/billing/**"] },
        { id: "core-ai", paths: ["src/lib/ai.ts"], severity: "error", reason: "Prompt changes need review" },
        { id: "lib", paths: ["src/lib/**"] },
      ],
    });
    expect(hits).toEqual([
      { path: "src/lib/ai.test.ts", category: "tests", reason: "Protected by blueprint rule lib", ruleId: "lib", severity: "warning" },
      { path: "src/lib/ai.ts", category: "contract", reason: "Prompt changes need review", ruleId: "core-ai", severity: "error" },
      { path: "src/lib/ai.ts", category: "contract", reason: "Protected by blueprint rule lib", ruleId: "lib", severity: "warning" },
    ]);
  });

  it("emits one hit per source for the same path", () => {
    const hits = matchTripwires([change("src/lib/ai.test.ts")], {
      defaults: true,
      extra: ["src/lib/**", "**/*.ts"],
      protectRules: [{ id: "lib", paths: ["src/lib/**", "src/**"] }],
    });
    expect(hits.map((hit) => hit.ruleId ?? hit.reason)).toEqual([
      "Tests are the checks agents are graded by.",
      "Protected by blueprint policy",
      "lib",
    ]);
  });

  it("checks the previous path of renamed files", () => {
    const renamed = change("src/lib/ai.disabled.ts", { status: "renamed", previousPath: "src/lib/ai.test.ts" });
    const hits = matchTripwires([renamed], {
      defaults: true,
      protectRules: [{ id: "tests", paths: ["**/*.test.ts"] }],
    });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ path: "src/lib/ai.disabled.ts", category: "tests" });
    expect(hits[0].reason).toContain("moved from src/lib/ai.test.ts");
    expect(hits[1]).toMatchObject({ ruleId: "tests", category: "tests" });
  });

  it("is deterministic regardless of input order", () => {
    const options = { defaults: true, extra: ["src/**"] };
    expect(matchTripwires([...changes].reverse(), options)).toEqual(matchTripwires(changes, options));
  });
});

describe("detectVerificationWeakening", () => {
  describe("test-file-deleted", () => {
    it("flags deleted tests and tests renamed out of test paths", () => {
      const signals = signalsOf(
        [
          change("src/a.test.ts", { status: "deleted", removed: ["x"] }),
          change("src/b.ts.bak", { status: "renamed", previousPath: "src/b.spec.ts" }),
        ],
        "test-file-deleted",
      );
      expect(signals.map((entry) => [entry.path, entry.severity])).toEqual([
        ["src/a.test.ts", "warning"],
        ["src/b.ts.bak", "warning"],
      ]);
      expect(signals[1].message).toContain("src/b.spec.ts");
    });

    it("ignores deleted source files, moved tests and deleted snapshots", () => {
      expect(
        signalsOf(
          [
            change("src/a.ts", { status: "deleted" }),
            change("tests/unit/b.test.ts", { status: "renamed", previousPath: "src/b.test.ts" }),
            change("src/__snapshots__/a.test.ts.snap", { status: "deleted" }),
          ],
          "test-file-deleted",
        ),
      ).toEqual([]);
    });
  });

  describe("test-skipped", () => {
    const skips = [
      "it.skip('works', () => {});",
      "describe.skip('suite', () => {});",
      "describe.skip.each([1])('x', () => {});",
      "xit('works', () => {});",
      "xdescribe('suite', () => {});",
      "xtest('works', () => {});",
      "it.todo('later');",
      "test.todo('later');",
      "@pytest.mark.skip(reason='flaky')",
      "@pytest.mark.skipif(sys.platform == 'win32')",
      "@unittest.skip('broken')",
      "    pytest.skip('not now')",
      "\tt.Skip(\"flaky\")",
      "@Disabled",
      "@Ignore",
      "#[ignore]",
      "this.skip();",
      // node:test options and context calls, and Playwright's fixme.
      "test('free plan: a user can keep four notes', { todo: 'owner to decide' }, () => {",
      "test('works', { skip: true }, () => {});",
      "it('works', { skip: 'flaky on CI' }, async () => {",
      "describe('suite', { todo: true }, () => {",
      "  t.todo('not yet');",
      "test.fixme('works', async ({ page }) => {});",
      // The option does not have to be the first property.
      "test('works', { timeout: 500, skip: true }, () => {});",
      "it('works', { concurrency: 1, todo: 'later' }, async () => {",
    ];

    it("does not flag a placeholder without a body, or options that leave the test running", () => {
      expect(
        signalsOf(
          [
            change("src/a.test.ts", {
              added: [
                "it.todo('later');",
                "test.todo('later');",
                "test('works', { skip: false }, () => {});",
                "test('works', { timeout: 500 }, () => {});",
                "test('works', { timeout: 500, skip: false }, () => {});",
                "test('reads { todo: true } from the config', () => {});",
                // An object literal inside the test body is data, not test options.
                "test('pages', (t) => { run({ skip: true }); });",
                "test('pages', t => { run({ skip: true }); });",
              ],
            }),
          ],
          "test-skipped",
        ),
      ).toEqual([]);
    });

    it("flags a skip or todo option on its own line of a multi-line test call", () => {
      const signals = signalsOf(
        [
          change("src/a.test.ts", {
            added: [
              "test('works', {",
              "  timeout: 500,",
              "  skip: true,",
              "}, () => {",
              "  const query = {",
              "    skip: true,",
              "  };",
              "describe('suite', {",
              "  todo: 'owner to decide',",
              "}, () => {",
            ],
          }),
        ],
        "test-skipped",
      );
      expect(signals.map((entry) => entry.line)).toEqual([12, 18]);
    });

    it("leaves skip and todo properties alone outside a test call's options", () => {
      expect(
        signalsOf(
          [
            change("src/a.test.ts", {
              added: [
                "const page = await notes.findMany({",
                "  skip: 10,",
                "  take: 5,",
                "});",
                "expect(page).toEqual({",
                "  todo: 'buy milk',",
                "});",
                "test('works', {",
                "  timeout: 500,",
                "  skip: false,",
                "}, () => {});",
              ],
            }),
          ],
          "test-skipped",
        ),
      ).toEqual([]);
    });

    it.each(skips.filter((text) => !/^(?:it|test)\.todo\(/.test(text)))("flags %s", (text) => {
      const signals = signalsOf([change("src/a.test.ts", { added: [text] })], "test-skipped");
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ path: "src/a.test.ts", line: 10, severity: "warning" });
    });

    it("ignores ordinary test code, removed skips and non-test files", () => {
      expect(
        signalsOf(
          [
            change("src/a.test.ts", {
              added: ["it('works', () => { expect(skipList).toEqual([]); });", "const exit = 1;"],
              removed: ["it.skip('works', () => {});"],
            }),
            change("src/queue.ts", { added: ["queue.skip(job);", "xit(1);"] }),
          ],
          "test-skipped",
        ),
      ).toEqual([]);
    });
  });

  describe("test-focused", () => {
    it.each(["it.only('a', () => {});", "describe.only('a', () => {});", "fit('a', () => {});", "fdescribe('a', () => {});"])(
      "flags %s",
      (text) => {
        expect(signalsOf([change("src/a.spec.ts", { added: [text] })], "test-focused")).toHaveLength(1);
      },
    );

    it("ignores lookalikes and non-test files", () => {
      expect(
        signalsOf(
          [
            change("src/a.spec.ts", { added: ["benefit('a');", "const only = pick(list);", "outfit(x);"] }),
            change("src/a.ts", { added: ["it.only('a', () => {});"] }),
          ],
          "test-focused",
        ),
      ).toEqual([]);
    });
  });

  describe("assertions-removed", () => {
    it("flags a net loss of three or more assertions and reports the count", () => {
      const signals = signalsOf(
        [
          change("src/a.test.ts", {
            removed: ["expect(a).toBe(1);", "expect(b).toEqual(2);", "assert.equal(c, 3);", "result.should.equal(4);"],
            added: ["expect(a).toBeDefined();"],
          }),
        ],
        "assertions-removed",
      );
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ line: 10, severity: "warning" });
      expect(signals[0].message).toBe("4 assertions removed, only 1 added");
    });

    it("flags a test whose only assertions were stripped while its code remained", () => {
      const signals = signalsOf(
        [change("pkg/calc_test.go", { removed: ["\trequire.Equal(t, 4, Add(2, 2))", "\tt.Fatalf(\"bad\")"] })],
        "assertions-removed",
      );
      expect(signals).toHaveLength(1);
      expect(signals[0].message).toBe("2 assertions removed and none added");

      const replaced = signalsOf(
        [change("src/a.test.ts", { removed: ["expect(total).toBe(42);"], added: ["console.log(total);"] })],
        "assertions-removed",
      );
      expect(replaced).toHaveLength(1);
      expect(replaced[0].message).toBe("1 assertion removed and none added");
    });

    it("ignores rewritten assertions, whole-test removals below the threshold, deletions and non-test files", () => {
      expect(
        signalsOf(
          [
            change("src/a.test.ts", {
              removed: ["expect(a).toBe(1);", "expect(b).toBe(2);"],
              added: ["expect(a).toBe(10);", "expect(b).toBe(20);"],
            }),
            change("src/b.test.ts", { removed: ["it('old', () => {", "  expect(a).toBe(1);", "});"] }),
            change("src/c.test.ts", { status: "deleted", removed: ["expect(a).toBe(1);"] }),
            change("src/d.ts", { removed: ["assert(a);", "assert(b);", "assert(c);"] }),
          ],
          "assertions-removed",
        ),
      ).toEqual([]);
    });
  });

  describe("assertion-trivialized", () => {
    it.each([
      "expect(true).toBe(true);",
      "expect(1).toBe(1);",
      "expect('ok').toBeTruthy();",
      "expect(true).not.toBe(false);",
      "    assert True",
      "    assert 1 == 1",
      "    assert True, 'always'",
      "assertTrue(true);",
      "self.assertTrue(True)",
      "assert.ok(true);",
      "assertEquals(1, 1);",
    ])("flags %s", (text) => {
      const signals = signalsOf([change("tests/test_a.py", { added: [text] })], "assertion-trivialized");
      expect(signals).toHaveLength(1);
      expect(signals[0].severity).toBe("warning");
    });

    it("ignores real assertions and non-test files", () => {
      expect(
        signalsOf(
          [
            change("tests/test_a.py", {
              added: [
                "expect(result).toBe(true);",
                "expect(isValid(1)).toBeTruthy();",
                "    assert True is flag",
                "    assert total == 1",
                "assertEquals(1, count);",
                "assert.ok(trueish);",
              ],
            }),
            change("src/a.ts", { added: ["expect(true).toBe(true);"] }),
          ],
          "assertion-trivialized",
        ),
      ).toEqual([]);
    });
  });

  describe("exit-zero", () => {
    it("flags forced success exits in tests, CI, runner config, hooks and test scripts", () => {
      const signals = signalsOf(
        [
          change("src/a.test.ts", { added: ["process.exit(0);"] }),
          change("tests/test_a.py", { added: ["    sys.exit(0)", "    os._exit(0)"] }),
          change("pkg/a_test.go", { added: ["\tos.Exit(0)"] }),
          change("conftest.py", { added: ["os.exit(0)"] }),
          change("vitest.config.ts", { added: ["process.exit( 0 )"] }),
          change(".github/workflows/ci.yml", { added: ["        run: npm test; exit 0"] }),
          change(".husky/pre-commit", { added: ["exit 0"] }),
          change("scripts/run-tests.sh", { added: ["npm test || exit 0"] }),
          change("package.json", { added: ['    "test": "echo skipped && exit 0",'] }),
        ],
        "exit-zero",
      );
      expect(signals.map((entry) => entry.path)).toEqual([
        ".github/workflows/ci.yml",
        ".husky/pre-commit",
        "conftest.py",
        "package.json",
        "pkg/a_test.go",
        "scripts/run-tests.sh",
        "src/a.test.ts",
        "tests/test_a.py",
        "tests/test_a.py",
        "vitest.config.ts",
      ]);
      expect(signals.every((entry) => entry.severity === "error" && entry.line !== undefined)).toBe(true);
    });

    it("ignores non-zero exits, source files and unrelated scripts", () => {
      expect(
        signalsOf(
          [
            change("src/a.test.ts", { added: ["process.exit(1);", "// exit 0 in prose", "process.exit(code);"] }),
            change("src/cli.ts", { added: ["process.exit(0);"] }),
            change("scripts/deploy.sh", { added: ["exit 0"] }),
            change(".github/workflows/ci.yml", { added: ["        run: exit 1", "        run: echo exit 01"] }),
            change("package.json", { added: ['    "start": "node server.js || exit 0",'] }),
          ],
          "exit-zero",
        ),
      ).toEqual([]);
    });
  });

  describe("suppression-added", () => {
    it.each([
      "// @ts-ignore",
      "// @ts-nocheck",
      "// @ts-expect-error wrong type",
      "/* eslint-disable */",
      "// eslint-disable-next-line no-console",
      "x = y  # type: ignore",
      "import os  # noqa",
      "err := run() //nolint:errcheck",
      "#[allow(dead_code)]",
      '@SuppressWarnings("unchecked")',
      "# pylint: disable=broad-except",
      "/* istanbul ignore next */",
      "/* c8 ignore start */",
    ])("flags %s as info", (text) => {
      const signals = signalsOf([change("src/a.ts", { added: [text] })], "suppression-added");
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ severity: "info", line: 10 });
    });

    it("escalates to one warning when three or more are added to a file", () => {
      const signals = signalsOf(
        [change("src/a.ts", { added: ["// @ts-ignore", "const a = 1;", "// @ts-ignore", "// eslint-disable-line"] })],
        "suppression-added",
      );
      expect(signals).toEqual([
        {
          path: "src/a.ts",
          line: 10,
          signal: "suppression-added",
          severity: "warning",
          message: "3 check suppressions added (lines 10, 12, 13)",
        },
      ]);
    });

    it("ignores removed suppressions, ordinary code and documentation", () => {
      expect(
        signalsOf(
          [
            change("src/a.ts", { added: ["const ignore = true;", "allow(user);"], removed: ["// @ts-ignore"] }),
            change("docs/lint.md", { added: ["Use `// eslint-disable-next-line` sparingly."] }),
          ],
          "suppression-added",
        ),
      ).toEqual([]);
    });
  });

  describe("ci-weakened", () => {
    it.each([
      "        continue-on-error: true",
      "        run: npm test || true",
      "        run: git commit --no-verify -m x",
      "    if: false",
      "      - if: ${{ false }}",
      "        run: npx jest --passWithNoTests",
      "        run: npx vitest --bail=0",
      "  allow_failure: true",
    ])("flags added %s", (text) => {
      const signals = signalsOf([change(".github/workflows/ci.yml", { added: [text] })], "ci-weakened");
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ severity: "warning", line: 10 });
    });

    it("applies to every supported CI system", () => {
      const paths = [".gitlab-ci.yml", ".circleci/config.yml", "azure-pipelines.yml", "Jenkinsfile"];
      const signals = signalsOf(paths.map((path) => change(path, { added: ["  allow_failure: true"] })), "ci-weakened");
      expect(signals.map((entry) => entry.path)).toEqual([".circleci/config.yml", ".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml"]);
    });

    it("flags removed verification commands without an equivalent replacement", () => {
      const signals = signalsOf(
        [
          change(".github/workflows/ci.yml", {
            removed: ["      - run: npm test", "      - run: npm run lint", "        run: npx tsc --noEmit", "      - name: Build"],
            added: ["      - run: pnpm run lint", "      - run: echo done"],
          }),
        ],
        "ci-weakened",
      );
      expect(signals.map((entry) => [entry.line, entry.message])).toEqual([
        [10, 'CI no longer runs "npm test"'],
        [12, 'CI no longer runs "npx tsc --noEmit"'],
      ]);
    });

    it("summarizes a deleted CI file in one signal", () => {
      const signals = signalsOf(
        [
          change(".github/workflows/ci.yml", {
            status: "deleted",
            removed: ["name: CI", "      - run: npm test", "      - run: npm run build"],
          }),
        ],
        "ci-weakened",
      );
      expect(signals).toHaveLength(1);
      expect(signals[0].message).toBe('CI file deleted; it ran "npm test", "npm run build"');
    });

    it("ignores safe edits, comments and non-CI files", () => {
      expect(
        signalsOf(
          [
            change(".github/workflows/ci.yml", {
              added: ["        continue-on-error: false", "    if: github.event_name == 'push'", "# run: npm test || true", "      - run: pnpm test"],
              removed: ["      - run: npm test", "      - uses: actions/checkout@v4", "      - name: Run tests"],
            }),
            change("docs/ci.yml", { added: ["continue-on-error: true"], removed: ["run: npm test"] }),
          ],
          "ci-weakened",
        ),
      ).toEqual([]);
    });
  });

  describe("coverage-threshold-lowered", () => {
    it("flags lowered thresholds per key across config formats", () => {
      const signals = signalsOf(
        [
          change("vitest.config.ts", {
            removed: ["        lines: 80,", "        branches: 75,", "        functions: 80,"],
            added: ["        lines: 50,", "        branches: 75,", "        functions: 90,"],
          }),
          change("pyproject.toml", { removed: ["fail_under = 90"], added: ["fail_under = 60.5"] }),
          change("codecov.yml", { removed: ["        target: 85%"], added: ["        target: 70%"] }),
          change("package.json", { removed: ['        "statements": 90,'], added: ['        "statements": 10,'] }),
          change(".nycrc.json", { removed: ['  "branches": 80'], added: ['  "branches": 0'] }),
        ],
        "coverage-threshold-lowered",
      );
      expect(signals.map((entry) => [entry.path, entry.message])).toEqual([
        [".nycrc.json", 'Coverage threshold "branches" lowered from 80 to 0'],
        ["codecov.yml", 'Coverage threshold "target" lowered from 85 to 70'],
        ["package.json", 'Coverage threshold "statements" lowered from 90 to 10'],
        ["pyproject.toml", 'Coverage threshold "fail_under" lowered from 90 to 60.5'],
        ["vitest.config.ts", 'Coverage threshold "lines" lowered from 80 to 50'],
      ]);
      expect(signals[4]).toMatchObject({ line: 10, severity: "warning" });
    });

    it("pairs repeated keys in order", () => {
      const signals = signalsOf(
        [
          change("jest.config.js", {
            removed: ["      lines: 80,", "      lines: 60,"],
            added: ["      lines: 80,", "      lines: 40,"],
          }),
        ],
        "coverage-threshold-lowered",
      );
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ line: 11, message: 'Coverage threshold "lines" lowered from 60 to 40' });
    });

    it("ignores raised thresholds, unrelated keys and non-config files", () => {
      expect(
        signalsOf(
          [
            change("vitest.config.ts", { removed: ["lines: 50,", "timeout: 9000,"], added: ["lines: 80,", "timeout: 10,"] }),
            change("src/settings.ts", { removed: ["lines: 80,"], added: ["lines: 10,"] }),
          ],
          "coverage-threshold-lowered",
        ),
      ).toEqual([]);
    });
  });

  describe("test-script-changed", () => {
    it("flags changed and removed verification scripts, not new ones", () => {
      const signals = signalsOf(
        [
          change("package.json", {
            removed: ['    "test": "vitest run",', '    "lint": "eslint .",', '    "typecheck": "tsc --noEmit",'],
            added: ['    "test": "echo ok",', '    "test:unit": "vitest run",', '    "typecheck": "tsc --noEmit"'],
          }),
        ],
        "test-script-changed",
      );
      expect(signals.map((entry) => [entry.line, entry.message])).toEqual([
        [10, 'Script "test" changed from "vitest run" to "echo ok"'],
        [11, 'Script "lint" removed (was "eslint .")'],
      ]);
      expect(signals.every((entry) => entry.severity === "warning")).toBe(true);
    });

    it("covers check and ci scripts in nested packages", () => {
      const signals = signalsOf(
        [change("packages/web/package.json", { removed: ['    "check": "npm test",', '    "ci": "npm run check"'], added: ['    "check": "true",', '    "ci": "true"'] })],
        "test-script-changed",
      );
      expect(signals).toHaveLength(2);
    });

    it("ignores other scripts and other files", () => {
      expect(
        signalsOf(
          [
            change("package.json", { added: ['    "dev": "next dev",', '    "testing-library": "^1.0.0",', '    "version": "2.0.0",'] }),
            change("composer.json", { added: ['    "test": "phpunit"'] }),
          ],
          "test-script-changed",
        ),
      ).toEqual([]);
    });
  });

  describe("snapshots-mass-updated", () => {
    const snapshot = (index: number, status: ChangedFile["status"] = "modified") =>
      change(index % 2 ? `src/__snapshots__/c${index}.test.tsx.snap` : `src/ui/c${index}.snap`, { status });

    it("flags five or more modified or deleted snapshot files once", () => {
      const signals = signalsOf([snapshot(1), snapshot(2), snapshot(3, "deleted"), snapshot(4), snapshot(5)], "snapshots-mass-updated");
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ path: "src/__snapshots__/c1.test.tsx.snap", severity: "info" });
      expect(signals[0].message).toContain("5 snapshot files");
    });

    it("ignores smaller updates and newly added snapshots", () => {
      expect(signalsOf([snapshot(1), snapshot(2), snapshot(3), snapshot(4)], "snapshots-mass-updated")).toEqual([]);
      expect(
        signalsOf([snapshot(1), snapshot(2), snapshot(3), snapshot(4), snapshot(5, "added"), snapshot(6, "added")], "snapshots-mass-updated"),
      ).toEqual([]);
    });
  });

  it("orders signals by path, line, then signal and skips binary files", () => {
    const binary: ChangedFile = { ...change("src/z.test.ts", { added: ["it.only('x')"] }), binary: true };
    const signals = detectVerificationWeakening([
      binary,
      change("src/b.test.ts", { added: ["it.skip('a', () => {});", "it.only('b', () => { expect(true).toBe(true); });"] }),
      change("src/a.test.ts", { added: ["// @ts-ignore", "it.skip('a', () => {});"] }),
    ]);
    expect(signals.map((entry) => [entry.path, entry.line, entry.signal])).toEqual([
      ["src/a.test.ts", 10, "suppression-added"],
      ["src/a.test.ts", 11, "test-skipped"],
      ["src/b.test.ts", 10, "test-skipped"],
      ["src/b.test.ts", 11, "assertion-trivialized"],
      ["src/b.test.ts", 11, "test-focused"],
    ]);
  });

  it("works end to end on parsed git output", () => {
    const diff = [
      "diff --git a/src/math.test.ts b/src/math.test.ts",
      "index 1111111..2222222 100644",
      "--- a/src/math.test.ts",
      "+++ b/src/math.test.ts",
      "@@ -4,3 +4 @@ describe('add', () => {",
      "-    expect(add(1, 2)).toBe(3);",
      "-    expect(add(-1, 1)).toBe(0);",
      "-    expect(add(0, 0)).toBe(0);",
      "+    expect(true).toBe(true);",
      "",
    ].join("\n");
    const signals = detectVerificationWeakening(parseUnifiedDiff(diff));
    expect(signals.map((entry) => [entry.line, entry.signal])).toEqual([
      [4, "assertion-trivialized"],
      [4, "assertions-removed"],
    ]);
  });

  it("returns nothing for an ordinary source change", () => {
    expect(detectVerificationWeakening(parseUnifiedDiff(GIT_DIFF_U0))).toEqual([]);
  });
});

describe("string-literal fixtures do not trigger signals", () => {
  it("ignores skip/focus/exit patterns inside strings but still sees real code", () => {
    const fixture: ChangedFile = {
      path: "src/heuristics.test.ts",
      status: "modified",
      added: [
        { line: 3, text: `  { line: 2, text: "test.skip('x', () => {});" },` },
        { line: 4, text: `  const sample = 'process.exit(0)';` },
        { line: 5, text: "  it.only('really focused', () => {});" },
      ],
      removed: [],
    };
    const signals = detectVerificationWeakening([fixture]).map((signal) => `${signal.signal}@${signal.line}`);
    expect(signals).toEqual(["test-focused@5"]);
    expect(codeOnly("src/a.ts", `x("a.skip(") + y`)).toBe(`x("       ") + y`);
    expect(codeOnly(".github/workflows/ci.yml", `run: "npm test || true"`)).toBe(`run: "npm test || true"`);
  });
});

describe("test special-casing in production code", () => {
  const added = (path: string, text: string): ChangedFile => ({ path, status: "modified", added: [{ line: 7, text }], removed: [] });
  it("flags production code that detects a test runner", () => {
    const cases = [
      added("src/pricing.ts", `  if (process.env.NODE_ENV === "test") return 42;`),
      added("src/pricing.ts", `  if (process.env.VITEST) return expected;`),
      added("app/service.py", `    if "pytest" in sys.modules:`),
      added("pkg/calc.go", `	if testing.Testing() {`),
    ];
    for (const change of cases) {
      expect(detectVerificationWeakening([change]).map((signal) => signal.signal)).toEqual(["test-special-casing"]);
    }
  });

  it("ignores tests, configs and unrelated environment checks", () => {
    const cases = [
      added("src/pricing.test.ts", `  if (process.env.NODE_ENV === "test") return 42;`),
      added("vitest.config.ts", `  environment: process.env.VITEST ? "node" : "jsdom",`),
      added("src/server.ts", `  if (process.env.NODE_ENV === "production") enableCache();`),
    ];
    for (const change of cases) {
      expect(detectVerificationWeakening([change]).filter((signal) => signal.signal === "test-special-casing")).toEqual([]);
    }
  });
});

describe("test special-casing inside string fixtures", () => {
  it("ignores patterns that appear inside string literals", () => {
    const change: ChangedFile = {
      path: "bench/cases.ts",
      status: "added",
      added: [
        { line: 3, text: `  description: 'Python code detects the runner with "pytest" in sys.modules',` },
        { line: 4, text: String.raw`  patch: ' if (process.env.NODE_ENV === "test") return 13;\n',` },
      ],
      removed: [],
    };
    expect(detectVerificationWeakening([change]).filter((signal) => signal.signal === "test-special-casing")).toEqual([]);
  });
});
