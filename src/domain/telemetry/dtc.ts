/**
 * Diagnostic trouble code structure (SAE J2012 / ISO 15031-6).
 *
 * A DTC's five characters encode which system raised it, whether the code is
 * standardised or manufacturer-defined, and which subsystem it concerns.
 * That structure is published and can be decoded with confidence.
 *
 * What is NOT decoded here is the code's meaning. "P0171 — System too lean,
 * bank 1" requires an authoritative fault table this project does not yet
 * have. Writing descriptions from memory would fabricate diagnostic data and
 * risk sending someone to replace the wrong part (Rule 1), so `describe`
 * deliberately does not exist. A real table can be attached later.
 */

export const DTC_SYSTEMS = ['POWERTRAIN', 'BODY', 'CHASSIS', 'NETWORK'] as const;
export type DtcSystem = (typeof DTC_SYSTEMS)[number];

const SYSTEM_BY_PREFIX: Record<string, DtcSystem> = {
  P: 'POWERTRAIN',
  B: 'BODY',
  C: 'CHASSIS',
  U: 'NETWORK',
};

export const DTC_SYSTEM_LABELS: Record<DtcSystem, string> = {
  POWERTRAIN: 'Powertrain',
  BODY: 'Body',
  CHASSIS: 'Chassis',
  NETWORK: 'Network',
};

/**
 * Who defines the code. `MIXED` is honest rather than lazy: in the P3 range
 * part is manufacturer-defined and part is standardised, and which half a
 * given code falls in cannot be determined from the digit alone.
 */
export const DTC_AUTHORITIES = ['GENERIC', 'MANUFACTURER', 'MIXED'] as const;
export type DtcAuthority = (typeof DTC_AUTHORITIES)[number];

const AUTHORITY_BY_DIGIT: Record<string, DtcAuthority> = {
  '0': 'GENERIC',
  '1': 'MANUFACTURER',
  '2': 'GENERIC',
  '3': 'MIXED',
};

/**
 * Powertrain subsystem, from the third character. Only the values that are
 * unambiguous in the standard are mapped; anything else returns null rather
 * than being guessed.
 */
const POWERTRAIN_SUBSYSTEM: Record<string, string> = {
  '0': 'Fuel and air metering, and auxiliary emission controls',
  '1': 'Fuel and air metering',
  '2': 'Fuel and air metering (injector circuit)',
  '3': 'Ignition system or misfire',
  '4': 'Auxiliary emission controls',
  '5': 'Vehicle speed control, idle control and auxiliary inputs',
  '6': 'Computer output circuit',
  '7': 'Transmission',
  '8': 'Transmission',
};

const DTC_PATTERN = /^[PBCU][0-3][0-9A-F]{3}$/;

export interface DtcStructure {
  /** Uppercased, whitespace removed. */
  code: string;
  system: DtcSystem;
  authority: DtcAuthority;
  /** Null when the subsystem digit has no unambiguous meaning. */
  subsystem: string | null;
}

export function normalizeDtc(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase();
}

export function isValidDtc(raw: string): boolean {
  return DTC_PATTERN.test(normalizeDtc(raw));
}

/** Returns null when the input is not a well-formed DTC. */
export function parseDtc(raw: string): DtcStructure | null {
  const code = normalizeDtc(raw);
  if (!DTC_PATTERN.test(code)) return null;

  const system = SYSTEM_BY_PREFIX[code[0]!];
  const authority = AUTHORITY_BY_DIGIT[code[1]!];
  if (!system || !authority) return null;

  return {
    code,
    system,
    authority,
    subsystem: system === 'POWERTRAIN' ? (POWERTRAIN_SUBSYSTEM[code[2]!] ?? null) : null,
  };
}

/**
 * A one-line account of what the code's structure tells us — never what the
 * fault is.
 */
export function describeDtcStructure(structure: DtcStructure): string {
  const authority =
    structure.authority === 'GENERIC'
      ? 'standardised'
      : structure.authority === 'MANUFACTURER'
        ? 'manufacturer-defined'
        : 'partly standardised';

  const parts = [`${DTC_SYSTEM_LABELS[structure.system]}, ${authority}`];
  if (structure.subsystem) parts.push(structure.subsystem);
  return parts.join(' · ');
}
