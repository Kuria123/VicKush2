'use client';

import { useState } from 'react';

import { Badge, Button, Card, Input } from '@/components/ui';
import type { ConfirmedDifferential } from '@/domain/confirmation';
import type { DiagnosticAnalysis } from '@/domain/diagnostics';
import {
  evaluateRecommendation,
  VERDICT_LABELS,
  type OpinionVerdict,
  type SecondOpinion,
} from '@/domain/second-opinion';

/**
 * A second opinion on someone else's recommendation.
 *
 * Computed on the client from the same evidence the diagnosis used — it is a
 * pure function over data already on the page, so there is nothing to ask a
 * server for and no model involved. That is the point: asking a language model
 * whether a mechanic is right would replace one unverifiable opinion with
 * another.
 *
 * The limitations are rendered with the verdict rather than beneath a fold,
 * and the first of them is always that the person who inspected the vehicle
 * knows things this build does not. A tool that helps someone distrust their
 * mechanic on thin evidence would do more harm than the fault it was
 * diagnosing.
 */

export interface SecondOpinionPanelProps {
  analysis: DiagnosticAnalysis | null;
  differential: ConfirmedDifferential | null;
}

const VERDICT_TONE: Record<OpinionVerdict, 'ok' | 'warn' | 'fault' | 'neutral' | 'accent'> = {
  SUPPORTED: 'ok',
  CONSISTENT_UNCONFIRMED: 'accent',
  NOT_SUPPORTED: 'warn',
  INSUFFICIENT_EVIDENCE: 'neutral',
  UNRECOGNISED: 'neutral',
};

export function SecondOpinionPanel({ analysis, differential }: SecondOpinionPanelProps) {
  const [draft, setDraft] = useState('');
  const [opinion, setOpinion] = useState<SecondOpinion | null>(null);

  function assess() {
    const recommendation = draft.trim();
    if (recommendation.length === 0) return;
    setOpinion(evaluateRecommendation({ recommendation, analysis, differential }));
  }

  return (
    <Card>
      <p className="label-technical">Second opinion</p>
      <p className="text-content-secondary mt-1 text-sm text-pretty">
        Been told something needs doing? Put it here and this will say what the scan data does and
        does not support. It will not tell you whether the person is right — they have seen the
        vehicle and this has not.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          assess();
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            label="What were you told needs doing?"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Replace the mass airflow sensor"
            maxLength={300}
          />
        </div>
        <Button type="submit" disabled={draft.trim().length === 0}>
          Assess
        </Button>
      </form>

      {opinion && <Opinion opinion={opinion} />}
    </Card>
  );
}

function Opinion({ opinion }: { opinion: SecondOpinion }) {
  return (
    <div className="border-line mt-5 border-t pt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={VERDICT_TONE[opinion.verdict]}>{VERDICT_LABELS[opinion.verdict]}</Badge>
        {opinion.claim && <Badge technical>{opinion.claim.component}</Badge>}
      </div>

      <p className="text-sm leading-relaxed text-pretty">{opinion.summary}</p>

      {opinion.supporting.length > 0 && (
        <Points title="What supports it" points={opinion.supporting} />
      )}
      {opinion.opposing.length > 0 && (
        <Points title="What argues against it" points={opinion.opposing} />
      )}

      {opinion.suggestedChecks.length > 0 && (
        <div className="mt-4">
          <p className="label-technical">What would settle it</p>
          <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
            {opinion.suggestedChecks.map((check) => (
              <li key={check} className="text-pretty">
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* With the verdict, not beneath a fold. */}
      <div className="border-line mt-4 border-t pt-3">
        <p className="label-technical">What this cannot account for</p>
        <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
          {opinion.limitations.map((limitation) => (
            <li key={limitation} className="text-pretty">
              {limitation}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Points({
  title,
  points,
}: {
  title: string;
  points: SecondOpinion['supporting'];
}) {
  return (
    <div className="mt-4">
      <p className="label-technical">{title}</p>
      <ul className="mt-2 flex flex-col gap-2.5">
        {points.map((point, index) => (
          <li key={`${point.observation}-${index}`} className="border-line border-l-2 pl-3">
            <p className="text-sm font-medium text-pretty">{point.observation}</p>
            <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
              {point.significance}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
