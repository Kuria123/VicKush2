import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Visual review of the vehicle screens, in both themes and at three widths. */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function signUpAndAdd(page: Page) {
  const email = `shot-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Vehicle Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/vehicles/new');
  await page.getByLabel('Make').fill('Toyota');
  await page.getByLabel('Model').fill('Harrier');
  await page.getByLabel('Year').fill('2018');
  await page.getByLabel('Engine displacement').fill('1998');
  await page.getByLabel('Fuel').selectOption('PETROL');
  await page.getByLabel('Transmission').selectOption('CVT');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();
  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);
}

/**
 * The shell is h-dvh with content scrolling inside <main>, so the document
 * body never scrolls and `fullPage` would clip. Grow the viewport instead.
 */
async function captureFullShell(page: Page, path: string, width: number) {
  const height = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollHeight + 120 : document.body.scrollHeight;
  });
  await page.setViewportSize({ width, height: Math.min(height, 6000) });
  await page.waitForTimeout(150);
  await page.screenshot({ path, caret: 'initial' });
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test(`vehicle profile @ ${vp.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signUpAndAdd(page);

      await page.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await page.waitForFunction(() => document.fonts.ready.then(() => true));

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow @ ${vp.name}`).toBeLessThanOrEqual(0);

      await captureFullShell(page, `.playwright/shots/vehicle-${vp.name}-${theme}.png`, vp.width);
    });
  }
}

test('vehicle list and form capture', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUpAndAdd(page);

  await page.goto('/vehicles');
  await captureFullShell(page, '.playwright/shots/vehicle-list.png', 1440);

  await page.goto('/vehicles/new');
  await captureFullShell(page, '.playwright/shots/vehicle-form.png', 1440);
});
