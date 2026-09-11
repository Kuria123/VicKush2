/**
 * Loads .env.local for integration tests. Vitest does not read it, and
 * Prisma 7 no longer loads .env automatically.
 */
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Fall through to the explicit error below.
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Integration tests need DATABASE_URL. Copy .env.example to .env.local and fill it in.',
  );
}
