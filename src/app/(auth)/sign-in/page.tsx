import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthForm } from '@/features/auth/AuthForm';
import { signInAction } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Access your vehicles and diagnostic history.
      </p>

      <AuthForm
        action={signInAction}
        submitLabel="Sign in"
        fields={[
          {
            name: 'email',
            label: 'Email',
            type: 'email',
            autoComplete: 'email',
          },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
      />

      <p
        className="mt-6 text-center text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        No account?{' '}
        <Link
          href="/sign-up"
          className="font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Create one
        </Link>
      </p>
    </>
  );
}
