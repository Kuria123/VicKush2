import { cn } from '@/lib/utilities/cn';

const SIZE = {
  sm: 'size-3.5 border-[1.5px]',
  md: 'size-5 border-2',
  lg: 'size-8 border-2',
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZE;
  className?: string;
  /** Accessible label. Omit when an ancestor already announces the busy state. */
  label?: string;
}

/** Indeterminate progress. Purposeful motion: work is in flight. */
export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full',
        'border-current border-r-transparent opacity-70',
        SIZE[size],
        className,
      )}
    />
  );
}
