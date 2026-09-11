import { cn } from '@/lib/utilities/cn';

export interface SparklineProps {
  /** Ordered oldest → newest. */
  values: readonly number[];
  /** Accessible name; also the caption of the sr-only data table. */
  label: string;
  unit?: string;
  width?: number;
  height?: number;
  tone?: 'telemetry' | 'accent' | 'ok' | 'warn' | 'fault' | 'muted';
  /** Area wash beneath the line. */
  fill?: boolean;
  className?: string;
}

/** Strokes are marks: vivid `-mark` steps, which need 3:1 rather than 4.5:1. */
const STROKE = {
  telemetry: 'var(--telemetry-mark)',
  accent: 'var(--accent)',
  ok: 'var(--status-ok-mark)',
  warn: 'var(--status-warn-mark)',
  fault: 'var(--status-fault-mark)',
  muted: 'var(--text-muted)',
} as const;

/**
 * Compact trend line for a single series.
 *
 * Mark specs: 2px stroke with round joins, ~10% area wash, and an end marker
 * of r=4 carrying a 2px surface ring so it stays legible over the line.
 *
 * No tooltip by design. A sparkline is an ancillary trend indicator whose
 * current value is always printed beside it, so nothing is gated behind
 * hover. The values are additionally exposed as a visually hidden table, so
 * the series is reachable without colour or pointer.
 */
export function Sparkline({
  values,
  label,
  unit,
  width = 120,
  height = 32,
  tone = 'telemetry',
  fill = true,
  className,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <div
        className={cn('text-2xs text-content-muted flex items-center', className)}
        style={{ width, height }}
      >
        Not enough data
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series must render as a centred line, not divide by zero.
  const span = max - min || 1;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * innerW;
    const y = pad + innerH - ((value - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1]!;
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const stroke = STROKE[tone];

  return (
    <figure className={cn('m-0', className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} trend, ${values.length} readings`}
        className="overflow-visible"
      >
        {fill && <polygon points={area} fill={stroke} fillOpacity={0.1} stroke="none" />}
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Surface ring keeps the end marker readable where it meets the line. */}
        <circle
          cx={last[0]}
          cy={last[1]}
          r={4}
          fill={stroke}
          stroke="var(--surface-raised)"
          strokeWidth={2}
        />
      </svg>

      <figcaption className="sr-only">
        <table>
          <caption>
            {label}
            {unit ? ` (${unit})` : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">Reading</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
