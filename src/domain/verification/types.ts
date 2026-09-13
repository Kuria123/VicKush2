import type { FindingSeverity, FindingSystem } from '../diagnostics';

/**
 * Repair verification: before scan, repair, after scan, conclusion.
 *
 * The brief asks for a *cautious* conclusion, and that word is the whole
 * design. A vehicle that reads better after work is evidence **consistent
 * with** the repair having worked. It is not proof, and the difference
 * matters: an intermittent fault that happens not to be present, a trim that
 * has not finished relearning, or an after-scan taken under gentler conditions
 * will all produce an improvement that means nothing.
 *
 * So the strongest verdict this engine can reach is `CONSISTENT_WITH_REPAIR`.
 * There is deliberately no `FIXED`. Nothing in a scan can establish that a
 * fault will not return, and a product that says "repaired" on the strength of
 * one clean reading is making a promise it cannot keep.
 */

/** What the owner says was done. Free text: this build does not verify it. */
export interface RepairEvent {
  id: string;
  performedAt: Date;
  /** e.g. "Intake hose replaced". Taken at the owner's word. */
  summary: string;
  notes: string | null;
  /** The guide followed, when one was. */
  guideId: string | null;
  /** The cause the repair was aimed at. */
  causeId: string | null;
}

export interface ScanFinding {
  findingId: string;
  title: string;
  system: FindingSystem;
  severity: FindingSeverity;
}

export interface ScanParameterStat {
  parameterId: string;
  condition: string;
  mean: number;
  samples: number;
  unit: string | null;
}

/** One side of the comparison, assembled from a stored session. */
export interface ScanSnapshot {
  sessionId: string;
  at: Date;
  isSimulated: boolean;
  conditionsObserved: readonly string[];
  parameters: readonly ScanParameterStat[];
  dtcCodes: readonly string[];
  findings: readonly ScanFinding[];
  /** Null when health could not be assessed from this scan alone. */
  healthScore: number | null;
}

/* -------------------------------------------------------------------------
 * Comparison
 * ---------------------------------------------------------------------- */

export type ChangeDirection = 'IMPROVED' | 'WORSENED' | 'UNCHANGED';

export interface ParameterChange {
  parameterId: string;
  label: string;
  condition: string;
  unit: string | null;
  before: number;
  after: number;
  /** After minus before, in the parameter's own unit. */
  delta: number;
  direction: ChangeDirection;
  /**
   * Whether the movement exceeds ordinary scan-to-scan variation.
   *
   * An insignificant change is still reported — the reader is entitled to see
   * that a number barely moved — but it does not drive the conclusion.
   */
  significant: boolean;
}

export interface FindingChange {
  finding: ScanFinding;
  status: 'RESOLVED' | 'PERSISTED' | 'NEW';
}

export interface DtcChange {
  code: string;
  status: 'CLEARED' | 'PERSISTED' | 'NEW';
}

export type VerificationVerdict =
  /**
   * The readings moved the way a successful repair would move them.
   *
   * The strongest verdict available. Deliberately not "fixed".
   */
  | 'CONSISTENT_WITH_REPAIR'
  /** Nothing meaningful changed. The work has not been shown to have helped. */
  | 'NOT_DEMONSTRATED'
  /** Something is measurably worse than before. */
  | 'WORSENED'
  /**
   * The two scans cannot be compared usefully.
   *
   * Usually because the after-scan did not cover the conditions the before-scan
   * did. Comparing idle-only against idle-plus-load is comparing two different
   * questions, and an answer from it would be worse than no answer.
   */
  | 'INCONCLUSIVE';

export interface VerificationResult {
  verdict: VerificationVerdict;
  /** One line stating the conclusion, in cautious language. */
  summary: string;
  /** Why the verdict is what it is, drawn from the comparisons below. */
  reasoning: readonly string[];
  parameters: readonly ParameterChange[];
  findings: readonly FindingChange[];
  dtcs: readonly DtcChange[];
  /** Before and after, or null when either scan could not be scored. */
  healthBefore: number | null;
  healthAfter: number | null;
  /**
   * What could make this comparison misleading. Always populated, including
   * on a positive verdict — especially on a positive verdict.
   */
  caveats: readonly [string, ...string[]];
}
