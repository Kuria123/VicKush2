import { isInformative, type ConfirmedDifferential } from '../confirmation';
import type { DiagnosticAnalysis } from '../diagnostics';

import { recogniseClaim } from './components';
import type { OpinionPoint, SecondOpinion, OpinionVerdict } from './types';

/**
 * Assessing a recommendation against what the scan actually found.
 *
 * Deterministic throughout. The verdict is computed from the same ranked
 * causes the differential produced, so a user can check it the same way they
 * check the diagnosis — by reading the evidence underneath it.
 *
 * The rule that shapes the branching: **absence of evidence is never evidence
 * of absence.** `NOT_SUPPORTED` is reachable only with positive contrary
 * evidence — the cause ruled out by an observation, or the scan pointing
 * clearly somewhere else. Everything short of that is
 * `INSUFFICIENT_EVIDENCE`, which is a different answer and is written to read
 * like one.
 */

export interface SecondOpinionInput {
  /** Exactly as the user submitted it. */
  recommendation: string;
  analysis: DiagnosticAnalysis | null;
  differential: ConfirmedDifferential | null;
}

/** Always stated, whatever the verdict. */
const MECHANIC_KNOWS_MORE =
  'Whoever inspected the vehicle has information this build does not: they have seen it on a ramp, heard it running and examined parts no scan can reach. This assesses what the scan data supports, not whether they are right.';

const NOT_A_PRICE_OPINION =
  'Nothing here is an opinion on what the work should cost, or on whether it is worth doing.';

export function evaluateRecommendation(input: SecondOpinionInput): SecondOpinion {
  const recommendation = input.recommendation.trim();
  const claim = recogniseClaim(recommendation);

  /* --- Could not place it ------------------------------------------- */
  if (!claim) {
    return {
      verdict: 'UNRECOGNISED',
      recommendation,
      claim: null,
      summary:
        'This build could not work out which component the recommendation is about, so it has not assessed it. Assessing the wrong component would be worse than declining to.',
      supporting: [],
      opposing: [],
      suggestedChecks: [
        'Name the component directly — for example "replace the mass airflow sensor" or "new thermostat" — and submit it again.',
      ],
      limitations: [MECHANIC_KNOWS_MORE, NOT_A_PRICE_OPINION],
    };
  }

  /* --- Nothing this build reads bears on it -------------------------- */
  if (!claim.assessable) {
    return {
      verdict: 'INSUFFICIENT_EVIDENCE',
      recommendation,
      claim,
      summary: `Insufficient evidence to confirm or contradict this. Nothing this build reads bears on ${claim.component}, so the scan cannot speak to the recommendation either way.`,
      supporting: [],
      opposing: [],
      suggestedChecks: [
        `A physical inspection is the only thing that can assess ${claim.component}. This build reads engine management data over OBD, which does not include it.`,
      ],
      limitations: [
        `This is not disagreement. A scan that cannot see ${claim.component} has no basis for an opinion about it, and silence here would read as doubt where none is warranted.`,
        MECHANIC_KNOWS_MORE,
        NOT_A_PRICE_OPINION,
      ],
    };
  }

  /* --- No scan to compare against ------------------------------------ */
  if (!input.analysis || !input.differential || input.analysis.sampleCount === 0) {
    return {
      verdict: 'INSUFFICIENT_EVIDENCE',
      recommendation,
      claim,
      summary:
        'Insufficient evidence to assess this. No scan has been recorded, so there is nothing to compare the recommendation against.',
      supporting: [],
      opposing: [],
      suggestedChecks: [
        'Run a scan covering both idle and a raised engine speed, and save it. The comparison needs recorded readings.',
      ],
      limitations: [MECHANIC_KNOWS_MORE, NOT_A_PRICE_OPINION],
    };
  }

  return assess(recommendation, claim, input.differential);
}

function assess(
  recommendation: string,
  claim: NonNullable<SecondOpinion['claim']>,
  differential: ConfirmedDifferential,
): SecondOpinion {
  const supporting: OpinionPoint[] = [];
  const opposing: OpinionPoint[] = [];

  const related = differential.causes.filter((cause) =>
    claim.relatedCauseIds.includes(cause.id),
  );
  const ruledOut = differential.ruledOut.filter((cause) =>
    claim.relatedCauseIds.includes(cause.id),
  );

  // The leading cause the scan actually points at, whatever was recommended.
  const leader = differential.causes.find((cause) => cause.status === 'SUPPORTED');
  const leaderMatches = leader ? claim.relatedCauseIds.includes(leader.id) : false;

  for (const cause of related) {
    if (cause.status !== 'SUPPORTED') continue;
    for (const contribution of cause.contributions) {
      supporting.push({
        observation: contribution.observation,
        significance: contribution.reason,
      });
    }
  }

  for (const cause of ruledOut) {
    for (const exclusion of cause.exclusions) {
      opposing.push({
        observation: exclusion.observation,
        significance: `This rules out "${cause.label}", which is the mechanism ${claim.component} would explain.`,
      });
    }
  }

  if (leader && !leaderMatches) {
    opposing.push({
      observation: `The readings point most clearly at "${leader.label}".`,
      significance: `That is a different mechanism from the one ${claim.component} would explain.`,
    });
  }

  const confirmed = differential.results.some((result) => isInformative(result.outcome));

  const verdict = decide({
    hasSupport: supporting.length > 0,
    hasOpposition: opposing.length > 0,
    ruledOut: ruledOut.length > 0,
    leaderMatches,
    confirmed,
  });

  return {
    verdict,
    recommendation,
    claim,
    summary: summarise(verdict, claim, leader?.label ?? null),
    supporting,
    opposing,
    suggestedChecks: checksFor(verdict, differential),
    limitations: limitationsFor(verdict, claim, confirmed),
  };
}

