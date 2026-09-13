import { describe, expect, it } from 'vitest';

import { applyTestResults, type TestResult } from '../confirmation';
import { analyseSession, DiagnosticSession } from '../diagnostics';
import { differentiate } from '../differential';
import { VehicleSimulator, type ScenarioId } from '../simulation';
import { getParameter, type SensorReading } from '../telemetry';

import { recogniseClaim } from './components';
import { evaluateRecommendation } from './engine';

/**
 * The second opinion.
 *
 * Driven from real simulated diagnoses, because the whole value of the feature
 * is that it compares a recommendation against evidence a physical model
 * produced rather than against a fixture chosen to make the answer come out.
 *
 * Most of these tests are about restraint: what it refuses to conclude, and
 * the difference between "the scan contradicts this" and "the scan cannot see
 * this", which are answers a user would act on very differently.
 */

const STEP_MS = 200;

function diagnose(scenario: ScenarioId, results: TestResult[] = []) {
  const simulator = new VehicleSimulator({ seed: 42 });
  simulator.setScenario(scenario);

  const session = new DiagnosticSession({
    providerName: 'Simulated vehicle',
    isSimulated: true,
    scenario,
  });

  let t = 0;
  for (const phase of [
    { throttle: 0, seconds: 90 },
    { throttle: 30, seconds: 90 },
  ]) {
    simulator.setThrottle(phase.throttle);
    const end = t + phase.seconds * 1000;
    while (t < end) {
      t += STEP_MS;
      const sample = simulator.sample(t);
      const at = new Date(t);
      const readings: SensorReading[] = [...sample.values.entries()].flatMap(
        ([parameterId, value]) => {
          const definition = getParameter(parameterId);
          if (!definition) return [];
          return [
            { parameterId, at, state: 'AVAILABLE' as const, value, unit: definition.unit },
          ];
        },
      );
      session.record(readings, t);
      session.recordDtcs(sample.dtcs);
    }
  }

  const analysis = analyseSession({
    session,
    dtcs: session.allDtcs(),
    engineDisplacementCc: 1998,
  });

  return { analysis, differential: applyTestResults(differentiate(analysis), results) };
}

function opinionOn(recommendation: string, scenario: ScenarioId, results: TestResult[] = []) {
  const { analysis, differential } = diagnose(scenario, results);
  return evaluateRecommendation({ recommendation, analysis, differential });
}

/* ---------------------------------------------------------------------------
 * The sentence this feature exists to be able to say
 * ------------------------------------------------------------------------ */

