'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the browser console only; server-side logging happens in the
    // service layer where the failure originates.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p
        className="font-mono text-xs tracking-widest uppercase"
        style={{ color: 'var(--color-status-fault)' }}
      >
        Error
      </p>
      <h1 className="text-xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
        The page could not be rendered.
        {error.digest ? ` Reference: ${error.digest}` : ''}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
      >
        Try again
      </button>
    </div>
  );
}
