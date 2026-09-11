/**
 * `server-only` throws on import outside a React Server Component. Vitest is
 * not Next, so integration tests alias the package to this no-op.
 *
 * This does not weaken the guarantee: Next still enforces `server-only` when
 * it builds the application. The alias exists solely so the test runner can
 * import service modules directly.
 */
export {};
