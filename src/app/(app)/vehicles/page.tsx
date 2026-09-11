import type { Metadata } from 'next';

import { NotImplemented } from '@/components/layout/NotImplemented';

export const metadata: Metadata = { title: 'My Vehicles' };

export default function Page() {
  return (
    <NotImplemented
      title="My Vehicles"
      stage="Stage 4"
      description="Vehicle management arrives once the vehicle domain model is in place. Nothing is stored yet."
    />
  );
}
