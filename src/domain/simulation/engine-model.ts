import { Prng } from './prng';
import { HEALTHY, type FaultSet } from './faults';

/**
 * A mean-value engine model for a 2.0 L naturally aspirated inline-four
 * petrol engine with a CVT — the configuration of the reference vehicle.
 *
 * IMPORTANT: this is a physical model of that *configuration*. It is not a
 * replication of any manufacturer's ECU calibration, which is proprietary and
 * not something this project can know. It reproduces the relationships a
 * diagnostic technician reads — how airflow, manifold pressure and fuel trims
 * move together — not the exact numbers a specific vehicle would display.
 *
 * The chain the spec calls for is not hard-coded anywhere. It falls out of
 * the physics:
 *
 *   throttle area ─▶ air through the throttle ─┐
 *                                              ├─▶ manifold pressure ─▶ air
 *   engine pumping ◀── RPM ───────────────────┘                        into
 *                                                                   cylinders
 *   air into cylinders ÷ fuel delivered ─▶ lambda ─▶ O2 sensor ─▶ fuel trims
 *
 * Because a vacuum leak is modelled as a fixed-area hole rather than as "add
 * 20% to the trim", its effect shrinks as airflow grows, and the trims fall
 * when the engine is revved without anything instructing them to.
 */

/* --- Physical constants -------------------------------------------------- */

const GAMMA = 1.4;
const R_AIR = 287; // J/(kg·K)
const CRITICAL_PRESSURE_RATIO = 0.5283;
const DISCHARGE_COEFFICIENT = 0.7;
const STOICH_AFR = 14.7; // petrol
const FUEL_LHV = 44e6; // J/kg
const KELVIN = 273.15;

/* --- Engine geometry and calibration ------------------------------------- */

export interface EngineSpec {
  /** Swept volume, m³. */
  displacement: number;
  cylinders: number;
  /** Intake manifold volume, m³. */
  manifoldVolume: number;
  /** Rotating inertia of crank, flywheel and CVT input, kg·m². */
  inertia: number;
  /** Throttle bore area at wide open, m². */
  throttleMaxArea: number;
  /** Leakage past a fully closed throttle plate, m². */
  throttleClosedArea: number;
  /** Idle air bypass authority, m². */
  idleBypassMaxArea: number;
  idleTargetRpm: number;
  redlineRpm: number;
  stallRpm: number;
}

export const REFERENCE_ENGINE: EngineSpec = {
  displacement: 1.998e-3,
  cylinders: 4,
  manifoldVolume: 2.5e-3,
  inertia: 0.18,
  throttleMaxArea: 1.2e-3,
  throttleClosedArea: 3e-6,
  idleBypassMaxArea: 3e-5,
  idleTargetRpm: 700,
  redlineRpm: 6200,
  stallRpm: 350,
};

export interface AmbientConditions {
  /** Barometric pressure, Pa. */
  pressure: number;
  /** Ambient air temperature, °C. */
  airTemp: number;
}

export const DEFAULT_AMBIENT: AmbientConditions = {
  pressure: 101_325,
  airTemp: 26,
};

/* --- State --------------------------------------------------------------- */

export interface EngineState {
  rpm: number;
  /** Intake manifold absolute pressure, Pa. */
  map: number;
  /** Coolant temperature, °C. */
  coolantTemp: number;
  /** Intake air temperature, °C. */
  intakeAirTemp: number;

  /** Actual throttle plate position, 0–100. */
  throttlePosition: number;
  /** Idle bypass valve opening, 0–1. */
  idleBypass: number;
  idleIntegral: number;

  /** Short and long term fuel trim, as fractions (0.15 = +15%). */
  shortFuelTrim: number;
  longFuelTrim: number;
  /** Lambda as the oxygen sensor currently reports it (with lag). */
  sensedLambda: number;
  /** True lambda in the exhaust. */
  actualLambda: number;

  /** System voltage, V. */
  systemVoltage: number;
  batteryCharge: number;

  /** Road speed, m/s. */
  vehicleSpeed: number;
  cvtRatio: number;

