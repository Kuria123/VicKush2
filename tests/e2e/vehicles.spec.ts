import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * End-to-end vehicle management. Each test signs up a fresh account so runs
 * are independent and no state leaks between them.
 */

const PASSWORD = 'Diagnostic1';
const VALID_VIN = '1M8GDM9AXKP042788';

/**
 * A saved vehicle's profile URL. The negative lookahead matters: "new" is
 * alphanumeric, so a naive /vehicles/[a-z0-9]+$ also matches /vehicles/new
 * and a "wait for the redirect" assertion would pass without ever leaving
 * the form.
 */
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUp(page: Page) {
  const email = `veh-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Vehicle Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function addVehicle(
  page: Page,
  fields: { make?: string; model?: string; year?: string; vin?: string },
) {
  await page.goto('/vehicles/new');
  if (fields.make) await page.getByLabel('Make').fill(fields.make);
  if (fields.model) await page.getByLabel('Model').fill(fields.model);
  if (fields.year) await page.getByLabel('Year').fill(fields.year);
  if (fields.vin) await page.getByLabel('VIN').fill(fields.vin);
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();
}

test('empty state invites the first vehicle', async ({ page }) => {
  await signUp(page);
  await page.goto('/vehicles');

  await expect(page.getByRole('heading', { name: 'Add your first vehicle' })).toBeVisible();
});

test('creates a vehicle and opens its profile', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });

  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);
  await expect(page.getByRole('heading', { name: 'Toyota Harrier', level: 1 })).toBeVisible();
  // Exact, because the year also legitimately appears inside the evidence
  // line ("Year recorded (2018).").
  await expect(page.getByText('2018', { exact: true })).toBeVisible();
  // The first vehicle is automatically primary.
  await expect(page.getByText('Primary').first()).toBeVisible();
});

test('profile reports unavailable metrics instead of inventing them', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });

  // Health, last scan, active issues and maintenance have no data source yet.
  await expect(page.getByText('Not available')).toHaveCount(4);
  await expect(page.getByText(/No scan has ever been run/)).toBeVisible();

  // Actions that cannot work are disabled rather than merely decorative.
  for (const label of ['Connect vehicle', 'Run diagnostic', 'View history']) {
    await expect(page.getByRole('button', { name: new RegExp(label, 'i') })).toBeDisabled();
  }
});

test('shows identification confidence with its evidence', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });

  await expect(page.getByText('Identification')).toBeVisible();
  await expect(page.getByText(/% confident/).first()).toBeVisible();
  await expect(page.getByText('Evidence')).toBeVisible();
  // The score is never shown without saying what is still missing.
  await expect(page.getByText('Not yet known')).toBeVisible();
  await expect(page.getByText('No VIN recorded.')).toBeVisible();
});

test('rejects a structurally invalid VIN', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', vin: 'TOOSHORT' });

  await expect(page.getByText('A VIN is exactly 17 characters.')).toBeVisible();
  await expect(page).toHaveURL(/\/vehicles\/new/);
});

test('requires at least one identifying detail', async ({ page }) => {
  await signUp(page);
  await page.goto('/vehicles/new');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();

  await expect(page.getByText('Provide at least a make, model, VIN or name.')).toBeVisible();
});

test('refuses a duplicate VIN for the same owner', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', vin: VALID_VIN });
  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);

  await addVehicle(page, { make: 'Toyota', model: 'Harrier', vin: VALID_VIN });
  // Reported twice by design â€” once for the form, once against the field.
  await expect(page.locator('form [role="alert"]')).toContainText(
    /already have a vehicle with that VIN/i,
  );
});

test('edits a vehicle', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Model').fill('Harrier Hybrid');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(
    page.getByRole('heading', { name: 'Toyota Harrier Hybrid', level: 1 }),
  ).toBeVisible();
});

test('switches the primary vehicle', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });
  await addVehicle(page, { make: 'Nissan', model: 'X-Trail', year: '2015' });

  // The second vehicle is not primary, so it offers the control.
  await page.getByRole('button', { name: 'Make primary' }).click();
  await expect(page.getByText('Primary').first()).toBeVisible();

  await page.goto('/vehicles');
  await expect(page.getByText('Primary')).toHaveCount(1);
});

test('removes a vehicle after confirming', async ({ page }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });

  await page.getByRole('button', { name: 'Remove' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove vehicle' }).click();

  await expect(page).toHaveURL(/\/vehicles$/);
  await expect(page.getByRole('heading', { name: 'Add your first vehicle' })).toBeVisible();
});

test('another account cannot open the vehicle', async ({ page, context }) => {
  await signUp(page);
  await addVehicle(page, { make: 'Toyota', model: 'Harrier', year: '2018' });
  // Wait for the redirect to land before capturing the URL, or this reads
  // /vehicles/new and the test proves nothing.
  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);
  const url = page.url();

  // Second account, same browser context cleared of the first session.
  await context.clearCookies();
  await signUp(page);
  await page.goto(url);

  await expect(page.getByText('Vehicle not found')).toBeVisible();
});
