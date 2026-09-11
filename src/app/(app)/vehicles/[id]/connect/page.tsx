import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { getVehicleForOwner } from '@/services/vehicle/queries';
import { ConnectionPanel } from '@/features/connection/ConnectionPanel';

export const metadata: Metadata = { title: 'Connect vehicle' };

export default async function ConnectVehiclePage(props: PageProps<'/vehicles/[id]/connect'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const result = await getVehicleForOwner(id, userId);
  if (!result) notFound();

  const { name, spec } = result;

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-6">
        <Link
          href={`/vehicles/${id}`}
          className="text-content-secondary hover:text-content text-sm"
        >
          ← {name}
        </Link>
      </nav>

      <header className="mb-8">
        <p className="label-technical">Connect</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{name}</h1>
        {spec && <p className="text-content-secondary mt-1 text-sm">{spec}</p>}
      </header>

      {/* The panel is a Client Component: the provider runs in the browser,
          because the real adapters that replace it later (Web Bluetooth,
          WebUSB) are browser APIs. The server never sees raw telemetry. */}
      <ConnectionPanel vehicleName={name} />
    </div>
  );
}