  runTimeSeconds: number;
  /** Rolling count of failed combustion events. */
  misfireCount: number;
}

export interface EngineOutputs {
  /** Airflow as the MAF sensor reports it, g/s — excludes any leak. */
  reportedMaf: number;
  /** True airflow into the cylinders, g/s — includes any leak. */
  actualAirflow: number;
  /** Calculated load, %. */
  engineLoad: number;
  /** Upstream oxygen sensor voltage, V (narrowband equivalent). */
  o2Voltage: number;
  /** Commanded equivalence ratio the ECU is targeting, including dither. */
  commandedLambda: number;
  /** Fuel rail pressure, kPa. */
  fuelPressure: number;
  /** Torque reaching the driveline, Nm. */
  outputTorque: number;
  /** Accelerator position the driver asked for, 0–100. */
  commandedThrottle: number;
  /**
   * Peak-to-peak swing of the sensed mixture over the last few seconds.
   *
   * Closed-loop fuel control deliberately dithers the mixture so the catalyst
   * keeps working. A healthy sensor tracks that dither; a lazy one damps it
   * out. The amplitude, not the average, is what distinguishes a tired sensor
   * from a genuinely skewed mixture.
   */
  lambdaSwing: number;
}

export interface DriverInput {
  /** Commanded accelerator position, 0–100. */
  throttle: number;
  /** When false the vehicle is stationary with the transmission disengaged. */
  driving: boolean;
}

/* --- Helpers ------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compressible mass flow through an orifice (kg/s).
 *
 * Below the critical pressure ratio the flow chokes and stops responding to
 * downstream pressure — which is why a vacuum leak admits an almost constant
 * mass of air at idle regardless of small manifold changes.
 */
export function orificeMassFlow(
  area: number,
  upstreamPressure: number,
  downstreamPressure: number,
  upstreamTempK: number,
): number {
  if (area <= 0 || upstreamPressure <= 0) return 0;

  const ratio = clamp(downstreamPressure / upstreamPressure, 0, 1);
  let psi: number;

  if (ratio <= CRITICAL_PRESSURE_RATIO) {
    psi = Math.sqrt(GAMMA) * Math.pow(2 / (GAMMA + 1), (GAMMA + 1) / (2 * (GAMMA - 1)));
  } else {
    const term = Math.pow(ratio, 2 / GAMMA) - Math.pow(ratio, (GAMMA + 1) / GAMMA);
    psi = Math.sqrt(((2 * GAMMA) / (GAMMA - 1)) * Math.max(term, 0));
  }

  return (DISCHARGE_COEFFICIENT * area * upstreamPressure * psi) / Math.sqrt(R_AIR * upstreamTempK);
}

/** Volumetric efficiency against engine speed. */
function volumetricEfficiency(rpm: number): number {
  // Flat-ish curve peaking in the mid range, as a naturally aspirated engine
  // with variable valve timing behaves.
  const x = clamp(rpm, 500, 6500);
  return clamp(0.62 + 0.3 * Math.sin((Math.PI * (x - 300)) / 7000), 0.55, 0.93);
}

/**
 * Combustion efficiency against mixture strength; best slightly rich.
 *
 * The curve is gentle on purpose. An earlier, steeper version cost 20% of
 * torque at λ 1.2 and stalled the engine before the fuel trims had time to
 * learn — which is not what a real engine with weak injectors does. It runs
 * rough and the trims catch up.
 */
function lambdaEfficiency(lambda: number): number {
  const l = clamp(lambda, 0.6, 1.6);
  return clamp(1 - 1.0 * (l - 0.95) ** 2, 0.45, 1);
}

/** Throttle plate area for a commanded position. */
function throttleArea(spec: EngineSpec, positionPercent: number): number {
  const normalized = clamp(positionPercent, 0, 100) / 100;
  return (
    spec.throttleClosedArea + (spec.throttleMaxArea - spec.throttleClosedArea) * normalized ** 1.6
  );
}

/* --- The model ----------------------------------------------------------- */

export const FIXED_STEP_SECONDS = 0.01;

