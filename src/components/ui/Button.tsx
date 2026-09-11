import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utilities/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface-raised text-content border border-line hover:bg-surface-sunken',
  ghost:
    'bg-transparent text-content-secondary border border-transparent hover:bg-surface-sunken hover:text-content',
  danger: 'bg-status-fault text-white hover:brightness-110 border border-transparent',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
  /** Rendered before the label; hidden while loading. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // A loading button stays focusable but is not actionable, so screen
      // reader users are told why rather than losing the control entirely.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium',
        'transition-[background-color,border-color,color,filter] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 'md' : 'sm'} /> : icon}
      {children}
    </button>
  );
}
