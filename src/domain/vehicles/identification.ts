/**
 * Vehicle identification: how sure are we that we know what this vehicle is?
 *
 * The score is a transparent sum of evidence, never a generated number. Each
 * contribution carries the reason it was awarded, so the total can always be
 * explained back to the user. Two vehicles with identical evidence always
 * score identically.
 */

import { assessVin } from './vin';
import type {
  IdentificationSource,
  IdentificationStatus,
  VehicleConfiguration,
  VehicleIdentity,
} from './types';

/**
 * Maximum points per item of evidence. They total 100, so a fully
 * OBD-confirmed vehicle with a valid VIN reaches 100.
 */
export const EVIDENCE_WEIGHTS = {
  make: 15,
  model: 15,
  year: 10,
  vin: 20,
  fuelType: 8,
  transmissionType: 8,
  engine: 9,
  obdProtocol: 8,
  ecu: 7,
} as const;

/**
 * How much to trust a fact by where it came from. A value read from the ECU
 * is taken at face value; one typed from memory is not.
 */
export const SOURCE_TRUST: Record<IdentificationSource, number> = {
  OBD_REPORTED: 1,
  VIN_DECODED: 0.9,
  USER_ENTERED: 0.7,
  UNKNOWN: 0.5,
};

/**
 * VIN evidence by check-digit outcome. A failed check digit still scores
 * well: it is not part of ISO 3779 outside North America, and Japanese-market
 * vehicles routinely fail it (see `vin.ts`).
 */
const VIN_POINTS = {
  checkDigitValid: EVIDENCE_WEIGHTS.vin, // 20
  checkDigitUnknown: 16,
  checkDigitInvalid: 12,
} as const;

export interface EvidenceContribution {
  field: string;
  points: number;
  reason: string;
}

export interface IdentificationAssessment {
  status: IdentificationStatus;
  /** 0–100, rounded. */
  confidence: number;
  contributions: readonly EvidenceContribution[];
  /** Plain-language explanation of what is missing or uncertain. */
  gaps: readonly string[];
}

export interface AssessIdentificationInput {
  identity: VehicleIdentity;
  configuration?: Partial<VehicleConfiguration> | null;
  source: IdentificationSource;
  /**
   * Set when two sources disagree about the same vehicle — for example a
   * user-entered model that contradicts the ECU. Resolving the conflict is a
   * later stage; recording it honestly is this one.
   */
  hasConflict?: boolean;
}

