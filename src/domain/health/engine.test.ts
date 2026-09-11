import { describe, expect, it } from 'vitest';

import { computeHealth, type HealthInput } from './engine';
import { detectTrend } from './trends';
import { healthBand } from './types';

/**
 * The health engine.
 *
 * Two properties are worth more than the rest: a score is always the sum of
 * its stated reasons, and a system with no evidence has no score at all.
 */

const ENGINE_PARAMS = ['ENGINE_RPM', 'ENGINE_LOAD', 'INTAKE_MAP', 'MAF_RATE'];
const FUEL_PARAMS = ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1'];
const ALL_PARAMS = [
  ...ENGINE_PARAMS,
  ...FUEL_PARAMS,
  'COOLANT_TEMP',
  'CONTROL_MODULE_VOLTAGE',
  'VEHICLE_SPEED',
];

const NOW = new Date('2026-03-20T10:00:00Z');

function input(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    findings: [],
    trends: [],
    parametersObserved: ALL_PARAMS,
    sessionCount: 3,
    latestSessionAt: NOW,
    ...overrides,
  };
}

const system = (health: ReturnType<typeof computeHealth>, name: string) =>
  health.systems.find((s) => s.system === name)!;

/* ---------------------------------------------------------------------------
 * The rule that matters most
 * ------------------------------------------------------------------------ */

