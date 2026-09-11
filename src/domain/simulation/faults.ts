/**
 * Simulated faults, expressed as changes to the *physical* model.
 *
 * This is the central design decision of the simulator. A fault never writes
 * a sensor value. It changes something physical — an unmetered hole in the
 * intake, a sensor that under-reports, a thermostat that will not close — and
 * the sensor readings then follow from the model.
 *
 * The consequence is that diagnostic signatures emerge rather than being
 * scripted. A vacuum leak is a fixed-area hole, so the proportion of
 * unmetered air it admits shrinks as total airflow rises; fuel trims
 * therefore fall when the engine is revved, all by themselves. Nothing in
 * this file says "make the trim drop at higher RPM". That behaviour is what a
 * real leak does, and it is what the model does, which is the only reason
 * testing a diagnostic engine against it means anything.
 */

export interface FaultSet {
  /**
   * Effective area of an unmetered air leak downstream of the MAF sensor, in
   * m². Air entering here is never measured, so the ECU under-fuels.
   */
  vacuumLeakArea: number;

  /**
   * Multiplier applied to the reported MAF signal. 0.82 means the sensor
   * reports 82% of true airflow, so the ECU commands too little fuel.
   */
  mafScale: number;

  /** Fraction of combustion events that fail to burn, 0–1. */
  misfireRate: number;
  /** Cylinder 1–4, or 0 when misfires are spread across cylinders. */
  misfireCylinder: number;

  /**
   * Fuel actually delivered relative to commanded. 0.88 means 12% less fuel
   * reaches the cylinders than the ECU asked for.
   */
  fuelDeliveryScale: number;

  /**
   * Rail pressure relative to nominal.
   *
   * Deliberately separate from `fuelDeliveryScale`, because the two have
   * different causes. Worn or clogged injectors under-deliver at perfectly
   * normal rail pressure; a weak pump under-delivers *because* pressure is
   * low. Deriving one from the other made the two faults indistinguishable,
   * which defeats the purpose of simulating both.
   */
  fuelPressureScale: number;

  /** Upstream oxygen sensor behaviour. */
  o2Fault: 'NONE' | 'STUCK_LEAN' | 'STUCK_RICH' | 'SLOW';

  /**
   * Heat rejection relative to a healthy cooling system. Below 1 the engine
   * runs hot; a failed fan or blocked radiator.
   */
  coolingEfficiency: number;
  /**
   * A dead cooling fan.
   *
   * Separate from `coolingEfficiency` because the fan is what moves air
   * through the core at a standstill. Merely scaling overall efficiency left
   * a fraction of a working fan in place, which was enough to stop the
   * vehicle ever overheating while stationary — the exact situation where a
   * failed fan actually bites.
   */
  fanFailed: boolean;
  /** A thermostat stuck open never lets the engine reach temperature. */
  thermostatStuckOpen: boolean;

  /** Open-circuit battery voltage at rest, in volts. */
  batteryRestVoltage: number;
  /** A failed alternator leaves the battery to run everything. */
  alternatorFailed: boolean;

  /**
   * How much of the commanded throttle movement actually happens, plus a
   * sticking threshold the plate must overcome.
   */
  throttleResponseScale: number;
  throttleStictionPercent: number;

  /** Fraction of engine torque lost in the transmission beyond normal. */
  transmissionSlip: number;
}

export const HEALTHY: FaultSet = {
  vacuumLeakArea: 0,
  mafScale: 1,
  misfireRate: 0,
  misfireCylinder: 0,
  fuelDeliveryScale: 1,
  fuelPressureScale: 1,
  o2Fault: 'NONE',
  coolingEfficiency: 1,
  fanFailed: false,
  thermostatStuckOpen: false,
  batteryRestVoltage: 12.6,
  alternatorFailed: false,
  throttleResponseScale: 1,
  throttleStictionPercent: 0,
  transmissionSlip: 0,
};

export const SCENARIOS = [
  'NORMAL',
  'MISFIRE',
  'VACUUM_LEAK',
  'LEAN_MIXTURE',
  'RICH_MIXTURE',
  'MAF_PROBLEM',
  'O2_PROBLEM',
  'OVERHEATING',
  'LOW_BATTERY',
  'CHARGING_FAILURE',
  'THROTTLE_PROBLEM',
  'COOLING_SYSTEM_PROBLEM',
  'FUEL_PRESSURE_PROBLEM',
  'TRANSMISSION_ABNORMALITY',
] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  /** What is physically wrong — not what the readings will look like. */
  description: string;
  faults: Partial<FaultSet>;
}

