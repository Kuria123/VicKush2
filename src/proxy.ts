import NextAuth from 'next-auth';

import { authConfig } from '@/lib/auth/config';

// Next 16 renamed the `middleware` file convention to `proxy`, and requires a
// default or named `proxy` function export.
// This runs on the edge runtime, so it uses the adapter-free auth config.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Skip Next internals, the auth API routes and static assets.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
