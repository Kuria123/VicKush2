/**
 * The result of performing a confirmation test.
 *
 * Six outcomes, and the split between them matters. `PASS`/`FAIL` belong to a
 * test with a stated criterion — "does combined trim fall by at least eight
 * points when engine speed is raised?" `NORMAL`/`ABNORMAL` belong to a test
 * that reads a value against a specification. Conflating the two loses the
 * distinction between "the predicted behaviour happened" and "the number was
 * in range", which are different kinds of claim.
 *
 * The last two are the important ones:
 *
 * - `UNABLE_TO_PERFORM` — the test was attempted and could not be completed.
 * - `SKIP` — the test was not attempted.
 *
 * **Neither may ever change the assessment.** A test that did not produce an
 * observation produced no evidence, and letting it nudge a ranking would be
 * fabricating a result from the absence of one (Rule 1). Both are recorded as
 * limitations instead, so the user can see what was never established.
 */

export const TEST_OUTCOMES = [
  'PASS',
  'FAIL',
  'NORMAL',
  'ABNORMAL',
  'UNABLE_TO_PERFORM',
  'SKIP',
] as const;

export type TestOutcome = (typeof TEST_OUTCOMES)[number];

/** Outcomes that carry an observation, and so may move the assessment. */
export const INFORMATIVE_OUTCOMES: readonly TestOutcome[] = [
  'PASS',
  'FAIL',
  'NORMAL',
  'ABNORMAL',
];

export function isInformative(outcome: TestOutcome): boolean {
  return INFORMATIVE_OUTCOMES.includes(outcome);
}

export const OUTCOME_LABELS: Record<TestOutcome, string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  NORMAL: 'Normal',
  ABNORMAL: 'Abnormal',
  UNABLE_TO_PERFORM: 'Unable to perform',
  SKIP: 'Skipped',
};

export interface TestResult {
  testId: string;
  outcome: TestOutcome;
  /**
   * What was actually measured or seen, in the performer's own words.
   *
   * Optional, because a test can be answered without a number. When present
   * it is carried through to the assessment verbatim and never parsed for
   * meaning — the outcome is what the engine reasons over.
   */
  note?: string;
}
