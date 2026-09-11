/**
 * Presentation-independent formatting of vehicle facts.
 *
 * Every function here degrades honestly: an unknown field is omitted or
 * rendered as "Unknown", never filled with a plausible substitute.
 */

import type { FuelType, TransmissionType, VehicleConfiguration, VehicleIdentity } from './types';

export const FUEL_LABELS: Record<FuelType, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  HYBRID_PETROL: 'Hybrid (petrol)',
  HYBRID_DIESEL: 'Hybrid (diesel)',
  PLUG_IN_HYBRID: 'Plug-in hybrid',
  ELECTRIC: 'Electric',
  LPG: 'LPG',
  CNG: 'CNG',
  OTHER: 'Other',
};

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic',
  CVT: 'CVT',
  DUAL_CLUTCH: 'Dual clutch',
  AUTOMATED_MANUAL: 'Automated manual',
  REDUCTION_GEAR: 'Reduction gear',
  OTHER: 'Other',
};

/** "Toyota Harrier" — or as much of it as is known. */
export function formatVehicleName(identity: VehicleIdentity): string {
  const parts = [identity.make, identity.model].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (identity.vin) return `VIN ${identity.vin}`;
  return 'Unidentified vehicle';
}

/**
 * "2018 · 2.0L Petrol · CVT" — the subtitle line, built only from what is
 * actually known. Returns an empty string when nothing is.
 */
export function formatVehicleSpec(
  identity: VehicleIdentity,
  configuration?: Partial<VehicleConfiguration> | null,
): string {
  const parts: string[] = [];

  if (identity.year) parts.push(String(identity.year));

  const engine = formatEngine(configuration);
  if (engine) parts.push(engine);

  if (configuration?.transmissionType) {
    parts.push(TRANSMISSION_LABELS[configuration.transmissionType]);
  }

  return parts.join(' · ');
}

/** "2.0L Petrol", "2.0L", "Petrol", or empty when neither is known. */
export function formatEngine(configuration?: Partial<VehicleConfiguration> | null): string {
  if (!configuration) return '';

  const parts: string[] = [];
  if (configuration.engineDisplacementCc) {
    parts.push(formatDisplacement(configuration.engineDisplacementCc));
  }
  if (configuration.fuelType) parts.push(FUEL_LABELS[configuration.fuelType]);

  return parts.join(' ');
}

/** 1998 cc → "2.0L". Rounded to one decimal, which is how engines are named. */
export function formatDisplacement(cc: number): string {
  return `${(cc / 1000).toFixed(1)}L`;
}
