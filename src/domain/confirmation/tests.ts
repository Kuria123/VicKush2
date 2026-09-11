import type { TestOutcome } from './outcomes';

/**
 * The confirmation test catalogue.
 *
 * A confirmation test is a *deliberate observation* made to separate causes
 * the passive scan could not. Stage 10 says what would settle the question;
 * this stage makes that question performable, records the answer, and feeds
 * it back into the ranking.
 *
 * Every test in here is an observation. None involves fitting a component to
 * see whether the symptom goes away — that is parts-swapping, it is what a
 * differential exists to avoid, and it would be a parts recommendation by
 * another name (Rule 9).
 *
 * The decision tree the spec describes is not stored as a tree. It is
 * produced by asking, after each result, which remaining test separates the
 * most causes still in contention. A stored tree would have to enumerate
 * every path in advance and would go stale the moment a cause is added; the
 * lazy form gives the same sequence from one rule. The example path in the
 * spec — trim high at idle, raise the engine speed, see whether it falls —
 * is exactly what that rule produces from `trim-response-to-airflow`.
 */

export interface TestImplication {
  outcome: TestOutcome;
  causeId: string;
  /** Whether this outcome argues for the cause or excludes it outright. */
  effect: 'SUPPORTS' | 'EXCLUDES';
  /**
   * Points added on `SUPPORTS`, on the same 0–100 scale the differential
   * uses. Ignored for `EXCLUDES`, which is not a matter of degree.
   */
  weight: number;
  reason: string;
}

export interface ConfirmationTest {
  id: string;
  title: string;
  /** The question the test answers, stated before it is performed. */
  question: string;
  /** How to perform it. Observation steps only. */
  procedure: readonly string[];
  /** The criterion, where the outcome is a pass/fail against one. */
  criterion?: string;
  /** Stated wherever the procedure carries real risk. */
  safety?: string;
  /** Causes this test bears on, used to decide when it is worth offering. */
  addresses: readonly string[];
  implications: readonly TestImplication[];
}

