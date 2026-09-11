'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

import { cn } from '@/lib/utilities/cn';
import { NAV_ITEMS } from './nav-items';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        className="flex size-9 items-center justify-center rounded-md border"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-14 z-50 border-b shadow-lg"
          style={{ backgroundColor: 'var(--surface-raised)' }}
        >
          <nav aria-label="Primary mobile">
            <ul className="flex flex-col p-3">
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between rounded-md px-3 py-2.5 text-sm',
                        active && 'font-medium',
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
          </nav>
        </div>
      )}
    </div>
  );
}
