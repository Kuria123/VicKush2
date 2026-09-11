import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  userLabel: string;
  children: ReactNode;
}

export function AppShell({ userLabel, children }: AppShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userLabel={userLabel} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