export const CONFIRMATION_TESTS: readonly ConfirmationTest[] = [
  {
    id: 'trim-response-to-airflow',
    title: 'Fuel trim response to raised engine speed',
    question:
      'Does the fuel correction shrink as airflow rises, or does it stay the same size?',
    procedure: [
      'With the engine at operating temperature, let it idle and record combined short and long term fuel trim for at least thirty seconds.',
      'Raise and hold engine speed at roughly 2500 rpm until the trims settle, then record them again for at least thirty seconds.',
      'Compare the two averages.',
    ],
    criterion:
      'Pass if combined trim falls by at least 8 percentage points between idle and the raised speed.',
    addresses: ['unmetered-air', 'airflow-under-reading', 'fuel-delivery-shortfall'],
    implications: [
      {
        outcome: 'PASS',
        causeId: 'unmetered-air',
        effect: 'SUPPORTS',
        weight: 45,
        reason:
          'A correction that shrinks as airflow rises is what a fixed opening does: the same mass of unmetered air is a large share of a small flow and a small share of a large one.',
      },
      {
        outcome: 'PASS',
        causeId: 'airflow-under-reading',
        effect: 'EXCLUDES',
        weight: 0,
        reason:
          'A signal reading low by a percentage needs the same correction at every airflow. A correction that fell cannot be explained by one.',
      },
      {
        outcome: 'PASS',
        causeId: 'fuel-delivery-shortfall',
        effect: 'EXCLUDES',
        weight: 0,
        reason:
          'A proportional shortfall in delivery needs the same correction at every airflow, so it cannot produce a correction that falls.',
      },
      {
        outcome: 'FAIL',
        causeId: 'unmetered-air',
        effect: 'EXCLUDES',
        weight: 0,
        reason:
          'The correction held its size as airflow rose. A fixed opening cannot do that — its share of the total must fall.',
      },
      {
        outcome: 'FAIL',
        causeId: 'airflow-under-reading',
        effect: 'SUPPORTS',
        weight: 25,
        reason:
          'A correction of the same size at every airflow is the signature of a proportional error, which a sensor reading low by a percentage produces.',
      },
      {
        outcome: 'FAIL',
        causeId: 'fuel-delivery-shortfall',
        effect: 'SUPPORTS',
        weight: 25,
        reason:
          'A correction of the same size at every airflow is consistent with fuel being short by a proportion rather than a fixed amount.',
      },
    ],
  },

  {
    id: 'rail-pressure-running',
    title: 'Fuel rail pressure with the engine running',
    question: 'Is the supply side holding the pressure the injectors are calculated against?',
    procedure: [
      'Read fuel rail pressure with the engine idling at operating temperature.',
      'Raise engine speed to roughly 2500 rpm and read it again, so the supply is tested under a higher demand.',
      'Compare both readings against the specification for this vehicle.',
    ],
    criterion: 'Normal if pressure holds at or above the specified minimum at both speeds.',
    safety:
      'The fuel rail is pressurised and petrol vapour ignites readily. Use the vehicle data stream rather than opening the rail wherever the reading is available over OBD.',
    addresses: ['fuel-supply-pressure', 'fuel-delivery-shortfall'],
    implications: [
      {
        outcome: 'ABNORMAL',
        causeId: 'fuel-supply-pressure',
        effect: 'SUPPORTS',
        weight: 55,
        reason:
          'Pressure below specification means each injector opening passes less fuel than the ECU calculated, which produces the lean mixture directly.',
      },
      {
        outcome: 'ABNORMAL',
        causeId: 'fuel-delivery-shortfall',
        effect: 'EXCLUDES',
        weight: 0,
        reason:
          'The shortfall is accounted for upstream of the injectors, so a separate delivery fault is not needed to explain it.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'fuel-supply-pressure',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'The supply held specification under demand, so it is delivering as intended.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'fuel-delivery-shortfall',
        effect: 'SUPPORTS',
        weight: 35,
        reason:
          'The fuel is available at pressure and the mixture is still lean, which places the shortfall after the rail.',
      },
    ],
  },

  {
    id: 'airflow-against-calculated',
    title: 'Reported airflow against calculated airflow',
    question: 'Does the airflow signal agree with the air the engine must physically be drawing?',
    procedure: [
      'Record airflow, manifold absolute pressure, engine speed and intake air temperature together at idle.',
      'Repeat at a raised, steady engine speed.',
      'Compare reported airflow against the figure calculated from engine speed, manifold pressure, intake temperature and swept volume.',
    ],
    criterion:
      'Normal if reported airflow falls inside the calculated range at both speeds.',
    addresses: ['airflow-under-reading', 'airflow-over-reading', 'fuel-delivery-shortfall'],
    implications: [
      {
        outcome: 'ABNORMAL',
        causeId: 'airflow-under-reading',
        effect: 'SUPPORTS',
        weight: 50,
        reason:
          'The two measurements disagree about how much air is moving, and the airflow signal is the one out of step with physical conditions.',
      },
      {
        outcome: 'ABNORMAL',
        causeId: 'airflow-over-reading',
        effect: 'SUPPORTS',
        weight: 60,
        reason:
          'Reported airflow exceeds what the engine can draw at that speed and manifold pressure, so the signal is overstating flow.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'airflow-under-reading',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'The signal matched calculated airflow, so it is not reading low.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'airflow-over-reading',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'The signal matched calculated airflow, so it is not reading high.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'fuel-delivery-shortfall',
        effect: 'SUPPORTS',
        weight: 30,
        reason:
          'The air figure the ECU fuelled against was correct, and the mixture was still lean, so the fuel side is implicated.',
      },
    ],
  },

  {
    id: 'idle-roughness-above-idle',
    title: 'Whether the unsteadiness persists above idle',
    question:
      'Does the engine speed variation continue when the engine is held above idle, or does it settle?',
    procedure: [
      'Record engine speed at idle for at least thirty seconds and note how far it varies.',
      'Hold engine speed at roughly 2000 rpm and record it for the same period.',
      'Compare the variation at the two speeds.',
    ],
    criterion: 'Pass if the variation persists at the raised speed rather than settling.',
    addresses: ['incomplete-combustion', 'unmetered-air'],
    implications: [
      {
        outcome: 'PASS',
        causeId: 'incomplete-combustion',
        effect: 'SUPPORTS',
        weight: 55,
        reason:
          'A cylinder that is not contributing at idle is not contributing at speed either, so the unevenness travels with engine speed.',
      },
      {
        outcome: 'FAIL',
        causeId: 'incomplete-combustion',
        effect: 'EXCLUDES',
        weight: 0,
        reason:
          'The engine settled once airflow rose. Uneven combustion does not resolve with engine speed; something proportional to airflow does.',
      },
      {
        outcome: 'FAIL',
        causeId: 'unmetered-air',
        effect: 'SUPPORTS',
        weight: 10,
        reason:
          'Unmetered air is the largest share of total flow at idle and fades as airflow rises, so the idle controller regains authority at speed.',
      },
    ],
  },

  {
    id: 'charging-voltage-under-load',
    title: 'System voltage with the engine running and load applied',
    question: 'Is the charging system supplying the vehicle, or is the battery carrying it alone?',
    procedure: [
      'With the engine idling at operating temperature, record system voltage.',
      'Switch on headlights, blower and rear demister, and record it again after thirty seconds.',
      'Raise engine speed to roughly 2000 rpm with the load still applied and record it once more.',
    ],
    criterion:
      'Normal if voltage stays within the charging range under load rather than falling towards battery rest voltage.',
    addresses: ['charging-not-supplying', 'charging-regulation-high'],
    implications: [
      {
        outcome: 'ABNORMAL',
        causeId: 'charging-not-supplying',
        effect: 'SUPPORTS',
        weight: 65,
        reason:
          'Voltage falling towards rest voltage under load means nothing is replacing what the vehicle is drawing.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'charging-not-supplying',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'The charging system held its range under load, so it is supplying the vehicle.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'charging-regulation-high',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'Voltage stayed inside the normal range rather than above it.',
      },
    ],
  },

  {
    id: 'warmup-temperature-profile',
    title: 'Coolant temperature through a full warm-up',
    question:
      'Does coolant temperature reach its regulated band and hold there, or miss it in one direction?',
    procedure: [
      'Start the engine from cold and record coolant temperature continuously.',
      'Let it idle until the temperature stops rising, then hold it there for a further five minutes.',
      'Note the temperature it settles at and whether it continues to climb.',
    ],
    criterion:
      'Normal if the temperature reaches the regulated band and holds, neither continuing to climb nor settling below it.',
    safety:
      'Do not open the cooling system while it is hot or pressurised. This test is an observation of the data stream only.',
    addresses: ['heat-rejection-loss', 'coolant-not-regulated-up'],
    implications: [
      {
        outcome: 'ABNORMAL',
        causeId: 'heat-rejection-loss',
        effect: 'SUPPORTS',
        weight: 70,
        reason:
          'Temperature that keeps climbing past the regulated band means heat is arriving faster than it is being rejected.',
      },
      {
        outcome: 'ABNORMAL',
        causeId: 'coolant-not-regulated-up',
        effect: 'SUPPORTS',
        weight: 70,
        reason:
          'Temperature that settles below the regulated band means coolant is circulating before the engine has warmed.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'heat-rejection-loss',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'The system reached and held its regulated temperature, so it is rejecting heat adequately.',
      },
      {
        outcome: 'NORMAL',
        causeId: 'coolant-not-regulated-up',
        effect: 'EXCLUDES',
        weight: 0,
        reason: 'The engine reached its regulated temperature, so coolant is being held back until it does.',
      },
    ],
  },
];

export function getTest(id: string): ConfirmationTest | undefined {
  return CONFIRMATION_TESTS.find((t) => t.id === id);
}
