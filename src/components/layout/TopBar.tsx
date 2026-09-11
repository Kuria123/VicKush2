import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui';
import { MobileNav } from './MobileNav';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  userLabel: string;
}

export function TopBar({ userLabel }: TopBarProps) {
  return (
    <header className="border-line bg-surface-raised relative flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex items-center gap-3">
        <MobileNav />
        <span className="font-semibold tracking-tight md:hidden">AutoMind</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-content-secondary hidden text-sm sm:inline">{userLabel}</span>
        <ThemeToggle />
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
