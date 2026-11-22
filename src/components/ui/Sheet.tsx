'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import { IconButton } from './Button';
import { cx } from './cx';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One quiet line under the title. */
  description?: ReactNode;
  side?: 'left' | 'right';
  /** Width in px on wide screens; the sheet is full width under 720px. */
  width?: number;
  /** Extra controls in the header, before the close button. */
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Override where focus goes when the sheet opens; by default the sheet itself takes it. */
  onOpenAutoFocus?: (event: Event) => void;
}

/**
 * A modal side sheet: focus is trapped inside, Escape and the scrim close it,
 * the rest of the page is inert while it is open, and focus returns to the
 * control that opened it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  width = 360,
  actions,
  footer,
  children,
  className,
  onOpenAutoFocus,
}: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] animate-fade bg-scrim" />
        <Dialog.Content
          data-side={side}
          data-canvas-shortcuts="off"
          ref={contentRef}
          tabIndex={-1}
          // Focus lands on the sheet, not on its close button: the title is read first and
          // Escape closes the sheet instead of a tooltip.
          onOpenAutoFocus={(event) => {
            // Whatever had focus opened the sheet; it gets focus back when the sheet closes.
            openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (onOpenAutoFocus) {
              onOpenAutoFocus(event);
              return;
            }
            event.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = openerRef.current;
            openerRef.current = null;
            if (opener?.isConnected) opener.focus();
          }}
          aria-describedby={undefined}
          style={{ ['--sheet-width' as string]: `${width}px` }}
          className={cx(
            'studio fixed inset-y-0 z-[71] flex w-full flex-col bg-raised text-fg shadow-elev-3 outline-none',
            'min-[720px]:inset-y-3 min-[720px]:w-[var(--sheet-width)] min-[720px]:max-w-[calc(100vw-1.5rem)] min-[720px]:rounded-xl',
            side === 'right' ? 'right-0 animate-sheet min-[720px]:right-3' : 'left-0 animate-rise min-[720px]:left-3',
            className,
          )}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-4 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-title font-semibold text-fg">{title}</Dialog.Title>
              {description && <div className="mt-0.5 text-small text-fg-3">{description}</div>}
            </div>
            {actions}
            <Dialog.Close asChild>
              <IconButton label="Close" shortcut="Esc" tooltipSide="bottom">
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <footer className="shrink-0 border-t border-line-subtle px-4 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A titled block inside a sheet. */
export function SheetSection({
  title,
  count,
  aside,
  children,
  className,
}: {
  title: string;
  count?: number;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cx('px-4 py-4', className)}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-meta font-medium uppercase tracking-wider text-fg-3">{title}</h3>
        {count !== undefined && <span className="tabular text-meta text-fg-3">{count}</span>}
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
