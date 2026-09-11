import type { Metadata } from 'next';

import { createVehicleAction } from '@/features/vehicles/actions';
import { VehicleForm } from '@/features/vehicles/VehicleForm';

export const metadata: Metadata = { title: 'Add vehicle' };

export default function NewVehiclePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="label-technical">New</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Add vehicle</h1>
      </header>

      <VehicleForm action={createVehicleAction} submitLabel="Add vehicle" cancelHref="/vehicles" />
    </div>
  );
}
