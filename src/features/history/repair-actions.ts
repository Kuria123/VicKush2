'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { recordRepair, verifyRepairAgainstScan } from '@/services/diagnostics/verification';
import type { ActionResult } from '@/types';

/**
 * Recording a repair, and verifying it against a later scan.
 *
 * Server Functions are reachable by direct POST, so each authenticates for
 * itself. Authorisation is not repeated: the service scopes every write by
 * ownerId, so a request for someone else's vehicle fails there.
 */

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function recordRepairAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const vehicleId = text(formData, 'vehicleId');
  const summary = text(formData, 'summary');
  const beforeSessionId = text(formData, 'beforeSessionId');
  const performedAt = text(formData, 'performedAt');

  const fieldErrors: Record<string, string> = {};
  if (summary.length === 0) fieldErrors.summary = 'Say what was done.';
  if (summary.length > 160) fieldErrors.summary = 'Keep this under 160 characters.';
  if (beforeSessionId.length === 0) {
    // Without a before scan there is nothing to verify against, and a repair
    // that cannot be verified should not be recorded as though it could.
    fieldErrors.beforeSessionId = 'Choose the scan taken before the work.';
  }
  if (performedAt.length === 0) fieldErrors.performedAt = 'A date is required.';

  const when = performedAt ? new Date(`${performedAt}T12:00:00`) : null;
  if (when && Number.isNaN(when.getTime())) fieldErrors.performedAt = 'That date is not valid.';
  if (when && when.getTime() > Date.now()) fieldErrors.performedAt = 'That is in the future.';

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors };
  }

  const result = await recordRepair({
    vehicleId,
    ownerId: userId,
    beforeSessionId,
    performedAt: when!,
    summary,
    notes: text(formData, 'notes') || null,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === 'BEFORE_SCAN_NOT_FOUND'
          ? 'That scan does not belong to this vehicle.'
          : 'That vehicle could not be found.',
    };
  }

  revalidatePath(`/vehicles/${vehicleId}/history`);
  return { ok: true, data: undefined };
}

export async function verifyRepairAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const vehicleId = text(formData, 'vehicleId');
  const repairId = text(formData, 'repairId');
  const afterSessionId = text(formData, 'afterSessionId');

  if (afterSessionId.length === 0) {
    return {
      ok: false,
      error: 'Choose the scan taken after the work.',
      fieldErrors: { afterSessionId: 'Required.' },
    };
  }

  const result = await verifyRepairAgainstScan({
    repairId,
    vehicleId,
    ownerId: userId,
    afterSessionId,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === 'SAME_SCAN'
          ? 'That is the same scan the repair was recorded against. Comparing a scan with itself would produce a flawless result from nothing.'
          : result.reason === 'AFTER_SCAN_NOT_FOUND'
            ? 'That scan does not belong to this vehicle.'
            : 'That repair could not be found.',
    };
  }

  revalidatePath(`/vehicles/${vehicleId}/history`);
  return { ok: true, data: undefined };
}
