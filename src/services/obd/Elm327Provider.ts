import {
  buildModeCommand,
  buildPidCommand,
  decodeDtcs,
  decodePid,
  decodeSupportedPids,
  decodeVin,
  INIT_COMMANDS,
  modeOnePayload,
  modePayload,
  parseResponse,
} from '@/domain/obd';
import {
  getParameter,
  PARAMETERS,
  providerFail,
  providerOk,
  type ConnectionState,
  type DiagnosticTroubleCode,
  type ObdLink,
  type ProviderResult,
  type SensorReading,
  type StreamRequest,
  type StreamSubscription,
  type VehicleDataProvider,
  type VehicleIdentificationReport,
  type ModuleDescriptor,
  type ProviderDescriptor,
} from '@/domain/telemetry';

/**
 * A real OBD-II provider, speaking ELM327 over an injected link.
 *
 * The architecture this plugs into was built for it in Stage 5: this class
 * implements the same `VehicleDataProvider` contract the simulator does and
 * passes the same contract suite unchanged, so nothing above the provider
 * layer changes to accommodate real hardware.
 *
 * **What is verified and what is not.** Everything this class reasons about —
 * command construction, response parsing, byte decoding, capability
 * negotiation — is pure and tested. What is not tested is the `ObdLink` it is
 * given, because that requires an adapter and a vehicle. The split is
 * deliberate: the error-prone part (arithmetic on bytes) is covered, and the
 * unverifiable part is confined to a few dozen lines of browser API calls
 * behind a seam.
 *
 * The provider follows the brief's ordering rather than asking for everything
 * at once: protocol, then VIN, then ECU information, then codes, then the
 * parameters the vehicle says it supports. A vehicle is asked what it answers
 * to before being asked anything else, so the UI never offers a reading the
 * ECU never offered.
 */

const DEFAULT_TIMEOUT_MS = 5_000;
/** Resetting an adapter takes longer than an ordinary command. */
const RESET_TIMEOUT_MS = 10_000;

export interface Elm327Options {
  link: ObdLink;
  timeoutMs?: number;
}

export class Elm327Provider implements VehicleDataProvider {
  private readonly link: ObdLink;
  private readonly timeoutMs: number;

  private connectionState: ConnectionState = 'DISCONNECTED';
  private readonly listeners = new Set<(state: ConnectionState) => void>();

  /** PIDs the vehicle reported as supported. Empty until negotiated. */
  private supportedPids = new Set<number>();
  /**
   * CAN identifiers that actually answered, taken from response headers.
   *
   * Observed, never assumed. This is the only thing this build honestly knows
   * about which modules are present.
   */
  private respondingEcus = new Set<string>();
  private protocolDescription: string | null = null;

