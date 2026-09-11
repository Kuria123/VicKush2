/**
 * Cross-cutting application types.
 *
 * Domain-specific types belong in src/domain/<area>, not here.
 */

/** Result of an operation that can fail in an expected, presentable way. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
