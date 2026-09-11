/**
 * OBD-II parameter catalogue.
 *
 * These are standard Mode 01 PIDs from SAE J1979 / ISO 15031-5. The `pid`
 * values and the min/max figures are the ranges the standard's encoding
 * permits — not estimates, and not per-vehicle limits. A specific vehicle's
 * usable range is narrower and is never assumed here.
 *
 * Decoding raw bytes into these values belongs to the real OBD provider
 * (Stage 24). This catalogue exists so the simulator, the UI and the
 * diagnostic engine can all refer to the same parameter by a stable id.
 *
 * Notably absent: misfire counters. Those are Mode 06 on-board monitoring
 * results (and often manufacturer-specific), not Mode 01 PIDs. Listing them
 * here with an invented PID would misrepresent how they are obtained; they
 * arrive when Mode 06 does.
 */

export const PARAMETER_GROUPS = [
  'ENGINE',
  'FUEL',
  'AIR',
  'TEMPERATURE',
  'ELECTRICAL',
  'VEHICLE',
] as const;
export type ParameterGroup = (typeof PARAMETER_GROUPS)[number];

export interface ParameterDefinition {
  id: string;
  /** Mode 01 PID. */
  pid: number;
  name: string;
  /** Short label for dense instrument layouts. */
  shortName: string;
  unit: string;
  /** Range permitted by the J1979 encoding. */
  min: number;
  max: number;
  /** Sensible decimal places for display. */
  decimals: number;
  group: ParameterGroup;
}

