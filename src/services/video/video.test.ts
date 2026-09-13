import { describe, expect, it } from 'vitest';

import { buildScript } from '@/domain/video';
import { REPAIR_GUIDES } from '@/domain/repair';

import { UnconfiguredVideoProvider } from './UnconfiguredVideoProvider';
import { createVideoProvider, isVideoProviderRegistered, resolveVideoProvider } from './registry';

/**
 * The video provider seam.
 *
 * No rendering backend exists here, and the behaviour under test is what the
 * product does about that: says so, rather than substituting something.
 */

const SCRIPT = buildScript(REPAIR_GUIDES[0]!);

describe('when no video provider is configured', () => {
  const provider = new UnconfiguredVideoProvider();

  it('declares no capabilities, so the UI cannot offer a button that fails', () => {
    expect(provider.describe().configured).toBe(false);
    expect(provider.describe().capabilities).toHaveLength(0);
  });

  it('refuses to render and says why', async () => {
    const result = await provider.render(SCRIPT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_CONFIGURED');
      // Not "coming soon": the written procedure is complete without a video.
      expect(result.error.message).toMatch(/complete without a video/i);
    }
  });

  it('is what the registry resolves to', () => {
    expect(resolveVideoProvider({}).describe().configured).toBe(false);
    // An unknown id falls back to unconfigured rather than throwing at runtime.
    expect(resolveVideoProvider({ VIDEO_PROVIDER: 'nope' }).describe().id).toBe('unconfigured');
  });
});

describe('the registry', () => {
  it('is the one place a provider is chosen', () => {
    expect(isVideoProviderRegistered('unconfigured')).toBe(true);
    expect(createVideoProvider('unconfigured')).not.toBeNull();
    expect(createVideoProvider('does-not-exist')).toBeNull();
  });

  it('lets a replacement be registered without a caller changing', () => {
    // "The provider must be replaceable" — a caller talks to the interface.
    const provider = createVideoProvider('unconfigured');
    expect(typeof provider?.render).toBe('function');
    expect(typeof provider?.getJob).toBe('function');
  });
});
