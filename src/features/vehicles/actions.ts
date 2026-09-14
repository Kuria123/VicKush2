'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { logger } from '@/lib/logging/logger';
import { fieldErrors } from '@/lib/validation/schemas';
import { vehicleFormSchema } from '@/lib/validation/vehicle';
import {
  DuplicateVinError,
  VehicleNotFoundError,
  createVehicle,
  deleteVehicle,
  setPrimaryVehicle,
  updateVehicle,
} from '@/services/vehicle/mutations';
import type { ActionResult } from '@/types';

/**
 * Server actions for vehicle management.
 *
 * Server Functions are reachable by direct POST, not only through the UI, so
 * every action authenticates for itself. Authorisation is not repeated here:
 * the service layer scopes every query by ownerId, so a request for someone
 * else's vehicle fails there rather than depending on a check in this file.
 */

async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  return userId;
}

function readForm(formData: FormData) {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };

  return {
    displayName: text('displayName'),
    make: text('make'),
    model: text('model'),
    year: text('year'),
    vin: text('vin'),
    engineDisplacementCc: text('engineDisplacementCc'),
    fuelType: text('fuelType'),
    transmissionType: text('transmissionType'),
  };
}

export async function createVehicleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = vehicleFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const { engineDisplacementCc, fuelType, transmissionType, ...identity } = parsed.data;

  /*
   * Where these values came from.
   *
   * A photograph-derived identity the owner accepted is not the same evidence
   * as one they recalled and typed, and the confidence model already knows the
   * difference (SOURCE_TRUST). Recording both as USER_ENTERED would make a
   * confirmation worth as much as knowledge.
   */
  const source = formData.get('fromRecognition') === '1' ? 'IMAGE_RECOGNISED' : 'USER_ENTERED';

  let vehicleId: string;
  try {
    vehicleId = await createVehicle(userId, {
      ...identity,
      source,
      configuration:
        engineDisplacementCc || fuelType || transmissionType
          ? {
              engineDisplacementCc,
              fuelType,
              transmissionType,
              source,
            }
          : undefined,
    });
  } catch (error) {
    if (error instanceof DuplicateVinError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: { vin: error.message },
      };
    }
    logger.error('Vehicle creation failed', { error: String(error) });
    return { ok: false, error: 'Could not save the vehicle. Please try again.' };
  }

  revalidatePath('/vehicles');
  revalidatePath('/dashboard');
  // Throws a redirect; must not be caught above.
  redirect(`/vehicles/${vehicleId}`);
}

export async function updateVehicleAction(
  vehicleId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = vehicleFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const {
    engineDisplacementCc: _cc,
    fuelType: _f,
    transmissionType: _t,
    ...identity
  } = parsed.data;

  try {
    await updateVehicle(vehicleId, userId, identity);
  } catch (error) {
    if (error instanceof DuplicateVinError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: { vin: error.message },
      };
    }
    if (error instanceof VehicleNotFoundError) {
      return { ok: false, error: 'That vehicle no longer exists.' };
    }
    logger.error('Vehicle update failed', { error: String(error) });
    return { ok: false, error: 'Could not save the vehicle. Please try again.' };
  }

  revalidatePath('/vehicles');
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(`/vehicles/${vehicleId}`);
}

export async function deleteVehicleAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const vehicleId = String(formData.get('vehicleId') ?? '');

  try {
    await deleteVehicle(vehicleId, userId);
  } catch (error) {
    unstable_rethrow(error);
    // A delete of something already gone, or not the caller's, is not worth
    // an error page: the end state the user wanted is the state they get.
    logger.warn('Vehicle delete failed', { error: String(error) });
  }

  revalidatePath('/vehicles');
  revalidatePath('/dashboard');
  redirect('/vehicles');
}

export async function setPrimaryVehicleAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const vehicleId = String(formData.get('vehicleId') ?? '');

  try {
    await setPrimaryVehicle(vehicleId, userId);
  } catch (error) {
    unstable_rethrow(error);
    logger.warn('Set primary failed', { error: String(error) });
  }

  revalidatePath('/vehicles');
  revalidatePath(`/vehicles/${vehicleId}`);
}
