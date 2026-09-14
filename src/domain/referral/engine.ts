import { CONFIRMATION_TESTS } from '@/domain/confirmation';

import type {
  ReferralCandidate,
  ReferralCode,
  ReferralConcern,
  ReferralConfirmation,
  ReferralInput,
  ReferralObservation,
  ReferralRepair,
  ReferralReport,
} from './types';

/**
 * Builds the report a mechanic receives.
 *
 * Deterministic and total. Every sentence in the output either came from a
 * recorded observation or is one of the fixed caveats below — there is no
 * branch where a figure, a symptom or a component name can be introduced.
 *
 * The engine is also deliberately unable to *improve* the picture. It cannot
 * fill a missing concern, upgrade a repair verdict, or interpret a code. When
 * the vehicle has nothing recorded, the report says so and is still a valid
 * report; an empty one handed over honestly is better than a full one that
 * invented its contents, because the mechanic will act on this.
 */

const REPAIR_OUTCOMES = {
  CONSISTENT_WITH_REPAIR:
    'The scan afterwards moved the way a successful repair would move it. Not proof the fault will not return.',
  NOT_DEMONSTRATED:
    'The scan afterwards showed no meaningful change. The work has not been shown to have helped.',
  WORSENED: 'Something measured worse after the work than before it.',
  INCONCLUSIVE:
    'The two scans could not be compared usefully, so the work was neither confirmed nor ruled out.',
} as const;

export function buildReferralReport(input: ReferralInput): ReferralReport {
  const concern: ReferralConcern =
    input.concern && input.concern.trim().length > 0
      ? { stated: true, words: input.concern.trim() }
      : {
          stated: false,
          /*
           * Never inferred from the findings. A measurement is not a
           * complaint, and presenting one as the reason for the visit would
           * put words in the owner's mouth that the mechanic would then act
           * on.
           */
          reason:
            'The owner has not described a symptom. What follows is what the scan measured, not a reported complaint.',
        };

  const observations: ReferralObservation[] = input.findings.flatMap((finding) =>
    finding.supporting.map((observation) => ({
      finding: finding.title,
      severity: finding.severity,
      observation,
    })),
  );

  const codes: readonly ReferralCode[] = input.codes.map((dtc) => ({
    code: dtc.code,
    status: dtc.status,
    // Always false. The field exists to say so rather than to vary.
    interpreted: false,
  }));

  /*
   * Ruled-out causes are excluded here, not because exclusion is unimportant
   * — it appears in the limitations — but because a mechanic reading a list of
   * candidates will weigh every line on it, and a mechanism the evidence
   * positively excluded should not be taking up their attention.
   */
  const candidates: readonly ReferralCandidate[] = input.causes
    .filter((cause) => cause.status !== 'RULED_OUT')
    .map((cause) => ({
      label: cause.label,
      mechanism: cause.mechanism,
      confidence: cause.confidence,
      keyObservationMade: cause.keyObservationMade,
    }));

  const recommendedConfirmation = recommend(input);

  const previousRepairs: readonly ReferralRepair[] = input.repairs.map((repair) => ({
    performedAt: repair.performedAt,
    summary: repair.summary,
    verdict: repair.verdict,
    outcome: repair.verdict
      ? REPAIR_OUTCOMES[repair.verdict]
      : 'No scan has been recorded since this work, so its effect is unknown.',
  }));

  return {
    preparedAt: input.preparedAt,
    vehicle: input.vehicle,
    concern,
    scan: input.scan,
    verdict: input.verdict,
    observations,
    codes,
    candidates,
    recommendedConfirmation,
    previousRepairs,
    limitations: limitationsFor(input),
    notClaiming: [
      'This report does not name a failed component. Identifying one needs physical inspection, which a scan cannot do.',
      'Fault codes are listed by identifier only. This build has no authoritative meaning table and has not interpreted them.',
      'Nothing here is a repair authorisation, a price, or a statement about whether the vehicle is safe to drive.',
      'The mechanic has the vehicle. This report is evidence to start from, not a conclusion to work back from.',
    ],
  };
}

/**
 * Tests worth performing, given what the evidence left open.
 *
 * Computed now rather than read from the stored diagnosis, and that is a
 * deliberate difference from how a diagnosis is treated. A stored diagnosis
 * must keep saying what the owner was told at the time; a recommendation is
 * about what to do next, and the honest version of it is the one made against
 * the catalogue as it stands today.
 *
 * A test already performed is not offered again. Doing so would ask a mechanic
 * to repeat work whose result is in this very report.
 */
function recommend(input: ReferralInput): readonly ReferralConfirmation[] {
  const done = new Set(input.testsPerformed);
  const open = new Set(
    input.causes.filter((cause) => cause.status !== 'RULED_OUT').map((cause) => cause.id),
  );

  return CONFIRMATION_TESTS.filter(
    (test) => !done.has(test.id) && test.addresses.some((causeId) => open.has(causeId)),
  ).map((test) => ({ testId: test.id, name: test.title, question: test.question }));
}

/**
 * What the report does not establish.
 *
 * Assembled rather than listed, because the limits depend on what was actually
 * captured — but it can never come back empty. The three fixed entries are
 * true of every report this build can produce, and the return type is a
 * non-empty tuple so a caller cannot render a report without them.
 */
function limitationsFor(input: ReferralInput): readonly [string, ...string[]] {
  const limits: string[] = [
    'Readings come from the standard emissions-related data set. No manufacturer-specific parameters were read.',
    'Braking and suspension were not assessed at all: no brake or chassis data is available over this interface.',
  ];

  if (input.scan?.isSimulated) {
    /*
     * First, and unmissable. Everything downstream of this line was produced
     * by a model of an engine rather than by the vehicle in front of the
     * mechanic, and a mechanic acting on it would be working from fiction
     * (Rule 2). The wording is blunt on purpose.
     */
    limits.unshift(
      'SIMULATION MODE — these readings came from a simulator, not from this vehicle. They must not be used to make a repair decision.',
    );
  }

  if (!input.scan) {
    limits.push('No scan has been saved for this vehicle, so there are no measurements to report.');
  } else if (input.scan.conditionsObserved.length > 0) {
    limits.push(
      `The scan covered ${input.scan.conditionsObserved.join(', ').toLowerCase()} only. Anything that appears under other conditions would not have been seen.`,
    );
  }

  const ruledOut = input.causes.filter((cause) => cause.status === 'RULED_OUT');
  if (ruledOut.length > 0) {
    limits.push(
      `Excluded by measurement, and not listed as candidates: ${ruledOut.map((cause) => cause.label).join('; ')}.`,
    );
  }

  for (const limitation of input.diagnosisLimitations) limits.push(limitation);

  // The array is built above and is never empty; the assertion states what the
  // two unconditional entries already guarantee.
  return limits as [string, ...string[]];
}
