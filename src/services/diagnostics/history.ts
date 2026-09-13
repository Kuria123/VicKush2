import { prisma } from '@/lib/db/client';

/**
 * Reading a vehicle's memory.
 *
 * Ownership is part of every query rather than checked afterwards, so a
 * caller cannot forget it — the same rule the vehicle service follows.
 */

export interface TimelineEntry {
  id: string;
  kind:
    | 'SCAN_RECORDED'
    | 'DTC_OBSERVED'
    | 'FINDING_RAISED'
    | 'DIAGNOSIS_REACHED'
    | 'TEST_PERFORMED'
    | 'MAINTENANCE_LOGGED'
    | 'REPAIR_RECORDED'
    | 'VERIFICATION_COMPLETED';
  occurredAt: Date;
  title: string;
  detail: string | null;
  severity: 'INFO' | 'ADVISORY' | 'SIGNIFICANT' | 'SEVERE' | null;
  system: string | null;
  sessionId: string | null;
}

/** Newest first. The timeline reverses it per group when rendering. */
export async function listTimeline(
  vehicleId: string,
  ownerId: string,
  limit = 200,
): Promise<TimelineEntry[]> {
  const events = await prisma.vehicleEvent.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      kind: true,
      occurredAt: true,
      title: true,
      detail: true,
      severity: true,
      system: true,
      sessionId: true,
    },
  });

  return events.map((event) => ({
    ...event,
    system: event.system ?? null,
  }));
}

export interface SessionSummaryRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  sampleCount: number;
  durationMs: number;
  isSimulated: boolean;
  providerName: string;
  verdict: 'SINGLE_LEADING' | 'AMBIGUOUS' | 'INSUFFICIENT' | null;
  findingCount: number;
  dtcCount: number;
}

export async function listSessions(
  vehicleId: string,
  ownerId: string,
  limit = 50,
): Promise<SessionSummaryRow[]> {
  const sessions = await prisma.scanSession.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      sampleCount: true,
      durationMs: true,
      isSimulated: true,
      providerName: true,
      _count: { select: { dtcs: true } },
      diagnosis: {
        select: { verdict: true, _count: { select: { findings: true } } },
      },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    sampleCount: session.sampleCount,
    durationMs: session.durationMs,
    isSimulated: session.isSimulated,
    providerName: session.providerName,
    verdict: session.diagnosis?.verdict ?? null,
    findingCount: session.diagnosis?._count.findings ?? 0,
    dtcCount: session._count.dtcs,
  }));
}

/**
 * One parameter's mean under one condition, across sessions, oldest first.
 *
 * This is the shape a trend needs — "battery voltage has declined across three
 * sessions" — and is what Stage 21 will read. Returned raw: deciding whether a
 * sequence constitutes a decline is not this function's job.
 */
export async function parameterTrend(
  vehicleId: string,
  ownerId: string,
  parameterId: string,
  condition: string,
): Promise<{ at: Date; mean: number; samples: number; unit: string | null }[]> {
  const stats = await prisma.parameterStat.findMany({
    where: {
      parameterId,
      condition,
      session: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    },
    orderBy: { session: { startedAt: 'asc' } },
    select: {
      mean: true,
      samples: true,
      unit: true,
      session: { select: { startedAt: true } },
    },
  });

  return stats.map((stat) => ({
    at: stat.session.startedAt,
    mean: stat.mean,
    samples: stat.samples,
    unit: stat.unit,
  }));
}

/* -------------------------------------------------------------------------
 * Maintenance
 * ---------------------------------------------------------------------- */

export interface MaintenanceInput {
  vehicleId: string;
  ownerId: string;
  performedAt: Date;
  title: string;
  notes?: string | null;
  /** NULL means not known. Never estimated (Rule 1). */
  odometerKm?: number | null;
}

export type MaintenanceResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'NOT_FOUND' };

export async function logMaintenance(input: MaintenanceInput): Promise<MaintenanceResult> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: input.ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) return { ok: false, reason: 'NOT_FOUND' };

  const id = await prisma.$transaction(async (tx) => {
    const record = await tx.maintenanceRecord.create({
      data: {
        vehicleId: input.vehicleId,
        performedAt: input.performedAt,
        title: input.title,
        notes: input.notes ?? null,
        odometerKm: input.odometerKm ?? null,
      },
      select: { id: true },
    });

    // Written in the same transaction as the record, so the timeline cannot
    // disagree with what it describes.
    await tx.vehicleEvent.create({
      data: {
        vehicleId: input.vehicleId,
        maintenanceId: record.id,
        kind: 'MAINTENANCE_LOGGED',
        occurredAt: input.performedAt,
        title: input.title,
        detail: input.notes ?? null,
      },
    });

    return record.id;
  });

  return { ok: true, id };
}

export async function listMaintenance(vehicleId: string, ownerId: string) {
  return prisma.maintenanceRecord.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: { performedAt: 'desc' },
    select: {
      id: true,
      performedAt: true,
      title: true,
      notes: true,
      odometerKm: true,
    },
  });
}
