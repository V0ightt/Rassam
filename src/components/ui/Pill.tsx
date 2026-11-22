import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

import { cx } from './cx';

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'unknown';

const BADGE_TONE: Record<Tone, string> = {
  neutral: 'bg-hover text-fg-2',
  accent: 'bg-accent-muted text-accent-text',
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  unknown: 'border border-dashed border-line-strong text-fg-3',
};

/** Small, non-interactive label. Tone never stands alone: pair it with text (and a glyph for status). */
export function Badge({ tone = 'neutral', className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cx('tabular inline-flex h-5 shrink-0 items-center gap-1 rounded-xs px-1.5 text-meta font-medium', BADGE_TONE[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
}

/** Floating pill button (source pill, health pill). Glass over the canvas with an opaque fallback. */
export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill({ leading, trailing, className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'glass inline-flex h-9 max-w-full items-center gap-2 rounded-full px-3 text-small font-medium text-fg shadow-elev-2 transition-[filter] duration-100 hover:brightness-110',
        className,
      )}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </button>
  );
});
