'use client';

import type { ReactNode } from 'react';
import { FileCode2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  describeSourceLocation,
  formatSourceLocation,
  isNavigableSourceLocation,
  type SourceLocation,
  type SourceLocationNavigationHandler,
} from '@/lib/source-location';

export interface SourceLocationLinkProps {
  location: SourceLocation;
  onNavigate?: SourceLocationNavigationHandler;
  children?: ReactNode;
  className?: string;
  variant?: 'inline' | 'row';
}

/**
 * Shared source-navigation affordance. It becomes a real button only when a
 * navigation handler is available, so read-only exports do not expose a dead control.
 */
export function SourceLocationLink({
  location,
  onNavigate,
  children,
  className,
  variant = 'inline',
}: SourceLocationLinkProps) {
  const navigate = onNavigate && isNavigableSourceLocation(location) ? onNavigate : undefined;
  const label = children ?? formatSourceLocation(location);
  const commonClassName = cn(
    'font-mono text-left text-cyan-300',
    variant === 'inline'
      ? 'inline-flex max-w-full items-center gap-1 rounded border border-cyan-800/70 bg-cyan-950/40 px-1.5 py-0.5 text-xs align-baseline'
      : 'flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs',
    navigate && 'cursor-pointer transition-colors hover:bg-cyan-900/35 hover:text-cyan-200 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
    !navigate && variant === 'row' && 'text-slate-300',
    className,
  );

  const contents = (
    <>
      <FileCode2 size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-all">{label}</span>
    </>
  );

  if (!navigate) {
    return <span className={commonClassName}>{contents}</span>;
  }

  return (
    <button
      type="button"
      className={commonClassName}
      aria-label={describeSourceLocation(location)}
      onClick={() => navigate(location)}
    >
      {contents}
    </button>
  );
}
