import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db/client';
import {
  DuplicateVinError,
  VehicleNotFoundError,
  createVehicle,
  deleteVehicle,
  replaceVehicleModules,
  setPrimaryVehicle,
  setVehicleConfiguration,
  updateVehicle,
} from './mutations';
import { countVehiclesForOwner, getVehicleForOwner, listVehiclesForOwner } from './queries';

/**
 * Integration tests against the real database.
 *
 * Each test gets two throwaway owners so cross-owner access can be proven to
 * fail, and both are deleted afterwards — the cascade removes their vehicles.
 */

const VALID_VIN = '1M8GDM9AXKP042788';
/** Structurally valid, check digit deliberately wrong: the JDM-import case. */
const MISMATCHED_VIN = '1M8GDM9A0KP042788';

let ownerId: string;
let otherOwnerId: string;
const createdUserIds: string[] = [];

async function createOwner(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `int-${Date.now()}-${Math.random().toString(36).slice(2)}@automind.test`,
      name: 'Integration Owner',
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

beforeEach(async () => {
  ownerId = await createOwner();
  otherOwnerId = await createOwner();
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('createVehicle', () => {
  it('stores a vehicle and derives its identification', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
      configuration: { fuelType: 'PETROL', transmissionType: 'CVT' },
    });

    const loaded = await getVehicleForOwner(id, ownerId);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Toyota Harrier');
    expect(loaded!.spec).toBe('2018 · Petrol · CVT');

    // The snapshot is written, and matches the recomputed assessment.
    expect(loaded!.vehicle.identification?.status).toBe('IDENTIFIED');
    expect(loaded!.vehicle.identification?.confidence).toBe(loaded!.assessment.confidence);
    expect(loaded!.assessment.confidence).toBeGreaterThan(0);
  });

  it('makes the first vehicle primary and leaves later ones secondary', async () => {
    const first = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });
    const second = await createVehicle(ownerId, {
      make: 'Nissan',
      model: 'X-Trail',
      year: 2015,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    const list = await listVehiclesForOwner(ownerId);
    expect(list.find((v) => v.id === first)?.isPrimary).toBe(true);
    expect(list.find((v) => v.id === second)?.isPrimary).toBe(false);
    // Primary sorts first.
    expect(list[0]!.id).toBe(first);
  });

  it('normalises the VIN before storing it', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: VALID_VIN,
      displayName: null,
      source: 'USER_ENTERED',
    });

    const loaded = await getVehicleForOwner(id, ownerId);
    expect(loaded!.vehicle.vin).toBe(VALID_VIN);
    expect(loaded!.vehicle.identification?.vinStructurallyValid).toBe(true);
    expect(loaded!.vehicle.identification?.vinCheckDigitValid).toBe(true);
  });

  it('accepts a VIN whose check digit does not match, and records that', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: MISMATCHED_VIN,
      displayName: null,
      source: 'USER_ENTERED',
    });

    const loaded = await getVehicleForOwner(id, ownerId);
    expect(loaded!.vehicle.identification?.vinStructurallyValid).toBe(true);
    expect(loaded!.vehicle.identification?.vinCheckDigitValid).toBe(false);
    // Recorded honestly, and surfaced as a gap rather than a rejection.
    expect(loaded!.assessment.gaps.some((g) => g.includes('check digit'))).toBe(true);
  });

  it('rejects a duplicate VIN for the same owner', async () => {
    const base = {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: VALID_VIN,
      displayName: null,
      source: 'USER_ENTERED',
    } as const;

    await createVehicle(ownerId, base);
    await expect(createVehicle(ownerId, base)).rejects.toThrow(DuplicateVinError);
  });

  it('allows the same VIN under a different owner, since vehicles change hands', async () => {
    const base = {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: VALID_VIN,
      displayName: null,
      source: 'USER_ENTERED',
    } as const;

    await createVehicle(ownerId, base);
    await expect(createVehicle(otherOwnerId, base)).resolves.toBeTypeOf('string');
  });
});

describe('ownership', () => {
  let vehicleId: string;

  beforeEach(async () => {
    vehicleId = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });
  });

  it('hides another owner’s vehicle', async () => {
    expect(await getVehicleForOwner(vehicleId, otherOwnerId)).toBeNull();
  });

  it('refuses an update from another owner', async () => {
    await expect(
      updateVehicle(vehicleId, otherOwnerId, {
        make: 'Hacked',
        model: null,
        year: null,
        vin: null,
        displayName: null,
      }),
    ).rejects.toThrow(VehicleNotFoundError);

    const untouched = await getVehicleForOwner(vehicleId, ownerId);
    expect(untouched!.vehicle.make).toBe('Toyota');
  });

  it('refuses a delete from another owner', async () => {
    await expect(deleteVehicle(vehicleId, otherOwnerId)).rejects.toThrow(VehicleNotFoundError);
    expect(await countVehiclesForOwner(ownerId)).toBe(1);
  });

  it('refuses a configuration write from another owner', async () => {
    await expect(
      setVehicleConfiguration(vehicleId, otherOwnerId, { fuelType: 'DIESEL' }),
    ).rejects.toThrow(VehicleNotFoundError);
  });

  it('keeps counts separate per owner', async () => {
    expect(await countVehiclesForOwner(ownerId)).toBe(1);
    expect(await countVehiclesForOwner(otherOwnerId)).toBe(0);
  });
});

