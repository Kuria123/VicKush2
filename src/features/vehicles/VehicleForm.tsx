'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import type { Route } from 'next';

import { Button, Card, Input, Select } from '@/components/ui';
import { FUEL_LABELS, TRANSMISSION_LABELS } from '@/domain/vehicles';
import { FUEL_TYPES, TRANSMISSION_TYPES } from '@/domain/vehicles';
import type { ActionResult } from '@/types';

export interface VehicleFormDefaults {
  displayName?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  vin?: string | null;
  engineDisplacementCc?: number | null;
  fuelType?: string | null;
  transmissionType?: string | null;
}

interface VehicleFormProps<T extends string> {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults?: VehicleFormDefaults;
  submitLabel: string;
  /**
   * Generic so `typedRoutes` can infer the route literal through the prop.
   * A route that does not exist still fails the build.
   */
  cancelHref: Route<T>;
  /** Configuration fields are only offered when creating. */
  showConfiguration?: boolean;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

const blank = { value: '', label: 'Not known' };

export function VehicleForm<T extends string>({
  action,
  defaults = {},
  submitLabel,
  cancelHref,
  showConfiguration = true,
}: VehicleFormProps<T>) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const formError = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {formError && (
        <p
          role="alert"
          className="border-status-fault bg-status-fault-subtle text-status-fault rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      <Card>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Identity</h2>
        <p className="text-content-secondary mb-5 text-sm">
          Fill in what you know. Anything left blank is recorded as unknown rather than guessed.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="make"
            label="Make"
            placeholder="Toyota"
            defaultValue={defaults.make ?? ''}
            error={errors.make}
            autoComplete="off"
          />
          <Input
            name="model"
            label="Model"
            placeholder="Harrier"
            defaultValue={defaults.model ?? ''}
            error={errors.model}
            autoComplete="off"
          />
          <Input
            name="year"
            label="Year"
            type="number"
            inputMode="numeric"
            placeholder="2018"
            defaultValue={defaults.year ?? ''}
            error={errors.year}
          />
          <Input
            name="displayName"
            label="Nickname"
            placeholder="Optional"
            defaultValue={defaults.displayName ?? ''}
            error={errors.displayName}
            autoComplete="off"
          />
          <Input
            name="vin"
            label="VIN"
            placeholder="17 characters"
            defaultValue={defaults.vin ?? ''}
            error={errors.vin}
            hint="Optional. Never contains I, O or Q."
            autoComplete="off"
            className="font-mono uppercase sm:col-span-2"
          />
        </div>
      </Card>

      {showConfiguration && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Configuration</h2>
          <p className="text-content-secondary mb-5 text-sm">
            Optional. Knowing the drivetrain raises identification confidence.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="engineDisplacementCc"
              label="Engine displacement"
              type="number"
              inputMode="numeric"
              placeholder="1998"
              hint="In cubic centimetres."
              defaultValue={defaults.engineDisplacementCc ?? ''}
              error={errors.engineDisplacementCc}
            />
            <Select
              name="fuelType"
              label="Fuel"
              defaultValue={defaults.fuelType ?? ''}
              error={errors.fuelType}
              options={[
                blank,
                ...FUEL_TYPES.map((value) => ({
                  value,
                  label: FUEL_LABELS[value],
                })),
              ]}
            />
            <Select
              name="transmissionType"
              label="Transmission"
              defaultValue={defaults.transmissionType ?? ''}
              error={errors.transmissionType}
              options={[
                blank,
                ...TRANSMISSION_TYPES.map((value) => ({
                  value,
                  label: TRANSMISSION_LABELS[value],
                })),
              ]}
            />
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        <Link
          href={cancelHref}
          className="border-line hover:bg-surface-sunken inline-flex h-9 items-center rounded-md border px-4 text-sm transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
