import { describe, expect, it } from 'vitest';

import { getParameter, isWithinEncodableRange } from '../telemetry';
import { SCENARIOS, SCENARIO_DEFINITIONS, type ScenarioId } from './faults';
import { VehicleSimulator } from './VehicleSimulator';

/**
 * These tests are the point of Stage 6.
 *
 * They assert that the *relationships* between sensors are right, because
 * those relationships are what a diagnosis reads. A simulator that produced
 * plausible-looking numbers with no coupling between them would let a
 * diagnostic engine pass its tests while being useless on a real vehicle.
 */

function runFor(
  scenario: ScenarioId,
  seconds: number,
  options: { throttle?: number; warm?: boolean; driving?: boolean; seed?: number } = {},
) {
  const sim = new VehicleSimulator({
    seed: options.seed ?? 42,
    warm: options.warm ?? true,
  });
  sim.setScenario(scenario);
  if (options.throttle !== undefined) sim.setThrottle(options.throttle);
  if (options.driving) sim.setDriving(true);
  return sim.sample(seconds * 1000);
}

const value = (sample: { values: ReadonlyMap<string, number> }, id: string) => {
  const v = sample.values.get(id);
  if (v === undefined) throw new Error(`Missing parameter ${id}`);
  return v;
};

const codes = (sample: { dtcs: readonly { code: string; status: string }[] }) =>
  sample.dtcs.filter((d) => d.status === 'STORED').map((d) => d.code);

/* ---------------------------------------------------------------------------
 * Determinism
 * ------------------------------------------------------------------------ */

describe('determinism', () => {
  it('produces identical telemetry for the same seed', () => {
    const a = runFor('VACUUM_LEAK', 60);
    const b = runFor('VACUUM_LEAK', 60);
    expect([...a.values.entries()]).toEqual([...b.values.entries()]);
  });

  it('produces different noise for a different seed, but the same diagnosis', () => {
    const a = runFor('VACUUM_LEAK', 60, { seed: 1 });
    const b = runFor('VACUUM_LEAK', 60, { seed: 2 });
    // The fault is the same, so the codes must agree even though the noise
    // differs — otherwise a test could pass by luck of the seed.
    expect(codes(a)).toEqual(codes(b));
  });

  it('reaches the same state whether sampled once or repeatedly', () => {
    const once = new VehicleSimulator({ seed: 42 });
    once.setScenario('NORMAL');
    const a = once.sample(30_000);

    const many = new VehicleSimulator({ seed: 42 });
    many.setScenario('NORMAL');
    for (let t = 1000; t <= 30_000; t += 1000) many.sample(t);
    const b = many.sample(30_000);

    // Fixed-step integration means the sampling cadence cannot change the
    // physics, which is what lets a live stream and a test agree.
    expect(value(a, 'ENGINE_RPM')).toBe(value(b, 'ENGINE_RPM'));
    expect(value(a, 'COOLANT_TEMP')).toBe(value(b, 'COOLANT_TEMP'));
  });
});

/* ---------------------------------------------------------------------------
 * Plausibility
 * ------------------------------------------------------------------------ */

describe('a healthy engine at idle', () => {
  const sample = runFor('NORMAL', 60);

  it('idles near the target speed', () => {
    expect(value(sample, 'ENGINE_RPM')).toBeGreaterThan(600);
    expect(value(sample, 'ENGINE_RPM')).toBeLessThan(850);
  });

  it('pulls a realistic manifold vacuum', () => {
    // A throttled petrol engine idles around 30–40 kPa absolute.
    expect(value(sample, 'INTAKE_MAP')).toBeGreaterThan(25);
    expect(value(sample, 'INTAKE_MAP')).toBeLessThan(45);
  });

  it('flows a realistic mass of air', () => {
    // Roughly 2–4 g/s for a 2.0 L at idle.
    expect(value(sample, 'MAF_RATE')).toBeGreaterThan(1.8);
    expect(value(sample, 'MAF_RATE')).toBeLessThan(4);
  });

  it('holds fuel trims near zero', () => {
    const total = value(sample, 'SHORT_FUEL_TRIM_1') + value(sample, 'LONG_FUEL_TRIM_1');
    expect(Math.abs(total)).toBeLessThan(5);
  });

  it('sits at operating temperature with the alternator charging', () => {
    expect(value(sample, 'COOLANT_TEMP')).toBeGreaterThan(80);
    expect(value(sample, 'COOLANT_TEMP')).toBeLessThan(100);
    expect(value(sample, 'CONTROL_MODULE_VOLTAGE')).toBeGreaterThan(13.5);
    expect(value(sample, 'CONTROL_MODULE_VOLTAGE')).toBeLessThan(14.8);
  });

  it('stores no fault codes', () => {
    expect(codes(sample)).toEqual([]);
  });

  it('reports every value inside what OBD-II can encode', () => {
    for (const [id, v] of sample.values) {
      if (!getParameter(id)) continue;
      expect(isWithinEncodableRange(id, v), `${id} = ${v}`).toBe(true);
    }
  });
});

