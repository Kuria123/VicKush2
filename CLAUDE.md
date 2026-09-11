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
| `npm test`            | Vitest unit tests (no database needed)        |
| `npm run test:int`    | Integration tests against the real database   |
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

## Design system

Component reference: `/design-system` (signed in). It renders every component
in the current theme — use the theme switch in the top bar to check both.

- **Use semantic tokens, never raw ramp values.** `bg-surface-raised`,
  `text-content-muted`, `border-line` — not `bg-graphite-900`. The raw ramps
  exist only to define the semantics in `globals.css`.
- **No inline `style` for colour.** Semantic tokens are declared with
  `@theme inline`, so they compile to real utilities that follow the theme.
- **Text and mark colours are different tokens.** `--status-warn` is text-safe
  (WCAG AA 4.5:1); `--status-warn-mark` is the vivid fill/stroke, which only
  needs the 3:1 graphic threshold. Fills, dots and strokes use `-mark`; text
  never does. Same split for `--telemetry`.
- **Every text pairing is verified, not estimated.** 26 token pairings are
  checked against WCAG AA in both themes. If you change a colour, re-check it.
- **Animation must mean something**: a live stream, work in progress, or a
  fault needing attention. Never decorative. All motion respects
  `prefers-reduced-motion`.
- **`Readout` cannot display a value it does not have.** The unavailable
  states are a separate type in a discriminated union, so a missing reading
  is a compile error rather than a fabricated number (Rule 1).
- Dark mode is a deliberate re-step of the ramps, not an automatic flip.

## Vehicle domain

`src/domain/vehicles` owns the vocabulary and the rules; the Prisma schema
mirrors its enums exactly and the service layer maps them 1:1.

- **NULL means "not known", always.** No descriptive field is ever backfilled
  with a plausible default.
- **VIN: structure is a hard rule, the check digit is only a signal.** The
  check digit is mandatory under FMVSS 565 but is _not_ part of ISO 3779
  worldwide, and Japanese-market vehicles — most of the imported fleet this
  product targets — routinely fail it. A failed check digit lowers confidence
  and is shown to the user; it never rejects the VIN.
- **No WMI-to-manufacturer decoding.** That needs an authoritative table the
  project does not have; guessing one would fabricate vehicle data.
- **Confidence is a transparent sum of evidence**, never a generated number.
  Weights total 100 and every contribution carries the reason it was awarded,
  so a score can always be explained back to the user.
- **The stored identification is a derived snapshot**, recomputed inside the
  same transaction as any fact that feeds it, so it cannot drift. The
  contributions and gaps are deliberately _not_ stored — they are recomputed,
  so they can never go stale.
- **Ownership is enforced in the query**, not checked afterwards, so a caller
  cannot forget it.
- Deletes are soft: diagnostic history will reference vehicles from Stage 15.

## Vehicle data providers

`src/domain/telemetry` defines the `VehicleDataProvider` contract; concrete
providers live in `src/services/obd`. Everything above that line — the
diagnostic engine, services, UI — depends on the interface and never on a
transport.

- **Ask the registry, never construct a provider directly.**
  `src/services/obd/registry.ts` is the only place a transport is chosen.
- **Every new provider must pass `provider-contract.ts` unchanged.** That
  shared suite, not the interface, is what makes providers substitutable. If
  a provider needs the contract relaxed, the contract is probably right and
  the provider is wrong.
