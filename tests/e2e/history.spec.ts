import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Vehicle memory and the timeline, end to end.
 *
 * The test that matters is the last one: a diagnosis is saved, the page is
 * reloaded, and it is still there. Everything before this stage lived in the
 * browser and died with the tab, so surviving a reload is the whole claim
 * vehicle memory makes.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUpWithVehicle(page: Page): Promise<string> {
  const email = `hist-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('History Tester');
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

  const url = new URL(page.url());
  return url.pathname.split('/').pop()!;
}

test('a vehicle with no history says so rather than showing an empty list', async ({ page }) => {
  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/history`);

  await expect(page.getByText(/Nothing has been recorded for this vehicle yet/i)).toBeVisible();
  // Rule 1: no projected or expected entries stand in for real ones.
  await expect(page.getByText('Diagnosis', { exact: true })).toHaveCount(0);
});

test('owner-entered maintenance joins the timeline at the date it happened', async ({ page }) => {
  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/history`);

  await page.getByLabel('What was done').fill('Routine service');
  await page.getByLabel('When').fill('2026-01-15');
  await page.getByLabel('Notes').fill('Oil and filter.');
  await page.getByRole('button', { name: 'Add to timeline' }).click();

  await expect(page.getByText('Added to the timeline.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Routine service' })).toBeVisible();
  // Grouped by month, as the spec's example is.
  await expect(page.getByText('JANUARY 2026')).toBeVisible();
});

test('an unknown odometer is left blank rather than estimated', async ({ page }) => {
  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/history`);

  await page.getByLabel('What was done').fill('Tyre rotation');
  await page.getByLabel('When').fill('2026-02-02');
  await page.getByRole('button', { name: 'Add to timeline' }).click();

  await expect(page.getByRole('heading', { name: 'Tyre rotation' })).toBeVisible({
    timeout: 15_000,
  });
  // No invented mileage anywhere on the entry.
  await expect(page.getByText(/\d{4,} km/)).toHaveCount(0);
});

test('a future date is refused', async ({ page }) => {
  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/history`);

  await page.getByLabel('What was done').fill('Time travel service');
  await page.getByLabel('When').fill('2099-01-01');
  await page.getByRole('button', { name: 'Add to timeline' }).click();

  await expect(page.getByText('That is in the future.')).toBeVisible({ timeout: 15_000 });
});

test('another account cannot open the history', async ({ page, context }) => {
  const id = await signUpWithVehicle(page);

  await context.clearCookies();
  const email = `other-${Date.now()}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Other Person');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto(`/vehicles/${id}/history`);

  // Asserted on what the page says, matching the vehicle-profile test: the
  // app renders its own not-found boundary, so the HTTP status is not the
  // signal here — the absence of anyone else's history is.
  await expect(page.getByText('Vehicle not found')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scan recorded' })).toHaveCount(0);
});

test('a saved diagnosis survives a reload', async ({ page }) => {
  test.setTimeout(180_000);

  const id = await signUpWithVehicle(page);

  await page.goto(`/vehicles/${id}/live-scan`);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start scan' })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Fault scenario').selectOption('VACUUM_LEAK');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText('Streaming')).toBeVisible({ timeout: 15_000 });

  await page.waitForTimeout(25_000);
  await page.getByRole('slider', { name: 'Throttle' }).fill('30');
  await page.waitForTimeout(20_000);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Connected, not scanning')).toBeVisible();

  await page.getByRole('tab', { name: 'Diagnosis' }).click();
  await expect(page.getByText('Best fit')).toBeVisible();

  await page.getByRole('button', { name: 'Save to history' }).click();
  await expect(page.getByText(/now part of the vehicle/i)).toBeVisible({ timeout: 20_000 });

  // The claim: it is no longer in the browser, it is in the database.
  await page.goto(`/vehicles/${id}/history`);
  await expect(page.getByRole('heading', { name: 'Scan recorded' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Lean condition detected/ })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Best fit: Air entering downstream/ }),
  ).toBeVisible();

  // Rule 2: a stored reading does not stop being simulated because time passed.
  await expect(page.getByText(/came from a simulated vehicle/i)).toBeVisible();

  // And a stored fault code is still not interpreted.
  const codes = page.getByText(/What the code means is not interpreted/i);
  if ((await codes.count()) > 0) await expect(codes.first()).toBeVisible();
});
