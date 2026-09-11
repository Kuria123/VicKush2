import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads .env automatically.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // .env.local is optional in environments that inject real env vars.
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
