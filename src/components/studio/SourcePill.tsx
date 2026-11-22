'use client';

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

import type { BlueprintSession } from '@/components/blueprint/session';
import { Pill } from '@/components/ui/Pill';

export function sourceText(source: BlueprintSession['source']): string | null {
  if (!source) return null;
  return source.kind === 'github' ? `${source.owner}/${source.repo}` : source.name;
}

export function shortSha(sha: string | undefined | null): string | null {
  return sha && /^[a-f0-9]{7,}$/i.test(sha) ? sha.slice(0, 7) : null;
}

/** System name · source · short commit. Opens the source sheet. A dot means there is something newer or unsaved. */
const SourcePill = forwardRef<HTMLButtonElement, {
  session: Pick<BlueprintSession, 'blueprint' | 'source' | 'live' | 'dirty'>;
  onOpen: () => void;
}>(function SourcePill({ session, onOpen }, ref) {
  const name = session.blueprint?.system.name ?? 'Rassam';
  const source = sourceText(session.source);
  const sha = shortSha(session.live.current?.sha ?? (session.source?.kind === 'github' ? session.source.commitSha : null));
  const behind = session.live.behind;
  const note = behind ? 'A newer commit is available' : session.dirty ? 'Unsaved changes' : null;
  return (
    <Pill
      ref={ref}
      data-testid="source-pill"
      aria-haspopup="dialog"
      aria-label={[`Source: ${name}`, source, sha ? `commit ${sha}` : null, note, 'Open source and history'].filter(Boolean).join(', ')}
      onClick={onOpen}
      leading={(
        // eslint-disable-next-line @next/next/no-img-element -- a 16px static mark; the image optimizer adds nothing
        <img src="/logo.svg" alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
      )}
      trailing={<ChevronDown size={14} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden="true" />}
    >
      <span className="min-w-0 truncate">{name}</span>
      {source && <span className="hidden min-w-0 truncate font-normal text-fg-3 md:inline">{source}</span>}
      {sha && <span data-testid="source-commit" className="tabular hidden font-mono text-meta font-normal text-fg-3 sm:inline">{sha}</span>}
      {note && (
        <span
          data-testid="source-dot"
          title={note}
          aria-hidden="true"
          className={behind ? 'h-2 w-2 shrink-0 rounded-full bg-accent' : 'h-2 w-2 shrink-0 rounded-full border-2 border-fg-3'}
        />
      )}
    </Pill>
  );
});

export default SourcePill;