  constructor(options: Elm327Options) {
    this.link = options.link;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  describe(): ProviderDescriptor {
    const link = this.link.describe();

    return {
      id: `elm327-${link.id}`,
      name: `ELM327 over ${link.name}`,
      transport:
        link.kind === 'BLUETOOTH' ? 'BLUETOOTH' : link.kind === 'USB_SERIAL' ? 'USB' : 'WIFI',
      /*
       * Capabilities are declared from what has been negotiated, not from what
       * ELM327 can do in principle. Before connecting, only the modes every
       * OBD-II vehicle must support are claimed; live data is added once the
       * vehicle has actually said which PIDs it answers to.
       *
       * The alternative — listing everything and failing at request time —
       * makes the UI offer actions that cannot work, which the provider rules
       * forbid.
       */
      capabilities: [
        'READ_DTCS',
        'CLEAR_DTCS',
        'READ_ECU_INFO',
        ...(this.supportedPids.size > 0 ? (['LIVE_DATA', 'STREAMING'] as const) : []),
        ...(this.supportedPids.size > 0 && this.supportsVin() ? (['READ_VIN'] as const) : []),
      ],
      // Real data from a real vehicle. Never a simulation (Rule 2).
      isSimulated: false,
    };
  }

  /* --- Connection ------------------------------------------------------ */

  get state(): ConnectionState {
    return this.connectionState;
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(state: ConnectionState): void {
    this.connectionState = state;
    for (const listener of this.listeners) listener(state);
  }

  async connect(): Promise<ProviderResult<void>> {
    if (!this.link.isAvailable()) {
      return providerFail(
        'NOT_SUPPORTED',
        'This browser does not offer the API this adapter needs.',
      );
    }

    this.setState('CONNECTING');

    const opened = await this.link.open();
    if (!opened.ok) {
      this.setState('ERROR');
      return providerFail('DEVICE_ERROR', opened.error.message);
    }

    // Initialise in order. A failure here is reported rather than pushed on
    // from: an adapter that did not take ATE0 will echo every command, and
    // every later response would be misread.
    for (const command of INIT_COMMANDS) {
      const timeout = command === 'ATZ' ? RESET_TIMEOUT_MS : this.timeoutMs;
      const result = await this.link.exchange(command, timeout);

      if (!result.ok) {
        this.setState('ERROR');
        await this.link.close();
        return providerFail(
          'DEVICE_ERROR',
          `The adapter did not accept "${command}": ${result.error.message}`,
        );
      }
    }

    const protocol = await this.link.exchange('ATDPN', this.timeoutMs);
    this.protocolDescription = protocol.ok ? protocol.value.replace(/[\r\n>]/g, '').trim() : null;

    await this.negotiateSupportedPids();

    this.setState('CONNECTED');
    return providerOk(undefined);
  }

  async disconnect(): Promise<ProviderResult<void>> {
    this.setState('DISCONNECTING');
    // A stream left polling a closed link would report errors forever.
    this.stopActiveStream();
    await this.link.close();
    this.supportedPids.clear();
    this.respondingEcus.clear();
    this.setState('DISCONNECTED');
    return providerOk(undefined);
  }

  /* --- Capability negotiation ------------------------------------------ */

  /**
   * Asks the vehicle which PIDs it answers to, one bitmap at a time.
   *
   * Each bitmap's last bit says whether the next bitmap exists, so the walk
   * stops when the vehicle says it has no more to report rather than after a
   * fixed number of requests.
   */
  private async negotiateSupportedPids(): Promise<void> {
    this.supportedPids.clear();

    for (const base of [0x00, 0x20, 0x40, 0x60, 0x80]) {
      const payload = await this.requestPid(base);
      if (!payload) break;

      const supported = decodeSupportedPids(base, payload);
      for (const pid of supported) this.supportedPids.add(pid);

      // The bitmap's final bit is "PID base+0x20 is supported", i.e. ask again.
      if (!supported.includes(base + 0x20)) break;
    }
  }

  private supportsVin(): boolean {
    // Mode 09 PID 02. Negotiated separately from Mode 01, so this is a claim
    // about the request having succeeded rather than about the bitmap.
    return this.vinSupported;
  }

  private vinSupported = false;

  /* --- Reading --------------------------------------------------------- */

  private async requestPid(pid: number): Promise<number[] | null> {
    const result = await this.link.exchange(buildPidCommand(0x01, pid), this.timeoutMs);
    if (!result.ok) return null;

    const parsed = parseResponse(result.value, 0x01);
    if (parsed.kind !== 'DATA') return null;

    if (parsed.header) this.respondingEcus.add(parsed.header);

    return modeOnePayload(parsed.bytes, pid);
  }

  async getSupportedParameters(): Promise<ProviderResult<readonly string[]>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    // Only what the vehicle said it supports. Before negotiation this is
    // empty, which is truthful: nothing has been established yet.
    return providerOk(
      PARAMETERS.filter((parameter) => this.supportedPids.has(parameter.pid)).map(
        (parameter) => parameter.id,
      ),
    );
  }

  async getLiveData(
    parameterIds: readonly string[],
  ): Promise<ProviderResult<readonly SensorReading[]>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    const readings: SensorReading[] = [];

    for (const parameterId of parameterIds) {
      const definition = getParameter(parameterId);
      const at = new Date();

      if (!definition) {
        readings.push({
          parameterId,
          at,
          state: 'UNSUPPORTED',
        });
        continue;
      }

      if (!this.supportedPids.has(definition.pid)) {
        // The vehicle said it does not answer to this. Asking anyway and
        // reporting the timeout as a fault would be noise.
        readings.push({
          parameterId,
          at,
          state: 'UNSUPPORTED',
        });
        continue;
      }

      const payload = await this.requestPid(definition.pid);
      if (!payload) {
        readings.push({
          parameterId,
          at,
          state: 'UNAVAILABLE',
        });
        continue;
      }

      const value = decodePid(definition.pid, payload);
      if (value === null) {
        // A frame arrived but could not be decoded. Reported as unavailable
        // rather than decoded approximately (Rule 1).
        readings.push({
          parameterId,
          at,
          state: 'UNAVAILABLE',
        });
        continue;
      }

      readings.push({ parameterId, at, state: 'AVAILABLE', value, unit: definition.unit });
    }

    return providerOk(readings);
  }

  async getDtcs(): Promise<ProviderResult<readonly DiagnosticTroubleCode[]>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    const codes: DiagnosticTroubleCode[] = [];

    for (const [mode, status] of [
      [0x03, 'STORED'],
      [0x07, 'PENDING'],
    ] as const) {
      const result = await this.link.exchange(buildModeCommand(mode), this.timeoutMs);
      if (!result.ok) continue;

      const parsed = parseResponse(result.value, mode);
      if (parsed.kind !== 'DATA') continue;

      const payload = modePayload(parsed.bytes, mode);
      if (!payload) continue;

      for (const code of decodeDtcs(payload)) {
        codes.push({
          code,
          status,
          // No authoritative table exists, so no wording is invented (Rule 1).
          description: null,
          // The responding ECU, when headers gave one. Never invented.
          moduleAddress: parsed.header,
        });
      }
    }

