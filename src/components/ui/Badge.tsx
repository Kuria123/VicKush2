import type { ReactNode } from 'react';

import { cn } from '@/lib/utilities/cn';

export type BadgeTone = 'neutral' | 'accent' | 'telemetry' | 'ok' | 'warn' | 'fault';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-content-secondary border-line',
  accent: 'bg-accent-subtle text-accent border-transparent',
  telemetry: 'bg-telemetry-subtle text-telemetry border-transparent',
  ok: 'bg-status-ok-subtle text-status-ok border-transparent',
  warn: 'bg-status-warn-subtle text-status-warn border-transparent',
  fault: 'bg-status-fault-subtle text-status-fault border-transparent',
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Uppercase monospace, for codes and instrument labels (DTC, PID). */
  technical?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', technical = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'text-2xs inline-flex items-center rounded border px-1.5 py-0.5 font-medium',
        technical && 'font-mono tracking-[0.08em] uppercase',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
