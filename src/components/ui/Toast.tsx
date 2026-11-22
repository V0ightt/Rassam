'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, IconButton } from './Button';
import { cx } from './cx';
import { StatusGlyph, type StatusTone } from './StatusGlyph';

/**
 * A receipt: what just happened, with the way back. It is announced politely
 * and stays until the person dismisses it or acts again (no timed dismissal).
 */
export function Receipt({
  message,
  tone = 'ok',
  toneLabel = 'Done',
  actionLabel,
  actionShortcut,
  onAction,
  onDismiss,
  className,
}: {
  message: ReactNode;
  tone?: StatusTone;
  /** Screen-reader label of the glyph. */
  toneLabel?: string;
  actionLabel?: string;
  actionShortcut?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="receipt"
      className={cx('flex min-h-10 animate-rise items-center gap-2 rounded-lg bg-overlay py-1 pl-3 pr-1 text-small text-fg shadow-elev-2', className)}
    >
      <StatusGlyph tone={tone} label={toneLabel} hideLabel />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      {actionLabel && onAction && (
        <Button variant="ghost" size="sm" onClick={onAction} className="text-accent-text" title={actionShortcut ? `${actionLabel} (${actionShortcut})` : undefined}>
          {actionLabel}
        </Button>
      )}
      {onDismiss && (
        <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}

/** A background notice that needs reading: stays until dismissed. Errors are announced assertively. */
export function Toast({
  tone,
  toneLabel,
  children,
  onDismiss,
  className,
}: {
  tone: Extract<StatusTone, 'warn' | 'bad' | 'ok' | 'unknown'>;
  toneLabel: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx('flex animate-rise items-start gap-2 rounded-lg bg-overlay py-2 pl-3 pr-2 text-small text-fg shadow-elev-2', className)}
    >
      <StatusGlyph tone={tone} label={toneLabel} hideLabel className="mt-0.5" />
      <div className="min-w-0 flex-1 leading-5">{children}</div>
      {onDismiss && (
        <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}
