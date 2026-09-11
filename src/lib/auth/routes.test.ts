import { describe, expect, it } from 'vitest';

import { isAuthPage, isProtectedPath } from './routes';

describe('isProtectedPath', () => {
  it.each([
    '/dashboard',
    '/vehicles',
    '/diagnostics',
    '/live-scan',
    '/health',
    '/settings',
  ])('protects %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it('protects nested routes', () => {
    expect(isProtectedPath('/vehicles/abc123')).toBe(true);
  });

  it('does not protect public routes', () => {
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/sign-in')).toBe(false);
  });

  it('does not treat a prefix collision as protected', () => {
    expect(isProtectedPath('/healthcheck')).toBe(false);
  });
});

describe('isAuthPage', () => {
  it('recognises the auth pages', () => {
    expect(isAuthPage('/sign-in')).toBe(true);
    expect(isAuthPage('/sign-up')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAuthPage('/dashboard')).toBe(false);
    expect(isAuthPage('/sign-in/reset')).toBe(false);
  });
});
