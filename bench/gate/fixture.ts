// The shared fixture: a small TypeScript shop (ui, domain, infra, payments,
// util, tests) with a Python tax service and a Go shipping service, plus the
// human-owned blueprint every case is judged by.

import {
  BLUEPRINT_PATH,
  blueprintSchema,
  serializeBlueprint,
  type Blueprint,
  type BlueprintInput,
  type SourceFile,
} from "../../src/blueprint/index";
import type { BenchCase } from "./types";

function text(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

const SNAPSHOT_NAMES = ["Cart", "Checkout", "Header", "Footer", "Receipt"] as const;

export function snapshotPath(name: string): string {
  return `tests/__snapshots__/${name}.test.tsx.snap`;
}

export const SNAPSHOT_PATHS: readonly string[] = SNAPSHOT_NAMES.map(snapshotPath);

export const BASE_FILES: Readonly<Record<string, string>> = {
  "package.json": text([
    "{",
    '  "name": "shop",',
    '  "private": true,',
    '  "scripts": {',
    '    "build": "tsc -p .",',
    '    "lint": "eslint .",',
    '    "typecheck": "tsc --noEmit",',
    '    "test": "vitest run --coverage"',
    "  },",
    '  "devDependencies": {',
    '    "typescript": "^5.6.0",',
    '    "vitest": "^3.0.0"',
    "  }",
    "}",
  ]),
  "tsconfig.json": text(["{", '  "compilerOptions": { "strict": true, "target": "ES2022", "module": "ESNext" }', "}"]),
  "vitest.config.ts": text([
    'import { defineConfig } from "vitest/config";',
    "",
    "export default defineConfig({",
    "  test: {",
    '    include: ["tests/**/*.test.ts"],',
    '    setupFiles: ["./tests/setup.ts"],',
    "    coverage: {",
    "      thresholds: {",
    "        statements: 80,",
    "        branches: 75,",
    "        functions: 80,",
    "        lines: 80,",
    "      },",
    "    },",
    "  },",
    "});",
  ]),
  ".github/workflows/ci.yml": text([
    "name: CI",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches: [main]",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    "      - run: npm ci",
    "      - name: Lint",
    "        run: npm run lint",
    "      - name: Typecheck",
    "        run: npm run typecheck",
    "      - name: Test",
    "        run: npm test",
    "      - name: Build",
    "        run: npm run build",
  ]),
  "README.md": text([
    "# Shop",
    "",
    "A small storefront used as a benchmark fixture.",
    "",
    "## Development",
    "",
    "Run `npm test` before opening a pull request.",
  ]),
  "docs/architecture.md": text([
    "# Architecture",
    "",
    "UI talks to the domain. The domain talks to infrastructure.",
    "Only the payments component may read Stripe credentials.",
  ]),
  "db/migrations/001_init.sql": text([
    "CREATE TABLE orders (",
    "  id SERIAL PRIMARY KEY,",
    "  total_cents INTEGER NOT NULL",
    ");",
  ]),
  "src/util/format.ts": text([
    "export function formatMoney(cents: number): string {",
    "  return `$${(cents / 100).toFixed(2)}`;",
    "}",
  ]),
  "src/infra/db.ts": text([
    "export interface Row {",
    "  id: number;",
    "  totalCents: number;",
    "}",
    "",
    "const rows: Row[] = [];",
    "",
    "export const db = {",
    "  insert(row: Row): void {",
    "    rows.push(row);",
    "  },",
    "  all(): Row[] {",
    "    return [...rows];",
    "  },",
    "};",
  ]),
  "src/infra/http.ts": text([
    "export async function postJson(url: string, body: unknown): Promise<unknown> {",
    "  const response = await fetch(url, {",
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    "    body: JSON.stringify(body),",
    "  });",
    "  if (!response.ok) throw new Error(`HTTP ${response.status}`);",
    "  return response.json();",
    "}",
  ]),
  "src/domain/pricing.ts": text([
    "export interface LineItem {",
    "  price: number;",
    "  qty: number;",
    "}",
    "",
    "export function total(items: LineItem[]): number {",
    "  let sum = 0;",
    "  for (const item of items) sum += item.price * item.qty;",
    "  return sum;",
    "}",
    "",
    "export function applyDiscount(amount: number, percent: number): number {",
    '  if (percent < 0 || percent > 100) throw new RangeError("percent out of range");',
    "  const discounted = amount * (1 - percent / 100);",
    "  return Math.round(discounted * 100) / 100;",
    "}",
  ]),
  "src/domain/orders.ts": text([
    'import { db, type Row } from "../infra/db";',
    'import { total, type LineItem } from "./pricing";',
    "",
    "let nextId = 1;",
    "",
    "export function placeOrder(items: LineItem[]): Row {",
    '  if (items.length === 0) throw new Error("empty order");',
    "  const row: Row = { id: nextId, totalCents: Math.round(total(items) * 100) };",
    "  nextId += 1;",
    "  db.insert(row);",
    "  return row;",
    "}",
    "",
    "export function listOrders(): Row[] {",
    "  return db.all();",
    "}",
  ]),
  "src/payments/stripe.ts": text([
    'import { postJson } from "../infra/http";',
    "",
    "export async function createCharge(amountCents: number): Promise<unknown> {",
    "  const key = process.env.STRIPE_SECRET_KEY;",
    '  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");',
    '  return postJson("https://api.stripe.example/v1/charges", { amount: amountCents, key });',
    "}",
  ]),
  "src/payments/charge.ts": text([
    'import { formatMoney } from "../util/format";',
    'import { createCharge } from "./stripe";',
    "",
    "export async function charge(amountCents: number): Promise<string> {",
    '  if (amountCents <= 0) throw new RangeError("amount must be positive");',
    "  await createCharge(amountCents);",
    "  return `Charged ${formatMoney(amountCents)}`;",
    "}",
  ]),
  "src/ui/Cart.tsx": text([
    'import { total, type LineItem } from "../domain/pricing";',
    'import { formatMoney } from "../util/format";',
    "",
    "export function Cart({ items }: { items: LineItem[] }) {",
    "  return <p>Total: {formatMoney(Math.round(total(items) * 100))}</p>;",
    "}",
  ]),
  "src/ui/Checkout.tsx": text([
    'import { placeOrder } from "../domain/orders";',
    'import type { LineItem } from "../domain/pricing";',
    'import { charge } from "../payments/charge";',
    "",
    "export async function checkout(items: LineItem[]): Promise<string> {",
    "  const order = placeOrder(items);",
    "  return charge(order.totalCents);",
    "}",
  ]),
  "tests/setup.ts": text([
    'import { afterEach, vi } from "vitest";',
    "",
    "afterEach(() => {",
    "  vi.restoreAllMocks();",
    "});",
  ]),
  "tests/pricing.test.ts": text([
    'import { describe, expect, it } from "vitest";',
    'import { applyDiscount, total } from "../src/domain/pricing";',
    "",
    'describe("pricing", () => {',
    '  it("sums line items", () => {',
    "    expect(total([{ price: 5, qty: 2 }, { price: 1, qty: 3 }])).toBe(13);",
    "  });",
    "",
    '  it("applies a percentage discount", () => {',
    "    const discounted = applyDiscount(200, 10);",
    "    expect(discounted).toBe(180);",
    "    expect(applyDiscount(0, 10)).toBe(0);",
    "    expect(() => applyDiscount(100, 120)).toThrow();",
    "  });",
    "",
    '  it("rounds to cents", () => {',
    "    expect(applyDiscount(9.99, 33)).toBeCloseTo(6.69, 2);",
    "  });",
    "});",
  ]),
  "tests/orders.test.ts": text([
    'import { describe, expect, it } from "vitest";',
    'import { listOrders, placeOrder } from "../src/domain/orders";',
    "",
    'describe("orders", () => {',
    '  it("stores an order with its total in cents", () => {',
    "    const order = placeOrder([{ price: 2.5, qty: 2 }]);",
    "    expect(order.totalCents).toBe(500);",
    "    expect(listOrders()).toContainEqual(order);",
    "  });",
    "",
    '  it("rejects an empty order", () => {',
    "    expect(() => placeOrder([])).toThrow();",
    "  });",
    "});",
  ]),
  "tests/charge.test.ts": text([
    'import { describe, expect, it, vi } from "vitest";',
    'import { charge } from "../src/payments/charge";',
    "",
    'vi.mock("../src/payments/stripe", () => ({ createCharge: vi.fn(async () => ({ ok: true })) }));',
    "",
    'describe("charge", () => {',
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
    '  it("rejects zero", async () => {',
    "    await expect(charge(0)).rejects.toThrow(RangeError);",
    "  });",
    "});",
  ]),
  ...Object.fromEntries(
    SNAPSHOT_NAMES.map((name) => [
      snapshotPath(name),
      text([
        "// Vitest Snapshot v1",
        "",
        `exports[\`${name} renders 1\`] = \``,
        `<section data-component="${name}">`,
        "  <p>Total: $13.00</p>",
        "</section>",
        "`;",
      ]),
    ]),
  ),
  "services/tax/tax.py": text([
    "import sys",
    "",
    'RATES = {"DE": 0.19, "FR": 0.20, "US": 0.0}',
    "",
    "",
    "def tax_for(country: str, amount: float) -> float:",
    "    rate = RATES.get(country)",
    "    if rate is None:",
    '        raise ValueError(f"unknown country {country}")',
    "    return round(amount * rate, 2)",
    "",
    "",
    'if __name__ == "__main__":',
    "    print(tax_for(sys.argv[1], float(sys.argv[2])))",
  ]),
  "services/tax/conftest.py": text([
    "import pytest",
    "",
    "",
    "@pytest.fixture",
    "def basket():",
    '    return {"country": "DE", "amount": 100.0}',
  ]),
  "services/tax/test_tax.py": text([
    "import pytest",
    "",
    "from tax import tax_for",
    "",
    "",
    "def test_german_vat(basket):",
    '    assert tax_for(basket["country"], basket["amount"]) == 19.0',
    "",
    "",
    "def test_unknown_country():",
    "    with pytest.raises(ValueError):",
    '        tax_for("XX", 1.0)',
  ]),
  "services/ship/go.mod": text(["module example.com/shop/ship", "", "go 1.22"]),
  "services/ship/ship.go": text([
    "package ship",
    "",
    "// Cost returns the shipping cost in cents for a weight in grams.",
    "func Cost(grams int) int {",
    "\tif grams <= 0 {",
    "\t\treturn 0",
    "\t}",
    "\treturn 499 + (grams/1000)*150",
    "}",
  ]),
  "services/ship/ship_test.go": text([
    "package ship",
    "",
    'import "testing"',
    "",
    "func TestCost(t *testing.T) {",
    "\tif got := Cost(2500); got != 799 {",
    '\t\tt.Fatalf("Cost(2500) = %d, want 799", got)',
    "\t}",
    "}",
    "",
    "func TestCostZero(t *testing.T) {",
    "\tif got := Cost(0); got != 0 {",
    '\t\tt.Errorf("Cost(0) = %d, want 0", got)',
    "\t}",
    "}",
  ]),
};

export const BASE_BLUEPRINT_INPUT: BlueprintInput = {
  version: "0.1",
  system: { name: "Shop", description: "Benchmark fixture: a small storefront." },
  policy: {
    undeclaredDependencies: "warning",
    unmappedFiles: "warning",
    includeTypeOnly: true,
    tripwires: { defaults: true },
    verificationHeuristics: true,
    ignore: [],
  },
  components: [
    { id: "ui", name: "UI", kind: "component", paths: ["src/ui/**"], provenance: { source: "human" } },
    { id: "domain", name: "Domain", kind: "service", paths: ["src/domain/**"], provenance: { source: "human" } },
    { id: "infra", name: "Infrastructure", kind: "adapter", paths: ["src/infra/**"], provenance: { source: "human" } },
    { id: "payments", name: "Payments", kind: "service", paths: ["src/payments/**"], provenance: { source: "human" } },
    { id: "util", name: "Utilities", kind: "library", paths: ["src/util/**"], public: true },
    { id: "tests", name: "Tests", kind: "test", paths: ["tests/**"] },
    { id: "tooling", name: "Tooling", kind: "config", paths: ["vitest.config.ts"] },
    { id: "tax", name: "Tax service", kind: "service", paths: ["services/tax/**"] },
    { id: "ship", name: "Shipping service", kind: "service", paths: ["services/ship/**"] },
  ],
  dependencies: [
    { from: "ui", to: "domain" },
    { from: "ui", to: "payments" },
    { from: "domain", to: "infra" },
    { from: "payments", to: "infra" },
  ],
  rules: [
    {
      id: "ui-no-infra",
      kind: "forbid",
      from: "ui",
      to: ["infra", "package:pg"],
      reason: "The UI goes through the domain; it never touches storage or the network directly.",
    },
    { id: "layering", kind: "layers", layers: ["ui", "domain", "infra"] },
    {
      id: "payments-isolated",
      kind: "allow-only",
      from: "payments",
      to: ["infra", "util"],
      reason: "Payments stays small and auditable.",
    },
    { id: "no-cycles", kind: "no-cycles" },
    {
      id: "stripe-secrets",
      kind: "secret-access",
      secrets: ["STRIPE_*"],
      allow: "payments",
      reason: "Only payments may hold Stripe credentials.",
    },
    {
      id: "protect-migrations",
      kind: "protect",
      severity: "error",
      paths: ["db/migrations/**"],
      reason: "Applied migrations are immutable.",
    },
  ],
};

export const BASE_BLUEPRINT: Blueprint = blueprintSchema.parse(BASE_BLUEPRINT_INPUT);

// ── Scenario builder ──────────────────────────────────────────

export type FileEdit = string | null | ((content: string) => string);
export type Patch = Record<string, FileEdit>;
export type BlueprintEdit = (input: BlueprintInput) => void;

/** Replace exactly one occurrence; throws when the anchor is missing so a stale case fails loudly. */
export function replace(from: string, to: string): (content: string) => string {
  return (content) => {
    const first = content.indexOf(from);
    if (first < 0) throw new Error(`replace(): anchor not found: ${JSON.stringify(from)}`);
    if (content.indexOf(from, first + from.length) >= 0) throw new Error(`replace(): anchor is ambiguous: ${JSON.stringify(from)}`);
    return content.slice(0, first) + to + content.slice(first + from.length);
  };
}

/** Apply several edits in order. */
export function edits(...steps: Array<(content: string) => string>): (content: string) => string {
  return (content) => steps.reduce((current, step) => step(current), content);
}

export function append(lines: string[]): (content: string) => string {
  return (content) => content + text(lines);
}

export function prepend(lines: string[]): (content: string) => string {
  return (content) => text(lines) + content;
}

/** A whole file from lines (with a trailing newline). */
export function file(lines: string[]): string {
  return text(lines);
}

function applyPatch(files: Map<string, string>, patch: Patch | undefined, caseId: string): void {
  for (const [path, edit] of Object.entries(patch ?? {})) {
    if (edit === null) {
      if (!files.has(path)) throw new Error(`${caseId}: cannot delete missing file ${path}`);
      files.delete(path);
    } else if (typeof edit === "string") {
      files.set(path, edit);
    } else {
      const current = files.get(path);
      if (current === undefined) throw new Error(`${caseId}: cannot edit missing file ${path}`);
      try {
        files.set(path, edit(current));
      } catch (error) {
        throw new Error(`${caseId}: ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

function toSourceFiles(files: Map<string, string>, blueprint: Blueprint | null): SourceFile[] {
  const all = new Map(files);
  if (blueprint) all.set(BLUEPRINT_PATH, serializeBlueprint(blueprint));
  return [...all.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, content]) => ({ path, content, size: content.length }));
}

export interface ScenarioSpec extends Omit<BenchCase, "baseFiles" | "headFiles" | "baseBlueprint" | "headBlueprint" | "expected"> {
  expected?: BenchCase["expected"];
  /** Edits applied to the shared fixture to form this case's base snapshot. */
  base?: Patch;
  /** Edits applied to the case's base snapshot to form the head snapshot: the change under test. */
  head?: Patch;
  /** Edits applied to the shared blueprint to form this case's base contract. */
  baseBlueprint?: BlueprintEdit;
  /** Edits applied to the case's base contract; `null` deletes the blueprint. */
  headBlueprint?: BlueprintEdit | null;
}

/**
 * Build a self-contained case from the shared fixture. The blueprint file is
 * written into both snapshots so a contract edit also shows up in the diff.
 */
export function scenario(spec: ScenarioSpec): BenchCase {
  const { base, head, baseBlueprint: baseEdit, headBlueprint: headEdit, expected, ...rest } = spec;

  const baseInput = structuredClone(BASE_BLUEPRINT_INPUT);
  baseEdit?.(baseInput);
  const baseBlueprint = blueprintSchema.parse(baseInput);

  let headBlueprint: Blueprint | null = baseBlueprint;
  if (headEdit === null) {
    headBlueprint = null;
  } else if (headEdit) {
    const headInput = structuredClone(baseInput);
    headEdit(headInput);
    headBlueprint = blueprintSchema.parse(headInput);
  }

  const baseMap = new Map(Object.entries(BASE_FILES));
  applyPatch(baseMap, base, spec.id);
  const headMap = new Map(baseMap);
  applyPatch(headMap, head, spec.id);

  return {
    ...rest,
    expected: expected ?? [],
    baseFiles: toSourceFiles(baseMap, baseBlueprint),
    headFiles: toSourceFiles(headMap, headBlueprint),
    baseBlueprint,
    headBlueprint,
  };
}

/** Commit metadata of an agent-authored change (affects the attention score only). */
export const AGENT_COMMITS: NonNullable<BenchCase["commits"]> = [
  {
    sha: "0f3c2d1a9b8e7f605142333241506f7e8d9c0b1a",
    authorName: "dev",
    authorEmail: "dev@example.com",
    message: "Make the build green\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
  },
];

/** Deterministic pseudo-random alphanumerics: fake credentials are built at runtime, never stored. */
export function pseudoRandomToken(length: number, seed = 0x5eed): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let state = seed >>> 0;
  let out = "";
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += alphabet[(state >>> 8) % alphabet.length];
  }
  return out;
}
