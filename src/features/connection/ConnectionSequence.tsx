'use client';

import { Check, CircleDashed, Minus, X } from 'lucide-react';

import { Spinner, StatusIndicator } from '@/components/ui';
import { cn } from '@/lib/utilities/cn';

import { PHASE_LABELS, type PhaseState } from './types';

/**
 * The discovery sequence, one row per real operation.
 *
 * A skipped step is shown as skipped rather than as a tick, because the
 * difference between "the adapter cannot do this" and "this succeeded" is
 * exactly what the user needs in order to trust the rest.
 */
export function ConnectionSequence({ phases }: { phases: readonly PhaseState[] }) {
  return (
    <ol className="flex flex-col">
      {phases.map((phase, index) => (
        <li
          key={phase.id}
          className={cn(
            'flex items-start gap-3 py-2.5',
            index < phases.length - 1 && 'border-line border-b',
          )}
        >
          <PhaseIcon status={phase.status} />

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-sm',
                phase.status === 'PENDING' && 'text-content-muted',
                phase.status === 'ACTIVE' && 'font-medium',
                phase.status === 'FAILED' && 'text-status-fault font-medium',
              )}
            >
              {PHASE_LABELS[phase.id]}
            </p>
            {phase.detail && (
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  phase.status === 'FAILED' ? 'text-status-fault' : 'text-content-secondary',
                )}
              >
                {phase.detail}
              </p>
            )}
          </div>

          {phase.status === 'SKIPPED' && <span className="label-technical shrink-0">Skipped</span>}
        </li>
      ))}
    </ol>
  );
}

function PhaseIcon({ status }: { status: PhaseState['status'] }) {
  const base = 'mt-0.5 size-4 shrink-0';

  switch (status) {
    case 'ACTIVE':
      return <Spinner size="sm" className={cn(base, 'text-accent')} />;
    case 'DONE':
      return <Check className={cn(base, 'text-status-ok')} aria-label="Done" />;
    case 'SKIPPED':
      return <Minus className={cn(base, 'text-content-muted')} aria-label="Skipped" />;
    case 'FAILED':
      return <X className={cn(base, 'text-status-fault')} aria-label="Failed" />;
    default:
      return <CircleDashed className={cn(base, 'text-content-muted')} aria-label="Pending" />;
  }
}

/** The compact status strip the brief asks for. */
export function ConnectionStatus({
  connected,
  vehicleName,
  ecuDetected,
  modulesResponding,
  modulesFound,
  parameterCount,
  isSimulated,
}: {
  connected: boolean;
  vehicleName: string;
  ecuDetected: boolean;
  modulesResponding: number | null;
  modulesFound: number | null;
  parameterCount: number | null;
  isSimulated: boolean;
}) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Connection">
        <StatusIndicator
          tone={connected ? 'live' : 'idle'}
          label={connected ? 'Connected' : 'Not connected'}
          pulse={connected}
        />
      </Field>

      <Field label="Vehicle">
        <span className="font-medium">{vehicleName}</span>
      </Field>

      <Field label="ECU">
        <span className={ecuDetected ? 'font-medium' : 'text-content-muted'}>
          {ecuDetected ? 'Detected' : 'Not read'}
        </span>
      </Field>

      <Field label="Modules">
        {modulesFound === null ? (
          <span className="text-content-muted">Not discovered</span>
        ) : (
          <span className="font-medium">
            {modulesResponding} of {modulesFound} responding
          </span>
        )}
      </Field>

      <Field label="Mode">
        <span className={isSimulated ? 'text-status-warn font-medium' : 'font-medium'}>
          {isSimulated ? 'SIMULATION' : 'Live vehicle'}
        </span>
        {parameterCount !== null && (
          <span className="text-content-muted mt-0.5 block text-xs">
            {parameterCount} parameters
          </span>
        )}
      </Field>
    </dl>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-technical">{label}</dt>
      <dd className="mt-1.5 text-sm">{children}</dd>
    </div>
  );
}
