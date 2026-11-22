import { blueprintSchema, type Blueprint, type Verification } from "./schema";

export type VerifiableKind = "component" | "rule" | "invariant" | "dependency";

/**
 * Record a human sign-off on one blueprint fact. Dependencies are addressed
 * as "from->to". Returns a new blueprint; the input is not mutated.
 */
export function stampVerification(
  blueprint: Blueprint,
  targetId: string,
  verification: Verification,
): { blueprint: Blueprint; target: string; kind: VerifiableKind } {
  const next = blueprintSchema.parse(JSON.parse(JSON.stringify(blueprint)));
  const component = next.components.find((item) => item.id === targetId);
  if (component) {
    component.verified = verification;
    return { blueprint: next, target: component.name, kind: "component" };
  }
  const rule = next.rules.find((item) => item.id === targetId);
  if (rule) {
    rule.verified = verification;
    return { blueprint: next, target: rule.id, kind: "rule" };
  }
  const invariant = next.invariants.find((item) => item.id === targetId);
  if (invariant) {
    invariant.verified = verification;
    return { blueprint: next, target: invariant.statement, kind: "invariant" };
  }
  const arrow = targetId.indexOf("->");
  if (arrow > 0) {
    const from = targetId.slice(0, arrow).trim();
    const to = targetId.slice(arrow + 2).trim();
    const dependency = next.dependencies.find((item) => item.from === from && item.to === to);
    if (dependency) {
      dependency.verified = verification;
      return { blueprint: next, target: `${from} → ${to}`, kind: "dependency" };
    }
  }
  throw new Error(`No component, rule, invariant or dependency (from->to) with id "${targetId}" exists in the blueprint.`);
}

/** Accept derived/agent facts as human-owned: verify everything that is not yet verified. */
export function verifiedIds(blueprint: Blueprint): string[] {
  return [
    ...blueprint.components.filter((item) => item.verified).map((item) => item.id),
    ...blueprint.rules.filter((item) => item.verified).map((item) => item.id),
    ...blueprint.invariants.filter((item) => item.verified).map((item) => item.id),
    ...blueprint.dependencies.filter((item) => item.verified).map((item) => `${item.from}->${item.to}`),
  ];
}