export function createInitialState(
  ambient: AmbientConditions = DEFAULT_AMBIENT,
  warm = true,
): EngineState {
  return {
    rpm: 0,
    map: ambient.pressure,
    coolantTemp: warm ? 88 : ambient.airTemp,
    intakeAirTemp: ambient.airTemp,
    throttlePosition: 0,
    idleBypass: 0.45,
    idleIntegral: 0,
    shortFuelTrim: 0,
    longFuelTrim: 0,
    sensedLambda: 1,
    actualLambda: 1,
    systemVoltage: 12.6,
    batteryCharge: 1,
    vehicleSpeed: 0,
    cvtRatio: 2.4,
    runTimeSeconds: 0,
    misfireCount: 0,
  };
}

export class EngineModel {
  readonly spec: EngineSpec;
  readonly ambient: AmbientConditions;

  private state: EngineState;
  private outputs: EngineOutputs;
  private readonly prng: Prng;
  private faults: FaultSet = HEALTHY;
  private running = false;
  /** Rolling window of sensed lambda, for measuring the dither response. */
  private lambdaHistory: number[] = [];

  constructor(
    options: {
      spec?: EngineSpec;
      ambient?: AmbientConditions;
      seed?: number;
      warm?: boolean;
    } = {},
  ) {
    this.spec = options.spec ?? REFERENCE_ENGINE;
    this.ambient = options.ambient ?? DEFAULT_AMBIENT;
    this.prng = new Prng(options.seed ?? 20_260_911);
    this.state = createInitialState(this.ambient, options.warm ?? true);
    this.outputs = {
      reportedMaf: 0,
      actualAirflow: 0,
      engineLoad: 0,
      o2Voltage: 0.45,
      commandedLambda: 1,
      fuelPressure: 0,
      outputTorque: 0,
      commandedThrottle: 0,
      lambdaSwing: 0,
    };
  }

  setFaults(faults: FaultSet): void {
    this.faults = faults;
    // A battery that rests low is a battery that is not full. Starting it at
    // full charge would hide the sag its charging current causes.
    if (faults.batteryRestVoltage < 12.2) {
      this.state.batteryCharge = Math.min(this.state.batteryCharge, 0.35);
    }
  }

  start(): void {
    this.running = true;
    // Cranking brings the engine up to a speed where it can sustain itself.
    if (this.state.rpm < this.spec.stallRpm) this.state.rpm = 500;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running && this.state.rpm > this.spec.stallRpm;
  }

  getState(): Readonly<EngineState> {
    return this.state;
  }

  getOutputs(): Readonly<EngineOutputs> {
    return this.outputs;
  }

  reset(warm = true): void {
    this.state = createInitialState(this.ambient, warm);
    this.running = false;
  }

  /** Advances the model by one fixed step. */
  step(input: DriverInput): void {
    const dt = FIXED_STEP_SECONDS;
    const s = this.state;

    s.runTimeSeconds += dt;

    this.updateThrottlePlate(input.throttle, dt);
    const { throughThrottle, throughLeak, intoCylinders } = this.updateAirPath(dt);
    const fuel = this.updateFuelControl(throughThrottle, intoCylinders, dt);
    const torque = this.updateTorqueAndSpeed(intoCylinders, fuel, input, dt);
    this.updateThermal(fuel.deliveredFuelFlow, dt);
    this.updateElectrical(dt);

    this.outputs = {
      reportedMaf: throughThrottle * 1000 * this.faults.mafScale,
      actualAirflow: intoCylinders * 1000,
      engineLoad: this.calculateLoad(intoCylinders),
      o2Voltage: this.oxygenSensorVoltage(),
      commandedLambda: this.commandedLambda(),
      fuelPressure: this.fuelRailPressure(),
      outputTorque: torque,
      commandedThrottle: clamp(input.throttle, 0, 100),
      lambdaSwing: this.lambdaSwing(),
    };

    void throughLeak;
  }

  /**
   * Closed-loop control dithers the target mixture either side of
   * stoichiometric at about 1 Hz, which is what keeps a three-way catalyst
   * alternating between storing and releasing oxygen. It is also the signal a
   * lazy sensor fails to follow.
   */
  private commandedLambda(): number {
    if (!this.isRunning()) return 1;
    return 1 + 0.022 * Math.sin(2 * Math.PI * this.state.runTimeSeconds);
  }

