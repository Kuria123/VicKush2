import { z } from 'zod';

/**
 * Shared validation primitives. Every boundary (server action, route handler,
 * form) validates through Zod rather than trusting typed input.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email address')
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => /[a-z]/.test(v), 'Password must contain a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Password must contain an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain a number');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must be at most 80 characters');

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/**
 * The local-account domain.
 *
 * Accounts created inside this application rather than by someone typing their
 * own address. `.local` is reserved for exactly this and can never collide with
 * a real internet domain, so a username can be resolved to an address without
 * any chance of pointing at somebody else's mailbox.
 */
export const LOCAL_ACCOUNT_DOMAIN = 'automind.local';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Enter a username or email address')
  .max(32, 'That username is too long')
  .regex(/^[a-z0-9._-]+$/, 'A username may use letters, numbers, dots, dashes and underscores');

/**
 * What someone types into the first box on the sign-in form.
 *
 * Either a full email address or a bare username, because both are real ways
 * people identify themselves and rejecting the shorter one is a rule the user
 * has to learn rather than a fact about their account. A bare username is
 * resolved to `<name>@automind.local` — it is not a second kind of account,
 * just a shorter way of naming the same one, so there is one lookup and one
 * unique column underneath.
 *
 * Sign-*up* is unaffected and still requires a real address: an account that
 * can never be recovered because nobody knows where to send the mail is a
 * problem to create deliberately, not by default.
 */
export const signInIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Email or username is required')
  .transform((value) => value.toLowerCase())
  .superRefine((value, ctx) => {
    const schema = value.includes('@') ? emailSchema : usernameSchema;
    const result = schema.safeParse(value);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: result.error.issues[0]?.message ?? 'Enter a username or email address',
      });
    }
  })
  .transform((value) => (value.includes('@') ? value : `${value}@${LOCAL_ACCOUNT_DOMAIN}`));

export const signInSchema = z.object({
  email: signInIdentifierSchema,
  password: z.string().min(1, 'Password is required'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Flattens a ZodError into a field -> first message map for form rendering.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
