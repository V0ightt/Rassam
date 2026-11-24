import { describe, expect, it } from "vitest";

import { runCheck } from "./check";
import { WEAKENING_APPROVED } from "./diff";
import { BLUEPRINT_PATH, BLUEPRINT_SCHEMA_URL, blueprintSchema, serializeBlueprint, type Blueprint, type BlueprintInput } from "./schema";
import type { ChangedFile, Finding, SourceFile } from "./types";

const files: SourceFile[] = [
  { path: "src/domain/pricing.ts", content: 'import { db } from "../infra/db";\nexport const total = () => db.length;' },
  { path: "src/infra/db.ts", content: "export const db: number[] = [];" },
  { path: "src/ui/Cart.tsx", content: 'import { db } from "../infra/db";\nexport const Cart = () => db;' },
  { path: "tests/pricing.test.ts", content: "it('totals', () => expect(total()).toBe(0));" },
  { path: "tests/setup.ts", content: "export {};" },
];

const input: BlueprintInput = {
  version: "0.1",
  system: { name: "Shop" },
  components: [
    { id: "ui", name: "UI", paths: ["src/ui/**"] },
    { id: "domain", name: "Domain", paths: ["src/domain/**"] },
    { id: "infra", name: "Infra", paths: ["src/infra/**"] },
    { id: "tests", name: "Tests", kind: "test", paths: ["tests/**"] },
  ],
  dependencies: [{ from: "domain", to: "infra" }],
  rules: [{ id: "ui-no-infra", kind: "forbid", from: "ui", to: "infra" }],
};

function blueprintWith(patch: (draft: BlueprintInput) => void = () => {}): Blueprint {
  const draft = structuredClone(input);
  patch(draft);
  return blueprintSchema.parse(draft);
}

const skipped: ChangedFile = {
  path: "tests/pricing.test.ts",
  status: "modified",
  added: [{ line: 1, text: "it.skip('totals', () => expect(total()).toBe(0));" }],
  removed: [{ line: 1, text: "it('totals', () => expect(total()).toBe(0));" }],
};
const exitZero: ChangedFile = { path: "tests/setup.ts", status: "modified", added: [{ line: 2, text: "process.exit(0);" }], removed: [] };
const ciLoosened: ChangedFile = {
  path: ".github/workflows/ci.yml",
  status: "modified",
  added: [{ line: 9, text: "        continue-on-error: true" }],
  removed: [],
};

function weakened(report: ReturnType<typeof runCheck>, signal: string): Finding {
  const found = report.findings.find((finding) => finding.kind === "verification-weakened" && finding.title.includes(`(${signal})`));
  if (!found) throw new Error(`no ${signal} finding`);
  return found;
}

function check(blueprint: Blueprint, changes: ChangedFile[], approved = false) {
  return runCheck({ files, blueprint, baseBlueprint: blueprint, changes, baseFiles: [], approved, now: "2026-11-24T00:00:00.000Z" });
}

describe("policy.verificationWeakening", () => {
  it("defaults to require-approval", () => {
    expect(blueprintWith().policy.verificationWeakening).toBe("require-approval");
    expect(serializeBlueprint(blueprintWith())).toContain('"verificationWeakening": "require-approval"');
  });

  it("makes strong signals errors that say a human must apply the approval label", () => {
    const report = check(blueprintWith(), [skipped, ciLoosened]);
    const skip = weakened(report, "test-skipped");
    expect(skip).toMatchObject({ severity: "error", isNew: true });
    expect(skip.message).toMatch(/^Test skipped or disabled: .+\. This weakens the checks agents are graded by, so a human must approve it: apply the approval label \(rassam:approved by default\), or restore the check\.$/);
    // Weak signals stay warnings, and the tests tripwire stays a warning.
    expect(weakened(report, "ci-weakened").severity).toBe("warning");
    expect(report.findings.find((finding) => finding.kind === "protected-path")?.severity).toBe("warning");
  });

  it("downgrades strong signals to info once a human approves", () => {
    const report = check(blueprintWith(), [skipped, exitZero], true);
    for (const signal of ["test-skipped", "exit-zero"]) {
      const finding = weakened(report, signal);
      expect(finding.severity).toBe("info");
      expect(finding.message.endsWith(WEAKENING_APPROVED)).toBe(true);
    }
  });

  it("keeps today's warnings under warn; a forced zero exit stays an error that approval clears", () => {
    const warn = blueprintWith((draft) => {
      draft.policy = { verificationWeakening: "warn" };
    });
    const report = check(warn, [skipped, exitZero]);
    expect(weakened(report, "test-skipped")).toMatchObject({ severity: "warning", message: expect.not.stringContaining("approval") });
    expect(weakened(report, "exit-zero").severity).toBe("error");
    expect(weakened(check(warn, [skipped, exitZero], true), "exit-zero").severity).toBe("info");
    expect(weakened(check(warn, [skipped], true), "test-skipped").severity).toBe("warning");
  });

  it("keeps fingerprints independent of the policy and of approval", () => {
    const warn = blueprintWith((draft) => {
      draft.policy = { verificationWeakening: "warn" };
    });
    const ids = [check(blueprintWith(), [skipped]), check(blueprintWith(), [skipped], true), check(warn, [skipped])]
      .map((report) => weakened(report, "test-skipped").id);
    expect(new Set(ids).size).toBe(1);
  });

  it("judges by the base policy: lowering it in the change is itself a weakening", () => {
    const head = blueprintWith((draft) => {
      draft.policy = { verificationWeakening: "warn" };
    });
    const report = runCheck({ files, blueprint: head, baseBlueprint: blueprintWith(), changes: [skipped], baseFiles: [] });
    expect(weakened(report, "test-skipped").severity).toBe("error");
    const contract = report.findings.find((finding) => finding.kind === "contract-weakened");
    expect(contract?.title).toContain("verificationWeakening");
    expect(contract?.severity).toBe("error");
  });
});