describe('systems this build cannot measure', () => {
  it('never scores braking, however much else was recorded', () => {
    const health = computeHealth(input());
    const braking = system(health, 'BRAKING');

    // "Braking health: 92" invented from engine data would be the single most
    // dangerous number this product could show.
    expect(braking.status).toBe('NOT_ASSESSED');
    expect(braking.score).toBeNull();
    expect(braking.reasons[0]?.detail).toMatch(/no brake data/i);
  });

  it('never scores suspension', () => {
    const suspension = system(computeHealth(input()), 'SUSPENSION');
    expect(suspension.score).toBeNull();
    expect(suspension.reasons[0]?.detail).toMatch(/chassis or ride-height/i);
  });

  it('leaves unassessed systems out of the overall figure entirely', () => {
    const health = computeHealth(input());

    // Counting them as 0 or 100 would let a system nobody measured move the
    // headline number in one direction or the other.
    expect(health.assessedCount).toBe(5);
    expect(health.overall).toBe(100);
  });

  it('says a system was not assessed when its readings were never captured', () => {
    const health = computeHealth(input({ parametersObserved: ENGINE_PARAMS }));
    const fuel = system(health, 'FUEL');

    expect(fuel.status).toBe('NOT_ASSESSED');
    expect(fuel.score).toBeNull();
    // Not assessed is not the same as healthy, and the copy says so.
    expect(fuel.reasons[0]?.summary).toMatch(/not assessed/i);
  });

  it('assesses nothing at all before any scan is saved', () => {
    const health = computeHealth(
      input({ sessionCount: 0, parametersObserved: [], latestSessionAt: null }),
    );

    expect(health.overall).toBeNull();
    expect(health.assessedCount).toBe(0);
    expect(health.systems.every((s) => s.score === null)).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * Scores and their reasons
 * ------------------------------------------------------------------------ */

describe('every number is explained', () => {
  it('explains a perfect score rather than leaving it bare', () => {
    const engine = system(computeHealth(input()), 'ENGINE');

    expect(engine.score).toBe(100);
    expect(engine.reasons).toHaveLength(1);
    expect(engine.reasons[0]?.kind).toBe('CLEAR_OBSERVATION');
    // And it does not overclaim: normal readings are not a clean bill.
    expect(engine.reasons[0]?.detail).toMatch(/not a statement that the system is faultless/i);
  });

  it('makes the score exactly 100 minus the stated deductions', () => {
    const health = computeHealth(
      input({
        findings: [
          {
            findingId: 'lean-condition',
            title: 'Lean condition detected',
            system: 'FUEL',
            severity: 'SIGNIFICANT',
            evidence: 'Combined fuel trim averaged +22.8% at idle.',
            observedAt: NOW,
          },
        ],
      }),
    );

    const fuel = system(health, 'FUEL');
    const stated = fuel.reasons.reduce((sum, r) => sum + r.deduction, 0);

    expect(fuel.score).toBe(100 - stated);
    expect(fuel.score).toBe(75);
  });

  it('carries the evidence through to the reason', () => {
    const health = computeHealth(
      input({
        findings: [
          {
            findingId: 'overheating',
            title: 'Engine running above safe temperature',
            system: 'COOLING',
            severity: 'SEVERE',
            evidence: 'Coolant reached 121 °C.',
            observedAt: NOW,
          },
        ],
      }),
    );

    const cooling = system(health, 'COOLING');
    expect(cooling.score).toBe(60);
    expect(cooling.reasons[0]?.detail).toBe('Coolant reached 121 °C.');
    expect(healthBand(cooling.score!)).toBe('POOR');
  });

  it('never falls below zero however many findings there are', () => {
    const findings = Array.from({ length: 5 }, (_, i) => ({
      findingId: `f${i}`,
      title: `Finding ${i}`,
      system: 'COOLING' as const,
      severity: 'SEVERE' as const,
      evidence: null,
      observedAt: NOW,
    }));

    expect(system(computeHealth(input({ findings })), 'COOLING').score).toBe(0);
  });

  it('routes induction and ignition findings to the engine', () => {
    const health = computeHealth(
      input({
        findings: [
          {
            findingId: 'airflow-disagreement',
            title: 'Airflow reading disagrees with manifold conditions',
            system: 'AIR',
            severity: 'SIGNIFICANT',
            evidence: null,
            observedAt: NOW,
          },
        ],
      }),
    );

    expect(system(health, 'ENGINE').score).toBe(75);
    // And does not silently also charge it to fuel.
    expect(system(health, 'FUEL').score).toBe(100);
  });
});

/* ---------------------------------------------------------------------------
 * Trends — the spec's own example
 * ------------------------------------------------------------------------ */

describe('trends across sessions', () => {
  const declining = [12.7, 12.6, 12.4, 12.2, 12.1].map((value, i) => ({
    at: new Date(2026, 0, 1 + i * 7),
    value,
  }));

  it('detects the declining battery from the brief', () => {
    const health = computeHealth(
      input({
        trends: [
          {
            parameterId: 'CONTROL_MODULE_VOLTAGE',
            condition: 'IDLE',
            unit: 'V',
            points: declining,
          },
        ],
      }),
    );

    const electrical = system(health, 'ELECTRICAL');
    expect(electrical.score).toBe(85);

    const reason = electrical.reasons.find((r) => r.kind === 'TREND');
    expect(reason?.summary).toMatch(/System voltage has declined across 5 scans/);
    // The series itself is shown, so the claim can be checked.
    expect(reason?.detail).toContain('12.7 V');
    expect(reason?.detail).toContain('12.1 V');
  });

  it('states a direction without predicting a failure', () => {
    const health = computeHealth(
      input({
        trends: [
          {
            parameterId: 'CONTROL_MODULE_VOLTAGE',
            condition: 'IDLE',
            unit: 'V',
            points: declining,
          },
        ],
      }),
    );

    const reason = system(health, 'ELECTRICAL').reasons.find((r) => r.kind === 'TREND');
    expect(reason?.detail).toMatch(/not a prediction of failure/i);
    expect(reason?.summary).not.toMatch(/will fail|has failed|needs replacing/i);
  });

  it('ignores a direction that is not adverse', () => {
    // Voltage climbing is not a fault, and deducting for it would be absurd.
    const rising = [12.1, 12.3, 12.5, 12.7].map((value, i) => ({
      at: new Date(2026, 0, 1 + i * 7),
      value,
    }));

    const health = computeHealth(
      input({
        trends: [
          { parameterId: 'CONTROL_MODULE_VOLTAGE', condition: 'IDLE', unit: 'V', points: rising },
        ],
      }),
    );

    expect(system(health, 'ELECTRICAL').score).toBe(100);
  });
});

describe('trend detection', () => {
  const at = (i: number) => new Date(2026, 0, 1 + i * 7);

  it('claims nothing from two points', () => {
    const result = detectTrend(
      [
        { at: at(0), value: 12.7 },
        { at: at(1), value: 12.1 },
      ],
      { minimumDelta: 0.3 },
    );
    expect(result.direction).toBe('INSUFFICIENT_DATA');
  });

  it('calls small movement stable', () => {
    const result = detectTrend(
      [12.6, 12.55, 12.5].map((value, i) => ({ at: at(i), value })),
      { minimumDelta: 0.3 },
    );
    expect(result.direction).toBe('STABLE');
  });

  it('calls a wandering series stable even when the ends differ', () => {
    // Moved far, but not in one direction. That is noise, not a trend, and
    // reporting it would erode trust in every other number shown.
    const result = detectTrend(
      [12.7, 12.1, 12.8, 12.0, 12.9, 12.2].map((value, i) => ({ at: at(i), value })),
      { minimumDelta: 0.3 },
    );
    expect(result.direction).toBe('STABLE');
  });

  it('reports a consistent decline with its span', () => {
    const result = detectTrend(
      [12.7, 12.6, 12.4, 12.2, 12.1].map((value, i) => ({ at: at(i), value })),
      { minimumDelta: 0.3 },
    );

    expect(result.direction).toBe('DECLINING');
    expect(result.consistency).toBe(1);
    expect(Number(result.delta.toFixed(2))).toBe(-0.6);
    expect(result.span?.from.getTime()).toBe(at(0).getTime());
  });

  it('sorts unordered points before judging', () => {
    const shuffled = [
      { at: at(3), value: 12.2 },
      { at: at(0), value: 12.7 },
      { at: at(2), value: 12.4 },
      { at: at(1), value: 12.6 },
    ];
    expect(detectTrend(shuffled, { minimumDelta: 0.3 }).direction).toBe('DECLINING');
  });
});
