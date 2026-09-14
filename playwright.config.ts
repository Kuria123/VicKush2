import { defineConfig, devices } from '@playwright/test';

// The admin sign-in spec reads ADMIN_PASSWORD, which lives in .env.local
// alongside DATABASE_URL rather than in the repository. Loaded here because
// Playwright does not read env files on its own; a missing file is not an
// error, since only that one spec depends on it and it says so when it skips.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local on this machine. The spec that needs it will skip and say so.
}

// Only Microsoft Edge is installed on this machine, so tests run against the
// installed Edge channel rather than a downloaded Chromium build.
/*
 * The port, once.
 *
 * `reuseExistingServer` attaches to whatever is already listening, and it
 * cannot tell one Next app from another — a different project on 3000 means
 * the whole suite silently runs against the wrong application and fails in
 * ways that look like real bugs. Overriding PORT is the escape hatch for that,
 * without having to stop the other project.
 */
const PORT = process.env.PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  // Password hashing is bcrypt at cost 12 and runs twice per sign-up, on a
  // dev server that also compiles routes on first hit. The default 5s
  // assertion timeout is not enough for the credential flows.
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'edge-desktop',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
