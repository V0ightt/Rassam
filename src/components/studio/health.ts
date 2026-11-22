// One indicator for "is the project on track": the contract verdict and the
// runtime status rolled into a glyph, a label and a colour.

import { isStale, summarizeStatus, type Blueprint, type CheckReport, type SystemStatus } from '@/blueprint';
import { reportVerdict, type Verdict } from '@/components/blueprint/model';
import type { StatusTone } from '@/components/ui/StatusGlyph';

export interface Health {
  tone: StatusTone;
  /** The one thing to know, e.g. "On track", "3 need a ruling", "Outage: API down". */
  label: string;
  /** A second fact when two things are wrong at once (shown in the sheet and to screen readers). */
  detail: string | null;
  verdict: Verdict | null;
  /** Errors and warnings that need a human ruling. */
  rulings: number;
  /** 0–100, or null when unknown. */
  humanPercent: number | null;
  runtime: ReturnType<typeof summarizeStatus>;
  /** The runtime status is older than 30 minutes. */
  stale: boolean;
}

export function rulingsLabel(count: number): string {
  return count === 1 ? '1 needs a ruling' : `${count} need a ruling`;
}

function namesOf(blueprint: Blueprint | null, status: SystemStatus | null, state: 'down' | 'degraded'): string[] {
  return (blueprint?.components ?? [])
    .filter((component) => component.runtime && status?.components[component.id]?.state === state)
    .map((component) => component.name);
}

export function describeHealth({
  blueprint,
  report,
  status,
  humanRatio,
  now = Date.now(),
}: {
  blueprint: Blueprint | null;
  report: CheckReport | null;
  status: SystemStatus | null;
  humanRatio?: number | null;
  now?: number | Date;
}): Health {
  const verdict = reportVerdict(report);
  const rulings = report ? report.summary.errors + report.summary.warnings : 0;
  const runtime = summarizeStatus(status, blueprint);
  const stale = Boolean(status) && runtime.monitored > 0 && isStale(status!, now);
  const ratio = humanRatio ?? report?.summary.humanAuthoredRatio;
  const humanPercent = typeof ratio === 'number' && Number.isFinite(ratio) ? Math.round(ratio * 100) : null;
  const base = { verdict, rulings, humanPercent, runtime, stale };

  const down = namesOf(blueprint, status, 'down');
  const degraded = namesOf(blueprint, status, 'degraded');
  const contract = rulings > 0 ? rulingsLabel(rulings) : null;

  if (down.length > 0) {
    return { ...base, tone: 'bad', label: down.length === 1 ? `Outage: ${down[0]} down` : `Outage: ${down.length} components down`, detail: contract };
  }
  if (verdict === 'fail') {
    return { ...base, tone: 'bad', label: rulingsLabel(rulings), detail: degraded.length ? `${degraded.join(', ')} degraded` : null };
  }
  if (degraded.length > 0) {
    return { ...base, tone: 'warn', label: degraded.length === 1 ? `Degraded: ${degraded[0]}` : `Degraded: ${degraded.length} components`, detail: contract };
  }
  if (verdict === 'warn') return { ...base, tone: 'warn', label: rulingsLabel(rulings), detail: null };
  if (verdict === 'pass') return { ...base, tone: 'ok', label: 'On track', detail: stale ? 'Runtime status is stale' : null };
  return { ...base, tone: 'unknown', label: 'Not checked yet', detail: null };
}
