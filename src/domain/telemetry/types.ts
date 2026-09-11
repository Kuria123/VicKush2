/**
 * Vehicle data provider vocabulary.
 *
 * Pure types. The diagnostic engine consumes these and must never learn
 * whether the bytes behind them arrived from a simulator, Bluetooth, USB,
 * Wi-Fi or a direct CAN interface.
 *
 * Two principles run through the whole file:
 *
 * 1. **"Not supported" and "not answered" are outcomes, not exceptions.** A
 *    vehicle that lacks a transmission module is not an error condition; it
 *    is information. Expected outcomes are returned, not thrown.
 * 2. **A reading without a value carries no value.** The union below makes a
 *    missing reading structurally incapable of holding a number, so nothing
 *    downstream can render a plausible-looking zero (Rule 1).
 */

/* -------------------------------------------------------------------------
 * Transport and connection
 * ---------------------------------------------------------------------- */

export const TRANSPORTS = ['SIMULATED', 'BLUETOOTH', 'USB', 'WIFI', 'CAN'] as const;
export type Transport = (typeof TRANSPORTS)[number];

/**
 * Transport-level connection state only. The richer discovery sequence
 * (identifying the vehicle, reading the ECU, discovering modules) is
 * orchestration that belongs above this layer, in Stage 7.
 */
export const CONNECTION_STATES = [
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'DISCONNECTING',
  'ERROR',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

/* -------------------------------------------------------------------------
 * Errors and results
 * ---------------------------------------------------------------------- */

export const PROVIDER_ERROR_CODES = [
  'NOT_CONNECTED',
  'NOT_SUPPORTED',
  'TIMEOUT',
  'PROTOCOL_ERROR',
  'DEVICE_ERROR',
  'CANCELLED',
  'UNKNOWN',
] as const;
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  /** Whether retrying the same call could plausibly succeed. */
  retryable: boolean;
}

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError };

export function providerOk<T>(value: T): ProviderResult<T> {
  return { ok: true, value };
}

export function providerFail<T>(
  code: ProviderErrorCode,
  message: string,
  retryable = false,
): ProviderResult<T> {
  return { ok: false, error: { code, message, retryable } };
}

/* -------------------------------------------------------------------------
 * Capabilities
 * ---------------------------------------------------------------------- */

/**
 * What a provider can actually do. Declared up front so the interface never
 * has to be probed by calling a method and seeing whether it fails, and so
 * the UI can avoid offering an action that cannot work.
 */
export const PROVIDER_CAPABILITIES = [
  'READ_VIN',
  'READ_ECU_INFO',
  'DISCOVER_MODULES',
  'READ_DTCS',
  'CLEAR_DTCS',
  'READ_FREEZE_FRAME',
  'READ_READINESS_MONITORS',
  'LIVE_DATA',
  'STREAMING',
  /** Deliberately inject a fault. Only ever true for a simulator. */
  'FAULT_INJECTION',
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export interface ProviderDescriptor {
  id: string;
  name: string;
  transport: Transport;
  capabilities: readonly ProviderCapability[];
  /**
   * Whether the data is synthetic.
   *
   * Required, not optional, and never inferred from the transport: every
   * surface that displays provider data reads this to decide whether it must
   * show SIMULATION MODE (Rule 2). Making it mandatory means a new provider
   * cannot quietly omit the disclosure.
   */
  isSimulated: boolean;
}

export function hasCapability(
  descriptor: ProviderDescriptor,
  capability: ProviderCapability,
): boolean {
  return descriptor.capabilities.includes(capability);
}

/* -------------------------------------------------------------------------
 * Readings
 * ---------------------------------------------------------------------- */

/**
 * Why a parameter has no value.
 *
 * `UNSUPPORTED` means the vehicle does not implement it; `NOT_READING` means
 * it is supported but nothing is streaming it right now. Collapsing the two
 * would tell a user a parameter does not exist when it merely is not being
 * polled.
 */
export const READING_STATES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'UNSUPPORTED',
  'NOT_READING',
  'ERROR',
] as const;
export type ReadingStateCode = (typeof READING_STATES)[number];

interface ReadingBase {
  parameterId: string;
  at: Date;
}

/**
 * A reading either has a value or has a reason. The union makes the second
 * case incapable of carrying a number, so a missing reading cannot be
 * rendered as one.
 */
export type SensorReading =
  | (ReadingBase & { state: 'AVAILABLE'; value: number; unit: string })
  | (ReadingBase & {
      state: Exclude<ReadingStateCode, 'AVAILABLE'>;
      value?: never;
      /** Present when the state is ERROR. */
      error?: ProviderError;
    });

export function isAvailable(
  reading: SensorReading,
): reading is Extract<SensorReading, { state: 'AVAILABLE' }> {
  return reading.state === 'AVAILABLE';
}

/* -------------------------------------------------------------------------
 * Diagnostic trouble codes
 * ---------------------------------------------------------------------- */

export const DTC_STATUSES = ['STORED', 'PENDING', 'PERMANENT'] as const;
export type DtcStatus = (typeof DTC_STATUSES)[number];

export interface DiagnosticTroubleCode {
  /** Normalised, e.g. "P0171". */
  code: string;
  status: DtcStatus;
  /**
   * Null unless an authoritative description is available. The project has
   * no DTC description table yet, and inventing wording for a fault code
   * would fabricate diagnostic data (Rule 1).
   */
  description: string | null;
  /** Which module reported it, when the provider can tell. */
  moduleAddress: string | null;
}

/* -------------------------------------------------------------------------
 * Modules and identity
 * ---------------------------------------------------------------------- */

export interface ModuleDescriptor {
  name: string;
  /** ECU address exactly as reported, e.g. "7E0". */
  address: string | null;
  /** Mirrors ModuleSystem in the vehicle domain. */
  system: string;
  responding: boolean;
}

export interface VehicleIdentificationReport {
  vin: string | null;
  ecuName: string | null;
  /** Mirrors ObdProtocol in the vehicle domain. */
  protocol: string | null;
  supportsObd2: boolean | null;
}

/* -------------------------------------------------------------------------
 * Streaming
 * ---------------------------------------------------------------------- */

export interface StreamRequest {
  parameterIds: readonly string[];
  /** Requested sample period. A provider may sample slower and says so. */
  intervalMs: number;
  onSample: (readings: readonly SensorReading[]) => void;
  onError?: (error: ProviderError) => void;
}

export interface StreamSubscription {
  /** Actual sample period, which may be slower than requested. */
  readonly intervalMs: number;
  stop: () => void;
}
