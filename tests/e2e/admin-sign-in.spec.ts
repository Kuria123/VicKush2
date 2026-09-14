import { expect, test } from '@playwright/test';

/**
 * Signing in as the seeded administrator.
 *
 * The error assertions target `p[role="alert"]` rather than the role alone:
 * Next mounts its own empty `role="alert"` route announcer on every page, and
 * a bare role lookup matches that instead.
 *
 * The account is stored as `admin@automind.local`; the form also accepts the
 * bare username `admin`. These tests exist because that is one lookup with two
 * spellings, and the failure mode of such a rule is that only the spelling its
 * author tested works.
 *
 * The account itself is created by `npm run db:seed`, not by this file. A test
 * that created its own administrator would pass on a machine where the seed
 * had never been run, which is exactly the situation it should fail in.
 *
 * The password comes from `ADMIN_PASSWORD`, the same variable the seed reads,
 * rather than being written here. This repository is public-facing, and a
 * password committed once stays in the history after it is edited out. With
 * the variable unset these tests skip and say why — a visible gap, not a
 * silent pass.
 */

const USERNAME = 'admin';
const EMAIL = 'admin@automind.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';

test.skip(
  PASSWORD === '',
  'ADMIN_PASSWORD is not set, so the seeded admin account cannot be signed into.',
);

test('signs in with the bare username', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 60_000 });

  await page.getByLabel('Email or username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

test('signs in with the full address, resolving to the same account', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 60_000 });

  await page.getByLabel('Email or username').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

test('is case-insensitive about the username but exact about the password', async ({
  page,
}) => {
  await page.goto('/sign-in', { timeout: 60_000 });

  await page.getByLabel('Email or username').fill('ADMIN');
  await page.getByLabel('Password').fill(`${PASSWORD}x`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // The username's case did not matter. The password's must: a password
  // compared loosely would be a real weakening.
  await expect(page.locator('p[role="alert"]')).toContainText('Invalid credentials');
});

test('rejects a wrong password without saying whether the account exists', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 60_000 });

  await page.getByLabel('Email or username').fill(USERNAME);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const alert = page.locator('p[role="alert"]');
  await expect(alert).toContainText('Invalid credentials');
  // The same message a nonexistent account gets: never confirm who is
  // registered here.
  await expect(alert).not.toContainText(/no such|not found|unknown user/i);
});

test('gives a nonexistent username the identical message', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 60_000 });

  await page.getByLabel('Email or username').fill('nobody');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('p[role="alert"]')).toContainText('Invalid credentials');
});
