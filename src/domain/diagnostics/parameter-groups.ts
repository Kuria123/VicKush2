/**
 * What a live scan shows, and in what order.
 *
 * The brief lists the parameters a technician expects to see. Two of them
 * need explaining rather than silently omitting:
 *
 * - **O2 / A-F** is present, as both the wide-range lambda and the narrowband
 *   voltage, since the pair is how a mixture fault is read.
 * - **Misfire counters are NOT here.** They are Mode 06 on-board monitoring
 *   results, not Mode 01 PIDs, and this project does not implement Mode 06.
 *   The live scan therefore shows them as unsupported and says why, rather
 *   than inventing a number or quietly dropping the row (Rule 1).
 */

export interface ScanGroup {
  id: string;
  label: string;
  parameterIds: readonly string[];
}

export const LIVE_SCAN_GROUPS: readonly ScanGroup[] = [
  {
    id: 'engine',
    label: 'Engine',
    parameterIds: ['ENGINE_RPM', 'ENGINE_LOAD', 'THROTTLE_POSITION', 'VEHICLE_SPEED'],
  },
  {
    id: 'air',
    label: 'Air',
    parameterIds: ['MAF_RATE', 'INTAKE_MAP', 'INTAKE_AIR_TEMP', 'BAROMETRIC_PRESSURE'],
  },
  {
    id: 'fuel',
    label: 'Fuel and mixture',
    parameterIds: [
      'SHORT_FUEL_TRIM_1',
      'LONG_FUEL_TRIM_1',
      'O2_S1_LAMBDA',
      'O2_S1_VOLTAGE',
      'COMMANDED_EQUIV_RATIO',
      'FUEL_PRESSURE',
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    parameterIds: ['COOLANT_TEMP', 'AMBIENT_AIR_TEMP'],
  },
  {
    id: 'electrical',
    label: 'Electrical',
    parameterIds: ['CONTROL_MODULE_VOLTAGE'],
  },
];

/** Every parameter a live scan asks for, in display order. */
export const LIVE_SCAN_PARAMETERS: readonly string[] = LIVE_SCAN_GROUPS.flatMap(
  (group) => group.parameterIds,
);

/**
 * Capabilities the brief asks the live scan to display that this project
 * cannot yet obtain. Shown on screen with the reason, so their absence is
 * visible rather than silent.
 */
export const UNAVAILABLE_CAPABILITIES: readonly {
  label: string;
  reason: string;
}[] = [
  {
    label: 'Misfire counters',
    reason:
      'Requires Mode 06 on-board monitoring results, which this build does not read. Not a Mode 01 parameter.',
  },
];

/** The parameters worth plotting large, because their shape carries meaning. */
export const FEATURED_TREND_PARAMETERS: readonly string[] = [
  'ENGINE_RPM',
  'SHORT_FUEL_TRIM_1',
  'LONG_FUEL_TRIM_1',
  'MAF_RATE',
];
