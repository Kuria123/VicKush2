import type {
  RecognitionOutcome,
  RecognitionProvider,
  RecognitionProviderDescriptor,
} from '@/domain/recognition';

/**
 * The provider used when no vision model is configured, which is the case
 * here until `ANTHROPIC_API_KEY` is set.
 *
 * It recognises nothing and says so. The tempting alternative — matching a
 * photograph against a small table of common models so the feature looks
 * alive — would be a guess dressed as a reading, and the owner would confirm
 * it without ever knowing a model had not been consulted (Rule 1).
 */
export class UnconfiguredRecognitionProvider implements RecognitionProvider {
  describe(): RecognitionProviderDescriptor {
    return {
      id: 'unconfigured',
      name: 'No vision model configured',
      configured: false,
      maxImages: 0,
      model: null,
    };
  }

  async recognise(): Promise<RecognitionOutcome> {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      message:
        'No vision model is configured, so photographs cannot be examined. Set ANTHROPIC_API_KEY in .env.local to enable it. Adding a vehicle by hand works exactly as before.',
    };
  }
}
