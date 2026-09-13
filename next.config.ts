import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * Set here rather than in the proxy so they apply to every response including
 * static assets, and so they survive a change to the auth matcher — a header
 * policy that depends on routing configuration is one that silently stops
 * applying when someone edits the matcher.
 *
 * The CSP is the one worth reading closely. `'unsafe-inline'` for styles is
 * required by Tailwind's runtime-injected styles and by Next's own inline
 * style attributes; removing it needs a nonce plumbed through every render,
 * which is worth doing and is not a change to make quietly at the end of a
 * stage. Scripts get `'unsafe-inline'` only in development, where Next's dev
 * overlay needs it — production does not, and does not get it.
 */
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; 'unsafe-eval' is dev-only tooling.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The AI provider is called server-side, so the browser never needs it.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Belt and braces with frame-ancestors, for older browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Web Serial is requested by the OBD adapter, so it stays permitted for
    // same-origin. Everything else a diagnostic tool has no use for.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), serial=(self), usb=(self)',
  },
  {
    // Two years, as preload requires. Harmless over plain HTTP in local
    // development, which browsers ignore for non-secure origins.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
