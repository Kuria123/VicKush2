import type { ReactNode } from 'react';

import { cn } from '@/lib/utilities/cn';
import { Spinner } from './Spinner';

/* -------------------------------------------------------------------------
 * Loading
 * ---------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-surface-sunken relative block overflow-hidden rounded',
        // A sweep rather than a fade: reads as data arriving.
        'after:animate-sweep after:absolute after:inset-0',
        'after:bg-gradient-to-r after:from-transparent after:via-black/5 after:to-transparent',
        'dark:after:via-white/10',
        className,
      )}
    />
  );
}

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'text-content-secondary flex flex-col items-center justify-center gap-3 py-12',
        className,
      )}
    >
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Empty / error
 * ---------------------------------------------------------------------- */

interface MessageStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Small tracked label above the title. */
  eyebrow?: string;
  className?: string;
}

export function EmptyState({ title, description, action, eyebrow, className }: MessageStateProps) {
  return (
    <div className={cn('mx-auto max-w-md py-12 text-center', className)}>
      {eyebrow && <p className="label-technical">{eyebrow}</p>}
      <h2 className="mt-3 text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <div className="text-content-secondary mt-2 text-sm leading-relaxed">{description}</div>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
  className,
}: Omit<MessageStateProps, 'eyebrow'>) {
  return (
    <div role="alert" className={cn('mx-auto max-w-md py-12 text-center', className)}>
      <p className="label-technical text-status-fault">Error</p>
      <h2 className="mt-3 text-lg font-semibold tracking-tight">{title}</h2>
      {description && (
        <div className="text-content-secondary mt-2 text-sm leading-relaxed">{description}</div>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
