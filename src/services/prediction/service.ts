import {
  detectSignals,
  type ParameterHistory,
  type PredictiveReport,
  type ScanRecord,
} from '@/domain/prediction';
import { prisma } from '@/lib/db/client';

/**
 * Assembling predictive signals from a vehicle's stored scans.
 *
 * The detection is pure and lives in the domain; this only gathers what it
 * needs. Which is the same split the health service uses, and for the same
 * reason: the rules can be tested against constructed histories without a
 * database, and the database cannot quietly change what a signal means.
 */

/** Parameters the engine has a rule for. Trending others would be noise. */
const TRENDED: readonly { parameterId: string; condition: string }[] = [
  { parameterId: 'CONTROL_MODULE_VOLTAGE', condition: 'IDLE' },
  { parameterId: 'COOLANT_TEMP', condition: 'IDLE' },
  { parameterId: 'LONG_FUEL_TRIM_1', condition: 'IDLE' },
  { parameterId: 'FUEL_PRESSURE', condition: 'IDLE' },
];

export async function getPredictiveReport(
  vehicleId: string,
  ownerId: string,
): Promise<PredictiveReport> {
  const sessions = await prisma.scanSession.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      startedAt: true,
      dtcs: { select: { code: true } },
      diagnosis: {
        select: { findings: { select: { severity: true } } },
      },
    },
  });

  const scans: ScanRecord[] = sessions.map((session) => ({
    sessionId: session.id,
    at: session.startedAt,
    dtcCodes: session.dtcs.map((dtc) => dtc.code),
    // INFO findings describe the absence of a condition, so they are not
    // counted — the same rule the repair verification follows.
    conditionCount: (session.diagnosis?.findings ?? []).filter(
      (finding) => finding.severity !== 'INFO',
    ).length,
  }));

  return detectSignals({ scans, parameters: await loadHistories(vehicleId, ownerId) });
}

async function loadHistories(
  vehicleId: string,
  ownerId: string,
): Promise<ParameterHistory[]> {
  const rows = await prisma.parameterStat.findMany({
    where: {
      session: { vehicleId, vehicle: { ownerId, deletedAt: null } },
      OR: TRENDED.map((entry) => ({
        parameterId: entry.parameterId,
        condition: entry.condition,
      })),
    },
    orderBy: { session: { startedAt: 'asc' } },
    select: {
      parameterId: true,
      condition: true,
      mean: true,
      unit: true,
      session: { select: { startedAt: true } },
    },
  });

  const grouped = new Map<string, ParameterHistory>();

  for (const row of rows) {
    const key = `${row.parameterId}|${row.condition}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        parameterId: row.parameterId,
        condition: row.condition,
        unit: row.unit,
        points: [],
      };
      grouped.set(key, entry);
    }
    (entry.points as { at: Date; value: number }[]).push({
      at: row.session.startedAt,
      value: row.mean,
    });
  }

  return [...grouped.values()];
}
