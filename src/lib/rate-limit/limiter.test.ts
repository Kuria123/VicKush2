import { beforeEach, describe, expect, it } from 'vitest';

import { checkRateLimit, rateLimitHeaders, resetRateLimits } from './limiter';

/**
 * Rate limiting.
 *
 * Time is passed in rather than mocked, so the refill arithmetic is tested
 * directly instead of through a fake clock — the behaviour that matters is a
 * function of elapsed milliseconds, and stating them makes the test read like
 * the rule it checks.
 */

const T0 = 1_700_000_000_000;

beforeEach(() => {
  resetRateLimits();
});

describe('the bucket', () => {
  it('allows a burst up to capacity', () => {
    // ai-explain allows 5.
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit('ai-explain', 'user-1', T0).allowed, `request ${i + 1}`).toBe(true);
    }
  });

  it('refuses once the burst is spent', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('ai-explain', 'user-1', T0);

    const refused = checkRateLimit('ai-explain', 'user-1', T0);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
  });

  it('says how long to wait, so a client can back off correctly', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('ai-explain', 'user-1', T0);

    // Without this a client has no way to back off and will retry
    // immediately, which is the behaviour the limit exists to prevent.
    const refused = checkRateLimit('ai-explain', 'user-1', T0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimitHeaders(refused)['Retry-After']).toBe(String(refused.retryAfterSeconds));
  });

  it('refills continuously rather than in a window', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('ai-explain', 'user-1', T0);
    expect(checkRateLimit('ai-explain', 'user-1', T0).allowed).toBe(false);

    // 10/minute means one token every six seconds. A fixed window would allow
    // nothing until the window rolled, then the full allowance at once.
    expect(checkRateLimit('ai-explain', 'user-1', T0 + 6_000).allowed).toBe(true);
    expect(checkRateLimit('ai-explain', 'user-1', T0 + 6_000).allowed).toBe(false);
  });

  it('never refills beyond capacity however long it waits', () => {
    // An hour of idleness must not bank an hour of requests.
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit('ai-explain', 'user-1', T0 + 3_600_000).allowed).toBe(true);
    }
    expect(checkRateLimit('ai-explain', 'user-1', T0 + 3_600_000).allowed).toBe(false);
  });

  it('keeps one user from spending another user’s allowance', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('ai-explain', 'user-1', T0);

    expect(checkRateLimit('ai-explain', 'user-1', T0).allowed).toBe(false);
    expect(checkRateLimit('ai-explain', 'user-2', T0).allowed).toBe(true);
  });

  it('keeps the limits on different routes separate', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('ai-explain', 'user-1', T0);

    expect(checkRateLimit('ai-explain', 'user-1', T0).allowed).toBe(false);
    expect(checkRateLimit('ai-mechanic', 'user-1', T0).allowed).toBe(true);
  });

  it('reports the remaining allowance', () => {
    expect(checkRateLimit('ai-explain', 'user-1', T0).remaining).toBe(4);
    expect(checkRateLimit('ai-explain', 'user-1', T0).remaining).toBe(3);
  });

  it('does not go backwards when the clock does', () => {
    // Clocks move backwards: NTP corrections, virtual machines resuming. A
    // negative elapsed time must not credit tokens or produce NaN.
    checkRateLimit('ai-explain', 'user-1', T0);
    const decision = checkRateLimit('ai-explain', 'user-1', T0 - 60_000);

    expect(decision.allowed).toBe(true);
    expect(Number.isFinite(decision.remaining)).toBe(true);
    expect(decision.remaining).toBeLessThanOrEqual(4);
  });
});
