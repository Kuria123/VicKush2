'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/utilities/cn';
import { THEMES, type Theme } from '@/lib/theme/constants';
import { useTheme } from '@/lib/theme/useTheme';

const ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABEL: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="border-line bg-surface-sunken flex items-center gap-0.5 rounded-md border p-0.5"
    >
      {THEMES.map((option) => {
        const Icon = ICON[option];
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LABEL[option]}
            title={LABEL[option]}
            onClick={() => setTheme(option)}
            className={cn(
              'flex size-7 items-center justify-center rounded transition-colors',
              selected
                ? 'bg-surface-raised text-content shadow-sm'
                : 'text-content-muted hover:text-content',
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
