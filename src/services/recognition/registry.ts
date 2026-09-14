import type { RecognitionProvider } from '@/domain/recognition';

import { AnthropicVisionProvider } from './AnthropicVisionProvider';
import { UnconfiguredRecognitionProvider } from './UnconfiguredRecognitionProvider';

/**
 * The one place a vision provider is chosen.
 *
 * Mirrors the AI registry, and reads the same key: recognising a vehicle and
 * explaining a diagnosis are the same account and the same bill, and a second
 * variable to set would be a second thing to get wrong for no benefit.
 *
 * `RECOGNITION_MODEL` overrides the model independently, because vision and
 * reasoning are not necessarily best served by the same one.
 */

export type RecognitionProviderFactory = () => RecognitionProvider;

const factories = new Map<string, RecognitionProviderFactory>();

export function registerRecognitionProvider(
  id: string,
  factory: RecognitionProviderFactory,
): void {
  factories.set(id, factory);
}

export function createRecognitionProvider(id: string): RecognitionProvider | null {
  const factory = factories.get(id);
  return factory ? factory() : null;
}

export function isRecognitionProviderRegistered(id: string): boolean {
  return factories.has(id);
}

/** Only the keys this reads. Server-side only: the key must not reach a browser. */
export interface RecognitionEnvironment {
  ANTHROPIC_API_KEY?: string | undefined;
  RECOGNITION_MODEL?: string | undefined;
}

export function resolveRecognitionProvider(
  env: RecognitionEnvironment = process.env as RecognitionEnvironment,
): RecognitionProvider {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    return new AnthropicVisionProvider({
      apiKey: key,
      ...(env.RECOGNITION_MODEL?.trim() ? { model: env.RECOGNITION_MODEL.trim() } : {}),
    });
  }

  return new UnconfiguredRecognitionProvider();
}

export function registerBuiltInRecognitionProviders(): void {
  registerRecognitionProvider('unconfigured', () => new UnconfiguredRecognitionProvider());
}

registerBuiltInRecognitionProviders();
