'use client';

import { useState } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import { buildDiagnosticContext, type AIExplanation } from '@/domain/ai';
import type { ConfirmedDifferential } from '@/domain/confirmation';
import type { DiagnosticAnalysis } from '@/domain/diagnostics';

/**
 * The AI explanation, sitting deliberately below the structured diagnosis.
 *
 * Position is the argument. Everything above this panel was produced
 * deterministically and stands without it; this is a restatement in plainer
 * language, offered on request. If the AI is unavailable, or its answer is
 * withheld for being unsupported by the data, nothing above changes.
 *
 * It is opt-in rather than automatic because generating prose costs money and
 * because a user should be able to read the evidence before reading a
 * summary of it.
 */

export interface ExplanationPanelProps {
  analysis: DiagnosticAnalysis;
  differential: ConfirmedDifferential;
  vehicleName?: string | null;
  isSimulated: boolean;
}

interface Failure {
  message: string;
  code: string;
  violations: readonly string[];
}

export function ExplanationPanel({
  analysis,
  differential,
  vehicleName = null,
  isSimulated,
}: ExplanationPanelProps) {
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);

  async function explain() {
    setLoading(true);
    setFailure(null);

    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          context: buildDiagnosticContext({
            analysis,
            differential,
            vehicleName,
            isSimulated,
          }),
        }),
      });

      const body = (await response.json()) as {
        explanation?: AIExplanation;
        error?: string;
        code?: string;
        violations?: string[];
      };

      if (!response.ok || !body.explanation) {
        setFailure({
          message: body.error ?? `The request failed (${response.status}).`,
          code: body.code ?? 'UPSTREAM_ERROR',
          violations: body.violations ?? [],
        });
        return;
      }

      setExplanation(body.explanation);
    } catch (cause) {
      // Rule 3: say what happened rather than showing nothing.
      setFailure({
        message: cause instanceof Error ? cause.message : 'The request failed.',
        code: 'UPSTREAM_ERROR',
        violations: [],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-technical">In plain language</p>
          <p className="text-content-secondary mt-1 text-sm text-pretty">
            An optional restatement of the diagnosis above. The findings, causes and evidence are
            produced without it.
          </p>
        </div>
        {!explanation && (
          <Button size="sm" variant="secondary" onClick={() => void explain()} loading={loading}>
            {loading ? 'Explaining…' : 'Explain this'}
          </Button>
        )}
      </div>

      {failure && (
        <div
          role="alert"
          className="border-line bg-surface-sunken mt-4 rounded-md border px-3 py-3"
        >
          <p className="text-sm font-medium">
            {failure.code === 'NOT_CONFIGURED'
              ? 'No AI provider is configured'
              : failure.code === 'UNGROUNDED_RESPONSE'
                ? 'The explanation was withheld'
                : 'The explanation could not be produced'}
          </p>
          <p className="text-content-secondary mt-1 text-sm leading-relaxed text-pretty">
            {failure.message}
          </p>

          {failure.violations.length > 0 && (
            <>
              {/* Shown rather than hidden: a model that fabricated a reading
                  is something the user should know happened. */}
              <p className="label-technical mt-3">What it got wrong</p>
              <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm">
                {failure.violations.map((violation) => (
                  <li key={violation} className="text-pretty">
                    {violation}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {explanation && (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-pretty">{explanation.summary}</p>

          <p className="text-content-secondary mt-3 text-sm leading-relaxed text-pretty">
            {explanation.reasoning}
          </p>

          {explanation.caveats.length > 0 && (
            <ul className="text-content-secondary mt-3 flex list-disc flex-col gap-1.5 pl-4 text-sm">
              {explanation.caveats.map((caveat) => (
                <li key={caveat} className="text-pretty">
                  {caveat}
                </li>
              ))}
            </ul>
          )}

          <div className="border-line mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <Badge technical>{explanation.model}</Badge>
            <span className="text-content-muted text-xs text-pretty">
              Written by a language model from the structured diagnosis above, and checked against
              it before being shown. It is not the source of the diagnosis.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
