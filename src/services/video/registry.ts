import type { VideoProvider } from '@/domain/video';

import { UnconfiguredVideoProvider } from './UnconfiguredVideoProvider';

/**
 * The one place a video provider is chosen.
 *
 * Mirrors the OBD and AI registries: callers ask for a provider and then talk
 * only to the interface, so a rendering backend can be added here without a
 * caller changing. That is what "the provider must be replaceable" means in
 * practice.
 *
 * There is no fallback chain. If the configured provider cannot run, the
 * answer is that no video is available — not a quieter substitute the user was
 * not told about.
 */

export type VideoProviderFactory = () => VideoProvider;

const factories = new Map<string, VideoProviderFactory>();

export function registerVideoProvider(id: string, factory: VideoProviderFactory): void {
  factories.set(id, factory);
}

export function createVideoProvider(id: string): VideoProvider | null {
  const factory = factories.get(id);
  return factory ? factory() : null;
}

export function isVideoProviderRegistered(id: string): boolean {
  return factories.has(id);
}

/** Only the keys this actually reads, so a caller need not build a whole env. */
export interface VideoEnvironment {
  VIDEO_PROVIDER?: string | undefined;
}

export function resolveVideoProvider(
  env: VideoEnvironment = process.env as VideoEnvironment,
): VideoProvider {
  const configured = env.VIDEO_PROVIDER?.trim();
  if (configured) {
    const provider = createVideoProvider(configured);
    if (provider) return provider;
  }
  return new UnconfiguredVideoProvider();
}

export function registerBuiltInVideoProviders(): void {
  registerVideoProvider('unconfigured', () => new UnconfiguredVideoProvider());
}

registerBuiltInVideoProviders();
