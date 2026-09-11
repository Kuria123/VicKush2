'use client';

import { Card, EmptyState } from '@/components/ui';
import type { DiagnosticSession } from '@/domain/diagnostics';

import { DiagnosticResult } from './DiagnosticResult';
import { useDiagnosis } from './useDiagnosis';

/**
 * The diagnosis, taken over a recorded session.
 *
 * It deliberately runs only once the scan is stopped. A diagnosis of a
 * session still in progress would rewrite itself several times a second as
 * evidence accumulated, which is both expensive and misleading — the point of
 * a differential is to weigh a body of evidence, not to guess from the first
 * few seconds of it.
 */

export interface DiagnosisTabProps {
  session: DiagnosticSession | null;
  scanning: boolean;
  sampleCount: number;
  isSimulated: boolean;
  engineDisplacementCc: number | null;
}

export function DiagnosisTab({
  session,
  scanning,
  sampleCount,
  isSimulated,
  engineDisplacementCc,
}: DiagnosisTabProps) {
  const diagnosis = useDiagnosis({
    session: scanning ? null : session,
    engineDisplacementCc,
    version: sampleCount,
  });

  if (scanning) {
    return (
      <Card>
        <EmptyState
          eyebrow="Scan in progress"
          title="Stop the scan to analyse it"
          description="A diagnosis weighs a whole session at once. Running it against a session still filling would rewrite the answer several times a second."
        />
      </Card>
    );
  }

  return (
    <DiagnosticResult
      analysis={diagnosis.analysis}
      differential={diagnosis.differential}
      results={diagnosis.results}
      isSimulated={isSimulated}
      onRecordResult={diagnosis.recordResult}
      onClearResult={diagnosis.clearResult}
      onClearAllResults={diagnosis.clearAllResults}
    />
  );
}
