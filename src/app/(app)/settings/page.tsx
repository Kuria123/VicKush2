import type { Metadata } from 'next';

import { NotImplemented } from '@/components/layout/NotImplemented';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <NotImplemented
      title="Settings"
      stage="Stage 26"
      description="Account and application settings are part of production hardening."
    />
  );
}
