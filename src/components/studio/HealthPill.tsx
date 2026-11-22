'use client';

import { forwardRef } from 'react';

import { Pill } from '@/components/ui/Pill';
import { StatusGlyph } from '@/components/ui/StatusGlyph';

import type { Health } from './health';

/** The one status indicator: contract verdict and runtime status together, human-authored share as a quiet second figure. */
const HealthPill = forwardRef<HTMLButtonElement, { health: Health; onOpen: () => void }>(function HealthPill({ health, onOpen }, ref) {
  const human = health.humanPercent === null ? null : `${health.humanPercent}% human`;
  return (
    <Pill
      ref={ref}
      data-testid="health-pill"
      data-tone={health.tone}
      aria-label={[`Health: ${health.label}`, health.detail, human ? `${health.humanPercent}% human-authored` : null, 'Open what needs attention'].filter(Boolean).join('. ')}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <StatusGlyph tone={health.tone} label={health.label} size={15} />
      {human && (
        <span className="tabular hidden border-l border-line pl-2 text-meta font-normal text-fg-3 sm:inline" aria-hidden="true">
          {human}
        </span>
      )}
    </Pill>
  );
});

export default HealthPill;