  private lambdaSwing(): number {
    if (this.lambdaHistory.length < 2) return 0;
    return Math.max(...this.lambdaHistory) - Math.min(...this.lambdaHistory);
  }

  /* --- Throttle ---------------------------------------------------------- */

  private updateThrottlePlate(commanded: number, dt: number): void {
    const s = this.state;
    const target = clamp(commanded, 0, 100) * this.faults.throttleResponseScale;
    const error = target - s.throttlePosition;

    // A sticking plate does not move at all until the demand exceeds the
    // stiction threshold, then moves in a jump rather than smoothly.
    if (Math.abs(error) < this.faults.throttleStictionPercent) return;

    // First-order actuator, roughly 150 ms to follow a step.
    s.throttlePosition = clamp(s.throttlePosition + error * (dt / 0.15), 0, 100);
  }

  /* --- Air path ---------------------------------------------------------- */

  private updateAirPath(dt: number): {
    throughThrottle: number;
    throughLeak: number;
    intoCylinders: number;
  } {
    const s = this.state;
    const intakeTempK = s.intakeAirTemp + KELVIN;
    const manifoldTempK = s.intakeAirTemp + 0.25 * s.coolantTemp + KELVIN;

    this.updateIdleControl(dt);

    const meteredArea =
      throttleArea(this.spec, s.throttlePosition) + s.idleBypass * this.spec.idleBypassMaxArea;

    // Air through the throttle body is what the MAF sensor sees.
    const throughThrottle = orificeMassFlow(meteredArea, this.ambient.pressure, s.map, intakeTempK);

    // Air through a leak enters downstream of the sensor, so it is never
    // measured. This single fact is what produces the entire lean signature.
    const throughLeak = orificeMassFlow(
      this.faults.vacuumLeakArea,
      this.ambient.pressure,
      s.map,
      intakeTempK,
    );

    // The engine pumps air out of the manifold in proportion to speed,
    // displacement and manifold density.
    const density = s.map / (R_AIR * manifoldTempK);
    const intoCylinders = this.isRunning()
      ? volumetricEfficiency(s.rpm) * this.spec.displacement * (s.rpm / 120) * density
      : 0;

    // Manifold filling dynamics: pressure follows the imbalance between what
    // goes in and what the engine draws out.
    const net = throughThrottle + throughLeak - intoCylinders;
    const dMap = ((R_AIR * manifoldTempK) / this.spec.manifoldVolume) * net * dt;
    s.map = clamp(s.map + dMap, 8_000, this.ambient.pressure * 1.02);

    // Intake air warms slightly under the bonnet as the engine heats up.
    const targetIat =
      this.ambient.airTemp + 0.12 * Math.max(0, s.coolantTemp - this.ambient.airTemp);
    s.intakeAirTemp += (targetIat - s.intakeAirTemp) * (dt / 20);

    return { throughThrottle, throughLeak, intoCylinders };
  }

  /**
   * Closed-loop idle control.
   *
   * Included because it is what makes a vacuum leak observable as unstable
   * idle: the controller keeps closing the bypass to fight the unmetered air,
   * and the two work against each other.
   */
  private updateIdleControl(dt: number): void {
    const s = this.state;
    if (!this.isRunning() || s.throttlePosition > 2) {
      s.idleIntegral *= 1 - dt;
      return;
    }

    // Enough authority to hold idle against a leak or a weak mixture. Real
    // idle control has considerably more headroom than a light trim.
    const error = this.spec.idleTargetRpm - s.rpm;
    s.idleIntegral = clamp(s.idleIntegral + error * dt * 0.0016, -0.9, 0.9);
    const command = 0.32 + error * 0.0012 + s.idleIntegral;
    s.idleBypass = clamp(command, 0, 1);
  }

  /* --- Fuel control ------------------------------------------------------ */