describe('insufficient evidence', () => {
  it('says so about brakes, because it reads nothing that bears on them', () => {
    const opinion = opinionOn('Replace the front brake pads and discs', 'VACUUM_LEAK');

    expect(opinion.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(opinion.summary).toMatch(/insufficient evidence to confirm or contradict/i);
    expect(opinion.summary).toMatch(/nothing this build reads bears on/i);
  });

  it('makes clear that silence is not disagreement', () => {
    const opinion = opinionOn('New shock absorbers all round', 'VACUUM_LEAK');

    // A reader would take silence as doubt. This says explicitly that it is not.
    expect(opinion.limitations.join(' ')).toMatch(/this is not disagreement/i);
    expect(opinion.opposing).toHaveLength(0);
  });

  it('can never contradict a recommendation it cannot see', () => {
    // NOT_SUPPORTED is unreachable for an unassessable component, by design.
    for (const text of ['brake calipers', 'suspension bushes', 'new tyres']) {
      expect(opinionOn(text, 'VACUUM_LEAK').verdict).toBe('INSUFFICIENT_EVIDENCE');
    }
  });

  it('says so when there is no scan at all', () => {
    const opinion = evaluateRecommendation({
      recommendation: 'Replace the mass airflow sensor',
      analysis: null,
      differential: null,
    });

    expect(opinion.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(opinion.summary).toMatch(/no scan has been recorded/i);
  });

  it('does not reach NOT_SUPPORTED merely from having found nothing', () => {
    // A healthy scan is not contrary evidence about an injector.
    const opinion = opinionOn('Replace the fuel injectors', 'NORMAL');

    expect(opinion.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(opinion.summary).toMatch(/not the same as finding it healthy/i);
  });
});

/* ---------------------------------------------------------------------------
 * Agreement and disagreement
 * ------------------------------------------------------------------------ */

describe('when the scan agrees', () => {
  it('is consistent but unconfirmed without a test', () => {
    const opinion = opinionOn('Replace the split intake hose', 'VACUUM_LEAK');

    expect(opinion.verdict).toBe('CONSISTENT_UNCONFIRMED');
    // Still the brief's sentence: consistent is not confirmed.
    expect(opinion.summary).toMatch(/insufficient evidence to confirm/i);
    expect(opinion.supporting.length).toBeGreaterThan(0);
  });

  it('upgrades to supported once a test corroborates it', () => {
    const opinion = opinionOn('Replace the split intake hose', 'VACUUM_LEAK', [
      { testId: 'trim-response-to-airflow', outcome: 'PASS' },
    ]);

    expect(opinion.verdict).toBe('SUPPORTED');
    // And even then, stops short of confirming the part itself.
    expect(opinion.summary).toMatch(/does not confirm the part itself has failed/i);
  });

  it('shows the observations it agreed on', () => {
    const opinion = opinionOn('Replace the split intake hose', 'VACUUM_LEAK');
    expect(opinion.supporting[0]?.observation.length).toBeGreaterThan(0);
    expect(opinion.supporting[0]?.significance.length).toBeGreaterThan(0);
  });
});

describe('when the scan points elsewhere', () => {
  const opinion = opinionOn('Replace the mass airflow sensor', 'VACUUM_LEAK');

  it('says so without calling anyone wrong', () => {
    expect(opinion.verdict).toBe('NOT_SUPPORTED');
    expect(opinion.summary).toMatch(/the scan does not support this/i);
    expect(opinion.summary).not.toMatch(/wrong|mistaken|incorrect|overcharg|rip|scam/i);
  });

  it('names what the scan points at instead', () => {
    expect(opinion.opposing.length).toBeGreaterThan(0);
    expect(opinion.summary + JSON.stringify(opinion.opposing)).toMatch(/air entering downstream/i);
  });

  it('concedes the vehicle may have more than one fault', () => {
    expect(opinion.limitations.join(' ')).toMatch(/more than one fault/i);
  });

  it('suggests asking what was observed rather than doubting the person', () => {
    expect(opinion.suggestedChecks.join(' ')).toMatch(/ask what was observed/i);
  });
});

/* ---------------------------------------------------------------------------
 * Recognition
 * ------------------------------------------------------------------------ */

describe('recognising the claim', () => {
  it('places common phrasings', () => {
    expect(recogniseClaim('needs a new MAF')?.system).toBe('ENGINE');
    expect(recogniseClaim('fuel pump is failing')?.component).toMatch(/fuel supply/i);
    expect(recogniseClaim('thermostat stuck')?.system).toBe('COOLING');
    expect(recogniseClaim('alternator not charging')?.system).toBe('ELECTRICAL');
  });

  it('marks brakes and suspension as unassessable', () => {
    expect(recogniseClaim('brake discs')?.assessable).toBe(false);
    expect(recogniseClaim('front struts')?.assessable).toBe(false);
    expect(recogniseClaim('mass airflow sensor')?.assessable).toBe(true);
  });

  it('declines rather than guessing at something it cannot place', () => {
    const opinion = opinionOn('The thing under the bonnet needs doing', 'VACUUM_LEAK');

    // A confident answer about something the user did not ask about is the
    // most damaging output this feature could produce.
    expect(opinion.verdict).toBe('UNRECOGNISED');
    expect(opinion.summary).toMatch(/could not work out which component/i);
    expect(opinion.suggestedChecks.join(' ')).toMatch(/name the component directly/i);
  });
});

/* ---------------------------------------------------------------------------
 * Project rules
 * ------------------------------------------------------------------------ */

describe('project rules', () => {
  const cases = [
    ['Replace the mass airflow sensor', 'VACUUM_LEAK'],
    ['Replace the split intake hose', 'VACUUM_LEAK'],
    ['New brake pads', 'VACUUM_LEAK'],
    ['Replace the fuel injectors', 'NORMAL'],
    ['Something vague', 'NORMAL'],
  ] as const;

  it('always states that the mechanic knows things this build does not', () => {
    for (const [text, scenario] of cases) {
      const opinion = opinionOn(text, scenario);
      expect(opinion.limitations.join(' '), text).toMatch(/information this build does not/i);
      expect(opinion.limitations.join(' '), text).toMatch(/not whether they are right/i);
    }
  });

  it('never comments on price or value', () => {
    for (const [text, scenario] of cases) {
      const opinion = opinionOn(text, scenario);
      const everything = [
        opinion.summary,
        ...opinion.suggestedChecks,
        ...opinion.limitations,
      ].join(' ');

      expect(everything, text).toMatch(/an opinion on what the work should cost/i);
      expect(everything, text).not.toMatch(/\b(expensive|cheap|overpriced|too much|good value)\b/i);
    }
  });

  it('never accuses anyone of anything', () => {
    for (const [text, scenario] of cases) {
      const opinion = opinionOn(text, scenario);
      const everything = [
        opinion.summary,
        ...opinion.supporting.map((p) => p.significance),
        ...opinion.opposing.map((p) => p.significance),
        ...opinion.suggestedChecks,
        ...opinion.limitations,
      ].join(' ');

      expect(everything, text).not.toMatch(/\b(scam|rip.?off|dishonest|overcharg|unnecessary work)\b/i);
    }
  });

  it('never sends the user to another garage instead of a measurement', () => {
    for (const [text, scenario] of cases) {
      const checks = opinionOn(text, scenario).suggestedChecks.join(' ');
      expect(checks, text).not.toMatch(/second opinion from|another (garage|mechanic|shop)/i);
    }
  });

  it('always says a scan cannot identify a failed part', () => {
    const opinion = opinionOn('Replace the split intake hose', 'VACUUM_LEAK');
    expect(opinion.limitations.join(' ')).toMatch(/does not identify which part has failed/i);
  });

  it('returns the recommendation unaltered', () => {
    const text = '  Replace the MAF sensor — quoted 280  ';
    const opinion = opinionOn(text, 'VACUUM_LEAK');
    expect(opinion.recommendation).toBe(text.trim());
  });
});
