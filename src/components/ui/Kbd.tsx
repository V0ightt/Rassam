import type { ReactNode } from 'react';

import { cx } from './cx';

/** A key cap. Decorative next to a labelled control; pass `label` when it stands alone. */
export function Kbd({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <kbd
      aria-label={label}
      className={cx(
        'tabular inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-base px-1 font-sans text-meta font-medium text-fg-3',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
