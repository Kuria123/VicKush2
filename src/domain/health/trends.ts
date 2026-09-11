/**
 * Detecting a direction in a parameter across sessions.
 *
 * This is what makes health a history rather than a snapshot: a battery at
 * 12.1 V in one scan is a reading, but 12.7 → 12.6 → 12.4 → 12.2 → 12.1 is a
 * story, and the second is what a technician acts on.
 *
 * The detector is deliberately conservative. Three scans of a vehicle are not
 * a statistical sample, so it reports a direction only when the movement is
 * consistent AND large enough to exceed ordinary scan-to-scan variation. It
 * would rather say STABLE about a real decline than announce a decline that
 * is measurement noise — the second erodes trust in every other number the
 * product shows.
 */

export interface TrendPoint {
  at: Date;
  value: number;
}

export type TrendDirection = 'DECLINING' | 'RISING' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface TrendResult {
  direction: TrendDirection;
  /** Last value minus first. Signed, in the parameter's own unit. */
  delta: number;
  first: number;
  last: number;
  points: number;
  /** Fraction of steps moving in the reported direction, 0–1. */
  consistency: number;
  span: { from: Date; to: Date } | null;
}

export interface TrendOptions {
  /** Movement below this is not reported as a direction. */
  minimumDelta: number;
  /** Fraction of steps that must agree. */
  minimumConsistency?: number;
  /** Fewer points than this and no direction is claimed. */
  minimumPoints?: number;
}

const DEFAULT_MINIMUM_POINTS = 3;
/**
 * Three quarters of the steps must move the same way.
 *
 * 0.6 was too weak: a pure zigzag over five steps reaches exactly 3/5, so an
 * oscillating series that happened to end low was reported as a decline. At
 * 0.75 a five-step series needs four steps agreeing, which a zigzag cannot
 * reach.
 */
const DEFAULT_MINIMUM_CONSISTENCY = 0.75;

export function detectTrend(
  points: readonly TrendPoint[],
  options: TrendOptions,
): TrendResult {
  const minimumPoints = options.minimumPoints ?? DEFAULT_MINIMUM_POINTS;
  const minimumConsistency = options.minimumConsistency ?? DEFAULT_MINIMUM_CONSISTENCY;

  const ordered = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (ordered.length < minimumPoints) {
    return {
      direction: 'INSUFFICIENT_DATA',
      delta: 0,
      first: ordered[0]?.value ?? 0,
      last: ordered[ordered.length - 1]?.value ?? 0,
      points: ordered.length,
      consistency: 0,
      span: null,
    };
  }

  const first = ordered[0]!.value;
  const last = ordered[ordered.length - 1]!.value;
  const delta = last - first;

  // How much of the movement is in one direction, rather than wandering.
  let down = 0;
  let up = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const step = ordered[i]!.value - ordered[i - 1]!.value;
    if (step < 0) down += 1;
    else if (step > 0) up += 1;
  }
  const steps = ordered.length - 1;
  const consistency = Math.max(down, up) / steps;

  const span = {
    from: ordered[0]!.at,
    to: ordered[ordered.length - 1]!.at,
  };

  const base = { delta, first, last, points: ordered.length, consistency, span };

  if (Math.abs(delta) < options.minimumDelta) {
    return { ...base, direction: 'STABLE' };
  }
  if (consistency < minimumConsistency) {
    // Moved far, but wandered getting there. That is not a trend.
    return { ...base, direction: 'STABLE' };
  }

  return { ...base, direction: delta < 0 ? 'DECLINING' : 'RISING' };
}
