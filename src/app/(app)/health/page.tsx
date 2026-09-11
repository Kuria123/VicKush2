import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Card, EmptyState } from '@/components/ui';
import { currentUserId } from '@/lib/auth';
import { listVehiclesForOwner } from '@/services/vehicle/queries';

export const metadata: Metadata = { title: 'Vehicle Health' };

/**
 * Health is always a property of one vehicle, so this page picks one rather
 * than inventing a fleet-wide score. Averaging across vehicles would produce
 * exactly the kind of unexplained number the health engine exists to avoid.
 */
export default async function Page() {
  const userId = await currentUserId();
  const vehicles = userId ? await listVehiclesForOwner(userId) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="label-technical">Health</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Vehicle health</h1>
        <p className="text-content-secondary mt-1 text-sm text-pretty">
          Scored from saved scans, with the evidence behind every number.
        </p>
      </header>

      {vehicles.length === 0 ? (
        <Card>
          <EmptyState
            eyebrow="No vehicles"
            title="Add a vehicle first"
            description="Health is calculated per vehicle from its own recorded scans."
            action={
              <Link
                href="/vehicles/new"
                className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
              >
                Add a vehicle
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <Link href={`/vehicles/${vehicle.id}/health`} className="block">
                <Card className="hover:border-accent transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{vehicle.name}</p>
                      {vehicle.spec && (
                        <p className="text-content-secondary mt-0.5 text-sm">{vehicle.spec}</p>
                      )}
                    </div>
                    {vehicle.isPrimary && <Badge tone="accent">Primary</Badge>}
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
