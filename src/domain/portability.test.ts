import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The domain must run anywhere.
 *
 * The brief for mobile is "web, mobile, OBD hardware and cloud AI use the same
 * core domain — do not duplicate business logic". The way that goes wrong is
 * never a deliberate decision to fork the logic. It is one `navigator` call,
 * or one `Intl` assumption, added to a domain module by someone working on the
 * web build, which quietly makes the module unusable on React Native — and by
 * the time anyone notices, the cheapest fix looks like a copy.
 *
 * So the constraint is a test rather than a convention. The ESLint rule
 * already blocks framework *imports*; this covers the things an import rule
 * cannot see: ambient browser globals, Node built-ins, and anything else that
 * ties a pure module to one runtime.
 *
 * What the domain may use is the JavaScript language and ECMA-402. Both exist
 * on Hermes, on Node and in every browser this targets.
 */

const DOMAIN = join('src', 'domain');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out;
}

const FILES = sourceFiles(DOMAIN);

/** Strips comments and string literals, so prose about "the window" is ignored. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('the domain runs on any JavaScript runtime', () => {
  it('has files to check', () => {
    // A guard on the guard: a broken walk would make every test below pass.
    expect(FILES.length).toBeGreaterThan(30);
  });

  it('touches no browser global', () => {
    /*
     * None of these exists on React Native. A domain module reaching for one
     * would work on the web, fail on mobile, and make forking the logic look
     * like the cheap option.
     */
    const browserOnly =
      /\b(window|document|navigator|localStorage|sessionStorage|alert|XMLHttpRequest|WebSocket)\s*[.[(]/;

    const offenders = FILES.filter((file) => browserOnly.test(code(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('touches no Node built-in', () => {
    // The same argument in the other direction: a domain module importing
    // `node:fs` runs on the server and nowhere else.
    const offenders = FILES.filter((file) =>
      /from\s+['"](node:|fs|path|crypto|os|child_process)['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('imports no framework', () => {
    // Enforced by ESLint too. Repeated here so the portability guarantee is
    // stated in one place rather than assembled from two.
    const offenders = FILES.filter((file) =>
      /from\s+['"](react|react-dom|next|next\/|@\/lib\/db)/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('reaches for no database or service layer', () => {
    const offenders = FILES.filter((file) =>
      /from\s+['"]@\/(services|features|app|components)/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('uses no ambient process or environment access', () => {
    // `process.env` is the most common way a pure module acquires a runtime.
    const offenders = FILES.filter((file) => /\bprocess\s*\./.test(code(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('keeps formatting confined to ECMA-402', () => {
    /*
     * `Intl` and `toLocale*` are permitted: both are ECMA-402 and exist on
     * Hermes, Node and every browser this targets. They are listed here rather
     * than banned so that the choice is deliberate and visible — an Android
     * build on a JSC engine without full ICU will format differently, which is
     * a presentation difference rather than a logic one.
     */
     const users = FILES.filter((file) =>
      /\bIntl\.|toLocale[A-Z]/.test(code(readFileSync(file, 'utf8'))),
    );

    // Known and accepted. If this grows, the decision is being made again by
    // accident rather than on purpose.
    expect(users.sort()).toEqual(
      [
        join('src', 'domain', 'cost', 'types.ts'),
        join('src', 'domain', 'health', 'engine.ts'),
        join('src', 'domain', 'prediction', 'engine.ts'),
      ].sort(),
    );
  });
});

/**
 * The second half of the same requirement.
 *
 * A portable domain is worth nothing to a mobile client that cannot reach it.
 * The web app reads through server components, which call the service layer
 * in-process — an option no other client has. So the reads a client needs must
 * exist over HTTP, and they must be adapters over the *same* services rather
 * than a second implementation, which is the duplication the brief names.
 */
describe('a non-web client can reach the same logic over HTTP', () => {
  const ROUTES = join('src', 'app', 'api', 'v1');

  const REQUIRED = [
    join(ROUTES, 'vehicles', 'route.ts'),
    join(ROUTES, 'vehicles', '[id]', 'history', 'route.ts'),
    join(ROUTES, 'vehicles', '[id]', 'health', 'route.ts'),
    join(ROUTES, 'vehicles', '[id]', 'sessions', 'route.ts'),
    join(ROUTES, 'ai', 'explain', 'route.ts'),
    join(ROUTES, 'ai', 'mechanic', 'route.ts'),
  ];

  it.each(REQUIRED)('%s exists', (file) => {
    expect(() => readFileSync(file, 'utf8')).not.toThrow();
  });

  it('guards every route it exposes', () => {
    // A route added without the guard is unauthenticated and unlimited. That
    // is a mistake nobody makes deliberately and everybody makes eventually.
    const routes = sourceFiles(ROUTES).filter((file) => file.endsWith('route.ts'));
    const unguarded = routes.filter((file) => !/\bguard\(/.test(readFileSync(file, 'utf8')));

    expect(routes.length).toBeGreaterThanOrEqual(REQUIRED.length);
    expect(unguarded).toEqual([]);
  });

  it('adapts the service layer instead of reimplementing it', () => {
    /*
     * A read route may import from `@/services` and `@/lib`. Reaching into
     * `@/lib/db` directly would mean the query — and with it the ownership
     * scoping every service performs inside its `where` clause — had been
     * written a second time, for one client.
     */
    const routes = sourceFiles(ROUTES).filter((file) => file.endsWith('route.ts'));
    const offenders = routes.filter((file) =>
      /from\s+['"]@\/lib\/db/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
