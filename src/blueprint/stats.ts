import type { Blueprint, Provenance, Verification } from "./schema";

interface Fact {
  provenance?: Provenance;
  verified?: Verification;
}

/**
 * A fact counts as human when a person asserted it (no provenance, or
 * provenance.source === "human") or signed it off. Derived and agent facts
 * count only once verified. This is the number to watch: a blueprint that
 * stays machine-written is just another context file.
 */
export function isHumanFact(fact: Fact): boolean {
  if (fact.verified) return true;
  return !fact.provenance || fact.provenance.source === "human";
}

export function blueprintFacts(blueprint: Blueprint): Fact[] {
  return [
    ...blueprint.components,
    ...blueprint.dependencies,
    ...blueprint.rules,
    ...blueprint.invariants,
    ...blueprint.decisions,
  ];
}

export function humanAuthoredRatio(blueprint: Blueprint | null): number {
  if (!blueprint) return 0;
  const facts = blueprintFacts(blueprint);
  if (!facts.length) return 0;
  const human = facts.filter(isHumanFact).length;
  return Math.round((human / facts.length) * 1000) / 1000;
}

export interface AuthorshipStats {
  total: number;
  human: number;
  derived: number;
  agent: number;
  verified: number;
  componentsWithIntent: number;
  components: number;
  ratio: number;
}

export function authorshipStats(blueprint: Blueprint | null): AuthorshipStats {
  const facts = blueprint ? blueprintFacts(blueprint) : [];
  return {
    total: facts.length,
    human: facts.filter(isHumanFact).length,
    derived: facts.filter((fact) => fact.provenance?.source === "derived" && !fact.verified).length,
    agent: facts.filter((fact) => fact.provenance?.source === "agent" && !fact.verified).length,
    verified: facts.filter((fact) => Boolean(fact.verified)).length,
    componentsWithIntent: blueprint?.components.filter((component) => Boolean(component.intent?.trim())).length ?? 0,
    components: blueprint?.components.length ?? 0,
    ratio: humanAuthoredRatio(blueprint),
  };
}
