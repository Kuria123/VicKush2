import type { ProviderError } from '@/domain/telemetry';

/**
 * The vehicle connection sequence.
 *
 * Each phase corresponds to a real operation against the provider, not to a
 * timer. `detail` is filled from what the operation actually returned, so the
 * screen reports what happened rather than narrating a script.
 */
export const CONNECTION_PHASES = [
  'CONNECT',
  'DEVICE',
  'IDENTIFY',
  'ECU',
  'MODULES',
  'DATA',
  'READY',
] as const;
export type ConnectionPhaseId = (typeof CONNECTION_PHASES)[number];

export const PHASE_LABELS: Record<ConnectionPhaseId, string> = {
  CONNECT: 'Connecting',
  DEVICE: 'Device found',
  IDENTIFY: 'Identifying vehicle',
  ECU: 'Reading ECU',
  MODULES: 'Discovering modules',
  DATA: 'Reading diagnostic data',
  READY: 'Ready',
};

export type PhaseStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'DONE'
  /** The provider does not support this step; not a failure. */
  | 'SKIPPED'
  | 'FAILED';

export interface PhaseState {
  id: ConnectionPhaseId;
  status: PhaseStatus;
  /** What the operation actually reported. Null until it has run. */
  detail: string | null;
  error: ProviderError | null;
}

export interface ConnectionSummary {
  vin: string | null;
  ecuName: string | null;
  protocol: string | null;
  supportsObd2: boolean | null;
  /** Modules that answered. */
  modulesResponding: number;
  /** Every module found, including those that did not answer. */
  modulesFound: number;
  supportedParameterCount: number;
  storedDtcCount: number;
}

export interface ConnectionState {
  phases: PhaseState[];
  /** True only once every phase has completed. */
  ready: boolean;
  running: boolean;
  summary: ConnectionSummary | null;
  /**
   * Whether the data is synthetic. Drives the SIMULATION MODE banner, and is
   * read from the provider rather than assumed (Rule 2).
   */
  isSimulated: boolean;
  providerName: string | null;
  transport: string | null;
}

export function initialPhases(): PhaseState[] {
  return CONNECTION_PHASES.map((id) => ({
    id,
    status: 'PENDING' as PhaseStatus,
    detail: null,
    error: null,
  }));
}
