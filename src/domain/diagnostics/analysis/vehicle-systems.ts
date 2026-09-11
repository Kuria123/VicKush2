import { parseDtc, describeDtcStructure, type DiagnosticTroubleCode } from '../../telemetry';
import { evidence, type Evidence } from '../evidence';

import { meanOf, statsByCondition, type AlignedSample } from './aligned-samples';

/** Cooling, electrical, stability and fault-code observations. */

export function analyseThermal(samples: readonly AlignedSample[]): Evidence[] {
  const found: Evidence[] = [];
  const mean = meanOf(samples, 'COOLANT_TEMP');
  if (mean === null) return found;

  const stats = statsByCondition(samples, 'COOLANT_TEMP');
  const peak = stats.length > 0 ? Math.max(...stats.map((s) => s.max)) : mean;

  if (peak > 110) {
    found.push(
      evidence({
        id: 'coolant-high',
        kind: 'SENSOR_VALUE',
        summary: `Coolant temperature reached ${peak.toFixed(0)} °C, above the 110 °C ceiling for normal operation.`,
        detail:
          'A healthy cooling system holds 85–100 °C once warm. Sustained operation above 110 °C risks damage, ' +
          'and the margin to boiling is small.',
        strength: peak > 118 ? 'STRONG' : 'MODERATE',
        condition: null,
        parameters: ['COOLANT_TEMP'],
        measured: [
          { label: 'Peak coolant', value: round(peak), unit: '°C' },
          { label: 'Mean coolant', value: round(mean), unit: '°C' },
        ],
      }),
    );
  } else if (mean < 70) {
    found.push(
      evidence({
        id: 'coolant-low',
        kind: 'SENSOR_VALUE',
        summary: `Coolant temperature averaged ${mean.toFixed(0)} °C, below the 70 °C an engine at temperature should hold.`,
        detail:
          'An engine that will not reach operating temperature runs rich, wears faster and produces no cabin heat. ' +
          'Note that a short session from a cold start can produce this reading legitimately.',
        strength: 'MODERATE',
        condition: null,
        parameters: ['COOLANT_TEMP'],
        measured: [{ label: 'Mean coolant', value: round(mean), unit: '°C' }],
      }),
    );
  } else {
    found.push(
      evidence({
        id: 'coolant-normal',
        kind: 'ABSENCE',
        summary: `Coolant temperature averaged ${mean.toFixed(0)} °C, within the normal range.`,
        detail: 'A healthy engine holds 85–100 °C once warm. Nothing here implicates the cooling system.',
        strength: 'MODERATE',
        condition: null,
        parameters: ['COOLANT_TEMP'],
        measured: [{ label: 'Mean coolant', value: round(mean), unit: '°C' }],
      }),
    );
  }

  return found;
}

export function analyseElectrical(samples: readonly AlignedSample[]): Evidence[] {
  const running = samples.filter((s) => (s.values.get('ENGINE_RPM') ?? 0) > 400);
  const mean = meanOf(running, 'CONTROL_MODULE_VOLTAGE');
  if (mean === null) return [];

  // A working alternator holds roughly 13.5–14.8 V with the engine running.
  if (mean < 13) {
    return [
      evidence({
        id: 'system-voltage-low',
        kind: 'SENSOR_VALUE',
        summary: `System voltage averaged ${mean.toFixed(2)} V with the engine running, below the 13.5 V a charging system should hold.`,
        detail:
          mean < 12.6
            ? 'Below the resting voltage of a charged battery, which means the battery is supplying the vehicle rather than being charged.'
            : 'Low enough to suggest the charging system is not keeping up, though a heavily discharged battery can pull the voltage down while it recovers.',
        strength: mean < 12.6 ? 'STRONG' : 'MODERATE',
        condition: null,
        parameters: ['CONTROL_MODULE_VOLTAGE'],
        measured: [
          { label: 'Mean voltage, running', value: round(mean, 2), unit: 'V' },
          { label: 'Expected minimum', value: 13.5, unit: 'V' },
        ],
      }),
    ];
  }

  if (mean > 15.2) {
    return [
      evidence({
        id: 'system-voltage-high',
        kind: 'SENSOR_VALUE',
        summary: `System voltage averaged ${mean.toFixed(2)} V, above the 15.2 V ceiling.`,
        detail: 'Sustained overvoltage boils electrolyte and shortens the life of every electronic module.',
        strength: 'MODERATE',
        condition: null,
        parameters: ['CONTROL_MODULE_VOLTAGE'],
        measured: [{ label: 'Mean voltage, running', value: round(mean, 2), unit: 'V' }],
      }),
    ];
  }

  return [
    evidence({
      id: 'system-voltage-normal',
      kind: 'ABSENCE',
      summary: `System voltage averaged ${mean.toFixed(2)} V with the engine running, within the normal charging range.`,
      detail:
        'A working charging system holds roughly 13.5–14.8 V. This reading does not implicate the alternator, ' +
        'though it says nothing about the battery’s ability to hold charge when the engine is off.',
      strength: 'MODERATE',
      condition: null,
      parameters: ['CONTROL_MODULE_VOLTAGE'],
      measured: [{ label: 'Mean voltage, running', value: round(mean, 2), unit: 'V' }],
    }),
  ];
}

