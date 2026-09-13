'use client';

import { useActionState } from 'react';

import { Badge, Button, Card, Input, Select } from '@/components/ui';
import type { VerificationResult, VerificationVerdict } from '@/domain/verification';
import type { SessionSummaryRow } from '@/services/diagnostics/history';
import type { ActionResult } from '@/types';

import { recordRepairAction, verifyRepairAction } from './repair-actions';

/**
 * Repairs and their verification.
 *
 * The before scan is chosen when the repair is recorded, not afterwards. A
 * repair recorded with nothing captured beforehand cannot be verified against
 * anything, and the form refuses rather than accepting one that can never be
 * checked.
 *
 * The verdict is presented with its caveats attached, never on its own. A
 * positive result is the one most likely to be acted on, so it is the one that
 * most needs its limits visible.
 */

export interface StoredRepair {
  id: string;
  performedAt: Date;
  summary: string;
  notes: string | null;
  verdict: VerificationVerdict | null;
  verifiedAt: Date | null;
  beforeSessionId: string;
  afterSessionId: string | null;
  comparison: unknown;
}

export interface RepairPanelProps {
  vehicleId: string;
  repairs: readonly StoredRepair[];
  sessions: readonly SessionSummaryRow[];
}

const VERDICT_LABEL: Record<VerificationVerdict, string> = {
  CONSISTENT_WITH_REPAIR: 'Consistent with the repair',
  NOT_DEMONSTRATED: 'No change demonstrated',
  WORSENED: 'Something is worse',
  INCONCLUSIVE: 'Could not be compared',
};

const VERDICT_TONE = {
  CONSISTENT_WITH_REPAIR: 'ok',
  NOT_DEMONSTRATED: 'warn',
  WORSENED: 'fault',
  INCONCLUSIVE: 'neutral',
} as const;

