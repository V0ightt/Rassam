'use client';

import { cloneElement, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

import { cx } from './cx';

type TriggerProps = {
  onClick?: (event: React.MouseEvent) => void;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: 'dialog';
  'aria-controls'?: string;
};

/**
 * A small non-modal popover anchored to its trigger. Escape and an outside
 * press close it and focus returns to the trigger.
 */
export function Popover({
  label,
  trigger,
  children,
  side = 'top',
  align = 'end',
  open: controlled,
  onOpenChange,
  className,
}: {
  /** Accessible name of the popover panel. */
  label: string;
  trigger: ReactElement<TriggerProps>;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const setOpen = useCallback((next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const close = useCallback(() => {
    setOpen(false);
    wrapperRef.current?.querySelector<HTMLElement>('[aria-haspopup="dialog"]')?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, setOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close();
    }
  };

  return (
    <span ref={wrapperRef} className="relative inline-flex" onKeyDown={onKeyDown}>
      {cloneElement(trigger, {
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'aria-controls': open ? id : undefined,
        onClick: (event: React.MouseEvent) => {
          trigger.props.onClick?.(event);
          setOpen(!open);
        },
      })}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          className={cx(
            'absolute z-40 min-w-56 animate-pop rounded-lg bg-overlay p-3 text-small text-fg shadow-elev-2',
            side === 'top' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}
