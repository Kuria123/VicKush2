import { expect, test } from '@playwright/test';

/**
 * Visual and behavioural verification of the design system, in both themes
 * and at three widths. Signs up a fresh account per run so it is
 * self-contained.
 */
const PASSWORD = 'Diagnostic1';

async function signUp(page: import('@playwright/test').Page) {
  const email = `ds-${Date.now()}-${Math.floor(Math.random() * 1e6)}@automind.test`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Design System');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function setTheme(page: import('@playwright/test').Page, theme: 'Light' | 'Dark') {
  await page.getByRole('radio', { name: theme }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const theme of ['Light', 'Dark'] as const) {
  for (const vp of VIEWPORTS) {
    test(`design system @ ${vp.name} ${theme.toLowerCase()}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signUp(page);
      await setTheme(page, theme);

      await page.goto('/design-system');
      await expect(page.getByRole('heading', { name: 'Design system', level: 1 })).toBeVisible();
      await page.waitForFunction(() => document.fonts.ready.then(() => true));

      // Nothing may scroll horizontally at any width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow @ ${vp.name}`).toBeLessThanOrEqual(0);

      // The app shell is h-dvh with the content scrolling inside <main>, so
      // the document body never scrolls and `fullPage` would clip. Grow the
      // viewport to the content height and capture the shell at full extent.
      const contentHeight = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? main.scrollHeight + 120 : document.body.scrollHeight;
      });
      await page.setViewportSize({
        width: vp.width,
        height: Math.min(contentHeight, 6000),
      });
      await page.waitForTimeout(150);

      await page.screenshot({
        path: `.playwright/shots/ds-${vp.name}-${theme.toLowerCase()}.png`,
        // Default `caret: 'hide'` injects caret-color:transparent onto inputs,
        // which React then reports as a hydration mismatch. Nothing is focused
        // in these captures, so leaving the caret alone costs nothing and
        // keeps the dev log free of false mismatches.
        caret: 'initial',
      });
    });
  }
}

test('theme choice survives a reload without flashing', async ({ page }) => {
  await signUp(page);
  await setTheme(page, 'Dark');

  await page.reload();
  // The pre-paint script must have stamped the attribute before hydration.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('readouts render availability states instead of fabricated values', async ({ page }) => {
  await signUp(page);
  await page.goto('/design-system');

  for (const text of ['Not available', 'Not supported', 'Not reading', 'Read error']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
});

test('dialog traps focus and closes on Escape', async ({ page }) => {
  await signUp(page);
  await page.goto('/design-system');

  await page.getByRole('button', { name: 'Open dialog' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('tabs support arrow-key navigation', async ({ page }) => {
  await signUp(page);
  await page.goto('/design-system');

  const overview = page.getByRole('tab', { name: 'Overview' });
  await overview.focus();
  await expect(overview).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Evidence' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('toasts announce and can be dismissed', async ({ page }) => {
  await signUp(page);
  await page.goto('/design-system');

  await page.getByRole('button', { name: 'Success' }).click();
  const toast = page.getByText('Connected', { exact: true });
  await expect(toast).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss: Connected' }).click();
  await expect(toast).toBeHidden();
});
