# AutoMind — project rules

Vehicle diagnostic intelligence platform. Simulation-first; real OBD hardware
comes late (Stage 24+).

## Commands

| Command               | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start the dev server on http://localhost:3000 |
| `npm run build`       | Production build (runs a type check)          |
| `npm run typecheck`   | `tsc --noEmit`                                |
| `npm run lint`        | ESLint                                        |
| `npm test`            | Vitest unit tests                             |
| `npm run test:e2e`    | Playwright (Microsoft Edge channel)           |
| `npm run db:migrate`  | Create + apply a migration                    |
| `npm run db:generate` | Regenerate the Prisma client                  |
| `npm run db:seed`     | Seed a development user                       |
| `npm run verify`      | typecheck + lint + test + build               |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 · Tailwind 4 ·
Prisma 7 (MySQL via `@prisma/adapter-mariadb`) · Auth.js v5 · Zod 4 ·
Vitest 5 · Playwright.

### Pinned for a reason — do not bump casually

- **TypeScript 6.0.3, not 7.x.** `typescript-eslint` does not support the
  TS 7 compiler API. Bumping to 7 breaks `npm run lint` entirely.
- **Prisma 7.10.0, not `latest`.** The `latest` dist-tag currently points at an
  8.0 release candidate.
- **`next-auth@5.0.0-beta.32`.** Auth.js v5 is still formally beta; the `latest`
  tag is the v4 line, which does not suit the App Router.

## Architecture

```
src/app, src/components   UI only — no business logic
src/features              client-side orchestration, forms, hooks
src/services              use-cases; the only layer that touches db + providers
src/domain                pure TypeScript — entities, evidence, scoring
src/lib                   db, auth, validation, logging, utilities
```

`src/domain` must stay pure: no Prisma, no Next, no React, no I/O. An ESLint
rule enforces this. Diagnostic logic lives there so it stays deterministic and
unit-testable in isolation.

## Configuration notes

- Prisma 7 removed `url` from the datasource block. The CLI reads it from
  `prisma.config.ts`; the runtime gets it via a driver adapter in
  `src/lib/db/client.ts`.
- Prisma 7 no longer auto-loads `.env`; `prisma.config.ts` calls
  `process.loadEnvFile('.env.local')`.
- Next 16 renamed the `middleware` convention to `proxy` (`src/proxy.ts`), and
  requires a default or named `proxy` **function** export.
- `typedRoutes` is on, so `NAV_ITEMS` is declared `as const` to keep literal
  href types. A broken internal link fails the build.
- Only Microsoft Edge is installed on the dev machine, so Playwright uses
  `channel: 'msedge'`.

## Non-negotiable rules

1. **Never fabricate data** — VINs, DTCs, sensor readings, specifications,
   diagnostic certainty, repair confirmation. Unbuilt screens render
   `NotImplemented`, never plausible-looking placeholder numbers.
2. **Simulation must be labelled** — any simulated diagnostic session shows
   `SIMULATION MODE`.
3. **Structured data first** — diagnostic intelligence lives in typed models,
   not in AI-generated prose.
4. **AI is not the source of truth** — it reasons over evidence produced by the
   deterministic engine, and never invents missing readings.
5. **Do not hide errors** — investigate and fix, or report. No silent catches.
6. **One phase at a time**, with a phase-gate report and approval before the
   next.

## Definition of done

Implemented · typed · validated · tested · error-handled · responsive ·
accessible · visually reviewed · functionally verified · no fabricated data ·
no regressions.