/* ---------------------------------------------------------------------------
 * Coupling — the heart of the stage
 * ------------------------------------------------------------------------ */

describe('sensors influence each other', () => {
  it('opening the throttle raises manifold pressure, airflow and speed together', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    sim.setScenario('NORMAL');
    const idle = sim.sample(20_000);

    sim.setThrottle(30);
    const open = sim.sample(40_000);

    expect(value(open, 'INTAKE_MAP')).toBeGreaterThan(value(idle, 'INTAKE_MAP'));
    expect(value(open, 'MAF_RATE')).toBeGreaterThan(value(idle, 'MAF_RATE'));
    expect(value(open, 'ENGINE_RPM')).toBeGreaterThan(value(idle, 'ENGINE_RPM'));
  });

  it('airflow scales with engine speed', () => {
    const low = runFor('NORMAL', 40, { throttle: 10 });
    const high = runFor('NORMAL', 40, { throttle: 40 });

    expect(value(high, 'ENGINE_RPM')).toBeGreaterThan(value(low, 'ENGINE_RPM'));
    expect(value(high, 'MAF_RATE')).toBeGreaterThan(value(low, 'MAF_RATE'));
  });

  it('load reflects airflow rather than being independent of it', () => {
    const idle = runFor('NORMAL', 30);
    const loaded = runFor('NORMAL', 40, { throttle: 60, driving: true });
    expect(value(loaded, 'ENGINE_LOAD')).toBeGreaterThan(value(idle, 'ENGINE_LOAD'));
  });
});

/* ---------------------------------------------------------------------------
 * The signature the whole product depends on
 * ------------------------------------------------------------------------ */

describe('vacuum leak', () => {
  it('drives both fuel trims positive at idle', () => {
    const sample = runFor('VACUUM_LEAK', 90);
    const total = value(sample, 'SHORT_FUEL_TRIM_1') + value(sample, 'LONG_FUEL_TRIM_1');
    expect(total).toBeGreaterThan(15);
  });

  it('stores P0171', () => {
    expect(codes(runFor('VACUUM_LEAK', 90))).toContain('P0171');
  });

  it('reports less air than the engine is actually drawing', () => {
    // The leak is downstream of the sensor, so the sensor cannot see it.
    const leak = runFor('VACUUM_LEAK', 60);
    const healthy = runFor('NORMAL', 60);
    expect(value(leak, 'MAF_RATE')).toBeLessThan(value(healthy, 'MAF_RATE'));
  });

  it('the trims fall when the engine is revved — emergent, not scripted', () => {
    // This is the classic signature that separates a leak from a fuel or
    // sensor fault. Nothing in the model instructs the trim to drop with RPM:
    // the leak is a fixed hole, so the share of unmetered air it admits
    // shrinks as total airflow grows.
    const sim = new VehicleSimulator({ seed: 42 });
    sim.setScenario('VACUUM_LEAK');
    sim.sample(90_000);

    const atIdle = sim.sample(90_000);
    const idleTrim = value(atIdle, 'SHORT_FUEL_TRIM_1') + value(atIdle, 'LONG_FUEL_TRIM_1');

    sim.setThrottle(30);
    const revved = sim.sample(160_000);
    const revvedTrim = value(revved, 'SHORT_FUEL_TRIM_1') + value(revved, 'LONG_FUEL_TRIM_1');

    expect(value(revved, 'ENGINE_RPM')).toBeGreaterThan(2000);
    expect(revvedTrim).toBeLessThan(idleTrim - 8);
  });
});

/* ---------------------------------------------------------------------------
 * Faults that look alike must stay distinguishable
 * ------------------------------------------------------------------------ */

