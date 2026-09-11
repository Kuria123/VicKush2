import type { DiagnosticTroubleCode, TelemetrySample, TelemetrySource } from '../telemetry';
import { isValidDtc, normalizeDtc } from '../telemetry';

import { DtcEvaluator, type DtcContext } from './dtc-rules';
import {
  EngineModel,
  FIXED_STEP_SECONDS,
  type AmbientConditions,
  type DriverInput,
} from './engine-model';
import { faultsForScenario, isScenarioId, SCENARIOS, type ScenarioId } from './faults';

/**
 * The realistic vehicle simulator: a 2.0 L petrol CVT configuration, driven
 * by the physical model in `engine-model.ts`.
 *
 * It implements the Stage 5 `TelemetrySource` seam, so
 * `SimulatedVehicleDataProvider` picks it up without changing â€” the whole
 * point of having built the architecture first.
 *
 * Time is advanced in fixed 10 ms steps regardless of how often `sample` is
 * called. That keeps the integration stable and, with the seeded generator,
 * makes a run exactly reproducible: the same scenario always produces the
 * same telemetry and raises the same codes.
 */

export interface VehicleSimulatorOptions {
  seed?: number;
  ambient?: AmbientConditions;
  /** Start at operating temperature, as a vehicle already driven would. */
  warm?: boolean;
  /** Start the engine immediately. */
  autoStart?: boolean;
}

/** Misfire history is kept over a window, as an ECU counts over revolutions. */
const MISFIRE_WINDOW_SECONDS = 10;

export class VehicleSimulator implements TelemetrySource {
  private readonly model: EngineModel;
  private readonly evaluator = new DtcEvaluator();

  private scenario: ScenarioId = 'NORMAL';
  private input: DriverInput = { throttle: 0, driving: false };
  private simulatedSeconds = 0;
  private lastElapsedMs = 0;

  private misfireHistory: { at: number; count: number }[] = [];
  private lastMisfireCount = 0;

  private injected = new Map<string, DiagnosticTroubleCode>();

  constructor(private readonly options: VehicleSimulatorOptions = {}) {
    this.model = new EngineModel({
      seed: options.seed ?? 20_260_911,
      ambient: options.ambient,
      warm: options.warm ?? true,
    });
    if (options.autoStart ?? true) this.model.start();
  }

  /* --- Controls ---------------------------------------------------------- */

  listScenarios(): readonly string[] {
    return SCENARIOS;
  }

  setScenario(scenario: string): boolean {
    if (!isScenarioId(scenario)) return false;
    this.scenario = scenario;
    this.model.setFaults(faultsForScenario(scenario));
    return true;
  }

  activeScenario(): string {
    return this.scenario;
  }

  /** Driver input: accelerator position, 0â€“100. */
  setThrottle(percent: number): void {
    this.input = { ...this.input, throttle: Math.min(100, Math.max(0, percent)) };
  }

  /** Engages the driveline so the vehicle can move. */
  setDriving(driving: boolean): void {
    this.input = { ...this.input, driving };
  }

  start(): void {
    this.model.start();
  }

  stop(): void {
    this.model.stop();
  }

  isRunning(): boolean {
    return this.model.isRunning();
  }

  injectDtc(code: string): void {
    const normalized = normalizeDtc(code);
    if (!isValidDtc(normalized) || this.injected.has(normalized)) return;
    this.injected.set(normalized, {
      code: normalized,
      status: 'STORED',
      // No authoritative fault table exists; nothing is invented.
      description: null,
      moduleAddress: '7E0',
    });
  }

  clearInjectedFaults(): void {
    this.injected.clear();
    this.evaluator.clear();
  }

  reset(): void {
    this.model.reset(this.options.warm ?? true);
    this.evaluator.clear();
    this.injected.clear();
    this.scenario = 'NORMAL';
    this.model.setFaults(faultsForScenario('NORMAL'));
    this.input = { throttle: 0, driving: false };
    this.simulatedSeconds = 0;
    this.lastElapsedMs = 0;
    this.misfireHistory = [];
    this.lastMisfireCount = 0;
    if (this.options.autoStart ?? true) this.model.start();
  }

  /* --- TelemetrySource --------------------------------------------------- */

  supportedParameters(): readonly string[] {
    return [
      'ENGINE_RPM',
      'VEHICLE_SPEED',
      'ENGINE_LOAD',
      'THROTTLE_POSITION',
      'COOLANT_TEMP',
      'INTAKE_AIR_TEMP',
      'AMBIENT_AIR_TEMP',
      'MAF_RATE',
      'INTAKE_MAP',
      'BAROMETRIC_PRESSURE',
      'SHORT_FUEL_TRIM_1',
      'LONG_FUEL_TRIM_1',
      'FUEL_PRESSURE',
      'COMMANDED_EQUIV_RATIO',
      'O2_S1_LAMBDA',
      'O2_S1_VOLTAGE',
      'CONTROL_MODULE_VOLTAGE',
      'RUN_TIME',
    ];
  }

