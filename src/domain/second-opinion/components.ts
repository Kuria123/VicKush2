import type { RecognisedClaim } from './types';

/**
 * The component vocabulary a recommendation is matched against.
 *
 * Matching is deliberately narrow. A recommendation this build cannot place is
 * reported as unrecognised rather than guessed at, because assessing the wrong
 * component would be worse than declining to assess — a confident answer about
 * something the user did not ask about is the most damaging output this
 * feature could produce.
 *
 * The `assessable: false` entries carry the weight here. This build reads
 * nothing that bears on brakes or suspension, so no scan can ever contradict a
 * recommendation about either. Those entries exist precisely so the engine
 * returns "insufficient evidence" rather than falling through to silence,
 * which a reader would take as disagreement.
 */

interface ComponentEntry {
  /** Matched case-insensitively as whole words. */
  patterns: readonly RegExp[];
  component: string;
  system: RecognisedClaim['system'];
  relatedCauseIds: readonly string[];
  assessable: boolean;
}

const ENTRIES: readonly ComponentEntry[] = [
  /* --- Air ------------------------------------------------------------ */
  {
    patterns: [
      /\bmass ?air ?flow\b/i,
      /\bmaf\b/i,
      /\bair ?flow (sensor|meter)\b/i,
    ],
    component: 'the airflow sensor',
    system: 'ENGINE',
    relatedCauseIds: ['airflow-under-reading', 'airflow-over-reading'],
    assessable: true,
  },
  {
    patterns: [
      /\bintake (hose|pipe|boot|manifold)\b/i,
      /\bvacuum (hose|line|leak)\b/i,
      /\b(inlet|intake) gasket\b/i,
      /\bmanifold gasket\b/i,
    ],
    component: 'the intake tract or its gaskets',
    system: 'ENGINE',
    relatedCauseIds: ['unmetered-air'],
    assessable: true,
  },

  /* --- Fuel ----------------------------------------------------------- */
  {
    patterns: [/\binjector/i],
    component: 'one or more fuel injectors',
    system: 'FUEL',
    relatedCauseIds: ['fuel-delivery-shortfall'],
    assessable: true,
  },
  {
    patterns: [/\bfuel pump\b/i, /\bfuel filter\b/i, /\bfuel pressure regulator\b/i],
    component: 'the fuel supply — pump, filter or regulator',
    system: 'FUEL',
    relatedCauseIds: ['fuel-supply-pressure'],
    assessable: true,
  },
  {
    patterns: [/\b(o2|oxygen|lambda) sensor\b/i],
    component: 'an oxygen sensor',
    system: 'FUEL',
    relatedCauseIds: [],
    assessable: true,
  },

  /* --- Ignition ------------------------------------------------------- */
  {
    patterns: [/\bspark ?plugs?\b/i, /\bignition coils?\b/i, /\bcoil pack\b/i, /\bht leads?\b/i],
    component: 'ignition components — plugs, coils or leads',
    system: 'ENGINE',
    relatedCauseIds: ['incomplete-combustion'],
    assessable: true,
  },

  /* --- Cooling -------------------------------------------------------- */
  {
    patterns: [/\bthermostat\b/i, /\bradiator\b/i, /\bwater pump\b/i, /\bcooling fan\b/i],
    component: 'a cooling system component',
    system: 'COOLING',
    relatedCauseIds: ['heat-rejection-loss', 'coolant-not-regulated-up'],
    assessable: true,
  },

  /* --- Electrical ----------------------------------------------------- */
  {
    patterns: [/\balternator\b/i, /\bbattery\b/i, /\bdrive belt\b/i, /\bauxiliary belt\b/i],
    component: 'the charging system — battery, alternator or drive belt',
    system: 'ELECTRICAL',
    relatedCauseIds: ['charging-not-supplying', 'charging-regulation-high'],
    assessable: true,
  },

  /* --- Transmission --------------------------------------------------- */
  {
    patterns: [/\bclutch\b/i, /\bgearbox\b/i, /\btransmission\b/i, /\btorque converter\b/i],
    component: 'the transmission',
    system: 'TRANSMISSION',
    relatedCauseIds: [],
    assessable: true,
  },

  /* --- Nothing here is readable by this build ------------------------- */
  {
    patterns: [
      /\bbrakes?\b/i,
      /\bbrake (pads?|discs?|rotors?|calipers?|shoes?|fluid|lines?)\b/i,
      /\bpads? and discs?\b/i,
      /\bhandbrake\b/i,
      /\babs\b/i,
    ],
    component: 'the braking system',
    system: 'BRAKING',
    relatedCauseIds: [],
    // OBD-II Mode 01 carries no brake data and no ABS module is read.
    assessable: false,
  },
  {
    patterns: [
      /\bsuspension\b/i,
      /\bshock absorbers?\b/i,
      /\bstruts?\b/i,
      /\bbushe?s\b/i,
      /\bsprings?\b/i,
      /\bwishbones?\b/i,
      /\bcontrol arms?\b/i,
      /\btrack rod\b/i,
      /\bwheel bearings?\b/i,
    ],
    component: 'the suspension or steering',
    system: 'SUSPENSION',
    relatedCauseIds: [],
    assessable: false,
  },
  {
    patterns: [/\btyres?\b/i, /\btires?\b/i, /\bexhaust\b/i, /\bcatalytic converter\b/i, /\bcat\b/i],
    component: 'a component outside what this build reads',
    system: 'ENGINE',
    relatedCauseIds: [],
    assessable: false,
  },
];

/**
 * Identifies what a recommendation is about, or returns null.
 *
 * The first match wins, and entries are ordered so the specific precede the
 * general. Returning null is a normal outcome, not a failure: a recommendation
 * about something this vocabulary does not cover should be declined rather
 * than approximated.
 */
export function recogniseClaim(recommendation: string): RecognisedClaim | null {
  for (const entry of ENTRIES) {
    for (const pattern of entry.patterns) {
      const match = recommendation.match(pattern);
      if (!match) continue;

      return {
        matchedText: match[0],
        component: entry.component,
        system: entry.system,
        relatedCauseIds: entry.relatedCauseIds,
        assessable: entry.assessable,
      };
    }
  }

  return null;
}
