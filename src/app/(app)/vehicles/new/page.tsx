import type { Metadata } from 'next';

import { createVehicleAction } from '@/features/vehicles/actions';
import { AddVehicle } from '@/features/vehicles/AddVehicle';

export const metadata: Metadata = { title: 'Add vehicle' };

export default function NewVehiclePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="label-technical">New</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Add vehicle</h1>
        <p className="text-content-secondary mt-1 text-sm text-pretty">
          Photograph the vehicle and let it fill the form in, or type it yourself. Either way,
          what is saved is what you confirm.
        </p>
      </header>

      <AddVehicle action={createVehicleAction} />
    </div>
  );
}