  sample(elapsedMs: number): TelemetrySample {
    this.advanceTo(elapsedMs);

    const state = this.model.getState();
    const outputs = this.model.getOutputs();

    const values = new Map<string, number>([
      ['ENGINE_RPM', round(state.rpm, 0)],
      ['VEHICLE_SPEED', round(state.vehicleSpeed * 3.6, 0)],
      ['ENGINE_LOAD', round(outputs.engineLoad, 1)],
      ['THROTTLE_POSITION', round(state.throttlePosition, 1)],
      ['COOLANT_TEMP', round(state.coolantTemp, 0)],
      ['INTAKE_AIR_TEMP', round(state.intakeAirTemp, 0)],
      ['AMBIENT_AIR_TEMP', round(this.model.ambient.airTemp, 0)],
      ['MAF_RATE', round(outputs.reportedMaf, 2)],
      ['INTAKE_MAP', round(state.map / 1000, 0)],
      ['BAROMETRIC_PRESSURE', round(this.model.ambient.pressure / 1000, 0)],
      ['SHORT_FUEL_TRIM_1', round(state.shortFuelTrim * 100, 1)],
      ['LONG_FUEL_TRIM_1', round(state.longFuelTrim * 100, 1)],
      ['FUEL_PRESSURE', round(outputs.fuelPressure, 0)],
      ['COMMANDED_EQUIV_RATIO', round(outputs.commandedLambda, 3)],
      ['O2_S1_LAMBDA', round(state.sensedLambda, 3)],
      ['O2_S1_VOLTAGE', round(outputs.o2Voltage, 3)],
      ['CONTROL_MODULE_VOLTAGE', round(state.systemVoltage, 2)],
      ['RUN_TIME', Math.floor(state.runTimeSeconds)],
    ]);

    return { values, dtcs: this.collectDtcs() };
  }

  /* --- Internals --------------------------------------------------------- */

  /**
   * Advances the model to the requested time in fixed steps.
   *
   * Going backwards is treated as a restart of the clock rather than an
   * error, so a caller that resets its own timer cannot desynchronise the
   * physics.
   */
  private advanceTo(elapsedMs: number): void {
    if (elapsedMs < this.lastElapsedMs) this.lastElapsedMs = elapsedMs;

    const targetSeconds = elapsedMs / 1000;
    // A guard against pathological input only. It was originally 6000 steps —
    // one minute — which silently truncated the thermal scenarios: a request
    // for ten minutes returned the state after one, with no indication the
    // physics had been skipped. An hour of simulated time is a few hundred
    // thousand cheap steps and no realistic caller reaches it.
    const maxSteps = 360_000;
    let steps = 0;

    while (this.simulatedSeconds < targetSeconds - FIXED_STEP_SECONDS / 2 && steps < maxSteps) {
      this.model.step(this.input);
      this.simulatedSeconds += FIXED_STEP_SECONDS;
      steps += 1;
      this.trackDerivedSignals(FIXED_STEP_SECONDS);
    }

    if (steps >= maxSteps) this.simulatedSeconds = targetSeconds;
    this.lastElapsedMs = elapsedMs;
  }

  private trackDerivedSignals(dt: number): void {
    const state = this.model.getState();

    // Misfire counting over a rolling window.
    const delta = state.misfireCount - this.lastMisfireCount;
    this.lastMisfireCount = state.misfireCount;
    if (delta > 0) {
      this.misfireHistory.push({ at: this.simulatedSeconds, count: delta });
    }
    const cutoff = this.simulatedSeconds - MISFIRE_WINDOW_SECONDS;
    this.misfireHistory = this.misfireHistory.filter((entry) => entry.at >= cutoff);

    this.evaluator.evaluate(this.buildContext(), dt);
  }

  private buildContext(): DtcContext {
    const state = this.model.getState();
    const outputs = this.model.getOutputs();
    const faults = faultsForScenario(this.scenario);

    const misfiresInWindow = this.misfireHistory.reduce((sum, e) => sum + e.count, 0);
    const firingEventsPerSecond = (state.rpm / 60) * 2; // 4-stroke, 4 cylinders
    const expected = Math.max(firingEventsPerSecond * MISFIRE_WINDOW_SECONDS, 1);

    return {
      model: this.model,
      totalTrimPercent: (state.shortFuelTrim + state.longFuelTrim) * 100,
      misfireRate: misfiresInWindow / expected,
      misfireCylinder: faults.misfireCylinder,
      // The ECU's plausibility check: reported airflow against what the
      // engine must actually be drawing at this speed and manifold pressure.
      mafPlausibility:
        outputs.actualAirflow > 0.2 ? outputs.reportedMaf / outputs.actualAirflow : 1,
      lambdaSwing: outputs.lambdaSwing,
      throttleDivergence: Math.abs(outputs.commandedThrottle - state.throttlePosition),
    };
  }

  private collectDtcs(): readonly DiagnosticTroubleCode[] {
    const stored = this.evaluator.storedCodes().map((code): DiagnosticTroubleCode => ({
      code,
      status: 'STORED',
      description: null,
      moduleAddress: '7E0',
    }));

    const pending = this.evaluator.pendingCodes().map((code): DiagnosticTroubleCode => ({
      code,
      status: 'PENDING',
      description: null,
      moduleAddress: '7E0',
    }));

    const storedCodes = new Set(stored.map((d) => d.code));
    return [
      ...stored,
      ...pending.filter((d) => !storedCodes.has(d.code)),
      ...[...this.injected.values()].filter((d) => !storedCodes.has(d.code)),
    ];
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
