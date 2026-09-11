'use client';

import { useActionState } from 'react';

import { Button, Card, Input } from '@/components/ui';
import type { ActionResult } from '@/types';

import { logMaintenanceAction } from './actions';

/**
 * Owner-entered maintenance.
 *
 * The only history this build has that predates its own scans, and the reason
 * a timeline can span months rather than one afternoon. The odometer is
 * optional and stays NULL when blank — a mileage nobody supplied is not
 * estimated (Rule 1).
 */
export function MaintenanceForm({ vehicleId }: { vehicleId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    logMaintenanceAction,
    null,
  );

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors?.[name] : undefined;

  return (
    <Card>
      <p className="label-technical">Log something that was done</p>
      <p className="text-content-secondary mt-1 mb-4 text-sm text-pretty">
        A service, a part fitted, anything you already know about. It joins the timeline at the
        date it happened.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="vehicleId" value={vehicleId} />

        <Input
          label="What was done"
          name="title"
          maxLength={120}
          placeholder="Routine service"
          required
          error={fieldError('title')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="When"
            name="performedAt"
            type="date"
            required
            error={fieldError('performedAt')}
          />

          <Input
            label="Odometer (km)"
            name="odometerKm"
            type="number"
            min={0}
            inputMode="numeric"
            hint="Leave blank if you do not know."
            error={fieldError('odometerKm')}
          />
        </div>

        <Input
          label="Notes"
          name="notes"
          maxLength={1000}
          placeholder="Oil and filter."
          hint="Optional."
        />

        {state && !state.ok && (
          <p role="alert" className="text-status-fault text-sm">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="text-status-ok text-sm">
            Added to the timeline.
          </p>
        )}

        <div>
          <Button type="submit" loading={pending}>
            Add to timeline
          </Button>
        </div>
      </form>
    </Card>
  );
}
