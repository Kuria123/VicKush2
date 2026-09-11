import type { DiagnosticTroubleCode, ReadingStateCode, SensorReading } from '../telemetry';

/**
 * A diagnostic session: everything observed between connecting to a vehicle
 * and stopping.
 *
 * Pure and in-memory. Writing sessions to the database is Stage 15; the
 * shapes here are what that stage will persist, so the recorder is the single
 * definition of what a session *is* regardless of where it ends up.
 *
 * The rule that governs the whole file: a sample that carried no value does
 * not become a point on a graph. Its state is recorded so the screen can say
 * why, but interpolating across it — or plotting a zero — would invent
 * telemetry (Rule 1).
 */

export interface SeriesPoint {
  /** Milliseconds since the session started. */
  t: number;
  value: number;
}

export interface ParameterTrack {
  parameterId: string;
  /** Only samples that actually carried a value. */
  points: SeriesPoint[];
  /** State of the most recent sample, whatever it was. */
  state: ReadingStateCode;
  latestValue: number | null;
  unit: string | null;
  /** Samples seen, including those with no value. */
  samples: number;
}

export interface SessionSummary {
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
  sampleCount: number;
  /** Parameters that have produced at least one value. */
  readingParameters: number;
  /** Parameters the vehicle does not support. */
  unsupportedParameters: number;
  isSimulated: boolean;
  providerName: string;
  scenario: string | null;
}

export interface SessionOptions {
  providerName: string;
  isSimulated: boolean;
  /** Simulator scenario, when there is one. */
  scenario?: string | null;
  /**
   * Points retained per parameter. At 5 Hz, 900 points is three minutes of
   * history — enough to watch a fuel trim settle without growing without
   * bound during a long scan.
   */
  maxPoints?: number;
  startedAt?: Date;
}

const DEFAULT_MAX_POINTS = 900;

export class DiagnosticSession {
  readonly startedAt: Date;
  readonly providerName: string;
  readonly isSimulated: boolean;

  private readonly maxPoints: number;
  private readonly tracks = new Map<string, ParameterTrack>();
  private dtcs: readonly DiagnosticTroubleCode[] = [];
  private scenario: string | null;
  private endedAt: Date | null = null;
  private samples = 0;
  private lastSampleAt = 0;

  constructor(options: SessionOptions) {
    this.startedAt = options.startedAt ?? new Date();
    this.providerName = options.providerName;
    this.isSimulated = options.isSimulated;
    this.scenario = options.scenario ?? null;
    this.maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  }

  /**
   * Records one sweep of readings.
   *
   * `atMs` is the offset from the session start rather than a wall clock, so
   * a series is comparable across sessions and does not depend on when the
   * scan happened to run.
   */
  record(readings: readonly SensorReading[], atMs: number): void {
    if (this.endedAt) return;

    this.samples += 1;
    this.lastSampleAt = Math.max(this.lastSampleAt, atMs);

    for (const reading of readings) {
      const track = this.trackFor(reading.parameterId);
      track.samples += 1;
      track.state = reading.state;

      if (reading.state === 'AVAILABLE') {
        track.latestValue = reading.value;
        track.unit = reading.unit;
        track.points.push({ t: atMs, value: reading.value });
        if (track.points.length > this.maxPoints) track.points.shift();
      } else {
        // No value means no point. The gap in the series is the honest
        // record of a parameter that stopped answering.
        track.latestValue = null;
      }
    }
  }

  recordDtcs(dtcs: readonly DiagnosticTroubleCode[]): void {
    this.dtcs = dtcs;
  }

  setScenario(scenario: string | null): void {
    this.scenario = scenario;
  }

  end(at: Date = new Date()): void {
    this.endedAt ??= at;
  }

  get isRunning(): boolean {
    return this.endedAt === null;
  }

  track(parameterId: string): ParameterTrack | null {
    return this.tracks.get(parameterId) ?? null;
  }

  allTracks(): readonly ParameterTrack[] {
    return [...this.tracks.values()];
  }

  storedDtcs(): readonly DiagnosticTroubleCode[] {
    return this.dtcs.filter((dtc) => dtc.status === 'STORED');
  }

  pendingDtcs(): readonly DiagnosticTroubleCode[] {
    return this.dtcs.filter((dtc) => dtc.status === 'PENDING');
  }

  allDtcs(): readonly DiagnosticTroubleCode[] {
    return this.dtcs;
  }

  summary(): SessionSummary {
    const tracks = this.allTracks();
    return {
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: this.lastSampleAt,
      sampleCount: this.samples,
      readingParameters: tracks.filter((t) => t.points.length > 0).length,
      unsupportedParameters: tracks.filter((t) => t.state === 'UNSUPPORTED').length,
      isSimulated: this.isSimulated,
      providerName: this.providerName,
      scenario: this.scenario,
    };
  }

  private trackFor(parameterId: string): ParameterTrack {
    let track = this.tracks.get(parameterId);
    if (!track) {
      track = {
        parameterId,
        points: [],
        state: 'NOT_READING',
        latestValue: null,
        unit: null,
        samples: 0,
      };
      this.tracks.set(parameterId, track);
    }
    return track;
  }
}

/* -------------------------------------------------------------------------
 * Series helpers
 * ---------------------------------------------------------------------- */

/** Smallest and largest values in a track, or null when it has no points. */
export function trackExtent(track: ParameterTrack): { min: number; max: number } | null {
  if (track.points.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const point of track.points) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  return { min, max };
}

/**
 * Change across the track, as latest minus earliest.
 *
 * Returns null rather than zero when there is not enough history: "no change"
 * and "not enough data to say" are different claims.
 */
export function trackDelta(track: ParameterTrack): number | null {
  if (track.points.length < 2) return null;
  const first = track.points[0]!;
  const last = track.points[track.points.length - 1]!;
  return last.value - first.value;
}

/** Values only, oldest to newest — the shape a sparkline wants. */
export function trackValues(track: ParameterTrack): number[] {
  return track.points.map((point) => point.value);
}
