import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p
        className="font-mono text-xs tracking-widest uppercase"
        style={{ color: 'var(--text-muted)' }}
      >
        404
      </p>
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
        That route does not exist.
      </p>
      <Link
        href="/"
        className="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
      >
        Return home
      </Link>
    </div>
  );
}
