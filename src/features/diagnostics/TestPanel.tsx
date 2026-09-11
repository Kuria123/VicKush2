'use client';

import { useId, useState } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import {
  OUTCOME_LABELS,
  isInformative,
  type ConfirmationTest,
  type OfferedTest,
  type TestOutcome,
  type TestResult,
} from '@/domain/confirmation';

/**
 * The confirmation tests worth performing, and where their results go in.
 *
 * The outcome buttons offered are the ones the test actually has meanings
 * for, plus the two that mean "no observation was made". Offering `PASS` on a
 * test whose implications are written for `NORMAL`/`ABNORMAL` would invite a
 * result the engine has nothing to do with.
 */

export interface TestPanelProps {
  recommended: readonly OfferedTest[];
  results: readonly TestResult[];
  onRecord: (testId: string, outcome: TestOutcome, note?: string) => void;
  onClear: (testId: string) => void;
}

/** Always available: neither changes the assessment, and both are honest. */
const NON_RESULTS: readonly TestOutcome[] = ['UNABLE_TO_PERFORM', 'SKIP'];

export function TestPanel({ recommended, results, onRecord, onClear }: TestPanelProps) {
  const byTest = new Map(results.map((r) => [r.testId, r]));
  const performed = results.filter((r) => isInformative(r.outcome));

  if (recommended.length === 0 && results.length === 0) {
    return (
      <Card>
        <p className="label-technical">What should I test?</p>
        <p className="text-content-secondary mt-3 text-sm leading-relaxed">
          No confirmation test applies. Nothing in this scan left a question a test in the
          catalogue could settle.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {recommended.map((offer, index) => (
        <TestCard
          key={offer.test.id}
          test={offer.test}
          separates={offer.separates.length}
          priority={index === 0 && performed.length === 0}
          result={byTest.get(offer.test.id)}
          onRecord={onRecord}
          onClear={onClear}
        />
      ))}

      {results
        .filter((r) => !recommended.some((o) => o.test.id === r.testId))
        .map((result) => (
          <RecordedElsewhere key={result.testId} result={result} onClear={onClear} />
        ))}
    </div>
  );
}

function TestCard({
  test,
  separates,
  priority,
  result,
  onRecord,
  onClear,
}: {
  test: ConfirmationTest;
  separates: number;
  priority: boolean;
  result: TestResult | undefined;
  onRecord: (testId: string, outcome: TestOutcome, note?: string) => void;
  onClear: (testId: string) => void;
}) {
  const [note, setNote] = useState(result?.note ?? '');
  const noteId = useId();

  const outcomes: TestOutcome[] = [
    ...new Set(test.implications.map((i) => i.outcome)),
    ...NON_RESULTS,
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {priority && <Badge tone="accent">Do this first</Badge>}
            <Badge technical>
              {separates === 1 ? 'Settles 1 cause' : `Settles ${separates} causes`}
            </Badge>
          </div>
          <h4 className="text-base font-semibold tracking-tight text-balance">{test.title}</h4>
          <p className="text-content-secondary mt-1 text-sm text-pretty">{test.question}</p>
        </div>

        {result && (
          <Badge tone={isInformative(result.outcome) ? 'ok' : 'warn'}>
            {OUTCOME_LABELS[result.outcome]}
          </Badge>
        )}
      </div>

      {test.safety && (
        <p
          role="note"
          className="border-status-warn bg-status-warn-subtle text-status-warn mt-4 rounded-md border px-3 py-2 text-sm"
        >
          <strong className="font-semibold">Safety.</strong> {test.safety}
        </p>
      )}

      <ol className="text-content-secondary mt-4 flex list-decimal flex-col gap-2 pl-4 text-sm leading-relaxed">
        {test.procedure.map((step) => (
          <li key={step} className="text-pretty">
            {step}
          </li>
        ))}
      </ol>

      {test.criterion && (
        <p className="border-line text-content mt-4 rounded-md border px-3 py-2 text-sm">
          <span className="label-technical">Criterion</span>
          <span className="mt-1 block text-pretty">{test.criterion}</span>
        </p>
      )}

      <fieldset className="border-line mt-5 border-t pt-4">
        <legend className="label-technical px-0">Record the result</legend>

        <label htmlFor={noteId} className="text-content-secondary mt-3 block text-sm">
          What did you measure or see? (optional)
        </label>
        <input
          id={noteId}
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. 210 kPa at idle, 195 kPa at 2500 rpm"
          className="border-line bg-surface-sunken focus:border-accent focus:ring-accent/30 mt-1.5 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {outcomes.map((outcome) => (
            <Button
              key={outcome}
              size="sm"
              variant={result?.outcome === outcome ? 'primary' : 'secondary'}
              onClick={() => onRecord(test.id, outcome, note)}
            >
              {OUTCOME_LABELS[outcome]}
            </Button>
          ))}
          {result && (
            <Button size="sm" variant="ghost" onClick={() => onClear(test.id)}>
              Clear
            </Button>
          )}
        </div>

        <p className="text-content-muted mt-3 text-xs">
          “Unable to perform” and “Skipped” are recorded but change nothing. A test that made no
          observation produced no evidence.
        </p>
      </fieldset>
    </Card>
  );
}

function RecordedElsewhere({
  result,
  onClear,
}: {
  result: TestResult;
  onClear: (testId: string) => void;
}) {
  return (
    <Card surface="sunken">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <Badge tone={isInformative(result.outcome) ? 'ok' : 'warn'}>
            {OUTCOME_LABELS[result.outcome]}
          </Badge>{' '}
          <span className="text-content-secondary">
            {result.note ? result.note : 'Recorded; no longer needed to separate a cause.'}
          </span>
        </p>
        <Button size="sm" variant="ghost" onClick={() => onClear(result.testId)}>
          Undo
        </Button>
      </div>
    </Card>
  );
}