describe('identification stays in step with the facts', () => {
  it('raises confidence when configuration is added', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    const before = (await getVehicleForOwner(id, ownerId))!;
    expect(before.vehicle.identification?.status).toBe('PARTIALLY_IDENTIFIED');

    await setVehicleConfiguration(id, ownerId, {
      fuelType: 'PETROL',
      transmissionType: 'CVT',
      engineDisplacementCc: 1998,
      source: 'OBD_REPORTED',
    });

    const after = (await getVehicleForOwner(id, ownerId))!;
    expect(after.vehicle.identification!.confidence).toBeGreaterThan(
      before.vehicle.identification!.confidence,
    );
    expect(after.vehicle.identification?.status).toBe('IDENTIFIED');
    // The stored snapshot never drifts from a fresh assessment.
    expect(after.vehicle.identification!.confidence).toBe(after.assessment.confidence);
  });

  it('lowers status when identifying facts are removed', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: VALID_VIN,
      displayName: null,
      source: 'USER_ENTERED',
    });

    await updateVehicle(id, ownerId, {
      make: 'Toyota',
      model: null,
      year: null,
      vin: null,
      displayName: null,
    });

    const after = (await getVehicleForOwner(id, ownerId))!;
    expect(after.vehicle.identification?.status).toBe('PARTIALLY_IDENTIFIED');
    expect(after.vehicle.identification?.vinStructurallyValid).toBeNull();
  });
});

describe('primary vehicle', () => {
  it('demotes the previous primary when another is promoted', async () => {
    const first = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });
    const second = await createVehicle(ownerId, {
      make: 'Nissan',
      model: 'X-Trail',
      year: 2015,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    await setPrimaryVehicle(second, ownerId);

    const list = await listVehiclesForOwner(ownerId);
    expect(list.filter((v) => v.isPrimary)).toHaveLength(1);
    expect(list.find((v) => v.id === second)?.isPrimary).toBe(true);
    expect(list.find((v) => v.id === first)?.isPrimary).toBe(false);
  });
});

describe('deleteVehicle', () => {
  it('soft deletes, hiding the vehicle without erasing the row', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    await deleteVehicle(id, ownerId);

    expect(await getVehicleForOwner(id, ownerId)).toBeNull();
    expect(await countVehiclesForOwner(ownerId)).toBe(0);
    // The row survives, so diagnostic history can still reference it.
    expect(await prisma.vehicle.findUnique({ where: { id } })).not.toBeNull();
  });

  it('frees the VIN so the vehicle can be re-added', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: VALID_VIN,
      displayName: null,
      source: 'USER_ENTERED',
    });
    await deleteVehicle(id, ownerId);

    await expect(
      createVehicle(ownerId, {
        make: 'Toyota',
        model: 'Harrier',
        year: 2018,
        vin: VALID_VIN,
        displayName: null,
        source: 'USER_ENTERED',
      }),
    ).resolves.toBeTypeOf('string');
  });

  it('promotes another vehicle when the primary is deleted', async () => {
    const first = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });
    const second = await createVehicle(ownerId, {
      make: 'Nissan',
      model: 'X-Trail',
      year: 2015,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    await deleteVehicle(first, ownerId);

    const list = await listVehiclesForOwner(ownerId);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(second);
    expect(list[0]!.isPrimary).toBe(true);
  });
});

describe('replaceVehicleModules', () => {
  it('replaces the whole set, dropping modules no longer reported', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    await replaceVehicleModules(id, ownerId, [
      { name: 'Engine Control Module', system: 'ENGINE', address: '7E0', status: 'DETECTED' },
      { name: 'Transmission', system: 'TRANSMISSION', address: '7E1', status: 'DETECTED' },
    ]);

    let loaded = await getVehicleForOwner(id, ownerId);
    expect(loaded!.vehicle.modules).toHaveLength(2);
    expect(loaded!.vehicle.modules[0]!.discoveredAt).not.toBeNull();

    await replaceVehicleModules(id, ownerId, [
      { name: 'Engine Control Module', system: 'ENGINE', address: '7E0', status: 'DETECTED' },
    ]);

    loaded = await getVehicleForOwner(id, ownerId);
    expect(loaded!.vehicle.modules).toHaveLength(1);
  });

  it('records a non-detected module without a discovery time', async () => {
    const id = await createVehicle(ownerId, {
      make: 'Toyota',
      model: 'Harrier',
      year: 2018,
      vin: null,
      displayName: null,
      source: 'USER_ENTERED',
    });

    await replaceVehicleModules(id, ownerId, [
      { name: 'ABS', system: 'ABS', address: '7B0', status: 'NOT_RESPONDING' },
    ]);

    const loaded = await getVehicleForOwner(id, ownerId);
    expect(loaded!.vehicle.modules[0]!.status).toBe('NOT_RESPONDING');
    expect(loaded!.vehicle.modules[0]!.discoveredAt).toBeNull();
  });
});
