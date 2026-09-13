import { detectTrend, type TrendPoint, type TrendResult } from '../health';

import type {
  PredictiveReport,
  PredictiveSignal,
  SignalKind,
  SignalStrength,
} from './types';

/**
 * Detecting directions in a vehicle's recorded history.
 *
 * The measurement is the Stage 16 trend detector, reused rather than
 * reimplemented: three points minimum, a stated minimum movement, and 75% of
 * steps agreeing. What this file adds is the interpretation — which
 * directions are adverse, how much a history supports them, and the wording,
 * which is the part the brief actually cares about.
 *
 * Nothing here extrapolates. There is no projected failure date, no remaining
 * life, and no arithmetic that would produce one, because three scans of one
 * vehicle cannot support any of it.
 */

/* --- Inputs --------------------------------------------------------------- */

export interface ParameterHistory {
  parameterId: string;
  condition: string;
  unit: string | null;
  /** Mean per scan, oldest first. */
  points: readonly TrendPoint[];
}

export interface ScanRecord {
  sessionId: string;
  at: Date;
  dtcCodes: readonly string[];
  /** Findings of ADVISORY severity or worse. INFO findings are not conditions. */
  conditionCount: number;
}

export interface PredictionInput {
  parameters: readonly ParameterHistory[];
  scans: readonly ScanRecord[];
}

/** Fewer than this and no direction is claimed about anything. */
const MINIMUM_SCANS = 3;

/* --- Per-parameter rules -------------------------------------------------- */

interface ParameterRule {
  kind: SignalKind;
  system: NonNullable<PredictiveSignal['system']>;
  label: string;
  /** The direction that is adverse. The opposite is not reported. */
  adverse: 'DECLINING' | 'RISING';
  /** Movement below this is scan-to-scan variation, not a direction. */
  minimumDelta: number;
  headline: (result: TrendResult, unit: string) => string;
  notClaiming: string;
  suggestedCheck: string;
}

const RULES: Record<string, ParameterRule> = {
  CONTROL_MODULE_VOLTAGE: {
    kind: 'VOLTAGE_DECLINE',
    system: 'ELECTRICAL',
    label: 'System voltage',
    adverse: 'DECLINING',
    minimumDelta: 0.3,
    headline: (r, unit) =>
      `System voltage is declining across scans, from ${r.first}${unit} to ${r.last}${unit}.`,
    notClaiming:
      'This does not say the battery or alternator has failed, or when either might. It says the voltage recorded at idle has moved down across several scans.',
    suggestedCheck:
      'Measure rest voltage with the engine off and charging voltage with it running and loaded. Those two readings separate a battery holding less charge from a charging system supplying less.',
  },
  COOLANT_TEMP: {
    kind: 'TEMPERATURE_RISE',
    system: 'COOLING',
    label: 'Coolant temperature',
    adverse: 'RISING',
    minimumDelta: 5,
    headline: (r, unit) =>
      `Coolant temperature at idle is rising across scans, from ${r.first}${unit} to ${r.last}${unit}.`,
    notClaiming:
      'This does not say the vehicle is overheating or that any cooling component has failed. Ambient temperature also moves between scans, and this build does not record it.',
    suggestedCheck:
      'Watch a full warm-up and note the temperature it settles at, and whether it keeps climbing once there.',
  },
  LONG_FUEL_TRIM_1: {
    kind: 'FUEL_TRIM_DRIFT',
    system: 'FUEL',
    label: 'Long term fuel trim',
    adverse: 'RISING',
    minimumDelta: 5,
    headline: (r, unit) =>
      `Long term fuel trim at idle is drifting upward across scans, from ${r.first}${unit} to ${r.last}${unit}.`,
    notClaiming:
      'This does not identify what is causing the drift, and does not say a sensor or injector is at fault. A trim moving gradually is a direction, not a diagnosis.',
    suggestedCheck:
      'Compare trim at idle against trim at a raised, steady engine speed. Whether the correction shrinks as airflow rises is what separates an unmetered leak from a proportional error.',
  },
  FUEL_PRESSURE: {
    kind: 'FUEL_PRESSURE_DECLINE',
    system: 'FUEL',
    label: 'Fuel rail pressure',
    adverse: 'DECLINING',
    minimumDelta: 25,
    headline: (r, unit) =>
      `Fuel rail pressure is declining across scans, from ${r.first}${unit} to ${r.last}${unit}.`,
    notClaiming:
      'This does not say the pump or filter has failed. It says the pressure recorded at idle has moved down across several scans.',
    suggestedCheck:
      'Read rail pressure at idle and at a raised engine speed, so the supply is tested under a higher demand.',
  },
};

