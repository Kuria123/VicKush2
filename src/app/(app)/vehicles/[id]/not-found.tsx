import Link from 'next/link';

export default function VehicleNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="label-technical">Not found</p>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">Vehicle not found</h1>
      <p className="text-content-secondary mt-2 text-sm">
        It may have been removed, or it belongs to another account.
      </p>
      <Link
        href="/vehicles"
        className="border-line hover:bg-surface-sunken mt-6 inline-flex h-9 items-center rounded-md border px-4 text-sm transition-colors"
      >
        Back to My Vehicles
      </Link>
    </div>
  );
}
