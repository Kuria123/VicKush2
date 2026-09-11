import {
  contenders,
  decide,
  type Contribution,
  type Differential,
  type RankedCause,
} from '../differential';

import { isInformative, OUTCOME_LABELS, type TestResult } from './outcomes';
import { CONFIRMATION_TESTS, getTest, type ConfirmationTest } from './tests';

/**
 * The confirmation test engine.
 *
 * Two jobs: decide which test is worth performing next, and fold the result
 * of a performed test back into the assessment.
 *
 * The decision tree is produced rather than stored. After each result the
 * engine asks which remaining test bears on the most causes still genuinely
 * in contention, and offers that one. Enumerating every path in advance
 * would give the same sequence at far greater cost, and would go stale the
 * moment a cause or a test is added (Rule 13).
 *
 * The rule that governs everything here: **a test result is evidence, and is
 * scored exactly like any other evidence.** It is folded into the same
 * earned/available sum the differential already keeps, so there is one notion
 * of how well a cause fits rather than a scan score and a separate test
 * score that could disagree.
 */

export interface OfferedTest {
  test: ConfirmationTest;
  /** Causes still in contention that this test bears on. */
  separates: readonly string[];
  /**
   * How many contending causes it can act on. The engine offers the highest
   * first; it is a measure of what the test can settle, not a priority
   * someone assigned.
   */
  value: number;
}

export interface ConfirmedDifferential extends Differential {
  /** Results folded in, in the order they were recorded. */
  results: readonly TestResult[];
  /** Tests worth performing next, most informative first. */
  recommended: readonly OfferedTest[];
}

/* -------------------------------------------------------------------------
 * Choosing the next test
 * ---------------------------------------------------------------------- */

/**
 * Tests worth performing, given where the differential currently stands.
 *
 * A test is only offered if it bears on a cause that is still in contention.
 * Offering every test in the catalogue would bury the one or two that would
 * actually settle the question.
 */
export function recommendTests(
  differential: Differential,
  completed: readonly TestResult[] = [],
): OfferedTest[] {
  const done = new Set(
    completed.filter((r) => isInformative(r.outcome)).map((r) => r.testId),
  );

  const inContention = new Set(
    contenders(differential.causes, differential.verdict).map((c) => c.id),
  );

  // On a clear or insufficient verdict there is no contended set to work on,
  // so fall back to every cause still standing: a confirming test is still
  // worth offering, it simply is not urgent.
  const relevant =
    inContention.size > 0
      ? inContention
      : new Set(differential.causes.map((c) => c.id));

  return CONFIRMATION_TESTS.filter((test) => !done.has(test.id))
    .map((test) => {
      const separates = test.addresses.filter((causeId) => relevant.has(causeId));
      return { test, separates, value: separates.length };
    })
    .filter((offer) => offer.value > 0)
    .sort((a, b) => b.value - a.value || a.test.id.localeCompare(b.test.id));
}

/** The single most informative test remaining, or null when none applies. */
export function nextTest(
  differential: Differential,
  completed: readonly TestResult[] = [],
): OfferedTest | null {
  return recommendTests(differential, completed)[0] ?? null;
}

/* -------------------------------------------------------------------------
 * Applying results
 * ---------------------------------------------------------------------- */

export function applyTestResults(
  differential: Differential,
  results: readonly TestResult[],
): ConfirmedDifferential {
  const limitations = [...differential.limitations];

  // Causes are held in one map so a second result can act on what the first
  // one left, rather than both being applied to the original ranking.
  const working = new Map<string, RankedCause>(
    [...differential.causes, ...differential.ruledOut].map((c) => [c.id, { ...c }]),
  );

  for (const result of results) {
    const test = getTest(result.testId);

    if (!test) {
      // Rule 3: an unknown test id is a programming error upstream, and
      // silently dropping it would hide a broken caller.
      throw new Error(`Unknown confirmation test: ${result.testId}`);
    }

    if (!isInformative(result.outcome)) {
      limitations.push(
        `"${test.title}" was recorded as ${OUTCOME_LABELS[result.outcome].toLowerCase()}, so it settled nothing. ${test.question}`,
      );
      continue;
    }

    for (const implication of test.implications) {
      if (implication.outcome !== result.outcome) continue;

      const cause = working.get(implication.causeId);
      // A test result may move a cause the scan raised; it may not invent
      // one. A mechanism nothing in the readings pointed at does not become
      // a candidate because a test was run (Rule 1).
      if (!cause) continue;

      working.set(implication.causeId, apply(cause, test, result, implication));
    }
  }

  const all = [...working.values()];
  const causes = all
    .filter((c) => c.status !== 'RULED_OUT')
    .sort((a, b) => b.confidence - a.confidence);
  const ruledOut = all
    .filter((c) => c.status === 'RULED_OUT')
    .sort((a, b) => b.confidence - a.confidence);

  const verdict = decide(causes);

  return {
    verdict,
    causes,
    ruledOut,
    // Steps that named a measurement now taken are no longer next steps.
    nextSteps: differential.nextSteps.filter(
      (step) => !stepSettledBy(step.id, results),
    ),
    limitations,
    results,
    recommended: recommendTests({ ...differential, causes, ruledOut, verdict }, results),
  };
}

function apply(
  cause: RankedCause,
  test: ConfirmationTest,
  result: TestResult,
  implication: { effect: 'SUPPORTS' | 'EXCLUDES'; weight: number; reason: string },
): RankedCause {
  const entry: Contribution = {
    evidenceId: `test-${test.id}`,
    observation: result.note
      ? `${test.title}: ${OUTCOME_LABELS[result.outcome].toLowerCase()} — ${result.note}`
      : `${test.title}: ${OUTCOME_LABELS[result.outcome].toLowerCase()}.`,
    points: implication.effect === 'SUPPORTS' ? implication.weight : 0,
    reason: implication.reason,
  };

  if (implication.effect === 'EXCLUDES') {
    return {
      ...cause,
      status: 'RULED_OUT',
      exclusions: [...cause.exclusions, entry],
    };
  }

  // A directly performed test answers the question the cause turns on, so it
  // settles the defining observation the passive scan may have missed.
  const earned = cause.points.earned + implication.weight;
  const available = cause.points.available + implication.weight;

  return {
    ...cause,
    points: { earned, available },
    confidence: available === 0 ? 0 : Math.round((earned / available) * 100),
    contributions: [...cause.contributions, entry],
    keyObservationMade: true,
  };
}

/**
 * Whether a Stage 10 next step asked for a measurement this test has now
 * made, so the step can stop being offered.
 */
function stepSettledBy(stepId: string, results: readonly TestResult[]): boolean {
  const informative = results.filter((r) => isInformative(r.outcome));

  const settles: Record<string, readonly string[]> = {
    'rail-pressure-running': ['fuel-supply-pressure', 'fuel-delivery-shortfall'],
    'airflow-against-calculated': ['airflow-under-reading', 'airflow-over-reading'],
    'trim-response-to-airflow': ['unmetered-air'],
  };

  return informative.some((result) =>
    (settles[result.testId] ?? []).some((causeId) => stepId.includes(causeId)),
  );
}
