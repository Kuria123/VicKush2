import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Adding a vehicle from a photograph.
 *
 * No vision model is configured on this machine, so most of what is checked
 * here is the honest-failure path — which is the path that actually ships
 * today, and the one most likely to be left rendering a spinner forever
 * because nobody exercised it.
 *
 * The last test drives a stubbed response instead, because the behaviour that
 * matters most cannot be observed without one: that a proposal lands in the
 * form as an *editable* value rather than being saved.
 */

const PASSWORD = 'Diagnostic1';
const VEHICLE_PROFILE_URL = /\/vehicles\/(?!new$)[a-z0-9]+$/;

/** A 1x1 JPEG. Contents are irrelevant — the request is stubbed. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

async function signUp(page: Page): Promise<void> {
  const email = `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up', { timeout: 60_000 });
  await page.getByLabel('Name').fill('Recognition Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function choosePhoto(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'car.jpg',
    mimeType: 'image/jpeg',
    buffer: TINY_JPEG,
  });
}

test('the form still works by hand, with the photo panel above it', async ({ page }) => {
  await signUp(page);
  await page.goto('/vehicles/new', { timeout: 60_000 });

  // Recognition is an addition, never a gate. Typing must remain the whole
  // path it always was.
  await expect(page.getByRole('heading', { name: 'Add from a photo or video' })).toBeVisible();

  await page.getByLabel('Make').fill('Toyota');
  await page.getByLabel('Model').fill('Harrier');
  await page.getByLabel('Year').fill('2018');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();

  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);
});

test('says the video never leaves the device, because it does not', async ({ page }) => {
  await signUp(page);
  await page.goto('/vehicles/new', { timeout: 60_000 });

  await expect(page.getByText(/the video itself is never uploaded/i)).toBeVisible();
});

test('reports that no vision model is configured, rather than spinning', async ({ page }) => {
  await signUp(page);
  await page.goto('/vehicles/new', { timeout: 60_000 });

  await choosePhoto(page);

  // Rule 3, and the state this build is actually in today. The locator is
  // `p[role="alert"]` because Next mounts its own empty route announcer with
  // that role on every page.
  await expect(page.locator('p[role="alert"]')).toContainText(/no vision model is configured/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/Filling the form in by hand works/i)).toBeVisible();
});

test('a proposal is filled into the form, not saved', async ({ page }) => {
  await signUp(page);

  // Stubbed so the accept path can be exercised without a key. The response
  // shape is the route's own; the interpreter has already run server-side in
  // the real thing, so this mirrors what it would have returned.
  await page.route('**/api/v1/vehicles/recognise', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 'v1',
        model: 'stub',
        result: {
          imagesExamined: 1,
          rejected: [
            { field: 'vin', claimed: 'JTMHV05J8O4', reason: 'Not a structurally valid VIN.' },
          ],
          limitations: ['Nothing here is saved until you confirm it.'],
          proposed: {
            make: {
              established: true,
              value: 'Toyota',
              basis: 'READ_FROM_BADGE',
              confidence: 80,
              observation: 'The grille carries a Toyota emblem.',
            },
            model: {
              established: true,
              value: 'Harrier',
              basis: 'READ_FROM_BADGE',
              confidence: 72,
              observation: 'The tailgate script reads HARRIER.',
            },
            year: {
              established: true,
              value: 2018,
              basis: 'INFERRED_FROM_APPEARANCE',
              confidence: 55,
              observation: 'Lighting cluster matches the later facelift.',
            },
            vin: { established: false, reason: 'No VIN plate was legible in the images.' },
            fuelType: { established: false, reason: 'Not visible from outside the vehicle.' },
            transmissionType: {
              established: false,
              reason: 'Not visible from outside the vehicle.',
            },
            registrationPlate: { established: false, reason: 'No number plate was legible.' },
            bodyColour: { established: false, reason: 'No colour was reported.' },
          },
        },
      }),
    });
  });

  await page.goto('/vehicles/new', { timeout: 60_000 });
  await choosePhoto(page);

  await expect(page.getByRole('button', { name: /use these in the form/i })).toBeVisible({
    timeout: 30_000,
  });

  // A guess and a reading must never render identically.
  await expect(page.getByText('Inferred from the vehicle’s appearance')).toBeVisible();
  await expect(page.getByText('The tailgate script reads HARRIER.')).toBeVisible();

  // A field it could not establish says so, rather than showing blank.
  await expect(page.getByText('No VIN plate was legible in the images.')).toBeVisible();

  // Nothing exists yet: the panel proposes, it does not save.
  await expect(page).toHaveURL(/\/vehicles\/new$/);

  await page.getByRole('button', { name: /use these in the form/i }).click();

  await expect(page.getByLabel('Make')).toHaveValue('Toyota');
  await expect(page.getByLabel('Model')).toHaveValue('Harrier');
  await expect(page.getByLabel('Year')).toHaveValue('2018');

  // And it is editable: the owner corrects the guess before anything is saved.
  await page.getByLabel('Year').fill('2016');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();

  await expect(page).toHaveURL(VEHICLE_PROFILE_URL);
  // The corrected year, not the proposed one. It appears both as the spec and
  // in the identification evidence, so the assertion names which.
  await expect(page.getByText('Year recorded (2016)')).toBeVisible();
});
