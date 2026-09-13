import { describe, expect, it } from 'vitest';

import { VehicleSimulator, type ScenarioId } from '../../simulation';
import { getParameter, type SensorReading } from '../../telemetry';
import { DiagnosticSession } from '../session';
import { classifyCondition } from '../operating-condition';
import { analyseSession } from './engine';
import { alignSamples, statsByCondition } from './aligned-samples';

/**
 * The diagnostic engine, tested against the real simulator.
 *
 * These are the tests that matter for the whole product. A diagnostic engine
 * validated against hand-written fixtures proves only that it can read a
 * fixture. Driving it from the physical model means the evidence it reasons
 * over was produced by coupled physics, exactly as it will be from a real
 * vehicle.
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

function toReadings(
  values: ReadonlyMap<string, number>,
  t: number,
): SensorReading[] {
  const at = new Date(t);
  return [...values.entries()].flatMap(([parameterId, value]): SensorReading[] => {
    const definition = getParameter(parameterId);
    if (!definition) return [];
    return [{ parameterId, at, state: 'AVAILABLE', value, unit: definition.unit }];
  });
}

/** Idle, then revved — the sweep that distinguishes several mixture faults. */
const IDLE_THEN_REV: readonly Phase[] = [
  { throttle: 0, seconds: 90 },
  { throttle: 30, seconds: 90 },
];

const IDLE_ONLY: readonly Phase[] = [{ throttle: 0, seconds: 90 }];

function analyse(scenario: ScenarioId, plan: readonly Phase[] = IDLE_THEN_REV) {
  const session = runSession(scenario, plan);
  return analyseSession({
    session,
    dtcs: session.allDtcs(),
    engineDisplacementCc: 1998,
  });
}

const findingIds = (analysis: ReturnType<typeof analyse>) =>
  analysis.findings.map((f) => f.id);
const evidenceIds = (analysis: ReturnType<typeof analyse>) =>
  analysis.evidence.map((e) => e.id);

/* ---------------------------------------------------------------------------
 * Operating condition
 * ------------------------------------------------------------------------ */

describe('operating condition', () => {
  it('classifies idle', () => {
    expect(
      classifyCondition({ rpm: 700, vehicleSpeed: 0, throttlePosition: 0, engineLoad: 29 }),
    ).toBe('IDLE');
  });

  it('classifies a stationary rev as light load, not idle', () => {
    expect(
      classifyCondition({ rpm: 3000, vehicleSpeed: 0, throttlePosition: 30, engineLoad: 40 }),
    ).toBe('LIGHT_LOAD');
  });

  it('classifies high load', () => {
    expect(
      classifyCondition({ rpm: 3500, vehicleSpeed: 90, throttlePosition: 70, engineLoad: 85 }),
    ).toBe('HIGH_LOAD');
  });

  it('separates deceleration from idle', () => {
    // Closed throttle at speed means the vehicle is driving the engine, where
    // mixture readings mean something quite different.
    expect(
      classifyCondition({ rpm: 2200, vehicleSpeed: 60, throttlePosition: 0, engineLoad: 12 }),
    ).toBe('DECELERATION');
  });

  it('reports UNKNOWN rather than guessing without engine speed', () => {
    expect(
      classifyCondition({ rpm: null, vehicleSpeed: 0, throttlePosition: 0, engineLoad: 20 }),
    ).toBe('UNKNOWN');
  });

  it('classifies engine off and cranking', () => {
    expect(
      classifyCondition({ rpm: 0, vehicleSpeed: 0, throttlePosition: 0, engineLoad: 0 }),
    ).toBe('ENGINE_OFF');
    expect(
      classifyCondition({ rpm: 250, vehicleSpeed: 0, throttlePosition: 0, engineLoad: 0 }),
    ).toBe('CRANKING');
  });
});

/* ---------------------------------------------------------------------------
 * Sample alignment
 * ------------------------------------------------------------------------ */

