import {
  unknownEstimate,
  type CostProvider,
  type CostProviderDescriptor,
  type Estimate,
  type EstimateRequest,
} from '@/domain/cost';

/**
 * The provider used when no pricing source is configured.
 *
 * Which is the case here. It supports nothing and returns an unknown estimate
 * for every request, carrying the reason.
 *
 * The tempting alternative is a "typical price" table — a few hundred rows of
 * plausible figures that would make the feature look finished. It would also
 * be wrong for most vehicles in most markets, and someone would take a number
 * from it into a negotiation. The brief's "never fabricate live market prices"
 * rules it out, and it should be ruled out anyway.
 */
export class UnconfiguredCostProvider implements CostProvider {
  describe(): CostProviderDescriptor {
    return {
      id: 'unconfigured',
      name: 'No pricing source configured',
      supports: [],
      currencies: [],
      configured: false,
    };
  }

  async estimate(request: EstimateRequest): Promise<Estimate> {
    return unknownEstimate(
      request.kind,
      request.kind === 'LABOUR'
        ? 'Published labour times and an hourly rate for your area. This build has neither.'
        : request.kind === 'PARTS'
          ? 'A parts catalogue priced for your vehicle and market. This build has none.'
          : 'A live market feed for your area. This build has none, and a figure without one would be invented.',
    );
  }
}
