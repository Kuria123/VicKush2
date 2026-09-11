import { describe, expect, it } from 'vitest';

import { applyTestResults } from '../confirmation';
import { analyseSession, DiagnosticSession } from '../diagnostics';
import { differentiate } from '../differential';
import { VehicleSimulator, type ScenarioId } from '../simulation';
import { getParameter, type SensorReading } from '../telemetry';

import { buildDiagnosticContext, EXPLANATION_SYSTEM_PROMPT } from './context';
import { checkGrounding, parseExplanationJson } from './grounding';

/**
 * The grounding check, against a context built from a real diagnosis.
 *
 * Using a genuine context matters: the check passes or fails on which numbers
 * are actually present, and a hand-written context would let the test choose
 * numbers that make it look stricter than it is.
 */

const STEP_MS = 200;

function contextFor(scenario: ScenarioId): string {
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
            {
              parameterId,
              at,
              state: 'AVAILABLE' as const,
              value,
              unit: definition.unit,
            },
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

  return buildDiagnosticContext({
    analysis,
    differential: applyTestResults(differentiate(analysis), []),
    vehicleName: 'Toyota Harrier',
    isSimulated: true,
  });
}

/* ---------------------------------------------------------------------------
 * The context itself
 * ------------------------------------------------------------------------ */

describe('diagnostic context', () => {
  const context = contextFor('VACUUM_LEAK');

  it('carries the findings, causes and limits', () => {
    expect(context).toContain('## FINDINGS');
    expect(context).toContain('## CANDIDATE CAUSES');
    expect(context).toContain('## LIMITS OF THIS DIAGNOSIS');
    expect(context).toContain('Air entering downstream of the airflow sensor');
  });

  it('discloses that the session was simulated', () => {
    expect(context).toContain('SIMULATED');
  });

  it('never tells the model which fault was injected', () => {
    // The scenario name would let the model name the answer without reasoning
    // from the evidence, and every explanation would then look excellent.
    expect(context).not.toContain('VACUUM_LEAK');
    expect(context).not.toContain('Vacuum leak');
  });

  it('forbids the model from stating what a code means', () => {
    expect(context).toMatch(/NO authoritative table of code meanings/);
    expect(context).toMatch(/must NOT state what any code means/);
  });

  it('instructs the model not to invent numbers or name parts', () => {
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/Use ONLY the numbers that appear in the context/);
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/Never name a part/);
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/Never state what a fault code means/);
  });
});

/* ---------------------------------------------------------------------------
 * The check
 * ------------------------------------------------------------------------ */

describe('grounding check', () => {
  const context = contextFor('VACUUM_LEAK');

  it('passes an explanation that only restates the context', () => {
    const report = checkGrounding(
      'The engine is running lean at idle. Air appears to be entering after the airflow sensor, ' +
        'because the correction the ECU applies shrinks as airflow rises.',
      context,
    );
    expect(report.grounded).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('rejects a measurement that was never taken', () => {
    const report = checkGrounding(
      'Fuel rail pressure was measured at 417 kPa, which is normal.',
      context,
    );

    expect(report.grounded).toBe(false);
    expect(report.violations[0]?.kind).toBe('UNGROUNDED_NUMBER');
    expect(report.violations[0]?.detail).toContain('417');
  });

  it('rejects a stated meaning for a fault code', () => {
    const report = checkGrounding(
      'P0171 means the fuel system is running too lean on bank one.',
      context,
    );
    expect(report.violations.some((v) => v.kind === 'CODE_MEANING')).toBe(true);
  });

  it('rejects a part recommendation', () => {
    const report = checkGrounding(
      'You should replace the intake manifold gasket to resolve this.',
      context,
    );
    expect(report.violations.some((v) => v.kind === 'PART_RECOMMENDATION')).toBe(true);
  });

  it('rejects a claim about whether the vehicle can be driven', () => {
    const report = checkGrounding(
      'It is safe to drive until you can get this looked at.',
      context,
    );
    expect(report.violations.some((v) => v.kind === 'SAFETY_CLAIM')).toBe(true);
  });

  it('rejects a claim that the vehicle is fine', () => {
    const report = checkGrounding('Your vehicle is fine and nothing needs attention.', context);
    expect(report.violations.some((v) => v.kind === 'SAFETY_CLAIM')).toBe(true);
  });

  it('allows small counting numbers in ordinary prose', () => {
    const report = checkGrounding(
      'There are 2 explanations that fit, and 1 test would separate them.',
      context,
    );
    expect(report.grounded).toBe(true);
  });

  it('allows a context figure written to fewer decimal places', () => {
    // Reformatting is not invention; the value is the same figure.
    const first = context.match(/(\d+)\.\d+%/);
    if (first) {
      const report = checkGrounding(`The correction averaged about ${first[1]}%.`, context);
      expect(report.grounded).toBe(true);
    }
  });

  it('reports every fabricated number, not just the first', () => {
    const report = checkGrounding(
      'Airflow was 88.4 g/s and coolant reached 137 degrees.',
      context,
    );
    const numbers = report.violations.filter((v) => v.kind === 'UNGROUNDED_NUMBER');
    expect(numbers.length).toBeGreaterThanOrEqual(2);
  });
});

/* ---------------------------------------------------------------------------
 * Parsing
 * ------------------------------------------------------------------------ */

describe('explanation parsing', () => {
  it('accepts the requested shape', () => {
    const parsed = parseExplanationJson(
      '{"summary":"A summary.","reasoning":"Some reasoning.","caveats":["One."]}',
    );
    expect(parsed?.summary).toBe('A summary.');
    expect(parsed?.caveats).toEqual(['One.']);
  });

  it('accepts it inside a fenced block', () => {
    const parsed = parseExplanationJson(
      '```json\n{"summary":"A.","reasoning":"B.","caveats":[]}\n```',
    );
    expect(parsed?.reasoning).toBe('B.');
  });

  it('refuses to salvage a malformed reply', () => {
    // A reply that is not the shape asked for is a failed call. Guessing at
    // its intent is how malformed output reaches a user.
    expect(parseExplanationJson('Sure! Here is my explanation…')).toBeNull();
    expect(parseExplanationJson('{"summary":"A."}')).toBeNull();
    expect(parseExplanationJson('{"summary":"","reasoning":"B.","caveats":[]}')).toBeNull();
    expect(parseExplanationJson('{"summary":"A.","reasoning":"B.","caveats":"no"}')).toBeNull();
  });
});
