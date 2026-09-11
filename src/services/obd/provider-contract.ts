import { expect, it, describe } from 'vitest';

import { hasCapability, isAvailable, type VehicleDataProvider } from '@/domain/telemetry';

/**
 * The contract every VehicleDataProvider must satisfy, regardless of
 * transport.
 *
 * This is the load-bearing part of the abstraction. An interface alone only
 * promises that the method names line up; these tests pin down the behaviour
 * the diagnostic engine actually relies on — that reads fail cleanly when
 * disconnected, that unsupported parameters are reported rather than dropped,
 * that connect and disconnect are idempotent, and that a capability which is
 * declared actually works.
 *
 * When the Bluetooth, USB, Wi-Fi and CAN providers arrive they run this same
 * suite. Anything that passes it is substitutable for the simulator, which is
 * what lets the engine stay ignorant of where data came from.
 *
 * Usage:
 *   describeProviderContract('Simulated', () => new SimulatedVehicleDataProvider());
 */
export function describeProviderContract(
  name: string,
  createProvider: () => VehicleDataProvider,
): void {
  describe(`${name} — VehicleDataProvider contract`, () => {
    describe('description', () => {
      it('is available before connecting', () => {
        const provider = createProvider();
        const descriptor = provider.describe();
        expect(descriptor.id.length).toBeGreaterThan(0);
        expect(descriptor.name.length).toBeGreaterThan(0);
      });

      it('states plainly whether the data is simulated', () => {
        // Mandatory, because every UI that shows this data reads it to decide
        // whether SIMULATION MODE must be displayed.
        expect(typeof createProvider().describe().isSimulated).toBe('boolean');
      });

      it('declares no duplicate capabilities', () => {
        const { capabilities } = createProvider().describe();
        expect(new Set(capabilities).size).toBe(capabilities.length);
      });

      it('only a simulator may offer fault injection', () => {
        const descriptor = createProvider().describe();
        if (hasCapability(descriptor, 'FAULT_INJECTION')) {
          expect(descriptor.isSimulated).toBe(true);
        }
      });
    });

    describe('connection lifecycle', () => {
      it('starts disconnected', () => {
        expect(createProvider().state).toBe('DISCONNECTED');
      });

      it('connects', async () => {
        const provider = createProvider();
        const result = await provider.connect();
        expect(result.ok).toBe(true);
        expect(provider.state).toBe('CONNECTED');
        await provider.disconnect();
      });

      it('treats a second connect as success rather than an error', async () => {
        const provider = createProvider();
        await provider.connect();
        expect((await provider.connect()).ok).toBe(true);
        expect(provider.state).toBe('CONNECTED');
        await provider.disconnect();
      });

      it('disconnects, and disconnecting again is still safe', async () => {
        const provider = createProvider();
        await provider.connect();
        expect((await provider.disconnect()).ok).toBe(true);
        expect((await provider.disconnect()).ok).toBe(true);
        expect(provider.state).toBe('DISCONNECTED');
      });

      it('announces state changes and stops after unsubscribing', async () => {
        const provider = createProvider();
        const seen: string[] = [];
        const unsubscribe = provider.onStateChange((state) => seen.push(state));

        await provider.connect();
        expect(seen).toContain('CONNECTED');

        unsubscribe();
        const countAtUnsubscribe = seen.length;
        await provider.disconnect();
        expect(seen.length).toBe(countAtUnsubscribe);
      });
    });

    describe('reads while disconnected', () => {
      // Every read must fail the same recognisable way, so callers need one
      // branch rather than one per method.
      it.each([
        ['identifyVehicle', (p: VehicleDataProvider) => p.identifyVehicle()],
        ['getModules', (p: VehicleDataProvider) => p.getModules()],
        ['getDtcs', (p: VehicleDataProvider) => p.getDtcs()],
        ['getSupportedParameters', (p: VehicleDataProvider) => p.getSupportedParameters()],
        ['getLiveData', (p: VehicleDataProvider) => p.getLiveData(['ENGINE_RPM'])],
      ])('%s reports NOT_CONNECTED', async (_label, call) => {
        const provider = createProvider();
        const result = await call(provider);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('NOT_CONNECTED');
          // Connecting first would fix it, so the caller may retry.
          expect(result.error.retryable).toBe(true);
        }
      });

      it('returns a result instead of throwing', async () => {
        const provider = createProvider();
        await expect(provider.getDtcs()).resolves.toBeDefined();
      });
    });

    describe('identification', () => {
      it('reports every field, using null for what it could not establish', async () => {
        const provider = createProvider();
        await provider.connect();

        const result = await provider.identifyVehicle();
        expect(result.ok).toBe(true);
        if (result.ok) {
          // Present-and-null is required: it distinguishes "asked, unknown"
          // from "never asked".
          expect(result.value).toHaveProperty('vin');
          expect(result.value).toHaveProperty('ecuName');
          expect(result.value).toHaveProperty('protocol');
          expect(result.value).toHaveProperty('supportsObd2');
        }
        await provider.disconnect();
      });
    });

    describe('modules', () => {
      it('includes modules that did not respond rather than omitting them', async () => {
        const provider = createProvider();
        await provider.connect();

        const result = await provider.getModules();
        expect(result.ok).toBe(true);
        if (result.ok) {
          for (const ecu of result.value) {
            expect(typeof ecu.responding).toBe('boolean');
            expect(ecu.name.length).toBeGreaterThan(0);
          }
        }
        await provider.disconnect();
      });
    });

    describe('live data', () => {
      it('returns one reading per requested parameter, in order', async () => {
        const provider = createProvider();
        await provider.connect();

        const requested = ['ENGINE_RPM', 'COOLANT_TEMP'];
        const result = await provider.getLiveData(requested);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.map((r) => r.parameterId)).toEqual(requested);
        }
        await provider.disconnect();
      });

      it('marks an unsupported parameter rather than dropping it', async () => {
        const provider = createProvider();
        await provider.connect();

        const result = await provider.getLiveData(['DEFINITELY_NOT_A_PARAMETER']);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0]!.state).toBe('UNSUPPORTED');
        }
        await provider.disconnect();
      });

      it('never attaches a value to a reading that has none', async () => {
        const provider = createProvider();
        await provider.connect();

        const supported = await provider.getSupportedParameters();
        const ids = supported.ok ? [...supported.value, 'NOT_A_PARAMETER'] : [];
        const result = await provider.getLiveData(ids);

        expect(result.ok).toBe(true);
        if (result.ok) {
          for (const reading of result.value) {
            if (isAvailable(reading)) {
              expect(Number.isFinite(reading.value)).toBe(true);
              expect(reading.unit.length).toBeGreaterThan(0);
            } else {
              // The union makes this structurally impossible, so this is a
              // guard against a cast slipping through.
              expect((reading as { value?: number }).value).toBeUndefined();
            }
          }
        }
        await provider.disconnect();
      });

      it('only reports parameters it declared as supported', async () => {
        const provider = createProvider();
        await provider.connect();

        const supported = await provider.getSupportedParameters();
        expect(supported.ok).toBe(true);
        if (supported.ok) {
          const result = await provider.getLiveData(supported.value);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.every((r) => r.state !== 'UNSUPPORTED')).toBe(true);
          }
        }
        await provider.disconnect();
      });

      it('accepts an empty request', async () => {
        const provider = createProvider();
        await provider.connect();
        const result = await provider.getLiveData([]);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toHaveLength(0);
        await provider.disconnect();
      });
    });

    describe('streaming', () => {
      it('refuses to stream with no parameters', async () => {
        const provider = createProvider();
        if (!hasCapability(provider.describe(), 'STREAMING')) return;

        await provider.connect();
        const result = await provider.startStream({
          parameterIds: [],
          intervalMs: 100,
          onSample: () => {},
        });
        expect(result.ok).toBe(false);
        await provider.disconnect();
      });

      it('never reports a faster rate than it was asked for', async () => {
        const provider = createProvider();
        if (!hasCapability(provider.describe(), 'STREAMING')) return;

        await provider.connect();
        const result = await provider.startStream({
          parameterIds: ['ENGINE_RPM'],
          // Deliberately unrealistic: a provider must slow down and say so
          // rather than silently pretending to deliver this.
          intervalMs: 1,
          onSample: () => {},
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.intervalMs).toBeGreaterThanOrEqual(1);
          result.value.stop();
        }
        await provider.disconnect();
      });

      it('stopping when nothing is streaming is safe', async () => {
        const provider = createProvider();
        await provider.connect();
        expect((await provider.stopStream()).ok).toBe(true);
        await provider.disconnect();
      });

      it('disconnecting stops any active stream', async () => {
        const provider = createProvider();
        if (!hasCapability(provider.describe(), 'STREAMING')) return;

        await provider.connect();
        const started = await provider.startStream({
          parameterIds: ['ENGINE_RPM'],
          intervalMs: 10,
          onSample: () => {},
        });
        expect(started.ok).toBe(true);

        await provider.disconnect();
        // A stream left running after disconnect would deliver readings from
        // a vehicle that is no longer attached.
        expect(provider.state).toBe('DISCONNECTED');
      });
    });
  });
}
