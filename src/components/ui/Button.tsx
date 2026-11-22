'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cx } from './cx';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ControlSize, string> = {
  sm: 'h-7 px-2.5 text-meta gap-1.5 rounded-sm',
  md: 'h-8 px-3 text-small gap-1.5 rounded-md',
  lg: 'h-10 px-4 text-body gap-2 rounded-md',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-hover',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  danger: 'bg-bad-bg text-bad shadow-[inset_0_0_0_1px_var(--status-bad)] hover:brightness-110',
};

const BASE =
  'focus-ring inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,opacity] duration-100 disabled:cursor-not-allowed disabled:opacity-45';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ControlSize = 'md', className?: string): string {
  return cx(BASE, SIZE[size], VARIANT[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
});

const ICON_SIZE: Record<ControlSize, string> = { sm: 'h-7 w-7 rounded-sm', md: 'h-8 w-8 rounded-md', lg: 'h-10 w-10 rounded-md' };

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  /** Key hint shown in the tooltip. */
  shortcut?: string;
  size?: ControlSize;
  active?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', active, tooltipSide, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cx(
          'focus-ring grid shrink-0 place-items-center text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
          ICON_SIZE[size],
          active && 'bg-active text-fg',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});
