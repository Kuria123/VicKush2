import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="label-technical">404</p>
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-content-secondary max-w-sm text-sm">That route does not exist.</p>
      <Link
        href="/"
        className="border-line bg-surface-raised hover:bg-surface-sunken inline-flex h-9 items-center rounded-md border px-4 text-sm transition-colors"
      >
        Return home
      </Link>
    </div>
  );
}
