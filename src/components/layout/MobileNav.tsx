'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

import { cn } from '@/lib/utilities/cn';
import { Badge } from '@/components/ui';
import { NAV_ITEMS } from './nav-items';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Escape closes the panel, matching the dismissal affordance of a dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        className="border-line text-content-secondary hover:text-content flex size-9 items-center justify-center rounded-md border transition-colors"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="animate-rise border-line bg-surface-raised absolute inset-x-0 top-14 z-50 border-b shadow-lg"
        >
          <nav aria-label="Primary mobile">
            <ul className="flex flex-col p-3">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-surface-sunken text-accent font-medium'
                          : 'text-content-secondary',
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.status === 'planned' && <Badge technical>Planned</Badge>}
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
