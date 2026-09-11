import type { Metadata } from 'next';

import { NotImplemented } from '@/components/layout/NotImplemented';

export const metadata: Metadata = { title: 'Live Scan' };

export default function Page() {
  return (
    <NotImplemented
      title="Live Scan"
      stage="Stage 8"
      description="Live telemetry requires the vehicle data provider and simulator to exist first."
    />
  );
}
