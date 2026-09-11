import type { FindingSystem } from '../diagnostics';

/**
 * The candidate cause catalogue.
 *
 * Stage 9 stops at findings — "a lean condition is present". This stage asks
 * the next question: *what could produce that?* A lean condition has at least
 * four plausible causes, and the honest answer is usually more than one of
 * them.
 *
 * Two rules shape everything here:
 *
 * 1. **A cause is a mechanism, not a part.** "Air entering downstream of the
 *    airflow sensor" is a cause. "Replace the intake manifold gasket" is a
 *    parts recommendation, and the project forbids making one from a scan
 *    alone (Rule 9). Each cause therefore describes a physical situation and
 *    names the *observations* that would confirm it, never a component to buy.
 *
 * 2. **Causes are matched on measurements, not on fault codes.** This build
 *    parses DTC structure but has no authoritative table of DTC meanings, so
 *    inferring a mechanism from a code would fabricate that meaning (Rule 1).
 *    Codes corroborate that something is wrong; the readings say what.
 */

/** How an observation bears on a cause. */
export type ExpectationRole =
  /** Without this observation the cause is not on the table at all. */
  | 'REQUIRED'
  /** Its presence is consistent with the cause and adds weight. */
  | 'SUPPORTS'
  /** Its presence is incompatible with the cause and rules it out. */
  | 'CONTRADICTS';

export interface CauseExpectation {
  /** Matched against `Evidence.id` from the Stage 9 analysis. */
  pattern: RegExp;
  role: ExpectationRole;
  /**
   * Weight for a `SUPPORTS` match, on the same 0–100 scale the vehicle
   * identification score uses. Ignored for the other roles.
   */
  weight: number;
  /** Why this observation bears on this cause, shown to the user verbatim. */
  reason: string;
}

export interface CandidateCauseDefinition {
  id: string;
  /** A mechanism, phrased as one. Never a part name. */
  label: string;
  system: FindingSystem;
  /** What is physically happening, if this cause is the right one. */
  mechanism: string;
  expectations: readonly CauseExpectation[];
}

/* -------------------------------------------------------------------------
 * Lean mixture — the four-way differential this stage exists for
 * ---------------------------------------------------------------------- */

const LEAN_REQUIRED: CauseExpectation = {
  pattern: /^trim-level-/,
  role: 'REQUIRED',
  weight: 0,
  reason: 'The ECU is adding fuel, so the mixture it measures is lean.',
};

