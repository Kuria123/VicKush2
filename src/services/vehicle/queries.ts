import 'server-only';

import { prisma } from '@/lib/db/client';
import {
  assessIdentification,
  formatVehicleName,
  formatVehicleSpec,
  type IdentificationAssessment,
  type VehicleConfiguration,
  type VehicleIdentity,
} from '@/domain/vehicles';

/**
 * Vehicle reads.
 *
 * Every function is scoped by `ownerId`. Ownership is enforced in the query
 * itself rather than checked afterwards, so a caller cannot forget it and
 * there is no window in which another owner's row is loaded.
 */

// Not `as const`: Prisma needs a mutable orderBy array, and the literal form
// is what drives its include type inference.
const DETAIL_INCLUDE = {
  identification: true,
  configuration: true,
  modules: { orderBy: [{ system: 'asc' as const }, { name: 'asc' as const }] },
};

export interface VehicleSummary {
  id: string;
  name: string;
  spec: string;
  isPrimary: boolean;
  vin: string | null;
  identificationStatus: string;
  confidence: number;
}

export async function countVehiclesForOwner(ownerId: string): Promise<number> {
  return prisma.vehicle.count({ where: { ownerId, deletedAt: null } });
}

export async function listVehiclesForOwner(ownerId: string): Promise<VehicleSummary[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId, deletedAt: null },
    include: { identification: true, configuration: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  return vehicles.map((vehicle) => {
    const identity: VehicleIdentity = {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
    };

    return {
      id: vehicle.id,
      name: vehicle.displayName ?? formatVehicleName(identity),
      spec: formatVehicleSpec(identity, vehicle.configuration),
      isPrimary: vehicle.isPrimary,
      vin: vehicle.vin,
      identificationStatus: vehicle.identification?.status ?? 'UNIDENTIFIED',
      confidence: vehicle.identification?.confidence ?? 0,
    };
  });
}

export type VehicleDetail = NonNullable<Awaited<ReturnType<typeof loadVehicleRecord>>>;

async function loadVehicleRecord(vehicleId: string, ownerId: string) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId, deletedAt: null },
    include: DETAIL_INCLUDE,
  });
}

export interface VehicleWithAssessment {
  vehicle: VehicleDetail;
  identity: VehicleIdentity;
  name: string;
  spec: string;
  /**
   * Recomputed on read from the stored facts, so the explanation can never be
   * stale relative to them.
   */
  assessment: IdentificationAssessment;
}

/** Returns null when the vehicle does not exist or is not this owner's. */
export async function getVehicleForOwner(
  vehicleId: string,
  ownerId: string,
): Promise<VehicleWithAssessment | null> {
  const vehicle = await loadVehicleRecord(vehicleId, ownerId);
  if (!vehicle) return null;

  const identity: VehicleIdentity = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin,
  };

  const configuration: Partial<VehicleConfiguration> | null = vehicle.configuration;

  return {
    vehicle,
    identity,
    name: vehicle.displayName ?? formatVehicleName(identity),
    spec: formatVehicleSpec(identity, configuration),
    assessment: assessIdentification({
      identity,
      configuration,
      source: vehicle.identification?.source ?? 'UNKNOWN',
      hasConflict: vehicle.identification?.hasConflict ?? false,
    }),
  };
}

/** True when this owner already has a vehicle carrying the VIN. */
export async function vinExistsForOwner(
  ownerId: string,
  vin: string,
  excludeVehicleId?: string,
): Promise<boolean> {
  const found = await prisma.vehicle.findFirst({
    where: {
      ownerId,
      vin,
      deletedAt: null,
      ...(excludeVehicleId ? { NOT: { id: excludeVehicleId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}