describe("CheckInput.preExisting", () => {
  const blueprint = blueprintWith();

  it("reports a freshly drafted blueprint's rule and policy violations as pre-existing", () => {
    const fresh = runCheck({ files, blueprint });
    const drafted = runCheck({ files, blueprint, preExisting: true });
    const violation = drafted.findings.find((finding) => finding.kind === "forbidden-dependency");
    expect(violation).toMatchObject({ isNew: false });
    expect(violation?.message).toMatch(/This existed before the contract did: the blueprint was drafted from this code\.$/);
    expect(violation?.id).toBe(fresh.findings.find((finding) => finding.kind === "forbidden-dependency")?.id);
    expect(drafted.findings.filter((finding) => finding.kind !== "inline-secret").every((finding) => !finding.isNew)).toBe(true);
    expect(drafted.summary.newFindings).toBe(0);
    expect(fresh.findings.find((finding) => finding.kind === "forbidden-dependency")?.isNew).toBe(true);
  });

  it("leaves reach and invalid-blueprint findings new", () => {
    // Assembled at runtime so no token-shaped literal lives in the repository.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const token = `ghp_${Array.from({ length: 36 }, (_, index) => alphabet[(index * 37 + 11) % alphabet.length]).join("")}`;
    const withSecret = [...files, { path: ".mcp.json", content: JSON.stringify({ mcpServers: { gh: { command: "x", env: { GITHUB_TOKEN: token } } } }) }];
    const drafted = runCheck({ files: withSecret, blueprint, preExisting: true });
    expect(drafted.findings.find((finding) => finding.kind === "inline-secret")?.isNew).toBe(true);
    const invalid = runCheck({ files, blueprint: null, blueprintIssues: [{ path: "components", message: "Required" }], preExisting: true });
    expect(invalid.findings.find((finding) => finding.kind === "invalid-blueprint")?.isNew).toBe(true);
  });

  it("is ignored in diff mode", () => {
    const change: ChangedFile = { path: "src/ui/Cart.tsx", status: "added", added: [{ line: 1, text: 'import { db } from "../infra/db";' }], removed: [] };
    const report = runCheck({ files, blueprint, baseBlueprint: blueprint, changes: [change], baseFiles: [], preExisting: true });
    const violation = report.findings.find((finding) => finding.kind === "forbidden-dependency");
    expect(violation?.isNew).toBe(true);
    expect(violation?.message).not.toContain("existed before the contract");
  });
});

describe("blueprint edits and the scope of a change", () => {
  // A component that claims the blueprint file itself, with an invariant and a sign-off.
  const owned = (patch: (draft: BlueprintInput) => void = () => {}) => blueprintWith((draft) => {
    draft.components.push({
      id: "contract",
      name: "Contract",
      kind: "config",
      paths: [".rassam/**"],
      verified: { by: "dana", at: "2026-11-01" },
    });
    draft.invariants = [{ id: "contract-valid", statement: "The contract stays valid", components: ["contract"], check: { run: "rassam check" } }];
    patch(draft);
  });
  const blueprintFiles = (blueprint: Blueprint): SourceFile[] => [...files, { path: BLUEPRINT_PATH, content: serializeBlueprint(blueprint) }];
  const edit: ChangedFile = {
    path: BLUEPRINT_PATH,
    status: "modified",
    added: [{ line: 2, text: `  "$schema": "${BLUEPRINT_SCHEMA_URL}",` }],
    removed: [{ line: 2, text: '  "$schema": "https://rassam.dev/schema/blueprint-0.1.json",' }],
  };
  const notices = (report: ReturnType<typeof runCheck>) => report.findings
    .filter((finding) => finding.kind === "invariant-at-risk" || finding.kind === "stale-verification")
    .map((finding) => finding.kind)
    .sort();

  it("puts no invariant or sign-off in scope when only $schema changed", () => {
    const base = owned((draft) => {
      draft.$schema = "https://rassam.dev/schema/blueprint-0.1.json";
    });
    const head = owned((draft) => {
      draft.$schema = BLUEPRINT_SCHEMA_URL;
    });
    const report = runCheck({ files: blueprintFiles(head), blueprint: head, baseBlueprint: base, changes: [edit], baseFiles: [] });
    expect(report.contractChanges).toEqual([]);
    expect(report.findings.filter((finding) => finding.kind === "invariant-at-risk")).toEqual([]);
    expect(notices(report)).toEqual([]);
  });

  it("keeps today's notices for a semantic edit of a blueprint a component owns", () => {
    const base = owned();
    const head = owned((draft) => {
      draft.rules = [...(draft.rules ?? []), { id: "domain-no-ui", kind: "forbid", from: "domain", to: "ui" }];
    });
    const report = runCheck({ files: blueprintFiles(head), blueprint: head, baseBlueprint: base, changes: [edit], baseFiles: [] });
    expect(report.contractChanges?.length).toBeGreaterThan(0);
    expect(notices(report)).toEqual(["invariant-at-risk", "stale-verification"]);
  });

  it("still puts the invariant in scope when code it covers changes alongside a $schema edit", () => {
    const base = owned((draft) => {
      draft.$schema = "https://rassam.dev/schema/blueprint-0.1.json";
    });
    const head = owned();
    const report = runCheck({
      files: blueprintFiles(head),
      blueprint: head,
      baseBlueprint: base,
      changes: [edit, { path: ".rassam/layout.json", status: "modified", added: [{ line: 1, text: "{}" }], removed: [] }],
      baseFiles: [],
    });
    expect(notices(report)).toEqual(["invariant-at-risk", "stale-verification"]);
  });
});
