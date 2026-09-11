/**
 * Vehicle health, expressed as a score that can always be explained.
 *
 * The rule that shapes this whole folder: **never produce an unexplained
 * number.** A score is not a judgement the engine makes and then justifies; it
 * is the arithmetic result of a list of reasons, each carrying the evidence
 * that produced it and the points it cost. Remove the reasons and there is no
 * score left — which is the intended property.
 *
 * The second rule matters just as much: **a system with no evidence has no
 * score.** Braking and suspension appear in the spec's list and this build can
 * say nothing about either — OBD-II Mode 01 carries no brake or chassis data,
 * and no ABS module is read. Scoring them anyway would be the single most
 * dangerous thing this product could do: "Braking health: 92" is a safety
 * claim invented from nothing. They return NOT_ASSESSED, with the reason.
 */

export const HEALTH_SYSTEMS = [
  'ENGINE',
  'TRANSMISSION',
  'ELECTRICAL',
  'COOLING',
  'FUEL',
  'BRAKING',
  'SUSPENSION',
] as const;
export type HealthSystem = (typeof HEALTH_SYSTEMS)[number];

export const HEALTH_SYSTEM_LABELS: Record<HealthSystem, string> = {
  ENGINE: 'Engine',
  TRANSMISSION: 'Transmission',
  ELECTRICAL: 'Electrical',
  COOLING: 'Cooling',
  FUEL: 'Fuel',
  BRAKING: 'Braking',
  SUSPENSION: 'Suspension',
};

export type HealthStatus =
  /** Evidence exists and a score was computed from it. */
  | 'ASSESSED'
  /** Nothing was measured that bears on this system. There is no score. */
  | 'NOT_ASSESSED';

export type ReasonKind =
  /** A finding from a single recorded diagnosis. */
  | 'FINDING'
  /** A direction in a parameter across several sessions. */
  | 'TREND'
  /** Readings were taken and nothing abnormal was found. */
  | 'CLEAR_OBSERVATION';

export interface HealthReason {
  kind: ReasonKind;
  /** One line, in plain language, stating what was observed. */
  summary: string;
  /** How it was established, including the numbers behind it. */
  detail: string;
  /**
   * Points deducted. Zero for a reason that explains why the score is high
   * rather than why it is low — those are stated too, or a perfect score
   * would be the one number with no explanation at all.
   */
  deduction: number;
  /** When the evidence is from one scan; null for a trend across several. */
  observedAt: Date | null;
}

export interface SystemHealth {
  system: HealthSystem;
  status: HealthStatus;
  /** 0–100, or null when NOT_ASSESSED. Never a placeholder. */
  score: number | null;
  /**
   * Why the score is what it is. Always populated — including when nothing is
   * wrong, and including when the system could not be assessed at all.
   */
  reasons: readonly HealthReason[];
  /** Scans that contributed. Zero means the score rests on nothing. */
  sessionsConsidered: number;
}

export interface VehicleHealth {
  systems: readonly SystemHealth[];
  /**
   * Mean of the systems that were actually assessed, or null when none were.
   *
   * Deliberately NOT an average over all seven: including unassessed systems
   * as either 0 or 100 would let a system nobody measured move the headline
   * number, in one direction or the other.
   */
  overall: number | null;
  assessedCount: number;
  /** Newest scan considered, so the figure can be dated. */
  latestSessionAt: Date | null;
}

/** Bands for presentation. Thresholds are stated, not hidden in a component. */
export function healthBand(score: number): 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL' {
  if (score >= 85) return 'GOOD';
  if (score >= 65) return 'FAIR';
  if (score >= 40) return 'POOR';
  return 'CRITICAL';
}
