import type {
  BookingOutcome,
  BookingRequest,
  MarketplaceListing,
  MarketplaceSearch,
} from './types';

/**
 * The seam a real marketplace would plug into.
 *
 * Same shape as the cost, video, AI and OBD seams, for the same reason: the
 * decision about where listings come from is one decision, made in one
 * registry, and callers never learn the answer.
 *
 * `search` returns a list and a note rather than a bare list. An empty list on
 * its own is ambiguous — no garages nearby, or no directory at all — and those
 * are completely different things to tell somebody looking for help.
 */

export interface MarketplaceProviderDescriptor {
  id: string;
  name: string;
  kinds: readonly MarketplaceListing['kind'][];
  /** Whether it can make a real booking. Usually, and currently, false. */
  canBook: boolean;
  configured: boolean;
}

export interface MarketplaceSearchResult {
  listings: readonly MarketplaceListing[];
  /** Why the list is as it is. Shown whenever it is empty. */
  note: string;
}

export interface MarketplaceProvider {
  describe(): MarketplaceProviderDescriptor;
  search(query: MarketplaceSearch): Promise<MarketplaceSearchResult>;
  book(request: BookingRequest): Promise<BookingOutcome>;
}
