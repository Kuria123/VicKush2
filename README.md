# AutoMind

Vehicle diagnostic intelligence platform.

> **Status: Phase 1 — foundation.** Authentication and the application shell
> work. No diagnostic, telemetry or vehicle-management functionality exists
> yet; those routes render an explicit "not implemented" page rather than
> placeholder data.

## Requirements

- Node.js 20.9+ (developed on 24.20.0)
- MySQL 8+
- Git
- Microsoft Edge, Chrome or Firefox for end-to-end tests

## Setup

```bash
npm install

# 1. Configure the environment
cp .env.example .env.local
#    Then edit .env.local and set DATABASE_URL to a real MySQL connection.
#    Generate AUTH_SECRET with: npx auth secret

# 2. Create the database (once)
#    mysql -u root -p -e "CREATE DATABASE automind CHARACTER SET utf8mb4;"

# 3. Apply the schema
npm run db:migrate

# 4. Optional: create a development login
npm run db:seed

# 5. Run
npm run dev
```

Open http://localhost:3000.

## Verifying

```bash
npm run verify     # typecheck + lint + unit tests + build
npm run test:e2e   # Playwright, needs a working DATABASE_URL
```

## Layout

```
prisma/            schema, migrations, seed
src/app/           routes (App Router)
src/components/    presentational components
src/features/      client orchestration, forms, server actions
src/services/      use-cases; the only layer touching the database
src/domain/        pure domain logic (no I/O, no framework)
src/lib/           db, auth, validation, logging, utilities
tests/e2e/         Playwright specs
```

See `CLAUDE.md` for project rules, pinned-version rationale and architecture
constraints.
