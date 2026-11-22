'use client';

import { CornerDownLeft, Minus, Sparkles, TriangleAlert } from 'lucide-react';

import type { CheckReport } from '@/blueprint';
import type { BlueprintProposal } from '@/components/blueprint/session';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Badge } from '@/components/ui/Pill';
import { StatusGlyph } from '@/components/ui/StatusGlyph';

import { deltaCounts, describeFindingsChange, findingsChange } from './proposal';

const SOURCE_LABEL: Record<BlueprintProposal['source'], string> = {
  parser: 'Read from your words',
  model: 'Drafted by a model',
  manual: 'From your action',
};

/**
 * The staged change, reviewed before it touches the draft: what it does, what
 * it does to the check, and whether it loosens the contract (which always
 * takes an explicit second step, never a default Enter).
 */
export default function ProposalCard({
  proposal,
  report,
  confirming,
  onApply,
  onConfirmWeakening,
  onDiscard,
}: {
  proposal: BlueprintProposal;
  /** Check of the working draft, to compare the preview against. */
  report: CheckReport | null;
  /** The person asked to apply a change that loosens the contract; the explicit confirmation is showing. */
  confirming: boolean;
  onApply: () => void;
  onConfirmWeakening: () => void;
  onDiscard: () => void;
}) {
  const counts = deltaCounts(proposal);
  const change = findingsChange(report, proposal.previewReport);
  const worse = Boolean(change && change.introduces > 0);
  const better = Boolean(change && change.fixes > 0 && !change.introduces);

  return (
    <section
      aria-label="Proposed changes"
      data-testid="proposal-card"
      className="max-h-[50vh] animate-rise overflow-y-auto rounded-xl bg-overlay text-fg shadow-elev-3"
    >
      <header className="flex items-start gap-2 px-4 pt-3">
        <Sparkles size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-input font-medium text-fg">Proposed change</h2>
          <p className="text-meta text-fg-3">
            {SOURCE_LABEL[proposal.source]}{proposal.source === 'model' && proposal.model ? ` (${proposal.model})` : ''} · previewed on the canvas, nothing is applied yet
          </p>
        </div>
        <Badge tone="accent" aria-label={`${counts.added} added, ${counts.changed} changed, ${counts.removed} removed`}>
          +{counts.added} ~{counts.changed} −{counts.removed}
        </Badge>
      </header>

      <ol className="mt-2 space-y-1.5 px-4" aria-label="Changes">
        {proposal.applied.map((edit) => (
          <li key={edit.index} className="flex items-start gap-2 text-small text-fg">
            {edit.weakens
              ? <TriangleAlert size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
              : <Minus size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              {edit.summary}
              {edit.weakens && <span className="ml-1.5 font-medium text-warn">Loosens the contract</span>}
            </span>
          </li>
        ))}
      </ol>

      {proposal.questions && proposal.questions.length > 0 && (
        <ul className="mt-2 space-y-1 px-4 text-small text-fg-2" aria-label="Open questions">
          {proposal.questions.map((question) => <li key={question}>{question}</li>)}
        </ul>
      )}

      <p className="mt-3 px-4 text-small" data-testid="findings-change">
        <StatusGlyph
          tone={!change ? 'unknown' : worse ? 'warn' : better ? 'ok' : 'unknown'}
          label={describeFindingsChange(change)}
          className={!change || (!worse && !better) ? 'text-fg-3' : undefined}
        />
      </p>

      {proposal.weakens && (
        <div role="note" className="mx-4 mt-3 rounded-md bg-warn-bg px-3 py-2 text-small text-warn">
          <p className="font-medium">This loosens the contract.</p>
          <p className="mt-0.5">CI judges a change by the base branch&apos;s blueprint, so the pull request will need the human-approved label before it can merge.</p>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-subtle px-4 py-3">
        {proposal.weakens ? (
          confirming ? (
            <Button variant="danger" size="md" onClick={onConfirmWeakening} data-testid="confirm-weaken">
              Loosen the contract
            </Button>
          ) : (
            <Button variant="secondary" size="md" onClick={onApply}>
              Apply… <Kbd className="ml-1"><CornerDownLeft size={11} aria-hidden="true" /></Kbd>
            </Button>
          )
        ) : (
          <Button variant="primary" size="md" onClick={onApply}>
            Apply <CornerDownLeft size={13} strokeWidth={2} aria-hidden="true" className="opacity-70" />
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={onDiscard}>
          Discard <Kbd className="ml-1">Esc</Kbd>
        </Button>
        {proposal.weakens && confirming && (
          <span className="text-meta text-fg-3" role="status">Confirm with the button. Enter does not apply a change that loosens the contract.</span>
        )}
      </footer>
    </section>
  );
}
