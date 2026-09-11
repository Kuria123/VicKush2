/**
 * Route access policy, shared between the proxy (edge) and server code.
 * Kept free of Node-only imports so the edge runtime can use it.
 */

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/vehicles',
  '/diagnostics',
  '/live-scan',
  '/health',
  '/settings',
] as const;

/** Auth pages that a signed-in user should be redirected away from. */
const AUTH_PAGES = ['/sign-in', '/sign-up'] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((page) => pathname === page);
}

export const DEFAULT_SIGNED_IN_REDIRECT = '/dashboard';
export const SIGN_IN_PATH = '/sign-in';
