import type { ConfirmedDifferential, TestResult } from '@/domain/confirmation';
import type { DiagnosticAnalysis, Finding } from '@/domain/diagnostics';
import type { RankedCause } from '@/domain/differential';
import { prisma } from '@/lib/db/client';

/**
 * Turns a finished diagnosis into vehicle history.
 *
 * Everything is written in one transaction, including the timeline events.
 * That is the point of doing it here rather than letting callers assemble it:
 * a session whose events were written separately could end up with a scan
 * recorded and no finding beside it, and a timeline that disagrees with the
 * records it describes is worse than no timeline.
 *
 * Nothing is recomputed on read. The engine is deterministic, so re-running it
 * would usually give the same answer — but only against the same catalogue.
 * When a cause is added in a later release, a stored diagnosis must still say
 * what the user was actually told at the time.
 */

export interface SaveSessionInput {
  vehicleId: string;
  ownerId: string;
  analysis: DiagnosticAnalysis;
  differential: ConfirmedDifferential;
  results: readonly TestResult[];
  providerName: string;
  isSimulated: boolean;
  scenario?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  durationMs: number;
  /** parameterId → condition → summary, from the session's own tracks. */
  parameterStats?: readonly PersistedParameterStat[];
  dtcs?: readonly PersistedDtc[];
}

export interface PersistedParameterStat {
  parameterId: string;
  condition: string;
  samples: number;
  mean: number;
  min: number;
  max: number;
  unit?: string | null;
}

export interface PersistedDtc {
  code: string;
  status: 'STORED' | 'PENDING' | 'PERMANENT';
  moduleAddress?: string | null;
  firstSeenAt: Date;
}

export type SaveSessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'EMPTY_SESSION' };

export async function saveDiagnosticSession(
  input: SaveSessionInput,
): Promise<SaveSessionResult> {
  // Ownership is checked in the query, not after it, so a caller cannot
  // forget — the same rule the rest of the vehicle service follows.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, ownerId: input.ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) return { ok: false, reason: 'NOT_FOUND' };

  // A session with no samples has nothing to remember, and storing it would
  // put an empty scan on the timeline as though something had been checked.
  if (input.analysis.sampleCount === 0) {
    return { ok: false, reason: 'EMPTY_SESSION' };
  }

  const startedAt = input.startedAt;
  const endedAt = input.endedAt ?? new Date(startedAt.getTime() + input.durationMs);

  const sessionId = await prisma.$transaction(async (tx) => {
    const session = await tx.scanSession.create({
      data: {
        vehicleId: input.vehicleId,
        providerName: input.providerName,
        isSimulated: input.isSimulated,
        scenario: input.scenario ?? null,
        startedAt,
        endedAt,
        sampleCount: input.analysis.sampleCount,
        durationMs: input.durationMs,
        conditionsObserved: [...input.analysis.conditionsObserved],
      },
      select: { id: true },
    });

    if (input.dtcs && input.dtcs.length > 0) {
      await tx.sessionDtc.createMany({
        data: input.dtcs.map((dtc) => ({
          sessionId: session.id,
          code: dtc.code,
          status: dtc.status,
          moduleAddress: dtc.moduleAddress ?? null,
          firstSeenAt: dtc.firstSeenAt,
        })),
        skipDuplicates: true,
      });
    }

    if (input.parameterStats && input.parameterStats.length > 0) {
      await tx.parameterStat.createMany({
        data: input.parameterStats.map((stat) => ({
          sessionId: session.id,
          parameterId: stat.parameterId,
          condition: stat.condition,
          samples: stat.samples,
          mean: stat.mean,
          min: stat.min,
          max: stat.max,
          unit: stat.unit ?? null,
        })),
        skipDuplicates: true,
      });
    }

    const diagnosis = await tx.diagnosis.create({
      data: {
        sessionId: session.id,
        verdict: input.differential.verdict,
        limitations: [...input.differential.limitations],
      },
      select: { id: true },
    });

    /*
     * One statement per table rather than one per row.
     *
     * A diagnosis carries a dozen findings and as many causes, and issuing a
     * round trip for each turned a single save into forty of them inside a
     * transaction — which holds locks for the whole duration. `createMany`
     * makes it one statement per table.
     */
    if (input.analysis.findings.length > 0) {
      await tx.diagnosisFinding.createMany({
        data: input.analysis.findings.map((finding) => ({
          diagnosisId: diagnosis.id,
          findingId: finding.id,
          title: finding.title,
          system: finding.system,
          severity: finding.severity,
          supporting: serialiseEvidence(finding.supporting),
          opposing: serialiseEvidence(finding.opposing),
        })),
      });
    }

    const allCauses = [...input.differential.causes, ...input.differential.ruledOut];
    if (allCauses.length > 0) {
      await tx.diagnosisCause.createMany({
        data: allCauses.map((cause) => ({
          diagnosisId: diagnosis.id,
          causeId: cause.id,
          label: cause.label,
          system: cause.system,
          mechanism: cause.mechanism,
          status: cause.status,
          confidence: cause.confidence,
          pointsEarned: cause.points.earned,
          pointsAvailable: cause.points.available,
          keyObservationMade: cause.keyObservationMade,
          contributions: serialiseContributions(cause.contributions),
          exclusions: serialiseContributions(cause.exclusions),
        })),
      });
    }

    if (input.results.length > 0) {
      await tx.confirmationTestRun.createMany({
        data: input.results.map((result) => ({
          diagnosisId: diagnosis.id,
          testId: result.testId,
          outcome: result.outcome,
          note: result.note?.slice(0, 500) ?? null,
        })),
      });
    }

    await tx.vehicleEvent.createMany({
      data: buildEvents({
        vehicleId: input.vehicleId,
        sessionId: session.id,
        occurredAt: endedAt,
        analysis: input.analysis,
        differential: input.differential,
        results: input.results,
        dtcs: input.dtcs ?? [],
      }),
    });

    return session.id;
  });

  return { ok: true, sessionId };
}

