/**
 * What would separate two causes that the evidence so far cannot.
 *
 * This is the part of a differential that matters most. When two mechanisms
 * explain the same readings equally well, the useful output is not a coin
 * flip dressed up as a diagnosis — it is the specific observation that would
 * tell them apart. Every step here is something to *measure*, never a part to
 * fit and see.
 *
 * Steps are keyed by unordered pairs of cause ids, so a pair is described
 * once regardless of which of the two happens to rank higher.
 */

export interface DiscriminatingStep {
  id: string;
  /** The observation to make. */
  action: string;
  /** Why it separates the pair — what each outcome would mean. */
  because: string;
  /** Cause ids this step distinguishes. */
  separates: readonly string[];
}

interface PairStep {
  pair: readonly [string, string];
  action: string;
  because: string;
}

const PAIR_STEPS: readonly PairStep[] = [
  {
    pair: ['fuel-supply-pressure', 'fuel-delivery-shortfall'],
    action:
      'Read fuel rail pressure while the engine runs, at idle and with the engine speed raised.',
    because:
      'These two are identical in the fuel trims and separate only on pressure. Pressure below specification places the fault in the supply; pressure that holds specification while the mixture stays lean places it after the rail, at delivery.',
  },
  {
    pair: ['unmetered-air', 'airflow-under-reading'],
    action:
      'Compare fuel trim at idle against trim with the engine speed held above about 2500 rpm.',
    because:
      'A fixed opening admits a roughly constant mass of air, so the correction it forces falls as airflow rises. A sensor reading low by a percentage forces the same correction at every airflow. The two patterns are distinguishable in one scan that covers both conditions.',
  },
  {
    pair: ['unmetered-air', 'fuel-delivery-shortfall'],
    action:
      'Compare fuel trim at idle against trim at raised engine speed, and confirm rail pressure at the same time.',
    because:
      'Trim that falls as airflow rises indicates unmetered air. Trim that stays flat while rail pressure holds specification indicates the fuel is short at delivery.',
  },
  {
    pair: ['airflow-under-reading', 'fuel-delivery-shortfall'],
    action:
      'Record airflow, manifold pressure, engine speed and intake air temperature together, so reported airflow can be checked against what the engine must be drawing.',
    because:
      'If reported airflow falls below the calculated figure, the sensor is under-reading. If the two agree while the mixture is still lean, the air figure was right and the shortfall is on the fuel side.',
  },
  {
    pair: ['airflow-under-reading', 'fuel-supply-pressure'],
    action: 'Read rail pressure and cross-check reported airflow against manifold conditions.',
    because:
      'Each cause has its own direct measurement. Whichever of the two is out of specification is the one in play; if both are normal, neither is.',
  },
  {
    pair: ['excess-fuel-delivery', 'airflow-over-reading'],
    action: 'Cross-check reported airflow against engine speed, manifold pressure and swept volume.',
    because:
      'Airflow above what the engine can physically draw means the signal is over-reading and the ECU is fuelling for air that is not there. Airflow that agrees with manifold conditions means the air figure was right and the extra fuel is real.',
  },
  {
    pair: ['incomplete-combustion', 'unmetered-air'],
    action:
      'Hold the engine speed above idle and watch whether the speed variation persists, then compare fuel trim between the two speeds.',
    because:
      'Unmetered air disturbs idle because it is a large share of a small airflow, and both the instability and the trim correction ease as airflow rises. Uneven combustion does not ease, because a cylinder that is not contributing at idle is not contributing at speed either.',
  },
];

/** The observation a cause rests on, when that observation was never made. */
const MISSING_OBSERVATION_STEPS: Record<string, { action: string; because: string }> = {
  'fuel-supply-pressure': {
    action: 'Capture fuel rail pressure during the scan.',
    because:
      'Rail pressure is the only reading that separates a supply fault from a delivery fault. Without it neither can be confirmed or excluded.',
  },
  'airflow-under-reading': {
    action:
      'Record the engine displacement on the vehicle, then scan airflow with manifold pressure and engine speed.',
    because:
      'Reported airflow can only be judged against the airflow the engine must be drawing, and calculating that needs the swept volume.',
  },
};

function key(a: string, b: string): string {
  return [a, b].sort().join('|');
}

const BY_PAIR = new Map(PAIR_STEPS.map((step) => [key(...step.pair), step]));

/**
 * Steps that would separate the given causes, one per pair that has one.
 *
 * Only pairs actually in contention produce a step. Listing every test the
 * catalogue knows about would bury the one or two that matter.
 */
export function discriminatorsFor(causeIds: readonly string[]): DiscriminatingStep[] {
  const steps: DiscriminatingStep[] = [];

  for (let i = 0; i < causeIds.length; i += 1) {
    for (let j = i + 1; j < causeIds.length; j += 1) {
      const a = causeIds[i]!;
      const b = causeIds[j]!;
      const step = BY_PAIR.get(key(a, b));
      if (!step) continue;

      steps.push({
        id: `separate-${key(a, b).replace('|', '-from-')}`,
        action: step.action,
        because: step.because,
        separates: [a, b],
      });
    }
  }

  return steps;
}

/**
 * Steps for causes that remain on the table only because the reading which
 * would settle them was never captured.
 */
export function missingObservationSteps(
  causeIds: readonly string[],
  observedEvidenceIds: ReadonlySet<string>,
): DiscriminatingStep[] {
  const steps: DiscriminatingStep[] = [];

  for (const causeId of causeIds) {
    const step = MISSING_OBSERVATION_STEPS[causeId];
    if (!step) continue;

    const settled =
      (causeId === 'fuel-supply-pressure' &&
        (observedEvidenceIds.has('fuel-pressure-low') ||
          observedEvidenceIds.has('fuel-pressure-normal'))) ||
      (causeId === 'airflow-under-reading' &&
        (observedEvidenceIds.has('airflow-under-reported') ||
          observedEvidenceIds.has('airflow-plausible') ||
          observedEvidenceIds.has('airflow-over-reported')));

    if (settled) continue;

    steps.push({
      id: `capture-for-${causeId}`,
      action: step.action,
      because: step.because,
      separates: [causeId],
    });
  }

  return steps;
}
