'use client';

import type { BlueprintEditInput } from '@/blueprint';
import AttentionTab from '@/components/blueprint/AttentionTab';
import { RUNTIME_STATUS } from '@/components/blueprint/BlueprintNode';
import ReachTab from '@/components/blueprint/ReachTab';
import type { BlueprintSession } from '@/components/blueprint/session';
import { IssueList } from '@/components/blueprint/ui';
import type { BlueprintUi } from '@/components/blueprint/useBlueprintUi';
import { Badge } from '@/components/ui/Pill';
import { Sheet, SheetSection } from '@/components/ui/Sheet';
import { StatusGlyph } from '@/components/ui/StatusGlyph';

import type { Health } from './health';

function asOf(iso: string | undefined): string {
  if (!iso) return 'time unknown';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Behind the health pill: the ranked findings with one-click rulings (staged
 * as proposals), what is running, and what agents can reach.
 */
export default function AttentionSheet({
  open,
  onOpenChange,
  session,
  ui,
  health,
  onShowOnCanvas,
  onPropose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: BlueprintSession;
  ui: BlueprintUi;
  health: Health;
  onShowOnCanvas: (componentIds: string[]) => void;
  onPropose: (edits: BlueprintEditInput[], label: string) => void;
}) {
  const status = session.systemStatus;
  const monitored = (session.blueprint?.components ?? []).filter((component) => component.runtime);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Attention"
      width={440}
      description={<StatusGlyph tone={health.tone} label={health.detail ? `${health.label} · ${health.detail}` : health.label} />}
    >
      {session.issues.length > 0 && (
        <div className="px-4 pt-4">
          <IssueList issues={session.issues} title={`${session.issues.length} blueprint ${session.issues.length === 1 ? 'issue' : 'issues'}`} />
        </div>
      )}

      <AttentionTab
        session={session}
        ui={ui}
        onShowOnCanvas={(ids) => { onOpenChange(false); onShowOnCanvas(ids); }}
        onPropose={(edits, label) => { onOpenChange(false); onPropose(edits, label); }}
      />

      <SheetSection
        title="Runtime"
        count={monitored.length}
        className="border-t border-line-subtle"
        aside={status ? (
          <span className="tabular flex items-center gap-1.5 text-meta text-fg-3">
            as of {asOf(status.checkedAt)}
            {health.stale && <Badge tone="unknown">stale</Badge>}
          </span>
        ) : undefined}
      >
        {monitored.length === 0 ? (
          <p className="text-small text-fg-3">No component declares where it runs yet. Say “set health of api to https://example.com/health” to start tracking one.</p>
        ) : (
          <ul className="space-y-2" aria-label="Runtime status">
            {monitored.map((component) => {
              const entry = status?.components[component.id];
              const state = RUNTIME_STATUS[entry?.state ?? 'unknown'];
              return (
                <li key={component.id} className="flex items-start gap-3 text-small">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{component.name}</span>
                    {entry?.detail && <span className="block text-fg-3">{entry.detail}</span>}
                  </span>
                  {entry?.latencyMs !== undefined && <span className="tabular text-meta text-fg-3">{Math.round(entry.latencyMs)} ms</span>}
                  <StatusGlyph tone={state.tone} label={state.label} className="shrink-0" />
                </li>
              );
            })}
          </ul>
        )}
        {!status && monitored.length > 0 && (
          <p className="mt-2 text-small text-fg-3">No status file was found in this source, so the state of these components is unknown.</p>
        )}
      </SheetSection>

      <section aria-label="Reach" className="border-t border-line-subtle">
        <h3 className="px-4 pt-4 text-meta font-medium uppercase tracking-wider text-fg-3">Reach</h3>
        <ReachTab session={session} />
      </section>
    </Sheet>
  );
}
