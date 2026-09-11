import { isInformative, type ConfirmedDifferential } from '../confirmation';

/**
 * When a repair guide may be offered at all.
 *
 * This file is what keeps Rule 9 intact once repair guides exist. Every stage
 * before this one deliberately stopped short of naming a component, because a
 * scan establishes a mechanism and nothing more. A guide names one — so it is
 * gated behind the thing that actually earns it: a confirmed cause.
 *
 * Three conditions, all required:
 *
 * 1. The differential settled on a single leading cause. AMBIGUOUS means two
 *    mechanisms fit equally, and there is no guide for "one of these two".
 * 2. That cause's defining observation was actually made. A leader resting on
 *    corroboration alone has not been established.
 * 3. A confirmation test was performed with an informative outcome. This is
 *    the one that matters: the passive scan proposes, the deliberate
 *    measurement disposes. `UNABLE_TO_PERFORM` and `SKIP` do not count, for
 *    the same reason they never move a ranking.
 *
 * Failing any of them is not an error. It is the normal state of most
 * diagnoses, and the caller is told which condition is missing so the user can
 * see what would unlock it.
 */

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_CONFIRMED';

export interface GuideEligibility {
  status: EligibilityStatus;
  /** The confirmed cause, when there is one. */
  causeId: string | null;
  causeLabel: string | null;
  /** Why a guide is or is not available, in plain language. */
  reason: string;
  /** What would make it available. Null when it already is. */
  unlockedBy: string | null;
}

export function assessGuideEligibility(
  differential: ConfirmedDifferential,
): GuideEligibility {
  if (differential.verdict === 'INSUFFICIENT') {
    return {
      status: 'NOT_CONFIRMED',
      causeId: null,
      causeLabel: null,
      reason:
        'No cause has been established, so there is no repair to describe. A procedure offered here would be a guess about what is wrong.',
      unlockedBy: 'A scan that produces a finding, and a test that confirms its cause.',
    };
  }

  if (differential.verdict === 'AMBIGUOUS') {
    return {
      status: 'NOT_CONFIRMED',
      causeId: null,
      causeLabel: null,
      reason:
        'More than one mechanism explains these readings equally well. There is no repair procedure for “one of these two”, and picking one would be exactly the guess this product exists to avoid.',
      unlockedBy:
        'Performing the test that separates the leading causes, and recording its result.',
    };
  }

  const leader = differential.causes.find((cause) => cause.status === 'SUPPORTED');
  if (!leader) {
    return {
      status: 'NOT_CONFIRMED',
      causeId: null,
      causeLabel: null,
      reason: 'No cause is supported by the evidence.',
      unlockedBy: 'A scan that produces evidence for a mechanism.',
    };
  }

  if (!leader.keyObservationMade) {
    return {
      status: 'NOT_CONFIRMED',
      causeId: leader.id,
      causeLabel: leader.label,
      reason:
        `“${leader.label}” leads on corroborating evidence, but the observation that defines it was never made. That is not a confirmed cause.`,
      unlockedBy: 'Taking the measurement this cause turns on.',
    };
  }

  // The deliberate measurement, not the passive scan.
  const performed = differential.results.filter((result) => isInformative(result.outcome));
  if (performed.length === 0) {
    return {
      status: 'NOT_CONFIRMED',
      causeId: leader.id,
      causeLabel: leader.label,
      reason:
        `The readings point at “${leader.label}”, but no confirmation test has been performed. A scan proposes a cause; a measurement confirms it, and only a confirmed cause justifies a repair procedure.`,
      unlockedBy: 'Performing one of the recommended tests and recording the outcome.',
    };
  }

  return {
    status: 'ELIGIBLE',
    causeId: leader.id,
    causeLabel: leader.label,
    reason:
      `“${leader.label}” is supported by the readings and corroborated by ${performed.length} performed test${performed.length === 1 ? '' : 's'}.`,
    unlockedBy: null,
  };
}
