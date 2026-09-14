/**
 * Vehicle domain vocabulary.
 *
 * These enums are declared here, in the domain, rather than imported from the
 * generated Prisma client: the domain must not depend on persistence. The
 * Prisma schema mirrors these values exactly, so the mapping in the service
 * layer is an identity check rather than a translation.
 *
 * Every optional field means "not known". A null is never backfilled with a
 * plausible default — an unknown engine is unknown, not a guess (Rule 1).
 */

export const FUEL_TYPES = [
  'PETROL',
  'DIESEL',
  'HYBRID_PETROL',
  'HYBRID_DIESEL',
  'PLUG_IN_HYBRID',
  'ELECTRIC',
  'LPG',
  'CNG',
  'OTHER',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSION_TYPES = [
  'MANUAL',
  'AUTOMATIC',
  'CVT',
  'DUAL_CLUTCH',
  'AUTOMATED_MANUAL',
  'REDUCTION_GEAR',
  'OTHER',
] as const;
export type TransmissionType = (typeof TRANSMISSION_TYPES)[number];

export const DRIVE_TYPES = ['FWD', 'RWD', 'AWD', 'FOUR_WD'] as const;
export type DriveType = (typeof DRIVE_TYPES)[number];

/**
 * The OBD-II link-layer protocols an ELM327-class adapter reports, in its own
 * numbering order (SAE J1979 / ISO 15031-5). Kept exact so a discovered
 * protocol can be recorded verbatim rather than approximated.
 */
export const OBD_PROTOCOLS = [
  'SAE_J1850_PWM',
  'SAE_J1850_VPW',
  'ISO_9141_2',
  'ISO_14230_4_KWP_5BAUD',
  'ISO_14230_4_KWP_FAST',
  'ISO_15765_4_CAN_11B_500K',
  'ISO_15765_4_CAN_29B_500K',
  'ISO_15765_4_CAN_11B_250K',
  'ISO_15765_4_CAN_29B_250K',
  'SAE_J1939_CAN',
  'UNKNOWN',
] as const;
export type ObdProtocol = (typeof OBD_PROTOCOLS)[number];

export const OBD_PROTOCOL_LABELS: Record<ObdProtocol, string> = {
  SAE_J1850_PWM: 'SAE J1850 PWM (41.6 kbaud)',
  SAE_J1850_VPW: 'SAE J1850 VPW (10.4 kbaud)',
  ISO_9141_2: 'ISO 9141-2',
  ISO_14230_4_KWP_5BAUD: 'ISO 14230-4 KWP (5-baud init)',
  ISO_14230_4_KWP_FAST: 'ISO 14230-4 KWP (fast init)',
  ISO_15765_4_CAN_11B_500K: 'ISO 15765-4 CAN (11-bit, 500 kbaud)',
  ISO_15765_4_CAN_29B_500K: 'ISO 15765-4 CAN (29-bit, 500 kbaud)',
  ISO_15765_4_CAN_11B_250K: 'ISO 15765-4 CAN (11-bit, 250 kbaud)',
  ISO_15765_4_CAN_29B_250K: 'ISO 15765-4 CAN (29-bit, 250 kbaud)',
  SAE_J1939_CAN: 'SAE J1939 (CAN, heavy duty)',
  UNKNOWN: 'Unknown',
};

/** Vehicle systems a control module can belong to. */
export const MODULE_SYSTEMS = [
  'ENGINE',
  'TRANSMISSION',
  'ABS',
  'SRS',
  'BODY',
  'CLIMATE',
  'INSTRUMENT_CLUSTER',
  'STEERING',
  'IMMOBILISER',
  'HYBRID_BATTERY',
  'OTHER',
] as const;
export type ModuleSystem = (typeof MODULE_SYSTEMS)[number];

/**
 * What is known about a module. `NOT_SUPPORTED` and `NOT_RESPONDING` are
 * deliberately distinct: the first means the vehicle has no such module, the
 * second means we could not reach one that may well exist.
 */
export const MODULE_STATUSES = [
  'DETECTED',
  'NOT_RESPONDING',
  'NOT_SUPPORTED',
  'ERROR',
  'UNKNOWN',
] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

/**
 * Where a fact about the vehicle came from. This drives confidence: a value
 * read from the ECU is worth more than one a person typed from memory.
 */
export const IDENTIFICATION_SOURCES = [
  'USER_ENTERED',
  'IMAGE_RECOGNISED',
  'VIN_DECODED',
  'OBD_REPORTED',
  'UNKNOWN',
] as const;
export type IdentificationSource = (typeof IDENTIFICATION_SOURCES)[number];

export const IDENTIFICATION_STATUSES = [
  'UNIDENTIFIED',
  'PARTIALLY_IDENTIFIED',
  'IDENTIFIED',
  'CONFLICTED',
] as const;
export type IdentificationStatus = (typeof IDENTIFICATION_STATUSES)[number];

/* -------------------------------------------------------------------------
 * Entities (persistence-free shapes)
 * ---------------------------------------------------------------------- */

export interface VehicleConfiguration {
  engineCode: string | null;
  engineDisplacementCc: number | null;
  engineCylinders: number | null;
  fuelType: FuelType | null;
  transmissionType: TransmissionType | null;
  transmissionGears: number | null;
  driveType: DriveType | null;
  ecuName: string | null;
  obdProtocol: ObdProtocol | null;
  /** Null means we have not established whether the vehicle speaks OBD-II. */
  supportsObd2: boolean | null;
  source: IdentificationSource;
}

export interface VehicleModule {
  id: string;
  name: string;
  system: ModuleSystem;
  /** ECU address as reported, e.g. "7E0". Null when not known. */
  address: string | null;
  protocol: ObdProtocol | null;
  status: ModuleStatus;
  discoveredAt: Date | null;
}

export interface VehicleIdentity {
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
}
