import { evidence, type Evidence, type EvidenceStrength } from '../evidence';
import { CONDITION_LABELS, airflowRank, isClosedLoopCondition } from '../operating-condition';

import {
  derivedStatsByCondition,
  statsByCondition,
  type AlignedSample,
  type ConditionStats,
} from './aligned-samples';

/**
 * Mixture and airflow observations.
 *
 * Everything here is a measurement, phrased as one. The engine says "combined
 * fuel trim averaged +22.4% at idle and +4.1% at cruise"; it does not say
 * "there is a vacuum leak". Attribution is Stage 10.
 */

/* Thresholds. Real ECUs allow ±25% of trim authority; sustained correction
 * beyond about 10% is worth noting and beyond 20% is where codes are set. */
const TRIM_NOTABLE = 10;
const TRIM_SIGNIFICANT = 20;

/** Difference in trim between low and high airflow worth calling a pattern. */
const TRIM_SPREAD_NOTABLE = 8;

function strengthFromSamples(samples: number, magnitude: number): EvidenceStrength {
  if (samples >= 60 && magnitude >= TRIM_SIGNIFICANT) return 'STRONG';
  if (samples >= 20 && magnitude >= TRIM_NOTABLE) return 'MODERATE';
  return 'WEAK';
}

function closedLoopOnly(stats: readonly ConditionStats[]): ConditionStats[] {
  return stats.filter((s) => isClosedLoopCondition(s.condition));
}

