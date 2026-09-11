import { expect, test } from '@playwright/test';

/**
 * Visual review of the authenticated shell at three widths. Signs up a fresh
 * account so the run is self-contained and repeatable.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test(`dashboard @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const email = `shot-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
    await page.goto('/sign-up');
    await page.getByLabel('Name').fill('Screenshot User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Diagnostic1');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on dashboard @ ${vp.name}`).toBeLessThanOrEqual(0);

    await page.screenshot({
      path: `.playwright/shots/dashboard-${vp.name}.png`,
      fullPage: true,
    });
  });
}
