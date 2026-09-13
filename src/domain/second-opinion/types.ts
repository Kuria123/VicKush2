import type { HealthSystem } from '../health';

/**
 * Second opinion on a recommendation someone else has made.
 *
 * The spec calls this a major differentiator, and the thing that makes it one
 * is the sentence it is able to produce:
 *
 *   "Insufficient evidence to confirm this component has failed."
 *
 * Three decisions protect that.
 *
 * **The assessment is deterministic, not generated.** It is computed from the
 * same evidence the differential used. Asking a language model whether a
 * mechanic is right would replace one unverifiable opinion with another, which
 * is the opposite of the point. An AI layer may explain this output; it does
 * not produce it (Rule 8).
 *
 * **Absence of evidence is never evidence of absence.** `NOT_SUPPORTED`
 * requires positive contrary evidence — the scan pointing somewhere else, or
 * ruling the mechanism out. Where the scan simply cannot speak to the claim,
 * the verdict is `INSUFFICIENT_EVIDENCE`, and those are different answers.
 * Brakes and suspension are the clearest case: this build reads nothing that
 * bears on either, so it can never contradict a recommendation about them.
 *
 * **The mechanic knows things this build does not.** They have had the vehicle
 * on a ramp, heard it, driven it, and looked at parts no scan can see. Every
 * output says so. This is a second opinion on what the *data* supports, not a
 * judgement of the person, and it must never read as an accusation.
 */

export const OPINION_VERDICTS = [
  /** The scan independently points at this, and a test confirmed it. */
  'SUPPORTED',
  /** The scan points this way, but nothing has confirmed it. */
  'CONSISTENT_UNCONFIRMED',
  /** The scan points elsewhere, or rules this mechanism out. */
  'NOT_SUPPORTED',
  /** The scan cannot speak to this claim at all. */
  'INSUFFICIENT_EVIDENCE',
  /** The recommendation could not be understood well enough to assess. */
  'UNRECOGNISED',
] as const;
export type OpinionVerdict = (typeof OPINION_VERDICTS)[number];

/**
 * What the recommendation appears to be about.
 *
 * Derived by matching against a known vocabulary, never inferred loosely. A
 * recommendation this build cannot place is reported as unrecognised rather
 * than guessed at — assessing the wrong component would be worse than
 * declining to assess.
 */
export interface RecognisedClaim {
  /** The matched phrase, exactly as the user wrote it. */
  matchedText: string;
  /** A neutral description of the component group. */
  component: string;
  system: HealthSystem;
  /**
   * Cause ids from the differential catalogue this component would explain.
   * Empty where the component is real but outside what a scan can assess.
   */
  relatedCauseIds: readonly string[];
  /**
   * Whether any reading this build takes bears on this component at all.
   *
   * False for brakes and suspension. A false here forces
   * `INSUFFICIENT_EVIDENCE` and makes `NOT_SUPPORTED` unreachable, which is
   * the intended behaviour rather than a limitation to work around.
   */
  assessable: boolean;
}

export interface OpinionPoint {
  /** What the scan observed, in the engine's own words. */
  observation: string;
  /** Why it bears on the recommendation. */
  significance: string;
}

export interface SecondOpinion {
  verdict: OpinionVerdict;
  /** The recommendation as submitted, unaltered. */
  recommendation: string;
  claim: RecognisedClaim | null;
  /** One line stating the conclusion, in careful language. */
  summary: string;
  /** Evidence consistent with the recommendation. */
  supporting: readonly OpinionPoint[];
  /** Evidence that argues against it. Empty is meaningful and is shown. */
  opposing: readonly OpinionPoint[];
  /**
   * What would settle it — a measurement, never a second garage.
   */
  suggestedChecks: readonly string[];
  /**
   * What this opinion cannot account for. Always populated, and always
   * includes that the mechanic has information this build does not.
   */
  limitations: readonly [string, ...string[]];
}

export const VERDICT_LABELS: Record<OpinionVerdict, string> = {
  SUPPORTED: 'The scan supports this',
  CONSISTENT_UNCONFIRMED: 'Consistent, but not confirmed',
  NOT_SUPPORTED: 'The scan points elsewhere',
  INSUFFICIENT_EVIDENCE: 'Not enough evidence either way',
  UNRECOGNISED: 'Could not be assessed',
};
