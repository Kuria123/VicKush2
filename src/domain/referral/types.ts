import type { FindingSeverity } from '@/domain/diagnostics';
import type { DifferentialVerdict, RankedCause } from '@/domain/differential';
import type { VerificationVerdict } from '@/domain/verification';

/**
 * The referral report: what a mechanic receives instead of "the car is
 * shaking".
 *
 * This is the whole point of the marketplace stage. A directory of garages is
 * a list anyone can buy; what this product can offer that nobody else has is
 * the evidence behind the visit — what was measured, under what conditions,
 * what was already tried, and what it did.
 *
 * Every field here is derived from something recorded. There is no field a
 * model could fill, and the report does not name a part, state what a fault
 * code means, or tell the mechanic what to do. It tells them what is known, so
 * their own judgement starts from further along than it otherwise would.
 */

/**
 * The owner's own words, or the explicit absence of them.
 *
 * A union rather than a nullable string, because "concern" must never be
 * inferred. A lean condition found in a scan is a measurement, not a symptom
 * anybody complained of, and filling this in from the findings would put words
 * in the owner's mouth and then present them to a mechanic as the reason for
 * the visit.
 */
export type ReferralConcern =
  | { stated: true; words: string }
  | { stated: false; reason: string };

/** One measured thing, carried through with the numbers behind it. */
export interface ReferralObservation {
  /** The finding it belongs to, e.g. "Fuel trims high at idle". */
  finding: string;
  severity: FindingSeverity;
  /** The observation verbatim, including its measured values. */
  observation: string;
}

/**
 * A fault code, with no meaning attached.
 *
 * `interpreted` is always false and the field exists to say so out loud. This
 * build parses DTC structure and has no authoritative meaning table, and a
 * mechanic has one — so handing over a code with a guessed description would
 * be offering them worse information than they already have, dressed as help.
 */
export interface ReferralCode {
  code: string;
  status: 'STORED' | 'PENDING' | 'PERMANENT';
  interpreted: false;
}

/** A candidate mechanism, never a component. */
export interface ReferralCandidate {
  label: string;
  mechanism: string;
  /** Fit against the evidence, 0-100. Not a probability. */
  confidence: number;
  /** False when the observation that defines this mechanism was never made. */
  keyObservationMade: boolean;
}

/** A measurement that would settle something, phrased as a question. */
export interface ReferralConfirmation {
  testId: string;
  name: string;
  question: string;
}

/**
 * Work already done, and what the readings did afterwards.
 *
 * `outcome` is the stored verdict rendered in words. It is never "fixed" and
 * never "not fixed": the strongest thing a scan can say is that the readings
 * moved the way a successful repair would move them.
 */
export interface ReferralRepair {
  performedAt: Date;
  summary: string;
  verdict: VerificationVerdict | null;
  outcome: string;
}

export interface ReferralReport {
  preparedAt: Date;
  vehicle: { name: string; spec: string; vin: string | null };
  concern: ReferralConcern;

  /** Null when the vehicle has no saved scan to report from. */
  scan: {
    at: Date;
    providerName: string;
    isSimulated: boolean;
    conditionsObserved: readonly string[];
  } | null;

  verdict: DifferentialVerdict | null;
  observations: readonly ReferralObservation[];
  codes: readonly ReferralCode[];
  candidates: readonly ReferralCandidate[];
  recommendedConfirmation: readonly ReferralConfirmation[];
  previousRepairs: readonly ReferralRepair[];

  /**
   * What this report does not establish. A non-empty tuple, so a report
   * without its limits cannot be constructed — the same device the repair
   * guides use for their safety sections.
   */
  limitations: readonly [string, ...string[]];
  /** Stated in the report itself, not in a covering note nobody forwards. */
  notClaiming: readonly [string, ...string[]];
}

/** What the engine needs. Plain data, so the domain stays free of the database. */
export interface ReferralInput {
  preparedAt: Date;
  vehicle: { name: string; spec: string; vin: string | null };
  concern: string | null;
  scan: {
    at: Date;
    providerName: string;
    isSimulated: boolean;
    conditionsObserved: readonly string[];
  } | null;
  verdict: DifferentialVerdict | null;
  findings: readonly {
    title: string;
    severity: ReferralObservation['severity'];
    supporting: readonly string[];
  }[];
  causes: readonly RankedCause[];
  codes: readonly { code: string; status: ReferralCode['status'] }[];
  /** Confirmation tests already performed, by id. */
  testsPerformed: readonly string[];
  repairs: readonly {
    performedAt: Date;
    summary: string;
    verdict: VerificationVerdict | null;
  }[];
  /** Limits the diagnosis itself recorded, carried through verbatim. */
  diagnosisLimitations: readonly string[];
}