/* --- The engine ----------------------------------------------------------- */

export function detectSignals(input: PredictionInput): PredictiveReport {
  const scans = [...input.scans].sort((a, b) => a.at.getTime() - b.at.getTime());
  const spanDays =
    scans.length < 2
      ? null
      : Math.round(
          (scans[scans.length - 1]!.at.getTime() - scans[0]!.at.getTime()) / 86_400_000,
        );

  if (scans.length < MINIMUM_SCANS) {
    return {
      signals: [],
      scansConsidered: scans.length,
      spanDays,
      limitations: [
        `A direction needs at least ${MINIMUM_SCANS} saved scans to be distinguishable from ordinary variation. This vehicle has ${scans.length}.`,
        'Nothing here is extrapolated. No failure date or remaining life is estimated from any number of scans.',
      ],
    };
  }

  const signals: PredictiveSignal[] = [
    ...parameterSignals(input.parameters, scans.length),
    ...repeatedDtcSignals(scans),
    ...faultFrequencySignal(scans),
  ];

  return {
    signals,
    scansConsidered: scans.length,
    spanDays,
    limitations: buildLimitations(input, scans, signals),
  };
}

function parameterSignals(
  histories: readonly ParameterHistory[],
  scanCount: number,
): PredictiveSignal[] {
  const signals: PredictiveSignal[] = [];

  for (const history of histories) {
    const rule = RULES[history.parameterId];
    if (!rule) continue;

    const result = detectTrend(history.points, { minimumDelta: rule.minimumDelta });
    // Only the adverse direction is reported. Voltage climbing is not a fault,
    // and flagging it would teach the reader to ignore this panel.
    if (result.direction !== rule.adverse) continue;

    const unit = history.unit ? (history.unit === '%' ? '%' : ` ${history.unit}`) : '';
    const series = history.points.map((p) => `${round(p.value)}${unit}`).join(' → ');

    signals.push({
      id: `${rule.kind.toLowerCase()}-${history.condition.toLowerCase()}`,
      kind: rule.kind,
      system: rule.system,
      headline: rule.headline(
        { ...result, first: round(result.first), last: round(result.last) },
        unit,
      ),
      detail: `${series}, measured at ${humanise(history.condition)} across ${result.points} scans between ${formatDate(result.span!.from)} and ${formatDate(result.span!.to)}.`,
      strength: strengthOf(result),
      series: history.points.map((p) => ({ at: p.at, value: round(p.value) })),
      unit: history.unit,
      notClaiming: rule.notClaiming,
      suggestedCheck: rule.suggestedCheck,
      scansConsidered: scanCount,
    });
  }

  return signals;
}

/**
 * A code that keeps coming back.
 *
 * Reported by identifier only. This build has no authoritative table of code
 * meanings, so a recurring code is "this keeps returning", never "your oxygen
 * sensor keeps failing" (Rule 1).
 */
