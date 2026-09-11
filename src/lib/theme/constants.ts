export const THEME_STORAGE_KEY = 'automind-theme';

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs before first paint to stamp `data-theme` on <html>, so the correct
 * theme is painted on the first frame rather than flashing light then dark.
 *
 * Kept as a string because it must execute synchronously in <head>, before
 * React hydrates. Deliberately dependency-free and defensive: storage access
 * throws in some privacy modes, and a broken theme must never break the page.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`.trim();
