import {
  computeHealth,
  type HealthFinding,
  type HealthTrendInput,
  type VehicleHealth,
} from '@/domain/health';
import { prisma } from '@/lib/db/client';

/**
 * Assembles vehicle health from stored history.
 *
 * The scoring itself is pure and lives in the domain; this file only gathers
 * what it needs. Which is the point of the split: the model can be tested
 * against constructed evidence without a database, and the database cannot
 * quietly change what a score means.
 *
 * Findings come from the most recent scan; trends come from every scan. A
 * finding is a statement about one moment and stops being true when the next
 * scan disagrees, whereas a direction across sessions only exists in the
 * history.
 */

/** Parameters worth trending. Only those the health engine has a rule for. */
const TRENDED: readonly { parameterId: string; condition: string }[] = [
  { parameterId: 'CONTROL_MODULE_VOLTAGE', condition: 'IDLE' },
  { parameterId: 'COOLANT_TEMP', condition: 'IDLE' },
  { parameterId: 'LONG_FUEL_TRIM_1', condition: 'IDLE' },
  { parameterId: 'FUEL_PRESSURE', condition: 'IDLE' },
];

export async function getVehicleHealth(
  vehicleId: string,
  ownerId: string,
): Promise<VehicleHealth> {
  const sessions = await prisma.scanSession.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      startedAt: true,
      parameters: { select: { parameterId: true } },
      diagnosis: {
        select: {
          findings: {
            select: {
              findingId: true,
              title: true,
              system: true,
              severity: true,
              supporting: true,
            },
          },
        },
      },
    },
  });

  if (sessions.length === 0) {
    return computeHealth({
      findings: [],
      trends: [],
      parametersObserved: [],
      sessionCount: 0,
      latestSessionAt: null,
    });
  }

  const latest = sessions[0]!;

  const findings: HealthFinding[] = (latest.diagnosis?.findings ?? []).map((finding) => ({
    findingId: finding.findingId,
    title: finding.title,
    system: finding.system,
    severity: finding.severity,
    evidence: firstSummary(finding.supporting),
    observedAt: latest.startedAt,
  }));

  // Every parameter ever recorded for this vehicle: a system is assessable if
  // it was measured at some point, not only in the most recent scan.
  const parametersObserved = [
    ...new Set(sessions.flatMap((s) => s.parameters.map((p) => p.parameterId))),
  ];

  const trends = await loadTrends(vehicleId, ownerId);

  return computeHealth({
    findings,
    trends,
    parametersObserved,
    sessionCount: sessions.length,
    latestSessionAt: latest.startedAt,
  });
}

async function loadTrends(
  vehicleId: string,
  ownerId: string,
): Promise<HealthTrendInput[]> {
  const rows = await prisma.parameterStat.findMany({
    where: {
      session: { vehicleId, vehicle: { ownerId, deletedAt: null } },
      OR: TRENDED.map((t) => ({
        parameterId: t.parameterId,
        condition: t.condition,
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

  const grouped = new Map<string, HealthTrendInput>();

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

/**
 * The first supporting observation from a stored finding.
 *
 * The column is JSON, so its shape is checked rather than asserted — a row
 * written by an older release must not crash the health page.
 */
function firstSummary(supporting: unknown): string | null {
  if (!Array.isArray(supporting) || supporting.length === 0) return null;
  const first = supporting[0] as { summary?: unknown };
  return typeof first?.summary === 'string' ? first.summary : null;
}
