import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';

import { prisma } from '@/lib/db/client';
import { signInSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logging/logger';

import { authConfig } from './config';
import { verifyPassword } from './password';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // Credentials sign-in is incompatible with database sessions, so JWT
  // sessions are required here.
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          // Same failure shape as a wrong password: never reveal whether an
          // account exists.
          logger.info('Sign-in rejected', { reason: 'no_credential_account' });
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          logger.info('Sign-in rejected', { reason: 'bad_password' });
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
});

/** Returns the current session's user id, or null when unauthenticated. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
