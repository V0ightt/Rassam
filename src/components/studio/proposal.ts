// Pure helpers behind the proposal preview: what a staged change touches and
// how it moves the check.

import type { Blueprint, CheckReport } from '@/blueprint';
import type { CanvasChanges } from '@/components/blueprint/BlueprintCanvas';
import type { BlueprintProposal } from '@/components/blueprint/session';

export interface FindingsChange {
  fixes: number;
  introduces: number;
  /** Findings in the preview. */
  remaining: number;
}

/** How the check would move if the proposal were applied. Null when the preview could not be checked. */
export function findingsChange(current: CheckReport | null, preview: CheckReport | null): FindingsChange | null {
  if (!preview) return null;
  const before = new Set((current?.findings ?? []).map((finding) => finding.id));
  const after = new Set(preview.findings.map((finding) => finding.id));
  let fixes = 0;
  let introduces = 0;
  for (const id of before) if (!after.has(id)) fixes += 1;
  for (const id of after) if (!before.has(id)) introduces += 1;
  return { fixes, introduces, remaining: after.size };
}

export function describeFindingsChange(change: FindingsChange | null): string {
  if (!change) return 'The preview could not be checked.';
  if (!change.fixes && !change.introduces) return 'No change to the findings.';
  const parts: string[] = [];
  if (change.fixes) parts.push(`fixes ${change.fixes}`);
  if (change.introduces) parts.push(`introduces ${change.introduces}`);
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} ${change.fixes + change.introduces === 1 ? 'finding' : 'findings'}.`;
}

/** `+2 ~1 −1` over components, rules and dependencies. */
export function deltaCounts(proposal: Pick<BlueprintProposal, 'delta'>): { added: number; changed: number; removed: number } {
  const { delta } = proposal;
  return {
    added: delta.componentsAdded.length + delta.rulesAdded.length + delta.dependenciesAdded.length + delta.other.filter((item) => / added: /.test(item)).length,
    changed: delta.componentsChanged.length + delta.rulesChanged.length + delta.other.filter((item) => !/ (added|removed): /.test(item)).length,
    removed: delta.componentsRemoved.length + delta.rulesRemoved.length + delta.dependenciesRemoved.length + delta.other.filter((item) => / removed: /.test(item)).length,
  };
}

/** Component ids a proposal is about, including rule-only changes that leave the graph as it is. */
export function touchedComponents(proposal: Pick<BlueprintProposal, 'applied' | 'delta' | 'preview'>, current: Pick<Blueprint, 'components' | 'rules'> | null): string[] {
  const known = new Set([...(current?.components ?? []).map((component) => component.id), ...proposal.preview.components.map((component) => component.id)]);
  const touched = new Set<string>([...proposal.delta.componentsAdded, ...proposal.delta.componentsChanged, ...proposal.delta.componentsRemoved]);
  const consider = (value: string) => {
    for (const part of value.split(/\s*->\s*/)) if (known.has(part)) touched.add(part);
  };
  for (const edit of proposal.applied) edit.targets.forEach(consider);
  for (const dependency of [...proposal.delta.dependenciesAdded, ...proposal.delta.dependenciesRemoved]) consider(dependency);
  // A new, changed or removed rule names components in its selectors.
  const changedRules = new Set([...proposal.delta.rulesAdded, ...proposal.delta.rulesChanged]);
  const removedRules = new Set(proposal.delta.rulesRemoved);
  const rules = [
    ...proposal.preview.rules.filter((rule) => changedRules.has(rule.id)),
    ...(current?.rules ?? []).filter((rule) => removedRules.has(rule.id)),
  ];
  for (const rule of rules) {
    const selectors: unknown[] = rule.kind === 'forbid' || rule.kind === 'allow-only'
      ? [rule.from, rule.to]
      : rule.kind === 'layers' ? rule.layers : rule.kind === 'secret-access' ? [rule.allow] : rule.kind === 'no-cycles' ? [rule.scope] : [];
    for (const selector of selectors.flat()) {
      if (typeof selector !== 'string') continue;
      const id = selector.replace(/^!/, '').replace(/^component:/, '');
      if (known.has(id)) touched.add(id);
    }
  }
  return [...touched];
}

/** The staged proposal as something the canvas can draw. */
export function proposalChanges(proposal: BlueprintProposal, current: Pick<Blueprint, 'components' | 'rules'> | null): CanvasChanges {
  return {
    mode: 'proposal',
    key: proposal.id,
    blueprint: proposal.preview,
    graphDiff: proposal.graphDiff,
    delta: proposal.delta,
    touched: touchedComponents(proposal, current),
  };
}
