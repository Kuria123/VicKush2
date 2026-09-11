/**
 * What the engine was doing when a reading was taken.
 *
 * This is the foundation of the whole diagnostic engine. "Fuel trim is +22%"
 * is nearly useless on its own; "+22% at idle, +4% under load" identifies an
 * unmetered air leak and rules out most alternatives. Every observation is
 * therefore tagged with the condition it was observed in, and comparisons
 * across conditions are where the diagnosis actually comes from.
 */

export const OPERATING_CONDITIONS = [
  'ENGINE_OFF',
  'CRANKING',
  'IDLE',
  'LIGHT_LOAD',
  'CRUISE',
  'HIGH_LOAD',
  'DECELERATION',
  'UNKNOWN',
] as const;
export type OperatingCondition = (typeof OPERATING_CONDITIONS)[number];

export const CONDITION_LABELS: Record<OperatingCondition, string> = {
  ENGINE_OFF: 'Engine off',
  CRANKING: 'Cranking',
  IDLE: 'Idle',
  LIGHT_LOAD: 'Light load',
  CRUISE: 'Cruise',
  HIGH_LOAD: 'High load',
  DECELERATION: 'Deceleration',
  UNKNOWN: 'Unknown',
};

export interface ConditionInputs {
  rpm: number | null;
  vehicleSpeed: number | null;
  throttlePosition: number | null;
  engineLoad: number | null;
}

/**
 * Classifies one sample.
 *
 * Returns UNKNOWN rather than guessing when engine speed is missing: without
 * it there is no basis for any of the distinctions below, and a wrong
 * condition would mislabel every observation taken during it.
 */
export function classifyCondition(inputs: ConditionInputs): OperatingCondition {
  const { rpm, vehicleSpeed, throttlePosition, engineLoad } = inputs;

  if (rpm === null) return 'UNKNOWN';
  if (rpm < 50) return 'ENGINE_OFF';
  if (rpm < 400) return 'CRANKING';

  const closedThrottle = throttlePosition !== null && throttlePosition < 3;
  const stationary = vehicleSpeed === null || vehicleSpeed < 3;

  // Closed throttle while the engine is spinning fast means the vehicle is
  // driving the engine, not the other way round. Fuel is usually cut, so
  // mixture observations taken here mean something quite different.
  if (closedThrottle && rpm > 1300 && !stationary) return 'DECELERATION';

  if (closedThrottle && stationary && rpm < 1300) return 'IDLE';

  if (engineLoad !== null) {
    if (engineLoad >= 70) return 'HIGH_LOAD';
    if (engineLoad >= 25 && !stationary) return 'CRUISE';
    if (engineLoad >= 25) return 'LIGHT_LOAD';
  }

  // Throttle open but load unknown or low.
  return stationary ? 'LIGHT_LOAD' : 'CRUISE';
}

/** Conditions where the mixture is under closed-loop control and meaningful. */
export const CLOSED_LOOP_CONDITIONS: readonly OperatingCondition[] = [
  'IDLE',
  'LIGHT_LOAD',
  'CRUISE',
  'HIGH_LOAD',
];

export function isClosedLoopCondition(condition: OperatingCondition): boolean {
  return CLOSED_LOOP_CONDITIONS.includes(condition);
}

/**
 * Rough ordering by airflow, used to compare an observation at low airflow
 * against the same observation at high airflow. Conditions outside the
 * closed-loop set have no meaningful position and return null.
 */
export function airflowRank(condition: OperatingCondition): number | null {
  switch (condition) {
    case 'IDLE':
      return 0;
    case 'LIGHT_LOAD':
      return 1;
    case 'CRUISE':
      return 2;
    case 'HIGH_LOAD':
      return 3;
    default:
      return null;
  }
}
