import type { Estimate, EstimateKind } from './types';

/**
 * The seam a real pricing source would plug into.
 *
 * There is no such source here, and the architecture exists so that adding one
 * later does not require rewriting callers — the same pattern the OBD, AI and
 * video registries use.
 *
 * The contract is shaped so that "I do not know" is a first-class answer
 * rather than an error. A pricing provider asked about a part it has no data
 * for must be able to say so, and a caller must be unable to mistake that for
 * a figure.
 */

export interface CostProviderDescriptor {
  id: string;
  name: string;
  /** Which estimates it can produce. An empty list is honest and expected. */
  supports: readonly EstimateKind[];
  /** Currencies it can quote in. Empty when it can quote in none. */
  currencies: readonly string[];
  configured: boolean;
}

export interface EstimateRequest {
  kind: EstimateKind;
  /** What is being priced, in plain words. */
  description: string;
  /** Narrowing context, where the caller has it. */
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
  };
  /** The currency the caller wants. A provider may decline rather than convert. */
  currency: string;
}

export interface CostProvider {
  describe(): CostProviderDescriptor;
  /**
   * Returns an estimate, or an `Estimate` whose `known` is false.
   *
   * Deliberately not a Result type: "unknown" is not a failure, it is the
   * ordinary answer for most requests, and modelling it as an error would push
   * callers towards catch-and-ignore.
   */
  estimate(request: EstimateRequest): Promise<Estimate>;
}
