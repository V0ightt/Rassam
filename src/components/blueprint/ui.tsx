'use client';

import { useId, useState, type ReactNode } from 'react';
import { BadgeCheck, FileCode2 } from 'lucide-react';

import type { BlueprintIssue, Severity } from '@/blueprint';
import { cn } from '@/lib/utils';

export interface SourceTarget {
  path: string;
  line?: number;
}
export type NavigateToSource = (target: SourceTarget) => void;

export const inputClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400';
export const labelClass = 'mb-1 block text-[11px] font-medium text-slate-300';
export const hintClass = 'mt-1 text-[11px] leading-4 text-slate-500';
export const primaryButtonClass =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-cyan-400/50 bg-cyan-400/15 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40';
export const secondaryButtonClass =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40';
export const dangerButtonClass =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 text-xs text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40';
export const iconButtonClass =
  'grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

const SEVERITY_CLASS: Record<Severity, string> = {
  error: 'border-red-500/50 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  info: 'border-slate-600 bg-slate-800 text-slate-300',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', SEVERITY_CLASS[severity])}>
      {severity}
    </span>
  );
}

/** Verified beats derived: a signed-off fact is human-owned whatever produced it. */
export function ProvenanceBadge({ fact }: { fact: { provenance?: { source: string }; verified?: { by: string } } }) {
  if (fact.verified) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200" title={`Verified by ${fact.verified.by}`}>
        <BadgeCheck size={11} aria-hidden="true" /> verified
      </span>
    );
  }
  const source = fact.provenance?.source;
  if (source === 'derived' || source === 'agent') {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-slate-700 px-1.5 py-0.5 text-[10px] italic text-slate-400" title={source === 'agent' ? 'Proposed by a coding agent, not yet confirmed' : 'Guessed from code, not yet confirmed'}>
        {source}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-cyan-500/30 px-1.5 py-0.5 text-[10px] text-cyan-200">human</span>
  );
}

/** Evidence link: always shows file:line; becomes a button when the host can open the file. */
export function SourceLink({ target, onNavigate, className }: { target: SourceTarget; onNavigate?: NavigateToSource; className?: string }) {
  const text = target.line ? `${target.path}:${target.line}` : target.path;
  if (!onNavigate) {
    return <code className={cn('break-all font-mono text-[11px] text-slate-300', className)}>{text}</code>;
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      aria-label={`Open ${text}`}
      className={cn('inline-flex max-w-full items-center gap-1 rounded text-left font-mono text-[11px] text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-100 hover:decoration-cyan-100', className)}
    >
      <FileCode2 size={11} className="shrink-0" aria-hidden="true" />
      <span className="break-all">{text}</span>
    </button>
  );
}

export function IssueList({ issues, title = 'This change is not valid yet' }: { issues: BlueprintIssue[]; title?: string }) {
  if (!issues.length) return null;
  return (
    <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-100">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {issues.slice(0, 6).map((issue, index) => (
          <li key={`${issue.path}-${index}`}><code className="font-mono text-red-200">{issue.path}</code> {issue.message}</li>
        ))}
        {issues.length > 6 && <li>{issues.length - 6} more</li>}
      </ul>
    </div>
  );
}

export function ComponentChecklist({
  legend,
  components,
  value,
  onChange,
}: {
  legend: string;
  components: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      {components.length === 0 ? (
        <p className={hintClass}>No components yet.</p>
      ) : (
        <div className="max-h-32 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/60 p-1.5">
          {components.map((component) => (
            <label key={component.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-200 hover:bg-slate-800/70">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={value.includes(component.id)}
                onChange={(event) => onChange(event.target.checked
                  ? [...value, component.id]
                  : value.filter((id) => id !== component.id))}
              />
              <span className="truncate">{component.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

const VERIFIER_KEY = 'rassam_blueprint_verifier';

function rememberedVerifier(): string {
  try {
    return window.localStorage.getItem(VERIFIER_KEY) ?? '';
  } catch {
    return '';
  }
}

/** "I checked this against the code": asks who is signing, remembers the answer. */
export function VerifyControl({
  targetLabel,
  verified,
  onVerify,
}: {
  targetLabel: string;
  verified?: { by: string; at: string };
  onVerify: (by: string, note?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const nameId = useId();
  const noteId = useId();

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
          onClick={() => { setName(rememberedVerifier()); setOpen(true); }}
        >
          <BadgeCheck size={14} aria-hidden="true" /> {verified ? 'Verify again' : 'Verify (sign off)'}
        </button>
        {verified && (
          <span className="text-[11px] text-emerald-300">Verified by {verified.by} · {verified.at.slice(0, 10)}</span>
        )}
      </div>
    );
  }

  const submit = () => {
    const by = name.trim();
    if (!by) return;
    try {
      window.localStorage.setItem(VERIFIER_KEY, by);
    } catch {
      // Remembering the name is a convenience only.
    }
    onVerify(by, note.trim() || undefined);
    setOpen(false);
    setNote('');
  };

  return (
    <form
      className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2"
      aria-label={`Sign off ${targetLabel}`}
      onSubmit={(event) => { event.preventDefault(); submit(); }}
    >
      <p className="text-[11px] leading-4 text-emerald-100">Signing off says: I checked {targetLabel} against the code.</p>
      <div>
        <label htmlFor={nameId} className={labelClass}>Your name</label>
        <input id={nameId} autoFocus className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sam Rivera" maxLength={200} />
      </div>
      <div>
        <label htmlFor={noteId} className={labelClass}>Note (optional)</label>
        <input id={noteId} className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={!name.trim()}>Sign off</button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">{children}</p>;
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
      {count !== undefined && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">{count}</span>}
    </h3>
  );
}
