import type { OperatingCondition } from './operating-condition';

/**
 * The structured evidence model.
 *
 * Evidence records **what was observed**, never what it means. "Combined fuel
 * trim averaged +22.4% at idle across 180 samples" is evidence. "The engine
 * has a vacuum leak" is not — that is a conclusion, and turning evidence into
 * ranked causes is Stage 10's job.
 *
 * Keeping the two apart is what makes the diagnosis auditable: a conclusion
 * can always be walked back to the measurements that produced it, and a
 * conclusion with no evidence behind it cannot be constructed at all.
 */

export const EVIDENCE_KINDS = [
  /** A stored or pending fault code. */
  'DTC',
  /** A single parameter's value under some condition. */
  'SENSOR_VALUE',
  /** Two or more parameters compared against each other. */
  'SENSOR_RELATIONSHIP',
  /** How a parameter changed over time or across conditions. */
  'TREND',
  /** Something known about the vehicle itself. */
  'CONFIGURATION',
  /**
   * Something expected that was *not* found. Absence is evidence: a lean
   * condition with normal airflow rules out a MAF fault.
   */
  'ABSENCE',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * How much weight an observation carries.
 *
 * Strength reflects the quality of the observation — how many samples, how
 * far outside normal, how directly measured — not how strongly it implies any
 * particular cause. That mapping belongs to Stage 10.
 */
export const EVIDENCE_STRENGTHS = ['WEAK', 'MODERATE', 'STRONG'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export interface MeasuredValue {
  label: string;
  value: number;
  unit: string;
}

export interface Evidence {
  /** Stable identifier, so a cause can reference the evidence it rests on. */
  id: string;
  kind: EvidenceKind;
  /** One line, in plain language, stating what was observed. */
  summary: string;
  /** How it was established, including thresholds and sample counts. */
  detail: string;
  strength: EvidenceStrength;
  /** The condition it was observed in, when that matters. */
  condition: OperatingCondition | null;
  /** Parameters the observation derives from. */
  parameters: readonly string[];
  /** The actual numbers, so the claim can be checked. */
  measured: readonly MeasuredValue[];
}

/* -------------------------------------------------------------------------
 * Findings
 * ---------------------------------------------------------------------- */

export const FINDING_SYSTEMS = [
  'FUEL',
  'AIR',
  'IGNITION',
  'COOLING',
  'ELECTRICAL',
  'TRANSMISSION',
  'EMISSIONS',
  'UNKNOWN',
] as const;
export type FindingSystem = (typeof FINDING_SYSTEMS)[number];

export const FINDING_SEVERITIES = [
  'INFO',
  'ADVISORY',
  'SIGNIFICANT',
  'SEVERE',
] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/**
 * A condition the engine is prepared to state, with the evidence for and
 * against it.
 *
 * A finding is still a description of the vehicle's behaviour — "a lean
 * condition is present" — not an attribution to a component. Naming the part
 * is Stage 10, and doing it here would be exactly the premature parts
 * recommendation the project rules forbid.
 */
export interface Finding {
  id: string;
  title: string;
  system: FindingSystem;
  severity: FindingSeverity;
  /** Observations that support the finding. */
  supporting: readonly Evidence[];
  /** Observations that argue against it, kept rather than discarded. */
  opposing: readonly Evidence[];
}

export interface DiagnosticAnalysis {
  findings: readonly Finding[];
  /** Every observation made, including those no finding used. */
  evidence: readonly Evidence[];
  /** Conditions the session actually covered. */
  conditionsObserved: readonly OperatingCondition[];
  /**
   * Checks that could not be performed, and why. A missing check is not a
   * pass: the user needs to know what was never looked at.
   */
  limitations: readonly string[];
  sampleCount: number;
}

/* -------------------------------------------------------------------------
 * Construction helpers
 * ---------------------------------------------------------------------- */

export function evidence(input: Omit<Evidence, 'measured'> & {
  measured?: readonly MeasuredValue[];
}): Evidence {
  return { ...input, measured: input.measured ?? [] };
}

export function finding(input: Omit<Finding, 'opposing'> & {
  opposing?: readonly Evidence[];
}): Finding {
  return { ...input, opposing: input.opposing ?? [] };
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  SEVERE: 0,
  SIGNIFICANT: 1,
  ADVISORY: 2,
  INFO: 3,
};

export function bySeverity(a: Finding, b: Finding): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  INFO: 'Information',
  ADVISORY: 'Advisory',
  SIGNIFICANT: 'Significant',
  SEVERE: 'Severe',
};

export const SYSTEM_LABELS: Record<FindingSystem, string> = {
  FUEL: 'Fuel',
  AIR: 'Air intake',
  IGNITION: 'Ignition',
  COOLING: 'Cooling',
  ELECTRICAL: 'Electrical',
  TRANSMISSION: 'Transmission',
  EMISSIONS: 'Emissions',
  UNKNOWN: 'Unknown',
};
