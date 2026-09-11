import { describe, expect, it } from 'vitest';

import { analyseSession, DiagnosticSession } from '../diagnostics';
import { VehicleSimulator, type ScenarioId } from '../simulation';
import { getParameter, type SensorReading } from '../telemetry';

import { differentiate, type Differential, type RankedCause } from './engine';

/**
 * The differential, tested against the real simulator end to end.
 *
 * Nothing in this file constructs evidence by hand. A scenario is run through
 * the physical model, recorded as a session, analysed by Stage 9, and only
 * then ranked. That chain is the point: if the differential could be satisfied
 * by a fixture, it would prove nothing about whether it can separate two
 * faults that genuinely look alike.
 */

const STEP_MS = 200;

interface Phase {
  throttle: number;
  seconds: number;
  driving?: boolean;
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
    simulator.setDriving(phase.driving ?? false);

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

const IDLE_ONLY: readonly Phase[] = [{ throttle: 0, seconds: 90 }];

function differential(
  scenario: ScenarioId,
  plan: readonly Phase[] = IDLE_THEN_REV,
  displacementCc: number | null = 1998,
): Differential {
  const session = runSession(scenario, plan);
  return differentiate(
    analyseSession({
      session,
      dtcs: session.allDtcs(),
      engineDisplacementCc: displacementCc,
    }),
  );
}

const ids = (causes: readonly RankedCause[]) => causes.map((c) => c.id);
const leader = (result: Differential) => result.causes[0];

/* ---------------------------------------------------------------------------
 * The lean four-way — what this stage exists for
 * ------------------------------------------------------------------------ */

describe('lean mixture differential', () => {
  it('leads with unmetered air when trim falls as airflow rises', () => {
    const result = differential('VACUUM_LEAK');

    expect(result.verdict).toBe('SINGLE_LEADING');
    expect(leader(result)?.id).toBe('unmetered-air');
  });

  it('rests that lead on the airflow dependence, not on a fault code', () => {
    const result = differential('VACUUM_LEAK');
    const top = leader(result)!;

    const reasons = top.contributions.map((c) => c.evidenceId);
    expect(reasons).toContain('trim-airflow-dependence');
    // No contribution may come from a DTC: this build cannot interpret one.
    expect(top.contributions.every((c) => !/^dtc-/.test(c.evidenceId))).toBe(true);
  });

  it('does not raise uneven combustion when idle was steady', () => {
    // Not "ruled out" — never on the table. The observation uneven combustion
    // requires, an unsteady idle, was not made, so there is nothing to rank
    // and nothing to exclude.
    const result = differential('VACUUM_LEAK');
    expect(ids(result.causes)).not.toContain('incomplete-combustion');
    expect(ids(result.ruledOut)).not.toContain('incomplete-combustion');
  });

  it('leads with a sensor under-reading when airflow disagrees with the manifold', () => {
    const result = differential('MAF_PROBLEM');

    expect(leader(result)?.id).toBe('airflow-under-reading');
    expect(leader(result)?.contributions.map((c) => c.evidenceId)).toContain(
      'airflow-under-reported',
    );
  });

  it('separates a supply fault from a delivery fault on rail pressure', () => {
    const supply = differential('FUEL_PRESSURE_PROBLEM');
    const delivery = differential('LEAN_MIXTURE');

    expect(leader(supply)?.id).toBe('fuel-supply-pressure');
    expect(leader(delivery)?.id).toBe('fuel-delivery-shortfall');

    // Each excludes the other, and says why.
    expect(ids(supply.ruledOut)).toContain('fuel-delivery-shortfall');
    expect(ids(delivery.ruledOut)).toContain('fuel-supply-pressure');
  });

  it('names the measurement that did the separating', () => {
    const supply = differential('FUEL_PRESSURE_PROBLEM');
    const excluded = supply.ruledOut.find((c) => c.id === 'fuel-delivery-shortfall')!;

    expect(excluded.exclusions[0]?.evidenceId).toBe('fuel-pressure-low');
    expect(excluded.exclusions[0]?.reason).toMatch(/pressure/i);
  });
});

/* ---------------------------------------------------------------------------
 * Refusing to choose
 * ------------------------------------------------------------------------ */

/**
 * A vehicle whose adapter cannot read fuel rail pressure — common, and the
 * situation the ambiguity handling exists for. Everything else is measured.
 */
function withoutRailPressure(scenario: ScenarioId): Differential {
  const session = runSession(scenario, IDLE_THEN_REV);
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

describe('ambiguity', () => {
  it('will not separate two fuel-side causes when rail pressure was never read', () => {
    // A supply fault and a delivery fault are identical in the trims. Without
    // the one reading that tells them apart, naming either would be a guess
    // presented as a diagnosis.
    const result = withoutRailPressure('LEAN_MIXTURE');

    expect(result.verdict).toBe('AMBIGUOUS');
    expect(ids(result.causes.filter((c) => c.status === 'SUPPORTED'))).toEqual(
      expect.arrayContaining(['fuel-delivery-shortfall', 'fuel-supply-pressure']),
    );
  });

  it('offers the observation that would settle it rather than a winner', () => {
    const result = withoutRailPressure('LEAN_MIXTURE');

    expect(result.nextSteps.some((s) => /rail pressure/i.test(s.action))).toBe(true);
    expect(result.limitations.some((l) => /do not separate/i.test(l))).toBe(true);
  });

  it('records that the leader rests on an observation never made', () => {
    const result = withoutRailPressure('LEAN_MIXTURE');
    expect(leader(result)?.keyObservationMade).toBe(false);
  });

  it('asks for the displacement when that is what blocks the air cross-check', () => {
    const result = differential('LEAN_MIXTURE', IDLE_THEN_REV, null);
    expect(
      result.nextSteps.some((s) => /displacement/i.test(s.action)),
    ).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * Other systems
 * ------------------------------------------------------------------------ */

describe('other systems', () => {
  // See VehicleSimulator.test.ts: 1500 simulated seconds is heavy enough to
  // exceed the 5 s default under a full parallel run.
  it('ranks heat rejection loss when the engine runs hot', { timeout: 30_000 }, () => {
    const result = differential('OVERHEATING', [{ throttle: 0, seconds: 1500 }]);

    expect(leader(result)?.id).toBe('heat-rejection-loss');
    expect(ids(result.ruledOut)).not.toContain('heat-rejection-loss');
  });

  it('ranks the opposite cause when the engine never warms', () => {
    const result = differential('COOLING_SYSTEM_PROBLEM', [{ throttle: 0, seconds: 700 }]);
    expect(ids(result.causes)).toContain('coolant-not-regulated-up');
  });

  it('ranks a charging fault from running voltage', () => {
    const result = differential('CHARGING_FAILURE', IDLE_ONLY);
    expect(leader(result)?.id).toBe('charging-not-supplying');
  });

  it('ranks uneven combustion from idle speed variation', () => {
    const result = differential('MISFIRE', IDLE_ONLY);
    expect(ids(result.causes)).toContain('incomplete-combustion');
  });

  it('leads with excess fuel when the mixture is rich and airflow measures correctly', () => {
    const result = differential('RICH_MIXTURE');
    expect(ids(result.causes)).toContain('excess-fuel-delivery');
    expect(ids(result.causes)).not.toContain('unmetered-air');
  });
});

/* ---------------------------------------------------------------------------
 * The rules the engine must not break
 * ------------------------------------------------------------------------ */

describe('project rules', () => {
  it('proposes no cause at all on a healthy engine', () => {
    const result = differential('NORMAL');

    expect(result.verdict).toBe('INSUFFICIENT');
    expect(result.causes.filter((c) => c.status === 'SUPPORTED')).toHaveLength(0);
  });

  it('never recommends a part', () => {
    const banned = /\b(replace|install|fit|buy|order|new part|repair kit)\b/i;

    for (const scenario of [
      'VACUUM_LEAK',
      'LEAN_MIXTURE',
      'MAF_PROBLEM',
      'FUEL_PRESSURE_PROBLEM',
      'RICH_MIXTURE',
      'MISFIRE',
    ] as ScenarioId[]) {
      const result = differential(scenario);
      const text = [
        ...result.causes.flatMap((c) => [c.label, c.mechanism, ...c.contributions.map((x) => x.reason)]),
        ...result.nextSteps.flatMap((s) => [s.action, s.because]),
        ...result.limitations,
      ].join(' ');

      expect(text, `${scenario} mentioned a part`).not.toMatch(banned);
    }
  });

  it('states that it names mechanisms rather than components', () => {
    const result = differential('VACUUM_LEAK');
    expect(result.limitations.some((l) => /mechanism, not a component/i.test(l))).toBe(true);
  });

  it('states that fault codes were not interpreted', () => {
    const result = differential('VACUUM_LEAK');
    expect(result.limitations.some((l) => /not interpreted/i.test(l))).toBe(true);
  });

  it('carries every point back to a named observation', () => {
    const result = differential('VACUUM_LEAK');

    for (const cause of result.causes) {
      for (const contribution of cause.contributions) {
        expect(contribution.evidenceId).not.toBe('');
        expect(contribution.observation).not.toBe('');
        expect(contribution.reason).not.toBe('');
        expect(contribution.points).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic', () => {
    const a = differential('VACUUM_LEAK');
    const b = differential('VACUUM_LEAK');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
