'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DiagnosticSession,
  LIVE_SCAN_PARAMETERS,
  type ParameterTrack,
  type SessionSummary,
} from '@/domain/diagnostics';
import {
  hasCapability,
  supportsFaultInjection,
  type ProviderError,
  type StreamSubscription,
  type VehicleDataProvider,
} from '@/domain/telemetry';

/**
 * Streams live telemetry into a diagnostic session.
 *
 * The session object is mutable and long-lived, which React state is not
 * suited to. It is held in a ref and a version counter drives re-renders, so
 * the buffer is not copied on every sample — at 5 Hz across eighteen
 * parameters that would be a lot of garbage for no benefit.
 *
 * The provider comes from the connection screen, so a scan reuses the live
 * session rather than opening a second one.
 */

export interface UseLiveScanOptions {
  provider: VehicleDataProvider | null;
  /** Requested sample period. The provider may deliver slower and says so. */
  intervalMs?: number;
  scenario?: string | null;
}

export interface UseLiveScanResult {
  scanning: boolean;
  session: DiagnosticSession | null;
  tracks: readonly ParameterTrack[];
  summary: SessionSummary | null;
  /** Rate actually being delivered, which may be slower than requested. */
  actualIntervalMs: number | null;
  error: ProviderError | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

const DEFAULT_INTERVAL_MS = 200;

export function useLiveScan({
  provider,
  intervalMs = DEFAULT_INTERVAL_MS,
  scenario = null,
}: UseLiveScanOptions): UseLiveScanResult {
  /**
   * The session is held in a ref for the stream callback, which fires outside
   * render, and in state for callers, because reading a ref during render is
   * not allowed. The version counter is what actually drives re-renders: the
   * session mutates in place, so React cannot see the change, and copying a
   * 900-point buffer across eighteen parameters five times a second to make
   * it immutable would be a great deal of garbage for no benefit.
   */
  const sessionRef = useRef<DiagnosticSession | null>(null);
  const [session, setSession] = useState<DiagnosticSession | null>(null);
  const subscriptionRef = useRef<StreamSubscription | null>(null);
  const startedAtRef = useRef(0);
  const dtcTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [version, setVersion] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [actualIntervalMs, setActualIntervalMs] = useState<number | null>(null);
  const [error, setError] = useState<ProviderError | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const teardown = useCallback(() => {
    subscriptionRef.current?.stop();
    subscriptionRef.current = null;
    if (dtcTimerRef.current !== null) {
      clearInterval(dtcTimerRef.current);
      dtcTimerRef.current = null;
    }
  }, []);

  // A stream left running after unmount would keep sampling a vehicle nobody
  // is looking at.
  useEffect(() => teardown, [teardown]);

  /** Keeps the scenario on the session current when the user changes it. */
  useEffect(() => {
    sessionRef.current?.setScenario(scenario);
  }, [scenario]);

  const start = useCallback(async () => {
    if (!provider || scanning) return;
    setError(null);

    const descriptor = provider.describe();
    if (!hasCapability(descriptor, 'STREAMING')) {
      setError({
        code: 'NOT_SUPPORTED',
        message: 'This adapter cannot stream live data.',
        retryable: false,
      });
      return;
    }

    const newSession = new DiagnosticSession({
      providerName: descriptor.name,
      isSimulated: descriptor.isSimulated,
      scenario: supportsFaultInjection(provider)
        ? (scenario ?? provider.listScenarios()[0] ?? null)
        : null,
    });
    sessionRef.current = newSession;
    setSession(newSession);
    startedAtRef.current = Date.now();

    const started = await provider.startStream({
      parameterIds: LIVE_SCAN_PARAMETERS,
      intervalMs,
      onSample: (readings) => {
        const current = sessionRef.current;
        if (!current?.isRunning) return;
        current.record(readings, Date.now() - startedAtRef.current);
        bump();
      },
      onError: (streamError) => {
        setError(streamError);
        teardown();
        setScanning(false);
      },
    });

    if (!started.ok) {
      setError(started.error);
      return;
    }

    subscriptionRef.current = started.value;
    setActualIntervalMs(started.value.intervalMs);
    setScanning(true);

    // Fault codes are polled far more slowly than live values: an ECU stores
    // them over seconds of debounce, so reading them at stream rate would be
    // pure overhead.
    const pollDtcs = async () => {
      if (!hasCapability(descriptor, 'READ_DTCS')) return;
      const result = await provider.getDtcs();
      if (result.ok && sessionRef.current?.isRunning) {
        sessionRef.current.recordDtcs(result.value);
        bump();
      }
    };
    void pollDtcs();
    dtcTimerRef.current = setInterval(() => void pollDtcs(), 2000);

    bump();
  }, [provider, scanning, intervalMs, scenario, bump, teardown]);

  const stop = useCallback(() => {
    teardown();
    sessionRef.current?.end();
    setScanning(false);
    bump();
  }, [teardown, bump]);

  const reset = useCallback(() => {
    teardown();
    sessionRef.current = null;
    setSession(null);
    setScanning(false);
    setActualIntervalMs(null);
    setError(null);
    bump();
  }, [teardown, bump]);

  // Read so this render depends on it: the session mutates in place, and the
  // counter is the only signal React has that the buffer changed.
  void version;

  return {
    scanning,
    session,
    tracks: session?.allTracks() ?? [],
    summary: session?.summary() ?? null,
    actualIntervalMs,
    error,
    start: () => void start(),
    stop,
    reset,
  };
}
