import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Repair verification, end to end.
 *
 * The whole loop in one test: scan a faulted vehicle, save it, record a repair
 * against that scan, scan again with the fault cleared, and verify. Nothing is
 * stubbed, so a pass means the physical model, the analysis, the storage and
 * the comparison all agree.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUpWithVehicle(page: Page): Promise<string> {
  const email = `verify-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Verify Tester');
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

/** Scans a scenario across idle and raised speed, then saves it. */
async function scanAndSave(page: Page, id: string, scenario: string) {
  await page.goto(`/vehicles/${id}/live-scan`);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start scan' })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Fault scenario').selectOption(scenario);
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText('Streaming')).toBeVisible({ timeout: 15_000 });

  await page.waitForTimeout(22_000);
  await page.getByRole('slider', { name: 'Throttle' }).fill('30');
  await page.waitForTimeout(18_000);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Connected, not scanning')).toBeVisible();

  await page.getByRole('tab', { name: 'Diagnosis' }).click();
  await page.getByRole('button', { name: 'Save to history' }).click();
  await expect(page.getByText(/now part of the vehicle/i)).toBeVisible({ timeout: 20_000 });
}

/**
 * The repair form specifically.
 *
 * The maintenance form on the same page also has a "When" date field, so the
 * labels are only unique within their own form. Scoping here rather than
 * renaming the fields: the copy is right for a reader, and a test should not
 * reshape the interface to make itself easier to write.
 */
function repairForm(page: Page) {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record repair' }) });
}

test('a repair cannot be recorded without a scan to verify against', async ({ page }) => {
  test.setTimeout(120_000);

  const id = await signUpWithVehicle(page);
  await page.goto(`/vehicles/${id}/history`);

  await expect(page.getByRole('heading', { name: 'Repairs and verification' })).toBeVisible();
  // A repair that cannot be verified should not be recorded as though it could.
  await expect(page.getByText(/Save a scan to this vehicle first/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record repair' })).toHaveCount(0);
});

test('the full loop: scan, repair, scan again, verify', async ({ page }) => {
  test.setTimeout(300_000);

  const id = await signUpWithVehicle(page);

  // Before: a vacuum leak, with the trims climbing at idle.
  await scanAndSave(page, id, 'VACUUM_LEAK');

  await page.goto(`/vehicles/${id}/history`);
  const form = repairForm(page);
  await form.getByLabel('What was repaired').fill('Intake hose replaced');
  await form.getByLabel('When').fill(today());
  await form.getByLabel('Scan taken before the work').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Record repair' }).click();
  await expect(page.getByText('Repair recorded.')).toBeVisible({ timeout: 20_000 });

  // After: the same vehicle with the fault gone.
  await scanAndSave(page, id, 'NORMAL');

  await page.goto(`/vehicles/${id}/history`);
  await page.getByLabel('Scan taken after the work').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Verify' }).click();

  // The strongest verdict available — and it says so in cautious language.
  // `.first()`: the verdict badge, the timeline entry and the summary all
  // carry this phrase.
  await expect(
    page.getByText('Consistent with the repair').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/It is not proof that the fault will not return/i).first(),
  ).toBeVisible();

  // The numbers it reasoned from are shown, before and after.
  await expect(page.getByRole('table', { name: /before and after/i })).toBeVisible();
  await expect(page.getByText(/Long term fuel trim/i).first()).toBeVisible();

  // Caveats are never collapsed, especially on a positive result.
  await expect(page.getByText('What this does not establish')).toBeVisible();
  await expect(page.getByText(/intermittent fault/i).first()).toBeVisible();
  await expect(page.getByText(/does not verify what was actually done/i).first()).toBeVisible();
});

test('the repair and its verification land on the timeline', async ({ page }) => {
  test.setTimeout(300_000);

  const id = await signUpWithVehicle(page);
  await scanAndSave(page, id, 'VACUUM_LEAK');

  await page.goto(`/vehicles/${id}/history`);
  const form = repairForm(page);
  await form.getByLabel('What was repaired').fill('Intake hose replaced');
  await form.getByLabel('When').fill(today());
  await form.getByLabel('Scan taken before the work').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Record repair' }).click();
  await expect(page.getByText('Repair recorded.')).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Intake hose replaced' }).first()).toBeVisible();
  // Taken at the owner's word, and the timeline says so.
  await expect(page.getByText(/does not verify it/i).first()).toBeVisible();
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
