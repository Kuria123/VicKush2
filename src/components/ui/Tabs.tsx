'use client';

import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utilities/cn';

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: readonly TabItem[];
  defaultValue?: string;
  className?: string;
}

/**
 * Tabs following the WAI-ARIA pattern: roving tabindex, arrow-key
 * navigation, Home/End, and activation on focus.
 */
export function Tabs({ items, defaultValue, className }: TabsProps) {
  const baseId = useId();
  const [active, setActive] = useState(defaultValue ?? items.find((i) => !i.disabled)?.value ?? '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const enabled = items.filter((i) => !i.disabled);

  function focusTab(value: string) {
    setActive(value);
    tabRefs.current[value]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const index = enabled.findIndex((i) => i.value === active);
    if (index === -1) return;

    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;

    if (next !== null) {
      event.preventDefault();
      const target = enabled[next];
      if (target) focusTab(target.value);
    }
  }

  return (
    <div className={className}>
      <div role="tablist" onKeyDown={onKeyDown} className="border-line flex gap-1 border-b">
        {items.map((item) => {
          const selected = item.value === active;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[item.value] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-controls={`${baseId}-panel-${item.value}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => setActive(item.value)}
              className={cn(
                'relative -mb-px px-3 py-2 text-sm font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-40',
                selected ? 'text-accent' : 'text-content-secondary hover:text-content',
              )}
            >
              {item.label}
              {selected && (
                <span
                  aria-hidden="true"
                  className="bg-accent absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${baseId}-panel-${item.value}`}
          aria-labelledby={`${baseId}-tab-${item.value}`}
          hidden={item.value !== active}
          tabIndex={0}
          className="pt-4"
        >
          {item.value === active && item.content}
        </div>
      ))}
    </div>
  );
}