describe('sample alignment', () => {
  it('rebuilds per-moment snapshots and tags each with its condition', () => {
    const session = runSession('NORMAL', IDLE_ONLY);
    const samples = alignSamples(session);

    expect(samples.length).toBeGreaterThan(400);
    expect(samples.every((s) => s.condition === 'IDLE')).toBe(true);
    expect(samples[0]!.values.has('ENGINE_RPM')).toBe(true);
  });

  it('covers both conditions when the engine is revved', () => {
    const samples = alignSamples(runSession('NORMAL', IDLE_THEN_REV));
    const conditions = new Set(samples.map((s) => s.condition));
    expect(conditions.has('IDLE')).toBe(true);
    expect(conditions.size).toBeGreaterThan(1);
  });

  it('ignores conditions with too few samples to average', () => {
    const samples = alignSamples(runSession('NORMAL', IDLE_ONLY));
    const stats = statsByCondition(samples, 'ENGINE_RPM', 10_000);
    expect(stats).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * A healthy vehicle
 * ------------------------------------------------------------------------ */

describe('a healthy vehicle', () => {
  const analysis = analyse('NORMAL');

  it('reports no faults', () => {
    expect(findingIds(analysis)).toEqual(['no-faults-observed']);
  });

  it('still records what it checked, so "nothing found" means something', () => {
    // A clean result backed by no evidence would be indistinguishable from a
    // check that never ran.
    expect(evidenceIds(analysis)).toContain('airflow-plausible');
    expect(evidenceIds(analysis)).toContain('coolant-normal');
    expect(evidenceIds(analysis)).toContain('system-voltage-normal');
    expect(evidenceIds(analysis)).toContain('idle-stable');
  });

  it('always states what it could not check', () => {
    expect(analysis.limitations.some((l) => /Mode 06/.test(l))).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * The signature
 * ------------------------------------------------------------------------ */

describe('vacuum leak', () => {
  const analysis = analyse('VACUUM_LEAK');

  it('detects a lean condition', () => {
    expect(findingIds(analysis)).toContain('lean-condition');
  });

  it('observes that the correction shrinks as airflow rises', () => {
    // The distinguishing observation, derived from the physics rather than
    // from knowing which scenario was selected.
    expect(evidenceIds(analysis)).toContain('trim-airflow-dependence');

    const item = analysis.evidence.find((e) => e.id === 'trim-airflow-dependence')!;
    const spread = item.measured.find((m) => m.label === 'Spread')!.value;
    expect(spread).toBeGreaterThan(8);
    expect(item.summary).toMatch(/falls/);
  });

  it('rules out the airflow sensor, because reported airflow is plausible', () => {
    // A leak downstream of the sensor lowers the reading, but the reading
    // still agrees with manifold conditions — which is what clears the sensor.
    const lean = analysis.findings.find((f) => f.id === 'lean-condition')!;
    expect(lean.opposing.map((e) => e.id)).toContain('airflow-plausible');
  });

  it('rules out fuel supply, because rail pressure is normal', () => {
    const lean = analysis.findings.find((f) => f.id === 'lean-condition')!;
    expect(lean.opposing.map((e) => e.id)).toContain('fuel-pressure-normal');
  });
});

/* ---------------------------------------------------------------------------
 * Faults that present alike must be separated by evidence
 * ------------------------------------------------------------------------ */

describe('distinguishing lean causes', () => {
  const leak = analyse('VACUUM_LEAK');
  const maf = analyse('MAF_PROBLEM');
  const injectors = analyse('LEAN_MIXTURE');
  const pump = analyse('FUEL_PRESSURE_PROBLEM');

  it('all four present as a lean condition', () => {
    for (const [name, analysis] of [
      ['leak', leak],
      ['maf', maf],
      ['injectors', injectors],
      ['pump', pump],
    ] as const) {
      expect(findingIds(analysis), name).toContain('lean-condition');
    }
  });

  it('only the sensor fault shows airflow disagreeing with the manifold', () => {
    expect(evidenceIds(maf)).toContain('airflow-under-reported');
    expect(findingIds(maf)).toContain('airflow-disagreement');

    for (const [name, analysis] of [
      ['leak', leak],
      ['injectors', injectors],
      ['pump', pump],
    ] as const) {
      expect(evidenceIds(analysis), name).not.toContain('airflow-under-reported');
      expect(evidenceIds(analysis), name).toContain('airflow-plausible');
    }
  });

  it('only the supply fault shows low rail pressure', () => {
    expect(evidenceIds(pump)).toContain('fuel-pressure-low');

    for (const [name, analysis] of [
      ['leak', leak],
      ['maf', maf],
      ['injectors', injectors],
    ] as const) {
      expect(evidenceIds(analysis), name).toContain('fuel-pressure-normal');
    }
  });

  it('only the leak shows a correction that shrinks with airflow', () => {
    expect(evidenceIds(leak)).toContain('trim-airflow-dependence');

    // A proportional error needs the same correction at every airflow, so the
    // spread stays small and a different observation is recorded instead.
    for (const [name, analysis] of [
      ['injectors', injectors],
      ['pump', pump],
    ] as const) {
      const item = analysis.evidence.find((e) => e.id === 'trim-airflow-dependence');
      if (item) {
        const spread = item.measured.find((m) => m.label === 'Spread')!.value;
        expect(Math.abs(spread), name).toBeLessThan(
          Math.abs(
            leak.evidence
              .find((e) => e.id === 'trim-airflow-dependence')!
              .measured.find((m) => m.label === 'Spread')!.value,
          ),
        );
      }
    }
  });
});

/* ---------------------------------------------------------------------------
 * Other systems
 * ------------------------------------------------------------------------ */

describe('other systems', () => {
  it('detects a rich condition', () => {
    expect(findingIds(analyse('RICH_MIXTURE'))).toContain('rich-condition');
  });

  // Integrating a long thermal scenario is heavy enough to exceed the 5 s
  // default. Stated per-test rather than raising the global default, which
  // would let a real hang elsewhere sit undetected for a minute. Same reason
  // as the two budgets in VehicleSimulator.test.ts.
  it('treats overheating as severe', { timeout: 30_000 }, () => {
    const analysis = analyse('OVERHEATING', [{ throttle: 0, seconds: 1400 }]);
    const overheating = analysis.findings.find((f) => f.id === 'overheating');
    expect(overheating).toBeDefined();
    expect(overheating!.severity).toBe('SEVERE');
  });

  it('detects a charging fault', () => {
    expect(findingIds(analyse('CHARGING_FAILURE', IDLE_ONLY))).toContain('charging-low');
  });

  it('detects an unsteady idle without calling it a misfire count', () => {
    const analysis = analyse('MISFIRE', IDLE_ONLY);
    expect(findingIds(analysis)).toContain('rough-idle');

    const item = analysis.evidence.find((e) => e.id === 'idle-unstable')!;
    // Measures how steadily the engine runs; it does not claim to count
    // misfires, which need Mode 06.
    expect(item.detail).toMatch(/not a misfire\s+count/);
  });
});

/* ---------------------------------------------------------------------------
 * Honesty about its own limits
 * ------------------------------------------------------------------------ */

describe('limitations', () => {
  it('says when a scan covered only idle', () => {
    const analysis = analyse('VACUUM_LEAK', IDLE_ONLY);
    expect(
      analysis.limitations.some((l) => /Every reading was taken at idle/.test(l)),
    ).toBe(true);
  });

  it('cannot cross-check airflow without the engine displacement', () => {
    const session = runSession('MAF_PROBLEM', IDLE_THEN_REV);
    const analysis = analyseSession({
      session,
      dtcs: session.allDtcs(),
      engineDisplacementCc: null,
    });

    // Rather than assuming a displacement and producing a confident answer
    // against a number nobody supplied.
    expect(evidenceIds(analysis)).not.toContain('airflow-under-reported');
    expect(
      analysis.limitations.some((l) => /engine displacement is not recorded/.test(l)),
    ).toBe(true);
  });

  it('refuses to analyse too few samples', () => {
    const session = runSession('VACUUM_LEAK', [{ throttle: 0, seconds: 1 }]);
    const analysis = analyseSession({ session, dtcs: [], engineDisplacementCc: 1998 });

    expect(analysis.findings).toEqual([]);
    expect(analysis.limitations[0]).toMatch(/samples were captured/);
  });
});

/* ---------------------------------------------------------------------------
 * Determinism and structure
 * ------------------------------------------------------------------------ */

describe('the engine itself', () => {
  it('is deterministic — the same session always analyses identically', () => {
    expect(JSON.stringify(analyse('VACUUM_LEAK'))).toBe(
      JSON.stringify(analyse('VACUUM_LEAK')),
    );
  });

  it('backs every finding with at least one piece of evidence', () => {
    for (const scenario of [
      'NORMAL',
      'VACUUM_LEAK',
      'MAF_PROBLEM',
      'RICH_MIXTURE',
    ] as const) {
      for (const item of analyse(scenario).findings) {
        expect(item.supporting.length, `${scenario}/${item.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every piece of evidence its measurements and its reasoning', () => {
    for (const item of analyse('VACUUM_LEAK').evidence) {
      expect(item.summary.length, item.id).toBeGreaterThan(10);
      expect(item.detail.length, item.id).toBeGreaterThan(20);
      if (item.kind !== 'DTC') {
        expect(item.measured.length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it('never names a failed component — that is Stage 10', () => {
    // Findings describe behaviour. Attributing it to a part before the causes
    // have been ranked is the premature parts recommendation the rules forbid.
    for (const scenario of ['VACUUM_LEAK', 'MAF_PROBLEM', 'LEAN_MIXTURE'] as const) {
      for (const item of analyse(scenario).findings) {
        expect(item.title.toLowerCase(), item.id).not.toMatch(
          /replace|faulty|failed sensor|bad /,
        );
      }
    }
  });
});
