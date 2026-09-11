import {
  aiFail,
  type AIExplanation,
  type AIProvider,
  type AIProviderDescriptor,
  type AIResult,
} from '@/domain/ai';

/**
 * The provider used when no AI is configured.
 *
 * It explains nothing, and that is the point. The obvious alternative — a
 * template that stitches the structured findings into sentences — would be
 * indistinguishable from an AI explanation on screen while being something
 * else entirely, and a user told "here is the AI's reasoning" would be
 * reading a mail merge.
 *
 * So this returns NOT_CONFIGURED, the UI says the layer is unavailable, and
 * the structured diagnosis stands on its own — which it is designed to do.
 */
export class UnconfiguredAIProvider implements AIProvider {
  describe(): AIProviderDescriptor {
    return {
      id: 'unconfigured',
      name: 'No AI provider configured',
      model: null,
      // Declaring nothing is truthful: a capability listed but unavailable
      // makes the UI offer an action that cannot work.
      capabilities: [],
      configured: false,
    };
  }

  async explainDiagnosis(): Promise<AIResult<AIExplanation>> {
    return aiFail(
      'NOT_CONFIGURED',
      'No AI provider is configured, so no explanation can be generated. The structured diagnosis above is complete without one.',
    );
  }
}
