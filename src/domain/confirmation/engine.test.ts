import { describe, expect, it } from 'vitest';

import { analyseSession, DiagnosticSession } from '../diagnostics';
import { differentiate, type Differential } from '../differential';
import { VehicleSimulator, type ScenarioId } from '../simulation';
import { getParameter, type SensorReading } from '../telemetry';

import { applyTestResults, nextTest, recommendTests } from './engine';
import { TEST_OUTCOMES, type TestResult } from './outcomes';
import { CONFIRMATION_TESTS } from './tests';

/**
 * The confirmation engine, driven from a real differential.
 *
 * As with Stage 10, nothing is constructed by hand: a scenario runs through
 * the physical model, is analysed, is ranked, and only then is a test result
 * applied. That matters most for the ambiguous case — the whole point is that
 * a test can settle something the scan could not, and a fixture would let
 * that be asserted without ever being true.
 */

const STEP_MS = 200;

interface Phase {
  throttle: number;
  seconds: number;
}

function runSession(scenario: ScenarioId, plan: readonly Phase[]) {
  const simulator = new VehicleSimulator({ seed: 42 });
  simulator.setScenario(scenario);

  const session = new DiagnosticSession({
    providerName: 'Simulated vehicle',
    isSimulated: true,
    scenario,
  });

  let t = 0;
  for (const phase of plan) {
    simulator.setThrottle(phase.throttle);
    simulator.setDriving(false);

    const end = t + phase.seconds * 1000;
    while (t < end) {
      t += STEP_MS;
      const sample = simulator.sample(t);
      session.record(toReadings(sample.values, t), t);
      session.recordDtcs(sample.dtcs);
    }
  }

  return session;
}

function toReadings(values: ReadonlyMap<string, number>, t: number): SensorReading[] {
  const at = new Date(t);
  return [...values.entries()].flatMap(([parameterId, value]): SensorReading[] => {
    const definition = getParameter(parameterId);
    if (!definition) return [];
    return [{ parameterId, at, state: 'AVAILABLE', value, unit: definition.unit }];
  });
}

const IDLE_THEN_REV: readonly Phase[] = [
  { throttle: 0, seconds: 90 },
  { throttle: 30, seconds: 90 },
];

/** A lean vehicle whose adapter cannot read rail pressure: genuinely ambiguous. */
function ambiguousLean(): Differential {
  const session = runSession('LEAN_MIXTURE', IDLE_THEN_REV);
  const analysis = analyseSession({
    session,
    dtcs: session.allDtcs(),
    engineDisplacementCc: 1998,
  });

  return differentiate({
    ...analysis,
    evidence: analysis.evidence.filter((e) => !e.id.startsWith('fuel-pressure-')),
  });
}

function differentialFor(scenario: ScenarioId, plan: readonly Phase[] = IDLE_THEN_REV) {
  const session = runSession(scenario, plan);
  return differentiate(
    analyseSession({ session, dtcs: session.allDtcs(), engineDisplacementCc: 1998 }),
  );
}

const ids = (causes: readonly { id: string }[]) => causes.map((c) => c.id);

/* ---------------------------------------------------------------------------
 * Choosing what to test
 * ------------------------------------------------------------------------ */

describe('choosing the next test', () => {
  it('offers the test that reads the measurement the scan could not', () => {
    const offer = nextTest(ambiguousLean());
    expect(offer?.test.id).toBe('rail-pressure-running');
  });

  it('offers only tests that bear on a cause still in contention', () => {
    const offers = recommendTests(ambiguousLean());
    const contended = ['fuel-supply-pressure', 'fuel-delivery-shortfall'];

    for (const offer of offers) {
      expect(offer.separates.some((id) => contended.includes(id))).toBe(true);
    }
    expect(ids(offers.map((o) => o.test))).not.toContain('warmup-temperature-profile');
  });

  it('does not offer a test already performed', () => {
    const differential = ambiguousLean();
    const results: TestResult[] = [{ testId: 'rail-pressure-running', outcome: 'NORMAL' }];

    const after = applyTestResults(differential, results);
    expect(ids(after.recommended.map((o) => o.test))).not.toContain('rail-pressure-running');
  });

  it('offers it again if it could not be performed', () => {
    const differential = ambiguousLean();
    const after = applyTestResults(differential, [
      { testId: 'rail-pressure-running', outcome: 'UNABLE_TO_PERFORM' },
    ]);

    expect(ids(after.recommended.map((o) => o.test))).toContain('rail-pressure-running');
  });
});

/* ---------------------------------------------------------------------------
 * Results changing the assessment — the point of the stage
 * ------------------------------------------------------------------------ */

