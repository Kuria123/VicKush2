import { currentUserId } from '@/lib/auth';
import { reportError } from '@/lib/logging/monitoring';
import {
  checkRateLimit,
  rateLimitHeaders,
  type RateLimitName,
} from '@/lib/rate-limit/limiter';
import { recordAuditAsync, type AuditAction } from '@/services/audit/audit';

/**
 * The checks every API route performs before doing any work.
 *
 * Gathered into one place because they were being repeated by hand, and a
 * check written by hand is one that eventually gets forgotten on the route
 * added next month. A route now opts into authentication and a rate limit by
 * naming them rather than by remembering to write them.
 */

export const API_VERSION = 'v1';

export interface GuardOptions {
  /** The limit to apply, keyed by user. */
  rateLimit: RateLimitName;
  /** Recorded when the request is refused for rate limiting. */
  auditOnLimit?: AuditAction;
}

export type GuardOutcome =
  | { ok: true; userId: string; headers: Record<string, string> }
  | { ok: false; response: Response };

export async function guard(options: GuardOptions): Promise<GuardOutcome> {
  const userId = await currentUserId();

  if (!userId) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Not signed in.', version: API_VERSION },
        { status: 401 },
      ),
    };
  }

  /*
   * Keyed by user, not by IP.
   *
   * What is being protected is an upstream cost incurred per account. An IP
   * key would punish everyone behind one NAT — an office, a campus, most of a
   * mobile network — while doing nothing about the case that matters, which is
   * one signed-in account looping a request.
   */
  const decision = checkRateLimit(options.rateLimit, userId);
  const headers = rateLimitHeaders(decision);

  if (!decision.allowed) {
    if (options.auditOnLimit) {
      recordAuditAsync({
        action: 'RATE_LIMITED',
        userId,
        detail: `Refused ${options.rateLimit}`,
        succeeded: false,
      });
    }

    return {
      ok: false,
      response: Response.json(
        {
          error: `Too many requests. Try again in ${decision.retryAfterSeconds} seconds.`,
          version: API_VERSION,
        },
        { status: 429, headers },
      ),
    };
  }

  return { ok: true, userId, headers };
}

/**
 * Wraps a handler so an unexpected throw becomes a reported 500 rather than an
 * unhandled rejection.
 *
 * Without this, a bug in a route surfaces as a blank response with nothing in
 * the log — the failure mode that costs the most time to diagnose, because
 * there is nothing to diagnose from (Rule 3).
 */
export async function handled(
  scope: string,
  userId: string | null,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    reportError({ scope, error, userId });
    return Response.json(
      { error: 'Something went wrong handling that request.', version: API_VERSION },
      { status: 500 },
    );
  }
}
