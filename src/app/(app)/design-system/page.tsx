import type { Metadata } from 'next';

import { DesignSystemShowcase } from '@/features/design-system/Showcase';

export const metadata: Metadata = { title: 'Design system' };

export default function DesignSystemPage() {
  return <DesignSystemShowcase />;
}
