import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { auth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { SIGN_IN_PATH } from '@/lib/auth/routes';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // The proxy already gates these routes; this is defence in depth so a
  // server component can never render without a session.
  if (!session?.user) {
    redirect(SIGN_IN_PATH);
  }

  const userLabel = session.user.name ?? session.user.email ?? 'Signed in';

  return <AppShell userLabel={userLabel}>{children}</AppShell>;
}
