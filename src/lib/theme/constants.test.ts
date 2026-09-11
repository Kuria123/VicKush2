import { describe, expect, it } from 'vitest';

import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, THEMES, isTheme } from './constants';

describe('isTheme', () => {
  it.each(THEMES)('accepts %s', (theme) => {
    expect(isTheme(theme)).toBe(true);
  });

  it.each([['solarized'], [''], [null], [undefined], [42], [{}]])('rejects %s', (value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('references the same storage key the client uses', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it('is wrapped in try/catch so blocked storage cannot break the page', () => {
    expect(THEME_INIT_SCRIPT).toContain('try');
    expect(THEME_INIT_SCRIPT).toContain('catch');
  });

  it('only ever stamps an explicit theme, leaving "system" to CSS', () => {
    // 'system' must NOT set data-theme; the media query handles it.
    expect(THEME_INIT_SCRIPT).not.toContain("'system'");
  });

  it('runs as an immediately-invoked expression', () => {
    expect(THEME_INIT_SCRIPT.startsWith('(function')).toBe(true);
  });
});