function repeatedDtcSignals(scans: readonly ScanRecord[]): PredictiveSignal[] {
  const occurrences = new Map<string, Date[]>();

  for (const scan of scans) {
    for (const code of new Set(scan.dtcCodes)) {
      const dates = occurrences.get(code) ?? [];
      dates.push(scan.at);
      occurrences.set(code, dates);
    }
  }

  const signals: PredictiveSignal[] = [];

  for (const [code, dates] of occurrences) {
    if (dates.length < 2) continue;

    signals.push({
      id: `repeated-dtc-${code}`,
      kind: 'REPEATED_DTC',
      system: 'ENGINE',
      headline: `${code} has been recorded in ${dates.length} of ${scans.length} scans.`,
      detail: `Seen on ${dates.map(formatDate).join(', ')}. A code that returns after being cleared is a different observation from one seen once.`,
      strength: dates.length >= 3 ? 'STRONG' : 'MODERATE',
      series: [],
      unit: null,
      notClaiming:
        'What this code means is not interpreted — this build has no authoritative table of code meanings. It says only that the same identifier has been recorded more than once.',
      suggestedCheck:
        'Scan with the engine at operating temperature across both idle and a raised speed, so the readings that accompany the code are captured alongside it.',
      scansConsidered: scans.length,
    });
  }

  return signals;
}

/**
 * Whether the number of conditions raised per scan is going up.
 *
 * Counts findings rather than reading them, so it says "more is being found",
 * not "the vehicle is deteriorating". Those are different claims and only the
 * first is supported by a count.
 */
function faultFrequencySignal(scans: readonly ScanRecord[]): PredictiveSignal[] {
  const points: TrendPoint[] = scans.map((scan) => ({
    at: scan.at,
    value: scan.conditionCount,
  }));

  const result = detectTrend(points, { minimumDelta: 1 });
  if (result.direction !== 'RISING') return [];

  return [
    {
      id: 'rising-fault-frequency',
      kind: 'RISING_FAULT_FREQUENCY',
      system: null,
      headline: `More is being found per scan than before: ${result.first} at the start, ${result.last} most recently.`,
      detail: `Counted across ${result.points} scans between ${formatDate(result.span!.from)} and ${formatDate(result.span!.to)}.`,
      strength: strengthOf(result),
      series: points.map((p) => ({ at: p.at, value: p.value })),
      unit: null,
      notClaiming:
        'This counts findings; it does not read them. More findings per scan can also mean later scans covered more operating conditions than earlier ones.',
      suggestedCheck:
        'Compare the most recent scan against the earliest one directly, rather than relying on the count.',
      scansConsidered: scans.length,
    },
  ];
}

/* --- Strength and limits -------------------------------------------------- */

/**
 * How well the history supports the direction.
 *
 * From the number of points and how consistently they moved — never from how
 * serious the thing would be if true.
 */
function strengthOf(result: TrendResult): SignalStrength {
  if (result.points >= 5 && result.consistency >= 0.9) return 'STRONG';
  if (result.points >= 4 || result.consistency >= 0.9) return 'MODERATE';
  return 'WEAK';
}

function buildLimitations(
  input: PredictionInput,
  scans: readonly ScanRecord[],
  signals: readonly PredictiveSignal[],
): readonly [string, ...string[]] {
  const limitations: string[] = [
    'Nothing here is extrapolated. No failure date, remaining life or replacement interval is estimated — three scans of one vehicle cannot support any of them.',
    'A direction across scans is an observation about recorded readings, not a statement about a component.',
  ];

  if (scans.length < 5) {
    limitations.push(
      `This rests on ${scans.length} scans. A direction seen across more scans is a stronger observation than the same direction seen across three.`,
    );
  }

  const trended = new Set(input.parameters.map((p) => p.parameterId));
  const missing = Object.keys(RULES).filter((id) => !trended.has(id));
  if (missing.length > 0) {
    limitations.push(
      `No history is available for ${missing.map(labelFor).join(', ')}, so nothing is known about how ${missing.length === 1 ? 'it has' : 'they have'} moved.`,
    );
  }

  if (signals.length === 0) {
    limitations.push(
      'No direction was found in what has been recorded. That is not a statement that nothing is changing — only that nothing changed consistently enough, across enough scans, to be distinguishable from ordinary variation.',
    );
  }

  return limitations as [string, ...string[]];
}

/* --- Formatting ----------------------------------------------------------- */

function labelFor(parameterId: string): string {
  return RULES[parameterId]?.label ?? parameterId;
}

function humanise(condition: string): string {
  return condition.toLowerCase().replace(/_/g, ' ');
}

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
