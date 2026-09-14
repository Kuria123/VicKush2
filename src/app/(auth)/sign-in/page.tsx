import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthForm } from '@/features/auth/AuthForm';
import { signInAction } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="text-content-secondary mb-6 text-sm">
        Access your vehicles and diagnostic history.
      </p>

      <AuthForm
        action={signInAction}
        submitLabel="Sign in"
        fields={[
          {
            name: 'email',
            label: 'Email or username',
            // Not type="email": the browser would refuse a bare username
            // before the form was ever submitted.
            type: 'text',
            autoComplete: 'username',
          },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
      />

      <p className="text-content-secondary mt-6 text-center text-sm">
        No account?{' '}
        <Link href="/sign-up" className="text-accent font-medium">
          Create one
        </Link>
      </p>
    </>
  );
}