describe('a result updates the assessment', () => {
  it('settles an ambiguous differential in one test', () => {
    const before = ambiguousLean();
    expect(before.verdict).toBe('AMBIGUOUS');

    const after = applyTestResults(before, [
      { testId: 'rail-pressure-running', outcome: 'ABNORMAL', note: '210 kPa at idle' },
    ]);

    expect(after.verdict).toBe('SINGLE_LEADING');
    expect(after.causes[0]?.id).toBe('fuel-supply-pressure');
    expect(ids(after.ruledOut)).toContain('fuel-delivery-shortfall');
  });

  it('settles it the other way on the opposite result', () => {
    const after = applyTestResults(ambiguousLean(), [
      { testId: 'rail-pressure-running', outcome: 'NORMAL', note: '380 kPa, held at 2500 rpm' },
    ]);

    expect(after.verdict).toBe('SINGLE_LEADING');
    expect(after.causes[0]?.id).toBe('fuel-delivery-shortfall');
    expect(ids(after.ruledOut)).toContain('fuel-supply-pressure');
  });

  it('carries the result through as the reason the ranking moved', () => {
    const after = applyTestResults(ambiguousLean(), [
      { testId: 'rail-pressure-running', outcome: 'ABNORMAL', note: '210 kPa at idle' },
    ]);

    const contribution = after.causes[0]?.contributions.find(
      (c) => c.evidenceId === 'test-rail-pressure-running',
    );
    expect(contribution?.observation).toContain('210 kPa at idle');
    expect(contribution?.reason).toMatch(/below specification/i);
  });

  it('records that a performed test settled the defining observation', () => {
    const before = ambiguousLean();
    expect(before.causes[0]?.keyObservationMade).toBe(false);

    const after = applyTestResults(before, [
      { testId: 'rail-pressure-running', outcome: 'NORMAL' },
    ]);
    expect(after.causes[0]?.keyObservationMade).toBe(true);
  });

  it('drops a next step whose measurement has now been taken', () => {
    const before = ambiguousLean();
    expect(before.nextSteps.some((s) => /rail pressure/i.test(s.action))).toBe(true);

    const after = applyTestResults(before, [
      { testId: 'rail-pressure-running', outcome: 'NORMAL' },
    ]);
    expect(after.nextSteps.some((s) => /rail pressure/i.test(s.action))).toBe(false);
  });

  it('applies a second result on top of the first', () => {
    const after = applyTestResults(ambiguousLean(), [
      { testId: 'airflow-against-calculated', outcome: 'NORMAL' },
      { testId: 'rail-pressure-running', outcome: 'NORMAL' },
    ]);

    const leader = after.causes[0]!;
    expect(leader.id).toBe('fuel-delivery-shortfall');
    expect(leader.contributions.filter((c) => c.evidenceId.startsWith('test-'))).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------------------
 * The rules the engine must not break
 * ------------------------------------------------------------------------ */

describe('project rules', () => {
  it('changes nothing when a test could not be performed', () => {
    const before = ambiguousLean();
    const after = applyTestResults(before, [
      { testId: 'rail-pressure-running', outcome: 'UNABLE_TO_PERFORM' },
    ]);

    expect(after.verdict).toBe(before.verdict);
    expect(ids(after.causes)).toEqual(ids(before.causes));
    expect(after.causes.map((c) => c.confidence)).toEqual(
      before.causes.map((c) => c.confidence),
    );
  });

  it('changes nothing when a test was skipped', () => {
    const before = ambiguousLean();
    const after = applyTestResults(before, [
      { testId: 'rail-pressure-running', outcome: 'SKIP' },
    ]);

    expect(after.causes.map((c) => c.confidence)).toEqual(
      before.causes.map((c) => c.confidence),
    );
  });

  it('says what an unperformed test left unsettled', () => {
    const after = applyTestResults(ambiguousLean(), [
      { testId: 'rail-pressure-running', outcome: 'UNABLE_TO_PERFORM' },
    ]);

    expect(
      after.limitations.some((l) => /unable to perform/i.test(l) && /supply side/i.test(l)),
    ).toBe(true);
  });

  it('never lets a test result invent a cause the readings did not raise', () => {
    const before = differentialFor('NORMAL');
    const known = new Set([...ids(before.causes), ...ids(before.ruledOut)]);

    const after = applyTestResults(before, [
      { testId: 'rail-pressure-running', outcome: 'ABNORMAL' },
      { testId: 'trim-response-to-airflow', outcome: 'PASS' },
    ]);

    for (const cause of [...after.causes, ...after.ruledOut]) {
      expect(known.has(cause.id)).toBe(true);
    }
  });

  it('reports an unknown test rather than ignoring it', () => {
    expect(() =>
      applyTestResults(ambiguousLean(), [{ testId: 'not-a-test', outcome: 'PASS' }]),
    ).toThrow(/Unknown confirmation test/);
  });

  it('never asks for a part to be fitted', () => {
    const banned = /\b(replace|install|fit a|fit the|swap|buy|order|new part)\b/i;

    for (const test of CONFIRMATION_TESTS) {
      const text = [
        test.title,
        test.question,
        test.criterion ?? '',
        test.safety ?? '',
        ...test.procedure,
        ...test.implications.map((i) => i.reason),
      ].join(' ');

      expect(text, `${test.id} asked for a part`).not.toMatch(banned);
    }
  });

  it('gives every implication a reason and a known outcome', () => {
    for (const test of CONFIRMATION_TESTS) {
      expect(test.procedure.length).toBeGreaterThan(0);

      for (const implication of test.implications) {
        expect(TEST_OUTCOMES).toContain(implication.outcome);
        expect(implication.reason.length).toBeGreaterThan(20);
        // An excluding implication must not also claim to award points.
        if (implication.effect === 'EXCLUDES') {
          expect(implication.weight).toBe(0);
        }
      }
    }
  });

  it('is deterministic', () => {
    const results: TestResult[] = [{ testId: 'rail-pressure-running', outcome: 'ABNORMAL' }];
    const a = applyTestResults(ambiguousLean(), results);
    const b = applyTestResults(ambiguousLean(), results);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
