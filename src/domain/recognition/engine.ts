import { FUEL_TYPES, TRANSMISSION_TYPES, VIN_ISSUE_MESSAGES, assessVin, normalizeVin } from '@/domain/vehicles';
import type { FuelType, TransmissionType } from '@/domain/vehicles';

import type {
  Proposal,
  ProposalBasis,
  ProposedVehicle,
  RecognitionResult,
  RejectedClaim,
} from './types';

/**
 * The grounding check for vision.
 *
 * `domain/ai` already refuses to let a language model state a number the
 * evidence does not contain. This is the same idea pointed at a different
 * failure: a model looking at a blurry door jamb will produce a seventeen
 * character string that looks exactly like a VIN, because that is what it was
 * asked for and producing one is easier than declining.
 *
 * Nothing the model says is trusted. Every claim is checked against something
 * this build can verify independently — VIN structure, the enumerations, a
 * plausible year — and anything that fails is rejected *with its reason kept*,
 * so the failure is visible rather than absent.
 *
 * The interpreter cannot raise confidence, only lower it. That is the
 * invariant worth stating: there is no path through this file that makes a
 * claim stronger than the model made it, and several that make it weaker.
 */

/**
 * The most a claim can be worth, by how it was arrived at.
 *
 * Text read off a plate can be near-certain, because it either says what it
 * says or it is illegible. A shape cannot: the ceiling on
 * `INFERRED_FROM_APPEARANCE` is not a guess about model quality, it is a
 * statement that no photograph of bodywork establishes a model year, and a
 * number above it would be claiming otherwise however sure the model sounded.
 */
export const MAX_CONFIDENCE_BY_BASIS: Record<ProposalBasis, number> = {
  READ_FROM_TEXT: 95,
  READ_FROM_BADGE: 80,
  INFERRED_FROM_APPEARANCE: 55,
};

/**
 * Below this, a proposal is not offered at all.
 *
 * A field the model is unsure of is worse than an empty one: the owner sees
 * something written in the box and accepts it, and an unsure guess becomes an
 * asserted fact by way of a confirmation nobody read carefully.
 */
export const MINIMUM_CONFIDENCE = 35;

/** The oldest year this accepts. Older vehicles exist; a photo cannot date them. */
export const EARLIEST_YEAR = 1970;

/** What a vision provider hands over, before any of it is believed. */
export interface RawRecognition {
  imagesExamined: number;
  claims: readonly RawClaim[];
}

export interface RawClaim {
  field: keyof ProposedVehicle;
  value: string;
  basis: ProposalBasis;
  /** The model's own 0-100. Treated as a ceiling request, never as a score. */
  confidence: number;
  observation: string;
}

export function interpretRecognition(
  raw: RawRecognition,
  now: Date = new Date(),
): RecognitionResult {
  const rejected: RejectedClaim[] = [];
  const accepted = new Map<keyof ProposedVehicle, Proposal<never>>();

  for (const claim of raw.claims) {
    const outcome = interpretClaim(claim, now);

    if ('rejected' in outcome) {
      rejected.push({ field: claim.field, claimed: claim.value, reason: outcome.rejected });
      continue;
    }

    // First claim per field wins. A provider offering two makes has not
    // narrowed anything, and picking the more confident of them would be
    // resolving a disagreement this build cannot resolve.
    if (!accepted.has(claim.field)) {
      accepted.set(claim.field, outcome.proposal as Proposal<never>);
    } else {
      rejected.push({
        field: claim.field,
        claimed: claim.value,
        reason: 'A different value was already proposed for this field.',
      });
    }
  }

  const field = <T>(name: keyof ProposedVehicle, missing: string): Proposal<T> =>
    (accepted.get(name) as Proposal<T> | undefined) ?? { established: false, reason: missing };

  return {
    imagesExamined: raw.imagesExamined,
    rejected,
    proposed: {
      make: field('make', 'No badge or model script was legible.'),
      model: field('model', 'No badge or model script was legible.'),
      year: field('year', 'A photograph does not establish a model year.'),
      vin: field('vin', 'No VIN plate or chassis stamp was legible in the images.'),
      fuelType: field(
        'fuelType',
        'Not visible from outside the vehicle unless it is badged.',
      ),
      transmissionType: field(
        'transmissionType',
        'Not visible from outside the vehicle.',
      ),
      registrationPlate: field('registrationPlate', 'No number plate was legible.'),
      bodyColour: field('bodyColour', 'No colour was reported.'),
    },
    limitations: limitationsFor(raw),
  };
}

