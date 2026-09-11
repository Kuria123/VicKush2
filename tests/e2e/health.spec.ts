import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Vehicle health, end to end.
 *
 * The test that matters is the braking one. Every other number on this page
 * being right is worth less than that one system refusing to show a number at
 * all — a braking score invented from engine data is the most dangerous thing
 * this product could display.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUpWithVehicle(page: Page): Promise<string> {
  const email = `health-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Health Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/vehicles/new');
  await page.getByLabel('Make').fill('Toyota');
  await page.getByLabel('Model').fill('Harrier');
  await page.getByLabel('Year').fill('2018');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();
  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);

  return new URL(page.url()).pathname.split('/').pop()!;
}

/** Scans a scenario across two conditions and saves it to history. */
async function scanAndSave(page: Page, id: string, scenario: string) {
  await page.goto(`/vehicles/${id}/live-scan`);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start scan' })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Fault scenario').selectOption(scenario);
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText('Streaming')).toBeVisible({ timeout: 15_000 });

  await page.waitForTimeout(25_000);
  await page.getByRole('slider', { name: 'Throttle' }).fill('30');
  await page.waitForTimeout(20_000);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Connected, not scanning')).toBeVisible();

  await page.getByRole('tab', { name: 'Diagnosis' }).click();
  await page.getByRole('button', { name: 'Save to history' }).click();
  await expect(page.getByText(/now part of the vehicle/i)).toBeVisible({ timeout: 20_000 });
}

test('health says nothing before a scan is saved', async ({ page }) => {
  // First hit of this route on a cold dev server compiles it, which the
  // 30 s default does not cover. Same reason the config raises the assertion
  // timeout for the credential flows.
  test.setTimeout(120_000);

  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/health`);

  await expect(page.getByText('Not enough recorded yet')).toBeVisible();
  // Rule 1: no placeholder score stands in for a real one.
  await expect(page.getByText('/100')).toHaveCount(0);
});

test('braking and suspension are never scored', async ({ page }) => {
  test.setTimeout(120_000);

  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/health`);

  // Shown, not omitted — an unmeasured system quietly left out would read as
  // a system with nothing wrong.
  await expect(page.getByRole('heading', { name: 'Braking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suspension' })).toBeVisible();

  await expect(page.getByText(/no brake data/i)).toBeVisible();
  await expect(page.getByText(/chassis or ride-height/i)).toBeVisible();

  // And no system carries a number: nothing has been scanned yet, so there is
  // nothing to score anywhere on the page.
  await expect(page.getByText('/100')).toHaveCount(0);
});

test('a saved scan produces scores, each with its reasons', async ({ page }) => {
  test.setTimeout(180_000);

  const id = await signUpWithVehicle(page);
  await scanAndSave(page, id, 'VACUUM_LEAK');

  await page.goto(`/vehicles/${id}/health`);

  await expect(page.getByText('Overall')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fuel' })).toBeVisible();

  // The brief's rule: never an unexplained number. A lean condition was found,
  // so the fuel score must carry it as the reason.
  await expect(page.getByText(/Lean condition detected/i).first()).toBeVisible();
  await expect(page.getByText(/−\d+/).first()).toBeVisible();

  // Braking still refuses to score, even now there is plenty of other data —
  // and it is one of exactly two systems that do, alongside suspension.
  await expect(page.getByText(/no brake data/i)).toBeVisible();
  await expect(page.getByText('Not assessed', { exact: true })).toHaveCount(2);
});

test('a healthy scan explains its perfect score rather than leaving it bare', async ({ page }) => {
  test.setTimeout(180_000);

  const id = await signUpWithVehicle(page);
  await scanAndSave(page, id, 'NORMAL');

  await page.goto(`/vehicles/${id}/health`);

  await expect(page.getByText(/No abnormal readings across 1 scan/i).first()).toBeVisible();
  // And does not overclaim a clean bill of health.
  await expect(
    page.getByText(/not a statement that the system is faultless/i).first(),
  ).toBeVisible();
});

test('another account cannot open the health page', async ({ page, context }) => {
  const id = await signUpWithVehicle(page);

  await context.clearCookies();
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Other Person');
  await page.getByLabel('Email').fill(`other-h-${Date.now()}@automind.test`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto(`/vehicles/${id}/health`);
  await expect(page.getByText('Vehicle not found')).toBeVisible();
});
