'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Longer description, exposed as the title. */
  hint?: string;
  icon?: ReactNode;
}

/** A radio group drawn as one control. Arrow keys move and select; Tab leaves. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'sm',
  className,
}: {
  label: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : offset ? (index + offset + options.length) % options.length : null;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={cx('inline-flex items-center gap-0.5 rounded-md p-0.5', className)}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={option.hint}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              'focus-ring inline-flex items-center gap-1.5 rounded-sm px-2.5 font-medium transition-colors duration-100',
              size === 'sm' ? 'h-7 text-meta' : 'h-8 text-small',
              checked ? 'bg-active text-fg' : 'text-fg-3 hover:text-fg',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
