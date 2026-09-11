import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '@/generated/prisma';

/**
 * Prisma 7 supplies the connection through a driver adapter rather than a URL
 * in the schema. The MariaDB adapter is Prisma's supported driver for MySQL.
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb(url),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

// Next.js dev mode hot-reloads modules, which would otherwise open a new
// connection pool on every reload and exhaust MySQL's connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
