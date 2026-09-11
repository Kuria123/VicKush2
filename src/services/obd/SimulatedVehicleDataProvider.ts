import {
  StaticTelemetrySource,
  providerFail,
  providerOk,
  type ConnectionState,
  type DiagnosticTroubleCode,
  type FaultInjectingProvider,
  type ModuleDescriptor,
  type ProviderDescriptor,
  type ProviderResult,
  type SensorReading,
  type StreamRequest,
  type StreamSubscription,
  type TelemetrySource,
  type VehicleIdentificationReport,
} from '@/domain/telemetry';
import { getParameter, isValidDtc, normalizeDtc } from '@/domain/telemetry';

/**
 * A vehicle data provider backed by a simulation rather than hardware.
 *
 * This class owns the *architecture* — connection lifecycle, capability
 * declaration, supported-parameter negotiation, one-shot reads, streaming and
 * error handling. It owns none of the physics: the numbers come from an
 * injected TelemetrySource, so Stage 6's coupled model replaces
 * StaticTelemetrySource without touching anything here.
 *
 * `isSimulated: true` is the flag every UI surface reads to decide that it
 * must display SIMULATION MODE (Rule 2).
 */

export interface SimulatedProviderOptions {
  source?: TelemetrySource;
  /** Simulated connection latency, in milliseconds. */
  connectDelayMs?: number;
  /** Minimum stream period the "device" will honour. */
  minIntervalMs?: number;
  now?: () => number;
}

const MODULES: readonly ModuleDescriptor[] = [
  { name: 'Engine Control Module', address: '7E0', system: 'ENGINE', responding: true },
  { name: 'Transmission Control Module', address: '7E1', system: 'TRANSMISSION', responding: true },
  // Reported as present but silent, so callers must handle the case where a
  // module exists and cannot be reached. Omitting it would hide that path.
  { name: 'ABS Control Module', address: '7B0', system: 'ABS', responding: false },
];

export class SimulatedVehicleDataProvider implements FaultInjectingProvider {
  private connectionState: ConnectionState = 'DISCONNECTED';
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private readonly source: TelemetrySource;
  private readonly connectDelayMs: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;

  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private streaming = false;

  constructor(options: SimulatedProviderOptions = {}) {
    this.source = options.source ?? new StaticTelemetrySource();
    this.connectDelayMs = options.connectDelayMs ?? 0;
    this.minIntervalMs = options.minIntervalMs ?? 100;
    this.now = options.now ?? (() => Date.now());
  }

  describe(): ProviderDescriptor {
    return {
      id: 'simulated',
      name: 'Simulated vehicle',
      transport: 'SIMULATED',
      isSimulated: true,
      capabilities: [
        'READ_ECU_INFO',
        'DISCOVER_MODULES',
        'READ_DTCS',
        'CLEAR_DTCS',
        'LIVE_DATA',
        'STREAMING',
        'FAULT_INJECTION',
        // Deliberately absent: READ_VIN (see identifyVehicle),
        // READ_FREEZE_FRAME and READ_READINESS_MONITORS, which are not
        // simulated. Claiming them would make the UI offer actions that
        // cannot work.
      ],
    };
  }

  get state(): ConnectionState {
    return this.connectionState;
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(next: ConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    for (const listener of this.listeners) listener(next);
  }

  private requireConnected<T>(): ProviderResult<T> | null {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail<T>('NOT_CONNECTED', 'The vehicle is not connected.', true);
    }
    return null;
  }

  async connect(): Promise<ProviderResult<void>> {
    if (this.connectionState === 'CONNECTED') return providerOk(undefined);

    this.setState('CONNECTING');
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    this.startedAt = this.now();
    this.setState('CONNECTED');
    return providerOk(undefined);
  }

  async disconnect(): Promise<ProviderResult<void>> {
    if (this.connectionState === 'DISCONNECTED') return providerOk(undefined);

    this.setState('DISCONNECTING');
    this.haltStream();
    this.setState('DISCONNECTED');
    return providerOk(undefined);
  }

  async identifyVehicle(): Promise<ProviderResult<VehicleIdentificationReport>> {
    const guard = this.requireConnected<VehicleIdentificationReport>();
    if (guard) return guard;

    return providerOk({
      /**
       * Null on purpose. A made-up 17-character VIN could collide with a real
       * vehicle, and it would flow into the identification confidence score
       * as though it were evidence. The simulator does not claim to know one.
       */
      vin: null,
      ecuName: 'Simulated Engine Control Module',
      protocol: 'ISO_15765_4_CAN_11B_500K',
      supportsObd2: true,
    });
  }

  async getModules(): Promise<ProviderResult<readonly ModuleDescriptor[]>> {
    const guard = this.requireConnected<readonly ModuleDescriptor[]>();
    if (guard) return guard;
    return providerOk(MODULES);
  }

