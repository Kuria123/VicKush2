import { unknownSpec, type RepairGuide } from './types';

/**
 * The repair guide catalogue.
 *
 * Authored structured data. Nothing here is generated, and an AI layer may
 * explain a guide but may not write one — a generated procedure could not be
 * validated against anything, and "do not allow generic AI-generated
 * instructions to bypass safety checks" has no meaning if the instructions are
 * produced at request time.
 *
 * Every guide is a **generic procedure**, and says so. Torque figures, fluid
 * capacities, part numbers and labour times are vehicle-specific and need
 * authoritative service data this project does not have. Those fields carry
 * the reason they are unknown rather than a plausible number.
 *
 * The catalogue is deliberately small. A guide exists only for a cause the
 * product can actually confirm, because an unconfirmable cause can never reach
 * one (see `eligibility.ts`). Padding it with procedures nobody can unlock
 * would be shelf-filling.
 */

const NO_SERVICE_DATA =
  'Authoritative service data for this specific vehicle. This build has no manufacturer service database.';

const NO_LABOUR_DATA =
  'Published labour times for this vehicle, which vary by engine and market.';

export const REPAIR_GUIDES: readonly RepairGuide[] = [
  {
    id: 'locate-unmetered-air',
    causeId: 'unmetered-air',
    problem:
      'Air is reaching the cylinders without passing the airflow sensor, so the ECU fuels for less air than the engine is drawing.',
    vehicleApplicability:
      'Generic procedure for a naturally aspirated petrol engine with a mass-airflow sensor. It is not specific to your vehicle: routing, fastener types and component locations differ, and this build has no service data for yours.',
    system: 'Air intake',
    component:
      'The intake tract between the airflow sensor and the cylinder head, including hoses, gaskets and any vacuum line teed into it.',
    difficulty: 'INTERMEDIATE',
    estimatedTime: unknownSpec(NO_LABOUR_DATA),

    tools: [
      {
        name: 'Bright inspection light',
        specialist: false,
        purpose: 'Splits and perished rubber are usually visible before they are audible.',
      },
      {
        name: 'Smoke tester',
        specialist: true,
        purpose:
          'Pressurises the intake with visible vapour so a leak shows itself. This is the only method here that locates a leak rather than guessing at it.',
      },
      {
        name: 'Scan tool showing live fuel trim',
        specialist: false,
        purpose:
          'Confirms the correction falls once the leak is sealed, which is the verification.',
      },
    ],

    parts: [
      {
        description: 'Intake hose or manifold gasket, if the inspection finds one has failed.',
        necessity: 'CONDITIONAL',
        determinedByStep: 'locate-unmetered-air-step-3',
        partNumber: unknownSpec(NO_SERVICE_DATA),
      },
      {
        description: 'Vacuum hose, if a teed line is found split or disconnected.',
        necessity: 'CONDITIONAL',
        determinedByStep: 'locate-unmetered-air-step-3',
        partNumber: unknownSpec(NO_SERVICE_DATA),
      },
    ],

    safety: [
      {
        severity: 'WARNING',
        hazard:
          'The engine may be running during parts of this procedure, with a moving belt, fan and pulleys in the same space as your hands.',
        control:
          'Keep hands, sleeves, hair and tools clear of the belt path. Do not reach across a running engine. Where a step does not require the engine running, switch it off.',
      },
      {
        severity: 'WARNING',
        hazard:
          'The exhaust manifold, and the turbocharger where one is fitted, reach temperatures that cause immediate burns.',
        control:
          'Let the engine cool before working near the exhaust side, or keep clear of it entirely.',
      },
      {
        severity: 'DANGER',
        hazard:
          'Running an engine in an enclosed space produces carbon monoxide, which is odourless and fatal.',
        control:
          'Work outdoors, or with forced extraction connected to the tailpipe. Never run the engine in a closed garage.',
      },
      {
        severity: 'CAUTION',
        hazard:
          'Some widely repeated leak-finding methods spray flammable liquid near hot components and ignition sources.',
        control:
          'Do not use carburettor cleaner, brake cleaner or propane to find leaks. Use a smoke tester, which is not flammable in use.',
      },
    ],

    preparation: [
      {
        id: 'locate-unmetered-air-prep-1',
        instruction: 'Park on level ground, apply the parking brake and let the engine cool.',
        rationale: 'Everything after this involves reaching into the engine bay.',
        safetyRefs: ['locate-unmetered-air-safety-2'],
        specification: null,
        expectedOutcome: null,
      },
      {
        id: 'locate-unmetered-air-prep-2',
        instruction:
          'Record fuel trim at idle and at a raised, steady engine speed, and write both down.',
        rationale:
          'These are the numbers the verification compares against. Without them you cannot tell whether the work changed anything.',
        safetyRefs: [],
        specification: null,
        expectedOutcome: 'Two trim figures, with the idle figure the higher of the two.',
      },
    ],

    steps: [
      {
        id: 'locate-unmetered-air-step-1',
        instruction:
          'With the engine off, inspect every hose between the airflow sensor and the throttle body. Flex each one and look along its underside.',
        rationale:
          'Splits commonly open only under flex, and sit on the hidden face of a hose, which is why a static look misses them.',
        safetyRefs: ['locate-unmetered-air-safety-2'],
        specification: null,
        expectedOutcome: 'Either a visible split, or no fault found on this section.',
      },
      {
        id: 'locate-unmetered-air-step-2',
        instruction:
          'Check every vacuum line teed into the intake, including those to the brake servo and any purge valve. Confirm each is attached at both ends and not perished.',
        rationale:
          'A disconnected vacuum line is unmetered air by the most direct route, and is the most common cause of this reading.',
        safetyRefs: [],
        specification: null,
        expectedOutcome: 'Every line accounted for at both ends.',
      },
      {
        id: 'locate-unmetered-air-step-3',
        instruction:
          'If nothing was found by inspection, introduce vapour into the intake with a smoke tester and watch for where it escapes.',
        rationale:
          'This locates the leak rather than inferring it. It is also the step that decides which part, if any, is actually needed — nothing should be bought before it.',
        safetyRefs: ['locate-unmetered-air-safety-3', 'locate-unmetered-air-safety-4'],
        specification: unknownSpec(
          'The maximum test pressure for this intake system. Over-pressurising can damage seals.',
        ),
        expectedOutcome: 'Vapour escaping at a specific point, or no escape found.',
      },
      {
        id: 'locate-unmetered-air-step-4',
        instruction:
          'Rectify what the inspection found — reconnect, reseat or renew the failed item — and refit everything disturbed.',
        rationale:
          'Only what was actually found at fault should be touched. Fitting parts that tested sound is how a simple fault becomes an expensive one.',
        safetyRefs: ['locate-unmetered-air-safety-1'],
        specification: unknownSpec(
          'Tightening torques for any clamp or fastener disturbed, which differ by vehicle.',
        ),
        expectedOutcome: 'The intake tract sealed and every fastener refitted.',
      },
    ],

    verification: [
      {
        id: 'locate-unmetered-air-verify-1',
        check:
          'Clear the learned fuel trim if your tool supports it, run the engine to operating temperature, and read combined fuel trim at idle.',
        passCondition:
          'Combined trim at idle sits within about 10% and is materially lower than the figure recorded in preparation.',
      },
      {
        id: 'locate-unmetered-air-verify-2',
        check: 'Read combined fuel trim again at a raised, steady engine speed.',
        passCondition:
          'The gap between idle and raised-speed trim has closed. That gap was the signature of the leak, so its absence is the evidence the leak is gone.',
      },
      {
        id: 'locate-unmetered-air-verify-3',
        check: 'Re-read stored fault codes after a full drive cycle.',
        passCondition:
          'No lean-condition code returns. A code that returns means the fault, or another like it, is still present.',
      },
    ],

    limitations: [
      'This is a generic procedure. Component locations, fastener types and tightening torques for your vehicle are not known to this build.',
      'It assumes the airflow sensor itself reads correctly. If the sensor is under-reporting, sealing the intake will not correct the mixture.',
      'A leak small enough to evade a smoke test can still disturb fuel trim at idle.',
    ],
  },

  {
    id: 'isolate-non-contributing-cylinder',
    causeId: 'incomplete-combustion',
    problem:
      'One or more cylinders are not contributing evenly, so crankshaft speed varies far more than ordinary cycle-to-cycle variation.',
    vehicleApplicability:
      'Generic procedure for a petrol engine with coil-on-plug ignition and port injection. Not specific to your vehicle.',
    system: 'Ignition and combustion',
    component:
      'The ignition and injection components serving the affected cylinder, plus that cylinder’s ability to hold compression.',
    difficulty: 'ADVANCED',
    estimatedTime: unknownSpec(NO_LABOUR_DATA),

    tools: [
      {
        name: 'Scan tool showing live engine speed',
        specialist: false,
        purpose: 'Establishes whether the unevenness persists above idle.',
      },
      {
        name: 'Compression tester',
        specialist: true,
        purpose:
          'Separates a mechanical cause from an ignition or fuelling one. Without it the three cannot be told apart.',
      },
      {
        name: 'Insulated spark plug socket',
        specialist: false,
        purpose: 'Removing plugs without dropping anything into the cylinder.',
      },
    ],

    parts: [
      {
        description: 'Spark plug for the affected cylinder, if inspection or testing condemns it.',
        necessity: 'CONDITIONAL',
        determinedByStep: 'isolate-non-contributing-cylinder-step-2',
        partNumber: unknownSpec(NO_SERVICE_DATA),
      },
      {
        description: 'Ignition coil, only if swapping it moves the fault to another cylinder.',
        necessity: 'CONDITIONAL',
        determinedByStep: 'isolate-non-contributing-cylinder-step-3',
        partNumber: unknownSpec(NO_SERVICE_DATA),
      },
    ],

    safety: [
      {
        severity: 'DANGER',
        hazard:
          'Ignition systems carry tens of thousands of volts. Contact with a live coil or lead can cause serious injury, and is dangerous to anyone with a pacemaker.',
        control:
          'Switch the ignition off and disconnect the battery negative terminal before disturbing any ignition component. Never handle a coil with the engine running.',
      },
      {
        severity: 'DANGER',
        hazard:
          'Fuel lines are pressurised. Disconnecting one without relieving pressure sprays petrol across a hot engine bay.',
        control:
          'Relieve fuel system pressure to the manufacturer’s procedure before disturbing any fuel component. Keep a dry powder extinguisher within reach.',
      },
      {
        severity: 'WARNING',
        hazard:
          'A cylinder that is not firing passes unburnt fuel into the exhaust, which can destroy the catalytic converter and start a fire.',
        control:
          'Do not keep the engine running to observe the fault beyond what the diagnosis requires. Keep running time short.',
      },
      {
        severity: 'WARNING',
        hazard: 'Spark plugs and the cylinder head are hot after running.',
        control: 'Allow the engine to cool fully before removing plugs.',
      },
    ],

    preparation: [
      {
        id: 'isolate-non-contributing-cylinder-prep-1',
        instruction:
          'Record how far engine speed varies at idle, and note whether the vehicle has a stored cylinder-specific fault code.',
        rationale:
          'Establishes the baseline the verification measures against, and narrows which cylinder to start with.',
        safetyRefs: ['isolate-non-contributing-cylinder-safety-3'],
        specification: null,
        expectedOutcome: 'A recorded idle variation figure.',
      },
    ],

    steps: [
      {
        id: 'isolate-non-contributing-cylinder-step-1',
        instruction:
          'Hold the engine at a steady speed above idle and note whether the unevenness persists.',
        rationale:
          'A cylinder not contributing at idle is not contributing at speed either. If it settles, the cause is something proportional to airflow rather than a dead cylinder.',
        safetyRefs: ['isolate-non-contributing-cylinder-safety-3'],
        specification: null,
        expectedOutcome: 'Either persistent unevenness, or a fault that clears with airflow.',
      },
      {
        id: 'isolate-non-contributing-cylinder-step-2',
        instruction:
          'With the engine cold and the battery disconnected, remove the spark plug from the suspect cylinder and examine it against the others.',
        rationale:
          'A plug records how its cylinder has been running. Fouling, wear or oil tells you which system to look at next.',
        safetyRefs: [
          'isolate-non-contributing-cylinder-safety-1',
          'isolate-non-contributing-cylinder-safety-4',
        ],
        specification: unknownSpec('The correct plug gap and tightening torque for this engine.'),
        expectedOutcome: 'A plug that either matches the others or clearly does not.',
      },
      {
        id: 'isolate-non-contributing-cylinder-step-3',
        instruction:
          'Swap the ignition coil with one from a cylinder that is behaving, refit, and re-run the engine briefly.',
        rationale:
          'If the fault follows the coil, the coil is at fault. If it stays with the cylinder, it is not. This is a test, not a repair — nothing is bought on the strength of it until it has been run.',
        safetyRefs: ['isolate-non-contributing-cylinder-safety-1'],
        specification: null,
        expectedOutcome: 'The fault either moves with the coil or stays put.',
      },
      {
        id: 'isolate-non-contributing-cylinder-step-4',
        instruction:
          'If the fault stayed with the cylinder, check that cylinder’s injector: listen for it operating, and compare its electrical resistance with the others.',
        rationale:
          'An injector that is blocked or not opening starves one cylinder and presents exactly like an ignition fault. It has to be eliminated before anything mechanical is suspected.',
        safetyRefs: [
          'isolate-non-contributing-cylinder-safety-1',
          'isolate-non-contributing-cylinder-safety-2',
        ],
        specification: unknownSpec(
          'The injector resistance range specified for this engine, and the fuel pressure relief procedure.',
        ),
        expectedOutcome: 'An injector that either matches the others or clearly does not.',
      },
      {
        id: 'isolate-non-contributing-cylinder-step-5',
        instruction:
          'If plug, coil and injector were all eliminated, perform a compression test on that cylinder and compare it with the others.',
        rationale:
          'This is where a mechanical cause is established rather than assumed. Low compression is not an ignition fault, and no amount of ignition parts will correct it.',
        safetyRefs: ['isolate-non-contributing-cylinder-safety-1'],
        specification: unknownSpec(
          'Minimum compression and the permitted variation between cylinders for this engine.',
        ),
        expectedOutcome: 'A compression figure for each cylinder.',
      },
    ],

    verification: [
      {
        id: 'isolate-non-contributing-cylinder-verify-1',
        check: 'Run the engine to operating temperature and record how far idle speed varies.',
        passCondition:
          'Idle variation is materially smaller than the figure recorded in preparation, and the engine holds a steady idle.',
      },
      {
        id: 'isolate-non-contributing-cylinder-verify-2',
        check: 'Clear stored codes and re-read them after a full drive cycle.',
        passCondition: 'No cylinder-specific code returns.',
      },
    ],

    limitations: [
      'This is a generic procedure. Plug gaps, tightening torques and compression figures for your engine are not known to this build.',
      'Misfire counts are not read by this build — they require Mode 06 on-board monitoring results — so which cylinder is affected is inferred from the codes and the plug inspection rather than measured directly.',
      'A fault that only appears under load may not reproduce at idle, and this procedure works at idle.',
    ],
  },

  {
    id: 'charging-system-not-supplying',
    causeId: 'charging-not-supplying',
    problem:
      'With the engine running, system voltage sits at or below battery rest voltage, so the battery alone is carrying the vehicle’s electrical load.',
    vehicleApplicability:
      'Generic procedure for a 12 V system with a belt-driven alternator. Not specific to your vehicle.',
    system: 'Electrical',
    component: 'The charging circuit: drive belt, alternator, its wiring, and the battery.',
    difficulty: 'INTERMEDIATE',
    estimatedTime: unknownSpec(NO_LABOUR_DATA),

    tools: [
      {
        name: 'Multimeter',
        specialist: false,
        purpose: 'Every measurement in this procedure is a voltage reading.',
      },
      {
        name: 'Battery load tester',
        specialist: true,
        purpose: 'Separates a failing battery from a failing charging system. Voltage alone does not.',
      },
    ],

    parts: [
      {
        description: 'Drive belt, if it is found glazed, cracked or slack.',
        necessity: 'CONDITIONAL',
        determinedByStep: 'charging-system-not-supplying-step-1',
        partNumber: unknownSpec(NO_SERVICE_DATA),
      },
      {
        description:
          'Alternator, only if charging output is confirmed absent with the belt and wiring proven sound.',
        necessity: 'CONDITIONAL',
        determinedByStep: 'charging-system-not-supplying-step-3',
        partNumber: unknownSpec(NO_SERVICE_DATA),
      },
    ],

    safety: [
      {
        severity: 'DANGER',
        hazard:
          'A lead-acid battery vents hydrogen and contains sulphuric acid. A short across the terminals delivers hundreds of amps and can make the battery burst.',
        control:
          'No naked flames or sparks near the battery. Remove rings and watches. Disconnect the negative terminal first and reconnect it last. Wear eye protection.',
      },
      {
        severity: 'WARNING',
        hazard: 'The drive belt and its pulleys are exposed and turning whenever the engine runs.',
        control:
          'Inspect the belt only with the engine stopped. Keep hands and tools clear of the belt path when it is running.',
      },
      {
        severity: 'WARNING',
        hazard:
          'A vehicle with no charging output can lose electrical power while being driven, including power steering assistance and lighting.',
        control:
          'Do not drive the vehicle to test it on a public road. Carry out these measurements stationary.',
      },
    ],

    preparation: [
      {
        id: 'charging-system-not-supplying-prep-1',
        instruction:
          'With the engine off and untouched for at least an hour, measure voltage across the battery terminals and record it.',
        rationale:
          'Rest voltage tells you the battery’s state of charge, which is a different question from whether the alternator is charging. Both are needed.',
        safetyRefs: ['charging-system-not-supplying-safety-1'],
        specification: unknownSpec(
          'The rest voltage that corresponds to a full charge for this battery chemistry.',
        ),
        expectedOutcome: 'A recorded rest voltage.',
      },
    ],

    steps: [
      {
        id: 'charging-system-not-supplying-step-1',
        instruction:
          'With the engine stopped, inspect the drive belt for glazing, cracking and correct tension.',
        rationale:
          'A slipping belt produces exactly this symptom and costs a fraction of an alternator. It is checked first for that reason.',
        safetyRefs: ['charging-system-not-supplying-safety-2'],
        specification: unknownSpec('The correct belt tension or deflection for this engine.'),
        expectedOutcome: 'A belt that is either sound and correctly tensioned, or clearly not.',
      },
      {
        id: 'charging-system-not-supplying-step-2',
        instruction:
          'Start the engine and measure voltage across the battery terminals again, at idle and at a raised steady speed.',
        rationale:
          'This is the measurement that distinguishes a charging system that is working from one that is not.',
        safetyRefs: ['charging-system-not-supplying-safety-1'],
        specification: unknownSpec(
          'The charging voltage range specified for this vehicle, which varies with regulation strategy and temperature.',
        ),
        expectedOutcome:
          'A running voltage clearly above the rest voltage recorded in preparation, or not.',
      },
      {
        id: 'charging-system-not-supplying-step-3',
        instruction:
          'If running voltage did not rise, inspect the alternator’s main output cable and earth strap for corrosion, looseness and damage, and measure the voltage drop across each while the engine runs.',
        rationale:
          'A bad connection produces the same reading as a failed alternator. This step is what separates them, and it must come before anything is condemned.',
        safetyRefs: ['charging-system-not-supplying-safety-1'],
        specification: unknownSpec('The maximum permissible voltage drop across this circuit.'),
        expectedOutcome: 'Either a poor connection identified, or the wiring proven sound.',
      },
      {
        id: 'charging-system-not-supplying-step-4',
        instruction: 'Load test the battery separately, following the tester’s instructions.',
        rationale:
          'A battery that cannot hold charge looks like a charging fault. Testing it separately stops a good alternator being condemned for a failed battery.',
        safetyRefs: ['charging-system-not-supplying-safety-1'],
        specification: unknownSpec('The cold cranking rating this battery should meet.'),
        expectedOutcome: 'A pass or fail result for the battery itself.',
      },
    ],

    verification: [
      {
        id: 'charging-system-not-supplying-verify-1',
        check: 'With the engine running and warm, measure voltage across the battery terminals.',
        passCondition:
          'Voltage is clearly above the rest voltage recorded in preparation, and stays there.',
      },
      {
        id: 'charging-system-not-supplying-verify-2',
        check:
          'Switch on headlights, blower and rear demister, and measure again at idle and at a raised steady speed.',
        passCondition:
          'Voltage stays within the charging range under load rather than falling back towards rest voltage.',
      },
    ],

    limitations: [
      'This is a generic procedure. The charging voltage range, belt tension and battery rating for your vehicle are not known to this build.',
      'Vehicles with a managed or smart charging strategy deliberately vary charging voltage, and can read low without a fault. This build cannot tell whether yours does.',
      'These measurements establish whether the system is charging. They do not establish why an alternator failed.',
    ],
  },
];

export function getGuideForCause(causeId: string): RepairGuide | undefined {
  return REPAIR_GUIDES.find((guide) => guide.causeId === causeId);
}

export function getGuide(id: string): RepairGuide | undefined {
  return REPAIR_GUIDES.find((guide) => guide.id === id);
}