/**
 * The verdict.
 *
 * `NOT_SUPPORTED` needs positive contrary evidence: the mechanism ruled out by
 * an observation, or the scan pointing clearly elsewhere. Having simply found
 * nothing is not contrary evidence, and is never allowed to reach this
 * verdict.
 */
function decide(input: {
  hasSupport: boolean;
  hasOpposition: boolean;
  ruledOut: boolean;
  leaderMatches: boolean;
  confirmed: boolean;
}): OpinionVerdict {
  if (input.ruledOut) return 'NOT_SUPPORTED';

  if (input.leaderMatches && input.hasSupport) {
    return input.confirmed ? 'SUPPORTED' : 'CONSISTENT_UNCONFIRMED';
  }

  // The scan points somewhere else. That is contrary evidence, but it is not
  // the same as ruling the recommendation out: the vehicle may have two
  // faults, and the scan ranks rather than enumerates.
  if (input.hasOpposition) return 'NOT_SUPPORTED';

  if (input.hasSupport) return 'CONSISTENT_UNCONFIRMED';

  return 'INSUFFICIENT_EVIDENCE';
}

function summarise(
  verdict: OpinionVerdict,
  claim: NonNullable<SecondOpinion['claim']>,
  leaderLabel: string | null,
): string {
  switch (verdict) {
    case 'SUPPORTED':
      return `The scan points at the same mechanism ${claim.component} would explain, and a test performed on the vehicle corroborated it. This is the strongest agreement the data can offer; it still does not confirm the part itself has failed, which needs inspection.`;
    case 'CONSISTENT_UNCONFIRMED':
      return `The scan is consistent with this, but nothing has confirmed it. Insufficient evidence to confirm ${claim.component} has failed — the readings point that way, and no test has been performed to settle it.`;
    case 'NOT_SUPPORTED':
      return leaderLabel
        ? `The scan does not support this. It points at "${leaderLabel}" instead, which is a different mechanism from the one ${claim.component} would explain.`
        : `The scan does not support this: an observation rules out the mechanism ${claim.component} would explain.`;
    case 'INSUFFICIENT_EVIDENCE':
      return `Insufficient evidence to confirm ${claim.component} has failed. The scan found nothing bearing on it either way, which is not the same as finding it healthy.`;
    case 'UNRECOGNISED':
      return 'This recommendation could not be assessed.';
  }
}

function checksFor(
  verdict: OpinionVerdict,
  differential: ConfirmedDifferential,
): string[] {
  const checks: string[] = [];

  // A measurement, never a second garage. Sending someone elsewhere is not a
  // second opinion, it is passing the problem on.
  for (const offer of differential.recommended.slice(0, 2)) {
    checks.push(`${offer.test.title}: ${offer.test.question}`);
  }

  if (verdict === 'INSUFFICIENT_EVIDENCE' && checks.length === 0) {
    checks.push(
      'Scan again across both idle and a raised engine speed. A scan taken under one condition leaves most mixture questions unanswerable.',
    );
  }

  if (verdict === 'NOT_SUPPORTED') {
    checks.push(
      'Ask what was observed that the scan did not capture. A physical inspection or a road test can establish things no scan reaches, and the disagreement may be explained by that rather than by an error.',
    );
  }

  return checks;
}

function limitationsFor(
  verdict: OpinionVerdict,
  claim: NonNullable<SecondOpinion['claim']>,
  confirmed: boolean,
): readonly [string, ...string[]] {
  const limitations: string[] = [
    'A scan ranks mechanisms; it does not identify which part has failed. Even full agreement here would not establish that a specific component needs replacing.',
  ];

  if (verdict === 'NOT_SUPPORTED') {
    limitations.push(
      'A vehicle can have more than one fault. The scan ranks what it can see, so pointing elsewhere does not prove this recommendation wrong.',
    );
  }

  if (!confirmed && verdict !== 'UNRECOGNISED') {
    limitations.push(
      'No confirmation test has been recorded, so this rests on passive readings alone.',
    );
  }

  if (claim.relatedCauseIds.length === 0) {
    limitations.push(
      `No mechanism in this build's catalogue corresponds directly to ${claim.component}, so the assessment is based on what the scan found generally rather than on a matching candidate.`,
    );
  }

  limitations.push(MECHANIC_KNOWS_MORE, NOT_A_PRICE_OPINION);

  return limitations as [string, ...string[]];
}
