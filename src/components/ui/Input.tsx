'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cx } from './cx';

const FIELD =
  'w-full rounded-md bg-canvas text-fg shadow-[inset_0_0_0_1px_var(--border-strong)] transition-shadow duration-100 placeholder:text-fg-3 focus:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_oklch,var(--accent)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--status-bad)]';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ size = 'md', className, ...rest }, ref) {
  return <input ref={ref} className={cx(FIELD, size === 'lg' ? 'h-10 px-3 text-body' : 'h-8 px-2.5 text-small', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cx(FIELD, 'resize-y px-2.5 py-2 text-small leading-5', className)} {...rest} />;
});
