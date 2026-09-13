import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Repair guides, end to end.
 *
 * The gate is the whole point. Every stage before this one refused to name a
 * component, and a guide names one — so the test that matters is that it stays
 * shut until a cause has actually been confirmed by a performed test.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function openScan(page: Page) {
  const email = `repair-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Repair Tester');
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

  await page.locator('main').getByRole('link', { name: 'Live scan' }).click();
  await expect(page).toHaveURL(/\/live-scan$/);
}

/** Scans a leak across both conditions, then opens the diagnosis. */
async function diagnoseLeak(page: Page) {
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
}

test('no guide is offered before a test has been performed', async ({ page }) => {
  test.setTimeout(180_000);

  await openScan(page);
  await diagnoseLeak(page);

  await expect(page.getByRole('heading', { name: 'How do I fix it' })).toBeVisible();

  // The scan proposes a cause; it does not confirm one.
  await expect(page.getByText(/no confirmation test has been performed/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show procedure' })).toHaveCount(0);

  // And it says what would unlock it rather than simply hiding.
  await expect(page.getByText(/What would unlock it/i)).toBeVisible();
});

test('a test that settled nothing does not unlock a guide', async ({ page }) => {
  test.setTimeout(180_000);

  await openScan(page);
  await diagnoseLeak(page);

  await page.getByRole('button', { name: 'Unable to perform' }).first().click();

  // No observation was made, so nothing was confirmed.
  await expect(page.getByRole('button', { name: 'Show procedure' })).toHaveCount(0);
});

test('a performed test unlocks the guide, and safety comes first', async ({ page }) => {
  test.setTimeout(180_000);

  await openScan(page);
  await diagnoseLeak(page);

  // Record the outcome that corroborates the leading cause.
  await page.getByRole('button', { name: 'Pass', exact: true }).first().click();

  await expect(page.getByRole('button', { name: 'Show procedure' })).toBeVisible();
  await page.getByRole('button', { name: 'Show procedure' }).click();

  await expect(page.getByRole('heading', { name: 'Safety' })).toBeVisible();
  await expect(page.getByText('DANGER').first()).toBeVisible();
  await expect(page.getByText(/carbon monoxide/i)).toBeVisible();

  // The procedure is present, and so is the verification it will be judged by.
  await expect(page.getByRole('heading', { name: 'Procedure' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verification' })).toBeVisible();
});

test('the guide states what it does not know rather than inventing it', async ({ page }) => {
  test.setTimeout(180_000);

  await openScan(page);
  await diagnoseLeak(page);
  await page.getByRole('button', { name: 'Pass', exact: true }).first().click();
  await page.getByRole('button', { name: 'Show procedure' }).click();

  // Rule 1: labour times and part numbers need service data this build lacks.
  await expect(page.getByText(/Estimated time: not available/i)).toBeVisible();
  await expect(page.getByText(/Part number: not available/i).first()).toBeVisible();

  // Rule 9: parts are conditional on an inspection step, never a shopping list.
  await expect(page.getByText('Only if needed').first()).toBeVisible();
  await expect(page.getByText(/Nothing here is a recommendation to buy/i)).toBeVisible();

  // And it never claims to be vehicle-specific.
  await expect(page.getByText(/generic procedure/i).first()).toBeVisible();
});

test('a video is not offered, and the scene plan says why', async ({ page }) => {
  test.setTimeout(180_000);

  await openScan(page);
  await diagnoseLeak(page);
  await page.getByRole('button', { name: 'Pass', exact: true }).first().click();
  await page.getByRole('button', { name: 'Show procedure' }).click();

  // No rendering backend exists, and the panel says so rather than offering a
  // button that cannot work or substituting stock footage.
  await expect(page.getByText(/No video provider is configured/i)).toBeVisible();
  await expect(page.getByText(/complete without one/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /generate video/i })).toHaveCount(0);

  // The plan a video would be rendered from is still shown.
  await page.getByRole('button', { name: 'Show scene plan' }).click();
  await expect(page.getByText(/no part of it is written by a model/i)).toBeVisible();

  // Safety scenes are marked unskippable in the plan itself.
  await expect(page.getByText('Cannot be skipped').first()).toBeVisible();
  await expect(page.getByText('DANGER').first()).toBeVisible();
});
