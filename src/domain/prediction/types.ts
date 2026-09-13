import type { HealthSystem } from '../health';

/**
 * Predictive maintenance.
 *
 * The brief states the requirement as a contrast rather than a feature:
 *
 *   "Battery health declining."  — yes
 *   "Battery definitely failed." — no
 *
 * Everything here follows from that. A signal reports a **direction observed
 * in recorded data**, and stops. It does not name a component as failed, does
 * not predict when something will fail, and does not estimate remaining life —
 * three scans of one vehicle cannot support any of those, and a product that
 * offers them is selling confidence it does not have.
 *
 * So each signal carries a `notClaiming` field. That is unusual, and
 * deliberate: the most likely way this feature does harm is a reader
 * completing the sentence themselves, and the cheapest defence is to finish it
 * for them.
 */

export const SIGNAL_KINDS = [
  'VOLTAGE_DECLINE',
  'TEMPERATURE_RISE',
  'FUEL_TRIM_DRIFT',
  'IDLE_STABILITY_DECLINE',
  'FUEL_PRESSURE_DECLINE',
  'REPEATED_DTC',
  'RISING_FAULT_FREQUENCY',
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * How much the history supports the signal.
 *
 * A function of how many scans it rests on and how consistent they were —
 * never of how serious the thing would be if true. Severity and evidence are
 * different questions, and conflating them is how a weak observation about
 * something alarming becomes a strong claim.
 */
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG';

export interface MeasuredPoint {
  at: Date;
  value: number;
}

export interface PredictiveSignal {
  id: string;
  kind: SignalKind;
  /**
   * The system it bears on, or null where it genuinely bears on none.
   *
   * A rising count of findings across scans is not about the engine or the
   * fuel system; attributing it to one to avoid a null would be a small lie
   * with no upside.
   */
  system: HealthSystem | null;
  /** One line, in the brief's own register: a direction, not a prognosis. */
  headline: string;
  /** The series and the span it was measured over, so the claim can be checked. */
  detail: string;
  strength: SignalStrength;
  /** The readings behind it, oldest first. Empty for count-based signals. */
  series: readonly MeasuredPoint[];
  unit: string | null;
  /**
   * What this signal explicitly does not say.
   *
   * Shown to the reader, not just documented here.
   */
  notClaiming: string;
  /** An observation that would establish more. Never a part to fit. */
  suggestedCheck: string;
  scansConsidered: number;
}

export interface PredictiveReport {
  signals: readonly PredictiveSignal[];
  /** Scans the report drew on. */
  scansConsidered: number;
  /** Days between the oldest and newest scan, or null with fewer than two. */
  spanDays: number | null;
  /**
   * What this report could not assess, and why. Always populated — including
   * when there is not enough history to assess anything at all.
   */
  limitations: readonly [string, ...string[]];
}

export const SIGNAL_STRENGTH_LABELS: Record<SignalStrength, string> = {
  WEAK: 'Weak evidence',
  MODERATE: 'Moderate evidence',
  STRONG: 'Strong evidence',
};
