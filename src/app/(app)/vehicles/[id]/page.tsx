import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentUserId } from '@/lib/auth';
import { getVehicleForOwner } from '@/services/vehicle/queries';
import {
  FUEL_LABELS,
  OBD_PROTOCOL_LABELS,
  TRANSMISSION_LABELS,
  formatDisplacement,
} from '@/domain/vehicles';
import { Badge, Card, Readout } from '@/components/ui';
import { IdentificationPanel } from '@/features/vehicles/IdentificationPanel';
import { DeleteVehicleButton, SetPrimaryButton } from '@/features/vehicles/VehicleControls';

export const metadata: Metadata = { title: 'Vehicle' };

/**
 * Vehicle profile.
 *
 * The health, scan and maintenance figures shown in the product brief have no
 * data source yet, so they render their unavailable state rather than a
 * plausible number (Rule 1). Each names the stage that will supply it. The
 * same applies to the actions: a control that cannot work is disabled and
 * says why, instead of appearing functional.
 */
export default async function VehiclePage(props: PageProps<'/vehicles/[id]'>) {
  const { id } = await props.params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const result = await getVehicleForOwner(id, userId);
  if (!result) notFound();

  const { vehicle, name, spec, assessment } = result;
  const config = vehicle.configuration;

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-6">
        <Link href="/vehicles" className="text-content-secondary hover:text-content text-sm">
          ← My Vehicles
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            {vehicle.isPrimary && <Badge tone="accent">Primary</Badge>}
          </div>
          {spec && <p className="text-content-secondary mt-1.5">{spec}</p>}
          {vehicle.vin && (
            <p className="text-content-muted mt-2 font-mono text-xs">VIN {vehicle.vin}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!vehicle.isPrimary && <SetPrimaryButton vehicleId={vehicle.id} />}
          <Link
            href={`/vehicles/${vehicle.id}/edit`}
            className="border-line hover:bg-surface-sunken inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors"
          >
            Edit
          </Link>
          <DeleteVehicleButton vehicleId={vehicle.id} vehicleName={name} />
        </div>
      </header>

      {/* Status strip — every figure here is genuinely unavailable today. */}
      <Card className="mb-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Readout label="Health" state="UNAVAILABLE" />
          <Readout label="Last scan" state="UNAVAILABLE" />
          <Readout label="Active issues" state="UNAVAILABLE" />
          <Readout label="Maintenance" state="UNAVAILABLE" />
        </div>
        <p className="text-content-muted border-line mt-5 border-t pt-4 text-xs">
          No scan has ever been run, so there is nothing to report. Health scoring arrives in Stage
          16, diagnostics in Stage 9, and maintenance tracking in Stage 21.
        </p>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <IdentificationPanel assessment={assessment} />

        <Card>
          <p className="label-technical">Configuration</p>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <Spec
              label="Engine"
              value={
                config?.engineCode ??
                (config?.engineDisplacementCc
                  ? formatDisplacement(config.engineDisplacementCc)
                  : null)
              }
            />
            <Spec label="Fuel" value={config?.fuelType ? FUEL_LABELS[config.fuelType] : null} />
            <Spec
              label="Transmission"
              value={config?.transmissionType ? TRANSMISSION_LABELS[config.transmissionType] : null}
            />
            <Spec label="Drive" value={config?.driveType ?? null} />
            <Spec label="ECU" value={config?.ecuName ?? null} />
            <Spec
              label="OBD protocol"
              value={config?.obdProtocol ? OBD_PROTOCOL_LABELS[config.obdProtocol] : null}
            />
          </dl>
        </Card>
      </div>

      <Card className="mb-6">
        <p className="label-technical">Modules</p>
        {vehicle.modules.length === 0 ? (
          <p className="text-content-secondary mt-3 text-sm">
            No modules discovered. Module discovery runs when the vehicle is connected, which
            arrives in Stage 7.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {vehicle.modules.map((module) => (
              <li key={module.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{module.name}</span>
                <Badge technical>{module.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="label-technical">Actions</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/vehicles/${vehicle.id}/connect`}
            className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
          >
            Connect vehicle
          </Link>
          <Link
            href={`/vehicles/${vehicle.id}/live-scan`}
            className="border-line hover:bg-surface-sunken inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors"
          >
            Live scan
          </Link>
          <Link
            href={`/vehicles/${vehicle.id}/history`}
            className="border-line hover:bg-surface-sunken inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors"
          >
            History
          </Link>
          <Link
            href={`/vehicles/${vehicle.id}/health`}
            className="border-line hover:bg-surface-sunken inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors"
          >
            Health
          </Link>
          <Link
            href={`/vehicles/${vehicle.id}/referral`}
            className="border-line hover:bg-surface-sunken inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors"
          >
            Report for a mechanic
          </Link>
        </div>
        <p className="text-content-muted mt-4 text-xs">
          Connecting uses a simulated vehicle and says so on screen. A diagnosis is produced from a
          live scan, so it is reached through that rather than as a separate action.
        </p>
      </Card>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-content-secondary">{label}</dt>
      <dd className={value ? 'font-medium' : 'text-content-muted'}>{value ?? 'Not known'}</dd>
    </div>
  );
}
