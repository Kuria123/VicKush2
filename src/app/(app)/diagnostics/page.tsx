import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, EmptyState } from '@/components/ui';
import { currentUserId } from '@/lib/auth';
import { listVehiclesForOwner } from '@/services/vehicle/queries';

export const metadata: Metadata = { title: 'Diagnostics' };

/**
 * There is no standalone diagnostic history yet, and this page says so rather
 * than showing an empty list that implies there could be one.
 *
 * A diagnosis is produced from a recorded session, and sessions live only in
 * the browser until Stage 15 persists them. So the honest thing this page can
 * do is send the user to the vehicle that would produce one.
 */
export default async function Page() {
  const userId = await currentUserId();
  const vehicles = userId ? await listVehiclesForOwner(userId) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="label-technical">Diagnostics</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Diagnoses</h1>
      </header>

      <Card>
        <EmptyState
          eyebrow="Nothing stored yet"
          title="A diagnosis comes from a scan"
          description={
            <>
              <p>
                Readings are interpreted into findings, ranked causes and confirmation tests on the
                Diagnosis tab of a vehicle&apos;s live scan.
              </p>
              <p className="mt-3">
                Past diagnoses are not listed here because nothing is saved yet — sessions are held
                in the browser until vehicle memory is built.
              </p>
            </>
          }
          action={
            vehicles.length > 0 ? (
              <Link
                href={`/vehicles/${vehicles[0]!.id}/live-scan`}
                className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
              >
                Scan {vehicles[0]!.name}
              </Link>
            ) : (
              <Link
                href="/vehicles/new"
                className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
              >
                Add a vehicle
              </Link>
            )
          }
        />
      </Card>
    </div>
  );
}