function interpretClaim(
  claim: RawClaim,
  now: Date,
): { proposal: Proposal<unknown> } | { rejected: string } {
  const text = claim.value.trim();
  if (text.length === 0) return { rejected: 'The value was empty.' };

  const ceiling = MAX_CONFIDENCE_BY_BASIS[claim.basis];
  if (ceiling === undefined) return { rejected: `Unknown basis "${claim.basis}".` };

  // Only ever downward. A model's own confidence is a claim like any other.
  const confidence = Math.round(Math.min(Math.max(claim.confidence, 0), ceiling));
  if (confidence < MINIMUM_CONFIDENCE) {
    return {
      rejected: `Too uncertain to offer (${confidence}%). An unsure suggestion in a form field becomes an asserted fact.`,
    };
  }

  const value = validate(claim.field, text, claim.basis, now);
  if ('rejected' in value) return value;

  return {
    proposal: {
      established: true,
      value: value.value,
      basis: claim.basis,
      confidence,
      observation: claim.observation.trim() || 'No observation was given.',
    },
  };
}

function validate(
  field: keyof ProposedVehicle,
  text: string,
  basis: ProposalBasis,
  now: Date,
): { value: unknown } | { rejected: string } {
  switch (field) {
    case 'vin': {
      /*
       * The most dangerous field in the product. A VIN reaches the
       * identification score as twenty points of evidence and is printed on
       * the report a mechanic reads, so a plausible-looking invention here is
       * worse than every other kind of error this feature can make.
       *
       * It must therefore be *read*, never inferred — no bodywork implies a
       * VIN — and it must survive the same structural check a typed one does.
       */
      if (basis === 'INFERRED_FROM_APPEARANCE') {
        return { rejected: 'A VIN cannot be inferred from a vehicle’s appearance.' };
      }

      const vin = normalizeVin(text);
      const assessment = assessVin(vin);
      if (!assessment.isStructurallyValid) {
        return {
          rejected: `Not a structurally valid VIN. ${assessment.issues.map((issue) => VIN_ISSUE_MESSAGES[issue]).join(' ')}`.trim(),
        };
      }
      return { value: vin };
    }

    case 'year': {
      if (!/^\d{4}$/.test(text)) return { rejected: 'Not a four-digit year.' };
      const year = Number(text);

      // Next year is allowed: new models are registered ahead of the calendar.
      const latest = now.getUTCFullYear() + 1;
      if (year < EARLIEST_YEAR || year > latest) {
        return { rejected: `Outside the range this accepts (${EARLIEST_YEAR}-${latest}).` };
      }
      return { value: year };
    }

    case 'fuelType': {
      const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
      if (!(FUEL_TYPES as readonly string[]).includes(upper)) {
        return { rejected: `"${text}" is not a fuel type this build recognises.` };
      }
      return { value: upper as FuelType };
    }

    case 'transmissionType': {
      const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
      if (!(TRANSMISSION_TYPES as readonly string[]).includes(upper)) {
        return { rejected: `"${text}" is not a transmission type this build recognises.` };
      }
      return { value: upper as TransmissionType };
    }

    case 'make':
    case 'model':
    case 'bodyColour': {
      if (text.length > 60) return { rejected: 'Too long to be a make, model or colour.' };
      return { value: text };
    }

    case 'registrationPlate': {
      if (basis === 'INFERRED_FROM_APPEARANCE') {
        return { rejected: 'A number plate cannot be inferred; it is either legible or it is not.' };
      }
      if (text.length > 16) return { rejected: 'Too long to be a registration plate.' };
      return { value: text.toUpperCase() };
    }

    default: {
      // Rule 3: an unknown field means the provider and this file disagree
      // about the contract, which is a bug rather than a bad photograph.
      return { rejected: `Unknown field "${String(field)}".` };
    }
  }
}

/**
 * What recognition cannot establish, whatever the photograph shows.
 *
 * Two of these are unconditional, so the tuple can never be empty and a caller
 * cannot render a result without them.
 */
function limitationsFor(raw: RawRecognition): readonly [string, ...string[]] {
  const limits: [string, ...string[]] = [
    'Nothing here is saved until you confirm it. Every field can be corrected, and a field left blank stays unknown rather than being guessed.',
    'A photograph cannot establish engine size, transmission, trim level or which market a vehicle was built for. Those come from the VIN, the logbook, or the vehicle itself once it is connected.',
  ];

  if (raw.imagesExamined === 0) {
    limits.push('No images were examined.');
  }

  return limits;
}

/**
 * Whether a result is worth showing the owner at all.
 *
 * A screen of "not established" is not a result; it is a failure, and it
 * should say so rather than presenting eight empty rows as though the vehicle
 * had been examined and found featureless.
 */
export function hasAnyProposal(result: RecognitionResult): boolean {
  return Object.values(result.proposed).some((proposal) => proposal.established);
}
