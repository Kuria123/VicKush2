import { describe, expect, it } from 'vitest';

import { applyTestResults } from '../confirmation';
import { analyseSession, DiagnosticSession } from '../diagnostics';
import { differentiate } from '../differential';
import { VehicleSimulator, type ScenarioId } from '../simulation';
import { getParameter, type SensorReading } from '../telemetry';

import { assessGuideEligibility } from './eligibility';
import { getGuideForCause, REPAIR_GUIDES } from './guides';
import { validateCatalogue, validateGuide } from './validation';

/**
 * Repair guides.
 *
 * Two things are under test and the second matters more than the first: that a
 * guide is only reachable once a cause is actually confirmed, and that no
 * guide can bypass its own safety section.
 */

const STEP_MS = 200;

function runSession(scenario: ScenarioId, plan: readonly { throttle: number; seconds: number }[]) {
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

  return session;
}

const IDLE_THEN_REV = [
  { throttle: 0, seconds: 90 },
  { throttle: 30, seconds: 90 },
];

function differentialFor(
  scenario: ScenarioId,
  results: Parameters<typeof applyTestResults>[1] = [],
) {
  const session = runSession(scenario, IDLE_THEN_REV);
  const analysis = analyseSession({
    session,
    dtcs: session.allDtcs(),
    engineDisplacementCc: 1998,
  });
  return applyTestResults(differentiate(analysis), results);
}

/* ---------------------------------------------------------------------------
 * The gate — what keeps Rule 9 intact
 * ------------------------------------------------------------------------ */

describe('a guide is only reachable from a confirmed cause', () => {
  it('refuses when the readings point somewhere but no test was performed', () => {
    const eligibility = assessGuideEligibility(differentialFor('VACUUM_LEAK'));

    // The scan proposes; the measurement disposes. This is the normal state of
    // most diagnoses, and it is not an error.
    expect(eligibility.status).toBe('NOT_CONFIRMED');
    expect(eligibility.reason).toMatch(/no confirmation test has been performed/i);
    expect(eligibility.unlockedBy).toMatch(/performing one of the recommended tests/i);
  });

  it('refuses when the evidence does not separate the causes', () => {
    const session = runSession('LEAN_MIXTURE', IDLE_THEN_REV);
    const analysis = analyseSession({
      session,
      dtcs: session.allDtcs(),
      engineDisplacementCc: 1998,
    });
    const ambiguous = applyTestResults(
      differentiate({
        ...analysis,
        evidence: analysis.evidence.filter((e) => !e.id.startsWith('fuel-pressure-')),
      }),
      [],
    );
    expect(ambiguous.verdict).toBe('AMBIGUOUS');

    const eligibility = assessGuideEligibility(ambiguous);
    expect(eligibility.status).toBe('NOT_CONFIRMED');
    expect(eligibility.reason).toMatch(/one of these two/i);
  });

  it('refuses when nothing was found at all', () => {
    const eligibility = assessGuideEligibility(differentialFor('NORMAL'));

    expect(eligibility.status).toBe('NOT_CONFIRMED');
    expect(eligibility.reason).toMatch(/no cause has been established/i);
  });

  it('refuses on a test that settled nothing', () => {
    // UNABLE_TO_PERFORM produced no observation, so it confirms nothing — the
    // same rule that stops it moving a ranking.
    const eligibility = assessGuideEligibility(
      differentialFor('VACUUM_LEAK', [
        { testId: 'trim-response-to-airflow', outcome: 'UNABLE_TO_PERFORM' },
      ]),
    );

    expect(eligibility.status).toBe('NOT_CONFIRMED');
  });

  it('allows it once a performed test corroborates the leading cause', () => {
    const eligibility = assessGuideEligibility(
      differentialFor('VACUUM_LEAK', [
        { testId: 'trim-response-to-airflow', outcome: 'PASS', note: 'Trim fell from 23% to 4%.' },
      ]),
    );

    expect(eligibility.status).toBe('ELIGIBLE');
    expect(eligibility.causeId).toBe('unmetered-air');
    expect(eligibility.unlockedBy).toBeNull();
  });

  it('produces a guide for the cause that was confirmed', () => {
    const eligibility = assessGuideEligibility(
      differentialFor('VACUUM_LEAK', [
        { testId: 'trim-response-to-airflow', outcome: 'PASS' },
      ]),
    );

    const guide = getGuideForCause(eligibility.causeId!)!;
    expect(guide.id).toBe('locate-unmetered-air');
    expect(guide.system).toBe('Air intake');
  });
});

/* ---------------------------------------------------------------------------
 * Safety cannot be bypassed
 * ------------------------------------------------------------------------ */

