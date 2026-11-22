import { CheckCircle2, CircleDashed, LoaderCircle, OctagonX, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';

import { cx } from './cx';

export type StatusTone = 'ok' | 'warn' | 'bad' | 'unknown' | 'proposed' | 'working';

/** Each status has its own shape, so it survives a grayscale screenshot. */
export const STATUS_ICON: Record<StatusTone, LucideIcon> = {
  ok: CheckCircle2,
  warn: TriangleAlert,
  bad: OctagonX,
  unknown: CircleDashed,
  proposed: Sparkles,
  working: LoaderCircle,
};

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  unknown: 'text-unknown',
  proposed: 'text-accent-text',
  working: 'text-accent-text',
};

/**
 * Status = glyph + label + colour, always. `hideLabel` keeps the label for
 * assistive technology when the surrounding text already says it visually.
 */
export function StatusGlyph({
  tone,
  label,
  hideLabel = false,
  size = 14,
  className,
}: {
  tone: StatusTone;
  label: string;
  hideLabel?: boolean;
  size?: number;
  className?: string;
}) {
  const Icon = STATUS_ICON[tone];
  return (
    <span data-status={tone} className={cx('inline-flex min-w-0 items-center gap-1.5', TONE_CLASS[tone], className)}>
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" className={cx('shrink-0', tone === 'working' && 'animate-breathe')} />
      <span className={hideLabel ? 'sr-only' : 'truncate'}>{label}</span>
    </span>
  );
}
