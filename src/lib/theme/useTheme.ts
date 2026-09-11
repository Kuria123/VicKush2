'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { THEME_STORAGE_KEY, type Theme, isTheme } from './constants';

/**
 * The stored theme is external state (localStorage plus an attribute on
 * <html>), so it is read through useSyncExternalStore rather than mirrored
 * into React state from an effect. That avoids the cascading render that
 * setState-in-effect causes, and gives correct hydration for free: React uses
 * the server snapshot while hydrating, then swaps to the real value.
 */

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // `storage` fires when another tab changes the preference.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
  }
  return 'system';
}

/** Rendered on the server and during hydration, where no storage exists. */
function getServerSnapshot(): Theme {
  return 'system';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference will not persist; the current page still updates.
    }
    applyTheme(next);
    emit();
  }, []);

  return { theme, setTheme };
}
