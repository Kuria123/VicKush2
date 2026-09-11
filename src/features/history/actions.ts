'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { logMaintenance } from '@/services/diagnostics/history';
import type { ActionResult } from '@/types';

/**
 * Logging owner-entered maintenance.
 *
 * Server Functions are reachable by direct POST, not only through the UI, so
 * this authenticates for itself. Authorisation is not repeated: the service
 * scopes the write by ownerId, so a request for someone else's vehicle fails
 * there rather than depending on a check here.
 */

export async function logMaintenanceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  const vehicleId = text('vehicleId');
  const title = text('title');
  const performedAt = text('performedAt');
  const odometer = text('odometerKm');

  const errors: Record<string, string> = {};
  if (title.length === 0) errors.title = 'Say what was done.';
  if (title.length > 120) errors.title = 'Keep this under 120 characters.';
  if (performedAt.length === 0) errors.performedAt = 'A date is required.';

  const when = performedAt ? new Date(`${performedAt}T12:00:00`) : null;
  if (when && Number.isNaN(when.getTime())) errors.performedAt = 'That date is not valid.';
  if (when && when.getTime() > Date.now()) {
    errors.performedAt = 'That is in the future.';
  }

  // Blank stays NULL: an unknown odometer is never estimated (Rule 1).
  let odometerKm: number | null = null;
  if (odometer.length > 0) {
    const parsed = Number(odometer);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2_000_000) {
      errors.odometerKm = 'That reading is not plausible.';
    } else {
      odometerKm = Math.round(parsed);
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: errors };
  }

  const result = await logMaintenance({
    vehicleId,
    ownerId: userId,
    performedAt: when!,
    title,
    notes: text('notes') || null,
    odometerKm,
  });

  if (!result.ok) {
    return { ok: false, error: 'That vehicle could not be found.' };
  }

  revalidatePath(`/vehicles/${vehicleId}/history`);
  return { ok: true, data: undefined };
}