  private updateFuelControl(
    meteredAirFlow: number,
    actualAirFlow: number,
    dt: number,
  ): { deliveredFuelFlow: number } {
    const s = this.state;

    if (!this.isRunning()) {
      s.actualLambda = 1;
      s.sensedLambda = 1;
      return { deliveredFuelFlow: 0 };
    }

    // The ECU fuels from what the MAF reports, corrected by the trims it has
    // learned, and dithered around stoichiometric. It cannot know about
    // unmetered air or a mis-reading sensor.
    const measuredAir = meteredAirFlow * this.faults.mafScale;
    const commandedFuel =
      (measuredAir / (STOICH_AFR * this.commandedLambda())) *
      (1 + s.shortFuelTrim + s.longFuelTrim);

    const deliveredFuelFlow = commandedFuel * this.faults.fuelDeliveryScale;

    // Truth in the exhaust: all the air that actually entered, against all the
    // fuel that was actually delivered.
    s.actualLambda =
      deliveredFuelFlow > 1e-9
        ? clamp(actualAirFlow / (deliveredFuelFlow * STOICH_AFR), 0.5, 2)
        : 1.6;

    this.updateOxygenSensor(dt);
    this.updateTrims(dt);

    // Five seconds of history, which spans several dither cycles.
    this.lambdaHistory.push(s.sensedLambda);
    if (this.lambdaHistory.length > Math.round(5 / dt)) this.lambdaHistory.shift();

    return { deliveredFuelFlow };
  }

  private updateOxygenSensor(dt: number): void {
    const s = this.state;
    const fault = this.faults.o2Fault;

    if (fault === 'STUCK_LEAN') {
      s.sensedLambda = 1.12;
      return;
    }
    if (fault === 'STUCK_RICH') {
      s.sensedLambda = 0.88;
      return;
    }

    // A healthy upstream sensor responds in roughly 100 ms. An aged one takes
    // seconds, which is far too slow for the trim loop to track.
    const timeConstant = fault === 'SLOW' ? 3.2 : 0.1;
    s.sensedLambda += (s.actualLambda - s.sensedLambda) * (dt / timeConstant);
  }

  private updateTrims(dt: number): void {
    const s = this.state;

    // Short term trim is the fast corrector: it drives the sensed mixture back
    // to the commanded target and is clamped at the authority limit real ECUs
    // use. It corrects the average, not the deliberate dither.
    const error = s.sensedLambda - this.commandedLambda();
    s.shortFuelTrim = clamp(s.shortFuelTrim + error * 0.85 * dt, -0.25, 0.25);

    // Long term trim slowly adopts whatever the short term trim keeps having
    // to do, which is why a persistent fault ends up stored in LTFT.
    s.longFuelTrim = clamp(s.longFuelTrim + s.shortFuelTrim * 0.035 * dt, -0.25, 0.25);
    // As LTFT takes over the correction, STFT relaxes back toward zero.
    s.shortFuelTrim -= s.shortFuelTrim * 0.035 * dt;
  }

  private oxygenSensorVoltage(): number {
    // Narrowband characteristic: a steep switch either side of stoichiometric.
    const lambda = this.state.sensedLambda;
    const v = 0.45 - 0.42 * Math.tanh((lambda - 1) * 12);
    return clamp(v, 0.01, 0.95);
  }

  private fuelRailPressure(): number {
    if (!this.isRunning()) return 0;
    const nominal = 380; // kPa, typical port-injection rail
    return nominal * this.faults.fuelPressureScale;
  }

  /* --- Torque and rotation ----------------------------------------------- */

