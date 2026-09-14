/**
 * The marketplace vocabulary.
 *
 * The brief asks for Find Mechanic, Service Centers, Parts, Bookings, Quotes,
 * Mechanic Profiles and Vehicle Diagnostic Reports. Six of those seven need a
 * directory of real businesses — real names, real addresses, real opening
 * hours, real people. This build has none, and there is no honest way to
 * manufacture them: a plausible garage with a plausible address is a place
 * somebody drives to.
 *
 * So the types exist, the seam exists, and no listings do. What is actually
 * built and works is the seventh: the referral report in `domain/referral`,
 * which is the only one of the seven this product can do better than anyone
 * else, and the only one that needed the previous twenty-seven stages.
 *
 * Quotes are the other exception. They already exist, from Stage 23, because a
 * quote is something the owner was really given and typed in — a record, not a
 * listing.
 */

export type MarketplaceListingKind =
  | 'MECHANIC'
  | 'SERVICE_CENTRE'
  | 'PART_SUPPLIER';

/**
 * A business someone could actually contact.
 *
 * Note what is absent: no rating, no review count, no "recommended" flag, no
 * distance-sorted ordering. Those are the fields that turn a directory into a
 * ranking, and a ranking this build cannot substantiate would be an opinion
 * about a real business presented as a measurement.
 */
export interface MarketplaceListing {
  id: string;
  kind: MarketplaceListingKind;
  name: string;
  /** Whatever the source gives. Never assembled from parts or guessed at. */
  location: string | null;
  contact: string | null;
  /** Work the listing says it does, in the source's own words. */
  services: readonly string[];
  /** Which source supplied it, so a reader knows whose claim this is. */
  source: string;
}

export interface MarketplaceSearch {
  kind: MarketplaceListingKind;
  /** Free text as the user typed it. */
  near: string | null;
  /** Optional narrowing, e.g. a system the vehicle has a finding in. */
  service: string | null;
}

/**
 * A request to book, and the reason it could not be made.
 *
 * `BookingOutcome` has no success case that carries a confirmation this build
 * could invent. A booking is an appointment in someone else's diary; without a
 * provider that can write to one, the only truthful outcome is a refusal that
 * says why.
 */
export interface BookingRequest {
  listingId: string;
  vehicleId: string;
  /** The referral report, already rendered, so the garage receives context. */
  referralText: string;
  preferredAt: Date | null;
  note: string | null;
}

export type BookingOutcome =
  | { booked: true; reference: string; at: Date; source: string }
  | { booked: false; reason: string };
