import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaticTelemetrySource, supportsFaultInjection } from '@/domain/telemetry';

import { SimulatedVehicleDataProvider } from './SimulatedVehicleDataProvider';
import { describeProviderContract } from './provider-contract';

// The simulator must satisfy the same contract every hardware provider will.
describeProviderContract('Simulated', () => new SimulatedVehicleDataProvider());

describe('SimulatedVehicleDataProvider — specifics', () => {
  it('declares itself simulated, so the UI must show SIMULATION MODE', () => {
    expect(new SimulatedVehicleDataProvider().describe().isSimulated).toBe(true);
  });

  it('does not claim capabilities it has not implemented', () => {
    const { capabilities } = new SimulatedVehicleDataProvider().describe();
    // Claiming these would make the UI offer actions that cannot work.
    expect(capabilities).not.toContain('READ_FREEZE_FRAME');
    expect(capabilities).not.toContain('READ_READINESS_MONITORS');
    expect(capabilities).not.toContain('READ_VIN');
  });

  it('reports no VIN rather than inventing one', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const result = await provider.identifyVehicle();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // A fabricated VIN could collide with a real vehicle and would be
      // counted as evidence by the identification score.
      expect(result.value.vin).toBeNull();
      expect(result.value.protocol).toBe('ISO_15765_4_CAN_11B_500K');
      expect(result.value.supportsObd2).toBe(true);
    }
    await provider.disconnect();
  });

  it('reports a module that exists but does not answer', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const result = await provider.getModules();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const abs = result.value.find((m) => m.system === 'ABS');
      expect(abs).toBeDefined();
      // Present but silent: callers must handle it, so it is not omitted.
      expect(abs!.responding).toBe(false);
    }
    await provider.disconnect();
  });

  it('attaches the catalogue unit to every available reading', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const result = await provider.getLiveData(['ENGINE_RPM', 'COOLANT_TEMP']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const [rpm, coolant] = result.value;
      expect(rpm!.state).toBe('AVAILABLE');
      if (rpm!.state === 'AVAILABLE') expect(rpm!.unit).toBe('rpm');
      if (coolant!.state === 'AVAILABLE') expect(coolant!.unit).toBe('°C');
    }
    await provider.disconnect();
  });
});

describe('fault injection', () => {
  it('is reachable only through the narrowing guard', () => {
    const provider = new SimulatedVehicleDataProvider();
    expect(supportsFaultInjection(provider)).toBe(true);
  });

  it('records an injected code and returns it', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    expect(provider.injectDtc('P0171').ok).toBe(true);

    const result = await provider.getDtcs();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.code).toBe('P0171');
      // No authoritative fault table exists, so no wording is invented.
      expect(result.value[0]!.description).toBeNull();
    }
    await provider.disconnect();
  });

  it('normalises a lowercase code', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();
    provider.injectDtc('p0302');

    const result = await provider.getDtcs();
    if (result.ok) expect(result.value[0]!.code).toBe('P0302');
    await provider.disconnect();
  });

  it('rejects a malformed code', () => {
    const provider = new SimulatedVehicleDataProvider();
    const result = provider.injectDtc('NOT-A-CODE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PROTOCOL_ERROR');
  });

  it('does not record the same code twice', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();
    provider.injectDtc('P0171');
    provider.injectDtc('P0171');

    const result = await provider.getDtcs();
    if (result.ok) expect(result.value).toHaveLength(1);
    await provider.disconnect();
  });

  it('clears injected faults', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();
    provider.injectDtc('P0171');
    await provider.clearDtcs();

    const result = await provider.getDtcs();
    if (result.ok) expect(result.value).toHaveLength(0);
    await provider.disconnect();
  });

  it('refuses an unknown scenario', () => {
    const provider = new SimulatedVehicleDataProvider();
    const result = provider.setScenario('NOT_A_SCENARIO');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_SUPPORTED');
  });

  it('accepts a scenario it lists', () => {
    const provider = new SimulatedVehicleDataProvider();
    const [first] = provider.listScenarios();
    expect(provider.setScenario(first!).ok).toBe(true);
  });
});

describe('streaming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers samples at the agreed rate', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const samples: unknown[] = [];
    const started = await provider.startStream({
      parameterIds: ['ENGINE_RPM'],
      intervalMs: 200,
      onSample: (readings) => samples.push(readings),
    });

    expect(started.ok).toBe(true);
    vi.advanceTimersByTime(600);
    expect(samples.length).toBe(3);

    if (started.ok) started.value.stop();
    vi.advanceTimersByTime(600);
    // Stopped means stopped.
    expect(samples.length).toBe(3);
  });

  it('slows to its floor rather than pretending to hit an impossible rate', async () => {
    const provider = new SimulatedVehicleDataProvider({ minIntervalMs: 100 });
    await provider.connect();

    const started = await provider.startStream({
      parameterIds: ['ENGINE_RPM'],
      intervalMs: 1,
      onSample: () => {},
    });

    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.value.intervalMs).toBe(100);
      started.value.stop();
    }
  });

  it('refuses a second concurrent stream', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const first = await provider.startStream({
      parameterIds: ['ENGINE_RPM'],
      intervalMs: 100,
      onSample: () => {},
    });
    expect(first.ok).toBe(true);

    const second = await provider.startStream({
      parameterIds: ['COOLANT_TEMP'],
      intervalMs: 100,
      onSample: () => {},
    });
    expect(second.ok).toBe(false);

    await provider.stopStream();
  });

  it('stops streaming when disconnected', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const samples: unknown[] = [];
    await provider.startStream({
      parameterIds: ['ENGINE_RPM'],
      intervalMs: 100,
      onSample: (readings) => samples.push(readings),
    });

    vi.advanceTimersByTime(200);
    const before = samples.length;
    expect(before).toBeGreaterThan(0);

    await provider.disconnect();
    vi.advanceTimersByTime(500);
    // No readings may arrive from a vehicle that is no longer attached.
    expect(samples.length).toBe(before);
  });

  it('allows a new stream after the previous one stopped', async () => {
    const provider = new SimulatedVehicleDataProvider();
    await provider.connect();

    const first = await provider.startStream({
      parameterIds: ['ENGINE_RPM'],
      intervalMs: 100,
      onSample: () => {},
    });
    if (first.ok) first.value.stop();

    const second = await provider.startStream({
      parameterIds: ['ENGINE_RPM'],
      intervalMs: 100,
      onSample: () => {},
    });
    expect(second.ok).toBe(true);
    await provider.stopStream();
  });
});

describe('StaticTelemetrySource', () => {
  it('advances only run time, making no claim to model an engine', () => {
    const source = new StaticTelemetrySource();
    const first = source.sample(0);
    const later = source.sample(5000);

    expect(first.values.get('ENGINE_RPM')).toBe(later.values.get('ENGINE_RPM'));
    expect(later.values.get('RUN_TIME')).toBe(5);
  });

  it('reports every value it lists as supported', () => {
    const source = new StaticTelemetrySource();
    const sample = source.sample(0);
    for (const id of source.supportedParameters()) {
      expect(sample.values.has(id), id).toBe(true);
    }
  });
});
