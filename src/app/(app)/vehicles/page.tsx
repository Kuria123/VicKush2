import type { Metadata } from 'next';
import Link from 'next/link';

import { currentUserId } from '@/lib/auth';
import { listVehiclesForOwner } from '@/services/vehicle/queries';
import { IDENTIFICATION_STATUS_LABELS } from '@/domain/vehicles';
import { Badge, Card, EmptyState } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

export const metadata: Metadata = { title: 'My Vehicles' };

const STATUS_TONE: Record<string, BadgeTone> = {
  IDENTIFIED: 'ok',
  PARTIALLY_IDENTIFIED: 'warn',
  UNIDENTIFIED: 'neutral',
  CONFLICTED: 'fault',
};

export default async function VehiclesPage() {
  const userId = await currentUserId();
  const vehicles = userId ? await listVehiclesForOwner(userId) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Vehicles</h1>
          <p className="text-content-secondary mt-1 text-sm">
            {vehicles.length === 0
              ? 'No vehicles yet.'
              : `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Link
          href="/vehicles/new"
          className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex h-9 shrink-0 items-center rounded-md px-4 text-sm font-medium transition-colors"
        >
          Add vehicle
        </Link>
      </header>

      {vehicles.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="Add your first vehicle"
          description="Record what you know about it. Anything you leave blank is kept as unknown rather than guessed."
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
              <Link href={`/vehicles/${vehicle.id}`} className="block">
                <Card className="hover:border-line-strong transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold tracking-tight">{vehicle.name}</h2>
                        {vehicle.isPrimary && <Badge tone="accent">Primary</Badge>}
                      </div>

                      {vehicle.spec && (
                        <p className="text-content-secondary mt-1 text-sm">{vehicle.spec}</p>
                      )}

                      {vehicle.vin && (
                        <p className="text-content-muted mt-2 font-mono text-xs">{vehicle.vin}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={STATUS_TONE[vehicle.identificationStatus] ?? 'neutral'}>
                        {IDENTIFICATION_STATUS_LABELS[
                          vehicle.identificationStatus as keyof typeof IDENTIFICATION_STATUS_LABELS
                        ] ?? vehicle.identificationStatus}
                      </Badge>
                      <span className="text-content-muted tabular text-xs">
                        {vehicle.confidence}% confident
                      </span>
                    </div>
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
