import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { getVehicleForOwner } from '@/services/vehicle/queries';
import { updateVehicleAction } from '@/features/vehicles/actions';
import { VehicleForm } from '@/features/vehicles/VehicleForm';

export const metadata: Metadata = { title: 'Edit vehicle' };

export default async function EditVehiclePage(props: PageProps<'/vehicles/[id]/edit'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const result = await getVehicleForOwner(id, userId);
  if (!result) notFound();

  const { vehicle, name } = result;

  // Binds the id server-side, so the action never trusts a vehicle id
  // submitted by the client.
  const action = updateVehicleAction.bind(null, vehicle.id);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="label-technical">Edit</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{name}</h1>
      </header>

      <VehicleForm
        action={action}
        submitLabel="Save changes"
        cancelHref={`/vehicles/${vehicle.id}`}
        showConfiguration={false}
        defaults={{
          displayName: vehicle.displayName,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin,
        }}
      />
    </div>
  );
}