  async getDtcs(): Promise<ProviderResult<readonly DiagnosticTroubleCode[]>> {
    const guard = this.requireConnected<readonly DiagnosticTroubleCode[]>();
    if (guard) return guard;
    return providerOk(this.source.sample(this.elapsed()).dtcs);
  }

  async clearDtcs(): Promise<ProviderResult<void>> {
    const guard = this.requireConnected<void>();
    if (guard) return guard;
    this.source.clearInjectedFaults();
    return providerOk(undefined);
  }

  async getSupportedParameters(): Promise<ProviderResult<readonly string[]>> {
    const guard = this.requireConnected<readonly string[]>();
    if (guard) return guard;
    return providerOk(this.source.supportedParameters());
  }

  async getLiveData(
    parameterIds: readonly string[],
  ): Promise<ProviderResult<readonly SensorReading[]>> {
    const guard = this.requireConnected<readonly SensorReading[]>();
    if (guard) return guard;
    return providerOk(this.read(parameterIds));
  }

  /**
   * Builds one reading per requested parameter — including the ones this
   * vehicle does not support, which come back marked UNSUPPORTED rather than
   * being dropped. A caller must be able to tell "absent" from "not asked".
   */
  private read(parameterIds: readonly string[]): readonly SensorReading[] {
    const sample = this.source.sample(this.elapsed());
    const supported = new Set(this.source.supportedParameters());
    const at = new Date(this.now());

    return parameterIds.map((parameterId): SensorReading => {
      if (!supported.has(parameterId)) {
        return { parameterId, at, state: 'UNSUPPORTED' };
      }
      const value = sample.values.get(parameterId);
      if (value === undefined) {
        // Supported, but this sample carried nothing for it.
        return { parameterId, at, state: 'UNAVAILABLE' };
      }

      const definition = getParameter(parameterId);
      if (!definition) {
        // A source offering a parameter outside the catalogue is a bug in the
        // source, not a vehicle condition — surfaced rather than swallowed.
        return {
          parameterId,
          at,
          state: 'ERROR',
          error: {
            code: 'PROTOCOL_ERROR',
            message: `Unknown parameter "${parameterId}".`,
            retryable: false,
          },
        };
      }

      return { parameterId, at, state: 'AVAILABLE', value, unit: definition.unit };
    });
  }

  private elapsed(): number {
    return this.startedAt === 0 ? 0 : this.now() - this.startedAt;
  }

  async startStream(request: StreamRequest): Promise<ProviderResult<StreamSubscription>> {
    const guard = this.requireConnected<StreamSubscription>();
    if (guard) return guard;

    if (this.streaming) {
      return providerFail(
        'DEVICE_ERROR',
        'A stream is already running. Stop it before starting another.',
      );
    }
    if (request.parameterIds.length === 0) {
      return providerFail('PROTOCOL_ERROR', 'A stream needs at least one parameter.');
    }

    // The device cannot poll faster than its floor, so the honest response is
    // to stream slower and report the rate actually being delivered.
    const intervalMs = Math.max(request.intervalMs, this.minIntervalMs);

    this.streaming = true;
    this.timer = setInterval(() => {
      try {
        request.onSample(this.read(request.parameterIds));
      } catch (error) {
        request.onError?.({
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        });
      }
    }, intervalMs);

    return providerOk({
      intervalMs,
      stop: () => this.haltStream(),
    });
  }

  async stopStream(): Promise<ProviderResult<void>> {
    this.haltStream();
    return providerOk(undefined);
  }

  private haltStream(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.streaming = false;
  }

  /* --- Simulator-only controls ----------------------------------------- */

  listScenarios(): readonly string[] {
    return this.source.listScenarios();
  }

  setScenario(scenario: string): ProviderResult<void> {
    if (!this.source.setScenario(scenario)) {
      return providerFail('NOT_SUPPORTED', `Unknown scenario: ${scenario}.`);
    }
    return providerOk(undefined);
  }

  injectDtc(code: string): ProviderResult<void> {
    const normalized = normalizeDtc(code);
    if (!isValidDtc(normalized)) {
      return providerFail('PROTOCOL_ERROR', `"${code}" is not a valid DTC.`);
    }
    this.source.injectDtc(normalized);
    return providerOk(undefined);
  }

  clearInjectedFaults(): ProviderResult<void> {
    this.source.clearInjectedFaults();
    return providerOk(undefined);
  }

  reset(): ProviderResult<void> {
    this.haltStream();
    this.source.reset();
    this.startedAt = this.now();
    return providerOk(undefined);
  }

  setThrottle(percent: number): ProviderResult<void> {
    if (!this.source.setThrottle) {
      return providerFail('NOT_SUPPORTED', 'This simulated source does not model a driver.');
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return providerFail('NOT_SUPPORTED', 'Throttle must be between 0 and 100.');
    }
    this.source.setThrottle(percent);
    return providerOk(undefined);
  }
}
