import type { FuelType, TransmissionType, VehicleIdentity } from '@/domain/vehicles';

/**
 * Recognising a vehicle from a photograph.
 *
 * The point of this feature is to remove typing, not to remove the owner. A
 * vision model looking at a car does two very different things, and treating
 * them as one is how this becomes a fabrication engine:
 *
 * - It **reads** text that is physically present — a VIN plate, a chassis
 *   stamp, a number plate. That is evidence, and it is as good as the
 *   photograph is legible.
 * - It **infers** a make, model and year from bodywork. That is a guess, and
 *   it is least reliable on exactly the fleet this product targets. A Harrier
 *   and a Lexus RX are the same vehicle wearing different badges; a facelift
 *   two model years apart is a bumper detail. A model will state either with
 *   complete confidence.
 *
 * So nothing here is a fact. Every field is a *proposal* the owner confirms or
 * corrects before anything reaches the database, and the two kinds of claim
 * are kept apart all the way to the screen, because a reader must be able to
 * tell "I read this off the plate" from "it looks like one of these".
 */

/** Where a proposed value came from. The distinction the whole file exists for. */
export type ProposalBasis =
  /** Read as text in the image — a plate, a stamp, a printed document. */
  | 'READ_FROM_TEXT'
  /** A badge or model script on the bodywork, read as text. */
  | 'READ_FROM_BADGE'
  /** Inferred from shape, lights, proportions. A guess, and labelled one. */
  | 'INFERRED_FROM_APPEARANCE';

export const BASIS_LABELS: Record<ProposalBasis, string> = {
  READ_FROM_TEXT: 'Read from text in the image',
  READ_FROM_BADGE: 'Read from a badge on the vehicle',
  INFERRED_FROM_APPEARANCE: 'Inferred from the vehicle’s appearance',
};

/**
 * One proposed field.
 *
 * A union, like `SensorReading` and `SpecValue` before it: a proposal either
 * carries a value together with how it was arrived at, or carries the reason
 * nothing could be established. There is no shape that holds a value without
 * its basis, so a caller cannot render a suggestion as though it were read off
 * a plate.
 */
export type Proposal<T> =
  | {
      established: true;
      value: T;
      basis: ProposalBasis;
      /**
       * 0-100, and capped by basis — see `MAX_CONFIDENCE_BY_BASIS`. It is the
       * model's own stated confidence, bounded by what that kind of claim can
       * ever be worth, never taken at face value.
       */
      confidence: number;
      /** What in the image led here, in the model's words. Always shown. */
      observation: string;
    }
  | { established: false; reason: string };

export interface ProposedVehicle {
  make: Proposal<string>;
  model: Proposal<string>;
  year: Proposal<number>;
  vin: Proposal<string>;
  fuelType: Proposal<FuelType>;
  transmissionType: Proposal<TransmissionType>;
  /** A visible registration plate, kept separate from the VIN. */
  registrationPlate: Proposal<string>;
  bodyColour: Proposal<string>;
}

export interface RecognitionResult {
  proposed: ProposedVehicle;
  /**
   * How many images were actually examined. A video contributes frames, so
   * this is not always one, and the owner should know how much was looked at.
   */
  imagesExamined: number;
  /**
   * Claims the interpreter refused, with the reason. Kept rather than dropped:
   * "the model offered a VIN that is not a VIN" is a thing worth being able to
   * see, and silently discarding it would hide how often that happens (Rule 3).
   */
  rejected: readonly RejectedClaim[];
  /** What this cannot establish. Never empty. */
  limitations: readonly [string, ...string[]];
}

export interface RejectedClaim {
  field: string;
  claimed: string;
  reason: string;
}

/**
 * What the owner is asked to confirm.
 *
 * Deliberately the same shape the manual form produces, so recognition is a
 * way of *filling in the form* rather than a second path into the database
 * with its own rules. Everything still passes the same validation, and the
 * owner can change any field before saving.
 */
export type ConfirmableIdentity = VehicleIdentity;
