import { expect, test } from '@playwright/test';

test.describe('public pages', () => {
  test('landing page renders', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /vehicle diagnostic intelligence/i }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible();
  });

  test('sign-in page renders its form', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('unknown route renders the 404 page', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  });
});

test.describe('route protection', () => {
  for (const path of [
    '/dashboard',
    '/vehicles',
    '/diagnostics',
    '/live-scan',
    '/health',
    '/settings',
    '/design-system',
  ]) {
    test(`${path} redirects when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }
});
