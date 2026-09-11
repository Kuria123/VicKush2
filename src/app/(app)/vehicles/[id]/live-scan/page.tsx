import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { getVehicleForOwner } from '@/services/vehicle/queries';
import { LiveScanPanel } from '@/features/live-scan/LiveScanPanel';

export const metadata: Metadata = { title: 'Live scan' };

export default async function LiveScanPage(props: PageProps<'/vehicles/[id]/live-scan'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const result = await getVehicleForOwner(id, userId);
  if (!result) notFound();

  const { name, spec } = result;

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-6">
        <Link
          href={`/vehicles/${id}`}
          className="text-content-secondary hover:text-content text-sm"
        >
          ← {name}
        </Link>
      </nav>

      <header className="mb-8">
        <p className="label-technical">Live scan</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{name}</h1>
        {spec && <p className="text-content-secondary mt-1 text-sm">{spec}</p>}
      </header>

      <LiveScanPanel vehicleName={name} />
    </div>
  );
}
