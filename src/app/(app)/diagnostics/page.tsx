import type { Metadata } from 'next';

import { NotImplemented } from '@/components/layout/NotImplemented';

export const metadata: Metadata = { title: 'Diagnostics' };

export default function Page() {
  return (
    <NotImplemented
      title="Diagnostics"
      stage="Stage 9"
      description="Diagnostic analysis is built after the vehicle simulator and live scan engine."
    />
  );
}
