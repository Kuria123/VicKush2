import type { FindingSeverity, FindingSystem } from '../diagnostics';

import { detectTrend, type TrendPoint } from './trends';
import {
  HEALTH_SYSTEMS,
  type HealthReason,
  type HealthSystem,
  type SystemHealth,
  type VehicleHealth,
} from './types';

/**
 * The health engine.
 *
 * A score is the arithmetic result of its reasons: 100 minus the deductions,
 * each of which names the evidence that caused it. There is no separate notion
 * of "how healthy the engine feels" that the reasons then justify.
 */

/* --- Inputs --------------------------------------------------------------- */

export interface HealthFinding {
  findingId: string;
  title: string;
  system: FindingSystem;
  severity: FindingSeverity;
  /** The first supporting observation, carried through for the reason text. */
  evidence: string | null;
  observedAt: Date;
}

export interface HealthTrendInput {
  parameterId: string;
  condition: string;
  unit: string | null;
  points: readonly TrendPoint[];
}

export interface HealthInput {
  findings: readonly HealthFinding[];
  trends: readonly HealthTrendInput[];
  /** Parameter ids that were actually read at least once. */
  parametersObserved: readonly string[];
  sessionCount: number;
  latestSessionAt: Date | null;
}

/* --- Mapping -------------------------------------------------------------- */

/**
 * Which health system a diagnostic finding belongs to.
 *
 * Induction, ignition and emissions all fold into ENGINE: they are engine
 * subsystems, and the spec's list has no separate entry for them. UNKNOWN
 * folds in too — every finding the engine currently raises with that system is
 * about how the engine is running — and the reason text always names the
 * finding, so nothing is hidden by the mapping.
 */
const SYSTEM_OF: Record<FindingSystem, HealthSystem> = {
  FUEL: 'FUEL',
  AIR: 'ENGINE',
  IGNITION: 'ENGINE',
  COOLING: 'COOLING',
  ELECTRICAL: 'ELECTRICAL',
  TRANSMISSION: 'TRANSMISSION',
  EMISSIONS: 'ENGINE',
  UNKNOWN: 'ENGINE',
};

/**
 * The parameters that make a system assessable at all.
 *
 * If none of these was ever read, the system is NOT_ASSESSED — not healthy.
 * The distinction is the point of the table.
 */
const PARAMETERS_OF: Record<HealthSystem, readonly string[]> = {
  ENGINE: ['ENGINE_RPM', 'ENGINE_LOAD', 'INTAKE_MAP', 'MAF_RATE', 'TIMING_ADVANCE'],
  FUEL: ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1', 'FUEL_PRESSURE', 'O2_S1_VOLTAGE'],
  COOLING: ['COOLANT_TEMP'],
  ELECTRICAL: ['CONTROL_MODULE_VOLTAGE'],
  TRANSMISSION: ['VEHICLE_SPEED', 'ENGINE_RPM'],
  // Nothing. Mode 01 carries no brake or chassis data, and no ABS module is
  // read. This emptiness is load-bearing, not an omission.
  BRAKING: [],
  SUSPENSION: [],
};

/** Why a system can never be assessed, where that is a permanent fact. */
const UNASSESSABLE: Partial<Record<HealthSystem, string>> = {
  BRAKING:
    'Nothing this build reads bears on braking. OBD-II Mode 01 carries no brake data, and no ABS module is interrogated. A number here would be invented, and a braking figure nobody measured is the most dangerous thing this product could show.',
  SUSPENSION:
    'Nothing this build reads bears on suspension. There is no chassis or ride-height data in the parameters available over Mode 01.',
};

/* --- Weights -------------------------------------------------------------- */

/**
 * What a finding costs.
 *
 * Stated here rather than buried in a branch, because these numbers are the
 * whole scoring model and a reader is entitled to disagree with them.
 */
const SEVERITY_COST: Record<FindingSeverity, number> = {
  SEVERE: 40,
  SIGNIFICANT: 25,
  ADVISORY: 10,
  INFO: 0,
};

/** A sustained direction in a parameter, independent of any single scan. */
const TREND_COST = 15;

/* --- The engine ----------------------------------------------------------- */

export function computeHealth(input: HealthInput): VehicleHealth {
  const systems = HEALTH_SYSTEMS.map((system) => assess(system, input));
  const assessed = systems.filter((s) => s.score !== null);

  return {
    systems,
    // Only assessed systems count: including the others as 0 or 100 would let
    // a system nobody measured move the headline number either way.
    overall:
      assessed.length === 0
        ? null
        : Math.round(
            assessed.reduce((sum, s) => sum + (s.score ?? 0), 0) / assessed.length,
          ),
    assessedCount: assessed.length,
    latestSessionAt: input.latestSessionAt,
  };
}

