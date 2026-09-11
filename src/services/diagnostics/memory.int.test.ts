import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { applyTestResults } from '@/domain/confirmation';
import {
  analyseSession,
  DiagnosticSession,
  summariseForStorage,
} from '@/domain/diagnostics';
import { differentiate } from '@/domain/differential';
import { VehicleSimulator, type ScenarioId } from '@/domain/simulation';
import { getParameter, type SensorReading } from '@/domain/telemetry';
import { prisma } from '@/lib/db/client';
import { getVehicleHealth } from '@/services/health/service';

import { listMaintenance, listSessions, listTimeline, logMaintenance, parameterTrend } from './history';
import { saveDiagnosticSession } from './persistence';

/**
 * Vehicle memory, against the real database.
 *
 * The session under test is produced by the actual simulator and analysed by
 * the actual engine, so what is written is what the product would write. A
 * hand-built payload would prove the columns accept values and nothing about
 * whether a real diagnosis survives the round trip.
 */

const STEP_MS = 200;

let ownerId: string;
let otherOwnerId: string;
let vehicleId: string;
const createdUserIds: string[] = [];

async function createOwner(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}@automind.test`,
      name: 'Memory Owner',
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

function runSession(scenario: ScenarioId) {
  const simulator = new VehicleSimulator({ seed: 42 });
  simulator.setScenario(scenario);

  const session = new DiagnosticSession({
    providerName: 'Simulated vehicle',
    isSimulated: true,
    scenario,
  });

  let t = 0;
  for (const phase of [
    { throttle: 0, seconds: 60 },
    { throttle: 30, seconds: 60 },
  ]) {
    simulator.setThrottle(phase.throttle);
    const end = t + phase.seconds * 1000;
    while (t < end) {
      t += STEP_MS;
      const sample = simulator.sample(t);
      const at = new Date(t);
      const readings: SensorReading[] = [...sample.values.entries()].flatMap(
        ([parameterId, value]) => {
          const definition = getParameter(parameterId);
          if (!definition) return [];
          return [
            { parameterId, at, state: 'AVAILABLE' as const, value, unit: definition.unit },
          ];
        },
      );
      session.record(readings, t);
      session.recordDtcs(sample.dtcs);
    }
  }

  return session;
}

function diagnose(scenario: ScenarioId) {
  const session = runSession(scenario);
  const analysis = analyseSession({
    session,
    dtcs: session.allDtcs(),
    engineDisplacementCc: 1998,
  });
  const differential = applyTestResults(differentiate(analysis), []);
  return { session, analysis, differential };
}

async function save(scenario: ScenarioId, startedAt = new Date()) {
  const { session, analysis, differential } = diagnose(scenario);

  return saveDiagnosticSession({
    vehicleId,
    ownerId,
    analysis,
    differential,
    results: [{ testId: 'rail-pressure-running', outcome: 'NORMAL', note: '380 kPa' }],
    providerName: 'Simulated vehicle',
    isSimulated: true,
    scenario,
    startedAt,
    durationMs: 120_000,
    parameterStats: summariseForStorage(session),
    dtcs: session.allDtcs().map((dtc) => ({
      code: dtc.code,
      status: dtc.status,
      moduleAddress: dtc.moduleAddress ?? null,
      firstSeenAt: startedAt,
    })),
  });
}

beforeEach(async () => {
  ownerId = await createOwner();
  otherOwnerId = await createOwner();

  const vehicle = await prisma.vehicle.create({
    data: { ownerId, make: 'Toyota', model: 'Harrier', year: 2018 },
    select: { id: true },
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('saving a diagnosis', () => {
  it('stores the session, its findings and its ranked causes', async () => {
    const result = await save('VACUUM_LEAK');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = await prisma.scanSession.findUniqueOrThrow({
      where: { id: result.sessionId },
      include: {
        diagnosis: { include: { findings: true, causes: true, tests: true } },
        dtcs: true,
        parameters: true,
      },
    });

    expect(stored.isSimulated).toBe(true);
    expect(stored.sampleCount).toBeGreaterThan(100);
    expect(stored.diagnosis?.findings.some((f) => f.findingId === 'lean-condition')).toBe(true);

    const leak = stored.diagnosis?.causes.find((c) => c.causeId === 'unmetered-air');
    expect(leak).toBeDefined();
    expect(leak?.confidence).toBeGreaterThan(0);
    // The audit trail survives: points, and the observation that awarded them.
    expect(leak?.pointsAvailable).toBeGreaterThan(0);
    expect(JSON.stringify(leak?.contributions)).toContain('trim-airflow-dependence');
  });

  it('keeps what the diagnosis could not establish', async () => {
    const result = await save('VACUUM_LEAK');
    if (!result.ok) throw new Error('save failed');

    const diagnosis = await prisma.diagnosis.findUniqueOrThrow({
      where: { sessionId: result.sessionId },
    });

    // A diagnosis without its limits reads as more certain than it was.
    expect(JSON.stringify(diagnosis.limitations)).toMatch(/mechanism, not a component/i);
  });

  it('records a confirmation test result as performed', async () => {
    const result = await save('VACUUM_LEAK');
    if (!result.ok) throw new Error('save failed');

    const runs = await prisma.confirmationTestRun.findMany({
      where: { diagnosis: { sessionId: result.sessionId } },
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.outcome).toBe('NORMAL');
    expect(runs[0]?.note).toBe('380 kPa');
  });

  it('stores per-condition statistics rather than raw samples', async () => {
    const result = await save('VACUUM_LEAK');
    if (!result.ok) throw new Error('save failed');

    const stats = await prisma.parameterStat.findMany({
      where: { sessionId: result.sessionId },
    });

    // Far fewer rows than the ~600 samples across 18 parameters.
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.length).toBeLessThan(200);

    const rpm = stats.find((s) => s.parameterId === 'ENGINE_RPM' && s.condition === 'IDLE');
    expect(rpm?.mean).toBeGreaterThan(400);
    expect(rpm?.mean).toBeLessThan(1200);
  });

  it('refuses a session that recorded nothing', async () => {
    const empty = new DiagnosticSession({ providerName: 'x', isSimulated: true });
    const analysis = analyseSession({ session: empty, dtcs: [] });

    const result = await saveDiagnosticSession({
      vehicleId,
      ownerId,
      analysis,
      differential: applyTestResults(differentiate(analysis), []),
      results: [],
      providerName: 'x',
      isSimulated: true,
      startedAt: new Date(),
      durationMs: 0,
    });

    // Storing it would put an empty scan on the timeline as though something
    // had been checked.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('EMPTY_SESSION');
  });

  it('refuses to write against a vehicle the caller does not own', async () => {
    const { analysis, differential } = diagnose('VACUUM_LEAK');

    const result = await saveDiagnosticSession({
      vehicleId,
      ownerId: otherOwnerId,
      analysis,
      differential,
      results: [],
      providerName: 'Simulated vehicle',
      isSimulated: true,
      startedAt: new Date(),
      durationMs: 120_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
    expect(await prisma.scanSession.count({ where: { vehicleId } })).toBe(0);
  });
});

describe('reading the memory back', () => {
  it('builds a timeline from the scan', async () => {
    const result = await save('VACUUM_LEAK');
    if (!result.ok) throw new Error('save failed');

    const timeline = await listTimeline(vehicleId, ownerId);
    const kinds = new Set(timeline.map((entry) => entry.kind));

    expect(kinds.has('SCAN_RECORDED')).toBe(true);
    expect(kinds.has('FINDING_RAISED')).toBe(true);
    expect(kinds.has('DIAGNOSIS_REACHED')).toBe(true);
    expect(kinds.has('TEST_PERFORMED')).toBe(true);
  });

  it('never interprets a fault code on the timeline', async () => {
    const result = await save('VACUUM_LEAK');
    if (!result.ok) throw new Error('save failed');

    const codes = (await listTimeline(vehicleId, ownerId)).filter(
      (entry) => entry.kind === 'DTC_OBSERVED',
    );

    expect(codes.length).toBeGreaterThan(0);
    for (const entry of codes) {
      expect(entry.detail).toMatch(/not interpreted/i);
      expect(entry.detail).not.toMatch(/too lean|system lean/i);
    }
  });

  it('shows another owner nothing', async () => {
    const result = await save('VACUUM_LEAK');
    if (!result.ok) throw new Error('save failed');

    expect(await listTimeline(vehicleId, otherOwnerId)).toHaveLength(0);
    expect(await listSessions(vehicleId, otherOwnerId)).toHaveLength(0);
  });

  it('summarises stored sessions newest first', async () => {
    const older = new Date(Date.now() - 86_400_000);
    await save('VACUUM_LEAK', older);
    await save('LEAN_MIXTURE');

    const sessions = await listSessions(vehicleId, ownerId);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.startedAt.getTime()).toBeGreaterThan(
      sessions[1]!.startedAt.getTime(),
    );
    expect(sessions[0]!.verdict).not.toBeNull();
    expect(sessions[0]!.findingCount).toBeGreaterThan(0);
  });

  it('returns a parameter trend across sessions, oldest first', async () => {
    await save('VACUUM_LEAK', new Date(Date.now() - 172_800_000));
    await save('VACUUM_LEAK', new Date(Date.now() - 86_400_000));
    await save('VACUUM_LEAK');

    // The shape a declining battery is read from, and what Stage 21 will use.
    const trend = await parameterTrend(vehicleId, ownerId, 'CONTROL_MODULE_VOLTAGE', 'IDLE');

    expect(trend.length).toBe(3);
    expect(trend[0]!.at.getTime()).toBeLessThan(trend[2]!.at.getTime());
    expect(trend[0]!.mean).toBeGreaterThan(0);
  });
});

describe('health over stored history', () => {
  it('assesses nothing before a scan is saved', async () => {
    const health = await getVehicleHealth(vehicleId, ownerId);

    expect(health.overall).toBeNull();
    expect(health.assessedCount).toBe(0);
  });

  it('scores the systems it has evidence for, and refuses the ones it does not', async () => {
    await save('VACUUM_LEAK');
    const health = await getVehicleHealth(vehicleId, ownerId);

    const fuel = health.systems.find((s) => s.system === 'FUEL')!;
    expect(fuel.status).toBe('ASSESSED');
    expect(fuel.score).not.toBeNull();
    // The score is exactly the sum of its stated reasons.
    expect(fuel.score).toBe(
      100 - fuel.reasons.reduce((sum, r) => sum + r.deduction, 0),
    );

    // Nothing recorded bears on braking, and a number here would be invented.
    const braking = health.systems.find((s) => s.system === 'BRAKING')!;
    expect(braking.status).toBe('NOT_ASSESSED');
    expect(braking.score).toBeNull();
  });

  it('carries the finding through as the reason for the deduction', async () => {
    await save('VACUUM_LEAK');
    const health = await getVehicleHealth(vehicleId, ownerId);

    const fuel = health.systems.find((s) => s.system === 'FUEL')!;
    const finding = fuel.reasons.find((r) => r.kind === 'FINDING');

    expect(finding?.summary).toMatch(/lean condition/i);
    expect(finding?.detail).toMatch(/fuel trim/i);
    expect(finding?.deduction).toBeGreaterThan(0);
  });

  it('shows another owner nothing', async () => {
    await save('VACUUM_LEAK');
    const health = await getVehicleHealth(vehicleId, otherOwnerId);

    expect(health.overall).toBeNull();
    expect(health.assessedCount).toBe(0);
  });
});

describe('owner-entered maintenance', () => {
  it('is logged and appears on the timeline at the date it happened', async () => {
    const performedAt = new Date('2026-01-15T09:00:00Z');

    const result = await logMaintenance({
      vehicleId,
      ownerId,
      performedAt,
      title: 'Routine service',
      notes: 'Oil and filter.',
      odometerKm: 84_000,
    });
    expect(result.ok).toBe(true);

    const entry = (await listTimeline(vehicleId, ownerId)).find(
      (e) => e.kind === 'MAINTENANCE_LOGGED',
    );
    expect(entry?.title).toBe('Routine service');
    expect(entry?.occurredAt.toISOString()).toBe(performedAt.toISOString());

    const records = await listMaintenance(vehicleId, ownerId);
    expect(records[0]?.odometerKm).toBe(84_000);
  });

  it('keeps an unknown odometer null rather than guessing', async () => {
    await logMaintenance({
      vehicleId,
      ownerId,
      performedAt: new Date(),
      title: 'Tyre rotation',
    });

    const records = await listMaintenance(vehicleId, ownerId);
    expect(records[0]?.odometerKm).toBeNull();
  });

  it('refuses a vehicle the caller does not own', async () => {
    const result = await logMaintenance({
      vehicleId,
      ownerId: otherOwnerId,
      performedAt: new Date(),
      title: 'Should not be written',
    });

    expect(result.ok).toBe(false);
    expect(await prisma.maintenanceRecord.count({ where: { vehicleId } })).toBe(0);
  });
});
