import { alignSamples, statsByCondition } from './analysis';
import type { DiagnosticSession } from './session';

/**
 * Reduces a session to what is worth keeping.
 *
 * A scan holds roughly 900 points across eighteen parameters. Persisting every
 * one would be tens of thousands of rows per session for data nothing reads
 * back — the raw buffer exists to draw a live chart, and it can die with the
 * page.
 *
 * What survives is the per-condition summary, for two reasons: it is what the
 * analysis itself consumes, and it is the only shape a trend across months can
 * be built from. "Battery voltage has declined across three sessions" is these
 * rows read in order.
 *
 * A parameter that never carried a value under a condition produces no row.
 * Absence stays absence (Rule 1).
 */

export interface StoredParameterStat {
  parameterId: string;
  condition: string;
  samples: number;
  mean: number;
  min: number;
  max: number;
  unit: string | null;
}

export function summariseForStorage(session: DiagnosticSession): StoredParameterStat[] {
  const samples = alignSamples(session);
  if (samples.length === 0) return [];

  const units = new Map(
    session.allTracks().map((track) => [track.parameterId, track.unit ?? null]),
  );

  const out: StoredParameterStat[] = [];

  for (const track of session.allTracks()) {
    for (const stat of statsByCondition(samples, track.parameterId)) {
      out.push({
        parameterId: track.parameterId,
        condition: stat.condition,
        samples: stat.samples,
        mean: round(stat.mean),
        min: round(stat.min),
        max: round(stat.max),
        unit: units.get(track.parameterId) ?? null,
      });
    }
  }

  return out;
}

/** Four decimals: enough for a lambda reading, short of storing float noise. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
