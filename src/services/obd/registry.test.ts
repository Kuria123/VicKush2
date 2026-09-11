import { beforeEach, describe, expect, it } from 'vitest';

import {
  SIMULATED_PROVIDER_ID,
  createProvider,
  isProviderRegistered,
  listProviders,
  registerProvider,
  resetRegistry,
} from './registry';

beforeEach(() => {
  resetRegistry();
});

describe('provider registry', () => {
  it('ships the simulator registered', () => {
    expect(isProviderRegistered(SIMULATED_PROVIDER_ID)).toBe(true);
  });

  it('creates a provider by id', () => {
    const provider = createProvider(SIMULATED_PROVIDER_ID);
    expect(provider).not.toBeNull();
    expect(provider!.describe().transport).toBe('SIMULATED');
  });

  it('returns null for an unknown id rather than throwing', () => {
    expect(createProvider('bluetooth-elm327')).toBeNull();
  });

  it('hands out a fresh instance each time', () => {
    // Two sessions must not share connection state.
    expect(createProvider(SIMULATED_PROVIDER_ID)).not.toBe(createProvider(SIMULATED_PROVIDER_ID));
  });

  it('describes what is registered without callers instantiating anything', () => {
    const descriptors = listProviders();
    expect(descriptors.length).toBeGreaterThan(0);
    expect(descriptors.some((d) => d.id === SIMULATED_PROVIDER_ID)).toBe(true);
  });

  it('accepts a new transport without any caller changing', () => {
    // The point of the registry: a future adapter registers here and the
    // rest of the application keeps talking to the interface.
    const simulated = createProvider(SIMULATED_PROVIDER_ID)!;
    registerProvider('future-adapter', () => simulated);

    expect(isProviderRegistered('future-adapter')).toBe(true);
    expect(createProvider('future-adapter')).toBe(simulated);
  });

  it('resets back to the built-ins', () => {
    registerProvider('temporary', () => createProvider(SIMULATED_PROVIDER_ID)!);
    resetRegistry();

    expect(isProviderRegistered('temporary')).toBe(false);
    expect(isProviderRegistered(SIMULATED_PROVIDER_ID)).toBe(true);
  });
});
