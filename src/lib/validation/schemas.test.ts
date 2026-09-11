import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { emailSchema, fieldErrors, passwordSchema, signInSchema, signUpSchema } from './schemas';

describe('emailSchema', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(emailSchema.parse('  Owner@Example.COM ')).toBe('owner@example.com');
  });

  it('rejects a malformed address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('rejects an empty value', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('Diagnostic1').success).toBe(true);
  });

  it.each([
    ['too short', 'Short1'],
    ['no uppercase', 'diagnostic1'],
    ['no lowercase', 'DIAGNOSTIC1'],
    ['no digit', 'DiagnosticTool'],
  ])('rejects a password that is %s', (_label, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('parses a valid submission', () => {
    const result = signUpSchema.safeParse({
      name: '  Gerald  ',
      email: 'Gerald@Example.com',
      password: 'Diagnostic1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Gerald');
      expect(result.data.email).toBe('gerald@example.com');
    }
  });
});

describe('signInSchema', () => {
  it('does not enforce password strength on sign-in', () => {
    // Existing accounts may predate a stricter policy; strength is only
    // enforced at sign-up.
    expect(signInSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('fieldErrors', () => {
  it('maps each field to its first message', () => {
    const result = signUpSchema.safeParse({
      name: '',
      email: 'bad',
      password: 'weak',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'password']);
      expect(typeof errors.email).toBe('string');
    }
  });

  it('returns an empty map when there are no issues', () => {
    expect(fieldErrors(new z.ZodError([]))).toEqual({});
  });
});
