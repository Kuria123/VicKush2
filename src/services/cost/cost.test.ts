import { describe, expect, it } from 'vitest';

import { UnconfiguredCostProvider } from './UnconfiguredCostProvider';
import { createCostProvider, isCostProviderRegistered, resolveCostProvider } from './registry';

/**
 * The pricing provider seam.
 *
 * No pricing source exists here, and the behaviour under test is what the
 * product does about that: says the figure is unknown, every time, with the
 * reason.
 */

const provider = new UnconfiguredCostProvider();

const request = (kind: 'PARTS' | 'LABOUR' | 'MARKET') => ({
  kind,
  description: 'Intake hose',
  vehicle: { make: 'Toyota', model: 'Harrier', year: 2018 },
  currency: 'KES',
});

describe('when no pricing source is configured', () => {
  it('supports nothing, and says so', () => {
    expect(provider.describe().configured).toBe(false);
    expect(provider.describe().supports).toHaveLength(0);
    expect(provider.describe().currencies).toHaveLength(0);
  });

  it('returns an unknown estimate for every kind, with the reason', async () => {
    for (const kind of ['PARTS', 'LABOUR', 'MARKET'] as const) {
      const estimate = await provider.estimate(request(kind));

      expect(estimate.known, kind).toBe(false);
      if (!estimate.known) {
        expect(estimate.requires.length, kind).toBeGreaterThan(20);
        // Never a figure, however plausible one would look.
        expect(JSON.stringify(estimate)).not.toMatch(/amountMinor/);
      }
    }
  });

  it('names what a market figure would actually require', async () => {
    const estimate = await provider.estimate(request('MARKET'));
    if (estimate.known) throw new Error('should not be known');

    expect(estimate.requires).toMatch(/live market feed/i);
    expect(estimate.requires).toMatch(/would be invented/i);
  });

  it('is what the registry resolves to', () => {
    expect(resolveCostProvider({}).describe().configured).toBe(false);
    // An unknown id falls back rather than throwing at runtime.
    expect(resolveCostProvider({ COST_PROVIDER: 'nope' }).describe().id).toBe('unconfigured');
  });

  it('is replaceable through the registry', () => {
    expect(isCostProviderRegistered('unconfigured')).toBe(true);
    expect(createCostProvider('does-not-exist')).toBeNull();
    expect(typeof createCostProvider('unconfigured')?.estimate).toBe('function');
  });
});