export const PARAMETERS = [
  {
    id: 'ENGINE_RPM',
    pid: 0x0c,
    name: 'Engine speed',
    shortName: 'RPM',
    unit: 'rpm',
    min: 0,
    max: 16383.75,
    decimals: 0,
    group: 'ENGINE',
  },
  {
    id: 'VEHICLE_SPEED',
    pid: 0x0d,
    name: 'Vehicle speed',
    shortName: 'Speed',
    unit: 'km/h',
    min: 0,
    max: 255,
    decimals: 0,
    group: 'VEHICLE',
  },
  {
    id: 'ENGINE_LOAD',
    pid: 0x04,
    name: 'Calculated engine load',
    shortName: 'Load',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 1,
    group: 'ENGINE',
  },
  {
    id: 'ABSOLUTE_LOAD',
    pid: 0x43,
    name: 'Absolute load value',
    shortName: 'Abs load',
    unit: '%',
    min: 0,
    max: 25700,
    decimals: 1,
    group: 'ENGINE',
  },
  {
    id: 'THROTTLE_POSITION',
    pid: 0x11,
    name: 'Throttle position',
    shortName: 'Throttle',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 1,
    group: 'ENGINE',
  },
  {
    id: 'TIMING_ADVANCE',
    pid: 0x0e,
    name: 'Timing advance',
    shortName: 'Timing',
    unit: '° BTDC',
    min: -64,
    max: 63.5,
    decimals: 1,
    group: 'ENGINE',
  },
  {
    id: 'RUN_TIME',
    pid: 0x1f,
    name: 'Run time since engine start',
    shortName: 'Run time',
    unit: 's',
    min: 0,
    max: 65535,
    decimals: 0,
    group: 'ENGINE',
  },

  {
    id: 'COOLANT_TEMP',
    pid: 0x05,
    name: 'Engine coolant temperature',
    shortName: 'Coolant',
    unit: '°C',
    min: -40,
    max: 215,
    decimals: 0,
    group: 'TEMPERATURE',
  },
  {
    id: 'INTAKE_AIR_TEMP',
    pid: 0x0f,
    name: 'Intake air temperature',
    shortName: 'IAT',
    unit: '°C',
    min: -40,
    max: 215,
    decimals: 0,
    group: 'TEMPERATURE',
  },
  {
    id: 'AMBIENT_AIR_TEMP',
    pid: 0x46,
    name: 'Ambient air temperature',
    shortName: 'Ambient',
    unit: '°C',
    min: -40,
    max: 215,
    decimals: 0,
    group: 'TEMPERATURE',
  },
  {
    id: 'OIL_TEMP',
    pid: 0x5c,
    name: 'Engine oil temperature',
    shortName: 'Oil temp',
    unit: '°C',
    min: -40,
    max: 210,
    decimals: 0,
    group: 'TEMPERATURE',
  },

  {
    id: 'MAF_RATE',
    pid: 0x10,
    name: 'Mass air flow rate',
    shortName: 'MAF',
    unit: 'g/s',
    min: 0,
    max: 655.35,
    decimals: 2,
    group: 'AIR',
  },
  {
    id: 'INTAKE_MAP',
    pid: 0x0b,
    name: 'Intake manifold absolute pressure',
    shortName: 'MAP',
    unit: 'kPa',
    min: 0,
    max: 255,
    decimals: 0,
    group: 'AIR',
  },
  {
    id: 'BAROMETRIC_PRESSURE',
    pid: 0x33,
    name: 'Absolute barometric pressure',
    shortName: 'Baro',
    unit: 'kPa',
    min: 0,
    max: 255,
    decimals: 0,
    group: 'AIR',
  },

  {
    id: 'SHORT_FUEL_TRIM_1',
    pid: 0x06,
    name: 'Short term fuel trim, bank 1',
    shortName: 'STFT B1',
    unit: '%',
    min: -100,
    max: 99.2,
    decimals: 1,
    group: 'FUEL',
  },
  {
    id: 'LONG_FUEL_TRIM_1',
    pid: 0x07,
    name: 'Long term fuel trim, bank 1',
    shortName: 'LTFT B1',
    unit: '%',
    min: -100,
    max: 99.2,
    decimals: 1,
    group: 'FUEL',
  },
  {
    id: 'SHORT_FUEL_TRIM_2',
    pid: 0x08,
    name: 'Short term fuel trim, bank 2',
    shortName: 'STFT B2',
    unit: '%',
    min: -100,
    max: 99.2,
    decimals: 1,
    group: 'FUEL',
  },
  {
    id: 'LONG_FUEL_TRIM_2',
    pid: 0x09,
    name: 'Long term fuel trim, bank 2',
    shortName: 'LTFT B2',
    unit: '%',
    min: -100,
    max: 99.2,
    decimals: 1,
    group: 'FUEL',
  },
  {
    id: 'FUEL_PRESSURE',
    pid: 0x0a,
    name: 'Fuel pressure',
    shortName: 'Fuel press',
    unit: 'kPa',
    min: 0,
    max: 765,
    decimals: 0,
    group: 'FUEL',
  },
  {
    id: 'FUEL_LEVEL',
    pid: 0x2f,
    name: 'Fuel tank level input',
    shortName: 'Fuel level',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 0,
    group: 'FUEL',
  },
  {
    id: 'COMMANDED_EQUIV_RATIO',
    pid: 0x44,
    name: 'Commanded air–fuel equivalence ratio',
    shortName: 'Lambda',
    unit: 'λ',
    min: 0,
    max: 2,
    decimals: 3,
    group: 'FUEL',
  },

  {
    id: 'O2_S1_VOLTAGE',
    pid: 0x14,
    name: 'Oxygen sensor 1 voltage (bank 1, sensor 1)',
    shortName: 'O2 S1',
    unit: 'V',
    min: 0,
    max: 1.275,
    decimals: 3,
    group: 'FUEL',
  },
  {
    id: 'O2_S1_LAMBDA',
    pid: 0x24,
    name: 'Oxygen sensor 1 equivalence ratio (wide range)',
    shortName: 'λ S1',
    unit: 'λ',
    min: 0,
    max: 2,
    decimals: 3,
    group: 'FUEL',
  },

  {
    id: 'CONTROL_MODULE_VOLTAGE',
    pid: 0x42,
    name: 'Control module voltage',
    shortName: 'Battery',
    unit: 'V',
    min: 0,
    max: 65.535,
    decimals: 2,
    group: 'ELECTRICAL',
  },
] as const satisfies readonly ParameterDefinition[];

export type ParameterId = (typeof PARAMETERS)[number]['id'];

const BY_ID = new Map<string, ParameterDefinition>(
  PARAMETERS.map((parameter) => [parameter.id, parameter]),
);

export function getParameter(id: string): ParameterDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function isParameterId(id: string): id is ParameterId {
  return BY_ID.has(id);
}

export function parametersInGroup(group: ParameterGroup): readonly ParameterDefinition[] {
  return PARAMETERS.filter((parameter) => parameter.group === group);
}

/** Formats a value using the parameter's own precision and unit. */
export function formatParameterValue(id: string, value: number): string {
  const parameter = getParameter(id);
  if (!parameter) return String(value);
  return `${value.toFixed(parameter.decimals)} ${parameter.unit}`;
}

/**
 * Whether a value falls inside what the encoding can represent. A value
 * outside this is a decode or transport fault, not a vehicle reading.
 */
export function isWithinEncodableRange(id: string, value: number): boolean {
  const parameter = getParameter(id);
  if (!parameter) return false;
  return value >= parameter.min && value <= parameter.max;
}
