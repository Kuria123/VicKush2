import type { EngineModel } from './engine-model';

/**
 * Conditions under which the simulated ECU stores a fault code.
 *
 * Two rules govern this file:
 *
 * 1. **Codes are raised by conditions, never by scenarios.** No rule asks
 *    "is the vacuum leak scenario selected?". Each asks whether a measurable
 *    condition holds. A leak sets P0171 because the trims genuinely climb, so
 *    anything else that drives the trims up sets it too — which is precisely
 *    the ambiguity a differential diagnosis has to resolve later. Wiring
 *    scenario→code directly would let the diagnostic engine cheat.
 *
 * 2. **A fault must persist.** Real ECUs debounce: a transient does not
 *    illuminate a lamp. Each rule carries the time its condition must hold.
 *
 * The codes are standard SAE J2012 generic codes. No descriptions are stored
 * — see `src/domain/telemetry/dtc.ts` for why.
 */

export interface DtcContext {
  model: EngineModel;
  /** Combined fuel trim, as a percentage. */
  totalTrimPercent: number;
  /** Misfires counted in the last 200 revolutions, as a rate. */
  misfireRate: number;
  misfireCylinder: number;
  /** Reported MAF against speed-density expectation, as a ratio. */
  mafPlausibility: number;
  /**
   * Peak-to-peak swing of the sensed mixture. A healthy sensor follows the
   * ECU's deliberate dither; a lazy one damps it out.
   */
  lambdaSwing: number;
  /** Difference between commanded and actual throttle position, in percent. */
  throttleDivergence: number;
}

export interface DtcRule {
  code: string;
  /** How long the condition must hold before the code is stored, in seconds. */
  debounceSeconds: number;
  applies: (context: DtcContext) => boolean;
  /** Plain-language note about the threshold, for the simulator's own docs. */
  threshold: string;
}

const ENGINE_RUNNING = (context: DtcContext) => context.model.isRunning();

export const DTC_RULES: readonly DtcRule[] = [
  {
    code: 'P0171',
    debounceSeconds: 12,
    threshold: 'Combined fuel trim above +20% while running.',
    applies: (c) => ENGINE_RUNNING(c) && c.totalTrimPercent > 20,
  },
  {
    code: 'P0172',
    debounceSeconds: 12,
    threshold: 'Combined fuel trim below −20% while running.',
    applies: (c) => ENGINE_RUNNING(c) && c.totalTrimPercent < -20,
  },
  {
    code: 'P0300',
    debounceSeconds: 8,
    threshold: 'Misfire rate above 2% and not attributable to one cylinder.',
    applies: (c) => ENGINE_RUNNING(c) && c.misfireRate > 0.02 && c.misfireCylinder === 0,
  },
  {
    code: 'P0301',
    debounceSeconds: 8,
    threshold: 'Misfire rate above 2% attributed to cylinder 1.',
    applies: (c) => ENGINE_RUNNING(c) && c.misfireRate > 0.02 && c.misfireCylinder === 1,
  },
  {
    code: 'P0302',
    debounceSeconds: 8,
    threshold: 'Misfire rate above 2% attributed to cylinder 2.',
    applies: (c) => ENGINE_RUNNING(c) && c.misfireRate > 0.02 && c.misfireCylinder === 2,
  },
  {
    code: 'P0303',
    debounceSeconds: 8,
    threshold: 'Misfire rate above 2% attributed to cylinder 3.',
    applies: (c) => ENGINE_RUNNING(c) && c.misfireRate > 0.02 && c.misfireCylinder === 3,
  },
  {
    code: 'P0304',
    debounceSeconds: 8,
    threshold: 'Misfire rate above 2% attributed to cylinder 4.',
    applies: (c) => ENGINE_RUNNING(c) && c.misfireRate > 0.02 && c.misfireCylinder === 4,
  },
  {
    code: 'P0101',
    debounceSeconds: 15,
    threshold: 'Reported airflow differs from the speed-density expectation by more than 15%.',
    applies: (c) => ENGINE_RUNNING(c) && Math.abs(1 - c.mafPlausibility) > 0.15,
  },
  {
    code: 'P0128',
    debounceSeconds: 20,
    threshold:
      'Coolant still below 70 °C after ten minutes of running — the thermostat is not closing.',
    // Thresholds chosen against the model: a healthy engine idling from cold
    // passes 82 °C at around nine minutes, so this leaves real margin rather
    // than flagging a normal warm-up.
    applies: (c) =>
      ENGINE_RUNNING(c) &&
      c.model.getState().runTimeSeconds > 600 &&
      c.model.getState().coolantTemp < 70,
  },
  {
    code: 'P0217',
    debounceSeconds: 5,
    threshold: 'Coolant above 118 °C.',
    applies: (c) => c.model.getState().coolantTemp > 118,
  },
  {
    code: 'P0133',
    debounceSeconds: 20,
    threshold:
      'Sensed mixture swings less than 0.012 λ peak-to-peak while the ECU is dithering — the sensor is not following.',
    applies: (c) =>
      ENGINE_RUNNING(c) && c.model.getState().runTimeSeconds > 10 && c.lambdaSwing < 0.012,
  },
  {
    code: 'P0121',
    debounceSeconds: 10,
    threshold: 'Throttle plate position differs from the commanded position by more than 8%.',
    applies: (c) => ENGINE_RUNNING(c) && c.throttleDivergence > 8,
  },
  {
    code: 'P0562',
    debounceSeconds: 10,
    threshold: 'System voltage below 10.5 V while running.',
    applies: (c) => ENGINE_RUNNING(c) && c.model.getState().systemVoltage < 10.5,
  },
  {
    code: 'P0087',
    debounceSeconds: 15,
    threshold: 'Fuel rail pressure below 80% of nominal.',
    applies: (c) => ENGINE_RUNNING(c) && c.model.getOutputs().fuelPressure < 304,
  },
  {
    code: 'P0507',
    debounceSeconds: 15,
    threshold: 'Idle speed more than 200 rpm above target with the throttle closed.',
    applies: (c) => {
      const state = c.model.getState();
      return (
        ENGINE_RUNNING(c) &&
        state.throttlePosition < 2 &&
        state.rpm > c.model.spec.idleTargetRpm + 200
      );
    },
  },
];

/**
 * Tracks how long each rule's condition has held, and stores a code once it
 * has held long enough. A code, once stored, stays stored until cleared —
 * matching an ECU, and meaning a transient fault is still there to find after
 * conditions return to normal.
 */
export class DtcEvaluator {
  private readonly elapsed = new Map<string, number>();
  private readonly stored = new Set<string>();

  evaluate(context: DtcContext, dt: number): void {
    for (const rule of DTC_RULES) {
      if (rule.applies(context)) {
        const held = (this.elapsed.get(rule.code) ?? 0) + dt;
        this.elapsed.set(rule.code, held);
        if (held >= rule.debounceSeconds) this.stored.add(rule.code);
      } else {
        // Condition gone: the timer resets, but a stored code does not clear.
        this.elapsed.set(rule.code, 0);
      }
    }
  }

  storedCodes(): readonly string[] {
    return [...this.stored].sort();
  }

  /** Conditions currently met but not yet held long enough to store. */
  pendingCodes(): readonly string[] {
    return DTC_RULES.filter((rule) => {
      const held = this.elapsed.get(rule.code) ?? 0;
      return held > 0 && held < rule.debounceSeconds;
    })
      .map((rule) => rule.code)
      .sort();
  }

  clear(): void {
    this.stored.clear();
    this.elapsed.clear();
  }
}
