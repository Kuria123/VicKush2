'use server';

import { AuthError } from 'next-auth';
import { unstable_rethrow } from 'next/navigation';

import { prisma } from '@/lib/db/client';
import { signIn } from '@/lib/auth';
import { hashPassword } from '@/lib/auth/password';
import { logger } from '@/lib/logging/logger';
import {
  fieldErrors,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/schemas';
import { DEFAULT_SIGNED_IN_REDIRECT } from '@/lib/auth/routes';
import type { ActionResult } from '@/types';

const GENERIC_SIGN_IN_ERROR = 'Invalid email or password.';

export async function signUpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return {
      ok: false,
      error: 'An account with that email already exists.',
      fieldErrors: { email: 'This email is already registered.' },
    };
  }

  try {
    await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
  } catch (error) {
    logger.error('Sign-up failed', { error: String(error) });
    return {
      ok: false,
      error: 'Could not create the account. Please try again.',
    };
  }

  // Throws a redirect on success — must not be caught above.
  await signIn('credentials', {
    email,
    password,
    redirectTo: DEFAULT_SIGNED_IN_REDIRECT,
  });

  return { ok: true, data: undefined };
}

export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  try {
    await signIn('credentials', {
      ...parsed.data,
      redirectTo: DEFAULT_SIGNED_IN_REDIRECT,
    });
  } catch (error) {
    // signIn signals success by throwing a redirect; let Next's control-flow
    // errors propagate rather than swallowing them here.
    unstable_rethrow(error);
    if (error instanceof AuthError) {
      return { ok: false, error: GENERIC_SIGN_IN_ERROR };
    }
    throw error;
  }

  return { ok: true, data: undefined };
}