/**
 * Idle stability, from the spread of engine speed.
 *
 * This is NOT a misfire count — that needs Mode 06, which this build does not
 * read. It is an observation about how steadily the engine holds idle, which
 * is disturbed by a misfire, an unmetered air leak fighting the idle
 * controller, and several other things. Stated as what it is.
 */
export function analyseIdleStability(samples: readonly AlignedSample[]): Evidence[] {
  const idle = samples.filter((s) => s.condition === 'IDLE' && s.values.has('ENGINE_RPM'));
  if (idle.length < 20) return [];

  const values = idle.map((s) => s.values.get('ENGINE_RPM')!);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  const spread = Math.max(...values) - Math.min(...values);

  // A healthy idle holds within roughly ±25 rpm.
  if (deviation < 25) {
    return [
      evidence({
        id: 'idle-stable',
        kind: 'ABSENCE',
        summary: `Idle speed held steady, varying by ${deviation.toFixed(0)} rpm about a mean of ${mean.toFixed(0)} rpm.`,
        detail:
          `Standard deviation across ${idle.length} idle samples, with a total spread of ${spread.toFixed(0)} rpm. ` +
          'A healthy idle stays within about 25 rpm. Steady idle argues against a misfire or a significant induction leak.',
        strength: 'MODERATE',
        condition: 'IDLE',
        parameters: ['ENGINE_RPM'],
        measured: [
          { label: 'Idle variation', value: round(deviation), unit: 'rpm' },
          { label: 'Mean idle speed', value: round(mean), unit: 'rpm' },
        ],
      }),
    ];
  }

  return [
    evidence({
      id: 'idle-unstable',
      kind: 'SENSOR_VALUE',
      summary: `Idle speed varied by ${deviation.toFixed(0)} rpm about a mean of ${mean.toFixed(0)} rpm, more than a steady idle should.`,
      detail:
        `Standard deviation across ${idle.length} idle samples, with a total spread of ${spread.toFixed(0)} rpm. ` +
        'A healthy idle stays within about 25 rpm. This is a measure of how steadily the engine runs, not a misfire ' +
        'count — misfire counters need Mode 06, which this build does not read.',
      strength: deviation > 60 ? 'STRONG' : 'MODERATE',
      condition: 'IDLE',
      parameters: ['ENGINE_RPM'],
      measured: [
        { label: 'Idle variation', value: round(deviation), unit: 'rpm' },
        { label: 'Total spread', value: round(spread), unit: 'rpm' },
      ],
    }),
  ];
}

/** Turns reported fault codes into evidence, without claiming what they mean. */
export function analyseDtcs(dtcs: readonly DiagnosticTroubleCode[]): Evidence[] {
  return dtcs.map((dtc) => {
    const structure = parseDtc(dtc.code);
    const stored = dtc.status === 'STORED';

    return evidence({
      id: `dtc-${dtc.code}`,
      kind: 'DTC',
      summary: `${dtc.code} is ${stored ? 'stored' : dtc.status.toLowerCase()}${
        structure ? ` (${describeDtcStructure(structure)})` : ''
      }.`,
      detail: dtc.description
        ? dtc.description
        : 'Only the code and what its structure encodes are known. This build has no authoritative fault ' +
          'table, so no meaning is attached to the code itself — the readings are what the diagnosis rests on.',
      // A stored code has already survived the ECU's own debounce; a pending
      // one has not, so it carries less weight.
      strength: stored ? 'STRONG' : 'MODERATE',
      condition: null,
      parameters: [],
      measured: [],
    });
  });
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
