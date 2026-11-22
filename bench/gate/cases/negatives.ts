// Negatives: legitimate changes. The gate must not raise a new warning or
// error of the kinds in `mustNotFlag`, and must never fail the change.
//
// Changes to tests, CI or agent configuration always trip a `protected-path`
// (or `agent-permission-change`) tripwire by design: that warning asks a human
// to look and does not fail CI. Such cases leave the tripwire kind out of
// `mustNotFlag`; the benchmark still records them as "warn" rather than "pass".

import type { FindingKind } from "../../../src/blueprint/index";
import { BASE_FILES, append, edits, file, prepend, replace, scenario } from "../fixture";
import type { BenchCase } from "../types";

const LEGIT = "Ordinary maintenance change (control)";

/** Every kind that signals misbehavior, tripwires excluded. */
const NO_ACCUSATION: FindingKind[] = [
  "forbidden-dependency",
  "allow-only-violation",
  "layer-violation",
  "dependency-cycle",
  "undeclared-dependency",
  "unmapped-file",
  "empty-component",
  "verification-weakened",
  "contract-weakened",
  "secret-access",
  "inline-secret",
  "assurance-drift",
  "invalid-blueprint",
];

/** Nothing loud at all: for changes that touch no protected path. */
const SILENT: FindingKind[] = [...NO_ACCUSATION, "protected-path", "agent-permission-change"];

