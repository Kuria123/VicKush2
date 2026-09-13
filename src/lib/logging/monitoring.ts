import { logger } from './logger';

/**
 * The seam an error monitoring service plugs into.
 *
 * None is configured here, and the default sink is the structured logger — so
 * nothing is swallowed, which is the property that matters (Rule 3). Adding
 * Sentry or similar later is registering a reporter, not rewriting call sites.
 *
 * Errors are reported with the context needed to act on them and without the
 * data that would make reporting them a privacy problem. The logger already
 * redacts keys that look like secrets; what this adds is a deliberate decision
 * about what a report should carry at all.
 */

export interface ErrorReport {
  /** Where it happened, e.g. "api/ai/explain". */
  scope: string;
  error: unknown;
  /**
   * Identifies the user without naming them.
   *
   * A user id, never an email address. A report that needs to be shared with a
   * third-party monitoring service should not carry an address with it.
   */
  userId?: string | null;
  context?: Record<string, unknown>;
}

export type ErrorReporter = (report: ErrorReport) => void;

const reporters = new Set<ErrorReporter>();

export function registerErrorReporter(reporter: ErrorReporter): () => void {
  reporters.add(reporter);
  return () => reporters.delete(reporter);
}

/**
 * Reports an error, and never throws while doing so.
 *
 * A reporter that fails must not take down the request it was reporting on —
 * that turns a logged problem into an outage, which is the classic way
 * monitoring makes things worse.
 */
export function reportError(report: ErrorReport): void {
  const { scope, error, userId, context } = report;

  logger.error(`${scope} failed`, {
    ...context,
    userId: userId ?? null,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  for (const reporter of reporters) {
    try {
      reporter(report);
    } catch (cause) {
      logger.warn('An error reporter threw', {
        scope,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}

/** For tests, and for a deployment that swaps reporters at boot. */
export function clearErrorReporters(): void {
  reporters.clear();
}