  private updateTorqueAndSpeed(
    airIntoCylinders: number,
    fuel: { deliveredFuelFlow: number },
    input: DriverInput,
    dt: number,
  ): number {
    const s = this.state;

    if (!this.running) {
      s.rpm = Math.max(0, s.rpm - 900 * dt);
      s.vehicleSpeed = Math.max(0, s.vehicleSpeed - 1.5 * dt);
      return 0;
    }

    // Indicated torque from the energy actually released this cycle.
    const cyclesPerSecond = Math.max(s.rpm, 1) / 120;
    const airPerCycle = airIntoCylinders / cyclesPerSecond;
    const fuelPerCycle = fuel.deliveredFuelFlow / cyclesPerSecond;
    const burnable = Math.min(fuelPerCycle, airPerCycle / STOICH_AFR);

    const misfireLoss = 1 - clamp(this.faults.misfireRate, 0, 0.5);
    const thermalEfficiency = 0.32;

    const indicated =
      (burnable * FUEL_LHV * thermalEfficiency * lambdaEfficiency(s.actualLambda) * misfireLoss) /
      (4 * Math.PI);

    // Friction rises with speed; pumping work is the cost of drawing against
    // manifold vacuum, which is why a throttled engine loses torque.
    const friction = 9 + 0.0022 * s.rpm;
    const pumping = ((this.ambient.pressure - s.map) * this.spec.displacement) / (4 * Math.PI);

    // Alternator, water pump and power steering. Without this the engine idled
    // at an implausible 22 kPa because nothing was consuming its output.
    const accessories = 13;

    const net = indicated - friction - pumping - accessories;
    const load = input.driving ? this.drivelineLoad(net, dt) : 0;

    const omega = (s.rpm * 2 * Math.PI) / 60;
    const domega = ((net - load) / this.spec.inertia) * dt;
    let rpm = ((omega + domega) * 60) / (2 * Math.PI);

    // Combustion is not perfectly even; a misfiring cylinder makes it much
    // less so, which is what an unstable idle actually is.
    const roughness = 1.4 + this.faults.misfireRate * 90;
    rpm += this.prng.gaussian() * roughness * Math.sqrt(dt);

    if (this.faults.misfireRate > 0 && this.prng.chance(this.faults.misfireRate * dt * 60)) {
      s.misfireCount += 1;
    }

    s.rpm = clamp(rpm, 0, this.spec.redlineRpm);
    if (s.rpm < this.spec.stallRpm && input.throttle < 1) {
      // Stalled.
      this.running = false;
    }

    return Math.max(0, net);
  }

  /**
   * A deliberately simple driveline: the CVT tracks a target engine speed,
   * and whatever torque reaches the wheels accelerates the vehicle against
   * drag and rolling resistance.
   *
   * Slip is modelled as torque that never reaches the wheels. The engine
   * therefore feels *less* load and revs higher while the vehicle accelerates
   * *less* — which is the signature of a slipping CVT, and it emerges from
   * the single slip parameter rather than being written twice.
   */
  private drivelineLoad(netTorque: number, dt: number): number {
    const s = this.state;

    const MASS = 1700; // kg
    const DRAG_AREA = 0.75; // Cd·A, m²
    const AIR_DENSITY = 1.2;
    const ROLLING = 0.012;
    const EFFICIENCY = 0.9;
    const LAUNCH_SPEED = 3; // m/s below which traction, not power, limits

    const slip = clamp(this.faults.transmissionSlip, 0, 0.9);

    // A CVT holds the engine at the speed its strategy wants for the demanded
    // power, then varies ratio to suit road speed.
    const targetRpm = clamp(900 + s.throttlePosition * 45, 900, 5200);

    // A slipping belt turns slower on its output than its input, so the engine
    // must spin faster to deliver the same road speed — and the slipping
    // fraction of the power becomes heat instead of traction. One number,
    // both halves of the signature: revs up, speed down.
    const effectiveTarget = clamp(targetRpm / (1 - slip), 900, this.spec.redlineRpm);

    // Torque the transmission absorbs to steer the engine toward that speed.
    // Absorbing less than the engine makes lets it accelerate; absorbing more
    // is engine braking. An earlier version had this sign inverted, so a
    // healthy engine could never rev up at all.
    const desired = clamp(
      netTorque - (effectiveTarget - s.rpm) * 0.02,
      0,
      Math.max(netTorque, 0) * 1.5,
    );
    const transmitted = desired;

    // Power through the driveline, rather than tracking ratio explicitly.
    const omega = (s.rpm * 2 * Math.PI) / 60;
    const power = transmitted * omega * EFFICIENCY * (1 - slip);
    const traction = power / Math.max(s.vehicleSpeed, LAUNCH_SPEED);

    const drag = 0.5 * AIR_DENSITY * DRAG_AREA * s.vehicleSpeed ** 2;
    const rolling = s.vehicleSpeed > 0.1 ? ROLLING * MASS * 9.81 : 0;

    s.vehicleSpeed = Math.max(0, s.vehicleSpeed + ((traction - drag - rolling) / MASS) * dt);

    // Reported for instrumentation; the power path above is what drives the
    // vehicle.
    const wheelOmega = Math.max(s.vehicleSpeed / 0.34, 0.1);
    s.cvtRatio = clamp(omega / (wheelOmega * 5.7), 0.5, 2.6);

    // The engine only feels the torque that was actually transmitted.
    return transmitted;
  }

