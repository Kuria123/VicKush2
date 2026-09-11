import { expect, test } from '@playwright/test';

/**
 * Visual review capture. Not an assertion suite — it renders the public pages
 * at three widths so the layout can be inspected.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'sign-in', path: '/sign-in' },
  { name: 'sign-up', path: '/sign-up' },
  { name: 'not-found', path: '/nope' },
] as const;

for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    test(`${p.name} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(p.path, { waitUntil: 'domcontentloaded' });
      // `networkidle` never settles in dev because the HMR websocket stays
      // open, so wait on rendered content instead.
      await expect(page.locator('body')).toBeVisible();
      await page.waitForFunction(() => document.fonts.ready.then(() => true));

      // No page may scroll horizontally at any width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${p.name} @ ${vp.name}`).toBeLessThanOrEqual(0);

      await page.screenshot({
        path: `.playwright/shots/${p.name}-${vp.name}.png`,
        fullPage: true,
      });
    });
  }
}
