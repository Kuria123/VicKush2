import { signOut } from '@/lib/auth';
import { MobileNav } from './MobileNav';

interface TopBarProps {
  userLabel: string;
}

export function TopBar({ userLabel }: TopBarProps) {
  return (
    <header
      className="relative flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4"
      style={{ backgroundColor: 'var(--surface-raised)' }}
    >
      <div className="flex items-center gap-3">
        <MobileNav />
        <span className="text-sm font-semibold tracking-tight md:hidden">
          AutoMind
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="hidden text-sm sm:inline"
          style={{ color: 'var(--text-secondary)' }}
        >
          {userLabel}
        </span>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
