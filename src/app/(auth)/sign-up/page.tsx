import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthForm } from '@/features/auth/AuthForm';
import { signUpAction } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Create account</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Start tracking your vehicles.
      </p>

      <AuthForm
        action={signUpAction}
        submitLabel="Create account"
        fields={[
          { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
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
            autoComplete: 'new-password',
            hint: 'At least 10 characters, with upper, lower and a number.',
          },
        ]}
      />

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Already registered?{' '}
        <Link href="/sign-in" className="font-medium" style={{ color: 'var(--accent)' }}>
          Sign in
        </Link>
      </p>
    </>
  );
}