export function assessIdentification({
  identity,
  configuration,
  source,
  hasConflict = false,
}: AssessIdentificationInput): IdentificationAssessment {
  const trust = SOURCE_TRUST[source];
  const contributions: EvidenceContribution[] = [];
  const gaps: string[] = [];

  const award = (field: string, max: number, reason: string) => {
    contributions.push({
      field,
      points: Math.round(max * trust),
      reason,
    });
  };

  // --- Core identity -----------------------------------------------------
  if (identity.make) award('make', EVIDENCE_WEIGHTS.make, `Make recorded (${identity.make}).`);
  else gaps.push('Make is not known.');

  if (identity.model) award('model', EVIDENCE_WEIGHTS.model, `Model recorded (${identity.model}).`);
  else gaps.push('Model is not known.');

  if (identity.year) award('year', EVIDENCE_WEIGHTS.year, `Year recorded (${identity.year}).`);
  else gaps.push('Year is not known.');

  // --- VIN ---------------------------------------------------------------
  // VIN evidence is independent of the source multiplier: the check digit is
  // arithmetic on the VIN itself, not an assertion by whoever supplied it.
  if (identity.vin) {
    const vin = assessVin(identity.vin);
    if (!vin.isStructurallyValid) {
      gaps.push('The recorded VIN is not structurally valid.');
    } else if (vin.checkDigitValid === true) {
      contributions.push({
        field: 'vin',
        points: VIN_POINTS.checkDigitValid,
        reason: 'VIN is valid and its check digit matches.',
      });
    } else if (vin.checkDigitValid === false) {
      contributions.push({
        field: 'vin',
        points: VIN_POINTS.checkDigitInvalid,
        reason:
          'VIN is structurally valid but its check digit does not match. ' +
          'This is normal for vehicles not built for the North American market.',
      });
      gaps.push('VIN check digit does not match; treat the VIN as unconfirmed.');
    } else {
      contributions.push({
        field: 'vin',
        points: VIN_POINTS.checkDigitUnknown,
        reason: 'VIN is structurally valid; check digit could not be evaluated.',
      });
    }
  } else {
    gaps.push('No VIN recorded.');
  }

  // --- Configuration -----------------------------------------------------
  const config = configuration ?? null;

  if (config?.fuelType) {
    award('fuelType', EVIDENCE_WEIGHTS.fuelType, `Fuel type known (${config.fuelType}).`);
  } else {
    gaps.push('Fuel type is not known.');
  }

  if (config?.transmissionType) {
    award(
      'transmissionType',
      EVIDENCE_WEIGHTS.transmissionType,
      `Transmission known (${config.transmissionType}).`,
    );
  } else {
    gaps.push('Transmission is not known.');
  }

  if (config?.engineCode || config?.engineDisplacementCc) {
    award(
      'engine',
      EVIDENCE_WEIGHTS.engine,
      config.engineCode
        ? `Engine identified (${config.engineCode}).`
        : `Engine displacement known (${config.engineDisplacementCc} cc).`,
    );
  } else {
    gaps.push('Engine is not identified.');
  }

  if (config?.obdProtocol && config.obdProtocol !== 'UNKNOWN') {
    award('obdProtocol', EVIDENCE_WEIGHTS.obdProtocol, 'OBD protocol established.');
  } else {
    gaps.push('OBD protocol has not been established.');
  }

  if (config?.ecuName) {
    award('ecu', EVIDENCE_WEIGHTS.ecu, `ECU reported (${config.ecuName}).`);
  } else {
    gaps.push('ECU has not been read.');
  }

  const confidence = Math.min(
    100,
    Math.max(0, Math.round(contributions.reduce((total, item) => total + item.points, 0))),
  );

  return {
    status: deriveStatus({ identity, configuration: config, hasConflict }),
    confidence,
    contributions,
    gaps,
  };
}

function deriveStatus({
  identity,
  configuration,
  hasConflict,
}: {
  identity: VehicleIdentity;
  configuration: Partial<VehicleConfiguration> | null;
  hasConflict: boolean;
}): IdentificationStatus {
  // A conflict outranks everything: we may know a great deal and still not
  // know which account of the vehicle is true.
  if (hasConflict) return 'CONFLICTED';

  const hasAnything = Boolean(identity.make || identity.model || identity.year || identity.vin);
  if (!hasAnything) return 'UNIDENTIFIED';

  const hasCoreIdentity = Boolean(identity.make && identity.model && identity.year);
  if (!hasCoreIdentity) return 'PARTIALLY_IDENTIFIED';

  // Make, model and year alone describe a brochure, not a specific car. A
  // vehicle counts as identified once a VIN pins it down, or once the
  // drivetrain is known well enough to pick the right diagnostic procedures.
  const vinConfirms = Boolean(identity.vin) && assessVin(identity.vin ?? '').isStructurallyValid;
  const drivetrainKnown = Boolean(configuration?.fuelType && configuration?.transmissionType);

  return vinConfirms || drivetrainKnown ? 'IDENTIFIED' : 'PARTIALLY_IDENTIFIED';
}

export const IDENTIFICATION_STATUS_LABELS: Record<IdentificationStatus, string> = {
  UNIDENTIFIED: 'Unidentified',
  PARTIALLY_IDENTIFIED: 'Partially identified',
  IDENTIFIED: 'Identified',
  CONFLICTED: 'Conflicting information',
};