function assess(system: HealthSystem, input: HealthInput): SystemHealth {
  const permanent = UNASSESSABLE[system];
  if (permanent) {
    return {
      system,
      status: 'NOT_ASSESSED',
      score: null,
      reasons: [
        {
          kind: 'CLEAR_OBSERVATION',
          summary: 'Not assessed — no data is available for this system.',
          detail: permanent,
          deduction: 0,
          observedAt: null,
        },
      ],
      sessionsConsidered: 0,
    };
  }

  const observed = new Set(input.parametersObserved);
  const relevant = PARAMETERS_OF[system].filter((id) => observed.has(id));

  if (relevant.length === 0 || input.sessionCount === 0) {
    return {
      system,
      status: 'NOT_ASSESSED',
      score: null,
      reasons: [
        {
          kind: 'CLEAR_OBSERVATION',
          summary: 'Not assessed — nothing bearing on this system was recorded.',
          detail:
            input.sessionCount === 0
              ? 'No scan has been saved for this vehicle yet.'
              : `None of the readings this system depends on (${PARAMETERS_OF[system].join(', ')}) were captured in the scans on record.`,
          deduction: 0,
          observedAt: null,
        },
      ],
      sessionsConsidered: input.sessionCount,
    };
  }

  const reasons: HealthReason[] = [];

  for (const finding of input.findings) {
    if (SYSTEM_OF[finding.system] !== system) continue;

    const cost = SEVERITY_COST[finding.severity];
    reasons.push({
      kind: 'FINDING',
      summary: finding.title,
      detail:
        finding.evidence ??
        `Raised as ${finding.severity.toLowerCase()} by the diagnostic engine.`,
      deduction: cost,
      observedAt: finding.observedAt,
    });
  }

  for (const trend of input.trends) {
    if (!PARAMETERS_OF[system].includes(trend.parameterId)) continue;

    const reason = trendReason(trend);
    if (reason) reasons.push(reason);
  }

  // A perfect score must be explained too, or it becomes the one number on the
  // screen with nothing behind it.
  if (reasons.length === 0) {
    reasons.push({
      kind: 'CLEAR_OBSERVATION',
      summary: `No abnormal readings across ${input.sessionCount} ${input.sessionCount === 1 ? 'scan' : 'scans'}.`,
      detail: `${relevant.join(', ')} were recorded and nothing in them met the threshold for a finding. This says the readings taken were normal; it is not a statement that the system is faultless.`,
      deduction: 0,
      observedAt: input.latestSessionAt,
    });
  }

  const deducted = reasons.reduce((sum, reason) => sum + reason.deduction, 0);

  return {
    system,
    status: 'ASSESSED',
    score: Math.max(0, Math.min(100, 100 - deducted)),
    reasons,
    sessionsConsidered: input.sessionCount,
  };
}

/**
 * Turns a parameter trend into a reason, when there is one worth stating.
 *
 * Only directions that mean something are reported. Coolant temperature
 * drifting *down* across scans is not a fault; drifting up is. Fuel trim
 * moving away from zero in either direction is, which is why it is measured on
 * magnitude rather than sign.
 */
function trendReason(trend: HealthTrendInput): HealthReason | null {
  const thresholds: Record<string, number> = {
    CONTROL_MODULE_VOLTAGE: 0.3,
    COOLANT_TEMP: 6,
    SHORT_FUEL_TRIM_1: 5,
    LONG_FUEL_TRIM_1: 5,
    FUEL_PRESSURE: 30,
  };

  const minimumDelta = thresholds[trend.parameterId];
  if (minimumDelta === undefined) return null;

  const result = detectTrend(trend.points, { minimumDelta });
  if (result.direction === 'INSUFFICIENT_DATA' || result.direction === 'STABLE') {
    return null;
  }

  const unit = trend.unit ? ` ${trend.unit}` : '';
  const series = trend.points
    .map((p) => `${round(p.value)}${unit}`)
    .join(' → ');

  // Falling voltage and rising temperature are the two that matter; the
  // opposite direction in either is not a fault worth deducting for.
  const adverse =
    (trend.parameterId === 'CONTROL_MODULE_VOLTAGE' && result.direction === 'DECLINING') ||
    (trend.parameterId === 'COOLANT_TEMP' && result.direction === 'RISING') ||
    (trend.parameterId === 'FUEL_PRESSURE' && result.direction === 'DECLINING') ||
    (trend.parameterId.includes('FUEL_TRIM') && Math.abs(result.last) > Math.abs(result.first));

  if (!adverse) return null;

  return {
    kind: 'TREND',
    summary: `${LABELS[trend.parameterId] ?? trend.parameterId} has ${result.direction === 'DECLINING' ? 'declined' : 'risen'} across ${result.points} scans.`,
    detail:
      `${series}, measured at ${trend.condition.toLowerCase().replace('_', ' ')} between ` +
      `${formatDate(result.span!.from)} and ${formatDate(result.span!.to)}. ` +
      'A direction across several scans is a different observation from any single reading, and is not a prediction of failure.',
    deduction: TREND_COST,
    observedAt: null,
  };
}

const LABELS: Record<string, string> = {
  CONTROL_MODULE_VOLTAGE: 'System voltage',
  COOLANT_TEMP: 'Coolant temperature',
  SHORT_FUEL_TRIM_1: 'Short term fuel trim',
  LONG_FUEL_TRIM_1: 'Long term fuel trim',
  FUEL_PRESSURE: 'Fuel rail pressure',
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
