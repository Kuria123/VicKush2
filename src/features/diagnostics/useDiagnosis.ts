'use client';

import { useCallback, useMemo, useState } from 'react';

import {
  applyTestResults,
  type ConfirmedDifferential,
  type TestOutcome,
  type TestResult,
} from '@/domain/confirmation';
import { analyseSession, type DiagnosticSession } from '@/domain/diagnostics';
import { differentiate } from '@/domain/differential';

/**
 * Runs the diagnostic chain over a recorded session.
 *
 * The whole chain is pure and deterministic, so it is derived during render
 * rather than stored: session in, analysis, differential and confirmed
 * differential out. Caching it in state would create a second copy that could
 * disagree with the session it came from.
 *
 * Test results are the one piece of genuine state here, because they are
 * entered by a person rather than computed from the readings.
 */

export interface UseDiagnosisOptions {
  session: DiagnosticSession | null;
  /** From the vehicle record. Absent facts limit what can be checked. */
  engineDisplacementCc?: number | null;
  /** Bumped by the caller when the session's buffer has changed. */
  version?: number;
}

export interface UseDiagnosisResult {
  analysis: ReturnType<typeof analyseSession> | null;
  differential: ConfirmedDifferential | null;
  results: readonly TestResult[];
  recordResult: (testId: string, outcome: TestOutcome, note?: string) => void;
  clearResult: (testId: string) => void;
  clearAllResults: () => void;
}

export function useDiagnosis({
  session,
  engineDisplacementCc = null,
  version = 0,
}: UseDiagnosisOptions): UseDiagnosisResult {
  const [results, setResults] = useState<readonly TestResult[]>([]);

  const analysis = useMemo(() => {
    if (!session) return null;
    return analyseSession({
      session,
      dtcs: session.allDtcs(),
      engineDisplacementCc,
    });
    // The session mutates in place, so `version` is the only signal React has
    // that its buffer changed. Depending on the object alone would leave the
    // analysis stale for the whole scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, engineDisplacementCc, version]);

  const differential = useMemo(() => {
    if (!analysis) return null;
    return applyTestResults(differentiate(analysis), results);
  }, [analysis, results]);

  const recordResult = useCallback((testId: string, outcome: TestOutcome, note?: string) => {
    setResults((current) => [
      ...current.filter((r) => r.testId !== testId),
      note && note.trim().length > 0
        ? { testId, outcome, note: note.trim() }
        : { testId, outcome },
    ]);
  }, []);

  const clearResult = useCallback((testId: string) => {
    setResults((current) => current.filter((r) => r.testId !== testId));
  }, []);

  const clearAllResults = useCallback(() => setResults([]), []);

  return { analysis, differential, results, recordResult, clearResult, clearAllResults };
}
