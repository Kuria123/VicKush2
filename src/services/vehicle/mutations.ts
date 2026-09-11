import 'server-only';

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging/logger';
import {
  assessIdentification,
  assessVin,
  type IdentificationSource,
  type VehicleConfiguration,
  type VehicleIdentity,
} from '@/domain/vehicles';
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleConfigurationInput,
  VehicleModuleInput,
} from '@/lib/validation/vehicle';

/**
 * Vehicle writes.
 *
 * Two invariants are maintained here rather than left to callers:
 *
 * 1. The stored identification snapshot is recomputed from the vehicle's
 *    facts after every write, so status and confidence can never drift from
 *    the data they describe.
 * 2. At most one vehicle per owner is primary.
 *
 * Every write is scoped by ownerId.
 */

export class VehicleNotFoundError extends Error {
  constructor() {
    super('Vehicle not found.');
    this.name = 'VehicleNotFoundError';
  }
}

export class DuplicateVinError extends Error {
  constructor() {
    super('You already have a vehicle with that VIN.');
    this.name = 'DuplicateVinError';
  }
}

/**
 * Recomputes the identification snapshot for a vehicle and writes it.
 *
 * Runs inside the caller's transaction so the facts and the snapshot derived
 * from them commit together — there is no moment where the database holds a
 * confidence that does not match the data.
 */
async function syncIdentification(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  vehicleId: string,
): Promise<void> {
  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    include: { configuration: true, identification: true },
  });
  if (!vehicle) throw new VehicleNotFoundError();

  const identity: VehicleIdentity = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin,
  };
  const configuration: Partial<VehicleConfiguration> | null = vehicle.configuration;

  const source: IdentificationSource =
    vehicle.configuration?.source ?? vehicle.identification?.source ?? 'USER_ENTERED';

  const assessment = assessIdentification({
    identity,
    configuration,
    source,
    hasConflict: vehicle.identification?.hasConflict ?? false,
  });

  const vin = vehicle.vin ? assessVin(vehicle.vin) : null;

  const snapshot = {
    status: assessment.status,
    confidence: assessment.confidence,
    source,
    vinStructurallyValid: vin ? vin.isStructurallyValid : null,
    vinCheckDigitValid: vin ? vin.checkDigitValid : null,
    assessedAt: new Date(),
  };

  await tx.vehicleIdentification.upsert({
    where: { vehicleId },
    create: { vehicleId, ...snapshot },
    update: snapshot,
  });
}

/** Clears the primary flag from every other vehicle this owner has. */
async function demoteOtherPrimaries(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ownerId: string,
  keepVehicleId: string,
): Promise<void> {
  await tx.vehicle.updateMany({
    where: { ownerId, isPrimary: true, NOT: { id: keepVehicleId } },
    data: { isPrimary: false },
  });
}

export async function createVehicle(ownerId: string, input: CreateVehicleInput): Promise<string> {
  const vin = input.vin ?? null;

  if (vin) {
    const existing = await prisma.vehicle.findFirst({
      where: { ownerId, vin, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new DuplicateVinError();
  }

  return prisma.$transaction(async (tx) => {
    // The first vehicle an owner adds becomes primary automatically.
    const existingCount = await tx.vehicle.count({
      where: { ownerId, deletedAt: null },
    });

    const vehicle = await tx.vehicle.create({
      data: {
        ownerId,
        displayName: input.displayName ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        vin,
        isPrimary: existingCount === 0,
      },
    });

    if (input.configuration) {
      await tx.vehicleConfiguration.create({
        data: {
          vehicleId: vehicle.id,
          ...input.configuration,
          source: input.configuration.source ?? input.source,
        },
      });
    }

    await syncIdentification(tx, vehicle.id);

    logger.info('Vehicle created', { vehicleId: vehicle.id, hasVin: Boolean(vin) });
    return vehicle.id;
  });
}

export async function updateVehicle(
  vehicleId: string,
  ownerId: string,
  input: UpdateVehicleInput,
): Promise<void> {
  const owned = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) throw new VehicleNotFoundError();

  const vin = input.vin ?? null;
  if (vin) {
    const clash = await prisma.vehicle.findFirst({
      where: { ownerId, vin, deletedAt: null, NOT: { id: vehicleId } },
      select: { id: true },
    });
    if (clash) throw new DuplicateVinError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        displayName: input.displayName ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        vin,
        ...(input.isPrimary === true ? { isPrimary: true } : {}),
      },
    });

    if (input.isPrimary === true) {
      await demoteOtherPrimaries(tx, ownerId, vehicleId);
    }

    await syncIdentification(tx, vehicleId);
  });

  logger.info('Vehicle updated', { vehicleId });
}

export async function setVehicleConfiguration(
  vehicleId: string,
  ownerId: string,
  input: Partial<VehicleConfigurationInput>,
): Promise<void> {
  const owned = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) throw new VehicleNotFoundError();

  await prisma.$transaction(async (tx) => {
    const data = { ...input, source: input.source ?? 'USER_ENTERED' };
    await tx.vehicleConfiguration.upsert({
      where: { vehicleId },
      create: { vehicleId, ...data },
      update: data,
    });
    await syncIdentification(tx, vehicleId);
  });

  logger.info('Vehicle configuration updated', { vehicleId });
}

/**
 * Replaces the recorded module list for a vehicle.
 *
 * Discovery reports the whole set each time, so a module absent from the new
 * report is genuinely absent and its stale row must not survive.
 */
export async function replaceVehicleModules(
  vehicleId: string,
  ownerId: string,
  modules: readonly VehicleModuleInput[],
): Promise<void> {
  const owned = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) throw new VehicleNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.vehicleModule.deleteMany({ where: { vehicleId } });
    if (modules.length > 0) {
      await tx.vehicleModule.createMany({
        data: modules.map((module) => ({
          vehicleId,
          name: module.name,
          system: module.system,
          address: module.address ?? null,
          protocol: module.protocol ?? null,
          status: module.status,
          discoveredAt: module.status === 'DETECTED' ? new Date() : null,
        })),
      });
    }
  });

  logger.info('Vehicle modules replaced', { vehicleId, count: modules.length });
}

export async function setPrimaryVehicle(vehicleId: string, ownerId: string): Promise<void> {
  const owned = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) throw new VehicleNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { isPrimary: true },
    });
    await demoteOtherPrimaries(tx, ownerId, vehicleId);
  });

  logger.info('Primary vehicle set', { vehicleId });
}

/**
 * Soft delete. Diagnostic history will hang off vehicles from Stage 15
 * onward, so a removed vehicle is retired rather than erased.
 */
export async function deleteVehicle(vehicleId: string, ownerId: string): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId, deletedAt: null },
    select: { id: true, isPrimary: true },
  });
  if (!vehicle) throw new VehicleNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        deletedAt: new Date(),
        isPrimary: false,
        // Free the VIN so the same vehicle can be re-added later.
        vin: null,
      },
    });

    // Promote the oldest remaining vehicle so an owner with vehicles always
    // has a primary one.
    if (vehicle.isPrimary) {
      const next = await tx.vehicle.findFirst({
        where: { ownerId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (next) {
        await tx.vehicle.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  logger.info('Vehicle deleted', { vehicleId });
}
