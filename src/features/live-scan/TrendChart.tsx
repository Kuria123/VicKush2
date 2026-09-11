'use client';

import { useRef, useState } from 'react';

import { getParameter } from '@/domain/telemetry';
import type { ParameterTrack } from '@/domain/diagnostics';
import { cn } from '@/lib/utilities/cn';

/**
 * A live time-series plot for one parameter.
 *
 * Mark specs follow the house rules: a 2 px line with round joins, a 10%
 * area wash, an r=4 end marker carrying a 2 px surface ring, and hairline
 * solid gridlines one step off the surface. A single series needs no legend —
 * the title names it.
 *
 * The crosshair reads the nearest sample so the pointer aims at a moment in
 * time rather than at a 2 px line. It enhances and never gates: the current
 * value is printed in the header, and every point is also reachable through
 * the visually hidden table below.
 */

const TONE_STROKE = {
  telemetry: 'var(--telemetry-mark)',
  accent: 'var(--accent)',
  warn: 'var(--status-warn-mark)',
  fault: 'var(--status-fault-mark)',
} as const;

export type TrendTone = keyof typeof TONE_STROKE;

export interface TrendChartProps {
  track: ParameterTrack;
  tone?: TrendTone;
  height?: number;
  /** Forces the vertical range, for parameters with a meaningful zero. */
  domain?: { min: number; max: number };
  className?: string;
}

const PAD_X = 8;
const PAD_Y = 10;

export function TrendChart({
  track,
  tone = 'telemetry',
  height = 140,
  domain,
  className,
}: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const definition = getParameter(track.parameterId);
  const unit = track.unit ?? definition?.unit ?? '';
  const decimals = definition?.decimals ?? 1;
  const points = track.points;

  if (points.length < 2) {
    return (
      <div
        className={cn(
          'text-content-muted border-line flex items-center justify-center rounded-md border border-dashed text-xs',
          className,
        )}
        style={{ height }}
      >
        {track.state === 'AVAILABLE' ? 'Collecting…' : 'No data for this parameter'}
      </div>
    );
  }

  // A viewBox with a fixed width keeps the geometry simple while the element
  // scales; only the aspect ratio is fixed, not the rendered size.
  const width = 600;
  const innerW = width - PAD_X * 2;
  const innerH = height - PAD_Y * 2;

  const values = points.map((p) => p.value);
  const rawMin = domain?.min ?? Math.min(...values);
  const rawMax = domain?.max ?? Math.max(...values);
  // A flat series must not collapse to a zero-height band.
  const pad = rawMax - rawMin < 1e-9 ? Math.max(Math.abs(rawMax) * 0.1, 1) : 0;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min || 1;

  const firstT = points[0]!.t;
  const lastT = points[points.length - 1]!.t;
  const timeSpan = lastT - firstT || 1;

  const x = (t: number) => PAD_X + ((t - firstT) / timeSpan) * innerW;
  const y = (v: number) => PAD_Y + innerH - ((v - min) / span) * innerH;

  const line = points.map((p) => `${x(p.t).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${PAD_X},${height - PAD_Y} ${line} ${width - PAD_X},${height - PAD_Y}`;
  const last = points[points.length - 1]!;
  const stroke = TONE_STROKE[tone];

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const targetT = firstT + ratio * timeSpan;

    // Snap to the nearest sample, so the reader aims at a time, not a pixel.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const distance = Math.abs(points[i]!.t - targetT);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  }

  return (
    <figure className={cn('m-0', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${definition?.name ?? track.parameterId} over time, ${points.length} samples`}
        className="w-full touch-none"
        style={{ height }}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* Recessive gridlines: hairline, solid, one step off the surface. */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={PAD_X}
            x2={width - PAD_X}
            y1={PAD_Y + innerH * fraction}
            y2={PAD_Y + innerH * fraction}
            stroke="var(--border-default)"
            strokeWidth={1}
          />
        ))}

        <polygon points={area} fill={stroke} fillOpacity={0.1} stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hovered && (
          <>
            <line
              x1={x(hovered.t)}
              x2={x(hovered.t)}
              y1={PAD_Y}
              y2={height - PAD_Y}
              stroke="var(--border-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hovered.t)}
              cy={y(hovered.value)}
              r={4}
              fill={stroke}
              stroke="var(--surface-raised)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* End marker with a surface ring, so it reads where it meets the line. */}
        <circle
          cx={x(last.t)}
          cy={y(last.value)}
          r={4}
          fill={stroke}
          stroke="var(--surface-raised)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <figcaption className="mt-1.5 flex items-baseline justify-between gap-3">
        {/* Values lead, labels follow, and neither wears the series colour. */}
        <span className="text-content-muted text-2xs tabular">
          {min.toFixed(decimals)} – {max.toFixed(decimals)} {unit}
        </span>
        <span
          className={cn(
            'tabular text-xs',
            hovered ? 'text-content font-medium' : 'text-content-muted',
          )}
        >
          {hovered
            ? `${hovered.value.toFixed(decimals)} ${unit} at ${(hovered.t / 1000).toFixed(1)} s`
            : `${(timeSpan / 1000).toFixed(0)} s of history`}
        </span>
      </figcaption>

      {/* Every plotted value, reachable without a pointer. */}
      <table className="sr-only">
        <caption>{definition?.name ?? track.parameterId} samples</caption>
        <thead>
          <tr>
            <th scope="col">Time (s)</th>
            <th scope="col">Value ({unit})</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.t}>
              <td>{(point.t / 1000).toFixed(1)}</td>
              <td>{point.value.toFixed(decimals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
