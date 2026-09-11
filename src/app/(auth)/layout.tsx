import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-12">
      <div aria-hidden="true" className="automind-grid automind-grid-fade absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span aria-hidden="true" className="bg-telemetry-mark size-2 rounded-full" />
          <span className="font-semibold tracking-tight">AutoMind</span>
        </Link>
        <div className="border-line bg-surface-raised rounded-lg border p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
