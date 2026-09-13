import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '@/components/ui';
import { MaintenanceForm } from '@/features/history/MaintenanceForm';
import { QuotePanel } from '@/features/history/QuotePanel';
import { RepairPanel } from '@/features/history/RepairPanel';
import { Timeline } from '@/features/history/Timeline';
import { currentUserId } from '@/lib/auth';
import { listSessions, listTimeline } from '@/services/diagnostics/history';
import { listRepairs } from '@/services/diagnostics/verification';
import { getQuoteComparison } from '@/services/cost/quotes';
import { getVehicleForOwner } from '@/services/vehicle/queries';

export const metadata: Metadata = { title: 'Vehicle history' };

/**
 * The vehicle's history.
 *
 * Read on the server, because this is the first screen in the product whose
 * content comes from the database rather than from a live session in the
 * browser. That is the whole point of vehicle memory: the vehicle is now a
 * long-term data object, and its history survives the page that made it.
 */
export default async function HistoryPage(props: PageProps<'/vehicles/[id]/history'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const vehicle = await getVehicleForOwner(id, userId);
  if (!vehicle) notFound();

  const [entries, sessions, repairs, quotes] = await Promise.all([
    listTimeline(id, userId),
    listSessions(id, userId),
    listRepairs(id, userId),
    getQuoteComparison(id, userId),
  ]);

  const simulated = sessions.filter((session) => session.isSimulated).length;

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-6">
        <Link href={`/vehicles/${id}`} className="text-content-secondary hover:text-content text-sm">
          ← {vehicle.name}
        </Link>
      </nav>

      <header className="mb-8">
        <p className="label-technical">History</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{vehicle.name}</h1>
        {vehicle.spec && (
          <p className="text-content-secondary mt-1 text-sm">{vehicle.spec}</p>
        )}
      </header>

      {/* Rule 2: if any of this history came from a simulator, the page that
          presents it has to say so — a stored reading does not stop being
          simulated because time has passed. */}
      {simulated > 0 && (
        <Card surface="sunken" className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="warn" technical>
              Simulation mode
            </Badge>
            <p className="text-content-secondary text-sm text-pretty">
              {simulated === sessions.length
                ? 'Every scan in this history came from a simulated vehicle.'
                : `${simulated} of ${sessions.length} scans in this history came from a simulated vehicle.`}
            </p>
          </div>
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Scans recorded" value={sessions.length.toLocaleString()} />
        <Stat
          label="Timeline entries"
          value={entries.length.toLocaleString()}
        />
        <Stat
          label="First recorded"
          value={
            entries.length > 0
              ? entries[entries.length - 1]!.occurredAt.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '—'
          }
        />
      </div>

      <div className="mb-10">
        <Timeline entries={entries} />
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Repairs and verification</h2>
        <RepairPanel vehicleId={id} repairs={repairs} sessions={sessions} />
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Quotes</h2>
        <QuotePanel vehicleId={id} comparison={quotes} />
      </section>

      <MaintenanceForm vehicleId={id} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="label-technical">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
