import type { CauseStatus, DifferentialVerdict, RankedCause } from '@/domain/differential';
import {
  buildReferralReport,
  formatReferralReport,
  type ReferralInput,
  type ReferralReport,
} from '@/domain/referral';
import { prisma } from '@/lib/db/client';
import { getVehicleForOwner } from '@/services/vehicle/queries';

/**
 * Assembles a referral report from stored history.
 *
 * The report itself is built in the domain; this file only gathers. Which
 * matters more here than anywhere else in the project: this is the one output
 * that leaves the application and is read by somebody who was not present for
 * any of it, so the rules that keep it honest have to be testable without a
 * database, and the database must not be able to change what it says.
 *
 * It reads the most recent saved scan. Not a merge of several — a scan is a
 * set of readings taken together under stated conditions, and combining two
 * would produce a picture of a vehicle that never existed at any one moment.
 * Repairs are the exception, because their whole value to the mechanic is the
 * sequence: what was tried, in what order, and what the readings did after.
 */

export type ReferralResult =
  | { ok: true; report: ReferralReport; text: string }
  | { ok: false; reason: 'VEHICLE_NOT_FOUND' };

export interface ReferralOptions {
  vehicleId: string;
  ownerId: string;
  /** The owner's own words. Never supplied by this build. */
  concern?: string | null;
  now?: Date;
}

export async function buildReferralForVehicle(
  options: ReferralOptions,
): Promise<ReferralResult> {
  const vehicle = await getVehicleForOwner(options.vehicleId, options.ownerId);
  if (!vehicle) return { ok: false, reason: 'VEHICLE_NOT_FOUND' };

  const [session, repairs] = await Promise.all([
    prisma.scanSession.findFirst({
      where: { vehicleId: options.vehicleId, diagnosis: { isNot: null } },
      orderBy: { startedAt: 'desc' },
      select: {
        startedAt: true,
        providerName: true,
        isSimulated: true,
        conditionsObserved: true,
        dtcs: { select: { code: true, status: true }, orderBy: { code: 'asc' } },
        diagnosis: {
          select: {
            verdict: true,
            limitations: true,
            findings: {
              select: { title: true, severity: true, supporting: true },
            },
            causes: {
              select: {
                causeId: true,
                label: true,
                mechanism: true,
                status: true,
                confidence: true,
                keyObservationMade: true,
              },
              orderBy: { confidence: 'desc' },
            },
            tests: { select: { testId: true } },
          },
        },
      },
    }),
    prisma.repairEvent.findMany({
      where: { vehicleId: options.vehicleId },
      orderBy: { performedAt: 'desc' },
      take: 10,
      select: { performedAt: true, summary: true, verdict: true },
    }),
  ]);

  const diagnosis = session?.diagnosis ?? null;

  const input: ReferralInput = {
    preparedAt: options.now ?? new Date(),
    vehicle: {
      name: vehicle.name,
      spec: vehicle.spec,
      vin: vehicle.vehicle.vin,
    },
    concern: options.concern ?? null,
    scan: session
      ? {
          at: session.startedAt,
          providerName: session.providerName,
          isSimulated: session.isSimulated,
          conditionsObserved: stringList(session.conditionsObserved),
        }
      : null,
    verdict: (diagnosis?.verdict as DifferentialVerdict | undefined) ?? null,
    findings: (diagnosis?.findings ?? []).map((finding) => ({
      title: finding.title,
      severity: finding.severity,
      supporting: evidenceSummaries(finding.supporting),
    })),
    causes: (diagnosis?.causes ?? []).map(toRankedCause),
    codes: (session?.dtcs ?? []).map((dtc) => ({ code: dtc.code, status: dtc.status })),
    testsPerformed: (diagnosis?.tests ?? []).map((run) => run.testId),
    repairs: repairs.map((repair) => ({
      performedAt: repair.performedAt,
      summary: repair.summary,
      verdict: repair.verdict,
    })),
    diagnosisLimitations: stringList(diagnosis?.limitations),
  };

  const report = buildReferralReport(input);
  return { ok: true, report, text: formatReferralReport(report) };
}

/* -------------------------------------------------------------------------
 * Reading back stored JSON
 *
 * Everything below treats the stored blobs as untrusted shapes. They were
 * written by this application, but a column that has survived a schema change
 * is not the same thing as one that matches today's type, and a report that
 * throws on an old row is a report that cannot be produced for exactly the
 * vehicles with the longest history.
 * ---------------------------------------------------------------------- */

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** The one-line summary of each supporting observation, with its numbers. */
function evidenceSummaries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as { summary?: unknown; detail?: unknown };
    if (typeof record.summary !== 'string') return [];

    return [
      typeof record.detail === 'string' && record.detail.length > 0
        ? `${record.summary} ${record.detail}`
        : record.summary,
    ];
  });
}

/**
 * The stored columns the report actually reads, as a `RankedCause`.
 *
 * The unread fields are empty rather than invented: contributions and
 * exclusions are not carried into a referral, because a mechanic needs the
 * conclusion and the measurement behind it, not the scoring arithmetic that
 * produced the ordering.
 */
function toRankedCause(row: {
  causeId: string;
  label: string;
  mechanism: string;
  status: string;
  confidence: number;
  keyObservationMade: boolean;
}): RankedCause {
  return {
    id: row.causeId,
    label: row.label,
    system: 'UNKNOWN',
    mechanism: row.mechanism,
    status: row.status as CauseStatus,
    confidence: row.confidence,
    points: { earned: 0, available: 0 },
    contributions: [],
    exclusions: [],
    unmet: [],
    keyObservationMade: row.keyObservationMade,
  };
}
