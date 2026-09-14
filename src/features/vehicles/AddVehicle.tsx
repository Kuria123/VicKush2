'use client';

import { useState } from 'react';

import { RecognisePanel } from './RecognisePanel';
import { VehicleForm, type VehicleFormDefaults } from './VehicleForm';
import type { ActionResult } from '@/types';

/**
 * Adding a vehicle, by photograph or by hand.
 *
 * The two are not alternative paths into the database. Recognition fills in
 * *this* form, and this form is the only way a vehicle is created — same
 * validation, same duplicate-VIN check, same everything. A second route with
 * its own rules is how the careful ones end up applying to only one of them.
 *
 * The form's inputs are uncontrolled, so accepting a proposal remounts it
 * through `key` rather than driving every field from state. That is the
 * behaviour wanted anyway: accepting proposals replaces what is in the boxes,
 * which is what the button says it does.
 */
export function AddVehicle({
  action,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [defaults, setDefaults] = useState<VehicleFormDefaults>({});
  const [generation, setGeneration] = useState(0);
  const [fromRecognition, setFromRecognition] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <RecognisePanel
        onProposed={(proposed) => {
          setDefaults(proposed);
          setFromRecognition(true);
          setGeneration((n) => n + 1);
        }}
      />

      <VehicleForm
        key={generation}
        action={action}
        defaults={defaults}
        submitLabel="Add vehicle"
        cancelHref="/vehicles"
        fromRecognition={fromRecognition}
      />
    </div>
  );
}
