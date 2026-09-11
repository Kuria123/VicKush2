import type { Metadata } from 'next';
import Link from 'next/link';

import { currentUserId } from '@/lib/auth';
import { countVehiclesForOwner } from '@/services/vehicle/queries';
import { Card, Readout } from '@/components/ui';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const userId = await currentUserId();
  // The layout guarantees a session, so this is a type narrowing guard only.
  const vehicleCount = userId ? await countVehiclesForOwner(userId) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-content-secondary mt-1 text-sm">
          AutoMind is in early development. Only the values below are real.
        </p>
      </header>

      <Card>
        <Readout label="Registered vehicles" value={vehicleCount} />
        <p className="text-content-secondary mt-3 text-sm">
          {vehicleCount === 0
            ? 'No vehicles registered. Vehicle management is built in Stage 4.'
            : 'Read live from the database.'}
        </p>
      </Card>

      <section className="mt-6">
        <h2 className="font-medium">What exists today</h2>
        <ul className="text-content-secondary mt-3 flex flex-col gap-2 text-sm">
          <li>Authentication, backed by MySQL.</li>
          <li>Application shell, navigation and theming.</li>
          <li>
            The design system — see{' '}
            <Link href="/design-system" className="text-accent">
              component reference
            </Link>
            .
          </li>
          <li>
            Everything else is marked <span className="text-content-muted">Planned</span> in the
            sidebar and renders no data.
          </li>
        </ul>
      </section>
    </div>
  );
}