    return providerOk(codes);
  }

  async clearDtcs(): Promise<ProviderResult<void>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    const result = await this.link.exchange(buildModeCommand(0x04), this.timeoutMs);
    if (!result.ok) return providerFail('DEVICE_ERROR', result.error.message);

    return providerOk(undefined);
  }

  async identifyVehicle(): Promise<ProviderResult<VehicleIdentificationReport>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    let vin: string | null = null;
    const result = await this.link.exchange('0902', this.timeoutMs);

    if (result.ok) {
      const parsed = parseResponse(result.value, 0x09);
      if (parsed.kind === 'DATA') {
        const payload = modePayload(parsed.bytes, 0x09);
        // Drop the PID echo (02) and the message-count byte before decoding.
        if (payload && payload.length > 2) vin = decodeVin(payload.slice(2));
      }
    }

    this.vinSupported = vin !== null;

    return providerOk({
      // Null when the vehicle did not return a usable one. Never partial
      // (Rule 1): a short VIN would reach the identification score as evidence.
      vin,
      ecuName: null,
      protocol: this.mapProtocol(this.protocolDescription),
      supportsObd2: true,
    });
  }

  /**
   * The ECUs that actually answered, from their response headers.
   *
   * This is not module *discovery*. Reaching modules beyond the legislated
   * OBD-II range needs manufacturer-specific addressing this build has no
   * table for, and DISCOVER_MODULES is deliberately not among the declared
   * capabilities for that reason.
   *
   * What is reported is what was observed: an identifier in the 7E8–7EF range
   * that replied. ISO 15765-4 reserves that range for emissions-related
   * powertrain ECUs, so naming it as such is reading the standard rather than
   * guessing. Anything outside it is reported without a system.
   */
  async getModules(): Promise<ProviderResult<readonly ModuleDescriptor[]>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    const modules: ModuleDescriptor[] = [...this.respondingEcus].sort().map((address) => ({
      name: `ECU ${address}`,
      address,
      system: /^7E[89A-F]$/i.test(address) ? 'ENGINE' : 'OTHER',
      // Only ECUs that replied are listed, so this is always true. A module
      // that never answered was never seen, which is not the same as one that
      // was asked and stayed silent.
      responding: true,
    }));

    return providerOk(modules);
  }

  async startStream(request: StreamRequest): Promise<ProviderResult<StreamSubscription>> {
    if (this.connectionState !== 'CONNECTED') {
      return providerFail('NOT_CONNECTED', 'Not connected to an adapter.', true);
    }

    /*
     * An ELM327 answers one command at a time, so a "stream" is a polling
     * loop. The interval it can actually achieve depends on how many
     * parameters are requested and how fast the bus answers, so the honest
     * figure is reported back rather than the one that was asked for.
     */
    const perRequestMs = 60;
    const achievable = Math.max(
      request.intervalMs,
      request.parameterIds.length * perRequestMs,
    );

    // Only one stream at a time, as the contract requires. Starting a second
    // would interleave commands on a link that answers one at a time.
    this.stopActiveStream();

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const readings = await this.getLiveData(request.parameterIds);
      if (stopped) return;

      if (readings.ok) request.onSample(readings.value);
      else request.onError?.(readings.error);

      if (!stopped) timer = setTimeout(() => void tick(), achievable);
    };

    timer = setTimeout(() => void tick(), achievable);

    const stop = () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      this.activeStream = null;
    };

    this.activeStream = stop;

    return providerOk({ intervalMs: achievable, stop });
  }

  async stopStream(): Promise<ProviderResult<void>> {
    // Safe when nothing is streaming, as the contract requires.
    this.stopActiveStream();
    return providerOk(undefined);
  }

  private stopActiveStream(): void {
    const stop = this.activeStream;
    this.activeStream = null;
    stop?.();
  }

  private activeStream: (() => void) | null = null;

  /** Maps ELM327's `ATDPN` protocol number onto the domain's vocabulary. */
  private mapProtocol(raw: string | null): VehicleIdentificationReport['protocol'] {
    if (!raw) return 'UNKNOWN';

    // ATDPN answers e.g. "A6" — the A means the protocol was found
    // automatically, the digit is the protocol.
    const digit = raw.replace(/^A/i, '').trim().toUpperCase();

    switch (digit) {
      case '1':
        return 'SAE_J1850_PWM';
      case '2':
        return 'SAE_J1850_VPW';
      case '3':
        return 'ISO_9141_2';
      case '4':
        return 'ISO_14230_4_KWP_5BAUD';
      case '5':
        return 'ISO_14230_4_KWP_FAST';
      case '6':
        return 'ISO_15765_4_CAN_11B_500K';
      case '7':
        return 'ISO_15765_4_CAN_29B_500K';
      case '8':
        return 'ISO_15765_4_CAN_11B_250K';
      case '9':
        return 'ISO_15765_4_CAN_29B_250K';
      case 'A':
        return 'SAE_J1939_CAN';
      default:
        // An unrecognised protocol number is reported as unknown rather than
        // guessed at.
        return 'UNKNOWN';
    }
  }
}
