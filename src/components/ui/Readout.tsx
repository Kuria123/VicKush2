import { cn } from '@/lib/utilities/cn';
import { Sparkline } from './Sparkline';

import type { ReadingStateCode } from '@/domain/telemetry';

/**
 * Why a parameter has no value. Every diagnostic reading carries one of
 * these; "no data" is never rendered as a zero or a dash-shaped guess.
 *
 * The codes come from the telemetry domain, which owns the vocabulary. This
 * component originally declared its own lowercase variant, written before
 * the domain existed; two spellings of the same idea invited exactly the
 * mapping bug they usually cause.
 */
export type ReadingState = ReadingStateCode;

const STATE_TEXT: Record<Exclude<ReadingState, 'AVAILABLE'>, string> = {
  UNAVAILABLE: 'Not available',
  UNSUPPORTED: 'Not supported',
  NOT_READING: 'Not reading',
  ERROR: 'Read error',
};

const STATE_TONE: Record<Exclude<ReadingState, 'AVAILABLE'>, string> = {
  UNAVAILABLE: 'text-content-muted',
  UNSUPPORTED: 'text-content-muted',
  NOT_READING: 'text-content-muted',
  ERROR: 'text-status-fault',
};

interface ReadoutBase {
  /** Sentence case, no trailing colon. */
  label: string;
  unit?: string;
  /** Trend history, oldest → newest. */
  trend?: readonly number[];
  className?: string;
}

interface AvailableReadout extends ReadoutBase {
  state?: 'AVAILABLE';
  value: number | string;
  /** Signed change against `deltaPeriod`. */
  delta?: number;
  deltaPeriod?: string;
  /** Whether a rising value is good. Fuel trim rising is bad; health rising is good. */
  upIsGood?: boolean;
  /**
   * Live-updating values use tabular figures so digits do not jitter as they
   * change. Static values keep proportional figures, which read better at
   * display size.
   */
  live?: boolean;
}

interface UnavailableReadout extends ReadoutBase {
  state: Exclude<ReadingState, 'AVAILABLE'>;
  /** A parameter without a reading cannot carry a value. Enforced by the type. */
  value?: never;
  delta?: never;
  trend?: never;
}

export type ReadoutProps = AvailableReadout | UnavailableReadout;

export function Readout(props: ReadoutProps) {
  const { label, unit, className } = props;

  if (props.state && props.state !== 'AVAILABLE') {
    return (
      <div className={cn('min-w-0', className)}>
        <p className="label-technical">{label}</p>
        <p className={cn('mt-1.5 text-lg font-medium', STATE_TONE[props.state])}>
          {STATE_TEXT[props.state]}
        </p>
      </div>
    );
  }

  const { value, delta, deltaPeriod, upIsGood = true, trend, live } = props;

  // Colour encodes whether the movement is good, not merely its direction.
  const deltaGood = delta === undefined ? null : delta === 0 ? null : delta > 0 === upIsGood;

  return (
    <div className={cn('min-w-0', className)}>
      <p className="label-technical">{label}</p>

      <p className="mt-1.5 flex items-baseline gap-1">
        <span className={cn('text-2xl font-semibold tracking-tight', live && 'tabular')}>
          {value}
        </span>
        {unit && <span className="text-content-secondary text-sm font-normal">{unit}</span>}
      </p>

      {delta !== undefined && (
        <p
          className={cn(
            'mt-1 text-xs',
            deltaGood === null
              ? 'text-content-muted'
              : deltaGood
                ? 'text-status-ok'
                : 'text-status-fault',
          )}
        >
          {delta > 0 ? '+' : ''}
          {delta}
          {unit ? ` ${unit}` : ''}
          {deltaPeriod && <span className="text-content-muted"> vs {deltaPeriod}</span>}
        </p>
      )}

      {trend && trend.length > 1 && (
        <Sparkline
          values={trend}
          label={label}
          unit={unit}
          className="mt-2"
          width={120}
          height={28}
        />
      )}
    </div>
  );
}
