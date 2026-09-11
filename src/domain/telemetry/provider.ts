import type {
  ConnectionState,
  DiagnosticTroubleCode,
  ModuleDescriptor,
  ProviderDescriptor,
  ProviderResult,
  SensorReading,
  StreamRequest,
  StreamSubscription,
  VehicleIdentificationReport,
} from './types';

/**
 * The single contract every source of vehicle data implements — the
 * simulator today, and Bluetooth, USB, Wi-Fi and direct CAN adapters later.
 *
 * Everything above this line (the diagnostic engine, the UI, the services)
 * depends on this interface and never on a transport. That is the whole
 * point of the abstraction: swapping a simulator for a real adapter must not
 * require the diagnostic engine to change at all.
 *
 * Contract rules every implementation must honour:
 *
 * - **Declare capabilities truthfully.** `describe()` is the only way callers
 *   learn what is possible. A provider that lists a capability it cannot
 *   deliver will cause the UI to offer an action that cannot work.
 * - **Return outcomes, do not throw them.** A vehicle without a transmission
 *   module, an unsupported PID, a timed-out request — these are results.
 *   Exceptions are reserved for programmer error.
 * - **Never invent a reading.** If a value was not obtained, return a reading
 *   whose state says why. The reading type cannot hold both.
 * - **Only report what was actually observed.** An absent module is
 *   `responding: false`, not omitted; an unknown VIN is null, not a guess.
 */
export interface VehicleDataProvider {
  /** Static description, safe to call at any time, including disconnected. */
  describe(): ProviderDescriptor;

  readonly state: ConnectionState;

  /** Notifies on every connection state change. Returns an unsubscribe. */
  onStateChange(listener: (state: ConnectionState) => void): () => void;

  /** Idempotent: connecting an already-connected provider succeeds. */
  connect(): Promise<ProviderResult<void>>;

  /** Idempotent, and always safe to call. Stops any active stream. */
  disconnect(): Promise<ProviderResult<void>>;

  /**
   * Reads whatever identifies the vehicle. Fields the provider could not
   * establish come back null rather than omitted, so the caller can tell
   * "not supported" from "not asked".
   */
  identifyVehicle(): Promise<ProviderResult<VehicleIdentificationReport>>;

  /** Modules found, including those that did not respond. */
  getModules(): Promise<ProviderResult<readonly ModuleDescriptor[]>>;

  getDtcs(): Promise<ProviderResult<readonly DiagnosticTroubleCode[]>>;

  /** Requires the CLEAR_DTCS capability. */
  clearDtcs(): Promise<ProviderResult<void>>;

  /**
   * Parameter ids this vehicle actually supports.
   *
   * Distinct from the catalogue in `parameters.ts`, which lists what OBD-II
   * defines. This is what this vehicle answers to, so the UI can mark the
   * rest UNSUPPORTED rather than showing them as merely empty.
   */
  getSupportedParameters(): Promise<ProviderResult<readonly string[]>>;

  /** One-shot read. Unsupported parameters come back with that state, not omitted. */
  getLiveData(parameterIds: readonly string[]): Promise<ProviderResult<readonly SensorReading[]>>;

  /** Requires STREAMING. At most one stream at a time per provider. */
  startStream(request: StreamRequest): Promise<ProviderResult<StreamSubscription>>;

  /** Safe to call when nothing is streaming. */
  stopStream(): Promise<ProviderResult<void>>;
}

/**
 * Simulator-only controls.
 *
 * Deliberately a separate interface rather than optional methods on
 * `VehicleDataProvider`: fault injection must be impossible to reach through
 * the ordinary contract, so no diagnostic code can accidentally depend on
 * being able to fabricate a fault. Callers narrow with
 * `supportsFaultInjection` and, by construction, only a simulator passes.
 */
export interface FaultInjectingProvider extends VehicleDataProvider {
  /** Names of the scenarios this simulator can run. */
  listScenarios(): readonly string[];
  setScenario(scenario: string): ProviderResult<void>;
  injectDtc(code: string): ProviderResult<void>;
  clearInjectedFaults(): ProviderResult<void>;
  reset(): ProviderResult<void>;

  /**
   * Drives the simulated accelerator, 0–100.
   *
   * Optional: a simulator need not model a driver. Where it does, this is
   * what lets the user produce the second operating condition the diagnosis
   * asks for. It is on the simulator-only interface, so it is unreachable
   * against a real vehicle — where the accelerator is not ours to move.
   */
  setThrottle?(percent: number): ProviderResult<void>;
}

export function supportsFaultInjection(
  provider: VehicleDataProvider,
): provider is FaultInjectingProvider {
  return (
    provider.describe().capabilities.includes('FAULT_INJECTION') &&
    typeof (provider as FaultInjectingProvider).setScenario === 'function'
  );
}
