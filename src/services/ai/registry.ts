import type { AIProvider } from '@/domain/ai';

import { AnthropicAIProvider } from './AnthropicAIProvider';
import { UnconfiguredAIProvider } from './UnconfiguredAIProvider';

/**
 * The one place an AI provider is chosen.
 *
 * Mirrors the OBD registry: callers ask for a provider and then talk only to
 * the interface, so OpenAI or any other implementation can be added here
 * without a caller changing.
 *
 * Selection is by configuration alone. There is no fallback chain and no
 * "best available" logic — if the configured provider cannot run, the answer
 * is that no explanation is available, not a quieter substitute the user was
 * not told about.
 */

export type AIProviderFactory = () => AIProvider;

const factories = new Map<string, AIProviderFactory>();

export function registerAIProvider(id: string, factory: AIProviderFactory): void {
  factories.set(id, factory);
}

export function createAIProvider(id: string): AIProvider | null {
  const factory = factories.get(id);
  return factory ? factory() : null;
}

export function isAIProviderRegistered(id: string): boolean {
  return factories.has(id);
}

/**
 * The provider for this deployment, from the environment.
 *
 * Server-side only: it reads the API key, which must never reach the browser.
 */
/** Only the keys this actually reads, so a caller need not build a whole env. */
export interface AIEnvironment {
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
}

export function resolveAIProvider(env: AIEnvironment = process.env as AIEnvironment): AIProvider {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    return new AnthropicAIProvider({
      apiKey: key,
      ...(env.ANTHROPIC_MODEL?.trim() ? { model: env.ANTHROPIC_MODEL.trim() } : {}),
    });
  }

  return new UnconfiguredAIProvider();
}

export function registerBuiltInAIProviders(): void {
  registerAIProvider('unconfigured', () => new UnconfiguredAIProvider());
  registerAIProvider('anthropic', () => resolveAIProvider());
}

registerBuiltInAIProviders();
