import type { ProviderDescriptor, VehicleDataProvider } from '@/domain/telemetry';

import { VehicleSimulator } from '@/domain/simulation';

import { SimulatedVehicleDataProvider } from './SimulatedVehicleDataProvider';

/**
 * The one place a concrete provider is chosen.
 *
 * Everything above this file asks the registry for a provider and then talks
 * only to the interface. When Bluetooth, USB, Wi-Fi and CAN adapters arrive
 * (Stages 24–25) they register here, and no caller changes.
 */

export type ProviderFactory = () => VehicleDataProvider;

const factories = new Map<string, ProviderFactory>();

export function registerProvider(id: string, factory: ProviderFactory): void {
  factories.set(id, factory);
}

export function createProvider(id: string): VehicleDataProvider | null {
  const factory = factories.get(id);
  return factory ? factory() : null;
}

/** Describes what is registered, without instantiating anything. */
export function listProviders(): readonly ProviderDescriptor[] {
  return [...factories.values()].map((factory) => factory().describe());
}

export function isProviderRegistered(id: string): boolean {
  return factories.has(id);
}

/** For tests that need a clean registry. */
export function resetRegistry(): void {
  factories.clear();
  registerBuiltInProviders();
}

export const SIMULATED_PROVIDER_ID = 'simulated';

export function registerBuiltInProviders(): void {
  // The Stage 6 physical model drops straight into the TelemetrySource seam
  // the provider already had. The provider itself did not change.
  registerProvider(
    SIMULATED_PROVIDER_ID,
    () =>
      new SimulatedVehicleDataProvider({
        source: new VehicleSimulator(),
        // Stands in for an adapter's initialisation handshake, which on a
        // real ELM327 takes a second or two. This is the only pause in the
        // connection sequence — every other step waits on actual work.
        connectDelayMs: 700,
      }),
  );
}

registerBuiltInProviders();
