import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utilities/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `glass` is for panels that overlay telemetry or imagery. */
  surface?: 'raised' | 'sunken' | 'glass';
  padded?: boolean;
}

export function Card({
  surface = 'raised',
  padded = true,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'border-line rounded-lg border',
        surface === 'raised' && 'bg-surface-raised',
        surface === 'sunken' && 'bg-surface-sunken',
        surface === 'glass' && 'glass',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Actions aligned to the right of the title row. */
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-lg font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-content-secondary mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
