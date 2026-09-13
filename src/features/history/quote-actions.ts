'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { recordQuote } from '@/services/cost/quotes';
import type { ActionResult } from '@/types';

/**
 * Recording a quote the owner was given.
 *
 * The amount arrives as a decimal string typed by a person and is converted to
 * integer minor units here, once, by string manipulation rather than by
 * multiplying a float. `parseFloat('8.10') * 100` is 809.9999999999999, and
 * rounding that is how a quote silently becomes a cent short.
 */

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Returns minor units, or null when the input is not a plain amount. */
export async function parseAmountToMinor(input: string): Promise<number | null> {
  const cleaned = input.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [major, minor = ''] = cleaned.split('.');
  return Number(major) * 100 + Number(minor.padEnd(2, '0'));
}

export async function recordQuoteAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const vehicleId = text(formData, 'vehicleId');
  const providedBy = text(formData, 'providedBy');
  const description = text(formData, 'description');
  const amount = text(formData, 'amount');
  const currency = text(formData, 'currency').toUpperCase();
  const receivedAt = text(formData, 'receivedAt');

  const fieldErrors: Record<string, string> = {};
  if (providedBy.length === 0) fieldErrors.providedBy = 'Say who quoted it.';
  if (description.length === 0) {
    // Two quotes are only comparable if it is clear what each covers, and only
    // the person who received them knows that.
    fieldErrors.description = 'Say what the quote covers.';
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    fieldErrors.currency = 'Use a three-letter currency code, e.g. KES or GBP.';
  }

  const totalMinor = await parseAmountToMinor(amount);
  if (totalMinor === null) fieldErrors.amount = 'Enter an amount, e.g. 8500 or 8500.50.';

  const when = receivedAt ? new Date(`${receivedAt}T12:00:00`) : null;
  if (!when || Number.isNaN(when.getTime())) fieldErrors.receivedAt = 'A date is required.';
  else if (when.getTime() > Date.now()) fieldErrors.receivedAt = 'That is in the future.';

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors };
  }

  const source = text(formData, 'source');
  const result = await recordQuote({
    vehicleId,
    ownerId: userId,
    source: source === 'OWNER' || source === 'SUPPLIER' ? source : 'MECHANIC',
    providedBy,
    description,
    totalMinor: totalMinor!,
    currency,
    receivedAt: when!,
    notes: text(formData, 'notes') || null,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === 'INVALID_AMOUNT'
          ? 'That amount could not be read.'
          : 'That vehicle could not be found.',
    };
  }

  revalidatePath(`/vehicles/${vehicleId}/history`);
  return { ok: true, data: undefined };
}
