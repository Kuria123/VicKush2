import Link from 'next/link';

import { auth } from '@/lib/auth';

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div aria-hidden="true" className="automind-grid automind-grid-fade absolute inset-0" />

      <main className="relative max-w-xl text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span aria-hidden="true" className="bg-telemetry-mark size-2 rounded-full" />
          <span className="font-semibold tracking-tight">AutoMind</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Vehicle diagnostic intelligence
        </h1>

        <p className="text-content-secondary mx-auto mt-4 max-w-md leading-relaxed">
          A structured diagnostic platform built on evidence, not guesswork. Currently in early
          development.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex h-11 items-center rounded-md px-5 font-medium transition-colors"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex h-11 items-center rounded-md px-5 font-medium transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="border-line bg-surface-raised hover:bg-surface-sunken inline-flex h-11 items-center rounded-md border px-5 font-medium transition-colors"
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
