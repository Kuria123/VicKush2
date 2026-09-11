import type { DiagnosticTroubleCode } from './types';

/**
 * Where a simulator's numbers come from.
 *
 * Separating this from the provider is what keeps Stage 5 honest about its
 * own scope. The provider is the architecture — connection lifecycle,
 * capabilities, streaming, error handling — and it is finished. The physical
 * model is Stage 6, and it drops in here without the provider changing.
 */
export interface TelemetrySample {
  /** parameter id → value, in the parameter's own unit. */
  values: ReadonlyMap<string, number>;
  dtcs: readonly DiagnosticTroubleCode[];
}

export interface TelemetrySource {
  /** Parameter ids this simulated vehicle answers to. */
  supportedParameters(): readonly string[];

  /** Sampled at `elapsedMs` since the simulation started. */
  sample(elapsedMs: number): TelemetrySample;

  listScenarios(): readonly string[];
  /** False when the scenario is unknown. */
  setScenario(scenario: string): boolean;
  activeScenario(): string;

  injectDtc(code: string): void;
  clearInjectedFaults(): void;
  reset(): void;

  /**
   * Accelerator position, 0–100, for sources that model one.
   *
   * Optional because not every source has a driver. It exists because the
   * diagnosis asks the user to raise engine speed and compare — that
   * comparison is what separates an unmetered air leak from a proportional
   * fuelling error — and a product that asks for a condition it gives no way
   * to produce has asked for nothing.
   */
  setThrottle?(percent: number): void;
}

/**
 * A deliberately inert source: fixed values that never change.
 *
 * This is NOT a model of an engine and makes no attempt to be one. It exists
 * so the provider architecture can be built and tested end to end in Stage 5
 * without pretending to simulate combustion. Stage 6 replaces it with the
 * coupled model where RPM drives load, load drives MAF, and fuel trims
 * respond — the thing that makes the diagnostic engine worth testing.
 *
 * Values are a plausible warm idle, chosen only so that units and ranges are
 * exercised. Nothing downstream should read meaning into them, and every
 * surface that shows them is marked SIMULATION MODE.
 */
export class StaticTelemetrySource implements TelemetrySource {
  static readonly SCENARIO_STATIC = 'STATIC';

  private injected: DiagnosticTroubleCode[] = [];

  private readonly fixed = new Map<string, number>([
    ['ENGINE_RPM', 750],
    ['VEHICLE_SPEED', 0],
    ['ENGINE_LOAD', 18.8],
    ['THROTTLE_POSITION', 13.7],
    ['COOLANT_TEMP', 88],
    ['INTAKE_AIR_TEMP', 31],
    ['MAF_RATE', 2.8],
    ['INTAKE_MAP', 33],
    ['SHORT_FUEL_TRIM_1', 0.8],
    ['LONG_FUEL_TRIM_1', 2.3],
    ['CONTROL_MODULE_VOLTAGE', 14.1],
    ['RUN_TIME', 0],
  ]);

  supportedParameters(): readonly string[] {
    return [...this.fixed.keys()];
  }

  sample(elapsedMs: number): TelemetrySample {
    const values = new Map(this.fixed);
    // The one value that legitimately moves without a physical model.
    values.set('RUN_TIME', Math.floor(elapsedMs / 1000));
    return { values, dtcs: [...this.injected] };
  }

  listScenarios(): readonly string[] {
    return [StaticTelemetrySource.SCENARIO_STATIC];
  }

  setScenario(scenario: string): boolean {
    return scenario === StaticTelemetrySource.SCENARIO_STATIC;
  }

  activeScenario(): string {
    return StaticTelemetrySource.SCENARIO_STATIC;
  }

  injectDtc(code: string): void {
    if (this.injected.some((dtc) => dtc.code === code)) return;
    this.injected.push({
      code,
      status: 'STORED',
      // No authoritative fault table exists yet, so no description is
      // invented for an injected code.
      description: null,
      moduleAddress: '7E0',
    });
  }

  clearInjectedFaults(): void {
    this.injected = [];
  }

  reset(): void {
    this.clearInjectedFaults();
  }
}
