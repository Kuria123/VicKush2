import type { DiagnosticTroubleCode } from '../../telemetry';
import {
  bySeverity,
  finding,
  type DiagnosticAnalysis,
  type Evidence,
  type Finding,
} from '../evidence';
import type { OperatingCondition } from '../operating-condition';
import type { DiagnosticSession } from '../session';

import { alignSamples, type AlignedSample } from './aligned-samples';
import {
  analyseAirflowPlausibility,
  analyseFuelPressure,
  analyseFuelTrim,
} from './fuel-air';
import {
  analyseDtcs,
  analyseElectrical,
  analyseIdleStability,
  analyseThermal,
} from './vehicle-systems';

/**
 * The deterministic diagnostic engine.
 *
 * No language model is involved, by design. Every conclusion is reached by a
 * rule over measurements, so the same session always produces the same
 * analysis and every statement can be traced to the numbers behind it.
 * Stage 13 adds an AI layer that explains *this* output; it does not replace
 * it, and it never gets to invent a reading.
 *
 * The engine stops at findings — statements about how the vehicle is
 * behaving. Naming a failed component is Stage 10, deliberately: a lean
 * condition has four plausible causes, and jumping to one of them here would
 * be the premature parts recommendation the project rules forbid.
 */

export interface AnalysisInput {
  session: DiagnosticSession;
  dtcs: readonly DiagnosticTroubleCode[];
  /** From the vehicle record. Absent facts limit what can be checked. */
  engineDisplacementCc?: number | null;
}

const MINIMUM_SAMPLES = 10;

export function analyseSession({
  session,
  dtcs,
  engineDisplacementCc = null,
}: AnalysisInput): DiagnosticAnalysis {
  const samples = alignSamples(session);
  const limitations: string[] = [];
  const all: Evidence[] = [];

  if (samples.length < MINIMUM_SAMPLES) {
    return {
      findings: [],
      evidence: [],
      conditionsObserved: [],
      limitations: [
        `Only ${samples.length} samples were captured. At least ${MINIMUM_SAMPLES} are needed before any observation is worth making.`,
      ],
      sampleCount: samples.length,
    };
  }

  all.push(...analyseDtcs(dtcs));
  all.push(...analyseFuelTrim(samples));

  const airflow = analyseAirflowPlausibility(samples, engineDisplacementCc);
  all.push(...airflow.evidence);
  if (airflow.limitation) limitations.push(airflow.limitation);

  all.push(...analyseFuelPressure(samples));
  all.push(...analyseThermal(samples));
  all.push(...analyseElectrical(samples));
  all.push(...analyseIdleStability(samples));

  limitations.push(...coverageLimitations(samples));
  if (!samples.some((s) => s.values.has('FUEL_PRESSURE'))) {
    limitations.push(
      'Fuel rail pressure was not available, so a supply fault cannot be separated from an injector fault.',
    );
  }
  limitations.push(
    'Misfire counts were not read. They require Mode 06 on-board monitoring results, which this build does not support.',
  );

  return {
    findings: synthesise(all).sort(bySeverity),
    evidence: all,
    conditionsObserved: observedConditions(samples),
    limitations,
    sampleCount: samples.length,
  };
}

/**
 * Groups evidence into the conditions the engine is prepared to state.
 *
 * Opposing evidence is attached rather than dropped. A finding that lists
 * what argues against it is far more useful than one that only lists what
 * supports it, and Stage 10 needs both to rank causes honestly.
 */
