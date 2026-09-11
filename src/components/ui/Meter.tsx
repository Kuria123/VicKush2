import { cn } from '@/lib/utilities/cn';

export type MeterTone = 'accent' | 'ok' | 'warn' | 'fault';

/**
 * The unfilled track is a lighter step of the *same* ramp as the fill
 * (blue-on-blue, green-on-green), so the state reads across the whole bar
 * rather than only in the filled portion.
 */
const TRACK: Record<MeterTone, string> = {
  accent: 'bg-accent-subtle',
  ok: 'bg-status-ok-subtle',
  warn: 'bg-status-warn-subtle',
  fault: 'bg-status-fault-subtle',
};

/** Fills are marks, so they use the vivid `-mark` steps, not the text steps. */
const FILL: Record<MeterTone, string> = {
  accent: 'bg-accent',
  ok: 'bg-status-ok-mark',
  warn: 'bg-status-warn-mark',
  fault: 'bg-status-fault-mark',
};

export interface MeterProps {
  value: number;
  max?: number;
  label: string;
  /** Hides the label visually while keeping it for assistive tech. */
  hideLabel?: boolean;
  tone?: MeterTone;
  /** Right-aligned value text, e.g. "91/100". */
  valueText?: string;
  className?: string;
}

/** A single ratio against a limit. */
export function Meter({
  value,
  max = 100,
  label,
  hideLabel = false,
  tone = 'accent',
  valueText,
  className,
}: MeterProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = (clamped / max) * 100;

  return (
    <div className={cn('w-full', className)}>
      {!hideLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-content-secondary text-sm">{label}</span>
          {valueText && (
            <span className="tabular text-content text-sm font-medium">{valueText}</span>
          )}
        </div>
      )}
      <div
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        aria-valuetext={valueText}
        className={cn('h-1.5 w-full overflow-hidden rounded-full', TRACK[tone])}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', FILL[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