export const CAUSE_CATALOGUE: readonly CandidateCauseDefinition[] = [
  {
    id: 'unmetered-air',
    label: 'Air entering downstream of the airflow sensor',
    system: 'AIR',
    mechanism:
      'Air reaching the cylinders without passing the airflow sensor. The ECU fuels for the air it measured, so the real mixture is leaner than commanded and trim rises to compensate.',
    expectations: [
      LEAN_REQUIRED,
      {
        pattern: /^trim-airflow-dependence$/,
        role: 'SUPPORTS',
        weight: 45,
        reason:
          'The correction shrank as airflow rose. A fixed opening admits roughly the same mass of air whatever the engine is doing, so it is a large share of a small flow and a small share of a large one. No other lean cause behaves this way.',
      },
      {
        pattern: /^airflow-plausible$/,
        role: 'SUPPORTS',
        weight: 20,
        reason:
          'The airflow sensor agrees with manifold conditions, so the air it does measure is being measured correctly.',
      },
      {
        pattern: /^fuel-pressure-normal$/,
        role: 'SUPPORTS',
        weight: 15,
        reason: 'Rail pressure is normal, so the fuel side is delivering as asked.',
      },
      {
        pattern: /^idle-unstable$/,
        role: 'SUPPORTS',
        weight: 10,
        reason:
          'Unmetered air is worst at idle, where it is the largest share of total flow, and fights the idle controller.',
      },
      {
        pattern: /^trim-airflow-independent$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason:
          'The correction was the same size at every airflow. A fixed opening cannot do that — its effect must fade as airflow grows.',
      },
    ],
  },

  {
    id: 'airflow-under-reading',
    label: 'Airflow sensor reading lower than the air actually moving',
    system: 'AIR',
    mechanism:
      'The airflow signal under-states true flow, so the ECU fuels for less air than the engine is drawing and the mixture runs lean by a roughly constant percentage.',
    expectations: [
      LEAN_REQUIRED,
      {
        pattern: /^airflow-under-reported$/,
        role: 'SUPPORTS',
        weight: 50,
        reason:
          'Reported airflow fell below what engine speed, manifold pressure and swept volume say the engine must be drawing. The two measurements disagree, and the airflow signal is the one out of step.',
      },
      {
        pattern: /^trim-airflow-independent$/,
        role: 'SUPPORTS',
        weight: 25,
        reason:
          'A percentage error in the signal needs the same percentage correction at every airflow, which is what was seen.',
      },
      {
        pattern: /^fuel-pressure-normal$/,
        role: 'SUPPORTS',
        weight: 10,
        reason: 'Rail pressure is normal, so the fuel side is not the cause of the shortfall.',
      },
      {
        pattern: /^airflow-plausible$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason:
          'Reported airflow matched what the engine should be drawing, so the sensor is not under-reading.',
      },
    ],
  },

  {
    id: 'fuel-supply-pressure',
    label: 'Fuel supply not reaching pressure',
    system: 'FUEL',
    mechanism:
      'Rail pressure below specification. Each injector opening passes less fuel than the ECU calculated, so the mixture is lean across the range.',
    expectations: [
      LEAN_REQUIRED,
      {
        pattern: /^fuel-pressure-low$/,
        role: 'SUPPORTS',
        weight: 55,
        reason:
          'Measured rail pressure was below the expected minimum. This is the observation that separates a supply fault from an injector fault — nothing else distinguishes them.',
      },
      {
        pattern: /^trim-airflow-independent$/,
        role: 'SUPPORTS',
        weight: 20,
        reason:
          'Low pressure reduces delivery proportionally, so the correction needed does not change with airflow.',
      },
      {
        pattern: /^airflow-plausible$/,
        role: 'SUPPORTS',
        weight: 15,
        reason: 'The air side measures correctly, which places the shortfall on the fuel side.',
      },
      {
        pattern: /^fuel-pressure-normal$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason: 'Rail pressure was measured and is normal, so the supply is delivering.',
      },
    ],
  },

  {
    id: 'fuel-delivery-shortfall',
    label: 'Less fuel delivered than commanded, at normal supply pressure',
    system: 'FUEL',
    mechanism:
      'The injectors pass less fuel than the ECU calculated for the opening it commanded, while the rail itself is at pressure.',
    expectations: [
      LEAN_REQUIRED,
      {
        pattern: /^fuel-pressure-normal$/,
        role: 'SUPPORTS',
        weight: 35,
        reason:
          'The rail is at pressure, so the fuel is available. A lean mixture despite that places the shortfall after the rail.',
      },
      {
        pattern: /^airflow-plausible$/,
        role: 'SUPPORTS',
        weight: 30,
        reason:
          'The air side measures correctly, so the air figure the ECU fuelled against was right and the fuel was still short.',
      },
      {
        pattern: /^trim-airflow-independent$/,
        role: 'SUPPORTS',
        weight: 25,
        reason:
          'A proportional delivery shortfall needs the same correction at every airflow, which is what was seen.',
      },
      {
        pattern: /^fuel-pressure-low$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason:
          'Rail pressure is low, which explains the shortfall upstream of the injectors and makes this cause unnecessary.',
      },
      {
        pattern: /^airflow-under-reported$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason:
          'The airflow signal disagrees with manifold conditions, which explains the lean mixture without any fuel-side fault.',
      },
    ],
  },

  /* --- Rich mixture ---------------------------------------------------- */

  {
    id: 'excess-fuel-delivery',
    label: 'More fuel delivered than commanded',
    system: 'FUEL',
    mechanism:
      'Fuel reaching the cylinders in excess of what the ECU calculated, so trim pulls fuel back to hold the mixture.',
    expectations: [
      LEAN_REQUIRED,
      {
        pattern: /^airflow-plausible$/,
        role: 'SUPPORTS',
        weight: 35,
        reason:
          'The air side measures correctly, so the excess is on the fuel side rather than a mis-measured air figure.',
      },
      {
        pattern: /^trim-airflow-independent$/,
        role: 'SUPPORTS',
        weight: 25,
        reason: 'A proportional excess needs the same correction at every airflow.',
      },
      {
        pattern: /^airflow-over-reported$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason:
          'The airflow signal reads above what the engine can be drawing, which explains the rich mixture without any fuel-side fault.',
      },
    ],
  },

  {
    id: 'airflow-over-reading',
    label: 'Airflow sensor reading higher than the air actually moving',
    system: 'AIR',
    mechanism:
      'The airflow signal over-states true flow, so the ECU commands fuel for air that is not there and the mixture runs rich.',
    expectations: [
      LEAN_REQUIRED,
      {
        pattern: /^airflow-over-reported$/,
        role: 'SUPPORTS',
        weight: 60,
        reason:
          'Reported airflow exceeded what engine speed, manifold pressure and swept volume permit. The engine cannot physically be drawing that much.',
      },
      {
        pattern: /^trim-airflow-independent$/,
        role: 'SUPPORTS',
        weight: 20,
        reason: 'A percentage error in the signal needs the same correction at every airflow.',
      },
      {
        pattern: /^airflow-plausible$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason: 'Reported airflow matched what the engine should be drawing.',
      },
    ],
  },

  /* --- Combustion ------------------------------------------------------ */

  {
    id: 'incomplete-combustion',
    label: 'One or more cylinders not contributing evenly',
    system: 'IGNITION',
    mechanism:
      'Some combustion events produce little or no power, so crankshaft speed varies far more than the normal cycle-to-cycle variation.',
    expectations: [
      {
        pattern: /^idle-unstable$/,
        role: 'REQUIRED',
        weight: 55,
        reason:
          'Idle speed varied well beyond the few rpm a steady idle holds. That is a measure of how evenly the cylinders are contributing.',
      },
      {
        pattern: /^airflow-plausible$/,
        role: 'SUPPORTS',
        weight: 15,
        reason:
          'Airflow measures correctly, so the unsteady idle is not an induction leak fighting the idle controller.',
      },
      {
        pattern: /^fuel-pressure-normal$/,
        role: 'SUPPORTS',
        weight: 10,
        reason: 'Rail pressure is normal, so the whole engine is not simply being under-fuelled.',
      },
      {
        pattern: /^trim-airflow-dependence$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason:
          'Trim that falls as airflow rises indicates unmetered air, which disturbs idle on its own and explains the instability without uneven combustion.',
      },
    ],
  },

  /* --- Cooling --------------------------------------------------------- */

  {
    id: 'heat-rejection-loss',
    label: 'Cooling system not rejecting enough heat',
    system: 'COOLING',
    mechanism:
      'Heat is produced faster than the cooling system removes it, so coolant temperature climbs past its normal regulated band instead of holding there.',
    expectations: [
      {
        pattern: /^coolant-high$/,
        role: 'REQUIRED',
        weight: 70,
        reason: 'Coolant temperature rose above the band a healthy system regulates to.',
      },
      {
        pattern: /^coolant-low$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason: 'The engine failed to reach operating temperature, which is the opposite fault.',
      },
    ],
  },

  {
    id: 'coolant-not-regulated-up',
    label: 'Coolant circulating before the engine reaches temperature',
    system: 'COOLING',
    mechanism:
      'Coolant flows to the radiator continuously instead of being held back until the engine warms, so it never reaches its regulated operating temperature.',
    expectations: [
      {
        pattern: /^coolant-low$/,
        role: 'REQUIRED',
        weight: 70,
        reason:
          'Coolant temperature stayed below operating temperature for the whole session, having had time to reach it.',
      },
      {
        pattern: /^coolant-high$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason: 'The engine ran hot, which is the opposite fault.',
      },
    ],
  },

  /* --- Electrical ------------------------------------------------------ */

  {
    id: 'charging-not-supplying',
    label: 'Charging system not supplying the electrical load',
    system: 'ELECTRICAL',
    mechanism:
      'With the engine running, system voltage sits at or below battery rest voltage instead of the raised charging voltage, so the battery alone is carrying the load.',
    expectations: [
      {
        pattern: /^system-voltage-low$/,
        role: 'REQUIRED',
        weight: 65,
        reason:
          'System voltage with the engine running stayed below the charging range, so nothing is replacing what the vehicle is drawing.',
      },
      {
        pattern: /^system-voltage-normal$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason: 'Charging voltage was measured and is within the normal range.',
      },
    ],
  },

  {
    id: 'charging-regulation-high',
    label: 'Charging voltage regulated above its normal ceiling',
    system: 'ELECTRICAL',
    mechanism:
      'System voltage is held above the normal charging range, which over time damages the battery and anything else on the bus.',
    expectations: [
      {
        pattern: /^system-voltage-high$/,
        role: 'REQUIRED',
        weight: 65,
        reason: 'System voltage with the engine running exceeded the normal charging ceiling.',
      },
      {
        pattern: /^system-voltage-normal$/,
        role: 'CONTRADICTS',
        weight: 0,
        reason: 'Charging voltage was measured and is within the normal range.',
      },
    ],
  },
];

/**
 * Causes whose lean/rich requirement must be checked for direction.
 *
 * `LEAN_REQUIRED` matches any trim level, because the evidence id carries the
 * condition rather than the direction. The direction lives in the measured
 * value, so the ranker checks it against this map rather than the id.
 */
export const CAUSE_MIXTURE_DIRECTION: Record<string, 'LEAN' | 'RICH'> = {
  'unmetered-air': 'LEAN',
  'airflow-under-reading': 'LEAN',
  'fuel-supply-pressure': 'LEAN',
  'fuel-delivery-shortfall': 'LEAN',
  'excess-fuel-delivery': 'RICH',
  'airflow-over-reading': 'RICH',
};