describe('distinguishing similar faults', () => {
  it('a MAF fault and a fuel fault both run lean, but only one mis-reports air', () => {
    const mafFault = runFor('MAF_PROBLEM', 90);
    const fuelFault = runFor('LEAN_MIXTURE', 90);
    const healthy = runFor('NORMAL', 90);

    // Both lean enough to set the same code.
    expect(codes(mafFault)).toContain('P0171');
    expect(codes(fuelFault)).toContain('P0171');

    // The airflow reading is what separates them.
    expect(value(mafFault, 'MAF_RATE')).toBeLessThan(value(healthy, 'MAF_RATE') - 0.3);
    expect(value(fuelFault, 'MAF_RATE')).toBeCloseTo(value(healthy, 'MAF_RATE'), 0);

    // And only the sensor fault fails the ECU's plausibility check.
    expect(codes(mafFault)).toContain('P0101');
    expect(codes(fuelFault)).not.toContain('P0101');
  });

  it('a weak pump and weak injectors run alike, and fuel pressure separates them', () => {
    const pressure = runFor('FUEL_PRESSURE_PROBLEM', 90);
    const injectors = runFor('LEAN_MIXTURE', 90);

    expect(codes(pressure)).toContain('P0171');
    expect(codes(injectors)).toContain('P0171');

    expect(value(pressure, 'FUEL_PRESSURE')).toBeLessThan(value(injectors, 'FUEL_PRESSURE') - 30);
    expect(codes(pressure)).toContain('P0087');
    expect(codes(injectors)).not.toContain('P0087');
  });
});

/* ---------------------------------------------------------------------------
 * Every scenario
 * ------------------------------------------------------------------------ */

describe('scenario catalogue', () => {
  it('defines every listed scenario', () => {
    for (const id of SCENARIOS) {
      const definition = SCENARIO_DEFINITIONS[id];
      expect(definition.label.length).toBeGreaterThan(0);
      // The description says what is physically wrong, not what the readings
      // will look like, so the model stays the only source of the symptoms.
      expect(definition.description.length).toBeGreaterThan(20);
    }
  });

  it('NORMAL applies no faults', () => {
    expect(Object.keys(SCENARIO_DEFINITIONS.NORMAL.faults)).toHaveLength(0);
  });

  it.each([
    ['MISFIRE', 'P0302'],
    ['VACUUM_LEAK', 'P0171'],
    ['LEAN_MIXTURE', 'P0171'],
    ['RICH_MIXTURE', 'P0172'],
    ['MAF_PROBLEM', 'P0101'],
    ['O2_PROBLEM', 'P0133'],
    ['FUEL_PRESSURE_PROBLEM', 'P0087'],
  ] as const)('%s stores %s at idle', (scenario, code) => {
    expect(codes(runFor(scenario, 120))).toContain(code);
  });

  it('THROTTLE_PROBLEM stores P0121 once the pedal is used', () => {
    expect(codes(runFor('THROTTLE_PROBLEM', 60, { throttle: 25 }))).toContain('P0121');
  });

  it('OVERHEATING climbs past the limit, but takes time as a real one does', () => {
    const early = runFor('OVERHEATING', 120);
    const late = runFor('OVERHEATING', 1500);

    expect(value(late, 'COOLANT_TEMP')).toBeGreaterThan(value(early, 'COOLANT_TEMP'));
    expect(value(late, 'COOLANT_TEMP')).toBeGreaterThan(118);
    expect(codes(late)).toContain('P0217');
  });

  it('a thermostat stuck open never reaches temperature', () => {
    const sample = runFor('COOLING_SYSTEM_PROBLEM', 700, { warm: false });
    expect(value(sample, 'COOLANT_TEMP')).toBeLessThan(70);
    expect(codes(sample)).toContain('P0128');
  });

  it('a healthy engine warming from cold does NOT set the thermostat code', () => {
    // The thresholds must leave room for a normal warm-up, or every cold
    // start would report a fault.
    const sample = runFor('NORMAL', 700, { warm: false });
    expect(codes(sample)).not.toContain('P0128');
  });

  it('a charging failure drops system voltage', () => {
    const sample = runFor('CHARGING_FAILURE', 120);
    expect(value(sample, 'CONTROL_MODULE_VOLTAGE')).toBeLessThan(12.5);
  });

  it('a weak battery sags the charging voltage without failing outright', () => {
    const weak = runFor('LOW_BATTERY', 30);
    const healthy = runFor('NORMAL', 30);
    expect(value(weak, 'CONTROL_MODULE_VOLTAGE')).toBeLessThan(
      value(healthy, 'CONTROL_MODULE_VOLTAGE') - 0.4,
    );
    // Still charging, so no code — which is exactly why a resting or cranking
    // test is needed to confirm it.
    expect(value(weak, 'CONTROL_MODULE_VOLTAGE')).toBeGreaterThan(12.8);
  });

  it('a slipping transmission revs higher while going slower', () => {
    const healthy = runFor('NORMAL', 30, { throttle: 45, driving: true });
    const slipping = runFor('TRANSMISSION_ABNORMALITY', 30, {
      throttle: 45,
      driving: true,
    });

    expect(value(slipping, 'ENGINE_RPM')).toBeGreaterThan(value(healthy, 'ENGINE_RPM') + 500);
    expect(value(slipping, 'VEHICLE_SPEED')).toBeLessThan(value(healthy, 'VEHICLE_SPEED'));
  });
});

