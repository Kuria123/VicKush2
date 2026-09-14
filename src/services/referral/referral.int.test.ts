import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { applyTestResults } from '@/domain/confirmation';
import { analyseSession, DiagnosticSession, summariseForStorage } from '@/domain/diagnostics';
import { differentiate } from '@/domain/differential';
import { VehicleSimulator, type ScenarioId } from '@/domain/simulation';
import { getParameter, type SensorReading } from '@/domain/telemetry';
import { prisma } from '@/lib/db/client';
import { saveDiagnosticSession } from '@/services/diagnostics/persistence';
import { recordRepair } from '@/services/diagnostics/verification';

import { buildReferralForVehicle } from './service';

/**
 * The referral report, end to end.
 *
 * The unit tests establish what the engine will and will not say. This one
 * establishes that a real diagnosis — simulator, physics, session, analysis,
 * differential, stored in MySQL and read back out — comes through the whole
 * chain with its numbers and its disclosures intact.
 *
 * That round trip is the part worth testing against the database. A report
 * assembled from a hand-built row would prove the formatter works and nothing
 * about whether the stored evidence still carries the measurements by the time
 * it reaches a mechanic.
 */

const STEP_MS = 200;

let ownerId: string;
let vehicleId: string;
const createdUserIds: string[] = [];

async function createOwner(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `ref-${Date.now()}-${Math.random().toString(36).slice(2)}@automind.test`,
      name: 'Referral Owner',
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
          return [{ parameterId, at, state: 'AVAILABLE' as const, value, unit: definition.unit }];
        },
      );
      session.record(readings, t);
      session.recordDtcs(sample.dtcs);
    }
  }

  return session;
}

async function save(scenario: ScenarioId, startedAt = new Date()) {
  const session = runSession(scenario);
  const analysis = analyseSession({
    session,
    dtcs: session.allDtcs(),
    engineDisplacementCc: 1998,
  });
  const differential = applyTestResults(differentiate(analysis), []);

  return saveDiagnosticSession({
    vehicleId,
    ownerId,
    analysis,
    differential,
    results: [],
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
  const vehicle = await prisma.vehicle.create({
    data: { ownerId, make: 'Toyota', model: 'Harrier', year: 2018 },
    select: { id: true },
  });
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('a referral built from a real stored diagnosis', () => {
  it('carries the measurements, not just the conclusion', async () => {
    const saved = await save('VACUUM_LEAK');
    expect(saved.ok).toBe(true);

    const result = await buildReferralForVehicle({ vehicleId, ownerId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // What a mechanic cannot get without having been present: the numbers,
    // under the condition they were taken in.
    expect(result.report.observations.length).toBeGreaterThan(0);
    expect(result.text).toMatch(/\d/);
    expect(result.report.candidates.length).toBeGreaterThan(0);
    expect(result.report.scan?.conditionsObserved.length).toBeGreaterThan(0);
  });

  it('discloses the simulator on the first line', async () => {
    await save('VACUUM_LEAK');

    const result = await buildReferralForVehicle({ vehicleId, ownerId });
    if (!result.ok) throw new Error('referral failed');

    // Rule 2, at the point it matters most: this document leaves the building
    // and somebody will act on it.
    expect(result.text.split('\n')[0]).toContain('SIMULATION MODE');
    expect(result.report.limitations[0]).toContain('SIMULATION MODE');
  });

  it('reads the most recent scan, not an average of several', async () => {
    const older = new Date('2026-01-10T09:00:00Z');
    const newer = new Date('2026-02-10T09:00:00Z');

    await save('VACUUM_LEAK', older);
    await save('NORMAL', newer);

    const result = await buildReferralForVehicle({ vehicleId, ownerId });
    if (!result.ok) throw new Error('referral failed');

    // Combining two scans would describe a vehicle that never existed at any
    // one moment.
    expect(result.report.scan?.at.toISOString()).toBe(newer.toISOString());
  });

  it('includes a repair whose effect has not been measured, and says so', async () => {
    const saved = await save('VACUUM_LEAK');
    if (!saved.ok) throw new Error('save failed');

    await recordRepair({
      vehicleId,
      ownerId,
      summary: 'Intake hose reseated',
      notes: null,
      performedAt: new Date(),
      beforeSessionId: saved.sessionId,
    });

    const result = await buildReferralForVehicle({ vehicleId, ownerId });
    if (!result.ok) throw new Error('referral failed');

    expect(result.report.previousRepairs).toHaveLength(1);
    expect(result.report.previousRepairs[0]?.outcome).toContain('its effect is unknown');
    expect(result.text).toContain('Intake hose reseated');
  });

  it('refuses a vehicle that is not the caller’s', async () => {
    await save('VACUUM_LEAK');
    const stranger = await createOwner();

    const result = await buildReferralForVehicle({ vehicleId, ownerId: stranger });

    // Ownership is enforced in the query, not checked afterwards. A report
    // about somebody else's car is the worst leak this feature could have:
    // it is designed to be forwarded.
    expect(result).toEqual({ ok: false, reason: 'VEHICLE_NOT_FOUND' });
  });

  it('produces a usable report for a vehicle with no scans at all', async () => {
    const result = await buildReferralForVehicle({ vehicleId, ownerId });
    if (!result.ok) throw new Error('referral failed');

    expect(result.report.scan).toBeNull();
    expect(result.report.limitations.join(' ')).toContain('No scan has been saved');
    expect(result.text).toContain('VEHICLE DIAGNOSTIC REPORT');
  });
});
