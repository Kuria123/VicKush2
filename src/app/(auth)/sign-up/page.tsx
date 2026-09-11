import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthForm } from '@/features/auth/AuthForm';
import { signUpAction } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Create account</h1>
      <p className="text-content-secondary mb-6 text-sm">Start tracking your vehicles.</p>

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

      <p className="text-content-secondary mt-6 text-center text-sm">
        Already registered?{' '}
        <Link href="/sign-in" className="text-accent font-medium">
          Sign in
        </Link>
      </p>
    </>
  );
}
