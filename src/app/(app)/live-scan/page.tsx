import type { Metadata } from 'next';
import Link from 'next/link';

import { currentUserId } from '@/lib/auth';
import { listVehiclesForOwner } from '@/services/vehicle/queries';
import { Card, EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'Live Scan' };

/**
 * A live scan belongs to a vehicle, so this page picks one rather than
 * pretending a scan can exist on its own.
 */
export default async function LiveScanIndexPage() {
  const userId = await currentUserId();
  const vehicles = userId ? await listVehiclesForOwner(userId) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Live Scan</h1>
        <p className="text-content-secondary mt-1 text-sm">
          Choose a vehicle to stream live data from.
        </p>
      </header>

      {vehicles.length === 0 ? (
        <EmptyState
          eyebrow="No vehicles"
          title="Add a vehicle first"
          description="A live scan reads from a specific vehicle, so there needs to be one to read."
          action={
            <Link
              href="/vehicles/new"
              className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
            >
              Add vehicle
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <Link href={`/vehicles/${vehicle.id}/live-scan`} className="block">
                <Card className="hover:border-line-strong transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold tracking-tight">{vehicle.name}</p>
                      {vehicle.spec && (
                        <p className="text-content-secondary mt-0.5 text-sm">{vehicle.spec}</p>
                      )}
                    </div>
                    <span className="text-accent shrink-0 text-sm">Scan →</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