/* -------------------------------------------------------------------------
 * Events
 * ---------------------------------------------------------------------- */

interface EventInput {
  vehicleId: string;
  sessionId: string;
  occurredAt: Date;
  analysis: DiagnosticAnalysis;
  differential: ConfirmedDifferential;
  results: readonly TestResult[];
  dtcs: readonly PersistedDtc[];
}

/**
 * The timeline rows for one scan.
 *
 * A code is dated when it was first seen, not when the scan ended, so a code
 * that appeared early in a long session lands where it belongs.
 */
function buildEvents(input: EventInput) {
  const events: {
    vehicleId: string;
    sessionId: string;
    kind:
      | 'SCAN_RECORDED'
      | 'DTC_OBSERVED'
      | 'FINDING_RAISED'
      | 'DIAGNOSIS_REACHED'
      | 'TEST_PERFORMED';
    occurredAt: Date;
    title: string;
    detail: string | null;
    severity: Finding['severity'] | null;
    system: Finding['system'] | null;
  }[] = [];

  const base = { vehicleId: input.vehicleId, sessionId: input.sessionId };

  events.push({
    ...base,
    kind: 'SCAN_RECORDED',
    occurredAt: input.occurredAt,
    title: 'Scan recorded',
    detail: `${input.analysis.sampleCount.toLocaleString()} samples across ${input.analysis.conditionsObserved.length} operating condition${input.analysis.conditionsObserved.length === 1 ? '' : 's'}.`,
    severity: null,
    system: null,
  });

  for (const dtc of input.dtcs) {
    events.push({
      ...base,
      kind: 'DTC_OBSERVED',
      occurredAt: dtc.firstSeenAt,
      title: `${dtc.code} observed`,
      // No meaning: this build has no authoritative table (Rule 1).
      detail: `Reported as ${dtc.status.toLowerCase()}. What the code means is not interpreted.`,
      severity: null,
      system: null,
    });
  }

  for (const finding of input.analysis.findings) {
    events.push({
      ...base,
      kind: 'FINDING_RAISED',
      occurredAt: input.occurredAt,
      title: finding.title,
      detail: finding.supporting[0]?.summary ?? null,
      severity: finding.severity,
      system: finding.system,
    });
  }

  const leader = input.differential.causes.find((c) => c.status === 'SUPPORTED');
  events.push({
    ...base,
    kind: 'DIAGNOSIS_REACHED',
    occurredAt: input.occurredAt,
    title: describeVerdict(input.differential.verdict, leader),
    detail:
      input.differential.verdict === 'AMBIGUOUS'
        ? 'More than one mechanism fits the evidence equally well.'
        : (leader?.mechanism.slice(0, 1000) ?? null),
    severity: null,
    system: leader?.system ?? null,
  });

  for (const result of input.results) {
    events.push({
      ...base,
      kind: 'TEST_PERFORMED',
      occurredAt: input.occurredAt,
      title: `Test recorded: ${result.testId}`,
      detail: result.note ?? `Outcome: ${result.outcome}.`,
      severity: null,
      system: null,
    });
  }

  return events;
}

function describeVerdict(
  verdict: ConfirmedDifferential['verdict'],
  leader: RankedCause | undefined,
): string {
  if (verdict === 'SINGLE_LEADING' && leader) {
    return `Best fit: ${leader.label}`;
  }
  if (verdict === 'AMBIGUOUS') return 'Causes not separated by the evidence';
  return 'No cause could be named';
}

/* -------------------------------------------------------------------------
 * Serialisation
 * ---------------------------------------------------------------------- */

function serialiseEvidence(items: Finding['supporting']) {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    summary: item.summary,
    detail: item.detail,
    strength: item.strength,
    condition: item.condition,
    parameters: [...item.parameters],
    measured: item.measured.map((m) => ({ ...m })),
  }));
}

function serialiseContributions(items: RankedCause['contributions']) {
  return items.map((item) => ({
    evidenceId: item.evidenceId,
    observation: item.observation,
    points: item.points,
    reason: item.reason,
  }));
}
