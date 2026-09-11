'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utilities/cn';
import { Badge } from '@/components/ui';
import { NAV_ITEMS } from './nav-items';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="border-line bg-surface-raised hidden w-60 shrink-0 flex-col border-r md:flex"
    >
      <div className="border-line flex h-14 items-center gap-2 border-b px-5">
        <span aria-hidden="true" className="bg-telemetry-mark size-2 rounded-full" />
        <span className="font-semibold tracking-tight">AutoMind</span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-surface-sunken text-accent font-medium'
                    : 'text-content-secondary hover:bg-surface-sunken hover:text-content',
                )}
              >
                <span className="truncate">{item.label}</span>
                {item.status === 'planned' && <Badge technical>Planned</Badge>}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="label-technical px-5 pb-4">Early development</p>
    </nav>
  );
}
