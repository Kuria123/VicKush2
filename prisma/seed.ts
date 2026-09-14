/**
 * Development seed.
 *
 * Creates a single local administrator account. It creates NO vehicle,
 * diagnostic or sensor data — fabricated automotive data must never enter the
 * database (Rule 4).
 *
 * The account is addressed as `admin@automind.local`, which the sign-in form
 * also accepts as the bare username `admin`. `.local` is reserved and cannot
 * resolve on the public internet, so the address can never reach a real
 * mailbox belonging to somebody else.
 *
 * The password is read from `ADMIN_PASSWORD` in `.env.local`, which is not in
 * git. It is deliberately not a literal in this file: this repository is
 * pushed to GitHub, and a password committed once stays in the history after
 * it is edited out.
 *
 * There is no default. A seed that invented one would create an account whose
 * password is whatever this file happened to say, on every machine that ever
 * ran it (Rule 1 — and Rule 3: the refusal names what is missing).
 *
 * Note that the password is NOT checked against the sign-up policy. That is
 * the point of setting it here — the policy wants ten characters with mixed
 * case, and this path bypasses the check rather than satisfying it.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';

import { PrismaClient } from '../src/generated/prisma/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const ADMIN_EMAIL = 'admin@automind.local';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  if (!ADMIN_PASSWORD) {
    throw new Error(
      'ADMIN_PASSWORD is not set. Add it to .env.local — there is no default, ' +
        'because a seeded password nobody chose is one nobody changes.',
    );
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    // Re-seeding resets the password rather than leaving an old one in place,
    // so running this is a reliable way back in.
    update: { name: ADMIN_USERNAME, passwordHash },
    create: { email: ADMIN_EMAIL, name: ADMIN_USERNAME, passwordHash },
  });

  console.log(`Seeded admin: ${user.email} (sign in as "${ADMIN_USERNAME}")`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
