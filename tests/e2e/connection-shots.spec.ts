import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Visual review of the connection screen, in both themes. */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function setup(page: Page, theme: 'light' | 'dark') {
  const email = `shot-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Connection Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  await page.goto('/vehicles/new');
  await page.getByLabel('Make').fill('Toyota');
  await page.getByLabel('Model').fill('Harrier');
  await page.getByLabel('Year').fill('2018');
  await page.getByLabel('Engine displacement').fill('1998');
  await page.getByLabel('Fuel').selectOption('PETROL');
  await page.getByLabel('Transmission').selectOption('CVT');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();
  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);

  await page.getByRole('link', { name: 'Connect vehicle' }).click();
  await expect(page).toHaveURL(/\/connect$/);
}

/** The shell scrolls inside <main>, so grow the viewport rather than fullPage. */
async function capture(page: Page, path: string, width: number) {
  const height = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollHeight + 120 : document.body.scrollHeight;
  });
  await page.setViewportSize({ width, height: Math.min(height, 6000) });
  await page.waitForTimeout(150);
  await page.screenshot({ path, caret: 'initial' });
}

for (const theme of ['light', 'dark'] as const) {
  test(`connection screen, connected @ ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page, theme);

    await page.getByRole('button', { name: 'Connect vehicle' }).click();
    await expect(page.getByText('Vehicle ready')).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Fault scenario').selectOption('VACUUM_LEAK');
    await page.waitForFunction(() => document.fonts.ready.then(() => true));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await capture(page, `.playwright/shots/connect-${theme}.png`, 1440);
  });
}

test('connection screen on mobile before connecting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light');
  await page.waitForFunction(() => document.fonts.ready.then(() => true));

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await capture(page, '.playwright/shots/connect-mobile.png', 390);
});
