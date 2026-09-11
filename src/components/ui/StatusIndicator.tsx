import { cn } from '@/lib/utilities/cn';

export type StatusTone = 'ok' | 'warn' | 'fault' | 'idle' | 'live';

/** Dots are marks, so they use the vivid `-mark` steps, not the text steps. */
const DOT: Record<StatusTone, string> = {
  ok: 'bg-status-ok-mark',
  warn: 'bg-status-warn-mark',
  fault: 'bg-status-fault-mark',
  idle: 'bg-status-idle',
  live: 'bg-telemetry-mark',
};

export interface StatusIndicatorProps {
  tone: StatusTone;
  label?: string;
  /**
   * Animates the dot. Reserved for genuinely ongoing states: a live data
   * stream, or a fault demanding attention. A static state must not pulse.
   */
  pulse?: boolean;
  className?: string;
}

export function StatusIndicator({ tone, label, pulse = false, className }: StatusIndicatorProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative flex size-2 shrink-0">
        {pulse && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 rounded-full',
              DOT[tone],
              tone === 'fault' ? 'animate-attention' : 'animate-pulse-signal',
            )}
          />
        )}
        <span className={cn('relative size-2 rounded-full', DOT[tone])} />
      </span>
      {label && <span className="text-content-secondary text-sm">{label}</span>}
    </span>
  );
}
