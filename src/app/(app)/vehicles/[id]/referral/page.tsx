import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card, CardHeader } from '@/components/ui';
import { ReferralPanel } from '@/features/referral/ReferralPanel';
import { currentUserId } from '@/lib/auth';
import { buildReferralForVehicle } from '@/services/referral/service';
import { resolveMarketplaceProvider } from '@/services/marketplace/registry';

export const metadata: Metadata = { title: 'Report for a mechanic' };

export default async function ReferralPage(props: PageProps<'/vehicles/[id]/referral'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const referral = await buildReferralForVehicle({ vehicleId: id, ownerId: userId });
  if (!referral.ok) notFound();

  const marketplace = resolveMarketplaceProvider().describe();

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-6">
        <Link href={`/vehicles/${id}`} className="text-content-secondary hover:text-content text-sm">
          ← {referral.report.vehicle.name}
        </Link>
      </nav>

      <header className="mb-8">
        <p className="label-technical">Report for a mechanic</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {referral.report.vehicle.name}
        </h1>
        <p className="text-content-secondary mt-1 text-sm text-pretty">
          Everything recorded about this vehicle, in the order a mechanic reads it. A workshop that
          receives this starts from measurements instead of from a description of a noise.
        </p>
      </header>

      <ReferralPanel
        vehicleId={id}
        initialText={referral.text}
        isSimulated={referral.report.scan?.isSimulated ?? false}
      />

      <div className="mt-10">
        <Card>
          <CardHeader
            title="Finding a mechanic"
            description="Where a directory of workshops, service centres and parts suppliers would appear."
          />

          {/*
           * No listings, and the reason stated. A seeded list of plausible
           * garages would make this section look finished and would send
           * somebody to an address that does not exist — the one fabrication
           * in this product that ends with a person in a car (Rule 1).
           */}
          <p className="text-content-secondary text-sm leading-relaxed">
            {marketplace.name}. No mechanics, service centres or parts suppliers are listed here,
            because none are known to this build — not because there are none near you. Booking is
            unavailable for the same reason: an appointment reference invented here would be an
            appointment nobody has.
          </p>

          <p className="text-content-secondary mt-3 text-sm leading-relaxed">
            The report above does not need any of that. Copy it and send it to whichever workshop
            you already use.
          </p>
        </Card>
      </div>
    </div>
  );
}
