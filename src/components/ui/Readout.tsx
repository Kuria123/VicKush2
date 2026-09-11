import { cn } from '@/lib/utilities/cn';
import { Sparkline } from './Sparkline';

/**
 * Why a parameter has no value. Every diagnostic reading carries one of
 * these; "no data" is never rendered as a zero or a dash-shaped guess.
 */
export type ReadingState = 'available' | 'unavailable' | 'unsupported' | 'not-reading' | 'error';

const STATE_TEXT: Record<Exclude<ReadingState, 'available'>, string> = {
  unavailable: 'Not available',
  unsupported: 'Not supported',
  'not-reading': 'Not reading',
  error: 'Read error',
};

const STATE_TONE: Record<Exclude<ReadingState, 'available'>, string> = {
  unavailable: 'text-content-muted',
  unsupported: 'text-content-muted',
  'not-reading': 'text-content-muted',
  error: 'text-status-fault',
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
  state?: 'available';
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
  state: Exclude<ReadingState, 'available'>;
  /** A parameter without a reading cannot carry a value. Enforced by the type. */
  value?: never;
  delta?: never;
  trend?: never;
}

export type ReadoutProps = AvailableReadout | UnavailableReadout;

export function Readout(props: ReadoutProps) {
  const { label, unit, className } = props;

  if (props.state && props.state !== 'available') {
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