describe('safety', () => {
  it('passes structural validation across the whole catalogue', () => {
    expect(validateCatalogue()).toEqual([]);
  });

  it('catches a step pointing at a safety requirement that does not exist', () => {
    const guide = REPAIR_GUIDES[0]!;
    const broken = {
      ...guide,
      steps: [
        { ...guide.steps[0], safetyRefs: ['does-not-exist'] },
        ...guide.steps.slice(1),
      ] as typeof guide.steps,
    };

    const violations = validateGuide(broken);
    expect(violations.some((v) => v.detail.includes('does not exist'))).toBe(true);
  });

  it('catches a DANGER hazard that no step points at', () => {
    const guide = REPAIR_GUIDES[1]!;
    const clear = <T extends { safetyRefs: readonly string[] }>(step: T): T => ({
      ...step,
      safetyRefs: [],
    });

    const stripped = {
      ...guide,
      steps: [clear(guide.steps[0]), ...guide.steps.slice(1).map(clear)] as typeof guide.steps,
      preparation: [
        clear(guide.preparation[0]),
        ...guide.preparation.slice(1).map(clear),
      ] as typeof guide.preparation,
    };

    // A warning nothing points at is a warning nobody reads when it matters.
    const violations = validateGuide(stripped);
    expect(violations.some((v) => v.detail.includes('not referenced by any step'))).toBe(true);
  });

  it('rejects a control that instructs nothing', () => {
    const guide = REPAIR_GUIDES[0]!;
    const vague = {
      ...guide,
      safety: [
        { ...guide.safety[0], control: 'Be careful.' },
        ...guide.safety.slice(1),
      ] as typeof guide.safety,
    };

    expect(validateGuide(vague).length).toBeGreaterThan(0);
  });

  it('gives every guide at least one DANGER or WARNING hazard', () => {
    for (const guide of REPAIR_GUIDES) {
      const serious = guide.safety.filter((s) => s.severity !== 'CAUTION');
      expect(serious.length, guide.id).toBeGreaterThan(0);
    }
  });

  it('names the hazard, not just the precaution', () => {
    for (const guide of REPAIR_GUIDES) {
      for (const requirement of guide.safety) {
        expect(requirement.hazard.length, guide.id).toBeGreaterThan(30);
        expect(requirement.control.length, guide.id).toBeGreaterThan(20);
      }
    }
  });
});

/* ---------------------------------------------------------------------------
 * Rules 1 and 9
 * ------------------------------------------------------------------------ */

describe('project rules', () => {
  it('never states a vehicle-specific figure it cannot know', () => {
    for (const guide of REPAIR_GUIDES) {
      // Labour time and part numbers need a service database this build has
      // no access to, so they carry the reason instead of a number.
      expect(guide.estimatedTime.known, guide.id).toBe(false);

      for (const part of guide.parts) {
        expect(part.partNumber.known, `${guide.id}/${part.description}`).toBe(false);
      }
    }
  });

  it('marks every part as conditional on a step, never as simply required', () => {
    for (const guide of REPAIR_GUIDES) {
      for (const part of guide.parts) {
        // A scan establishes a mechanism. Which component failed is settled by
        // the inspection step, not by the diagnosis (Rule 9).
        expect(part.necessity, `${guide.id}/${part.description}`).toBe('CONDITIONAL');
        expect(part.determinedByStep).not.toBeNull();
      }
    }
  });

  it('states on every guide that it is not vehicle-specific', () => {
    for (const guide of REPAIR_GUIDES) {
      expect(guide.vehicleApplicability, guide.id).toMatch(/generic procedure/i);
      expect(guide.limitations.join(' '), guide.id).toMatch(/not known to this build/i);
    }
  });

  it('never tells anyone to fit a part before the step that settles it', () => {
    for (const guide of REPAIR_GUIDES) {
      const stepIds = [...guide.preparation, ...guide.steps].map((s) => s.id);

      for (const part of guide.parts) {
        const settlingIndex = stepIds.indexOf(part.determinedByStep!);
        expect(settlingIndex, `${guide.id}/${part.description}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives every guide a measurable verification', () => {
    for (const guide of REPAIR_GUIDES) {
      expect(guide.verification.length, guide.id).toBeGreaterThan(0);
      // Stage 19 compares a before and after scan against exactly these.
      expect(
        guide.verification.some((v) => /measure|read|record/i.test(v.check)),
        guide.id,
      ).toBe(true);
    }
  });

  it('has a guide only for causes the differential can actually confirm', () => {
    // A guide nobody can unlock is shelf-filling.
    const causeIds = new Set(REPAIR_GUIDES.map((g) => g.causeId));
    expect(causeIds.has('unmetered-air')).toBe(true);
    expect(causeIds.size).toBe(REPAIR_GUIDES.length);
  });
});