  /** Calculated load, as SAE defines it: airflow against peak at this speed. */
  private calculateLoad(airIntoCylinders: number): number {
    if (!this.isRunning()) return 0;
    const s = this.state;
    const peakDensity = this.ambient.pressure / (R_AIR * (s.intakeAirTemp + KELVIN));
    const peak = volumetricEfficiency(s.rpm) * this.spec.displacement * (s.rpm / 120) * peakDensity;
    return peak > 0 ? clamp((airIntoCylinders / peak) * 100, 0, 100) : 0;
  }

  /* --- Thermal ----------------------------------------------------------- */

  private updateThermal(fuelFlow: number, dt: number): void {
    const s = this.state;
    const HEAT_CAPACITY = 22_000; // J/K, block plus coolant
    const TO_COOLANT = 0.3; // fraction of fuel energy rejected to coolant

    const heatIn = fuelFlow * FUEL_LHV * TO_COOLANT;
    const above = s.coolantTemp - this.ambient.airTemp;

    // The thermostat is a proportional valve, not a switch: it modulates to
    // hold temperature. Modelling it as on/off made a healthy engine sit
    // exactly at the switching point instead of regulating around it.
    const opening = this.faults.thermostatStuckOpen ? 1 : clamp((s.coolantTemp - 82) / 10, 0, 1);

    // Radiator effectiveness depends on air passing through it, so a failed
    // fan or a blocked core shows up at a standstill long before it does on
    // the motorway. `4` is the small loss straight off the block, which is
    // all that escapes while the thermostat is shut.
    const ramAir = clamp(s.vehicleSpeed / 25, 0, 1);
    const conductance = 4 + opening * (60 + 290 * ramAir) * this.faults.coolingEfficiency;

    const heatOut = conductance * above;

    s.coolantTemp = clamp(
      s.coolantTemp + ((heatIn - heatOut) / HEAT_CAPACITY) * dt,
      this.ambient.airTemp - 5,
      135,
    );
  }

  /* --- Electrical -------------------------------------------------------- */

  private updateElectrical(dt: number): void {
    const s = this.state;
    const ELECTRICAL_LOAD = 0.35; // normalised accessory draw

    if (this.isRunning() && !this.faults.alternatorFailed) {
      // A depleted battery draws heavy charging current, and the alternator's
      // output sags under it. That is why a failing battery reads a little low
      // even while charging — though confirming it still needs a resting or
      // cranking test, which this stationary model cannot perform.
      const chargeSag = 1.2 * (1 - s.batteryCharge);
      const target = 14.2 - 0.35 * ELECTRICAL_LOAD - chargeSag;
      s.systemVoltage += (target - s.systemVoltage) * (dt / 0.8);
      s.batteryCharge = clamp(s.batteryCharge + 0.004 * dt, 0, 1);
    } else {
      // Battery only. Terminal voltage sags under load and falls as it drains.
      const rest = this.faults.batteryRestVoltage;
      const sag = this.isRunning() ? 0.55 : 0.15;
      const target = rest * (0.72 + 0.28 * s.batteryCharge) - sag;
      s.systemVoltage += (target - s.systemVoltage) * (dt / 1.5);
      if (this.isRunning()) {
        s.batteryCharge = clamp(s.batteryCharge - 0.0016 * dt, 0, 1);
      }
    }

    s.systemVoltage = clamp(s.systemVoltage + this.prng.gaussian() * 0.006, 6, 16);
  }
}
