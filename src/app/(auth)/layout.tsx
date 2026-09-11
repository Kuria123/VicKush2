import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-12">
      <div aria-hidden="true" className="automind-grid absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: 'var(--color-signal-500)' }}
          />
          <span className="text-sm font-semibold tracking-tight">AutoMind</span>
        </Link>
        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ backgroundColor: 'var(--surface-raised)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