/* ---------------------------------------------------------------------------
 * Code behaviour
 * ------------------------------------------------------------------------ */

describe('fault codes', () => {
  it('are raised by conditions, not by the scenario name', () => {
    // A leak and a fuel fault are different scenarios with different physics,
    // yet both set P0171 because both genuinely run lean. If codes were wired
    // to scenarios, a diagnostic engine could cheat by reading the code.
    expect(codes(runFor('VACUUM_LEAK', 120))).toContain('P0171');
    expect(codes(runFor('LEAN_MIXTURE', 120))).toContain('P0171');
    expect(codes(runFor('FUEL_PRESSURE_PROBLEM', 120))).toContain('P0171');
  });

  it('require the condition to persist before storing', () => {
    // Well inside every debounce window, so nothing is stored yet.
    expect(codes(runFor('VACUUM_LEAK', 4))).toEqual([]);
  });

  it('report a condition as pending before it is stored', () => {
    const sample = runFor('VACUUM_LEAK', 6);
    expect(sample.dtcs.some((d) => d.status === 'PENDING')).toBe(true);
  });

  it('stay stored once set', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    sim.setScenario('VACUUM_LEAK');
    sim.sample(120_000);
    expect(codes(sim.sample(120_000))).toContain('P0171');

    // Repairing the fault does not erase the record: an ECU keeps the code
    // until it is cleared, which is what makes a repair verifiable.
    sim.setScenario('NORMAL');
    expect(codes(sim.sample(240_000))).toContain('P0171');
  });

  it('clear on request', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    sim.setScenario('VACUUM_LEAK');
    sim.sample(120_000);
    sim.clearInjectedFaults();
    expect(codes(sim.sample(120_001))).toEqual([]);
  });

  it('carry no invented description', () => {
    for (const dtc of runFor('VACUUM_LEAK', 120).dtcs) {
      expect(dtc.description).toBeNull();
    }
  });

  it('accept a manually injected code and reject a malformed one', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    sim.injectDtc('P0420');
    sim.injectDtc('NONSENSE');

    const all = sim.sample(1000).dtcs.map((d) => d.code);
    expect(all).toContain('P0420');
    expect(all).not.toContain('NONSENSE');
  });
});

/* ---------------------------------------------------------------------------
 * Controls
 * ------------------------------------------------------------------------ */

describe('controls', () => {
  it('lists every scenario', () => {
    expect(new VehicleSimulator().listScenarios()).toEqual([...SCENARIOS]);
  });

  it('rejects an unknown scenario', () => {
    expect(new VehicleSimulator().setScenario('NOT_A_SCENARIO')).toBe(false);
  });

  it('resets back to a healthy idle', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    sim.setScenario('VACUUM_LEAK');
    sim.setThrottle(50);
    sim.sample(120_000);

    sim.reset();
    const after = sim.sample(60_000);

    expect(sim.activeScenario()).toBe('NORMAL');
    expect(codes(after)).toEqual([]);
    expect(value(after, 'ENGINE_RPM')).toBeLessThan(850);
  });

  it('stops the engine when asked', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    sim.sample(10_000);
    sim.stop();
    const stopped = sim.sample(15_000);
    expect(value(stopped, 'ENGINE_RPM')).toBe(0);
  });

  it('reports a value for every parameter it claims to support', () => {
    const sim = new VehicleSimulator({ seed: 42 });
    const sample = sim.sample(10_000);
    for (const id of sim.supportedParameters()) {
      expect(sample.values.has(id), id).toBe(true);
    }
  });

  it('only claims parameters that exist in the OBD-II catalogue', () => {
    for (const id of new VehicleSimulator().supportedParameters()) {
      expect(getParameter(id), id).not.toBeNull();
    }
  });
});