export function RepairPanel({ vehicleId, repairs, sessions }: RepairPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {repairs.map((repair) => (
        <RepairCard
          key={repair.id}
          vehicleId={vehicleId}
          repair={repair}
          sessions={sessions}
        />
      ))}

      <RecordRepairForm vehicleId={vehicleId} sessions={sessions} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Recording
 * ---------------------------------------------------------------------- */

function RecordRepairForm({
  vehicleId,
  sessions,
}: {
  vehicleId: string;
  sessions: readonly SessionSummaryRow[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    recordRepairAction,
    null,
  );

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors?.[name] : undefined;

  if (sessions.length === 0) {
    return (
      <Card surface="sunken">
        <p className="label-technical">Record a repair</p>
        <p className="text-content-secondary mt-2 text-sm leading-relaxed text-pretty">
          A repair is recorded against the scan taken before it, so there is something to verify
          it against. Save a scan to this vehicle first.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="label-technical">Record a repair</p>
      <p className="text-content-secondary mt-1 mb-4 text-sm text-pretty">
        Choose the scan taken before the work. Once you scan again afterwards, the two can be
        compared.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="vehicleId" value={vehicleId} />

        <Input
          label="What was repaired"
          name="summary"
          maxLength={160}
          placeholder="Intake hose replaced"
          required
          error={fieldError('summary')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="When"
            name="performedAt"
            type="date"
            required
            error={fieldError('performedAt')}
          />

          <Select
            label="Scan taken before the work"
            name="beforeSessionId"
            required
            error={fieldError('beforeSessionId')}
            options={[
              { value: '', label: 'Choose a scan…' },
              ...sessions.map((session) => ({
                value: session.id,
                label: `${formatDate(session.startedAt)} — ${session.findingCount} finding${session.findingCount === 1 ? '' : 's'}`,
              })),
            ]}
          />
        </div>

        <Input label="Notes" name="notes" maxLength={1000} hint="Optional." />

        {state && !state.ok && (
          <p role="alert" className="text-status-fault text-sm">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="text-status-ok text-sm">
            Repair recorded.
          </p>
        )}

        <div>
          <Button type="submit" loading={pending}>
            Record repair
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * One repair
 * ---------------------------------------------------------------------- */

function RepairCard({
  vehicleId,
  repair,
  sessions,
}: {
  vehicleId: string;
  repair: StoredRepair;
  sessions: readonly SessionSummaryRow[];
}) {
  const verification = asVerification(repair.comparison);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge technical>Repair</Badge>
            {repair.verdict && (
              <Badge tone={VERDICT_TONE[repair.verdict]}>{VERDICT_LABEL[repair.verdict]}</Badge>
            )}
          </div>
          <h4 className="text-base font-semibold tracking-tight text-balance">
            {repair.summary}
          </h4>
          {repair.notes && (
            <p className="text-content-secondary mt-1 text-sm text-pretty">{repair.notes}</p>
          )}
        </div>
        <time className="tabular text-content-muted shrink-0 text-xs">
          {formatDate(repair.performedAt)}
        </time>
      </div>

      {verification ? (
        <Verification result={verification} />
      ) : (
        <VerifyForm vehicleId={vehicleId} repair={repair} sessions={sessions} />
      )}
    </Card>
  );
}

function VerifyForm({
  vehicleId,
  repair,
  sessions,
}: {
  vehicleId: string;
  repair: StoredRepair;
  sessions: readonly SessionSummaryRow[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    verifyRepairAction,
    null,
  );

  // The before scan is excluded: comparing a scan with itself would produce a
  // flawless result from nothing.
  const candidates = sessions.filter((session) => session.id !== repair.beforeSessionId);

  return (
    <div className="border-line mt-4 border-t pt-4">
      {candidates.length === 0 ? (
        <p className="text-content-secondary text-sm leading-relaxed text-pretty">
          Scan the vehicle again and save it, then this repair can be verified against it.
        </p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-3" noValidate>
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <input type="hidden" name="repairId" value={repair.id} />

          <div className="min-w-0 flex-1">
            <Select
              label="Scan taken after the work"
              name="afterSessionId"
              required
              options={[
                { value: '', label: 'Choose a scan…' },
                ...candidates.map((session) => ({
                  value: session.id,
                  label: `${formatDate(session.startedAt)} — ${session.findingCount} finding${session.findingCount === 1 ? '' : 's'}`,
                })),
              ]}
            />
          </div>

          <Button type="submit" variant="secondary" loading={pending}>
            Verify
          </Button>

          {state && !state.ok && (
            <p role="alert" className="text-status-fault w-full text-sm text-pretty">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The conclusion
 * ---------------------------------------------------------------------- */

function Verification({ result }: { result: VerificationResult }) {
  return (
    <div className="border-line mt-4 border-t pt-4">
      <p className="text-sm leading-relaxed text-pretty">{result.summary}</p>

      {result.parameters.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Readings before and after the repair</caption>
            <thead>
              <tr className="text-content-secondary border-line border-b text-left">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Reading
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Condition
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Before
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  After
                </th>
              </tr>
            </thead>
            <tbody>
              {result.parameters.map((change) => (
                <tr
                  key={`${change.parameterId}-${change.condition}`}
                  className="border-line border-b last:border-0"
                >
                  <td className="py-1.5 pr-3">{change.label}</td>
                  <td className="text-content-secondary py-1.5 pr-3">
                    {change.condition.toLowerCase().replace(/_/g, ' ')}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {change.before}
                    {change.unit === '%' ? '%' : ''}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    <span
                      className={
                        !change.significant
                          ? 'text-content-secondary'
                          : change.direction === 'IMPROVED'
                            ? 'text-status-ok'
                            : 'text-status-fault'
                      }
                    >
                      {change.after}
                      {change.unit === '%' ? '%' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.reasoning.length > 0 && (
        <ul className="text-content-secondary mt-4 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
          {result.reasoning.map((line) => (
            <li key={line} className="text-pretty">
              {line}
            </li>
          ))}
        </ul>
      )}

      {/* Never collapsed. A positive result is the one most likely to be acted
          on, so it is the one that most needs its limits visible. */}
      <div className="border-line mt-4 border-t pt-3">
        <p className="label-technical">What this does not establish</p>
        <ul className="text-content-secondary mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
          {result.caveats.map((caveat) => (
            <li key={caveat} className="text-pretty">
              {caveat}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The stored comparison is JSON, so its shape is checked rather than asserted.
 * A row written by an older release must not crash the history page.
 */
function asVerification(value: unknown): VerificationResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<VerificationResult>;
  if (typeof candidate.summary !== 'string') return null;
  if (!Array.isArray(candidate.caveats) || candidate.caveats.length === 0) return null;
  if (!Array.isArray(candidate.parameters)) return null;
  return candidate as VerificationResult;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
