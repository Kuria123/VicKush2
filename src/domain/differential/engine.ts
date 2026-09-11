import type { DiagnosticAnalysis, Evidence, FindingSystem } from '../diagnostics';

import {
  CAUSE_CATALOGUE,
  CAUSE_MIXTURE_DIRECTION,
  type CandidateCauseDefinition,
} from './causes';
import {
  discriminatorsFor,
  missingObservationSteps,
  type DiscriminatingStep,
} from './discriminators';

/**
 * Differential diagnosis: from findings to ranked candidate causes.
 *
 * The engine is deterministic and the score is a transparent sum, exactly as
 * the vehicle identification confidence is. Every point a cause holds carries
 * the observation that awarded it and the reason, so a ranking can always be
 * walked back to measurements. Nothing here generates a number.
 *
 * The three things it will not do:
 *
 * - **It will not name a part.** A cause is a mechanism. Deciding which
 *   component is responsible needs inspection this product has not done, and
 *   recommending one from a scan alone is the premature parts recommendation
 *   the project rules forbid (Rule 9).
 * - **It will not pick a winner it cannot justify.** When the leaders are
 *   close the verdict is `AMBIGUOUS`, and the output is the observation that
 *   would separate them rather than the more likely of the two.
 * - **It will not read meaning into a fault code.** This build has no
 *   authoritative DTC table, so causes are matched on measurements. Codes are
 *   reported by Stage 9 as corroboration; they never select a mechanism here.
 */

export type CauseStatus =
  /** Evidence positively supports it. */
  | 'SUPPORTED'
  /** Not excluded, but nothing yet argues for it either. */
  | 'POSSIBLE'
  /** An observation is incompatible with it. */
  | 'RULED_OUT';

export interface Contribution {
  /** The observation responsible, so the claim can be checked. */
  evidenceId: string;
  /** What that observation said, carried through verbatim. */
  observation: string;
  points: number;
  reason: string;
}

export interface RankedCause {
  id: string;
  label: string;
  system: FindingSystem;
  mechanism: string;
  status: CauseStatus;
  /**
   * Share of the evidence this cause could have earned that it actually did,
   * 0–100. It is a measure of how well the observations fit the mechanism —
   * not a probability, and deliberately not presented as one.
   */
  confidence: number;
  contributions: readonly Contribution[];
  /** Observations incompatible with the cause, with the reason each excludes it. */
  exclusions: readonly Contribution[];
  /** Observations the cause predicts that this session did not make. */
  unmet: readonly string[];
  /**
   * Whether the observation that *defines* this cause — its heaviest — was
   * actually made.
   *
   * A cause can otherwise accumulate a respectable score from corroboration
   * alone. "Fuel short at delivery" is supported by normal rail pressure and
   * a correct airflow reading, but without a pressure reading those two say
   * only "nothing else is wrong", which is not the same as evidence for it.
   * Leading with such a cause would present the absence of a measurement as
   * though it were a finding.
   */
  keyObservationMade: boolean;
}

export type DifferentialVerdict =
  /** One cause fits clearly better than the rest. */
  | 'SINGLE_LEADING'
  /** Two or more fit equally well; the evidence does not separate them. */
  | 'AMBIGUOUS'
  /** Nothing in the catalogue fits what was observed. */
  | 'INSUFFICIENT';

export interface Differential {
  verdict: DifferentialVerdict;
  /** Viable causes, best fit first. */
  causes: readonly RankedCause[];
  /** Causes an observation positively excluded — kept, because that is a result. */
  ruledOut: readonly RankedCause[];
  /** What to measure next, to separate the leaders or settle an open cause. */
  nextSteps: readonly DiscriminatingStep[];
  limitations: readonly string[];
}

/**
 * How close two causes must be before the engine refuses to choose.
 *
 * Set from the pair this exists to handle: a supply fault and a delivery
 * fault look alike in the trims, and when rail pressure is missing they end
 * up within a few points of each other. Anything under this margin is not a
 * distinction the measurements support.
 */
const AMBIGUITY_MARGIN = 15;

/** Below this a cause has nothing meaningful arguing for it. */
const SUPPORTED_THRESHOLD = 30;

export function differentiate(analysis: DiagnosticAnalysis): Differential {
  const byId = new Map(analysis.evidence.map((e) => [e.id, e]));
  const observedIds = new Set(byId.keys());

  const evaluated = CAUSE_CATALOGUE.map((definition) =>
    evaluate(definition, analysis, byId),
  ).filter((result): result is RankedCause => result !== null);

  const ruledOut = evaluated
    .filter((c) => c.status === 'RULED_OUT')
    .sort((a, b) => b.confidence - a.confidence);

  const causes = evaluated
    .filter((c) => c.status !== 'RULED_OUT')
    .sort((a, b) => b.confidence - a.confidence);

  const verdict = decide(causes);
  const contending = contenders(causes, verdict);

  const nextSteps = [
    ...discriminatorsFor(contending.map((c) => c.id)),
    ...missingObservationSteps(
      causes.map((c) => c.id),
      observedIds,
    ),
  ];

  return {
    verdict,
    causes,
    ruledOut,
    nextSteps,
    limitations: limitationsFor(analysis, verdict),
  };
}

/* -------------------------------------------------------------------------
 * Scoring
 * ---------------------------------------------------------------------- */

