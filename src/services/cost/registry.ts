import type { CostProvider } from '@/domain/cost';

import { UnconfiguredCostProvider } from './UnconfiguredCostProvider';

/**
 * The one place a pricing source is chosen.
 *
 * Mirrors the OBD, AI and video registries. No fallback chain: if the
 * configured source cannot answer, the answer is that the figure is unknown,
 * not a quieter substitute the user was not told about.
 */

export type CostProviderFactory = () => CostProvider;

const factories = new Map<string, CostProviderFactory>();

export function registerCostProvider(id: string, factory: CostProviderFactory): void {
  factories.set(id, factory);
}

export function createCostProvider(id: string): CostProvider | null {
  const factory = factories.get(id);
  return factory ? factory() : null;
}

export function isCostProviderRegistered(id: string): boolean {
  return factories.has(id);
}

export interface CostEnvironment {
  COST_PROVIDER?: string | undefined;
}

export function resolveCostProvider(
  env: CostEnvironment = process.env as CostEnvironment,
): CostProvider {
  const configured = env.COST_PROVIDER?.trim();
  if (configured) {
    const provider = createCostProvider(configured);
    if (provider) return provider;
  }
  return new UnconfiguredCostProvider();
}

export function registerBuiltInCostProviders(): void {
  registerCostProvider('unconfigured', () => new UnconfiguredCostProvider());
}

registerBuiltInCostProviders();
