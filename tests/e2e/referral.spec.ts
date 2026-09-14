import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The report for a mechanic, end to end.
 *
 * This is the one document the product produces that leaves the product. The
 * two tests that matter are the ones about what the owner cannot make it do:
 * they cannot get a concern written for them, and they cannot get a simulated
 * scan handed over without the simulator being the first thing on the page.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUpWithVehicle(page: Page): Promise<string> {
  const email = `referral-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Referral Tester');
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

test('a report can be produced before any scan exists, and says what is missing', async ({
  page,
}) => {
  const id = await signUpWithVehicle(page);

  // First hit of this route on a cold dev server compiles it, which the
  // 30 s default does not cover.
  await page.goto(`/vehicles/${id}/referral`, { timeout: 60_000 });

  const report = page.locator('pre');
  await expect(report).toContainText('VEHICLE DIAGNOSTIC REPORT');
  await expect(report).toContainText('No scan has been saved');
  // An empty report handed over honestly beats a full one that invented its
  // contents, so the page does not refuse to produce it.
  await expect(report).toContainText('Braking and suspension were not assessed');
});

test('the concern is the owner’s words, never written for them', async ({ page }) => {
  // A scan runs for 45 s of wall clock before it can be saved, which the
  // 30 s default does not cover. Raised per test rather than globally, so a
  // genuinely hung test elsewhere still fails fast.
  test.setTimeout(180_000);

  const id = await signUpWithVehicle(page);
  await scanAndSave(page, id, 'VACUUM_LEAK');

  await page.goto(`/vehicles/${id}/referral`, { timeout: 60_000 });
  const report = page.locator('pre');

  // Before anything is typed: no complaint, and no complaint inferred from the
  // findings that the scan has just produced.
  await expect(report).toContainText('Not stated');

  await page.getByLabel('Concern').fill('Vibration at idle when cold');
  await page.getByRole('button', { name: 'Update report' }).click();

  await expect(report).toContainText('Vibration at idle when cold');
});

test('a simulated scan is disclosed on the first line of what is handed over', async ({ page }) => {
  // A scan runs for 45 s of wall clock before it can be saved, which the
  // 30 s default does not cover. Raised per test rather than globally, so a
  // genuinely hung test elsewhere still fails fast.
  test.setTimeout(180_000);

  const id = await signUpWithVehicle(page);
  await scanAndSave(page, id, 'VACUUM_LEAK');

  await page.goto(`/vehicles/${id}/referral`, { timeout: 60_000 });

  const text = (await page.locator('pre').innerText()).trim();
  const firstLine = text.split('\n')[0] ?? '';

  // Rule 2. A mechanic acting on simulated readings is working from fiction
  // about a real car, so this cannot be somewhere they scroll past.
  expect(firstLine).toContain('SIMULATION MODE');
  expect(text).toContain('Do not use it to make a repair decision');
});

test('the report names no part and interprets no code', async ({ page }) => {
  // A scan runs for 45 s of wall clock before it can be saved, which the
  // 30 s default does not cover. Raised per test rather than globally, so a
  // genuinely hung test elsewhere still fails fast.
  test.setTimeout(180_000);

  const id = await signUpWithVehicle(page);
  await scanAndSave(page, id, 'VACUUM_LEAK');

  await page.goto(`/vehicles/${id}/referral`, { timeout: 60_000 });
  const text = await page.locator('pre').innerText();

  expect(text).not.toMatch(/\b(replace|install|refit|part number)\b/i);
  expect(text).toContain('does not interpret them');
});

test('no mechanics are listed, and the page says why rather than looking empty', async ({
  page,
}) => {
  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/referral`, { timeout: 60_000 });

  // A seeded directory would send somebody to an address that does not exist.
  await expect(page.getByText(/No mechanics, service centres or parts suppliers/i)).toBeVisible();
  await expect(page.getByText(/not because there are none near you/i)).toBeVisible();
});
