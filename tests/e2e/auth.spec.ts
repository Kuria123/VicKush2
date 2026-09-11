import { expect, test } from '@playwright/test';

/**
 * Full credential lifecycle against the real database. Each run registers a
 * unique account so the suite is repeatable.
 */
function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
}

const PASSWORD = 'Diagnostic1';

test('sign up, land on dashboard, sign out, sign back in', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // A brand-new account genuinely has zero vehicles.
  await expect(page.getByText('Registered vehicles')).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('rejects a wrong password without revealing account existence', async ({
  page,
}) => {
  const email = uniqueEmail();

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('button', { name: /sign out/i }).click();

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('WrongPassword9');
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByRole('alert')).toContainText(
    /invalid email or password/i,
  );
  await expect(page).toHaveURL(/\/sign-in/);
});

test('signed-in user visiting an auth page is redirected to the dashboard', async ({
  page,
}) => {
  const email = uniqueEmail();

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/sign-in');
  await expect(page).toHaveURL(/\/dashboard/);
});
