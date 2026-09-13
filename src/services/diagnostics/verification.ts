import { verifyRepair, type ScanSnapshot, type VerificationResult } from '@/domain/verification';
import { prisma } from '@/lib/db/client';

/**
 * Recording a repair and verifying it against a later scan.
 *
 * The comparison itself is pure and lives in the domain; this file only loads
 * the two snapshots and writes the conclusion. The conclusion is stored as it
 * was reached and never recomputed on read — the same rule a diagnosis
 * follows, and for the same reason: the thresholds it was judged against may
 * change in a later release, and a stored verdict must keep saying what the
 * owner was actually told.
 */

export interface RecordRepairInput {
  vehicleId: string;
  ownerId: string;
  /** The scan taken before the work. Required: without it nothing can be verified. */
  beforeSessionId: string;
  performedAt: Date;
  summary: string;
  notes?: string | null;
  guideId?: string | null;
  causeId?: string | null;
}

export type RecordRepairResult =
  | { ok: true; repairId: string }
  | { ok: false; reason: 'VEHICLE_NOT_FOUND' | 'BEFORE_SCAN_NOT_FOUND' };

export async function recordRepair(input: RecordRepairInput): Promise<RecordRepairResult> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: input.ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) return { ok: false, reason: 'VEHICLE_NOT_FOUND' };

  // Scoped to this vehicle: a session id from elsewhere is a claim, not a fact.
  const before = await prisma.scanSession.findFirst({
    where: { id: input.beforeSessionId, vehicleId: input.vehicleId },
    select: { id: true },
  });
  if (!before) return { ok: false, reason: 'BEFORE_SCAN_NOT_FOUND' };

  const repairId = await prisma.$transaction(async (tx) => {
    const repair = await tx.repairEvent.create({
      data: {
        vehicleId: input.vehicleId,
        beforeSessionId: input.beforeSessionId,
        performedAt: input.performedAt,
        summary: input.summary,
        notes: input.notes ?? null,
        guideId: input.guideId ?? null,
        causeId: input.causeId ?? null,
      },
      select: { id: true },
    });

    // Written in the same transaction as the record, so the timeline cannot
    // disagree with what it describes.
    await tx.vehicleEvent.create({
      data: {
        vehicleId: input.vehicleId,
        repairId: repair.id,
        kind: 'REPAIR_RECORDED',
        occurredAt: input.performedAt,
        title: input.summary,
        detail:
          input.notes ??
          'Recorded as described by whoever carried out the work. This build does not verify it.',
      },
    });

    return repair.id;
  });

  return { ok: true, repairId };
}

/* -------------------------------------------------------------------------
 * Verification
 * ---------------------------------------------------------------------- */

export type VerifyResult =
  | { ok: true; verification: VerificationResult }
  | { ok: false; reason: 'REPAIR_NOT_FOUND' | 'AFTER_SCAN_NOT_FOUND' | 'SAME_SCAN' };

export interface VerifyInput {
  repairId: string;
  vehicleId: string;
  ownerId: string;
  afterSessionId: string;
}

export async function verifyRepairAgainstScan(input: VerifyInput): Promise<VerifyResult> {
  const repair = await prisma.repairEvent.findFirst({
    where: {
      id: input.repairId,
      vehicleId: input.vehicleId,
      vehicle: { ownerId: input.ownerId, deletedAt: null },
    },
    select: {
      id: true,
      performedAt: true,
      summary: true,
      notes: true,
      guideId: true,
      causeId: true,
      beforeSessionId: true,
    },
  });
  if (!repair) return { ok: false, reason: 'REPAIR_NOT_FOUND' };

  // Comparing a scan with itself would produce a flawless result from nothing.
  if (repair.beforeSessionId === input.afterSessionId) {
    return { ok: false, reason: 'SAME_SCAN' };
  }

  const [before, after] = await Promise.all([
    loadSnapshot(repair.beforeSessionId, input.vehicleId),
    loadSnapshot(input.afterSessionId, input.vehicleId),
  ]);

  if (!before) return { ok: false, reason: 'REPAIR_NOT_FOUND' };
  if (!after) return { ok: false, reason: 'AFTER_SCAN_NOT_FOUND' };

  const verification = verifyRepair({
    before,
    after,
    repair: {
      id: repair.id,
      performedAt: repair.performedAt,
      summary: repair.summary,
      notes: repair.notes,
      guideId: repair.guideId,
      causeId: repair.causeId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.repairEvent.update({
      where: { id: repair.id },
      data: {
        afterSessionId: input.afterSessionId,
        verdict: verification.verdict,
        verifiedAt: new Date(),
        comparison: JSON.parse(JSON.stringify(verification)) as object,
      },
    });

    await tx.vehicleEvent.create({
      data: {
        vehicleId: input.vehicleId,
        repairId: repair.id,
        sessionId: input.afterSessionId,
        kind: 'VERIFICATION_COMPLETED',
        occurredAt: after.at,
        title: VERDICT_TITLE[verification.verdict],
        detail: verification.summary.slice(0, 1000),
      },
    });
  });

  return { ok: true, verification };
}

const VERDICT_TITLE: Record<VerificationResult['verdict'], string> = {
  CONSISTENT_WITH_REPAIR: 'Verification: readings consistent with the repair',
  NOT_DEMONSTRATED: 'Verification: no change demonstrated',
  WORSENED: 'Verification: something is worse than before',
  INCONCLUSIVE: 'Verification: the scans could not be compared',
};

/**
 * Loads one side of the comparison.
 *
 * Findings come from the stored diagnosis rather than being recomputed, so the
 * comparison is between what the engine actually concluded at each time.
 */
async function loadSnapshot(
  sessionId: string,
  vehicleId: string,
): Promise<ScanSnapshot | null> {
  const session = await prisma.scanSession.findFirst({
    where: { id: sessionId, vehicleId },
    select: {
      id: true,
      startedAt: true,
      isSimulated: true,
      conditionsObserved: true,
      dtcs: { select: { code: true } },
      parameters: {
        select: {
          parameterId: true,
          condition: true,
          mean: true,
          samples: true,
          unit: true,
        },
      },
      diagnosis: {
        select: {
          findings: {
            select: { findingId: true, title: true, system: true, severity: true },
          },
        },
      },
    },
  });

  if (!session) return null;

  return {
    sessionId: session.id,
    at: session.startedAt,
    isSimulated: session.isSimulated,
    conditionsObserved: asStringArray(session.conditionsObserved),
    parameters: session.parameters,
    dtcCodes: session.dtcs.map((dtc) => dtc.code),
    findings: session.diagnosis?.findings ?? [],
    // Health is a property of the whole vehicle's history rather than one
    // scan, so it is not carried here. The health page remains its home.
    healthScore: null,
  };
}

/** The column is JSON; a row written by an older release must not crash. */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/* -------------------------------------------------------------------------
 * Reading back
 * ---------------------------------------------------------------------- */

export async function listRepairs(vehicleId: string, ownerId: string) {
  return prisma.repairEvent.findMany({
    where: { vehicleId, vehicle: { ownerId, deletedAt: null } },
    orderBy: { performedAt: 'desc' },
    select: {
      id: true,
      performedAt: true,
      summary: true,
      notes: true,
      verdict: true,
      verifiedAt: true,
      beforeSessionId: true,
      afterSessionId: true,
      comparison: true,
    },
  });
}
