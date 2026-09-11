/**
 * Structured repair guides.
 *
 * This stage sits in direct tension with two rules the whole product has
 * followed, and the types are where that tension is resolved rather than
 * argued about.
 *
 * **Rule 9 — do not recommend parts prematurely.** Everything up to here has
 * named mechanisms, never components. A guide has to name one. The resolution
 * is a gate, not an exception: a guide is only reachable once a cause has been
 * *confirmed* by a performed test, and even then the component is stated as
 * the thing to inspect, with parts flagged as required only if the inspection
 * step says so. Nobody is told to buy anything on the strength of a scan.
 *
 * **Rule 1 — never fabricate.** Torque figures, fluid capacities, part numbers
 * and labour times are vehicle-specific and need authoritative service data
 * this project does not have. So a `SpecValue` is a union: it either carries a
 * known value or it carries the reason it is unknown, and it is structurally
 * incapable of doing both. The same shape as `SensorReading`, for the same
 * reason — a missing torque spec cannot be rendered as a number.
 *
 * The guides themselves are **authored structured data, never generated**. An
 * AI layer may explain a guide; it may not write one. That is what "do not
 * allow generic AI-generated instructions to bypass safety checks" requires,
 * and a generated procedure could not be validated against anything.
 */

/** A value that is only meaningful with authoritative service data. */
export type SpecValue =
  | { known: true; value: string; source: string }
  | { known: false; requires: string };

/** Convenience for the common case: not known, and why. */
export function unknownSpec(requires: string): SpecValue {
  return { known: false, requires };
}

export const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'WORKSHOP_ONLY'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  WORKSHOP_ONLY: 'Workshop only',
};

export const SAFETY_SEVERITIES = ['CAUTION', 'WARNING', 'DANGER'] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

export interface SafetyRequirement {
  severity: SafetySeverity;
  /** What the hazard actually is. Never "be careful". */
  hazard: string;
  /** What to do about it, specifically. */
  control: string;
}

export interface ToolRequirement {
  name: string;
  /** False for something most people own; true for a workshop tool. */
  specialist: boolean;
  /** Why it is needed, so a substitution can be judged. */
  purpose: string;
}

export interface PartRequirement {
  /** What the part is, generically. Never a part number we cannot know. */
  description: string;
  /**
   * Whether the part is definitely needed, or only if a step finds it is.
   *
   * Almost always CONDITIONAL. A scan establishes a mechanism; which component
   * has failed is settled by the inspection step, not by the diagnosis.
   */
  necessity: 'CONFIRMED_BY_STEP' | 'CONDITIONAL';
  /** The step id that settles whether it is needed. */
  determinedByStep: string | null;
  partNumber: SpecValue;
}

export interface GuideStep {
  id: string;
  /** One action, stated as an instruction. */
  instruction: string;
  /** Why this step exists, so it is not followed blindly. */
  rationale: string;
  /**
   * Safety requirements that must be read before this step.
   *
   * A safety-critical step carries at least one. The validator enforces it,
   * so a step cannot be added that quietly skips the hazard it creates.
   */
  safetyRefs: readonly string[];
  /** Torque, clearance, capacity — usually not known here. */
  specification: SpecValue | null;
  /** What you should observe if the step worked. */
  expectedOutcome: string | null;
}

export interface VerificationStep {
  id: string;
  /** What to measure or observe after the work. */
  check: string;
  /**
   * What result would mean the work succeeded.
   *
   * Stated as a measurement wherever possible. "It feels better" is not a
   * verification, and Stage 19 will compare before and after scans against
   * exactly these.
   */
  passCondition: string;
}

/**
 * A repair guide.
 *
 * `safety` is a non-empty tuple by type, not by convention: a guide with no
 * safety section cannot be constructed at all. That is the strongest form the
 * brief's "do not bypass safety checks" can take in a type system.
 */
export interface RepairGuide {
  id: string;
  /** The cause id from the differential catalogue this guide addresses. */
  causeId: string;

  /* --- The brief's required sections ---------------------------------- */
  problem: string;
  /** What this guide assumes about the vehicle, and what it does not know. */
  vehicleApplicability: string;
  system: string;
  /** The component to inspect. Not an instruction to replace it. */
  component: string;
  difficulty: Difficulty;
  estimatedTime: SpecValue;
  tools: readonly ToolRequirement[];
  parts: readonly PartRequirement[];
  safety: readonly [SafetyRequirement, ...SafetyRequirement[]];
  preparation: readonly [GuideStep, ...GuideStep[]];
  steps: readonly [GuideStep, ...GuideStep[]];
  verification: readonly [VerificationStep, ...VerificationStep[]];

  /**
   * What this guide cannot tell you, stated on the guide itself.
   *
   * Always populated. A procedure without its limits reads as complete, and
   * this one is not: it is a generic procedure, not a vehicle-specific one.
   */
  limitations: readonly [string, ...string[]];
}

/** Every safety requirement is addressed by an id of this form. */
export function safetyId(guideId: string, index: number): string {
  return `${guideId}-safety-${index + 1}`;
}