function evaluate(
  definition: CandidateCauseDefinition,
  analysis: DiagnosticAnalysis,
  byId: ReadonlyMap<string, Evidence>,
): RankedCause | null {
  const evidence = [...byId.values()];

  // A cause whose required observation was never made is not on the table at
  // all. It is not a weak candidate — there is nothing to rank.
  for (const expectation of definition.expectations) {
    if (expectation.role !== 'REQUIRED') continue;
    if (!evidence.some((e) => expectation.pattern.test(e.id))) return null;
  }

  // Mixture direction is carried in the measured value, not the evidence id,
  // so a lean cause must not be raised by a rich reading and the reverse.
  const direction = CAUSE_MIXTURE_DIRECTION[definition.id];
  if (direction && !mixtureMatches(evidence, direction)) return null;

  const contributions: Contribution[] = [];
  const exclusions: Contribution[] = [];
  const unmet: string[] = [];
  let earned = 0;
  let available = 0;

  for (const expectation of definition.expectations) {
    const match = evidence.find((e) => expectation.pattern.test(e.id));

    if (expectation.role === 'CONTRADICTS') {
      if (match) {
        exclusions.push({
          evidenceId: match.id,
          observation: match.summary,
          points: 0,
          reason: expectation.reason,
        });
      }
      continue;
    }

    available += expectation.weight;

    if (match) {
      earned += expectation.weight;
      if (expectation.weight > 0) {
        contributions.push({
          evidenceId: match.id,
          observation: match.summary,
          points: expectation.weight,
          reason: expectation.reason,
        });
      }
    } else if (expectation.weight > 0) {
      unmet.push(expectation.reason);
    }
  }

  const confidence = available === 0 ? 0 : Math.round((earned / available) * 100);

  // The defining observation is the heaviest one the cause predicts.
  const key = definition.expectations
    .filter((e) => e.role !== 'CONTRADICTS' && e.weight > 0)
    .sort((a, b) => b.weight - a.weight)[0];
  const keyObservationMade =
    key === undefined || evidence.some((e) => key.pattern.test(e.id));

  return {
    id: definition.id,
    label: definition.label,
    system: definition.system,
    mechanism: definition.mechanism,
    status:
      exclusions.length > 0
        ? 'RULED_OUT'
        : confidence >= SUPPORTED_THRESHOLD
          ? 'SUPPORTED'
          : 'POSSIBLE',
    confidence,
    contributions,
    exclusions,
    unmet,
    keyObservationMade,
  };
}

/**
 * Whether the mixture actually ran in the direction a cause requires.
 *
 * Combined trim above zero means the ECU is adding fuel, so the mixture it
 * measured was lean; below zero, rich.
 */
function mixtureMatches(
  evidence: readonly Evidence[],
  direction: 'LEAN' | 'RICH',
): boolean {
  const levels = evidence
    .filter((e) => e.id.startsWith('trim-level-'))
    .flatMap((e) => e.measured.filter((m) => m.label === 'Mean combined trim'));

  if (levels.length === 0) return false;
  return direction === 'LEAN'
    ? levels.some((m) => m.value > 0)
    : levels.some((m) => m.value < 0);
}

/* -------------------------------------------------------------------------
 * Verdict
 * ---------------------------------------------------------------------- */

function decide(causes: readonly RankedCause[]): DifferentialVerdict {
  const supported = causes.filter((c) => c.status === 'SUPPORTED');
  if (supported.length === 0) return 'INSUFFICIENT';
  if (supported.length === 1) return 'SINGLE_LEADING';

  const [first, second] = supported;

  // A leader whose defining observation was never made has not out-argued the
  // field; the measurement that would decide simply was not taken. Saying so
  // is the honest verdict, and the next steps then name that measurement.
  if (!first!.keyObservationMade) return 'AMBIGUOUS';

  return first!.confidence - second!.confidence >= AMBIGUITY_MARGIN
    ? 'SINGLE_LEADING'
    : 'AMBIGUOUS';
}

/**
 * The causes still genuinely in contention.
 *
 * On an ambiguous verdict that is every supported cause within the margin of
 * the leader — those are the ones a next step has to separate. On a clear
 * verdict there is nothing to separate, but a cause still sitting close
 * behind the leader is worth a confirming measurement.
 */
function contenders(
  causes: readonly RankedCause[],
  verdict: DifferentialVerdict,
): RankedCause[] {
  if (verdict === 'INSUFFICIENT') return [];

  const supported = causes.filter((c) => c.status === 'SUPPORTED');
  const leader = supported[0];
  if (!leader) return [];

  return supported.filter(
    (c) =>
      leader.confidence - c.confidence < AMBIGUITY_MARGIN ||
      // Still in contention for the other reason: the reading that would
      // settle it was never taken, so its lower score reflects a gap in the
      // scan rather than a gap in the case for it.
      !c.keyObservationMade,
  );
}

function limitationsFor(
  analysis: DiagnosticAnalysis,
  verdict: DifferentialVerdict,
): string[] {
  const out = [...analysis.limitations];

  out.push(
    'Candidate causes are ranked from measurements only. Stored fault codes are reported alongside them but are not interpreted, because this build has no authoritative table of code meanings.',
  );
  out.push(
    'A cause names a mechanism, not a component. Confirming which part is responsible needs physical inspection that a scan cannot perform.',
  );

  if (verdict === 'AMBIGUOUS') {
    out.push(
      'The readings captured do not separate the leading causes. The steps listed are what would.',
    );
  }

  return out;
}
