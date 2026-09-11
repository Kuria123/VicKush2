import type { Metadata } from 'next';
import Link from 'next/link';

import { currentUserId } from '@/lib/auth';
import { countVehiclesForOwner } from '@/services/vehicle/queries';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const userId = await currentUserId();
  // The layout guarantees a session, so this is a type narrowing guard only.
  const vehicleCount = userId ? await countVehiclesForOwner(userId) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          AutoMind is in early development. Only the values below are real.
        </p>
      </header>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--surface-raised)' }}
      >
        <p
          className="font-mono text-xs tracking-widest uppercase"
          style={{ color: 'var(--text-muted)' }}
        >
          Registered vehicles
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {vehicleCount}
        </p>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {vehicleCount === 0
            ? 'No vehicles registered. Vehicle management is built in Stage 4.'
            : 'Read live from the database.'}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium">What exists today</h2>
        <ul
          className="mt-3 flex flex-col gap-2 text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <li>Authentication, backed by MySQL.</li>
          <li>Application shell and navigation.</li>
          <li>
            Everything else is marked{' '}
            <span style={{ color: 'var(--text-muted)' }}>Planned</span> in the
            sidebar and renders no data.
          </li>
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/vehicles" style={{ color: 'var(--accent)' }}>
            See the roadmap for vehicles →
          </Link>
        </p>
      </section>
    </div>
  );
}
