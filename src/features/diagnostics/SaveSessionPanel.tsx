'use client';

import { useState } from 'react';

import { Button, Card } from '@/components/ui';
import type { ConfirmedDifferential, TestResult } from '@/domain/confirmation';
import {
  summariseForStorage,
  type DiagnosticAnalysis,
  type DiagnosticSession,
} from '@/domain/diagnostics';

/**
 * Commits a diagnosis to the vehicle's history.
 *
 * Saving is explicit rather than automatic. A scan that was abandoned halfway,
 * or run to try a scenario, should not become part of a vehicle's permanent
 * record — and a timeline cluttered with those is a timeline nobody reads.
 */

export interface SaveSessionPanelProps {
  vehicleId: string;
  session: DiagnosticSession | null;
  analysis: DiagnosticAnalysis;
  differential: ConfirmedDifferential;
  results: readonly TestResult[];
  providerName: string;
  isSimulated: boolean;
  scenario?: string | null;
  startedAt: number;
  durationMs: number;
}

type State =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; sessionId: string }
  | { status: 'failed'; message: string };

export function SaveSessionPanel({
  vehicleId,
  session,
  analysis,
  differential,
  results,
  providerName,
  isSimulated,
  scenario = null,
  startedAt,
  durationMs,
}: SaveSessionPanelProps) {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function save() {
    setState({ status: 'saving' });

    try {
      const response = await fetch(`/api/v1/vehicles/${vehicleId}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analysis,
          differential,
          results,
          providerName,
          isSimulated,
          scenario,
          startedAt,
          durationMs,
          parameterStats: session ? summariseForStorage(session) : [],
          dtcs: (session?.allDtcs() ?? []).map((dtc) => ({
            code: dtc.code,
            status: dtc.status,
            moduleAddress: dtc.moduleAddress ?? null,
            firstSeenAt: startedAt,
          })),
        }),
      });

      const body = (await response.json()) as { sessionId?: string; error?: string };

      if (!response.ok || !body.sessionId) {
        setState({
          status: 'failed',
          message: body.error ?? `The save failed (${response.status}).`,
        });
        return;
      }

      setState({ status: 'saved', sessionId: body.sessionId });
    } catch (cause) {
      setState({
        status: 'failed',
        message: cause instanceof Error ? cause.message : 'The save failed.',
      });
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-technical">Vehicle history</p>
          <p className="text-content-secondary mt-1 text-sm text-pretty">
            {state.status === 'saved'
              ? 'This diagnosis is now part of the vehicle’s record, exactly as it was reached.'
              : 'Nothing is stored until you say so. A scan run to try something out should not become permanent history.'}
          </p>
        </div>

        {state.status !== 'saved' && (
          <Button
            size="sm"
            onClick={() => void save()}
            loading={state.status === 'saving'}
            disabled={analysis.sampleCount === 0}
          >
            {state.status === 'saving' ? 'Saving…' : 'Save to history'}
          </Button>
        )}
      </div>

      {state.status === 'saved' && (
        <p className="mt-3 text-sm">
          <a className="text-accent hover:underline" href={`/vehicles/${vehicleId}/history`}>
            View the vehicle’s timeline →
          </a>
        </p>
      )}

      {state.status === 'failed' && (
        <p
          role="alert"
          className="border-status-fault bg-status-fault-subtle text-status-fault mt-3 rounded-md border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      )}
    </Card>
  );
}
