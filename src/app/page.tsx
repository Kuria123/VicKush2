import Link from 'next/link';

import { auth } from '@/lib/auth';

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div aria-hidden="true" className="automind-grid absolute inset-0" />

      <main className="relative max-w-xl text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: 'var(--color-signal-500)' }}
          />
          <span className="text-sm font-semibold tracking-tight">AutoMind</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Vehicle diagnostic intelligence
        </h1>

        <p
          className="mx-auto mt-4 max-w-md text-sm leading-relaxed sm:text-base"
          style={{ color: 'var(--text-secondary)' }}
        >
          A structured diagnostic platform built on evidence, not guesswork. Currently in early
          development.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
