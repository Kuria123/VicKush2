import { compareQuotes, type Quote, type QuoteComparison } from '@/domain/cost';
import { prisma } from '@/lib/db/client';

/**
 * Recording and comparing what the owner was quoted.
 *
 * The comparison is pure and lives in the domain; this only loads and stores.
 * Money crosses the boundary as integer minor units in both directions, and is
 * never converted to a float on the way — the point of storing it that way is
 * lost if it is widened en route.
 */

export interface RecordQuoteInput {
  vehicleId: string;
  ownerId: string;
  source: 'MECHANIC' | 'OWNER' | 'SUPPLIER';
  providedBy: string;
  description: string;
  totalMinor: number;
  currency: string;
  partsMinor?: number | null;
  labourMinor?: number | null;
  receivedAt: Date;
  notes?: string | null;
}

export type RecordQuoteResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'NOT_FOUND' | 'INVALID_AMOUNT' };

export async function recordQuote(input: RecordQuoteInput): Promise<RecordQuoteResult> {
  // Rule 3: a non-integer here means float arithmetic happened upstream, and
  // rounding it away would hide the bug rather than fix it.
  if (!Number.isInteger(input.totalMinor) || input.totalMinor < 0) {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: input.ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) return { ok: false, reason: 'NOT_FOUND' };

  const quote = await prisma.repairQuote.create({
    data: {
      vehicleId: input.vehicleId,
      source: input.source,
      providedBy: input.providedBy,
      description: input.description,
      totalMinor: input.totalMinor,
      currency: input.currency.toUpperCase(),
      partsMinor: input.partsMinor ?? null,
      labourMinor: input.labourMinor ?? null,
      receivedAt: input.receivedAt,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });

  return { ok: true, id: quote.id };
}

export async function listQuotes(vehicleId: string, ownerId: string): Promise<Quote[]> {
  const rows = await prisma.repairQuote.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: { receivedAt: 'desc' },
  });

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    providedBy: row.providedBy,
    description: row.description,
    total: { amountMinor: row.totalMinor, currency: row.currency },
    partsPortion:
      row.partsMinor === null ? null : { amountMinor: row.partsMinor, currency: row.currency },
    labourPortion:
      row.labourMinor === null ? null : { amountMinor: row.labourMinor, currency: row.currency },
    receivedAt: row.receivedAt,
    notes: row.notes,
  }));
}

export async function getQuoteComparison(
  vehicleId: string,
  ownerId: string,
): Promise<QuoteComparison> {
  return compareQuotes(await listQuotes(vehicleId, ownerId));
}

export async function deleteQuote(
  id: string,
  vehicleId: string,
  ownerId: string,
): Promise<boolean> {
  // Scoped in the query: an id arriving from a client is a claim, not a fact.
  const result = await prisma.repairQuote.deleteMany({
    where: { id, vehicleId, vehicle: { ownerId, deletedAt: null } },
  });
  return result.count > 0;
}
