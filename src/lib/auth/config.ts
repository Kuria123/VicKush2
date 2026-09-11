import type { NextAuthConfig } from 'next-auth';

import {
  DEFAULT_SIGNED_IN_REDIRECT,
  SIGN_IN_PATH,
  isAuthPage,
  isProtectedPath,
} from './routes';

/**
 * Edge-safe Auth.js configuration.
 *
 * Deliberately contains NO database adapter and NO providers that need Node
 * APIs (bcrypt, Prisma), so that the proxy can run this on the edge runtime.
 * The full configuration lives in ./index.ts.
 */
export const authConfig = {
  pages: {
    signIn: SIGN_IN_PATH,
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isSignedIn = Boolean(auth?.user);
      const { pathname } = nextUrl;

      if (isAuthPage(pathname)) {
        if (isSignedIn) {
          return Response.redirect(
            new URL(DEFAULT_SIGNED_IN_REDIRECT, nextUrl),
          );
        }
        return true;
      }

      if (isProtectedPath(pathname)) {
        return isSignedIn;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
