import type {
  BookingOutcome,
  MarketplaceProvider,
  MarketplaceProviderDescriptor,
  MarketplaceSearchResult,
} from '@/domain/marketplace';

/**
 * The provider used when no marketplace is configured, which is the case here.
 *
 * It returns no listings and refuses every booking, each with the reason. The
 * alternative — a handful of seeded garages to make the screen look alive — is
 * the single worst thing this project could ship. A fabricated sensor reading
 * misleads someone about their car; a fabricated garage sends them to an
 * address (Rule 1).
 */
export class UnconfiguredMarketplaceProvider implements MarketplaceProvider {
  describe(): MarketplaceProviderDescriptor {
    return {
      id: 'unconfigured',
      name: 'No marketplace directory configured',
      kinds: [],
      canBook: false,
      configured: false,
    };
  }

  async search(): Promise<MarketplaceSearchResult> {
    return {
      listings: [],
      note: 'No directory of mechanics, service centres or parts suppliers is connected to this build. Nothing is listed because nothing is known — not because there is nobody nearby.',
    };
  }

  async book(): Promise<BookingOutcome> {
    return {
      booked: false,
      reason:
        'Booking needs a provider that can write to a real diary. None is connected, and a reference number invented here would send someone to an appointment that does not exist.',
    };
  }
}
