'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui';

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
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="label-technical text-status-fault">Error</p>
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-content-secondary max-w-sm text-sm">
        The page could not be rendered.
        {error.digest ? ` Reference: ${error.digest}` : ''}
      </p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
