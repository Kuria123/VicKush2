'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utilities/cn';
import { NAV_ITEMS } from './nav-items';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-60 shrink-0 flex-col border-r md:flex"
      style={{ backgroundColor: 'var(--surface-raised)' }}
    >
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: 'var(--color-signal-500)' }}
        />
        <span className="text-sm font-semibold tracking-tight">AutoMind</span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                  active ? 'font-medium' : 'hover:bg-[var(--surface-sunken)]',
                )}
                style={
                  active
                    ? {
                        backgroundColor: 'var(--surface-sunken)',
                        color: 'var(--accent)',
                      }
                    : { color: 'var(--text-secondary)' }
                }
              >
                <span>{item.label}</span>
                {item.status === 'planned' && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                    style={{
                      backgroundColor: 'var(--surface-sunken)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Planned
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="px-5 pb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        Phase 1 — foundation
      </p>
    </nav>
  );
}
