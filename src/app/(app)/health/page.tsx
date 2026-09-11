import type { Metadata } from 'next';

import { NotImplemented } from '@/components/layout/NotImplemented';

export const metadata: Metadata = { title: 'Vehicle Health' };

export default function Page() {
  return (
    <NotImplemented
      title="Vehicle Health"
      stage="Stage 16"
      description="Health scoring depends on accumulated diagnostic history, so it comes much later."
    />
  );
}
