/**
 * Development seed.
 *
 * Creates a single local development account. It creates NO vehicle,
 * diagnostic or sensor data — fabricated automotive data must never enter the
 * database (Rule 4).
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';

import { PrismaClient } from '../src/generated/prisma/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const DEV_EMAIL = 'dev@automind.local';
const DEV_PASSWORD = 'Diagnostic1';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: {
      email: DEV_EMAIL,
      name: 'Development User',
      passwordHash: await bcrypt.hash(DEV_PASSWORD, 12),
    },
  });

  console.log(`Seeded development user: ${user.email} / ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