function synthesise(all: readonly Evidence[]): Finding[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  const findings: Finding[] = [];

  const pick = (...ids: string[]): Evidence[] =>
    ids.map((id) => byId.get(id)).filter((e): e is Evidence => e !== undefined);

  const trimLevels = all.filter((e) => e.id.startsWith('trim-level-'));
  const leanLevels = trimLevels.filter((e) =>
    e.measured.some((m) => m.label === 'Mean combined trim' && m.value > 0),
  );
  const richLevels = trimLevels.filter((e) =>
    e.measured.some((m) => m.label === 'Mean combined trim' && m.value < 0),
  );

  /* --- Mixture -------------------------------------------------------- */
  if (leanLevels.length > 0) {
    const worst = Math.max(
      ...leanLevels.flatMap((e) =>
        e.measured.filter((m) => m.label === 'Mean combined trim').map((m) => m.value),
      ),
    );
    findings.push(
      finding({
        id: 'lean-condition',
        title: 'Lean condition detected',
        system: 'FUEL',
        severity: worst >= 20 ? 'SIGNIFICANT' : 'ADVISORY',
        supporting: [
          ...leanLevels,
          ...pick('trim-airflow-dependence', 'trim-airflow-independent'),
          ...pick('airflow-under-reported', 'fuel-pressure-low'),
          ...all.filter((e) => e.kind === 'DTC' && e.id.includes('P0171')),
        ],
        // Evidence that narrows the field by ruling things out.
        opposing: pick('airflow-plausible', 'fuel-pressure-normal'),
      }),
    );
  }

  if (richLevels.length > 0) {
    const worst = Math.min(
      ...richLevels.flatMap((e) =>
        e.measured.filter((m) => m.label === 'Mean combined trim').map((m) => m.value),
      ),
    );
    findings.push(
      finding({
        id: 'rich-condition',
        title: 'Rich condition detected',
        system: 'FUEL',
        severity: worst <= -20 ? 'SIGNIFICANT' : 'ADVISORY',
        supporting: [
          ...richLevels,
          ...pick('trim-airflow-dependence', 'trim-airflow-independent'),
          ...pick('airflow-over-reported'),
          ...all.filter((e) => e.kind === 'DTC' && e.id.includes('P0172')),
        ],
        opposing: pick('airflow-plausible'),
      }),
    );
  }

  /* --- Airflow measurement -------------------------------------------- */
  const airflowDisagreement = pick('airflow-under-reported', 'airflow-over-reported');
  if (airflowDisagreement.length > 0) {
    findings.push(
      finding({
        id: 'airflow-disagreement',
        title: 'Airflow reading disagrees with manifold conditions',
        system: 'AIR',
        severity: 'SIGNIFICANT',
        supporting: [
          ...airflowDisagreement,
          ...all.filter((e) => e.kind === 'DTC' && e.id.includes('P0101')),
        ],
      }),
    );
  }

  /* --- Cooling --------------------------------------------------------- */
  const coolantHigh = pick('coolant-high');
  if (coolantHigh.length > 0) {
    findings.push(
      finding({
        id: 'overheating',
        title: 'Engine running above safe temperature',
        system: 'COOLING',
        severity: 'SEVERE',
        supporting: coolantHigh,
      }),
    );
  }

  const coolantLow = pick('coolant-low');
  if (coolantLow.length > 0) {
    findings.push(
      finding({
        id: 'under-temperature',
        title: 'Engine not reaching operating temperature',
        system: 'COOLING',
        severity: 'ADVISORY',
        supporting: coolantLow,
      }),
    );
  }

  /* --- Electrical ------------------------------------------------------ */
  const voltageLow = pick('system-voltage-low');
  if (voltageLow.length > 0) {
    findings.push(
      finding({
        id: 'charging-low',
        title: 'Charging voltage below normal',
        system: 'ELECTRICAL',
        severity: 'SIGNIFICANT',
        supporting: voltageLow,
      }),
    );
  }

  const voltageHigh = pick('system-voltage-high');
  if (voltageHigh.length > 0) {
    findings.push(
      finding({
        id: 'charging-high',
        title: 'Charging voltage above normal',
        system: 'ELECTRICAL',
        severity: 'SIGNIFICANT',
        supporting: voltageHigh,
      }),
    );
  }

  /* --- Running quality ------------------------------------------------- */
  const idleUnstable = pick('idle-unstable');
  if (idleUnstable.length > 0) {
    findings.push(
      finding({
        id: 'rough-idle',
        title: 'Idle is not steady',
        system: 'UNKNOWN',
        severity: 'ADVISORY',
        supporting: [
          ...idleUnstable,
          ...all.filter((e) => e.kind === 'DTC' && /P030\d/.test(e.id)),
        ],
      }),
    );
  }

  /* --- Fault codes with no matching observation ------------------------ */
  // A stored code the readings do not corroborate is itself worth stating:
  // it may be historic, or the conditions that set it may not have recurred.
  const explained = new Set(findings.flatMap((f) => f.supporting.map((e) => e.id)));
  const unexplained = all.filter((e) => e.kind === 'DTC' && !explained.has(e.id));
  if (unexplained.length > 0) {
    findings.push(
      finding({
        id: 'uncorroborated-codes',
        title: 'Fault codes present without matching live readings',
        system: 'UNKNOWN',
        severity: 'ADVISORY',
        supporting: unexplained,
      }),
    );
  }

  /* --- Nothing found --------------------------------------------------- */
  if (findings.length === 0) {
    findings.push(
      finding({
        id: 'no-faults-observed',
        title: 'No abnormal readings in this session',
        system: 'UNKNOWN',
        severity: 'INFO',
        supporting: all.filter((e) => e.kind === 'ABSENCE'),
      }),
    );
  }

  return findings;
}

function observedConditions(
  samples: readonly AlignedSample[],
): OperatingCondition[] {
  return [...new Set(samples.map((s) => s.condition))];
}

/**
 * A scan taken entirely at idle cannot say how anything behaves under load,
 * and that gap is what decides several diagnoses. Saying so is not a caveat;
 * it is the difference between a diagnosis and a guess.
 */
function coverageLimitations(samples: readonly AlignedSample[]): string[] {
  const conditions = new Set(samples.map((s) => s.condition));
  const out: string[] = [];

  const loaded = ['LIGHT_LOAD', 'CRUISE', 'HIGH_LOAD'].some((c) =>
    conditions.has(c as OperatingCondition),
  );

  if (conditions.has('IDLE') && !loaded) {
    out.push(
      'Every reading was taken at idle. How these values behave under load is often what separates one cause from another, so raise the engine speed and scan again.',
    );
  }
  if (!conditions.has('IDLE') && loaded) {
    out.push('No idle readings were captured, so idle-specific behaviour could not be assessed.');
  }

  return out;
}
