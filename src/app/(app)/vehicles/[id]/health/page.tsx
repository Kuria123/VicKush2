import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HealthPanel } from '@/features/health/HealthPanel';
import { currentUserId } from '@/lib/auth';
import { getVehicleHealth } from '@/services/health/service';
import { getVehicleForOwner } from '@/services/vehicle/queries';

export const metadata: Metadata = { title: 'Vehicle health' };

export default async function VehicleHealthPage(props: PageProps<'/vehicles/[id]/health'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const vehicle = await getVehicleForOwner(id, userId);
  if (!vehicle) notFound();

  const health = await getVehicleHealth(id, userId);

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-6">
        <Link href={`/vehicles/${id}`} className="text-content-secondary hover:text-content text-sm">
          ← {vehicle.name}
        </Link>
      </nav>

      <header className="mb-8">
        <p className="label-technical">Health</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{vehicle.name}</h1>
        <p className="text-content-secondary mt-1 text-sm text-pretty">
          Calculated from saved scans. Every score is the sum of the reasons shown beneath it.
        </p>
      </header>

      <HealthPanel health={health} />
    </div>
  );
}
