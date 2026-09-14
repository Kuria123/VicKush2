import { describe, expect, it } from 'vitest';

import { UnconfiguredMarketplaceProvider } from './UnconfiguredMarketplaceProvider';
import {
  createMarketplaceProvider,
  isMarketplaceProviderRegistered,
  registerMarketplaceProvider,
  resolveMarketplaceProvider,
} from './registry';

/**
 * The marketplace seam.
 *
 * There is no directory here, and these tests are mostly about making sure it
 * stays that way accidentally-proof. A seeded list of plausible garages is the
 * one fabrication in this whole project that would put somebody in a car
 * driving to an address that does not exist.
 */

describe('with nothing configured', () => {
  const provider = new UnconfiguredMarketplaceProvider();

  it('lists nothing, and says why rather than looking empty', () => {
    // An empty list on its own reads as "no garages near you", which is a
    // claim about the reader's area that nothing here could support.
    return provider.search().then((result) => {
      expect(result.listings).toEqual([]);
      expect(result.note).toContain('No directory');
      expect(result.note).toContain('not because there is nobody nearby');
    });
  });

  it('declares that it cannot book', () => {
    const descriptor = provider.describe();
    expect(descriptor.configured).toBe(false);
    expect(descriptor.canBook).toBe(false);
    expect(descriptor.kinds).toEqual([]);
  });

  it('refuses a booking with a reason, and invents no reference', async () => {
    const outcome = await provider.book();

    expect(outcome.booked).toBe(false);
    if (!outcome.booked) {
      expect(outcome.reason).toContain('real diary');
    }
    expect(outcome).not.toHaveProperty('reference');
  });
});

describe('the registry', () => {
  it('falls back to unconfigured when nothing is set', () => {
    expect(resolveMarketplaceProvider({}).describe().configured).toBe(false);
  });

  it('falls back rather than throwing on an unknown id', () => {
    // A typo in an environment variable should degrade to "nothing is
    // configured", which is true, not take the application down at request
    // time (Rule 3 is about not hiding errors, not about crashing on them).
    const provider = resolveMarketplaceProvider({ MARKETPLACE_PROVIDER: 'not-a-provider' });
    expect(provider.describe().id).toBe('unconfigured');
  });

  it('uses a registered provider when one is named', () => {
    registerMarketplaceProvider('test-directory', () => new UnconfiguredMarketplaceProvider());

    expect(isMarketplaceProviderRegistered('test-directory')).toBe(true);
    expect(createMarketplaceProvider('test-directory')).not.toBeNull();
    expect(
      resolveMarketplaceProvider({ MARKETPLACE_PROVIDER: 'test-directory' }),
    ).toBeInstanceOf(UnconfiguredMarketplaceProvider);
  });
});
