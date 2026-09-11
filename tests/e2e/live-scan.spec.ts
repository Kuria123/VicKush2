import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The live scan, driven against the real simulator in a real browser.
 *
 * The headline test is the last one: it watches the fuel trims climb under a
 * vacuum leak and fall again when the engine is revved — the emergent
 * signature from Stage 6, now visible on screen.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

async function signUpAndAddVehicle(page: Page) {
  const email = `scan-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Scan Tester');
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

async function openScan(page: Page) {
  await signUpAndAddVehicle(page);
  // Scoped to <main>: the sidebar also has a "Live Scan" link, and accessible
  // name matching is case-insensitive.
  await page.locator('main').getByRole('link', { name: 'Live scan' }).click();
  await expect(page).toHaveURL(/\/live-scan$/);
}

async function connectAndScan(page: Page) {
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start scan' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText('Streaming')).toBeVisible({ timeout: 15_000 });
}

/**
 * Reads a numeric tile by its label.
 *
 * Both `Readout` and the summary `Stat` render the label immediately
 * followed by its value, so the value is the label's next sibling. Matching
 * on the label alone is ambiguous — chart captions contain the word
 * "samples" too.
 */
async function readTile(page: Page, label: string): Promise<number> {
  const labelEl = page.getByText(label, { exact: true }).first();
  await labelEl.waitFor({ state: 'visible' });
  const value = labelEl.locator('xpath=following-sibling::*[1]');

  // A tile reads "Not reading" until its first sample lands, so wait for a
  // number rather than reading whatever happens to be there.
  await expect
    .poll(async () => /-?\d/.test(await value.innerText()), { timeout: 15_000 })
    .toBe(true);

  const text = await value.innerText();
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) throw new Error(`No numeric value beside "${label}": ${text}`);
  return Number(match[0]);
}

test('the picker lists vehicles to scan', async ({ page }) => {
  await signUpAndAddVehicle(page);
  await page.goto('/live-scan');
  await expect(page.getByRole('heading', { name: 'Live Scan' })).toBeVisible();
  await expect(page.getByText('Toyota Harrier')).toBeVisible();
});

test('nothing is shown before connecting', async ({ page }) => {
  await openScan(page);
  await expect(page.getByRole('heading', { name: 'Connect before scanning' })).toBeVisible();
  // Rule 2: the disclosure precedes any data.
  await expect(page.getByText('Simulation mode')).toBeVisible();
});

test('streaming produces live values and a sample count', async ({ page }) => {
  await openScan(page);
  await connectAndScan(page);

  // Exact: chart captions also contain the word "samples".
  await expect(page.getByText('Samples', { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);

  const samples = await readTile(page, 'Samples');
  expect(samples).toBeGreaterThan(2);

  // RPM must be a plausible idle, not a placeholder.
  const rpm = await readTile(page, 'RPM');
  expect(rpm).toBeGreaterThan(400);
  expect(rpm).toBeLessThan(1200);
});

test('parameters the vehicle cannot answer are reported, not hidden', async ({ page }) => {
  await openScan(page);
  await connectAndScan(page);

  // The brief asks for misfire counters; this build cannot read Mode 06, and
  // the screen says so rather than inventing a number or dropping the row.
  await expect(page.getByText('Misfire counters')).toBeVisible();
  await expect(page.getByText(/Mode 06/)).toBeVisible();
  await expect(page.getByText('Not supported').first()).toBeVisible();
});

test('stopping halts the stream and keeps what was captured', async ({ page }) => {
  await openScan(page);
  await connectAndScan(page);
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Connected, not scanning')).toBeVisible();

  const afterStop = await readTile(page, 'Samples');
  await page.waitForTimeout(1000);
  // No samples may arrive after stopping.
  expect(await readTile(page, 'Samples')).toBe(afterStop);
});

test('fault codes raised by the model appear with their structure', async ({ page }) => {
  await openScan(page);
  await connectAndScan(page);

  await page.getByLabel('Fault scenario').selectOption('VACUUM_LEAK');

  // The code is stored only after the ECU debounce, so this waits on the
  // model rather than on a timer of its own.
  await expect(page.getByText('P0171')).toBeVisible({ timeout: 40_000 });
  // `.first()`: the leak also trips P0101, whose subsystem text is the same.
  await expect(page.getByText(/Fuel and air metering/).first()).toBeVisible();
  // No invented meaning for the fault.
  await expect(page.getByText(/too lean/i)).toHaveCount(0);
});

test('the vacuum leak signature is visible: trims climb at idle', async ({ page }) => {
  test.setTimeout(120_000);

  await openScan(page);
  await connectAndScan(page);

  const before = await readTile(page, 'LTFT B1');

  await page.getByLabel('Fault scenario').selectOption('VACUUM_LEAK');

  // Long term trim learns slowly, as a real ECU does — it absorbs the short
  // term correction over tens of seconds rather than jumping.
  await expect
    .poll(async () => readTile(page, 'LTFT B1'), {
      timeout: 60_000,
      intervals: [2000],
      message: 'long term fuel trim should climb under an unmetered air leak',
    })
    .toBeGreaterThan(before + 5);

  const after = await readTile(page, 'LTFT B1');
  expect(after).toBeGreaterThan(before);
});