export const SCENARIO_DEFINITIONS: Record<ScenarioId, ScenarioDefinition> = {
  NORMAL: {
    id: 'NORMAL',
    label: 'Normal',
    description: 'No fault. A healthy engine at operating temperature.',
    faults: {},
  },

  MISFIRE: {
    id: 'MISFIRE',
    label: 'Misfire',
    description:
      'Cylinder 2 fails to fire on roughly 6% of events — a worn plug, a weak coil or a leaking injector.',
    faults: { misfireRate: 0.06, misfireCylinder: 2 },
  },

  VACUUM_LEAK: {
    id: 'VACUUM_LEAK',
    label: 'Vacuum leak',
    description:
      'An unmetered hole downstream of the MAF, roughly 2 mm across — a split intake hose or a failed gasket.',
    // ~3 mm² of open area, admitting roughly half a gram per second. That is
    // near a fifth of idle airflow but only a few percent once the engine is
    // revved, which is precisely why the trims fall as RPM rises. A 4 mm hole
    // would admit most of the idle air and simply stall or race the engine.
    faults: { vacuumLeakArea: 3e-6 },
  },

  LEAN_MIXTURE: {
    id: 'LEAN_MIXTURE',
    label: 'Lean mixture',
    description:
      'Injectors deliver about 18% less fuel than commanded across the whole range, at normal rail pressure.',
    // Severe enough for the trims to reach the code threshold. A 10% error
    // genuinely would not set a code, which is realistic but leaves the
    // scenario with nothing to diagnose.
    faults: { fuelDeliveryScale: 0.82 },
  },

  RICH_MIXTURE: {
    id: 'RICH_MIXTURE',
    label: 'Rich mixture',
    description: 'Injectors deliver about 28% more fuel than commanded.',
    faults: { fuelDeliveryScale: 1.28 },
  },

  MAF_PROBLEM: {
    id: 'MAF_PROBLEM',
    label: 'MAF under-reporting',
    description: 'A contaminated MAF sensor reports about 18% less air than is actually flowing.',
    faults: { mafScale: 0.82 },
  },

  O2_PROBLEM: {
    id: 'O2_PROBLEM',
    label: 'Oxygen sensor lazy',
    description:
      'An aged upstream oxygen sensor responds far too slowly for closed-loop control to track.',
    faults: { o2Fault: 'SLOW' },
  },

  OVERHEATING: {
    id: 'OVERHEATING',
    label: 'Overheating',
    description:
      'The cooling fan has failed and the core is partly blocked, so heat rejection collapses at a standstill.',
    // 0.35 was not quite enough: the engine plateaued at 115 °C, just under the
    // 118 °C limit. That is a vehicle running hot, not one overheating.
    faults: { coolingEfficiency: 0.28, fanFailed: true },
  },

  LOW_BATTERY: {
    id: 'LOW_BATTERY',
    label: 'Low battery',
    description: 'A battery that rests near 11.9 V — sulfated or deeply discharged.',
    faults: { batteryRestVoltage: 11.9 },
  },

  CHARGING_FAILURE: {
    id: 'CHARGING_FAILURE',
    label: 'Charging failure',
    description: 'The alternator is not charging, so the battery alone is running the vehicle.',
    faults: { alternatorFailed: true, batteryRestVoltage: 12.4 },
  },

  THROTTLE_PROBLEM: {
    id: 'THROTTLE_PROBLEM',
    label: 'Throttle sticking',
    description:
      'A fouled throttle body: the plate sticks until commanded movement exceeds a few percent, then moves less than asked.',
    faults: { throttleResponseScale: 0.72, throttleStictionPercent: 4 },
  },

  COOLING_SYSTEM_PROBLEM: {
    id: 'COOLING_SYSTEM_PROBLEM',
    label: 'Thermostat stuck open',
    description:
      'The thermostat never closes, so the engine cannot reach operating temperature. The opposite failure to overheating.',
    faults: { thermostatStuckOpen: true },
  },

  FUEL_PRESSURE_PROBLEM: {
    id: 'FUEL_PRESSURE_PROBLEM',
    label: 'Low fuel pressure',
    description:
      'A weak pump or restricted filter, so the rail never reaches pressure and delivery falls with it.',
    // Almost the same delivery shortfall as LEAN_MIXTURE, and deliberately so:
    // the two present nearly identically in the fuel trims. What separates
    // them is rail pressure — low here, normal there. That is the kind of
    // ambiguity a differential diagnosis exists to resolve, so the simulator
    // must be able to produce it.
    faults: { fuelDeliveryScale: 0.78, fuelPressureScale: 0.62 },
  },

  TRANSMISSION_ABNORMALITY: {
    id: 'TRANSMISSION_ABNORMALITY',
    label: 'Transmission slip',
    description:
      'The CVT is slipping, so engine speed rises without a matching increase in road speed.',
    faults: { transmissionSlip: 0.28 },
  },
};

export function faultsForScenario(scenario: ScenarioId): FaultSet {
  return { ...HEALTHY, ...SCENARIO_DEFINITIONS[scenario].faults };
}

export function isScenarioId(value: string): value is ScenarioId {
  return (SCENARIOS as readonly string[]).includes(value);
}