- **Declare capabilities truthfully.** `describe()` is how callers learn what
  is possible. A capability that is listed but not implemented makes the UI
  offer an action that cannot work (Stage 25's rule, enforced from the start).
- **Return outcomes, do not throw them.** An unsupported PID, a silent module
  or a timeout are results. Exceptions are for programmer error only.
- **A reading either has a value or has a reason, never both.**
  `SensorReading` is a union, so a missing reading is structurally incapable
  of carrying a number.
- **`isSimulated` is mandatory on every descriptor** — it is what every UI
  surface reads to decide it must show SIMULATION MODE (Rule 2), so a new
  provider cannot quietly omit the disclosure.
- **Fault injection lives on a separate interface**, reachable only through
  `supportsFaultInjection`, so no diagnostic code can depend on being able to
  fabricate a fault.
- The parameter catalogue holds real SAE J1979 PIDs and the ranges the
  encoding permits. Misfire counters are absent on purpose: they are Mode 06,
  not Mode 01. DTC structure is parsed; DTC _meaning_ is not, because there
  is no authoritative fault table yet.

## Vehicle simulator

`src/domain/simulation` is a mean-value physical model of a 2.0 L naturally
aspirated petrol engine with a CVT. It plugs into the Stage 5
`TelemetrySource` seam, so the provider never changed to accommodate it.

- **Faults change physics, never outputs.** A vacuum leak is a fixed-area
  hole; a MAF fault is a scaling error on the sensor. Sensor signatures then
  emerge. Never add a fault that writes a reading directly — that would let a
  diagnostic engine pass tests it should fail.
- **DTCs are raised by conditions, never by scenario name.** A leak, weak
  injectors and a weak pump all set P0171 because all three genuinely run
  lean. Wiring scenario→code would let the diagnostic engine cheat by reading
  the code instead of the evidence.
- **Faults that look alike must stay separable.** MAF fault vs weak injectors
  differ in reported airflow; weak pump vs weak injectors differ in rail
  pressure. `fuelDeliveryScale` and `fuelPressureScale` are separate for
  exactly this reason.
- **It is a model of the configuration, not of Toyota's calibration.** That is
  proprietary and unknowable here. It reproduces the relationships a
  technician reads, not the exact numbers a specific vehicle shows.
- **Deterministic**: seeded PRNG plus fixed 10 ms integration, so the same
  scenario always yields the same telemetry and the same codes regardless of
  sampling cadence.
- Thresholds are tuned against the model and documented on each rule. A
  healthy engine idling from cold must not trip P0128 — check that margin if
  you retune the thermal model.

## Vehicle connection

`src/features/connection` drives the discovery sequence. It runs **client
side**, and deliberately so: Web Bluetooth and WebUSB are browser APIs, so
the real adapters that replace the simulator in Stage 24 live in exactly the
same place. The server never handles raw telemetry — it will persist finished
sessions only, from Stage 15.

- **Each phase performs a real operation** and reports what came back. The
  only pause is the provider's own connect handshake, standing in for an
  adapter initialising. Never pad the sequence to look busy.
- **`isSimulated` is read on mount, not on connect.** The SIMULATION MODE
  banner must appear before the data it discloses, not after.
- **Report what was actually returned.** A VIN the adapter cannot read says
  so; a module that does not answer is counted separately from those that do.
  Never round a partial result up into a clean one.
- Simulator controls render only when the provider declares
  `FAULT_INJECTION`, which only a simulator may do — so they are unreachable
  against a real vehicle.

## Live scan

`src/domain/diagnostics` defines a session; `src/features/live-scan` streams
into it. Persistence is Stage 15 — the session is in-memory for now, and its
shapes are what that stage will store.

- **A sample with no value never becomes a point.** The gap in the series is
  the honest record of a parameter that stopped answering. Never interpolate
  across it and never plot a zero.
- **Every requested parameter is shown with its state**, including the ones
  the vehicle does not support. Absent and unsupported are different facts.
- **Capabilities the product cannot obtain are listed and explained** rather
  than silently omitted — misfire counters need Mode 06, which this build
  does not read.
- **Colour on this screen never implies a diagnosis.** A tone is applied only
  where a value has a defensible normal range; interpretation is Stage 9.
- The session mutates in place and a version counter drives re-render.
  Copying a 900-point buffer across eighteen parameters five times a second
  to satisfy immutability would be a great deal of garbage for no benefit.
- Charts follow the house mark specs: 2 px line, 10% area wash, r=4 end
  marker with a 2 px surface ring, hairline gridlines, crosshair snapping to
  the nearest sample, and a visually hidden table so no value is gated
  behind hover.

## Diagnostic analysis

`src/domain/diagnostics/analysis/` turns a recorded session into evidence and
findings. It stops at findings; naming a failed component is Stage 10.

- **Evidence before conclusions.** Every `Evidence` item carries the operating
  condition it was seen under, the parameters it came from, and the measured
  numbers behind it. A `Finding` carries both supporting and opposing evidence,
  so a weak case reads as a weak case (Rule 8).
- **Condition-aware, always.** `classifyCondition` buckets each sample by what
  the engine was actually doing. A fuel trim at idle and the same trim at 3000
  rpm mean different things, and the analysis never averages across them.
  Without RPM the condition is `UNKNOWN`, not a guess.
- **Absence is reported, not filled in.** Anything the analysis could not judge
  becomes a `limitation` on the result -- e.g. airflow plausibility needs engine
  displacement, and says so when it is unknown rather than assuming one.
- **Only measured samples count.** A reading with no value never becomes a data
  point anywhere in the chain (Rule 1).
- **Named for what it is.** `analyseIdleStability` reports the spread of engine
  speed, and states in its own output that this is not a misfire count -- misfire
  counters are Mode 06, which this build does not read.

The engine is tested against the simulator, never against fixtures: the
evidence it reasons over is produced by coupled physics, as it will be from a
real vehicle. Two simulator gaps were found this way and fixed in the *model*,
not the test -- a missing cooling fan (a healthy engine revved at a standstill
overheated) and a misfire roughness term too small to disturb idle observably.
## Differential diagnosis

`src/domain/differential/` ranks candidate causes over the Stage 9 evidence.
Deterministic, no language model; the score is a transparent sum of weighted
observations, each carrying the reason it was awarded.

- **A cause is a mechanism, never a part.** "Air entering downstream of the
  airflow sensor" is a cause; naming the component that lets it in needs
  physical inspection a scan cannot do (Rule 9). A test asserts no output ever
  says replace/install/fit/buy.
- **Causes match on measurements, never on code meaning.** This build parses
  DTC structure but has no authoritative meaning table, so inferring a
  mechanism from a code would fabricate that meaning (Rule 1). Codes are
  reported as corroboration; they award no points.
- **The engine refuses to choose when the evidence does not separate.** If the
  leaders are within `AMBIGUITY_MARGIN`, or if the leader's *defining*
  observation was never made, the verdict is `AMBIGUOUS` and the output is the
  measurement that would settle it. A cause must not lead on corroboration
  alone -- "nothing else is wrong" is not evidence for it.
- **A ruled-out cause stays in the result**, with the observation that excluded
  it. Exclusion is a finding, not a deletion.
- **An unobtainable observation is asked for, not assumed.** A cause resting on
  a reading the scan never captured produces a step naming that reading.

Tested end to end through the simulator -- scenario, physics, session, Stage 9
analysis, then ranking -- never from fixtures. The pair that matters is
`LEAN_MIXTURE` vs `FUEL_PRESSURE_PROBLEM`: identical in the fuel trims,
separated only by rail pressure, and correctly reported as unseparated when
that reading is withheld.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