export function analyseFuelTrim(samples: readonly AlignedSample[]): Evidence[] {
  const found: Evidence[] = [];

  const combined = closedLoopOnly(
    derivedStatsByCondition(
      samples,
      ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1'],
      ([short, long]) => short! + long!,
    ),
  );
  if (combined.length === 0) return found;

  // --- Level, per condition -------------------------------------------
  for (const stat of combined) {
    const magnitude = Math.abs(stat.mean);
    if (magnitude < TRIM_NOTABLE) continue;

    const lean = stat.mean > 0;
    found.push(
      evidence({
        id: `trim-level-${stat.condition.toLowerCase()}`,
        kind: 'SENSOR_VALUE',
        summary: `Combined fuel trim averaged ${stat.mean > 0 ? '+' : ''}${stat.mean.toFixed(1)}% at ${CONDITION_LABELS[stat.condition].toLowerCase()}.`,
        detail:
          `Short and long term trim added together across ${stat.samples} samples, ranging ` +
          `${stat.min.toFixed(1)}% to ${stat.max.toFixed(1)}%. The ECU is adding ` +
          `${lean ? 'fuel, so the mixture it measures is leaner' : 'less fuel, so the mixture it measures is richer'} ` +
          `than it commanded. Correction beyond ${TRIM_NOTABLE}% is notable; beyond ${TRIM_SIGNIFICANT}% is where codes are set.`,
        strength: strengthFromSamples(stat.samples, magnitude),
        condition: stat.condition,
        parameters: ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1'],
        measured: [
          { label: 'Mean combined trim', value: round(stat.mean), unit: '%' },
          { label: 'Samples', value: stat.samples, unit: '' },
        ],
      }),
    );
  }

  // --- Behaviour across airflow ----------------------------------------
  // This is the observation that distinguishes an unmetered air leak from a
  // proportional fuelling or metering error. A fixed-size leak admits a
  // roughly constant mass of air, so its share of the total shrinks as
  // airflow rises and the correction needed falls with it. A sensor that
  // under-reports by a percentage, or injectors that under-deliver by one,
  // require the same correction at every airflow.
  const ranked = combined
    .map((stat) => ({ stat, rank: airflowRank(stat.condition) }))
    .filter((entry): entry is { stat: ConditionStats; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank);

  if (ranked.length >= 2) {
    const lowest = ranked[0]!;
    const highest = ranked[ranked.length - 1]!;
    const spread = lowest.stat.mean - highest.stat.mean;

    if (Math.abs(spread) >= TRIM_SPREAD_NOTABLE) {
      const falls = spread > 0;
      found.push(
        evidence({
          id: 'trim-airflow-dependence',
          kind: 'TREND',
          summary: falls
            ? `Fuel trim falls by ${spread.toFixed(1)} points as airflow rises, from ${lowest.stat.mean.toFixed(1)}% at ${CONDITION_LABELS[lowest.stat.condition].toLowerCase()} to ${highest.stat.mean.toFixed(1)}% at ${CONDITION_LABELS[highest.stat.condition].toLowerCase()}.`
            : `Fuel trim rises by ${Math.abs(spread).toFixed(1)} points as airflow rises, from ${lowest.stat.mean.toFixed(1)}% at ${CONDITION_LABELS[lowest.stat.condition].toLowerCase()} to ${highest.stat.mean.toFixed(1)}% at ${CONDITION_LABELS[highest.stat.condition].toLowerCase()}.`,
          detail: falls
            ? 'A correction that shrinks as airflow grows is characteristic of a fixed quantity of air entering outside the measured path: it is a large share of a small flow and a small share of a large one.'
            : 'A correction that grows with airflow points to something that scales with demand rather than a fixed offset.',
          strength: Math.abs(spread) >= 12 ? 'STRONG' : 'MODERATE',
          condition: null,
          parameters: ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1', 'ENGINE_LOAD'],
          measured: [
            {
              label: `Trim at ${CONDITION_LABELS[lowest.stat.condition].toLowerCase()}`,
              value: round(lowest.stat.mean),
              unit: '%',
            },
            {
              label: `Trim at ${CONDITION_LABELS[highest.stat.condition].toLowerCase()}`,
              value: round(highest.stat.mean),
              unit: '%',
            },
            { label: 'Spread', value: round(spread), unit: 'points' },
          ],
        }),
      );
    } else if (Math.abs(lowest.stat.mean) >= TRIM_NOTABLE) {
      // Equally important: a correction that does *not* change with airflow.
      found.push(
        evidence({
          id: 'trim-airflow-independent',
          kind: 'TREND',
          summary: `Fuel trim stays within ${Math.abs(spread).toFixed(1)} points across the airflow range observed.`,
          detail:
            'A correction of roughly the same size at every airflow indicates a proportional error — the measurement or the delivery is off by a percentage rather than by a fixed quantity.',
          strength: 'MODERATE',
          condition: null,
          parameters: ['SHORT_FUEL_TRIM_1', 'LONG_FUEL_TRIM_1'],
          measured: [{ label: 'Spread', value: round(spread), unit: 'points' }],
        }),
      );
    }
  }

  return found;
}

/**
 * Compares reported airflow against what the engine must physically be
 * drawing, from speed, manifold pressure, intake temperature and swept
 * volume — the "speed-density" estimate an ECU uses as a cross-check.
 *
 * Needs the engine's displacement. Without it the check cannot run at all,
 * and saying so is the honest outcome; assuming a displacement would produce
 * a confident comparison against a number nobody supplied.
 */
export function analyseAirflowPlausibility(
  samples: readonly AlignedSample[],
  displacementCc: number | null,
): { evidence: Evidence[]; limitation: string | null } {
  if (displacementCc === null) {
    return {
      evidence: [],
      limitation:
        'Airflow could not be cross-checked against manifold pressure because the engine displacement is not recorded for this vehicle.',
    };
  }

  const usable = samples.filter(
    (s) =>
      isClosedLoopCondition(s.condition) &&
      s.values.has('MAF_RATE') &&
      s.values.has('INTAKE_MAP') &&
      s.values.has('ENGINE_RPM'),
  );

  if (usable.length < 10) {
    return {
      evidence: [],
      limitation:
        'Not enough samples with airflow, manifold pressure and engine speed together to cross-check the airflow sensor.',
    };
  }

  // Volumetric efficiency is not measurable here, so a generous band is used
  // rather than a point estimate. Only a reading outside the whole band is
  // reported, which keeps the check conservative.
  const VE_LOW = 0.6;
  const VE_HIGH = 1.0;
  const R_AIR = 287;

  let reportedSum = 0;
  let lowSum = 0;
  let highSum = 0;

  for (const sample of usable) {
    const rpm = sample.values.get('ENGINE_RPM')!;
    const mapKpa = sample.values.get('INTAKE_MAP')!;
    const iat = sample.values.get('INTAKE_AIR_TEMP') ?? 30;
    const density = (mapKpa * 1000) / (R_AIR * (iat + 273.15));
    const sweptPerSecond = (displacementCc / 1e6) * (rpm / 120);

    reportedSum += sample.values.get('MAF_RATE')!;
    lowSum += VE_LOW * sweptPerSecond * density * 1000;
    highSum += VE_HIGH * sweptPerSecond * density * 1000;
  }

  const reported = reportedSum / usable.length;
  const low = lowSum / usable.length;
  const high = highSum / usable.length;

  if (reported >= low && reported <= high) {
    return {
      evidence: [
        evidence({
          id: 'airflow-plausible',
          kind: 'ABSENCE',
          summary: `Reported airflow of ${reported.toFixed(2)} g/s agrees with the ${low.toFixed(2)}–${high.toFixed(2)} g/s the engine should be drawing.`,
          detail:
            'Estimated from engine speed, manifold pressure, intake temperature and swept volume across ' +
            `${usable.length} samples, using a volumetric efficiency band of ${VE_LOW}–${VE_HIGH}. ` +
            'An airflow sensor reading outside this band would be misreporting; this one is not.',
          strength: 'MODERATE',
          condition: null,
          parameters: ['MAF_RATE', 'INTAKE_MAP', 'ENGINE_RPM', 'INTAKE_AIR_TEMP'],
          measured: [
            { label: 'Reported airflow', value: round(reported, 2), unit: 'g/s' },
            { label: 'Expected range low', value: round(low, 2), unit: 'g/s' },
            { label: 'Expected range high', value: round(high, 2), unit: 'g/s' },
          ],
        }),
      ],
      limitation: null,
    };
  }

  const below = reported < low;
  const deviation = below ? ((low - reported) / low) * 100 : ((reported - high) / high) * 100;

  return {
    evidence: [
      evidence({
        id: below ? 'airflow-under-reported' : 'airflow-over-reported',
        kind: 'SENSOR_RELATIONSHIP',
        summary: below
          ? `Reported airflow of ${reported.toFixed(2)} g/s is ${deviation.toFixed(0)}% below the ${low.toFixed(2)} g/s minimum the engine should be drawing.`
          : `Reported airflow of ${reported.toFixed(2)} g/s exceeds the ${high.toFixed(2)} g/s maximum the engine should be drawing.`,
        detail:
          'Estimated from engine speed, manifold pressure, intake temperature and swept volume across ' +
          `${usable.length} samples, using a deliberately wide volumetric efficiency band of ${VE_LOW}–${VE_HIGH}. ` +
          'Falling outside that band means the airflow signal and the manifold conditions disagree about how much air is moving.',
        strength: deviation >= 20 ? 'STRONG' : 'MODERATE',
        condition: null,
        parameters: ['MAF_RATE', 'INTAKE_MAP', 'ENGINE_RPM', 'INTAKE_AIR_TEMP'],
        measured: [
          { label: 'Reported airflow', value: round(reported, 2), unit: 'g/s' },
          { label: below ? 'Expected minimum' : 'Expected maximum', value: round(below ? low : high, 2), unit: 'g/s' },
          { label: 'Deviation', value: round(deviation), unit: '%' },
        ],
      }),
    ],
    limitation: null,
  };
}

/** Fuel rail pressure, which separates a supply fault from a delivery fault. */
export function analyseFuelPressure(samples: readonly AlignedSample[]): Evidence[] {
  const stats = statsByCondition(samples, 'FUEL_PRESSURE');
  if (stats.length === 0) return [];

  const overall = stats.reduce((sum, s) => sum + s.mean * s.samples, 0) /
    stats.reduce((sum, s) => sum + s.samples, 0);

  // Port injection systems typically hold 300–400 kPa. Below 300 the supply
  // itself is suspect rather than the injectors.
  const LOW_THRESHOLD = 300;

  if (overall >= LOW_THRESHOLD) {
    return [
      evidence({
        id: 'fuel-pressure-normal',
        kind: 'ABSENCE',
        summary: `Fuel rail pressure averaged ${overall.toFixed(0)} kPa, within the normal range.`,
        detail:
          `Port injection systems typically hold 300–400 kPa. Pressure at or above ${LOW_THRESHOLD} kPa means ` +
          'the supply side is delivering, so a mixture error is not explained by rail pressure.',
        strength: 'MODERATE',
        condition: null,
        parameters: ['FUEL_PRESSURE'],
        measured: [{ label: 'Mean rail pressure', value: round(overall), unit: 'kPa' }],
      }),
    ];
  }

  return [
    evidence({
      id: 'fuel-pressure-low',
      kind: 'SENSOR_VALUE',
      summary: `Fuel rail pressure averaged ${overall.toFixed(0)} kPa, below the ${LOW_THRESHOLD} kPa expected minimum.`,
      detail:
        'Port injection systems typically hold 300–400 kPa. Pressure below that means less fuel is delivered ' +
        'for a given injector opening, so the supply side is implicated rather than the injectors themselves.',
      strength: overall < 250 ? 'STRONG' : 'MODERATE',
      condition: null,
      parameters: ['FUEL_PRESSURE'],
      measured: [
        { label: 'Mean rail pressure', value: round(overall), unit: 'kPa' },
        { label: 'Expected minimum', value: LOW_THRESHOLD, unit: 'kPa' },
      ],
    }),
  ];
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
