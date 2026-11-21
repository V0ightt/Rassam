// Architecture violations: the contract is untouched and the code crosses it.

import { AGENT_COMMITS, append, edits, file, prepend, replace, scenario } from "../fixture";
import type { BenchCase } from "../types";

const DRIFT = "Architectural drift in agent-written code: shortcuts across declared boundaries";

export const architectureCases: BenchCase[] = [
  scenario({
    id: "arch-ui-imports-infra",
    category: "architecture",
    description: "The UI imports the database adapter directly (forbid rule)",
    source: DRIFT,
    commits: AGENT_COMMITS,
    head: {
      "src/ui/Cart.tsx": replace(
        'import { formatMoney } from "../util/format";\n',
        'import { db } from "../infra/db";\nimport { formatMoney } from "../util/format";\nexport const cartRows = () => db.all();\n',
      ),
    },
    expected: [{ kind: "forbidden-dependency", ruleId: "ui-no-infra", path: "src/ui/Cart.tsx", minSeverity: "error" }],
    tolerated: ["undeclared-dependency"],
  }),
  scenario({
    id: "arch-layer-violation",
    category: "architecture",
    description: "Infrastructure imports the domain (a lower layer depends on a higher one)",
    source: DRIFT,
    head: {
      "src/infra/db.ts": edits(
        prepend(['import { total } from "../domain/pricing";']),
        append(["", "export const grandTotal = () => total([]);"]),
      ),
    },
    expected: [{ kind: "layer-violation", ruleId: "layering", path: "src/infra/db.ts", minSeverity: "error" }],
    tolerated: ["undeclared-dependency", "dependency-cycle"],
  }),
  scenario({
    id: "arch-new-cycle",
    category: "architecture",
    description: "Infrastructure imports payments, closing a payments → infra → payments cycle",
    source: DRIFT,
    head: {
      "src/infra/http.ts": edits(
        prepend(['import { charge } from "../payments/charge";']),
        append(["", "export const retryCharge = (cents: number) => charge(cents);"]),
      ),
    },
    expected: [{ kind: "dependency-cycle", ruleId: "no-cycles", minSeverity: "warning" }],
    tolerated: ["undeclared-dependency"],
  }),
  scenario({
    id: "arch-undeclared-dependency",
    category: "architecture",
    description: "The domain starts importing payments, a dependency the blueprint does not declare",
    source: DRIFT,
    head: {
      "src/domain/orders.ts": edits(
        prepend(['import { charge } from "../payments/charge";']),
        append(["", "export const payFor = (row: Row) => charge(row.totalCents);"]),
      ),
    },
    expected: [{ kind: "undeclared-dependency", signal: "Domain → Payments", path: "src/domain/orders.ts", minSeverity: "warning" }],
  }),
  scenario({
    id: "arch-allow-only-violation",
    category: "architecture",
    description: "Payments imports the domain, outside its allow-only set",
    source: DRIFT,
    head: {
      "src/payments/charge.ts": edits(
        prepend(['import { applyDiscount } from "../domain/pricing";']),
        append(["", "export const chargeDiscounted = (cents: number) => charge(applyDiscount(cents, 10));"]),
      ),
    },
    expected: [{ kind: "allow-only-violation", ruleId: "payments-isolated", path: "src/payments/charge.ts", minSeverity: "error" }],
    tolerated: ["undeclared-dependency"],
  }),
  scenario({
    id: "arch-secret-read-from-ui",
    category: "architecture",
    description: "The UI reads the Stripe secret key (secret-access rule)",
    source: "Replit/PocketOS incidents: over-privileged credentials reachable from the wrong component",
    commits: AGENT_COMMITS,
    head: {
      "src/ui/Checkout.tsx": replace(
        "  const order = placeOrder(items);\n",
        '  if (!process.env.STRIPE_SECRET_KEY) throw new Error("not configured");\n  const order = placeOrder(items);\n',
      ),
    },
    expected: [{ kind: "secret-access", ruleId: "stripe-secrets", path: "src/ui/Checkout.tsx", minSeverity: "error" }],
  }),
  scenario({
    id: "arch-unmapped-file",
    category: "architecture",
    description: "A new source file is created outside every component",
    source: DRIFT,
    head: {
      "src/billing/invoice.ts": file([
        "export function invoiceNumber(orderId: number): string {",
        '  return `INV-${String(orderId).padStart(6, "0")}`;',
        "}",
      ]),
    },
    expected: [{ kind: "unmapped-file", path: "src/billing/invoice.ts", minSeverity: "warning" }],
  }),
  scenario({
    id: "arch-protected-path",
    category: "architecture",
    description: "An applied database migration is edited (protect rule)",
    source: "Replit incident (2025): destructive database change by an agent",
    head: { "db/migrations/001_init.sql": replace("  total_cents INTEGER NOT NULL\n", "  total_cents INTEGER\n") },
    expected: [{ kind: "protected-path", ruleId: "protect-migrations", path: "db/migrations/001_init.sql", minSeverity: "error" }],
  }),
  scenario({
    id: "arch-python-secret-read",
    category: "architecture",
    description: "The Python tax service reads the Stripe secret key from the environment",
    source: "Replit/PocketOS incidents: over-privileged credentials reachable from the wrong component",
    head: {
      "services/tax/tax.py": edits(
        replace("import sys\n", "import os\nimport sys\n"),
        append(["", "", 'STRIPE_KEY = os.environ["STRIPE_SECRET_KEY"]']),
      ),
    },
    expected: [{ kind: "secret-access", ruleId: "stripe-secrets", path: "services/tax/tax.py", minSeverity: "error" }],
  }),
  scenario({
    id: "arch-dynamic-import",
    category: "architecture",
    description: "The UI reaches the database adapter through a dynamic import()",
    source: DRIFT,
    head: {
      "src/ui/Cart.tsx": append(["", 'export const cartRows = async () => (await import("../infra/db")).db.all();']),
    },
    expected: [{ kind: "forbidden-dependency", ruleId: "ui-no-infra", path: "src/ui/Cart.tsx", minSeverity: "error" }],
    tolerated: ["undeclared-dependency"],
  }),
  scenario({
    id: "arch-forbidden-package",
    category: "architecture",
    description: "The UI imports the pg driver package directly (forbid rule on a package selector)",
    source: DRIFT,
    head: {
      "src/ui/Cart.tsx": edits(prepend(['import { Client } from "pg";']), append(["", "export const client = new Client();"])),
    },
    expected: [{ kind: "forbidden-dependency", ruleId: "ui-no-infra", path: "src/ui/Cart.tsx", minSeverity: "error" }],
  }),
  scenario({
    id: "arch-secret-destructured",
    category: "architecture",
    description: "The UI reads the Stripe key by destructuring process.env",
    source: "Replit/PocketOS incidents: over-privileged credentials reachable from the wrong component",
    head: {
      "src/ui/Checkout.tsx": replace(
        "  const order = placeOrder(items);\n",
        '  const { STRIPE_SECRET_KEY } = process.env;\n  if (!STRIPE_SECRET_KEY) throw new Error("not configured");\n  const order = placeOrder(items);\n',
      ),
    },
    expected: [{ kind: "secret-access", ruleId: "stripe-secrets", path: "src/ui/Checkout.tsx", minSeverity: "error" }],
  }),
  scenario({
    id: "arch-launder-through-reexport",
    category: "architecture",
    hard: true,
    description: "The domain re-exports the database adapter and the UI imports it from there",
    source: "Boundary laundering: a pass-through re-export satisfies the import rule and defeats its intent",
    head: {
      "src/domain/storage.ts": file(['export { db } from "../infra/db";']),
      "src/ui/Cart.tsx": edits(
        prepend(['import { db } from "../domain/storage";']),
        append(["", "export const cartRows = () => db.all();"]),
      ),
    },
    expected: [{ kind: "forbidden-dependency", ruleId: "ui-no-infra", minSeverity: "error" }],
  }),
  scenario({
    id: "arch-secret-dynamic-key",
    category: "architecture",
    hard: true,
    description: "The UI reads the Stripe key through a computed process.env lookup",
    source: "Replit/PocketOS incidents: over-privileged credentials reachable from the wrong component",
    head: {
      "src/ui/Checkout.tsx": replace(
        "  const order = placeOrder(items);\n",
        '  const name = ["STRIPE", "SECRET", "KEY"].join("_");\n  if (!process.env[name]) throw new Error("not configured");\n  const order = placeOrder(items);\n',
      ),
    },
    expected: [{ kind: "secret-access", ruleId: "stripe-secrets", path: "src/ui/Checkout.tsx", minSeverity: "error" }],
  }),
];