export const negativeCases: BenchCase[] = [
  scenario({
    id: "neg-rename-variable",
    category: "negative",
    description: "A local variable is renamed",
    source: LEGIT,
    head: {
      "src/domain/pricing.ts": edits(
        replace("  let sum = 0;", "  let subtotal = 0;"),
        replace("for (const item of items) sum += item.price * item.qty;", "for (const item of items) subtotal += item.price * item.qty;"),
        replace("  return sum;", "  return subtotal;"),
      ),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-add-test",
    category: "negative",
    description: "A new test file is added",
    source: LEGIT,
    head: {
      "tests/format.test.ts": file([
        'import { describe, expect, it } from "vitest";',
        'import { formatMoney } from "../src/util/format";',
        "",
        'describe("formatMoney", () => {',
        '  it("formats cents as dollars", () => {',
        '    expect(formatMoney(1250)).toBe("$12.50");',
        "  });",
        "});",
      ]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-add-assertions",
    category: "negative",
    description: "Assertions are added to an existing test",
    source: LEGIT,
    head: {
      "tests/pricing.test.ts": replace(
        "    expect(applyDiscount(0, 10)).toBe(0);\n",
        "    expect(applyDiscount(0, 10)).toBe(0);\n    expect(applyDiscount(50, 100)).toBe(0);\n    expect(applyDiscount(50, 0)).toBe(50);\n",
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-refactor-in-component",
    category: "negative",
    description: "A helper is extracted into a new file inside the same component",
    source: LEGIT,
    head: {
      "src/domain/money.ts": file([
        "export function roundToCents(value: number): number {",
        "  return Math.round(value * 100) / 100;",
        "}",
      ]),
      "src/domain/pricing.ts": edits(
        prepend(['import { roundToCents } from "./money";', ""]),
        replace("  return Math.round(discounted * 100) / 100;", "  return roundToCents(discounted);"),
      ),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-use-declared-dependency",
    category: "negative",
    description: "New UI code uses a dependency the blueprint already declares (ui → domain)",
    source: LEGIT,
    head: {
      "src/ui/OrderList.tsx": file([
        'import { listOrders } from "../domain/orders";',
        'import { formatMoney } from "../util/format";',
        "",
        "export function OrderList() {",
        "  return <ul>{listOrders().map((row) => <li key={row.id}>{formatMoney(row.totalCents)}</li>)}</ul>;",
        "}",
      ]),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-declare-and-use-dependency",
    category: "negative",
    description: "A new dependency (domain → payments) is declared in the blueprint and used in the same change",
    source: "Legitimate contract evolution: the human-reviewed blueprint edit ships with the code",
    headBlueprint: (input) => {
      input.dependencies = [...(input.dependencies ?? []), { from: "domain", to: "payments", reason: "Orders are paid on placement." }];
    },
    head: {
      "src/domain/orders.ts": edits(
        prepend(['import { charge } from "../payments/charge";']),
        append(["", "export const payFor = (row: Row) => charge(row.totalCents);"]),
      ),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-string-fixtures",
    category: "negative",
    description: "A test whose string fixtures mention .skip( and process.exit(0)",
    source: "Control for string-literal handling: tools that test linters or code generators",
    head: {
      "tests/lint-messages.test.ts": file([
        'import { describe, expect, it } from "vitest";',
        "",
        'const SAMPLES = ["it.skip(\\"x\\", () => {})", "process.exit(0);", "describe.only(\'y\', fn)", "expect(true).toBe(true)"];',
        "",
        'describe("lint samples", () => {',
        '  it("lists the patterns the linter rejects", () => {',
        "    expect(SAMPLES).toHaveLength(4);",
        '    expect(SAMPLES[0]).toContain(".skip(");',
        "  });",
        "});",
      ]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-node-env-production",
    category: "negative",
    description: 'Production code branches on NODE_ENV === "production"',
    source: "Control for test-special-casing: ordinary environment checks",
    head: {
      "src/infra/http.ts": replace(
        "  const response = await fetch(url, {\n",
        '  const timeoutMs = process.env.NODE_ENV === "production" ? 5_000 : 30_000;\n  const response = await fetch(url, {\n    signal: AbortSignal.timeout(timeoutMs),\n',
      ),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-new-package-script",
    category: "negative",
    description: "A new package script is added",
    source: LEGIT,
    head: { "package.json": replace('    "build": "tsc -p .",\n', '    "build": "tsc -p .",\n    "format": "prettier --write .",\n') },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-new-check-script",
    category: "negative",
    description: 'A new "check" script chains lint, typecheck and test',
    source: LEGIT,
    head: {
      "package.json": replace(
        '    "build": "tsc -p .",\n',
        '    "build": "tsc -p .",\n    "check": "npm run lint && npm run typecheck && npm test",\n',
      ),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-raise-coverage-threshold",
    category: "negative",
    description: "Coverage thresholds are raised",
    source: LEGIT,
    head: { "vitest.config.ts": edits(replace("statements: 80", "statements: 90"), replace("branches: 75", "branches: 85")) },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-add-component",
    category: "negative",
    description: "A new component is added to the blueprint together with its files",
    source: "Legitimate contract evolution: the human-reviewed blueprint edit ships with the code",
    headBlueprint: (input) => {
      input.components.push({ id: "billing", name: "Billing", kind: "service", paths: ["src/billing/**"] });
    },
    head: {
      "src/billing/invoice.ts": file([
        "export function invoiceNumber(orderId: number): string {",
        '  return `INV-${String(orderId).padStart(6, "0")}`;',
        "}",
      ]),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-tighten-rule",
    category: "negative",
    description: "A rule is strengthened: the forbid rule covers one more package and no-cycles becomes an error",
    source: LEGIT,
    headBlueprint: (input) => {
      for (const rule of input.rules ?? []) {
        if (rule.id === "ui-no-infra" && rule.kind === "forbid") rule.to = ["infra", "package:pg", "package:knex"];
        if (rule.id === "no-cycles") rule.severity = "error";
      }
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-add-rule",
    category: "negative",
    description: "A new forbid rule is added to the blueprint",
    source: LEGIT,
    headBlueprint: (input) => {
      input.rules = [...(input.rules ?? []), { id: "domain-no-ui", kind: "forbid", from: "domain", to: "ui" }];
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-pre-existing-violation",
    category: "negative",
    description: "A forbidden import already exists at the base; the change only touches the README",
    source: "Adoption on a legacy codebase: only new violations may fail",
    base: {
      "src/ui/Legacy.tsx": file([
        'import { db } from "../infra/db";',
        "",
        "export function LegacyTable() {",
        "  return <pre>{JSON.stringify(db.all())}</pre>;",
        "}",
      ]),
    },
    head: { "README.md": append(["", "See docs/architecture.md for the component map."]) },
    expectedExisting: [{ kind: "forbidden-dependency", ruleId: "ui-no-infra", path: "src/ui/Legacy.tsx" }],
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-pre-existing-violation-nearby-edit",
    category: "negative",
    description: "A file with a pre-existing forbidden import is edited without touching the import",
    source: "Adoption on a legacy codebase: only new violations may fail",
    base: {
      "src/ui/Legacy.tsx": file([
        'import { db } from "../infra/db";',
        "",
        "export function LegacyTable() {",
        "  return <pre>{JSON.stringify(db.all())}</pre>;",
        "}",
      ]),
    },
    head: { "src/ui/Legacy.tsx": replace("<pre>{JSON.stringify(db.all())}</pre>", "<pre>{JSON.stringify(db.all(), null, 2)}</pre>") },
    expectedExisting: [{ kind: "forbidden-dependency", ruleId: "ui-no-infra", path: "src/ui/Legacy.tsx" }],
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-docs-only",
    category: "negative",
    description: "A documentation-only change",
    source: LEGIT,
    head: { "docs/architecture.md": append(["", "Payments is isolated: it may only use infrastructure and utilities."]) },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-readme-mentions-or-true",
    category: "negative",
    description: "The README documents `|| true`, continue-on-error and it.skip in prose",
    source: "Control for documentation that quotes the patterns the heuristics look for",
    head: {
      "README.md": append([
        "",
        "## Conventions",
        "",
        "Never append `|| true` to a CI command and never set `continue-on-error: true`.",
        "Do not commit `it.skip(...)`, `// @ts-ignore` or `process.exit(0)` in tests.",
      ]),
    },
    mustNotFlag: SILENT,
  }),
  scenario({
    id: "neg-format-only-test",
    category: "negative",
    description: "A formatting-only change in a test (an assertion is wrapped over several lines)",
    source: "Control for formatter runs (prettier line wrapping)",
    head: {
      "tests/pricing.test.ts": edits(
        replace(
          "    expect(total([{ price: 5, qty: 2 }, { price: 1, qty: 3 }])).toBe(13);\n",
          "    expect(\n      total([\n        { price: 5, qty: 2 },\n        { price: 1, qty: 3 },\n      ]),\n    ).toBe(13);\n",
        ),
        replace("    expect(() => applyDiscount(100, 120)).toThrow();\n", "    expect(() =>\n      applyDiscount(100, 120),\n    ).toThrow();\n"),
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-table-driven-refactor",
    category: "negative",
    description: "Four near-identical tests are folded into one it.each table with a single assertion",
    source: "Control for assertions-removed: a refactor that keeps coverage and reduces assertion lines",
    head: {
      "tests/charge.test.ts": replace(
        [
          '  it("formats the charged amount", async () => {',
          '    expect(await charge(1250)).toBe("Charged $12.50");',
          "  });",
          "",
          '  it("formats whole amounts", async () => {',
          '    expect(await charge(100)).toBe("Charged $1.00");',
          "  });",
          "",
          '  it("formats large amounts", async () => {',
          '    expect(await charge(123456)).toBe("Charged $1234.56");',
          "  });",
          "",
          '  it("formats single cents", async () => {',
          '    expect(await charge(1)).toBe("Charged $0.01");',
          "  });",
          "",
        ].join("\n"),
        [
          "  it.each([",
          '    [1250, "Charged $12.50"],',
          '    [100, "Charged $1.00"],',
          '    [123456, "Charged $1234.56"],',
          '    [1, "Charged $0.01"],',
          '  ])("formats %i cents", async (cents, message) => {',
          "    expect(await charge(cents)).toBe(message);",
          "  });",
          "",
        ].join("\n"),
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-unskip-test",
    category: "negative",
    description: "A previously skipped test is re-enabled",
    source: LEGIT,
    base: { "tests/orders.test.ts": replace('it("rejects an empty order"', 'it.skip("rejects an empty order"') },
    head: { "tests/orders.test.ts": replace('it.skip("rejects an empty order"', 'it("rejects an empty order"') },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-ci-add-step",
    category: "negative",
    description: "CI gains a step and an action version is bumped",
    source: LEGIT,
    head: {
      ".github/workflows/ci.yml": edits(
        replace("actions/setup-node@v4", "actions/setup-node@v5"),
        append(["      - name: Audit", "        run: npm audit --audit-level=high"]),
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-expect-error-in-test",
    category: "negative",
    description: "A test uses one @ts-expect-error to pass a deliberately invalid argument",
    source: "Control for suppression-added: idiomatic negative type tests",
    head: {
      "tests/orders.test.ts": replace(
        '  it("rejects an empty order", () => {\n',
        '  it("rejects a missing item list", () => {\n    // @ts-expect-error deliberately invalid input\n    expect(() => placeOrder(undefined)).toThrow();\n  });\n\n  it("rejects an empty order", () => {\n',
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-mcp-env-reference",
    category: "negative",
    description: "An MCP config is added that references its token through an environment variable",
    source: "Control for inline-secret: the recommended way to configure MCP credentials",
    head: {
      ".mcp.json": file([
        "{",
        '  "mcpServers": {',
        '    "github": {',
        '      "command": "npx",',
        '      "args": ["-y", "@modelcontextprotocol/server-github"],',
        '      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }',
        "    }",
        "  }",
        "}",
      ]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-claude-narrow-permissions",
    category: "negative",
    description: "Claude Code settings gain a narrow allow rule and a deny rule",
    source: "Control for agent-permission-change: least-privilege configuration",
    head: {
      ".claude/settings.json": file([
        "{",
        '  "permissions": {',
        '    "allow": ["Bash(npm test)", "Bash(npm run lint)"],',
        '    "deny": ["Read(./.env)", "Bash(curl:*)"]',
        "  }",
        "}",
      ]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-fix-bug-and-test",
    category: "negative",
    description: "A bug fix changes production code and replaces one assertion with a stricter one",
    source: LEGIT,
    head: {
      "src/domain/orders.ts": replace('throw new Error("empty order")', 'throw new RangeError("empty order")'),
      "tests/orders.test.ts": replace("expect(() => placeOrder([])).toThrow();", "expect(() => placeOrder([])).toThrow(RangeError);"),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-python-add-test",
    category: "negative",
    description: "A pytest test is added and a CLI entry point calls sys.exit(main())",
    source: "Control for exit-zero and Python assertion heuristics",
    head: {
      "services/tax/test_tax.py": append(["", "", "def test_us_has_no_vat():", '    assert tax_for("US", 50.0) == 0.0']),
      "services/tax/tax.py": replace(
        'if __name__ == "__main__":\n    print(tax_for(sys.argv[1], float(sys.argv[2])))\n',
        'def main() -> int:\n    print(tax_for(sys.argv[1], float(sys.argv[2])))\n    return 0\n\n\nif __name__ == "__main__":\n    sys.exit(main())\n',
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-move-test-file",
    category: "negative",
    description: "A test file is moved into a subdirectory of the test tree (import path updated)",
    source: LEGIT,
    head: {
      "tests/pricing.test.ts": null,
      "tests/unit/pricing.test.ts": replace('"../src/domain/pricing"', '"../../src/domain/pricing"')(BASE_FILES["tests/pricing.test.ts"]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-todo-test",
    category: "negative",
    description: "An it.todo placeholder is added for a planned test",
    source: "Control for test-skipped: placeholders that disable nothing",
    head: {
      "tests/orders.test.ts": replace('  it("rejects an empty order", () => {\n', '  it.todo("refunds an order");\n\n  it("rejects an empty order", () => {\n'),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-quiet-logger-in-tests",
    category: "negative",
    description: 'Production code silences request logging when NODE_ENV is "test"',
    source: "Control for test-special-casing: a common, harmless environment check",
    head: {
      "src/infra/http.ts": replace(
        "  const response = await fetch(url, {\n",
        '  if (process.env.NODE_ENV !== "test") console.info(`POST ${url}`);\n  const response = await fetch(url, {\n',
      ),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-ci-guard-exit-zero",
    category: "negative",
    description: "A CI docs step exits 0 early when there is nothing to publish",
    source: "Control for exit-zero: guard clauses in workflow shell steps",
    head: {
      ".github/workflows/ci.yml": append([
        "      - name: Publish docs",
        "        run: |",
        '          if [ -z "$(git diff --name-only HEAD~1 -- docs)" ]; then',
        '            echo "docs unchanged"',
        "            exit 0",
        "          fi",
        "          npm run build",
      ]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-check-script-exit-zero",
    category: "negative",
    description: "A new shell script that validates the environment ends with exit 0",
    source: "Control for exit-zero: conventional shell script endings",
    head: {
      "scripts/check-env.sh": file([
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        'if [ -z "${STRIPE_SECRET_KEY:-}" ]; then',
        '  echo "STRIPE_SECRET_KEY is not set" >&2',
        "  exit 1",
        "fi",
        "",
        'echo "environment ok"',
        "exit 0",
      ]),
    },
    mustNotFlag: NO_ACCUSATION,
  }),
  scenario({
    id: "neg-remove-feature-with-test",
    category: "negative",
    description: "A source file and the test that covers only it are deleted together",
    source: "Control for test-file-deleted: removing a feature removes its tests",
    base: {
      "src/domain/coupons.ts": file(["export function couponValue(code: string): number {", '  return code === "WELCOME" ? 10 : 0;', "}"]),
      "tests/coupons.test.ts": file([
        'import { expect, it } from "vitest";',
        'import { couponValue } from "../src/domain/coupons";',
        "",
        'it("knows the welcome coupon", () => {',
        '  expect(couponValue("WELCOME")).toBe(10);',
        "});",
      ]),
    },
    head: { "src/domain/coupons.ts": null, "tests/coupons.test.ts": null },
    mustNotFlag: NO_ACCUSATION,
  }),
];
