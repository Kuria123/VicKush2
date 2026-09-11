import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The simulated connection sequence, exercised in a real browser.
 *
 * The provider runs client-side, so these tests drive the actual state
 * machine rather than a mock of it.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUpAndAddVehicle(page: Page) {
  const email = `conn-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Connection Tester');
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
}

async function openConnectPage(page: Page) {
  await signUpAndAddVehicle(page);
  await page.getByRole('link', { name: 'Connect vehicle' }).click();
  await expect(page).toHaveURL(/\/connect$/);
}

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect vehicle' }).click();
  // The sequence ends when the final phase reports.
  await expect(page.getByText('Vehicle ready')).toBeVisible({ timeout: 20_000 });
}

test('the vehicle profile links to the connection screen', async ({ page }) => {
  await signUpAndAddVehicle(page);
  await expect(page.getByRole('link', { name: 'Connect vehicle' })).toBeVisible();
});

test('SIMULATION MODE is declared before any data appears', async ({ page }) => {
  await openConnectPage(page);
  // Rule 2: the disclosure precedes the readings, not the other way round.
  await expect(page.getByText('Simulation mode')).toBeVisible();
  await expect(page.getByText(/No vehicle is connected/)).toBeVisible();
});

test('every phase of the sequence completes', async ({ page }) => {
  await openConnectPage(page);
  await connect(page);

  for (const phase of [
    'Connecting',
    'Device found',
    'Identifying vehicle',
    'Reading ECU',
    'Discovering modules',
    'Reading diagnostic data',
    'Ready',
  ]) {
    await expect(page.getByText(phase, { exact: true })).toBeVisible();
  }
});

test('reports what the adapter actually returned', async ({ page }) => {
  await openConnectPage(page);
  await connect(page);

  // The simulator declines to invent a VIN, and the screen says so rather
  // than implying one was read.
  await expect(page.getByText(/VIN not supported by this adapter/)).toBeVisible();

  // A module that exists but does not answer is reported, not hidden.
  await expect(page.getByText(/2 responding, 1 not responding/)).toBeVisible();

  // Parameter count comes from the provider, not a constant.
  await expect(page.getByText(/18 parameters available/)).toBeVisible();
});

test('the status strip shows the connected state and simulation mode', async ({ page }) => {
  await openConnectPage(page);
  await connect(page);

  // Scoped to the status strip: the vehicle name also appears in the
  // breadcrumb and the page heading, and the label span and its containing
  // <dd> both match on their own.
  const strip = page.locator('dl').first();
  await expect(strip.getByText('Connected', { exact: true }).first()).toBeVisible();
  await expect(strip.getByText('Toyota Harrier')).toBeVisible();
  await expect(strip.getByText('Detected')).toBeVisible();
  await expect(strip.getByText('2 of 3 responding')).toBeVisible();
  await expect(strip.getByText('SIMULATION', { exact: true })).toBeVisible();
});

test('simulator controls appear only once connected', async ({ page }) => {
  await openConnectPage(page);

  const selector = page.getByLabel('Fault scenario');
  await expect(selector).toBeDisabled();

  await connect(page);
  await expect(selector).toBeEnabled();
});

test('selecting a scenario describes the physical fault', async ({ page }) => {
  await openConnectPage(page);
  await connect(page);

  await page.getByLabel('Fault scenario').selectOption('VACUUM_LEAK');
  // The description says what is broken, not what the readings will show.
  await expect(page.getByText(/unmetered hole downstream of the MAF/)).toBeVisible();
});

test('injecting a fault code accepts a valid one and rejects nonsense', async ({ page }) => {
  await openConnectPage(page);
  await connect(page);

  await page.getByLabel('Inject a fault code').fill('P0171');
  await page.getByRole('button', { name: 'Inject', exact: true }).click();
  await expect(page.getByText('P0171')).toBeVisible();

  await page.getByLabel('Inject a fault code').fill('NOPE');
  await page.getByRole('button', { name: 'Inject', exact: true }).click();
  await expect(page.getByText(/is not a valid DTC/)).toBeVisible();
});

test('disconnecting resets the sequence', async ({ page }) => {
  await openConnectPage(page);
  await connect(page);

  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByText('Vehicle ready')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Connect to read this vehicle' })).toBeVisible();
});

test('another account cannot open the connection screen', async ({ page, context }) => {
  await signUpAndAddVehicle(page);
  const url = `${page.url()}/connect`;

  await context.clearCookies();
  await signUpAndAddVehicle(page);
  await page.goto(url);

  await expect(page.getByText('Vehicle not found')).toBeVisible();
});
