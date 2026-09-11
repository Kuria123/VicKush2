import { describe, expect, it } from 'vitest';

import { VehicleSimulator } from '@/domain/simulation';
import { getParameter } from '@/domain/telemetry';

import { SimulatedVehicleDataProvider } from './SimulatedVehicleDataProvider';
import { describeProviderContract } from './provider-contract';
import { SIMULATED_PROVIDER_ID, createProvider } from './registry';

/**
 * The physical model, reached through the Stage 5 provider interface.
 *
 * The value of this file is what it demonstrates about the architecture: the
 * provider was written before the model existed and did not change to
 * accommodate it. A diagnostic engine talking to this provider cannot tell
 * that the numbers now come from a mean-value engine model rather than the
 * fixed table it used yesterday — which is precisely what must also be true
 * when a Bluetooth adapter replaces the simulator.
 */

// The model-backed provider satisfies the same contract as the placeholder.
describeProviderContract(
  'Simulated (physical model)',
  () => new SimulatedVehicleDataProvider({ source: new VehicleSimulator() }),
);

describe('the registry serves the physical model', () => {
  it('is what callers get by default', async () => {
    const provider = createProvider(SIMULATED_PROVIDER_ID)!;
    await provider.connect();

    const result = await provider.getSupportedParameters();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The fixed placeholder source offered a dozen parameters and no
      // oxygen sensor; the model offers the closed-loop fuel signals.
      expect(result.value).toContain('O2_S1_LAMBDA');
      expect(result.value).toContain('SHORT_FUEL_TRIM_1');
    }
    await provider.disconnect();
  });
});

describe('telemetry through the interface', () => {
  it('carries live values with their catalogue units', async () => {
    const provider = new SimulatedVehicleDataProvider({
      source: new VehicleSimulator({ seed: 7 }),
    });
    await provider.connect();

    const result = await provider.getLiveData(['ENGINE_RPM', 'INTAKE_MAP']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const reading of result.value) {
        expect(reading.state).toBe('AVAILABLE');
        if (reading.state === 'AVAILABLE') {
          expect(reading.unit).toBe(getParameter(reading.parameterId)!.unit);
          expect(Number.isFinite(reading.value)).toBe(true);
        }
      }
    }
    await provider.disconnect();
  });

  it('surfaces a fault raised by the model, not by the caller', async () => {
    const simulator = new VehicleSimulator({ seed: 7 });
    const provider = new SimulatedVehicleDataProvider({ source: simulator });
    await provider.connect();

    // Select a physical fault; the code must come from the conditions the
    // model produces, not from anything the test asserts.
    provider.setScenario('VACUUM_LEAK');
    simulator.sample(120_000);

    const result = await provider.getDtcs();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = result.value.filter((d) => d.status === 'STORED');
      expect(stored.map((d) => d.code)).toContain('P0171');
      expect(stored[0]!.description).toBeNull();
    }
    await provider.disconnect();
  });

  it('exposes every scenario through the fault-injection interface', () => {
    const provider = new SimulatedVehicleDataProvider({
      source: new VehicleSimulator(),
    });
    expect(provider.listScenarios()).toContain('VACUUM_LEAK');
    expect(provider.setScenario('VACUUM_LEAK').ok).toBe(true);
    expect(provider.setScenario('NOT_REAL').ok).toBe(false);
  });

  it('still declares itself simulated, so SIMULATION MODE is shown', () => {
    const provider = new SimulatedVehicleDataProvider({
      source: new VehicleSimulator(),
    });
    expect(provider.describe().isSimulated).toBe(true);
  });
});
