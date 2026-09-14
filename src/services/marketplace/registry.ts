import type { MarketplaceProvider } from '@/domain/marketplace';

import { UnconfiguredMarketplaceProvider } from './UnconfiguredMarketplaceProvider';

/**
 * The one place a marketplace source is chosen.
 *
 * Mirrors the OBD, AI, video and cost registries. No fallback chain: if the
 * configured source cannot answer, the answer is that nothing is known, not a
 * quieter substitute nobody was told about.
 */

export type MarketplaceProviderFactory = () => MarketplaceProvider;

const factories = new Map<string, MarketplaceProviderFactory>();

export function registerMarketplaceProvider(
  id: string,
  factory: MarketplaceProviderFactory,
): void {
  factories.set(id, factory);
}

export function createMarketplaceProvider(id: string): MarketplaceProvider | null {
  const factory = factories.get(id);
  return factory ? factory() : null;
}

export function isMarketplaceProviderRegistered(id: string): boolean {
  return factories.has(id);
}

export interface MarketplaceEnvironment {
  MARKETPLACE_PROVIDER?: string | undefined;
}

export function resolveMarketplaceProvider(
  env: MarketplaceEnvironment = process.env as MarketplaceEnvironment,
): MarketplaceProvider {
  const configured = env.MARKETPLACE_PROVIDER?.trim();
  if (configured) {
    const provider = createMarketplaceProvider(configured);
    // An unknown id falls back rather than throwing: a typo in an environment
    // variable should degrade to "nothing is configured", which is true, not
    // take the application down at request time.
    if (provider) return provider;
  }
  return new UnconfiguredMarketplaceProvider();
}

export function registerBuiltInMarketplaceProviders(): void {
  registerMarketplaceProvider('unconfigured', () => new UnconfiguredMarketplaceProvider());
}

registerBuiltInMarketplaceProviders();
