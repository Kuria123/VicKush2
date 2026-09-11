import type { DiagnosticSession } from '../session';
import {
  classifyCondition,
  type OperatingCondition,
} from '../operating-condition';

/**
 * Rebuilds per-moment snapshots from the per-parameter tracks.
 *
 * The session stores each parameter independently, which is what a live
 * display wants. Analysis needs the opposite view: what every sensor read at
 * the same instant, so a reading can be tagged with the operating condition
 * it was taken in. Because a sweep records every parameter with the same
 * timestamp, the tracks can be joined on it.
 *
 * Parameters that carried no value at a given moment are simply absent from
 * that snapshot — never zero-filled.
 */

export interface AlignedSample {
  t: number;
  values: ReadonlyMap<string, number>;
  condition: OperatingCondition;
}

export function alignSamples(session: DiagnosticSession): AlignedSample[] {
  const byTime = new Map<number, Map<string, number>>();

  for (const track of session.allTracks()) {
    for (const point of track.points) {
      let bucket = byTime.get(point.t);
      if (!bucket) {
        bucket = new Map<string, number>();
        byTime.set(point.t, bucket);
      }
      bucket.set(track.parameterId, point.value);
    }
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, values]) => ({
      t,
      values,
      condition: classifyCondition({
        rpm: values.get('ENGINE_RPM') ?? null,
        vehicleSpeed: values.get('VEHICLE_SPEED') ?? null,
        throttlePosition: values.get('THROTTLE_POSITION') ?? null,
        engineLoad: values.get('ENGINE_LOAD') ?? null,
      }),
    }));
}

export interface ConditionStats {
  condition: OperatingCondition;
  samples: number;
  mean: number;
  min: number;
  max: number;
}

/**
 * Averages one parameter within each operating condition.
 *
 * Conditions with too few samples are dropped rather than reported with a
 * mean drawn from two readings — a comparison built on noise would be worse
 * than no comparison.
 */
export function statsByCondition(
  samples: readonly AlignedSample[],
  parameterId: string,
  minimumSamples = 5,
): ConditionStats[] {
  const groups = new Map<OperatingCondition, number[]>();

  for (const sample of samples) {
    const value = sample.values.get(parameterId);
    if (value === undefined) continue;
    const list = groups.get(sample.condition) ?? [];
    list.push(value);
    groups.set(sample.condition, list);
  }

  const out: ConditionStats[] = [];
  for (const [condition, values] of groups) {
    if (values.length < minimumSamples) continue;
    out.push({
      condition,
      samples: values.length,
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }
  return out;
}

/** Combines two parameters per sample, e.g. adding short and long fuel trim. */
export function derivedStatsByCondition(
  samples: readonly AlignedSample[],
  parameterIds: readonly string[],
  combine: (values: readonly number[]) => number,
  minimumSamples = 5,
): ConditionStats[] {
  const groups = new Map<OperatingCondition, number[]>();

  for (const sample of samples) {
    const parts: number[] = [];
    let complete = true;
    for (const id of parameterIds) {
      const value = sample.values.get(id);
      if (value === undefined) {
        complete = false;
        break;
      }
      parts.push(value);
    }
    // A partial combination would silently understate the total.
    if (!complete) continue;

    const list = groups.get(sample.condition) ?? [];
    list.push(combine(parts));
    groups.set(sample.condition, list);
  }

  const out: ConditionStats[] = [];
  for (const [condition, values] of groups) {
    if (values.length < minimumSamples) continue;
    out.push({
      condition,
      samples: values.length,
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }
  return out;
}

/** Overall mean of a parameter, or null when it never produced a value. */
export function meanOf(
  samples: readonly AlignedSample[],
  parameterId: string,
): number | null {
  let sum = 0;
  let count = 0;
  for (const sample of samples) {
    const value = sample.values.get(parameterId);
    if (value === undefined) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}
